import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { useAppStore } from '../store';
import { notificationDataToPendingNavigation, type NotificationData } from '../lib/pushTapRouting';

function handleTap(data: NotificationData): void {
    const pending = notificationDataToPendingNavigation(data);
    if (pending) useAppStore.getState().setPendingNavigation(pending);
}

// Wired once at the navigation root. Tap handling reuses the existing pendingNavigation flush,
// so it works for both warm taps and cold starts.
export function usePushNotificationListeners(): void {
    useEffect(() => {
        // Cold start: app opened by tapping a notification.
        void Notifications.getLastNotificationResponseAsync().then((response) => {
            const data = response?.notification.request.content.data as NotificationData | undefined;
            if (data) handleTap(data);
        });

        const sub = Notifications.addNotificationResponseReceivedListener((response) => {
            handleTap(response.notification.request.content.data as NotificationData);
        });
        return () => sub.remove();
    }, []);
}
