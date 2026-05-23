/**
 * Inline panel for configuring unequal expense splits by percentage or amount.
 */

import React, { useMemo } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { User } from '@cost-share/shared';
import { Text } from './AppText';
import { MemberAvatar } from './MemberAvatar';
import { resolveAutoTextInputStyle, useRtlLayout } from '../hooks/useRtlLayout';
import { colors } from '../theme';
import {
    UnequalSplitMode,
    computeUnequalTotal,
} from '../lib/expenseSplitForm';
import { getAvatarUrl, getDisplayName } from '../lib/userDisplay';

interface UnequalSplitPanelProps {
    members: User[];
    totalAmount: number;
    currency: string;
    mode: UnequalSplitMode;
    values: Record<string, string>;
    onChangeMode: (mode: UnequalSplitMode) => void;
    onChangeValue: (userId: string, value: string) => void;
}

export function UnequalSplitPanel({
    members,
    totalAmount,
    currency,
    mode,
    values,
    onChangeMode,
    onChangeValue,
}: UnequalSplitPanelProps) {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();
    const memberIds = useMemo(() => members.map(m => m.id), [members]);

    const { total, target, difference, isValid } = computeUnequalTotal(
        mode,
        values,
        memberIds,
        totalAmount,
    );

    const suffix = mode === 'percent' ? '%' : currency;

    return (
        <View style={styles.container} testID="unequal-split-panel">
            <Text style={styles.title}>{t('expenses.unequalSplitTitle')}</Text>

            <View style={styles.modeTrack}>
                {(['percent', 'amount'] as UnequalSplitMode[]).map(option => (
                    <TouchableOpacity
                        key={option}
                        onPress={() => onChangeMode(option)}
                        style={[styles.modeOption, mode === option && styles.modeOptionSelected]}
                        testID={`split-mode-${option}`}
                    >
                        <Text style={[styles.modeText, mode === option && styles.modeTextSelected]}>
                            {t(`expenses.splitMode.${option}`)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {members.map(member => (
                <View key={member.id} style={styles.memberRow}>
                    <MemberAvatar name={getDisplayName(member, t)} avatarUrl={getAvatarUrl(member) ?? undefined} size="sm" />
                    <Text style={styles.memberName} numberOfLines={1}>
                        {getDisplayName(member, t)}
                    </Text>
                    <TextInput
                        style={[styles.input, resolveAutoTextInputStyle(isRtl, { textAlign: 'center' })]}
                        value={values[member.id] ?? ''}
                        onChangeText={text => onChangeValue(member.id, text)}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor={colors.gray400}
                        testID={`split-input-${member.id}`}
                    />
                    <Text style={styles.suffix}>{suffix}</Text>
                </View>
            ))}

            <Text style={[styles.summary, isValid ? styles.summaryValid : styles.summaryInvalid]}>
                {isValid
                    ? t('expenses.splitComplete', {
                          total: total.toFixed(mode === 'percent' ? 0 : 2),
                          target: target.toFixed(mode === 'percent' ? 0 : 2),
                          unit: suffix,
                      })
                    : t('expenses.splitRemaining', {
                          remaining: Math.abs(difference).toFixed(mode === 'percent' ? 0 : 2),
                          unit: suffix,
                      })}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 16,
        backgroundColor: colors.white,
        borderWidth: 1,
        borderColor: 'rgba(37, 99, 235, 0.25)',
        borderRadius: 16,
        padding: 16,
    },
    title: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.gray900,
        marginBottom: 12,
    },
    modeTrack: {
        flexDirection: 'row',
        backgroundColor: colors.gray100,
        borderRadius: 12,
        padding: 4,
        marginBottom: 12,
    },
    modeOption: {
        flex: 1,
        paddingVertical: 8,
        borderRadius: 8,
        alignItems: 'center',
    },
    modeOptionSelected: {
        backgroundColor: colors.white,
    },
    modeText: {
        fontSize: 14,
        fontWeight: '500',
        color: colors.gray500,
        textAlign: 'center',
    },
    modeTextSelected: {
        color: colors.primaryDark,
    },
    memberRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    memberName: {
        flex: 1,
        marginHorizontal: 12,
        fontSize: 16,
        color: colors.gray800,
    },
    input: {
        width: 96,
        backgroundColor: colors.gray50,
        borderWidth: 1,
        borderColor: colors.gray200,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 8,
        fontSize: 16,
        color: colors.gray900,
    },
    suffix: {
        width: 36,
        marginLeft: 8,
        fontSize: 14,
        color: colors.gray500,
    },
    summary: {
        marginTop: 4,
        fontSize: 14,
        textAlign: 'center',
    },
    summaryValid: {
        color: '#059669',
    },
    summaryInvalid: {
        color: colors.error,
    },
});
