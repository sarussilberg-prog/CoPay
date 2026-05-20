import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { clearGroupFeedHydration } from '../lib/groupFeedCache';
import { supabase } from '../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

/**
 * Expo Go on iOS simulator often resolves Metro as `localhost`, which points at the
 * simulator itself — not the Mac running Metro. Use the LAN host from Expo config instead.
 */
function resolveOAuthRedirectUri(): string {
  const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

  let uri = isExpoGo
    ? Linking.createURL('auth/callback')
    : Linking.createURL('auth/callback', { scheme: 'com.kupa.mobile' });

  const hostUri = Constants.expoConfig?.hostUri;
  if (uri.includes('localhost') && hostUri && !hostUri.includes('localhost')) {
    uri = uri.replace(/localhost(?=:\d+)?/, hostUri.split(':')[0]);
  }

  return uri;
}

const redirectTo = resolveOAuthRedirectUri();

console.log('[Auth] redirectTo =', redirectTo);

/** Prevents double exchange when WebBrowser and Linking both deliver the same callback URL. */
const exchangeByCode = new Map<string, Promise<{ error: Error | null }>>();

export async function handleAuthRedirectUrl(url: string): Promise<{ error: Error | null }> {
  const { params, errorCode } = QueryParams.getQueryParams(url);

  if (errorCode) {
    return { error: new Error(errorCode) };
  }

  const { code, access_token, refresh_token } = params;

  if (code) {
    const existing = exchangeByCode.get(code);
    if (existing) return existing;

    const exchange = (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) return { error: null };

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      return { error };
    })();

    exchangeByCode.set(code, exchange);
    try {
      return await exchange;
    } finally {
      exchangeByCode.delete(code);
    }
  }

  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    return { error };
  }

  return { error: new Error(`No auth params in redirect URL: ${url}`) };
}

export function getAuthRedirectUri(): string {
  if (Platform.OS === 'web' && typeof globalThis.location?.origin === 'string') {
    return `${globalThis.location.origin}/auth/callback`;
  }
  return redirectTo;
}

export function isAuthCallbackUrl(url: string): boolean {
  if (!url.includes('auth/callback')) return false;
  const { params } = QueryParams.getQueryParams(url);
  return Boolean(params.code || params.access_token || params.error || params.error_description);
}

export async function signInWithGoogle(): Promise<{ error: Error | null }> {
  const oauthRedirect = getAuthRedirectUri();

  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: oauthRedirect },
    });
    return { error };
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: oauthRedirect,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data.url) {
    return { error: error ?? new Error('No OAuth URL returned') };
  }

  console.log('[Auth] OAuth URL redirect_to =', oauthRedirect);

  const result = await WebBrowser.openAuthSessionAsync(data.url, oauthRedirect, {
    preferEphemeralSession: false,
  });

  if (result.type === 'cancel' || result.type === 'dismiss') {
    return { error: new Error('Sign-in was cancelled') };
  }

  if (result.type !== 'success') {
    return { error: new Error(`Unexpected browser result: ${result.type}`) };
  }

  return handleAuthRedirectUrl(result.url);
}

export async function signOut(): Promise<void> {
  clearGroupFeedHydration();
  await supabase.auth.signOut();
}
