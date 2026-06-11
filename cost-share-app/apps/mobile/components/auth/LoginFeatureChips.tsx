import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '../AppText';
import { AppIcon, type AppIconName } from '../AppIcon';
import { colors } from '../../theme';
import { centeredTextStyle } from '../../hooks/useRtlLayout';

const FEATURES: { key: 'groups' | 'expenses' | 'balances'; icon: AppIconName }[] = [
    { key: 'groups', icon: 'people-outline' },
    { key: 'expenses', icon: 'receipt-outline' },
    { key: 'balances', icon: 'swap-horizontal-outline' },
];

export function LoginFeatureChips() {
    const { t } = useTranslation();
    return (
        <View
            style={styles.row}
            testID="login-feature-chips"
            accessibilityRole="summary"
        >
            {FEATURES.map(({ key, icon }) => (
                <View key={key} style={styles.chip}>
                    <View style={styles.iconWrap}>
                        <AppIcon name={icon} size={18} color={colors.primaryDark} />
                    </View>
                    <Text
                        className="text-xs font-semibold text-gray-700 text-center"
                        style={centeredTextStyle}
                        numberOfLines={1}
                    >
                        {t(`auth.feature.${key}`)}
                    </Text>
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 24,
        marginTop: 28,
    },
    chip: {
        alignItems: 'center',
        minWidth: 72,
        maxWidth: 96,
    },
    iconWrap: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.primaryExtraLight,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
});
