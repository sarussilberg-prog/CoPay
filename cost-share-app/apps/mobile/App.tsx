import React, { useCallback, useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppState, type AppStateStatus, LogBox, View, ActivityIndicator, Platform } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import Toast from 'react-native-toast-message';
import { handleAuthRedirectUrl, isAuthCallbackUrl } from './services/auth.service';
import { AuthenticatedAppGate } from './components/AuthenticatedAppGate';
import { LoginScreen } from './screens/auth/LoginScreen';
import { OnboardingPreAuthFlow } from './screens/onboarding/OnboardingPreAuthFlow';
import { hasCompletedPreLoginOnboarding } from './lib/onboardingStorage';
import { initializeLanguage } from './i18n';
import {
  clearStaleAuthSession,
  hydrateAuthSession,
  isInvalidRefreshTokenError,
  setupSupabaseAuthAutoRefresh,
} from './lib/authSessionLifecycle';
import { configureNativeGoogleSignIn } from './lib/googleSignInNative';
import { supabase } from './lib/supabase';
import { assertProfileActiveWithTimeout } from './lib/auth';
import { signalDeactivatedAccount } from './lib/signalDeactivatedAccount';
import { acceptSessionIfAllowed as acceptSessionIfAllowedImpl } from './lib/acceptSessionIfAllowed';
import { queryClient } from './lib/queryClient';
import { useAppStore } from './store';
import { useAppRealtime } from './hooks/useAppRealtime';
import { colors } from './theme';
import { RtlLayoutProvider } from './hooks/useRtlLayout';
import { WebAlertHost } from './components/WebAlertHost';
import { GoogleSignInSheetHost } from './components/auth/GoogleSignInSheetHost';
import type { Session } from '@supabase/supabase-js';
import './global.css';

// Benign when a persisted session was revoked server-side (global sign-out, token rotation, etc.).
LogBox.ignoreLogs([/Invalid Refresh Token/i, /Refresh Token Not Found/i]);

// On web, frame the app in a phone-shaped column so mobile screens don't stretch across the browser.
function WebFrame({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== 'web') return <>{children}</>;
  return (
    <View style={{ flex: 1, alignItems: 'center', backgroundColor: '#0f172a' }}>
      <View
        style={{
          flex: 1,
          width: '100%',
          maxWidth: 430,
          backgroundColor: '#ffffff',
          overflow: 'hidden',
          boxShadow: '0 0 24px rgba(0,0,0,0.25)',
        }}
      >
        <WebAlertHost />
        {children}
      </View>
    </View>
  );
}

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [preOnboardingDone, setPreOnboardingDone] = useState<boolean | null>(null);
  const { session, setSession } = useAppStore();
  const currentUserId = useAppStore((s) => s.currentUser?.id ?? null);
  useAppRealtime(currentUserId);
  const setPendingDeactivationNotice = useAppStore((s) => s.setPendingDeactivationNotice);
  const incomingUrl = Linking.useURL();

  const rejectDeactivatedSession = useCallback(async () => {
    void signalDeactivatedAccount(setPendingDeactivationNotice);
    await clearStaleAuthSession();
    setSession(null);
  }, [setPendingDeactivationNotice, setSession]);

  const acceptSessionIfAllowed = useCallback(
    (nextSession: Session | null, mode: 'fresh' | 'hydration') =>
      acceptSessionIfAllowedImpl(nextSession, mode, {
        setSession,
        setPendingDeactivationNotice,
      }),
    [setSession, setPendingDeactivationNotice],
  );

  const processOAuthCallbackUrl = useCallback(async (url: string) => {
    const { error } = await handleAuthRedirectUrl(url);
    if (error?.code === 'account_deleted') {
      await rejectDeactivatedSession();
    }
    return error;
  }, [rejectDeactivatedSession]);

  // Web: OAuth returns in the same browser tab via useURL.
  useEffect(() => {
    if (Platform.OS !== 'web' || !incomingUrl || !isAuthCallbackUrl(incomingUrl)) return;
    void processOAuthCallbackUrl(incomingUrl);
  }, [incomingUrl, processOAuthCallbackUrl]);

  // Native: cold-start deep links only (in-app OAuth is handled in signInWithGoogle).
  useEffect(() => {
    if (Platform.OS === 'web' || session) return;

    let cancelled = false;
    void Linking.getInitialURL().then((url) => {
      if (cancelled || !url || !isAuthCallbackUrl(url)) return;
      void processOAuthCallbackUrl(url);
    });

    return () => {
      cancelled = true;
    };
  }, [session, processOAuthCallbackUrl]);

  const guardSession = useCallback(async () => {
    const status = await assertProfileActiveWithTimeout();
    if (status === 'deactivated') {
      await rejectDeactivatedSession();
    }
  }, [rejectDeactivatedSession]);

  useEffect(() => {
    let mounted = true;
    let authSubscription: { unsubscribe: () => void } | null = null;

    const init = async () => {
      try {
        configureNativeGoogleSignIn();
        await initializeLanguage();
        const preDone = await hasCompletedPreLoginOnboarding();
        if (mounted) setPreOnboardingDone(preDone);

        if (Platform.OS === 'web' && typeof globalThis.location !== 'undefined') {
          const callbackUrl = globalThis.location.href;
          if (isAuthCallbackUrl(callbackUrl)) {
            await processOAuthCallbackUrl(callbackUrl);
            globalThis.history.replaceState({}, '', '/');
          }
        }

        const hydratedSession = await hydrateAuthSession();
        if (!mounted) return;

        if (hydratedSession) {
          await acceptSessionIfAllowed(hydratedSession, 'hydration');
        } else {
          setSession(null);
        }

        setupSupabaseAuthAutoRefresh();

        // Register after hydrateAuthSession so we are the only boot-time listener and
        // do not clear the store on a premature null before AsyncStorage is read.
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
          if (!nextSession) {
            setSession(null);
            return;
          }

          if (event === 'SIGNED_IN') {
            setTimeout(() => {
              void acceptSessionIfAllowed(nextSession, 'fresh');
            }, 0);
            return;
          }

          setSession(nextSession);
        });
        authSubscription = subscription;
      } catch (e) {
        if (isInvalidRefreshTokenError(e)) {
          await clearStaleAuthSession();
          if (mounted) setSession(null);
        } else {
          console.error('Init error:', e);
        }
        setupSupabaseAuthAutoRefresh();
      } finally {
        if (mounted) setIsReady(true);
      }
    };

    void init();

    return () => {
      mounted = false;
      authSubscription?.unsubscribe();
    };
  }, [acceptSessionIfAllowed, processOAuthCallbackUrl, setSession]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        void guardSession();
      }
    });
    return () => sub.remove();
  }, [guardSession]);

  if (!isReady) {
    return (
      <SafeAreaProvider>
        <RtlLayoutProvider>
          <GoogleSignInSheetHost />
          <WebFrame>
            <View className="flex-1 justify-center items-center bg-white">
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          </WebFrame>
        </RtlLayoutProvider>
      </SafeAreaProvider>
    );
  }

  if (!session) {
    const showPreOnboarding = preOnboardingDone === false;

    return (
      <SafeAreaProvider>
        <RtlLayoutProvider>
          <GoogleSignInSheetHost />
          <WebFrame>
            {preOnboardingDone === null ? (
              <View className="flex-1 justify-center items-center bg-white">
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : showPreOnboarding ? (
              <OnboardingPreAuthFlow onFinished={() => setPreOnboardingDone(true)} />
            ) : (
              <LoginScreen />
            )}
          </WebFrame>
          <Toast />
        </RtlLayoutProvider>
      </SafeAreaProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <RtlLayoutProvider>
          <WebFrame>
            <AuthenticatedAppGate />
          </WebFrame>
          <Toast />
        </RtlLayoutProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
