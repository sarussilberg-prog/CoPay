import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Text } from '../AppText';
import { AppIcon, AppIconName } from '../AppIcon';
import { colors } from '../../theme';

interface QuietIconPillProps {
    icon: AppIconName;
    label: string;
    active: boolean;
    onPress: () => void;
    testID?: string;
}

export function QuietIconPill({ icon, label, active, onPress, testID }: QuietIconPillProps) {
    const iconColor = active ? colors.gray600 : colors.gray400;
    const textColor = active ? colors.text.secondary : colors.gray400;
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.7}
            testID={testID}
            className="flex-row items-center rounded-full"
            style={{ gap: 5, paddingHorizontal: 10, paddingVertical: 6 }}
        >
            <AppIcon name={icon} size={13} color={iconColor} />
            <Text style={{ fontSize: 11, fontWeight: '500', color: textColor }}>{label}</Text>
        </TouchableOpacity>
    );
}
