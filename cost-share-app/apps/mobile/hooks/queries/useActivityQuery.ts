import { useInfiniteQuery } from '@tanstack/react-query';
import { fetchRecentActivity } from '../../services/activity.service';
import { queryKeys } from './keys';

export function useActivityQuery() {
    return useInfiniteQuery({
        queryKey: queryKeys.activity,
        queryFn: ({ pageParam }) => fetchRecentActivity({ before: pageParam }),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
    });
}
