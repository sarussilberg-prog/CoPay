import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
    fetchRecentActivity,
    ACTIVITY_INITIAL_PAGE_SIZE,
    ACTIVITY_PAGE_SIZE,
} from '../../services/activity.service';
import { queryClient } from '../../lib/queryClient';
import { useAppStore } from '../../store';
import { queryKeys } from './keys';

const ACTIVITY_STALE_MS = 60_000;

function buildActivityQueryOptions(
    groupIds: string[],
    userId?: string,
    groups: Array<{ id: string; name: string }> = [],
) {
    const groupNamesById = Object.fromEntries(
        groups.map((group) => [group.id, group.name]),
    );

    return {
        queryKey: queryKeys.activityFeed(groupIds),
        queryFn: ({ pageParam }: { pageParam?: string }) =>
            fetchRecentActivity({
                before: pageParam,
                limit: pageParam ? ACTIVITY_PAGE_SIZE : ACTIVITY_INITIAL_PAGE_SIZE,
                userId,
                groupIds: groupIds.length > 0 ? groupIds : undefined,
                groupNamesById: groupIds.length > 0 ? groupNamesById : undefined,
            }),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (lastPage: Awaited<ReturnType<typeof fetchRecentActivity>>) =>
            lastPage.nextCursor,
        staleTime: ACTIVITY_STALE_MS,
    };
}

export function useActivityQuery() {
    const currentUser = useAppStore((state) => state.currentUser);
    const groups = useAppStore((state) => state.groups);
    const groupIds = useMemo(() => groups.map((group) => group.id), [groups]);

    return useInfiniteQuery({
        ...buildActivityQueryOptions(groupIds, currentUser?.id, groups),
        enabled: Boolean(currentUser?.id),
    });
}

export function prefetchActivityFeed(): Promise<void> {
    const { currentUser, groups } = useAppStore.getState();
    if (!currentUser?.id) {
        return Promise.resolve();
    }

    const groupIds = groups.map((group) => group.id);
    const options = buildActivityQueryOptions(groupIds, currentUser.id, groups);
    const existing = queryClient.getQueryState(options.queryKey);
    if (
        existing?.dataUpdatedAt &&
        Date.now() - existing.dataUpdatedAt < ACTIVITY_STALE_MS
    ) {
        return Promise.resolve();
    }

    return queryClient.prefetchInfiniteQuery(options);
}
