import React, { useCallback, useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppState, type AppStateStatus, LogBox, View, ActivityIndicator, Platform } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import Toast from 'react-native-toast-message';
import { handleAuthRedirectUrl, isAuthCallbackUrl } from './services/auth.service';
import { AppNavigator } from './navigation/AppNavigator';
import { LoginScreen } from './screens/auth/LoginScreen';
import { initializeLanguage } from './i18n';
import {
  clearStaleAuthSession,
  hydrateAuthSession,
  isInvalidRefreshTokenError,
  setupSupabaseAuthAutoRefresh,
} from './lib/authSessionLifecycle';
import { supabase } from './lib/supabase';
import { assertProfileActiveWithTimeout, isAuthSessionAllowed } from './lib/auth';
import { signalDeactivatedAccount } from './lib/signalDeactivatedAccount';
import { hydrateCurrentUserProfile } from './services/users.service';
import { queryClient } from './lib/queryClient';
import { useAppStore } from './store';
import { colors } from './theme';
import { RtlLayoutProvider } from './hooks/useRtlLayout';
import type { Session } from '@supabase/supabase-js';
import './i18n';
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
        {children}
      </View>
    </View>
  );
}

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const { session, setSession } = useAppStore();
  const setPendingDeactivationNotice = useAppStore((s) => s.setPendingDeactivationNotice);
  const incomingUrl = Linking.useURL();

  const rejectDeactivatedSession = useCallback(async () => {
    void signalDeactivatedAccount(setPendingDeactivationNotice);
    await clearStaleAuthSession();
    setSession(null);
  }, [setPendingDeactivationNotice, setSession]);

  const acceptSessionIfAllowed = useCallback(async (nextSession: Session | null) => {
    if (!nextSession) {
      setSession(null);
      return;
    }

    const allowed = await isAuthSessionAllowed();
    if (!allowed) {
      await rejectDeactivatedSession();
      return;
    }

    const hydrated = await hydrateCurrentUserProfile(nextSession.user.id);
    if (!hydrated) {
      await rejectDeactivatedSession();
      return;
    }

    setSession(nextSession);
  }, [rejectDeactivatedSession, setSession]);

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

    const init = async () => {
      try {
        await initializeLanguage();

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
          await acceptSessionIfAllowed(hydratedSession);
        } else {
          setSession(null);
        }

        setupSupabaseAuthAutoRefresh();
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!nextSession) {
        setSession(null);
        return;
      }

      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        setTimeout(() => {
          void acceptSessionIfAllowed(nextSession);
        }, 0);
        return;
      }

      setSession(nextSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
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
    return (
      <SafeAreaProvider>
        <RtlLayoutProvider>
          <WebFrame>
            <LoginScreen />
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
            <NavigationContainer>
              <AppNavigator />
            </NavigationContainer>
          </WebFrame>
          <Toast />
        </RtlLayoutProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
