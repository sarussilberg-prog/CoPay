/**
 * AddExpenseScreen
 * Form to create a new expense with splits
 * Uses NativeWind styling only, full i18n support
 */

import { Text } from '../../components/AppText';
import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, TextInput } from 'react-native';
import { resolveAutoTextInputStyle, useRtlLayout } from '../../hooks/useRtlLayout';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ExpenseCategory, GroupMember, User, ExpenseSplitInput, DEFAULT_CURRENCY } from '@cost-share/shared';
import { useLoading } from '../../hooks/useLoading';
import { useAppStore } from '../../store';
import { useGroupUsersQuery } from '../../hooks/queries/useGroupUsersQuery';
import { createExpense } from '../../services/expenses.service';
import { getGroupById, getGroupMembers } from '../../services/groups.service';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { CategoryPicker } from '../../components/CategoryPicker';
import { CurrencyPicker } from '../../components/CurrencyPicker';
import { SplitTypeSelector } from '../../components/SplitTypeSelector';
import { MemberSelector } from '../../components/MemberSelector';
import { LoadingIndicator } from '../../components/LoadingIndicator';

export function AddExpenseScreen() {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const { groupId } = route.params;
    const { isLoading, startLoading, stopLoading } = useLoading();
    const currentUser = useAppStore((state) => state.currentUser);

    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [currency, setCurrency] = useState<string>(DEFAULT_CURRENCY);
    const [category, setCategory] = useState<ExpenseCategory>('other');
    const [splitType, setSplitType] = useState<'equal' | 'unequal'>('equal');
    const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
    const [members, setMembers] = useState<GroupMember[]>([]);
    const [dataLoading, setDataLoading] = useState(true);
    const { data: allUsers = [] } = useGroupUsersQuery(groupId);

    const [descriptionError, setDescriptionError] = useState('');
    const [amountError, setAmountError] = useState('');

    useEffect(() => {
        const loadData = async () => {
            const [membersData, group] = await Promise.all([
                getGroupMembers(groupId),
                getGroupById(groupId),
            ]);
            const activeMembers = membersData.filter((m) => m.isActive);
            setMembers(activeMembers);
            setSelectedMemberIds(activeMembers.map((m) => m.userId));
            if (group?.defaultCurrency) setCurrency(group.defaultCurrency);
            setDataLoading(false);
        };
        void loadData();
    }, [groupId]);

    const getMemberUsers = (): User[] => {
        return allUsers.filter((u) =>
            members.some((m) => m.userId === u.id && m.isActive)
        );
    };

    const validateForm = (): boolean => {
        let valid = true;

        if (!description.trim()) {
            setDescriptionError(t('expenses.descriptionRequired'));
            valid = false;
        } else {
            setDescriptionError('');
        }

        const parsedAmount = parseFloat(amount);
        if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
            setAmountError(t('expenses.invalidAmount'));
            valid = false;
        } else {
            setAmountError('');
        }

        return valid;
    };

    const handleCreate = async () => {
        if (!validateForm()) return;
        if (!currentUser) return;

        const parsedAmount = parseFloat(amount);
        const splits: ExpenseSplitInput[] = selectedMemberIds.map((userId) => ({
            userId,
            amount: splitType === 'equal' ? parsedAmount / selectedMemberIds.length : undefined,
        }));

        startLoading();
        const result = await createExpense({
            groupId,
            description: description.trim(),
            amount: parsedAmount,
            currency,
            category,
            paidBy: currentUser.id,
            splits,
        });
        stopLoading();

        if (result) {
            navigation.goBack();
        }
    };

    const handleToggleMember = (userId: string) => {
        setSelectedMemberIds((prev) =>
            prev.includes(userId)
                ? prev.filter((id) => id !== userId)
                : [...prev, userId]
        );
    };

    if (dataLoading) {
        return <LoadingIndicator />;
    }

    return (
        <ScrollView className="flex-1 bg-slate-50">
            <View className="p-4">
                {/* Description */}
                <Input
                    label={t('expenses.description')}
                    placeholder={t('expenses.enterDescription')}
                    value={description}
                    onChangeText={(text) => {
                        setDescription(text);
                        if (descriptionError) setDescriptionError('');
                    }}
                    error={descriptionError}
                />

                {/* Amount + Currency */}
                <View className="mb-4">
                    <Text className="text-sm font-medium text-gray-700 mb-2">
                        {t('expenses.amount')}
                    </Text>
                    <View className="flex-row items-center" style={{ gap: 8 }}>
                        <TextInput
                            className={`flex-1 bg-white border rounded-xl px-4 text-3xl font-semibold text-gray-900 ${amountError ? 'border-red-500' : 'border-gray-300'}`}
                            style={[
                                resolveAutoTextInputStyle(isRtl),
                                { height: 64, textAlign: 'center' },
                            ]}
                            placeholder="0.00"
                            placeholderTextColor="#9CA3AF"
                            value={amount}
                            onChangeText={(text) => {
                                setAmount(text);
                                if (amountError) setAmountError('');
                            }}
                            keyboardType="decimal-pad"
                        />
                        <View style={{ width: 96 }}>
                            <CurrencyPicker
                                value={currency}
                                onChange={setCurrency}
                                compact
                            />
                        </View>
                    </View>
                    {amountError ? (
                        <Text className="text-sm text-red-500 mt-1">{amountError}</Text>
                    ) : null}
                </View>

                {/* Category */}
                <CategoryPicker
                    value={category}
                    onChange={setCategory}
                    label={t('expenses.category')}
                />

                {/* Split Type */}
                <SplitTypeSelector
                    value={splitType}
                    onChange={setSplitType}
                    label={t('expenses.splitType')}
                />

                {/* Split Between */}
                <MemberSelector
                    members={getMemberUsers()}
                    selectedIds={selectedMemberIds}
                    onToggle={handleToggleMember}
                    label={t('expenses.splitBetween')}
                />

                {/* Equal Split Preview */}
                {splitType === 'equal' && selectedMemberIds.length > 0 && amount && (
                    <View className="bg-primary-extra-light rounded-xl p-4 mb-4">
                        <Text className="text-sm text-primary-dark text-center">
                            {t('expenses.eachPays')}: ${(parseFloat(amount) / selectedMemberIds.length).toFixed(2)}
                        </Text>
                    </View>
                )}

                {/* Create Button */}
                <View className="mt-4">
                    <Button
                        title={t('expenses.addExpense')}
                        onPress={handleCreate}
                        loading={isLoading}
                        disabled={isLoading}
                    />
                </View>
            </View>
        </ScrollView>
    );
}
