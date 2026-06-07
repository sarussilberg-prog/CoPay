import { useQuery } from '@tanstack/react-query';
import { fetchExpenses } from '../../services/expenses.service';
import { queryKeys } from './keys';

export function useGroupExpensesQuery(groupId: string) {
    return useQuery({
        queryKey: queryKeys.groupExpenses(groupId),
        queryFn: () => fetchExpenses(groupId),
        enabled: Boolean(groupId),
        // Stale-while-revalidate: render cached data instantly, refetch in
        // the background so a possibly-stale persisted [] from a prior
        // session gets reconciled. Realtime keeps it fresh after that.
        staleTime: 0,
        refetchOnMount: 'always',
        refetchOnWindowFocus: false,
    });
}
