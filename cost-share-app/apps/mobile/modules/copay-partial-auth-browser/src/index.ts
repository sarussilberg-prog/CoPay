import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

type NativeModule = {
  openPartialCustomTabAsync(url: string, initialHeightPx: number): Promise<{ type: 'opened' }>;
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
