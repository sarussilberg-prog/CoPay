import { Text } from '../AppText';
import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { shadows } from '../../theme';

interface Props {
    label: string;
    value: number;
    onPress: () => void;
    testID?: string;
}

export function StatTile({ label, value, onPress, testID }: Props) {
    return (
        <TouchableOpacity
            onPress={onPress}
            testID={testID}
            className="flex-1 px-4 py-4 items-center justify-center"
            accessibilityRole="button"
        >
            <Text className="text-2xl font-semibold text-slate-900 tracking-tight">{value}</Text>
            <Text className="text-xs font-medium text-slate-500 mt-1 text-center">{label}</Text>
        </TouchableOpacity>
    );
}

interface StatGroupProps {
    children: React.ReactNode;
}

export function StatGroup({ children }: StatGroupProps) {
    return (
        <View
            className="flex-row mx-4 mb-5 rounded-xl bg-white border border-slate-200/80 overflow-hidden"
            style={shadows.sm}
        >
            {children}
        </View>
    );
}

export function StatDivider() {
    return <View className="w-px bg-slate-100 self-stretch my-3" />;
}
