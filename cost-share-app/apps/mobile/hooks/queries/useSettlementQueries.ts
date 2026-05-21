/**
 * Settlement queries + mutations — pairwise debts, group settlements list,
 * and create / update / delete mutations that invalidate related caches.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    CreateSettlementDto,
    UpdateSettlementDto,
} from '@cost-share/shared';
import {
    createSettlement,
    deleteSettlement,
    fetchGroupPairwiseDebts,
    fetchSettlements,
    updateSettlement,
} from '../../services/settlements.service';
import { fetchBalanceSummary } from '../../services/users.service';
import { queryKeys } from './keys';

export function useGroupPairwiseDebtsQuery(
    groupId: string,
    options?: { enabled?: boolean },
) {
    return useQuery({
        queryKey: queryKeys.groupPairwiseDebts(groupId),
        queryFn: () => fetchGroupPairwiseDebts(groupId),
        enabled: Boolean(groupId) && (options?.enabled ?? true),
    });
}

export function useGroupSettlementsQuery(groupId: string) {
    return useQuery({
        queryKey: queryKeys.groupSettlements(groupId),
        queryFn: () => fetchSettlements(groupId),
        enabled: Boolean(groupId),
    });
}

function useInvalidateAfterSettlementChange(groupId: string) {
    const queryClient = useQueryClient();
    return () => {
        void queryClient.invalidateQueries({
            queryKey: queryKeys.groupPairwiseDebts(groupId),
        });
        void queryClient.invalidateQueries({
            queryKey: queryKeys.groupSettlements(groupId),
        });
        void queryClient.invalidateQueries({
            queryKey: queryKeys.groupContributions(groupId),
        });
        void queryClient.invalidateQueries({
            queryKey: queryKeys.groupSimplifiedDebtsByCurrency(groupId),
        });
        void queryClient.invalidateQueries({ queryKey: queryKeys.activity });
        void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
        void fetchBalanceSummary();
    };
}

export function useCreateSettlementMutation(groupId: string) {
    const invalidate = useInvalidateAfterSettlementChange(groupId);
    return useMutation({
        mutationFn: (dto: CreateSettlementDto) => createSettlement(dto),
        onSuccess: invalidate,
    });
}

export function useUpdateSettlementMutation(groupId: string) {
    const invalidate = useInvalidateAfterSettlementChange(groupId);
    return useMutation({
        mutationFn: ({ id, dto }: { id: string; dto: UpdateSettlementDto }) =>
            updateSettlement(id, dto),
        onSuccess: invalidate,
    });
}

export function useDeleteSettlementMutation(groupId: string) {
    const invalidate = useInvalidateAfterSettlementChange(groupId);
    return useMutation({
        mutationFn: (id: string) => deleteSettlement(id),
        onSuccess: invalidate,
    });
}
