import { useQuery } from '@tanstack/react-query';
import { fetchMessages } from '../../services/messages.service';
import { queryKeys } from './keys';

export function useGroupMessagesQuery(groupId: string) {
    return useQuery({
        queryKey: queryKeys.groupMessages(groupId),
        queryFn: () => fetchMessages(groupId),
        enabled: Boolean(groupId),
        // Stale-while-revalidate: render cached messages instantly, refetch
        // in the background. Realtime keeps it fresh after the reconcile.
        staleTime: 0,
        refetchOnMount: 'always',
        refetchOnWindowFocus: false,
    });
}
