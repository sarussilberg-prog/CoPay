/**
 * SplitTypeSelector Component
 * Toggle between equal and unequal split types
 */

import { Text } from './AppText';
import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '../theme';

type SplitType = 'equal' | 'unequal';

interface SplitTypeSelectorProps {
    value: SplitType;
    onChange: (type: SplitType) => void;
    label?: string;
}

export function SplitTypeSelector({ value, onChange, label }: SplitTypeSelectorProps) {
    const { t } = useTranslation();

    return (
        <View style={styles.container}>
            {label ? <Text style={styles.label}>{label}</Text> : null}
            <View style={styles.track}>
                <TouchableOpacity
                    onPress={() => onChange('equal')}
                    activeOpacity={0.7}
                    style={[styles.option, value === 'equal' && styles.optionSelected]}
                    testID="split-type-equal"
                >
                    <Text style={[styles.optionText, value === 'equal' && styles.optionTextSelected]}>
                        {t('expenses.equalSplit')}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={() => onChange('unequal')}
                    activeOpacity={0.7}
                    style={[styles.option, value === 'unequal' && styles.optionSelected]}
                    testID="split-type-unequal"
                >
                    <Text style={[styles.optionText, value === 'unequal' && styles.optionTextSelected]}>
                        {t('expenses.unequalSplit')}
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 16,
    },
    label: {
        fontSize: 14,
        fontWeight: '500',
        color: colors.gray700,
        marginBottom: 8,
    },
    track: {
        flexDirection: 'row',
        backgroundColor: colors.gray100,
        borderRadius: 12,
        padding: 4,
    },
    option: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    optionSelected: {
        backgroundColor: colors.white,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 2,
        elevation: 1,
    },
    optionText: {
        textAlign: 'center',
        fontSize: 14,
        fontWeight: '500',
        color: colors.gray500,
    },
    optionTextSelected: {
        color: colors.primaryDark,
    },
});
