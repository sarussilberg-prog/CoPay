import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

type Subscription = { remove: () => void };

type NativeModule = {
  openPartialCustomTabAsync(url: string, initialHeightPx: number): Promise<{ type: 'opened' }>;
  addListener(eventName: string, listener: () => void): Subscription;
};

const NativePartialAuthBrowser =
  Platform.OS === 'android'
    ? requireNativeModule<NativeModule>('CopayPartialAuthBrowser')
    : null;

export async function openPartialCustomTabAsync(
  url: string,
  initialHeightPx: number,
): Promise<{ type: 'opened' }> {
  if (!NativePartialAuthBrowser) {
    throw new Error('CopayPartialAuthBrowser is only available on Android');
  }
  return NativePartialAuthBrowser.openPartialCustomTabAsync(url, initialHeightPx);
}

/** Fires when the partial Custom Tab is hidden/closed. Returns null off Android. */
export function addPartialTabDismissListener(listener: () => void): Subscription | null {
  return NativePartialAuthBrowser?.addListener('onPartialTabDismiss', listener) ?? null;
}
