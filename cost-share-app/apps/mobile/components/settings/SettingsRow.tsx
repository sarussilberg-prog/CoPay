import { Text } from '../AppText';
import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { AppIcon, AppIconName } from '../AppIcon';
import { colors } from '../../theme';
import { useRtlLayout } from '../../hooks/useRtlLayout';

type Variant = 'chevron' | 'value' | 'danger';

interface BaseProps {
    iconName: AppIconName;
    label: string;
    testID?: string;
}

interface ChevronProps extends BaseProps { variant: 'chevron' | 'danger'; onPress: () => void; }
interface ValueProps extends BaseProps { variant: 'value'; valueText: string; onPress: () => void; }

type Props = ChevronProps | ValueProps;

export function SettingsRow(props: Props) {
    const { iconName, label, testID } = props;
    const isRtl = useRtlLayout();
    const isDanger = props.variant === 'danger';
    const iconColor = isDanger ? colors.error : colors.gray500;
    const textColor = isDanger ? 'text-red-600' : 'text-gray-900';

    return (
        <TouchableOpacity onPress={props.onPress} testID={testID}>
            <View className="flex-row items-center bg-white px-4 py-3.5 min-h-[52px]">
                <AppIcon name={iconName} size={22} color={iconColor} />
                <Text className={`flex-1 ms-3 text-base ${textColor}`}>{label}</Text>
                {props.variant === 'value' ? (
                    <Text className="text-sm text-gray-500 me-2">{props.valueText}</Text>
                ) : null}
                <AppIcon
                    name={isRtl ? 'chevron-back' : 'chevron-forward'}
                    size={18}
                    color={colors.gray400}
                />
            </View>
        </TouchableOpacity>
    );
}
