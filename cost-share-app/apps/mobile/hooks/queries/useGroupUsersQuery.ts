import { useQuery } from '@tanstack/react-query';
import { fetchGroupUsers } from '../../services/users.service';
import { queryKeys } from './keys';

export function useGroupUsersQuery(groupId: string) {
    return useQuery({
        queryKey: queryKeys.groupUsers(groupId),
        queryFn: () => fetchGroupUsers(groupId),
        enabled: Boolean(groupId),
    });
}
