/**
 * Per-group balance queries used by the rewritten BalancesScreen.
 * Both queries are invalidated by the same triggers as the existing
 * settlement queries (expense/settlement/membership change) — wire those
 * invalidations from the relevant mutation hooks.
 */

import { useQuery } from '@tanstack/react-query';
import {
    getGroupContributions,
    getGroupSimplifiedDebtsByCurrency,
} from '../../services/groups.service';
import { queryKeys } from './keys';

export function useGroupContributionsQuery(groupId: string) {
    return useQuery({
        queryKey: queryKeys.groupContributions(groupId),
        queryFn: () => getGroupContributions(groupId),
        enabled: Boolean(groupId),
    });
}

export function useGroupSimplifiedDebtsByCurrencyQuery(groupId: string) {
    return useQuery({
        queryKey: queryKeys.groupSimplifiedDebtsByCurrency(groupId),
        queryFn: () => getGroupSimplifiedDebtsByCurrency(groupId),
        enabled: Boolean(groupId),
    });
}
