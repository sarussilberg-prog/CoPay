/**
 * Android OAuth in a partial-height Chrome Custom Tab (bottom sheet).
 * Google account UI renders inside Chrome — not a WebView (allowed by Google policy).
 */
import { Dimensions, Linking, PixelRatio } from 'react-native';
import { openPartialCustomTabAsync } from 'copay-partial-auth-browser';

export type PartialAuthSessionResult =
  | { type: 'success'; url: string }
  | { type: 'cancel' }
  | { type: 'dismiss' };

const SHEET_HEIGHT_RATIO = 0.8;
const OPEN_TIMEOUT_MS = 90_000;

let redirectSubscription: { remove: () => void } | null = null;

function waitForRedirect(returnUrl: string): Promise<PartialAuthSessionResult> {
  return new Promise((resolve) => {
    const handler = ({ url }: { url: string }) => {
      if (url.startsWith(returnUrl)) {
        resolve({ type: 'success', url });
      }
    };
    redirectSubscription = Linking.addEventListener('url', handler);
  });
}

function stopWaitingForRedirect() {
  redirectSubscription?.remove();
  redirectSubscription = null;
}

function waitWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Sign-in timed out')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export async function openPartialAuthSessionAsync(
  startUrl: string,
  returnUrl: string,
): Promise<PartialAuthSessionResult> {
  if (redirectSubscription) {
    throw new Error('An auth session is already in progress');
  }

  // Chrome ignores partial heights below ~50% of physical screen and falls back to full-screen.
  // Dimensions returns dp; setInitialActivityHeightPx expects physical pixels.
  const heightDp = Dimensions.get('window').height * SHEET_HEIGHT_RATIO;
  const heightPx = PixelRatio.getPixelSizeForLayoutSize(heightDp);

  try {
    const opened = await openPartialCustomTabAsync(startUrl, heightPx);
    if (opened.type !== 'opened') {
      return { type: 'cancel' };
    }

    if (__DEV__) {
      console.info('[Auth] Partial Chrome Custom Tab opened at height', heightPx);
    }

    // Do not use AppState here — partial tabs keep the app in the foreground; an AppState
    // "active" event was resolving immediately as "dismiss" before Chrome could appear.
    return await waitWithTimeout(waitForRedirect(returnUrl), OPEN_TIMEOUT_MS);
  } finally {
    stopWaitingForRedirect();
  }
}
