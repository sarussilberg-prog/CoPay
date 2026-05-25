/**
 * useGroupExpensesRealtime — subscribes to postgres_changes on expenses
 * filtered by group_id while the screen is mounted. Refetches the affected
 * row (with splits) on INSERT/UPDATE, removes on soft-delete or hard DELETE,
 * and invalidates derived caches (settlements, pairwise debts, balances).
 */

import { useEffect, useId } from 'react';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store';
import { getExpenseWithSplitsById } from '../services/expenses.service';
import { fetchBalanceSummary } from '../services/users.service';
import { queryClient } from '../lib/queryClient';
import { queryKeys } from './queries/keys';

const BALANCE_REFETCH_DEBOUNCE_MS = 500;
const balanceTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleBalanceRefetch(groupId: string): void {
    const existing = balanceTimers.get(groupId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
        balanceTimers.delete(groupId);
        void fetchBalanceSummary();
    }, BALANCE_REFETCH_DEBOUNCE_MS);
    balanceTimers.set(groupId, timer);
}

function invalidateGroupDerivedCaches(groupId: string): void {
    void queryClient.invalidateQueries({
        queryKey: queryKeys.groupSettlements(groupId),
    });
    void queryClient.invalidateQueries({
        queryKey: queryKeys.groupPairwiseDebts(groupId),
    });
    void queryClient.invalidateQueries({
        queryKey: queryKeys.groupContributions(groupId),
    });
    void queryClient.invalidateQueries({
        queryKey: queryKeys.groupSimplifiedDebtsByCurrency(groupId),
    });
    void queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard,
    });
    scheduleBalanceRefetch(groupId);
}

export function useGroupExpensesRealtime(groupId: string | undefined | null): void {
    const instanceId = useId();
    useEffect(() => {
        if (!groupId) return;

        const channel = supabase
            .channel(`group_expenses:${groupId}:${instanceId}`)
            .on(
                'postgres_changes' as never,
                {
                    event: '*',
                    schema: 'public',
                    table: 'expenses',
                    filter: `group_id=eq.${groupId}`,
                },
                (payload: {
                    eventType: string;
                    new?: Record<string, unknown>;
                    old?: Record<string, unknown>;
                }) => {
                    void (async () => {
                        try {
                            const store = useAppStore.getState();

                            if (payload.eventType === 'DELETE' && payload.old) {
                                const oldId = payload.old.id as string | undefined;
                                if (oldId) store.removeExpense(oldId);
                                invalidateGroupDerivedCaches(groupId);
                                return;
                            }

                            if (
                                (payload.eventType === 'INSERT' ||
                                    payload.eventType === 'UPDATE') &&
                                payload.new
                            ) {
                                const id = payload.new.id as string | undefined;
                                const isDeleted = payload.new.is_deleted === true;
                                if (!id) return;

                                if (isDeleted) {
                                    store.removeExpense(id);
                                    invalidateGroupDerivedCaches(groupId);
                                    return;
                                }

                                const expense = await getExpenseWithSplitsById(id);
                                if (!expense) {
                                    invalidateGroupDerivedCaches(groupId);
                                    return;
                                }

                                const exists = useAppStore
                                    .getState()
                                    .expenses.some(e => e.id === expense.id);
                                if (exists) {
                                    useAppStore.getState().updateExpense(expense);
                                } else {
                                    useAppStore.getState().addExpense(expense);
                                }
                                invalidateGroupDerivedCaches(groupId);
                            }
                        } catch (err) {
                            console.error('expenses realtime payload error:', err);
                        }
                    })();
                },
            )
            .subscribe();

        return () => {
            void channel.unsubscribe();
            void supabase.removeChannel(channel);
        };
    }, [groupId, instanceId]);
}
