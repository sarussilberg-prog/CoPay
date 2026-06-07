/**
 * useGroupExpensesRealtime — subscribes to postgres_changes on expenses
 * filtered by group_id while the screen is mounted. Refetches the affected
 * row (with splits) on INSERT/UPDATE, removes on soft-delete or hard DELETE,
 * and invalidates derived caches (settlements, pairwise debts, balances).
 *
 * Writes through the React Query cache (queryKeys.groupExpenses) — upsert by
 * id so realtime echoes for rows already in cache are no-ops. On SUBSCRIBED
 * the hook invalidates the query so any events missed during a disconnect
 * get reconciled.
 */

import { useEffect, useId } from 'react';
import * as Sentry from '@sentry/react-native';
import type { ExpenseWithSplits } from '@cost-share/shared';
import { supabase } from '../lib/supabase';
import { getExpenseWithSplitsById } from '../services/expenses.service';
import { fetchBalanceSummary } from '../services/users.service';
import { queryClient } from '../lib/queryClient';
import { SENTRY_TAGS } from '../lib/sentryTags';
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

function removeExpenseFromCache(groupId: string, expenseId: string): void {
    queryClient.setQueryData<ExpenseWithSplits[]>(
        queryKeys.groupExpenses(groupId),
        (prev) => (prev ?? []).filter((e) => e.id !== expenseId),
    );
}

function upsertExpenseInCache(groupId: string, expense: ExpenseWithSplits): void {
    queryClient.setQueryData<ExpenseWithSplits[]>(
        queryKeys.groupExpenses(groupId),
        (prev) => {
            const list = prev ?? [];
            return list.some((e) => e.id === expense.id)
                ? list.map((e) => (e.id === expense.id ? expense : e))
                : [...list, expense];
        },
    );
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
                            if (payload.eventType === 'DELETE' && payload.old) {
                                const oldId = payload.old.id as string | undefined;
                                if (oldId) removeExpenseFromCache(groupId, oldId);
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
                                    removeExpenseFromCache(groupId, id);
                                    invalidateGroupDerivedCaches(groupId);
                                    return;
                                }

                                const expense = await getExpenseWithSplitsById(id);
                                if (!expense) {
                                    invalidateGroupDerivedCaches(groupId);
                                    return;
                                }

                                upsertExpenseInCache(groupId, expense);
                                invalidateGroupDerivedCaches(groupId);
                            }
                        } catch (err) {
                            Sentry.captureException(err, {
                                tags: { tag: SENTRY_TAGS.REALTIME_ECHO },
                            });
                        }
                    })();
                },
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    void queryClient.invalidateQueries({
                        queryKey: queryKeys.groupExpenses(groupId),
                    });
                }
            });

        return () => {
            void channel.unsubscribe();
            void supabase.removeChannel(channel);
        };
    }, [groupId, instanceId]);
}
