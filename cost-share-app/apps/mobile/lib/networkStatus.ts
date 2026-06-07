import { useEffect, useState } from 'react';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import * as Sentry from '@sentry/react-native';
import { SENTRY_TAGS } from './sentryTags';

function netInfoStateIsOnline(
    state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>,
): boolean {
    if (state.isConnected === false) return false;
    // null reachability = unknown; trust the device's connected flag.
    if (state.isInternetReachable === false) return false;
    return true;
}

export function wireNetworkStatusToOnlineManager(): () => void {
    return NetInfo.addEventListener((state) => {
        const online = netInfoStateIsOnline(state);
        try {
            onlineManager.setOnline(online);
            Sentry.addBreadcrumb({
                category: SENTRY_TAGS.NETWORK_TRANSITION,
                level: 'info',
                message: online ? 'network: online' : 'network: offline',
                data: {
                    isConnected: state.isConnected,
                    isInternetReachable: state.isInternetReachable,
                },
            });
        } catch (err) {
            Sentry.captureException(err, { tags: { tag: SENTRY_TAGS.NETWORK_TRANSITION } });
        }
    });
}

export function useNetworkStatus() {
    const [online, setOnline] = useState(onlineManager.isOnline());
    useEffect(() => onlineManager.subscribe((next) => setOnline(next)), []);
    return { online };
}
