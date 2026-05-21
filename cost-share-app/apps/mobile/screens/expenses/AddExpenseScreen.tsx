/**
 * AddExpenseScreen
 * Create or edit an expense with equal / custom splits.
 */

import { Text } from '../../components/AppText';
import React, { useState, useEffect, useCallback, useLayoutEffect, useMemo } from 'react';
import { View, ScrollView, TextInput, StyleSheet } from 'react-native';
import { resolveAutoTextInputStyle, useRtlLayout } from '../../hooks/useRtlLayout';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ExpenseCategory, ExpenseSplitInput, DEFAULT_CURRENCY } from '@cost-share/shared';
import { useLoading } from '../../hooks/useLoading';
import { useAppStore } from '../../store';
import { useGroupUsersQuery } from '../../hooks/queries/useGroupUsersQuery';
import { useGroupMembersQuery } from '../../hooks/queries/useGroupMembersQuery';
import {
    createExpense,
    updateExpense,
    deleteExpense,
    getExpenseWithSplits,
} from '../../services/expenses.service';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { CategoryPicker } from '../../components/CategoryPicker';
import { CurrencyPicker } from '../../components/CurrencyPicker';
import { SplitTypeSelector } from '../../components/SplitTypeSelector';
import { MemberSelector } from '../../components/MemberSelector';
import { PayerPicker } from '../../components/PayerPicker';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { UnequalSplitPanel } from '../../components/UnequalSplitPanel';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ReceiptImagePicker } from '../../components/ReceiptImagePicker';
import { uploadExpenseReceipt } from '../../services/storage.service';
import Toast from 'react-native-toast-message';
import { resolveGroupMemberUsers } from '../../lib/groupMemberUsers';
import {
    UnequalSplitMode,
    areSplitsEqual,
    buildUnequalSplits,
    computeUnequalTotal,
    inferUnequalModeFromSplits,
} from '../../lib/expenseSplitForm';

/**
 * Keep only digits and a single decimal separator.
 * Accepts both `.` and `,` from locale keyboards; normalizes to `.`.
 */
function sanitizeAmountInput(text: string): string {
    const normalized = text.replace(/,/g, '.').replace(/[^0-9.]/g, '');
    const firstDot = normalized.indexOf('.');
    if (firstDot === -1) return normalized;
    return (
        normalized.slice(0, firstDot + 1) +
        normalized.slice(firstDot + 1).replace(/\./g, '')
    );
}

export function AddExpenseScreen() {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const routeParams = route.params ?? {};
    const expenseId: string | undefined = routeParams.expenseId;
    const isEditMode = Boolean(expenseId);
    const routeGroupId = routeParams.groupId as string | undefined;
    const [resolvedGroupId, setResolvedGroupId] = useState<string | undefined>(routeGroupId);
    const groupId = resolvedGroupId ?? '';
    const { isLoading, startLoading, stopLoading } = useLoading();
    const currentUser = useAppStore(state => state.currentUser);
    const storeGroup = useAppStore(s =>
        groupId ? s.groups.find(g => g.id === groupId) : undefined,
    );

    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [currency, setCurrency] = useState<string>(
        storeGroup?.defaultCurrency ?? DEFAULT_CURRENCY,
    );
    const [category, setCategory] = useState<ExpenseCategory>('other');
    const [splitType, setSplitType] = useState<'equal' | 'unequal'>('equal');
    const [paidBy, setPaidBy] = useState<string | undefined>(currentUser?.id);
    const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
    const [membersInitialized, setMembersInitialized] = useState(false);
    const [expenseLoading, setExpenseLoading] = useState(isEditMode);
    const [unequalMode, setUnequalMode] = useState<UnequalSplitMode>('percent');
    const [unequalValues, setUnequalValues] = useState<Record<string, string>>({});
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
    const [localReceiptUri, setLocalReceiptUri] = useState<string | null>(null);
    const [receiptRemoved, setReceiptRemoved] = useState(false);
    const [descriptionError, setDescriptionError] = useState('');
    const [amountError, setAmountError] = useState('');
    const [splitError, setSplitError] = useState('');

    const { data: membersData = [], isLoading: membersLoading } = useGroupMembersQuery(groupId);
    const { data: allUsers = [] } = useGroupUsersQuery(groupId);
    const activeMembers = useMemo(
        () => membersData.filter(m => m.isActive),
        [membersData],
    );

    const memberUsers = useMemo(
        () =>
            resolveGroupMemberUsers(
                activeMembers,
                allUsers,
                storeGroup?.members ?? [],
                currency,
            ),
        [activeMembers, allUsers, storeGroup?.members, currency],
    );

    const selectedMemberUsers = useMemo(
        () => memberUsers.filter(u => selectedMemberIds.includes(u.id)),
        [memberUsers, selectedMemberIds],
    );

    useLayoutEffect(() => {
        navigation.setOptions({
            title: t(isEditMode ? 'expenses.editExpense' : 'expenses.addExpense'),
        });
    }, [navigation, t, isEditMode]);

    useEffect(() => {
        if (!isEditMode && storeGroup?.defaultCurrency) {
            setCurrency(storeGroup.defaultCurrency);
        }
    }, [storeGroup?.defaultCurrency, isEditMode]);

    useEffect(() => {
        if (isEditMode || membersInitialized || activeMembers.length === 0) return;
        setSelectedMemberIds(activeMembers.map(m => m.userId));
        setMembersInitialized(true);
    }, [isEditMode, membersInitialized, activeMembers]);

    useEffect(() => {
        if (isEditMode) return;
        if (!paidBy && currentUser?.id) setPaidBy(currentUser.id);
    }, [isEditMode, paidBy, currentUser?.id]);

    useEffect(() => {
        if (!isEditMode || !expenseId) return;

        const loadExpense = async () => {
            setExpenseLoading(true);
            const data = await getExpenseWithSplits(expenseId);
            if (data) {
                const activeGroupId = routeGroupId ?? data.expense.groupId;
                setResolvedGroupId(activeGroupId);

                const { expense, splits } = data;
                setDescription(expense.description);
                setAmount(String(expense.amount));
                setCurrency(expense.currency);
                setCategory(expense.category || 'other');
                setPaidBy(expense.paidBy);
                setReceiptUrl(expense.receiptUrl ?? null);
                setLocalReceiptUri(null);
                setReceiptRemoved(false);
                if (splits.length > 0) {
                    setSelectedMemberIds(splits.map(s => s.userId));
                    setMembersInitialized(true);
                    const splitAmounts = splits.map(s => s.amount);
                    if (areSplitsEqual(splitAmounts)) {
                        setSplitType('equal');
                    } else {
                        setSplitType('unequal');
                        const inferred = inferUnequalModeFromSplits(splits, expense.amount);
                        setUnequalMode(inferred.mode);
                        setUnequalValues(inferred.values);
                    }
                }
            }
            setExpenseLoading(false);
        };
        void loadExpense();
    }, [expenseId, isEditMode, routeGroupId]);

    useEffect(() => {
        if (!isEditMode || membersInitialized || activeMembers.length === 0) return;
        if (selectedMemberIds.length === 0) {
            setSelectedMemberIds(activeMembers.map(m => m.userId));
        }
        setMembersInitialized(true);
    }, [
        isEditMode,
        membersInitialized,
        activeMembers,
        selectedMemberIds.length,
    ]);

    const parsedAmount = Number.parseFloat(amount);

    const unequalCheck = useMemo(() => {
        if (splitType !== 'unequal' || selectedMemberIds.length === 0) {
            return { isValid: true };
        }
        return computeUnequalTotal(
            unequalMode,
            unequalValues,
            selectedMemberIds,
            parsedAmount,
        );
    }, [splitType, selectedMemberIds, unequalMode, unequalValues, parsedAmount]);

    const isSubmitReady = useMemo(() => {
        const hasDescription = description.trim().length > 0;
        const hasValidAmount =
            amount.length > 0 && Number.isFinite(parsedAmount) && parsedAmount > 0;
        const hasMembers = selectedMemberIds.length > 0;
        const unequalReady = splitType !== 'unequal' || unequalCheck.isValid;
        return hasDescription && hasValidAmount && hasMembers && unequalReady;
    }, [description, amount, parsedAmount, selectedMemberIds.length, splitType, unequalCheck.isValid]);

    const handleSplitTypeChange = useCallback((type: 'equal' | 'unequal') => {
        setSplitType(type);
        setSplitError('');
        if (type === 'unequal') {
            setUnequalValues(prev => {
                const next = { ...prev };
                selectedMemberIds.forEach(id => {
                    if (next[id] === undefined) next[id] = '';
                });
                return next;
            });
        }
    }, [selectedMemberIds]);

    const handleUnequalValueChange = useCallback((userId: string, value: string) => {
        setUnequalValues(prev => ({ ...prev, [userId]: value }));
        setSplitError('');
    }, []);

    const handleUnequalModeChange = useCallback((mode: UnequalSplitMode) => {
        setUnequalMode(mode);
        setSplitError('');
    }, []);

    const handleToggleMember = useCallback((userId: string) => {
        setSelectedMemberIds(prev => {
            const next = prev.includes(userId)
                ? prev.filter(id => id !== userId)
                : [...prev, userId];
            setUnequalValues(values => {
                const updated = { ...values };
                if (!next.includes(userId)) delete updated[userId];
                else if (updated[userId] === undefined) updated[userId] = '';
                return updated;
            });
            setSplitError('');
            return next;
        });
    }, []);

    const buildSplits = useCallback((): ExpenseSplitInput[] | null => {
        if (selectedMemberIds.length === 0) return null;
        if (splitType === 'equal') {
            return selectedMemberIds.map(userId => ({ userId }));
        }
        return buildUnequalSplits(unequalMode, unequalValues, selectedMemberIds, parsedAmount);
    }, [selectedMemberIds, splitType, unequalMode, unequalValues, parsedAmount]);

    const validateForm = (): boolean => {
        let valid = true;
        if (!description.trim()) {
            setDescriptionError(t('expenses.descriptionRequired'));
            valid = false;
        } else setDescriptionError('');

        if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
            setAmountError(t('expenses.invalidAmount'));
            valid = false;
        } else setAmountError('');

        if (selectedMemberIds.length === 0) {
            setSplitError(t('expenses.noMembersSelected'));
            valid = false;
        } else if (splitType === 'unequal' && !unequalCheck.isValid) {
            setSplitError(t('expenses.splitMismatch'));
            valid = false;
        } else setSplitError('');

        return valid;
    };

    const handleReceiptChange = useCallback((uri: string | null) => {
        setLocalReceiptUri(uri);
        setReceiptRemoved(uri === null);
    }, []);

    const handleSubmit = async () => {
        if (!validateForm() || !currentUser || !groupId) return;
        const splits = buildSplits();
        if (!splits) {
            setSplitError(t('expenses.noMembersSelected'));
            return;
        }

        const payerId = paidBy ?? currentUser.id;
        startLoading();

        let uploadedReceiptUrl: string | undefined;
        if (localReceiptUri) {
            const uploaded = await uploadExpenseReceipt(groupId, localReceiptUri);
            if (!uploaded) {
                stopLoading();
                Toast.show({
                    type: 'error',
                    text1: t('common.error'),
                    text2: t('expenses.receiptUploadError'),
                });
                return;
            }
            uploadedReceiptUrl = uploaded;
        }

        // Edit mode: send a value only if the user touched the receipt field.
        // Empty string clears the column (matches the avatar-clear pattern).
        const receiptUpdate: { receiptUrl?: string } = uploadedReceiptUrl
            ? { receiptUrl: uploadedReceiptUrl }
            : receiptRemoved
                ? { receiptUrl: '' }
                : {};

        const result = isEditMode
            ? expenseId
                ? await updateExpense(expenseId, {
                      description: description.trim(),
                      amount: parsedAmount,
                      currency,
                      category,
                      paidBy: payerId,
                      splits,
                      ...receiptUpdate,
                  })
                : null
            : await createExpense({
                  groupId,
                  description: description.trim(),
                  amount: parsedAmount,
                  currency,
                  category,
                  paidBy: payerId,
                  splits,
                  ...(uploadedReceiptUrl ? { receiptUrl: uploadedReceiptUrl } : {}),
              });
        stopLoading();
        if (result) navigation.goBack();
    };

    const handleDelete = async () => {
        if (!expenseId) return;
        setShowDeleteDialog(false);
        startLoading();
        const success = await deleteExpense(expenseId);
        stopLoading();
        if (success) navigation.goBack();
    };

    if (isEditMode && expenseLoading) return <LoadingIndicator />;

    const showMembers = memberUsers.length > 0;
    const showUnequalPanel = splitType === 'unequal' && selectedMemberIds.length > 0;

    return (
        <>
            <ScrollView className="flex-1 bg-slate-50">
                <View className="p-4">
                    <Input
                        label={t('expenses.description')}
                        placeholder={t('expenses.enterDescription')}
                        value={description}
                        onChangeText={text => {
                            setDescription(text);
                            if (descriptionError) setDescriptionError('');
                        }}
                        error={descriptionError}
                    />

                    <View className="mb-4">
                        <Text className="text-sm font-medium text-gray-700 mb-2">{t('expenses.amount')}</Text>
                        <View className="flex-row items-stretch" style={{ gap: 8 }}>
                            <TextInput
                                className={`flex-1 bg-white border rounded-xl px-4 text-3xl font-semibold text-gray-900 ${amountError ? 'border-red-500' : 'border-gray-300'}`}
                                style={[resolveAutoTextInputStyle(isRtl), { height: 64, textAlign: 'center' }]}
                                placeholder="0.00"
                                placeholderTextColor="#9CA3AF"
                                value={amount}
                                onChangeText={text => {
                                    const clean = sanitizeAmountInput(text);
                                    setAmount(clean);
                                    if (amountError) setAmountError('');
                                    if (splitType === 'unequal') setSplitError('');
                                }}
                                keyboardType="decimal-pad"
                                inputMode="decimal"
                            />
                            <View style={{ width: 100 }}>
                                <CurrencyPicker value={currency} onChange={setCurrency} compact />
                            </View>
                        </View>
                        {amountError ? <Text className="text-sm text-red-500 mt-1">{amountError}</Text> : null}
                    </View>

                    <CategoryPicker value={category} onChange={setCategory} label={t('expenses.category')} />

                    {memberUsers.length > 0 && (
                        <PayerPicker
                            members={memberUsers}
                            value={paidBy}
                            onChange={setPaidBy}
                            label={t('expenses.paidBy')}
                        />
                    )}

                    <SplitTypeSelector value={splitType} onChange={handleSplitTypeChange} label={t('expenses.splitType')} />

                    {showMembers ? (
                        <MemberSelector
                            members={memberUsers}
                            selectedIds={selectedMemberIds}
                            onToggle={handleToggleMember}
                            label={t('expenses.splitBetween')}
                            variant="pills"
                        />
                    ) : membersLoading && groupId ? (
                        <LoadingIndicator />
                    ) : null}

                    {showUnequalPanel && (
                        <UnequalSplitPanel
                            members={selectedMemberUsers}
                            totalAmount={Number.isFinite(parsedAmount) ? parsedAmount : 0}
                            currency={currency}
                            mode={unequalMode}
                            values={unequalValues}
                            onChangeMode={handleUnequalModeChange}
                            onChangeValue={handleUnequalValueChange}
                        />
                    )}

                    {splitType === 'unequal' && splitError ? (
                        <Text className="text-sm text-red-500 mb-4">{splitError}</Text>
                    ) : null}

                    {splitType === 'equal' && selectedMemberIds.length > 0 && amount && Number.isFinite(parsedAmount) && (
                        <Text className="text-sm text-gray-600 text-center mb-4">
                            {t('expenses.eachPays')}: {currency}{' '}
                            {(parsedAmount / selectedMemberIds.length).toFixed(2)}
                        </Text>
                    )}

                    <ReceiptImagePicker
                        imageUrl={receiptRemoved ? null : receiptUrl}
                        localUri={localReceiptUri}
                        onChange={handleReceiptChange}
                    />

                    <View style={styles.actions}>
                        <Button
                            title={isEditMode ? t('common.save') : t('expenses.addExpense')}
                            onPress={handleSubmit}
                            loading={isLoading}
                            disabled={!isSubmitReady || isLoading}
                            testID="add-expense-submit"
                        />
                        {isEditMode && (
                            <Button
                                title={t('common.delete')}
                                onPress={() => setShowDeleteDialog(true)}
                                variant="danger"
                            />
                        )}
                    </View>
                </View>
            </ScrollView>

            {isEditMode && (
                <ConfirmDialog
                    visible={showDeleteDialog}
                    title={t('expenses.deleteExpense')}
                    message={t('expenses.deleteExpenseConfirm')}
                    confirmText={t('common.delete')}
                    cancelText={t('common.cancel')}
                    onConfirm={handleDelete}
                    onCancel={() => setShowDeleteDialog(false)}
                    destructive
                />
            )}
        </>
    );
}

const styles = StyleSheet.create({
    actions: {
        marginTop: 16,
        gap: 8,
    },
});
