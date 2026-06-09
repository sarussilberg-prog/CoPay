import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { queryClient } from '../lib/queryClient';
import { clearStaleAuthSession } from '../lib/authSessionLifecycle';
import { clearNavigationState } from '../lib/navigationPersistence';
import { isAuthSessionAllowed } from '../lib/auth';
import { openOAuthSession } from '../lib/openOAuthSession';
import { signOutNativeGoogle } from '../lib/googleSignInNative';
import { APP_WEB_ORIGIN } from '@cost-share/shared';
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

const NATIVE_SCHEME = 'com.kupay.mobile';
const AUTH_CALLBACK_PATH = 'auth/callback';

/**
 * Expo Go on a physical device often resolves Metro as `localhost`, which is unreachable
 * from the phone. Prefer the LAN host from Expo config, and never use localhost on native.
 */
function resolveNativeOAuthRedirectUri(): string {
  const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  const nativeRedirect = `${NATIVE_SCHEME}://${AUTH_CALLBACK_PATH}`;

  // Dev/production builds must use the custom scheme — not exp:// or https://.
  // Android intent filters are registered for NATIVE_SCHEME in app.json / AndroidManifest.
  if (!isExpoGo) {
    return nativeRedirect;
  }

  let uri = makeRedirectUri({
    path: AUTH_CALLBACK_PATH,
    preferLocalhost: false,
  });

  const hostUri = Constants.expoConfig?.hostUri;
  if (uri.includes('localhost') && hostUri && !hostUri.includes('localhost')) {
    uri = uri.replace(/localhost(?=:\d+)?/, hostUri.split(':')[0]);
  }

  if (uri.includes('localhost')) {
    return nativeRedirect;
  }

  return uri;
}

function resolveWebOAuthRedirectUri(): string {
  const origin = globalThis.location?.origin;
  // Always follow the tab the user is on (including localhost). EXPO_PUBLIC_WEB_APP_URL
  // is for native/SSR fallbacks only — using it on local web sent OAuth to kupa.pro/dev.
  if (origin) {
    return `${origin}/${AUTH_CALLBACK_PATH}`;
  }

  const configured = process.env.EXPO_PUBLIC_WEB_APP_URL?.replace(/\/$/, '');
  if (configured) {
    return `${configured}/${AUTH_CALLBACK_PATH}`;
  }

  return `${APP_WEB_ORIGIN}/${AUTH_CALLBACK_PATH}`;
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

/** True when URL carries OAuth redirect params (path or Supabase site-url fallback at `/`). */
export function hasAuthCallbackParams(url: string): boolean {
  const { params } = QueryParams.getQueryParams(url);
  return Boolean(params.code || params.access_token || params.error || params.error_description);
}

export function isAuthCallbackUrl(url: string): boolean {
  return hasAuthCallbackParams(url);
}

const googleOAuthOptions = (oauthRedirect: string) => ({
  redirectTo: oauthRedirect,
  queryParams: { prompt: 'select_account' },
});

async function signInWithGoogleBrowser(): Promise<{ error: AuthError | null }> {
  const oauthRedirect = getAuthRedirectUri();

  if (__DEV__) {
    console.info('[Auth] OAuth redirectTo =', oauthRedirect);
  }

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

  const result = await openOAuthSession(data.url, oauthRedirect);

  return resolveOAuthBrowserResult(result, oauthRedirect);
}

type OAuthBrowserResult =
  | { type: 'success'; url: string }
  | { type: 'cancel' | 'dismiss' | 'opened' | 'locked' };

function resolveOAuthBrowserResult(
  result: OAuthBrowserResult,
  oauthRedirect: string,
): Promise<{ error: AuthError | null }> {
  if (result.type === 'cancel' || result.type === 'dismiss') {
    return Promise.resolve({ error: toAuthError('Sign-in was cancelled') });
  }

  if (result.type !== 'success') {
    return Promise.resolve({ error: toAuthError(`Unexpected browser result: ${result.type}`) });
  }

  // Supabase rejects unknown redirect_to values and falls back to Site URL (production web).
  if (result.url.startsWith('http://') || result.url.startsWith('https://')) {
    return Promise.resolve({
      error: toAuthError(
        `OAuth returned to the web app (${result.url.split('?')[0]}). `
        + `Add ${oauthRedirect} to Supabase → Authentication → URL Configuration → Redirect URLs.`,
      ),
    });
  }

  return handleAuthRedirectUrl(result.url);
}

export async function signInWithGoogle(): Promise<{ error: AuthError | null }> {
  if (Platform.OS === 'android' && __DEV__) {
    console.info('[Auth] Google OAuth in partial Chrome bottom sheet (~80%)');
  }

  return signInWithGoogleBrowser();
}

function isAppleCancel(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err
    && (err as { code?: string }).code === 'ERR_REQUEST_CANCELED';
}

export async function signInWithApple(): Promise<{ error: AuthError | null }> {
  try {
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce,
    );
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    if (!credential.identityToken) {
      return { error: toAuthError(new Error('No Apple identity token returned')) };
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: rawNonce,
    });
    if (error) return { error: toAuthError(error) };

    const allowed = await isAuthSessionAllowed();
    if (!allowed) {
      return { error: { code: 'account_deleted', message: 'account deleted' } satisfies AuthError };
    }

    // Apple returns fullName only on the FIRST authorization; persist it so the profile
    // shows a real name instead of the email the DB trigger defaults to.
    const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
      .filter(Boolean)
      .join(' ')
      .trim();
    const userId = data.user?.id;
    if (fullName && userId) {
      try {
        await supabase.from('profiles').update({ name: fullName }).eq('id', userId);
      } catch {
        // best-effort; never block sign-in on a name update
      }
    }

    return { error: null };
  } catch (err) {
    if (isAppleCancel(err)) return { error: null };
    return { error: toAuthError(err) };
  }
}

/** Clears cached app state, wipes the local Supabase session, and drops the Zustand session. */
export async function clearLocalAuthSession(): Promise<void> {
  exchangeByCode.clear();
  queryClient.clear();
  await clearNavigationState();
  await clearStaleAuthSession();
  useAppStore.getState().setSession(null);
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'global' });
  if (error) {
    console.warn('signOut: global revoke failed, clearing local session', error);
  }
  await signOutNativeGoogle();
  await clearLocalAuthSession();
}
