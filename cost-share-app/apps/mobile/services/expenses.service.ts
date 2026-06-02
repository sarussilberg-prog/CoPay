/**
 * Expenses Service — Supabase direct (no NestJS API)
 */

import {
    Expense,
    ExpenseSplit,
    ExpenseWithSplits,
    CreateExpenseDto,
    UpdateExpenseDto,
    ExpenseSplitInput,
} from '@cost-share/shared';
import {
    expenseFromRow,
    expenseSplitFromRow,
    calculateEqualSplit,
    validateExpenseSplits,
} from '@cost-share/shared';
import * as Sentry from '@sentry/react-native';
import { supabase } from '../lib/supabase';
import { getCurrentUserId } from '../lib/auth';
import { markGroupExpensesHydrated } from '../lib/groupFeedCache';
import { useAppStore } from '../store';
import {
    expenseSplitValidationMessage,
    showErrorToast,
    showSuccessMessage,
    showSuccessToast,
} from '../lib/appToast';
import i18n from '../i18n';

function resolveSplitAmounts(
    totalAmount: number,
    inputs: ExpenseSplitInput[],
): { userId: string; amount: number }[] {
    const useEqualSplit = inputs.every(s => s.amount === undefined);
    if (useEqualSplit) {
        const equal = calculateEqualSplit(totalAmount, inputs.length);
        return inputs.map((s, i) => ({ userId: s.userId, amount: equal[i] }));
    }
    return inputs.map(s => ({ userId: s.userId, amount: s.amount ?? 0 }));
}

export async function fetchExpenses(groupId?: string): Promise<ExpenseWithSplits[]> {
    try {
        let query = supabase
            .from('expenses')
            .select('*, expense_splits(*)')
            .eq('is_deleted', false)
            .order('created_at', { ascending: false });

        if (groupId) {
            query = query.eq('group_id', groupId);
        }

        const { data, error } = await query;
        if (error) throw error;

        const expenses: ExpenseWithSplits[] = (data ?? []).map(row => {
            const expense = expenseFromRow(row);
            const splitRows = Array.isArray(row.expense_splits) ? row.expense_splits : [];
            const splits = splitRows.map(expenseSplitFromRow);
            return { ...expense, splits };
        });

        const store = useAppStore.getState();
        if (groupId) {
            const otherGroups = store.expenses.filter(e => e.groupId !== groupId);
            store.setExpenses([...otherGroups, ...expenses]);
            markGroupExpensesHydrated(groupId);
        } else {
            store.setExpenses(expenses);
        }
        return expenses;
    } catch (error) {
        Sentry.captureException(error, {
            tags: { service: 'expenses', op: 'fetch' },
            extra: { groupId },
        });
        console.error('Failed to fetch expenses:', error);
        showErrorToast('history.loadError', 'common.networkError');
        return [];
    }
}

export { computeMyDelta, decorateExpense } from './expense-delta';

export async function getExpenseById(id: string): Promise<Expense | null> {
    const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('id', id)
        .eq('is_deleted', false)
        .maybeSingle();
    if (error || !data) return null;
    return expenseFromRow(data);
}

export async function getExpenseWithSplitsById(
    id: string,
): Promise<ExpenseWithSplits | null> {
    const { data, error } = await supabase
        .from('expenses')
        .select('*, expense_splits(*)')
        .eq('id', id)
        .eq('is_deleted', false)
        .maybeSingle();
    if (error || !data) return null;
    const expense = expenseFromRow(data);
    const splitRows = Array.isArray(data.expense_splits) ? data.expense_splits : [];
    const splits = splitRows.map(expenseSplitFromRow);
    return { ...expense, splits };
}

export async function createExpense(dto: CreateExpenseDto): Promise<Expense | null> {
    const createdBy = await getCurrentUserId();
    if (!createdBy) return null;

    const splits = resolveSplitAmounts(dto.amount, dto.splits);

    const validation = validateExpenseSplits(dto.amount, splits);
    if (!validation.valid) {
        showErrorToast(
            'history.createError',
            undefined,
            expenseSplitValidationMessage(validation) || i18n.t('common.networkError'),
        );
        return null;
    }

    const expenseDate = (dto.expenseDate ?? new Date()).toISOString().slice(0, 10);

    try {
        const { data: expenseRow, error: expenseErr } = await supabase
            .from('expenses')
            .insert({
                group_id: dto.groupId,
                description: dto.description,
                amount: dto.amount,
                currency: dto.currency,
                category: dto.category,
                expense_date: expenseDate,
                receipt_url: dto.receiptUrl,
                paid_by: dto.paidBy,
                created_by: createdBy,
                split_mode: dto.splitMode ?? 'equal',
            })
            .select()
            .single();
        if (expenseErr) throw expenseErr;

        const splitRows = splits.map(s => ({
            expense_id: expenseRow.id,
            user_id: s.userId,
            amount: s.amount,
        }));
        const { error: splitsErr } = await supabase.from('expense_splits').insert(splitRows);
        if (splitsErr) throw splitsErr;

        const expense = expenseFromRow(expenseRow);
        const splitsForStore: ExpenseSplit[] = splits.map(s => ({
            id: '',
            expenseId: expense.id,
            userId: s.userId,
            amount: s.amount,
            createdAt: expense.createdAt,
        }));
        useAppStore.getState().addExpense({ ...expense, splits: splitsForStore });
        showSuccessToast('expenses.expenseCreated');
        return expense;
    } catch (error) {
        Sentry.captureException(error, {
            tags: { service: 'expenses', op: 'create' },
            extra: { groupId: dto.groupId, amount: dto.amount, currency: dto.currency },
        });
        console.error('Failed to create expense:', error);
        showErrorToast('history.createError', 'common.networkError');
        return null;
    }
}

export async function updateExpense(id: string, dto: UpdateExpenseDto): Promise<Expense | null> {
    const existing = await getExpenseById(id);
    if (!existing) return null;

    try {
        let resolvedSplits: { userId: string; amount: number }[] | undefined;

        if (dto.splits) {
            const amount = dto.amount ?? existing.amount;
            resolvedSplits = resolveSplitAmounts(amount, dto.splits);
            const validation = validateExpenseSplits(amount, resolvedSplits);
            if (!validation.valid) {
                showErrorToast(
                    'expenses.updateError',
                    undefined,
                    expenseSplitValidationMessage(validation),
                );
                return null;
            }

            const { error: delErr } = await supabase
                .from('expense_splits')
                .delete()
                .eq('expense_id', id);
            if (delErr) throw delErr;

            const splitRows = resolvedSplits.map(s => ({
                expense_id: id,
                user_id: s.userId,
                amount: s.amount,
            }));
            const { error: insErr } = await supabase.from('expense_splits').insert(splitRows);
            if (insErr) throw insErr;
        }

        const patch: Record<string, unknown> = {};
        if (dto.description !== undefined) patch.description = dto.description;
        if (dto.amount !== undefined) patch.amount = dto.amount;
        if (dto.currency !== undefined) patch.currency = dto.currency;
        if (dto.category !== undefined) patch.category = dto.category;
        if (dto.expenseDate !== undefined) {
            patch.expense_date = dto.expenseDate.toISOString().slice(0, 10);
        }
        if (dto.receiptUrl !== undefined) patch.receipt_url = dto.receiptUrl;
        if (dto.paidBy !== undefined) patch.paid_by = dto.paidBy;
        if (dto.splitMode !== undefined) patch.split_mode = dto.splitMode;

        if (Object.keys(patch).length === 0 && !dto.splits) {
            return existing;
        }

        let baseExpense = existing;
        if (Object.keys(patch).length > 0) {
            const { data, error } = await supabase
                .from('expenses')
                .update(patch)
                .eq('id', id)
                .select()
                .maybeSingle();
            if (error || !data) throw error ?? new Error('Update failed');
            baseExpense = expenseFromRow(data);
        }

        const storeSplits = resolvedSplits
            ? resolvedSplits.map(s => ({
                  id: '',
                  expenseId: id,
                  userId: s.userId,
                  amount: s.amount,
                  createdAt: baseExpense.createdAt,
              }))
            : useAppStore.getState().expenses.find(e => e.id === id)?.splits ?? [];

        useAppStore.getState().updateExpense({ ...baseExpense, splits: storeSplits });
        showSuccessToast('expenses.expenseUpdated');
        return baseExpense;
    } catch (error) {
        Sentry.captureException(error, {
            tags: { service: 'expenses', op: 'update' },
            extra: { expenseId: id, patchKeys: Object.keys(dto) },
        });
        console.error('Failed to update expense:', error);
        showErrorToast('expenses.updateError', 'common.networkError');
        return null;
    }
}

export async function deleteExpense(id: string): Promise<boolean> {
    const { data, error } = await supabase
        .from('expenses')
        .update({ is_deleted: true })
        .eq('id', id)
        .select('id')
        .maybeSingle();

    if (error || !data) {
        showErrorToast('expenses.deleteError', 'common.networkError');
        return false;
    }

    useAppStore.getState().removeExpense(id);
    showSuccessMessage('expenses.expenseDeleted');
    return true;
}

export async function getExpenseSplits(expenseId: string): Promise<ExpenseSplit[]> {
    const { data, error } = await supabase
        .from('expense_splits')
        .select('*')
        .eq('expense_id', expenseId);
    if (error) {
        console.error('Failed to fetch expense splits:', error);
        return [];
    }
    return (data ?? []).map(expenseSplitFromRow);
}

export async function getExpenseWithSplits(
    expenseId: string,
): Promise<{ expense: Expense; splits: ExpenseSplit[] } | null> {
    const expense = await getExpenseById(expenseId);
    if (!expense) return null;
    const splits = await getExpenseSplits(expenseId);
    return { expense, splits };
}
