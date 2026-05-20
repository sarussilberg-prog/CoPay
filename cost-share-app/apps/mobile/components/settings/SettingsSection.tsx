import { Text } from '../AppText';
import React from 'react';
import { View } from 'react-native';

interface Props { title: string; children: React.ReactNode; }

export function SettingsSection({ title, children }: Props) {
    return (
        <View className="mb-6">
            <Text className="px-5 mb-2 text-xs font-semibold uppercase text-gray-500">{title}</Text>
            <View className="mx-4 rounded-2xl overflow-hidden border border-gray-100 bg-white">{children}</View>
        </View>
    );
}
