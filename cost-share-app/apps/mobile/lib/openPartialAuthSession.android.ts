/**
 * Android OAuth in a partial-height Chrome Custom Tab (bottom sheet).
 * Google account UI renders inside Chrome — not a WebView (allowed by Google policy).
 */
import { Dimensions, Linking, PixelRatio } from 'react-native';
import { openPartialCustomTabAsync, addPartialTabDismissListener } from 'copay-partial-auth-browser';

export type PartialAuthSessionResult =
  | { type: 'success'; url: string }
  | { type: 'cancel' }
  | { type: 'dismiss' };

const SHEET_HEIGHT_RATIO = 0.8;
const OPEN_TIMEOUT_MS = 90_000;
// The tab is also hidden by a successful redirect, so when it closes we wait briefly
// for the deep link before treating it as a user cancel — success always wins this race.
const DISMISS_GRACE_MS = 600;

let redirectSubscription: { remove: () => void } | null = null;
let dismissSubscription: { remove: () => void } | null = null;
let dismissTimer: ReturnType<typeof setTimeout> | null = null;

function waitForOutcome(returnUrl: string): Promise<PartialAuthSessionResult> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (result: PartialAuthSessionResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    redirectSubscription = Linking.addEventListener('url', ({ url }: { url: string }) => {
      if (url.startsWith(returnUrl)) settle({ type: 'success', url });
    });

    // Closing the Custom Tab (X / back) fires this. It also fires when a successful
    // redirect closes the tab, so we wait DISMISS_GRACE_MS for the deep link first.
    dismissSubscription = addPartialTabDismissListener(() => {
      if (dismissTimer) return;
      dismissTimer = setTimeout(() => settle({ type: 'cancel' }), DISMISS_GRACE_MS);
    });
  });
}

function stopWaiting() {
  redirectSubscription?.remove();
  redirectSubscription = null;
  dismissSubscription?.remove();
  dismissSubscription = null;
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
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
  if (redirectSubscription || dismissSubscription) {
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

    // Resolves on the OAuth redirect (success) or when the user closes the tab (cancel).
    return await waitWithTimeout(waitForOutcome(returnUrl), OPEN_TIMEOUT_MS);
  } finally {
    stopWaiting();
  }
}
