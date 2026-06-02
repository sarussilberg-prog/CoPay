import { Platform } from 'react-native';
import {
  GoogleSignin,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';

/** Web OAuth client ID (Google Cloud → Web application). Not Android / Installed. */
export function getGoogleWebClientId(): string | undefined {
  const id = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  return id || undefined;
}

export function isNativeGoogleSignInEnabled(): boolean {
  return Platform.OS === 'android' && Boolean(getGoogleWebClientId());
}

export function configureNativeGoogleSignIn(): void {
  const webClientId = getGoogleWebClientId();
  if (!webClientId || Platform.OS !== 'android') return;

  GoogleSignin.configure({
    webClientId,
    offlineAccess: false,
  });
}

export async function signInWithGoogleNative(): Promise<
  { idToken: string } | { error: Error }
> {
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    try {
      await GoogleSignin.signOut();
    } catch {
      // No prior session — account picker still works.
    }

    const response = await GoogleSignin.signIn();
    const idToken = response.data?.idToken;
    if (!idToken) {
      return { error: new Error('Google Sign-In returned no id token') };
    }
    return { idToken };
  } catch (err) {
    if (isErrorWithCode(err) && err.code === statusCodes.SIGN_IN_CANCELLED) {
      return { error: new Error('Sign-in was cancelled') };
    }
    if (isErrorWithCode(err) && err.code === statusCodes.IN_PROGRESS) {
      return { error: new Error('Sign-in already in progress') };
    }
    if (isErrorWithCode(err) && err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      return { error: new Error('Google Play Services is not available on this device') };
    }
    return { error: err instanceof Error ? err : new Error(String(err)) };
  }
}

export async function signOutNativeGoogle(): Promise<void> {
  if (!isNativeGoogleSignInEnabled()) return;
  try {
    await GoogleSignin.signOut();
  } catch {
    // Ignore — user may not have signed in with Google on this device.
  }
}
