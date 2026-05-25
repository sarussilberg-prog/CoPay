/**
 * EditPayerSplitSheet
 * Bottom-sheet modal for choosing the payer and the split distribution.
 *
 * Internal draft state is committed back to the parent on Done; scrim taps
 * and Cancel discard the draft.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { User } from '@cost-share/shared';
import { Text } from '../AppText';
import { MemberAvatar } from '../MemberAvatar';
import { AppIcon } from '../AppIcon';
import { colors } from '../../theme';
import { SegmentedControl } from './SegmentedControl';
import { getAvatarUrl, getDisplayName } from '../../lib/userDisplay';
import {
    computeUnequalTotal,
    parseSplitInput,
} from '../../lib/expenseSplitForm';

export type UiSplitMode = 'equal' | 'percent' | 'exact';

/** Allow digits and a single decimal separator; cap at two decimal places. */
function sanitizeNumeric(text: string): string {
    const normalized = text.replace(/,/g, '.').replace(/[^0-9.]/g, '');
    const firstDot = normalized.indexOf('.');
    if (firstDot === -1) return normalized;
    const whole = normalized.slice(0, firstDot);
    const frac = normalized.slice(firstDot + 1).replace(/\./g, '').slice(0, 2);
    return `${whole}.${frac}`;
}

export interface EditPayerSplitDraft {
    payerId: string;
    splitMode: UiSplitMode;
    selectedMemberIds: string[];
    unequalValues: Record<string, string>;
}

interface EditPayerSplitSheetProps {
    visible: boolean;
    members: User[];
    currentUserId?: string;
    currency: string;
    totalAmount: number;
    initial: EditPayerSplitDraft;
    onCancel: () => void;
    onDone: (draft: EditPayerSplitDraft) => void;
}

export function EditPayerSplitSheet({
    visible,
    members,
    currentUserId,
    currency,
    totalAmount,
    initial,
    onCancel,
    onDone,
}: EditPayerSplitSheetProps) {
    const { t } = useTranslation();
    const [payerId, setPayerId] = useState(initial.payerId);
    const [splitMode, setSplitMode] = useState<UiSplitMode>(initial.splitMode);
    const [selectedIds, setSelectedIds] = useState<string[]>(initial.selectedMemberIds);
    const [values, setValues] = useState<Record<string, string>>(initial.unequalValues);

    useEffect(() => {
        if (visible) {
            setPayerId(initial.payerId);
            setSplitMode(initial.splitMode);
            setSelectedIds(initial.selectedMemberIds);
            setValues(initial.unequalValues);
        }
    }, [visible, initial.payerId, initial.splitMode, initial.selectedMemberIds, initial.unequalValues]);

    const splitModeOptions = useMemo(
        () => [
            { value: 'equal' as const, label: t('expenses.v2.modes.equal') },
            { value: 'percent' as const, label: t('expenses.v2.modes.percent') },
            { value: 'exact' as const, label: t('expenses.v2.modes.exact') },
        ],
        [t],
    );

    const validation = useMemo(() => {
        if (splitMode === 'equal' || selectedIds.length === 0) return { isValid: true } as const;
        const mode = splitMode === 'percent' ? 'percent' : 'amount';
        return computeUnequalTotal(mode, values, selectedIds, totalAmount);
    }, [splitMode, selectedIds, values, totalAmount]);

    const perHead = useMemo(() => {
        if (!selectedIds.length || !Number.isFinite(totalAmount)) return 0;
        return totalAmount / selectedIds.length;
    }, [selectedIds.length, totalAmount]);

    const toggleMember = (id: string) => {
        setSelectedIds(prev => {
            const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
            setValues(v => {
                const updated = { ...v };
                if (!next.includes(id)) delete updated[id];
                else if (updated[id] === undefined) updated[id] = '';
                return updated;
            });
            return next;
        });
    };

    const handleDone = () => {
        if (splitMode !== 'equal' && !validation.isValid) return;
        onDone({ payerId, splitMode, selectedMemberIds: selectedIds, unequalValues: values });
    };

    const metaCaption = t('expenses.v2.splitMeta', {
        selected: selectedIds.length,
        total: members.length,
        currency,
        each: perHead.toFixed(2),
    });

    const titleError = useMemo(() => {
        if (splitMode === 'equal' || selectedIds.length === 0) return null;
        if (!('difference' in validation) || validation.isValid) return null;
        const diff = validation.difference;
        const isUnder = diff > 0;
        const abs = Math.abs(diff);
        if (splitMode === 'percent') {
            const value = abs.toFixed(0);
            return isUnder
                ? t('expenses.v2.errors.percentUnder', { value })
                : t('expenses.v2.errors.percentOver', { value });
        }
        const value = abs.toFixed(2);
        const total = totalAmount.toFixed(2);
        return isUnder
            ? t('expenses.v2.errors.amountUnder', { value, currency, total })
            : t('expenses.v2.errors.amountOver', { value, currency, total });
    }, [splitMode, selectedIds.length, validation, currency, totalAmount, t]);

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
            <View style={styles.backdrop}>
                <Pressable style={styles.scrim} onPress={onCancel} testID="edit-payer-split-scrim" />
                <View style={styles.sheet}>
                    <View style={styles.grabber} />
                    <View style={styles.titleRow}>
                        <Text style={styles.title}>{t('expenses.v2.whoAndHow')}</Text>
                        <TouchableOpacity
                            onPress={handleDone}
                            disabled={splitMode !== 'equal' && !validation.isValid}
                            testID="edit-payer-split-done"
                        >
                            <Text
                                style={[
                                    styles.doneText,
                                    splitMode !== 'equal' && !validation.isValid ? styles.doneTextDisabled : null,
                                ]}
                            >
                                {t('common.done')}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
                        {/* Section: Paid by */}
                        <Text style={styles.eyebrow}>{t('expenses.v2.sectionPaidBy')}</Text>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={{ marginBottom: 16 }}
                            contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
                        >
                            {members.map(member => {
                                const selected = member.id === payerId;
                                const name = member.id === currentUserId ? t('common.you') : getDisplayName(member, t);
                                return (
                                    <TouchableOpacity
                                        key={member.id}
                                        onPress={() => setPayerId(member.id)}
                                        activeOpacity={0.85}
                                        testID={`payer-cell-${member.id}`}
                                        style={[styles.payerCell, selected && styles.payerCellSelected]}
                                    >
                                        <View style={styles.payerAvatarFrame}>
                                            <MemberAvatar
                                                name={name}
                                                avatarUrl={getAvatarUrl(member) ?? undefined}
                                                pixelSize={36}
                                            />
                                        </View>
                                        <Text
                                            numberOfLines={1}
                                            style={[styles.payerName, selected && styles.payerNameSelected]}
                                        >
                                            {name}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>

                        {/* Section: Split between */}
                        <View style={styles.splitHeaderRow}>
                            <Text style={styles.eyebrow}>{t('expenses.v2.sectionSplitBetween')}</Text>
                            {titleError ? (
                                <Text
                                    style={styles.splitErrorCaption}
                                    numberOfLines={1}
                                    testID="edit-payer-split-error"
                                >
                                    {titleError}
                                </Text>
                            ) : (
                                <Text style={styles.metaCaption}>{metaCaption}</Text>
                            )}
                        </View>

                        <View style={{ marginBottom: 10 }}>
                            <SegmentedControl
                                value={splitMode}
                                options={splitModeOptions}
                                onChange={mode => setSplitMode(mode)}
                                testIDPrefix="split-mode"
                            />
                        </View>

                        <View style={styles.memberList}>
                            {members.map((member, idx) => {
                                const isLast = idx === members.length - 1;
                                const checked = selectedIds.includes(member.id);
                                const name = member.id === currentUserId ? t('common.you') : getDisplayName(member, t);
                                const value = values[member.id] ?? '';
                                const perRowAmount = splitMode === 'equal'
                                    ? (checked ? perHead : 0)
                                    : splitMode === 'percent'
                                        ? (totalAmount * parseSplitInput(value)) / 100
                                        : parseSplitInput(value);
                                return (
                                    <View
                                        key={member.id}
                                        style={[styles.memberRow, !isLast && styles.memberRowDivider]}
                                    >
                                        <TouchableOpacity
                                            onPress={() => toggleMember(member.id)}
                                            activeOpacity={0.7}
                                            testID={`member-toggle-${member.id}`}
                                            style={[styles.checkbox, checked && styles.checkboxChecked]}
                                        >
                                            {checked ? (
                                                <AppIcon name="checkmark" size={14} color={colors.white} />
                                            ) : null}
                                        </TouchableOpacity>
                                        <MemberAvatar
                                            name={name}
                                            avatarUrl={getAvatarUrl(member) ?? undefined}
                                            size="xs"
                                        />
                                        <Text style={styles.memberName} numberOfLines={1}>{name}</Text>
                                        {splitMode === 'equal' ? (
                                            <Text style={styles.memberAmount}>
                                                {checked ? `${currency} ${perHead.toFixed(2)}` : '—'}
                                            </Text>
                                        ) : (
                                            <View style={styles.inputWrap}>
                                                <TextInput
                                                    style={styles.input}
                                                    value={value}
                                                    onChangeText={text =>
                                                        setValues(v => ({ ...v, [member.id]: sanitizeNumeric(text) }))
                                                    }
                                                    keyboardType="decimal-pad"
                                                    inputMode="decimal"
                                                    placeholder={splitMode === 'percent' ? '0' : '0.00'}
                                                    placeholderTextColor={colors.gray400}
                                                    editable={checked}
                                                    testID={`split-input-${member.id}`}
                                                />
                                                <Text style={styles.inputSuffix}>
                                                    {splitMode === 'percent' ? '%' : currency}
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                );
                            })}
                        </View>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        justifyContent: 'flex-end',
    },
    scrim: {
        ...StyleSheet.absoluteFillObject,
    },
    sheet: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 22,
        maxHeight: '75%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -8 },
        shadowOpacity: 0.2,
        shadowRadius: 24,
        elevation: 12,
    },
    grabber: {
        alignSelf: 'center',
        width: 40,
        height: 4,
        borderRadius: 9999,
        backgroundColor: '#E5E7EB',
        marginBottom: 8,
    },
    titleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 14,
    },
    title: {
        fontSize: 15,
        fontWeight: '700',
        color: colors.text.primary,
    },
    splitErrorCaption: {
        flexShrink: 1,
        fontSize: 11,
        fontWeight: '700',
        color: colors.error,
        textAlign: 'right',
    },
    doneText: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.primaryDark,
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    doneTextDisabled: {
        color: colors.gray400,
    },
    eyebrow: {
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 0.72,
        textTransform: 'uppercase',
        color: '#94A3B8',
        marginBottom: 8,
    },
    payerCell: {
        width: 76,
        paddingHorizontal: 10,
        paddingTop: 8,
        paddingBottom: 6,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        gap: 4,
    },
    payerAvatarFrame: {
        width: 36,
        height: 36,
        borderRadius: 18,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
    },
    payerCellSelected: {
        backgroundColor: '#DBEAFE',
        borderColor: '#93C5FD',
    },
    payerName: {
        fontSize: 11,
        fontWeight: '500',
        color: colors.text.secondary,
        textAlign: 'center',
    },
    payerNameSelected: {
        color: colors.primaryDark,
        fontWeight: '700',
    },
    splitHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        marginBottom: 8,
    },
    metaCaption: {
        fontSize: 11,
        fontWeight: '600',
        color: colors.text.secondary,
        fontVariant: ['tabular-nums'],
    },
    memberList: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        overflow: 'hidden',
    },
    memberRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        gap: 12,
    },
    memberRowDivider: {
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    checkbox: {
        width: 20,
        height: 20,
        borderRadius: 6,
        borderWidth: 1.5,
        borderColor: '#CBD5E1',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFFFFF',
    },
    checkboxChecked: {
        backgroundColor: '#60A5FA',
        borderColor: '#60A5FA',
    },
    memberName: {
        flex: 1,
        fontSize: 13,
        fontWeight: '600',
        color: colors.text.primary,
    },
    memberAmount: {
        fontSize: 13,
        fontWeight: '700',
        color: colors.text.secondary,
        fontVariant: ['tabular-nums'],
    },
    inputWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    input: {
        minWidth: 60,
        maxWidth: 80,
        textAlign: 'right',
        fontSize: 13,
        fontWeight: '700',
        color: colors.text.primary,
        padding: 0,
    },
    inputSuffix: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.text.secondary,
    },
});
