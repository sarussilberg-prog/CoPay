/**
 * Android bottom sheet shell for native Google Sign-In.
 * Google blocks OAuth inside WebView (403 disallowed_useragent); the sheet only
 * frames the native account picker — see `GoogleSignInSheetHost` in App.tsx.
 */

export type GoogleSignInSheetResult = {
  error: { code: 'account_deleted' | 'generic'; message: string } | null;
};

type ActiveSession = {
  run: () => Promise<GoogleSignInSheetResult>;
  resolve: (result: GoogleSignInSheetResult) => void;
};

type Listener = () => void;

let active: ActiveSession | null = null;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function subscribeGoogleSignInSheet(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getGoogleSignInSheetSession(): ActiveSession | null {
  return active;
}

export function presentGoogleSignInSheet(
  run: () => Promise<GoogleSignInSheetResult>,
): Promise<GoogleSignInSheetResult> {
  if (active) {
    return Promise.resolve({
      error: { code: 'generic', message: 'Sign-in already in progress' },
    });
  }

  return new Promise((resolve) => {
    active = { run, resolve };
    notify();
  });
}

export function completeGoogleSignInSheet(result: GoogleSignInSheetResult): void {
  const session = active;
  active = null;
  notify();
  session?.resolve(result);
}

export function cancelGoogleSignInSheet(): void {
  completeGoogleSignInSheet({
    error: { code: 'generic', message: 'Sign-in was cancelled' },
  });
}
