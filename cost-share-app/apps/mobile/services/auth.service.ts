import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { clearGroupFeedHydration } from '../lib/groupFeedCache';
import { queryClient } from '../lib/queryClient';
import { clearStaleAuthSession } from '../lib/authSessionLifecycle';
import { isAuthSessionAllowed } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store';

WebBrowser.maybeCompleteAuthSession();

export type AuthErrorCode = 'account_deleted' | 'generic';

export interface AuthError {
  code: AuthErrorCode;
  message: string;
}

function toAuthError(err: unknown): AuthError {
  const message = err instanceof Error ? err.message
    : (typeof err === 'object' && err !== null && 'message' in err) ? String((err as { message: unknown }).message)
    : String(err ?? 'Unknown error');
  const lower = message.toLowerCase();
  if (
    lower.includes('email_was_deleted')
    || lower.includes('user is banned')
    || lower.includes('banned_until')
    || lower.includes('account has been deleted')
  ) {
    return { code: 'account_deleted', message };
  }
  return { code: 'generic', message };
}

const NATIVE_SCHEME = 'com.kupa.mobile';
const AUTH_CALLBACK_PATH = 'auth/callback';

/**
 * Expo Go on a physical device often resolves Metro as `localhost`, which is unreachable
 * from the phone. Prefer the LAN host from Expo config, and never use localhost on native.
 */
function resolveNativeOAuthRedirectUri(): string {
  const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

  let uri = makeRedirectUri({
    scheme: isExpoGo ? undefined : NATIVE_SCHEME,
    path: AUTH_CALLBACK_PATH,
    preferLocalhost: false,
  });

  const hostUri = Constants.expoConfig?.hostUri;
  if (uri.includes('localhost') && hostUri && !hostUri.includes('localhost')) {
    uri = uri.replace(/localhost(?=:\d+)?/, hostUri.split(':')[0]);
  }

  if (uri.includes('localhost')) {
    uri = `${NATIVE_SCHEME}://${AUTH_CALLBACK_PATH}`;
  }

  return uri;
}

function resolveWebOAuthRedirectUri(): string {
  const origin = globalThis.location?.origin;
  if (origin && !origin.includes('localhost') && !origin.includes('127.0.0.1')) {
    return `${origin}/${AUTH_CALLBACK_PATH}`;
  }

  const configured = process.env.EXPO_PUBLIC_WEB_APP_URL?.replace(/\/$/, '');
  if (configured) {
    return `${configured}/${AUTH_CALLBACK_PATH}`;
  }

  if (origin) {
    return `${origin}/${AUTH_CALLBACK_PATH}`;
  }

  return `https://kupa.pro/${AUTH_CALLBACK_PATH}`;
}

/**
 * Caches the result of each PKCE code-exchange for the lifetime of the app
 * session (until signOut clears it). The native deep-link layer can deliver the
 * same OAuth callback URL twice — once via WebBrowser's success result and once
 * via Linking.getInitialURL on a cold start. The first call consumes the PKCE
 * code verifier; a second exchange would throw "PKCE code verifier not found".
 * Returning the cached promise instead makes the dup a no-op.
 */
const exchangeByCode = new Map<string, Promise<{ error: AuthError | null }>>();

export async function handleAuthRedirectUrl(url: string): Promise<{ error: AuthError | null }> {
  const { params, errorCode } = QueryParams.getQueryParams(url);

  if (errorCode) {
    return { error: toAuthError(errorCode) };
  }

  const { code, access_token, refresh_token } = params;

  if (code) {
    const existing = exchangeByCode.get(code);
    if (existing) return existing;

    const exchange = (async () => {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return { error: toAuthError(error) };

      const allowed = await isAuthSessionAllowed();
      if (!allowed) {
        return { error: { code: 'account_deleted', message: 'account deleted' } satisfies AuthError };
      }

      return { error: null };
    })();

    exchangeByCode.set(code, exchange);
    return exchange;
  }

  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) return { error: toAuthError(error) };

    const allowed = await isAuthSessionAllowed();
    if (!allowed) {
      return { error: { code: 'account_deleted', message: 'account deleted' } satisfies AuthError };
    }

    return { error: null };
  }

  return { error: toAuthError(`No auth params in redirect URL: ${url}`) };
}

export function getAuthRedirectUri(): string {
  return Platform.OS === 'web'
    ? resolveWebOAuthRedirectUri()
    : resolveNativeOAuthRedirectUri();
}

export function isAuthCallbackUrl(url: string): boolean {
  if (!url.includes(AUTH_CALLBACK_PATH)) return false;
  const { params } = QueryParams.getQueryParams(url);
  return Boolean(params.code || params.access_token || params.error || params.error_description);
}

const googleOAuthOptions = (oauthRedirect: string) => ({
  redirectTo: oauthRedirect,
  queryParams: { prompt: 'select_account' },
});

export async function signInWithGoogle(): Promise<{ error: AuthError | null }> {
  const oauthRedirect = getAuthRedirectUri();

  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: googleOAuthOptions(oauthRedirect),
    });
    return { error: error ? toAuthError(error) : null };
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      ...googleOAuthOptions(oauthRedirect),
      skipBrowserRedirect: true,
    },
  });

  if (error || !data.url) {
    return { error: toAuthError(error ?? new Error('No OAuth URL returned')) };
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, oauthRedirect, {
    preferEphemeralSession: true,
  });

  if (result.type === 'cancel' || result.type === 'dismiss') {
    return { error: toAuthError('Sign-in was cancelled') };
  }

  if (result.type !== 'success') {
    return { error: toAuthError(`Unexpected browser result: ${result.type}`) };
  }

  return handleAuthRedirectUrl(result.url);
}

/** Clears cached app state, wipes the local Supabase session, and drops the Zustand session. */
export async function clearLocalAuthSession(): Promise<void> {
  clearGroupFeedHydration();
  exchangeByCode.clear();
  queryClient.clear();
  await clearStaleAuthSession();
  useAppStore.getState().setSession(null);
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'global' });
  if (error) {
    console.warn('signOut: global revoke failed, clearing local session', error);
  }
  await clearLocalAuthSession();
}
