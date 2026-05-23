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
import { assertProfileActive } from './lib/auth';
import { hydrateCurrentUserProfile } from './services/users.service';
import { queryClient } from './lib/queryClient';
import { useAppStore } from './store';
import { colors } from './theme';
import { RtlLayoutProvider } from './hooks/useRtlLayout';
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

  // Web: OAuth returns in the same browser tab via useURL (ignored on native — see below).
  useEffect(() => {
    if (Platform.OS !== 'web' || !incomingUrl || session || !isAuthCallbackUrl(incomingUrl)) return;
    void handleAuthRedirectUrl(incomingUrl).then(({ error }) => {
      // Duplicate deep-link deliveries hit the cached exchange result, so any
      // surviving error here is informational (e.g. expired code). Demote to debug
      // so we don't spam the console with the cosmetic PKCE noise.
      if (error) console.debug('Deep link auth (handled):', error.message);
    });
  }, [incomingUrl, session]);

  // Native: in-app OAuth is completed in signInWithGoogle (WebBrowser result).
  // Only handle cold-start deep links so we do not exchange the same code twice.
  useEffect(() => {
    if (Platform.OS === 'web' || session) return;

    let cancelled = false;
    void Linking.getInitialURL().then((url) => {
      if (cancelled || !url || !isAuthCallbackUrl(url)) return;
      void handleAuthRedirectUrl(url).then(({ error }) => {
        if (error) console.debug('Deep link auth (handled):', error.message);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [session]);

  // Fire-and-forget guard used by the AppState 'active' listener — re-checks the
  // profile when the app is foregrounded so a remote deactivation kicks the user
  // out. Routes the message through the same flag the SIGNED_IN path uses.
  const guardSession = useCallback(async () => {
    const status = await assertProfileActive();
    if (status === 'deactivated') {
      setPendingDeactivationNotice(true);
    }
  }, [setPendingDeactivationNotice]);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        await initializeLanguage();
        const session = await hydrateAuthSession();
        if (mounted && session) {
          // For a hydrated cold-start session, gate setSession on profile status so
          // we never flash the authenticated UI for a deactivated account.
          const status = await assertProfileActive();
          if (!mounted) return;
          if (status === 'deactivated') {
            setPendingDeactivationNotice(true);
            setSession(null);
          } else {
            void hydrateCurrentUserProfile(session.user.id);
            setSession(session);
          }
        } else if (mounted) {
          setSession(session);
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // For new sign-ins, verify the profile is active BEFORE storing the
      // session — otherwise the authed stack mounts for a beat and we flash
      // protected UI before assertProfileActive's internal signOut fires.
      if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        const status = await assertProfileActive();
        if (status === 'deactivated') {
          setPendingDeactivationNotice(true);
          // Skip setSession — the signOut inside assertProfileActive will deliver
          // a SIGNED_OUT event that naturally clears the store.
          return;
        }
        void hydrateCurrentUserProfile(session.user.id);
      }
      setSession(session);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [setSession, setPendingDeactivationNotice]);

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

  // Show login outside NavigationContainer so it doesn't conflict with the tab navigator
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
