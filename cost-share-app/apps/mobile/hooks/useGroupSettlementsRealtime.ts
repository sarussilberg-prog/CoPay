/**
 * useGroupSettlementsRealtime — subscribes to postgres_changes on settlements
 * filtered by group_id. Settlements are React Query-owned, so on every event
 * we invalidate the settlements + pairwise debts caches and refetch the user's
 * balance summary (debounced). Soft-delete events arrive as UPDATE and the
 * subsequent refetch (which filters on deleted_at IS NULL) drops the row.
 */

import { useEffect, useId } from 'react';
import { supabase } from '../lib/supabase';
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

export function useGroupSettlementsRealtime(
    groupId: string | undefined | null,
): void {
    const instanceId = useId();
    useEffect(() => {
        if (!groupId) return;

        const channel = supabase
            .channel(`group_settlements:${groupId}:${instanceId}`)
            .on(
                'postgres_changes' as never,
                {
                    event: '*',
                    schema: 'public',
                    table: 'settlements',
                    filter: `group_id=eq.${groupId}`,
                },
                () => {
                    try {
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
                    } catch (err) {
                        console.error('settlements realtime payload error:', err);
                    }
                },
            )
            .subscribe();

        return () => {
            void channel.unsubscribe();
            void supabase.removeChannel(channel);
        };
    }, [groupId, instanceId]);
}
