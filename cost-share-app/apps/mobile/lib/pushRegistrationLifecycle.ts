import { fetchExpoPushToken, getPermissionStatus, currentPlatform, appVersion, setBadgeCount } from './pushNotifications';
import { registerPushToken, unregisterPushToken } from '../services/pushTokens.service';

let lastRegisteredToken: string | null = null;

// Called after sign-in (and on app start when already authenticated). Only registers if the
// OS permission is already granted — the contextual prompt (Task 3.9) handles asking.
export async function syncPushRegistrationOnSignIn(): Promise<void> {
    const platform = currentPlatform();
    if (!platform) return;
    if ((await getPermissionStatus()) !== 'granted') return;

    const token = await fetchExpoPushToken();
    if (!token) return;
    lastRegisteredToken = token;
    await registerPushToken({ token, platform, appVersion: appVersion() });
}

export async function clearPushRegistrationOnSignOut(): Promise<void> {
    await setBadgeCount(0);
    const token = lastRegisteredToken ?? (await fetchExpoPushToken());
    if (token) await unregisterPushToken(token);
    lastRegisteredToken = null;
}
