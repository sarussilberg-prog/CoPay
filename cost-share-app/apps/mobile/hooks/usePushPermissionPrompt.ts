import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getPermissionStatus, requestPermission } from '../lib/pushNotifications';
import { syncPushRegistrationOnSignIn } from '../lib/pushRegistrationLifecycle';

const COOLDOWN_KEY = 'push_priming_last_declined_at';
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface PushPromptState {
    status: 'unknown' | 'granted' | 'denied' | 'undetermined';
    showBanner: boolean;
    promptSoftAsk: () => Promise<void>;
    refresh: () => Promise<void>;
}

export function usePushPermissionPrompt(): PushPromptState {
    const [status, setStatus] = useState<PushPromptState['status']>('unknown');
    const [cooldownPassed, setCooldownPassed] = useState(false);

    const refresh = useCallback(async () => {
        const s = await getPermissionStatus();
        setStatus(s === 'granted' ? 'granted' : s === 'denied' ? 'denied' : 'undetermined');
        const last = Number((await AsyncStorage.getItem(COOLDOWN_KEY)) ?? 0);
        setCooldownPassed(Date.now() - last > COOLDOWN_MS);
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);

    const promptSoftAsk = useCallback(async () => {
        const granted = await requestPermission();
        if (granted) {
            await syncPushRegistrationOnSignIn();
        } else {
            await AsyncStorage.setItem(COOLDOWN_KEY, String(Date.now()));
        }
        await refresh();
    }, [refresh]);

    // Banner shows only when not granted AND the 7-day cooldown has elapsed.
    const showBanner = status !== 'granted' && status !== 'unknown' && cooldownPassed;

    return { status, showBanner, promptSoftAsk, refresh };
}
