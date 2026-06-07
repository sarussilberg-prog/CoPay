import { useQuery } from '@tanstack/react-query';
import { fetchGroups } from '../../services/groups.service';
import { queryKeys } from './keys';

export function useGroupsQuery() {
    return useQuery({
        queryKey: queryKeys.groups,
        queryFn: () => fetchGroups(),
        // staleTime: 0 + refetchOnMount: 'always' = stale-while-revalidate.
        // The screen renders the persisted cache instantly on cold boot, and
        // a background refetch reconciles any drift (e.g., changes made on
        // another device while this one was offline). Realtime keeps the
        // cache fresh after the initial reconcile.
        staleTime: 0,
        refetchOnMount: 'always',
        refetchOnWindowFocus: false,
        retry: false,
    });
}
