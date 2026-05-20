/**
 * Feed row — avatar always on the leading edge, card on the trailing side.
 */

import React, { type ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { rtlRowStyle, useRtlLayout } from '../hooks/useRtlLayout';

const AVATAR_GAP = 6;

interface FeedChatRowProps {
    avatar: ReactNode;
    children: ReactNode;
    testID?: string;
}

export function FeedChatRow({ avatar, children, testID }: FeedChatRowProps) {
    const isRtl = useRtlLayout();

    return (
        <View testID={testID} style={[rtlRowStyle(isRtl), styles.row]}>
            <View style={[styles.avatarSlot, { marginEnd: AVATAR_GAP }]}>{avatar}</View>
            <View style={styles.bubbleSlot}>{children}</View>
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        alignItems: 'flex-start',
        marginBottom: 10,
    },
    avatarSlot: {
        flexShrink: 0,
        marginTop: 2,
    },
    bubbleSlot: {
        flex: 1,
        minWidth: 0,
    },
});
