import React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type PendingSyncState =
    | 'offline-waiting'
    | 'online-queued'
    | 'syncing'
    | 'tap-to-retry'
    | 'synced-transient'
    | 'failed';

interface Props {
    state: PendingSyncState;
    onPress?: () => void;
    accessibilityLabel?: string;
}

const COLORS: Record<PendingSyncState, string> = {
    'offline-waiting': '#9CA3AF',
    'online-queued': '#9CA3AF',
    syncing: '#6B7280',
    'tap-to-retry': '#6B7280',
    'synced-transient': '#10B981',
    failed: '#DC2626',
};

const ICONS: Record<PendingSyncState, keyof typeof Ionicons.glyphMap> = {
    'offline-waiting': 'cloud-offline-outline',
    'online-queued': 'cloud-upload-outline',
    syncing: 'sync',
    // Static "refresh" icon that signals to the user that the row is waiting
    // and tapping will try again. Distinct from `syncing` (animated spinner)
    // so the user can tell the app is idle vs actively trying.
    'tap-to-retry': 'refresh',
    'synced-transient': 'checkmark-circle',
    failed: 'alert-circle',
};

export function PendingSyncIcon({ state, onPress, accessibilityLabel }: Props) {
    const tappable =
        state === 'online-queued' ||
        state === 'failed' ||
        state === 'tap-to-retry' ||
        (state === 'offline-waiting' && onPress != null);

    const inner =
        state === 'syncing' ? (
            <ActivityIndicator size="small" color={COLORS[state]} />
        ) : (
            <Ionicons name={ICONS[state]} size={18} color={COLORS[state]} />
        );

    if (!tappable || !onPress) {
        return <View accessibilityLabel={accessibilityLabel}>{inner}</View>;
    }

    return (
        <Pressable
            onPress={onPress}
            accessibilityLabel={accessibilityLabel}
            accessibilityRole="button"
            hitSlop={8}
        >
            {inner}
        </Pressable>
    );
}
