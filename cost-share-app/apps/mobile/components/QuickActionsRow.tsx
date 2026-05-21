/**
 * QuickActionsRow — chips that float over the bottom edge of the hero.
 */

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppIcon, AppIconName } from './AppIcon';
import { colors } from '../theme';

interface QuickActionsRowProps {
    onSettleUp: () => void;
    onBalances: () => void;
    onNote: () => void;
    settleUpDisabled?: boolean;
}

interface ChipProps {
    label: string;
    icon: AppIconName;
    onPress: () => void;
    disabled?: boolean;
    testID?: string;
}

function ActionChip({ label, icon, onPress, disabled, testID }: ChipProps) {
    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={disabled}
            activeOpacity={0.8}
            style={{
                flex: 1,
                minHeight: 64,
                opacity: disabled ? 0.45 : 1,
            }}
            className="bg-white rounded-2xl px-2 py-3 items-center justify-center border border-gray-100"
            testID={testID}
        >
            <AppIcon name={icon} size={22} color={colors.primary} />
            <Text
                className="text-xs font-medium text-gray-700 mt-1"
                numberOfLines={1}
            >
                {label}
            </Text>
        </TouchableOpacity>
    );
}

export function QuickActionsRow({
    onSettleUp,
    onBalances,
    onNote,
    settleUpDisabled,
}: QuickActionsRowProps) {
    const { t } = useTranslation();
    return (
        <View
            className="flex-row px-4"
            style={{
                gap: 8,
                marginTop: -28,
                zIndex: 10,
            }}
        >
            <ActionChip
                label={t('groups.actions.settleUp')}
                icon="swap-horizontal"
                onPress={onSettleUp}
                disabled={settleUpDisabled}
                testID="qa-settle-up"
            />
            <ActionChip
                label={t('groups.actions.balances')}
                icon="bar-chart-outline"
                onPress={onBalances}
                testID="qa-balances"
            />
            <ActionChip
                label={t('groups.actions.note')}
                icon="document-text-outline"
                onPress={onNote}
                testID="qa-note"
            />
        </View>
    );
}
