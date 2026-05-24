/**
 * FeedRowCard — the white card frame used by activity feed rows.
 * Accepts pre-formatted display strings; data shaping happens in the caller.
 */

import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Text } from './AppText';

interface FeedRowCardProps {
    thumbnail: React.ReactNode;
    title: string;
    meta: string;
    amount: string;
    subLine?: string;
    onPress?: () => void;
    testID?: string;
}

export function FeedRowCard({
    thumbnail,
    title,
    meta,
    amount,
    subLine,
    onPress,
    testID,
}: FeedRowCardProps) {
    const body = (
        <>
            {thumbnail}
            <View className="flex-1 min-w-0">
                <Text
                    className="text-[15px] font-semibold text-gray-900"
                    numberOfLines={1}
                >
                    {title}
                </Text>
                <Text
                    className="text-[11px] text-gray-400 mt-0.5"
                    numberOfLines={1}
                >
                    {meta}
                </Text>
            </View>
            <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
                <Text
                    className="text-[15px] font-bold text-gray-900"
                    style={{ fontVariant: ['tabular-nums'] }}
                >
                    {amount}
                </Text>
                {subLine && (
                    <Text
                        className="text-[11px] font-medium text-gray-500 mt-0.5"
                        style={{ fontVariant: ['tabular-nums'] }}
                    >
                        {subLine}
                    </Text>
                )}
            </View>
        </>
    );

    const className = "bg-white rounded-2xl border border-gray-100 px-3.5 py-3 mb-2 flex-row items-center";
    const style = { gap: 12 };

    if (onPress) {
        return (
            <TouchableOpacity
                onPress={onPress}
                activeOpacity={0.7}
                testID={testID}
                className={className}
                style={style}
            >
                {body}
            </TouchableOpacity>
        );
    }

    return (
        <View testID={testID} className={className} style={style}>
            {body}
        </View>
    );
}
