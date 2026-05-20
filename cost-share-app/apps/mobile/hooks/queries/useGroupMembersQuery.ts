import { useQuery } from '@tanstack/react-query';
import { getGroupMembers } from '../../services/groups.service';
import { queryKeys } from './keys';

export function useGroupMembersQuery(groupId: string) {
    return useQuery({
        queryKey: queryKeys.groupMembers(groupId),
        queryFn: () => getGroupMembers(groupId),
        enabled: Boolean(groupId),
        staleTime: 60_000,
    });
}
