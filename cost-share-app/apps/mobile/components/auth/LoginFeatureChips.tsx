import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '../AppText';
import { AppIcon, type AppIconName } from '../AppIcon';
import { colors } from '../../theme';
import { rtlTextClassName, useRtlLayout } from '../../hooks/useRtlLayout';

const FEATURES: { key: 'groups' | 'expenses' | 'balances'; icon: AppIconName }[] = [
    { key: 'groups', icon: 'people-outline' },
    { key: 'expenses', icon: 'receipt-outline' },
    { key: 'balances', icon: 'swap-horizontal-outline' },
];

export function LoginFeatureChips() {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();

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
                        className={rtlTextClassName(
                            isRtl,
                            'text-xs font-semibold text-gray-700 text-center',
                        )}
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
        gap: 10,
        marginTop: 28,
    },
    chip: {
        alignItems: 'center',
        minWidth: 92,
        maxWidth: 110,
        paddingHorizontal: 8,
        paddingVertical: 12,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.72)',
        borderWidth: 1,
        borderColor: 'rgba(96,165,250,0.22)',
    },
    iconWrap: {
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: colors.primaryExtraLight,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 6,
    },
});
