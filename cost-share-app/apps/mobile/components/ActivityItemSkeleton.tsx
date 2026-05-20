/**
 * ActivityItemSkeleton — placeholder matching group feed card layout.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { FeedChatRow } from './FeedChatRow';
import { feedBubbleStyles } from './feedBubbleStyles';
import { colors } from '../theme';

export function ActivityItemSkeleton() {
    const avatarPlaceholder = (
        <View style={styles.avatar} testID="activity-skeleton-avatar" />
    );

    return (
        <FeedChatRow avatar={avatarPlaceholder}>
            <View style={[feedBubbleStyles.bubble, styles.bubble]} testID="activity-item-skeleton">
                <View className="flex-row items-start">
                    <View className="flex-1 gap-2">
                        <View className="h-4 rounded bg-blue-100" style={{ width: '72%' }} />
                        <View className="h-3 rounded bg-blue-50" style={{ width: '55%' }} />
                    </View>
                    <View className="h-4 w-14 rounded bg-blue-100 ml-2" />
                </View>
            </View>
        </FeedChatRow>
    );
}

const styles = StyleSheet.create({
    avatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: colors.gray200,
    },
    bubble: {
        paddingVertical: 16,
    },
});
