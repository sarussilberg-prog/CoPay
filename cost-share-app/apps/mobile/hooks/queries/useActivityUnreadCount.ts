import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store';
import { queryKeys } from './keys';

const UNREAD_STALE_MS = 30_000;

async function fetchActivityUnreadCount(): Promise<number> {
    const { data, error } = await supabase.rpc('get_activity_unread_count');
    if (error) {
        console.error('Failed to fetch activity unread count:', error);
        return 0;
    }
    return typeof data === 'number' ? data : 0;
}

export function useActivityUnreadCount() {
    const currentUserId = useAppStore(s => s.currentUser?.id);
    return useQuery({
        queryKey: queryKeys.activityUnreadCount,
        queryFn: fetchActivityUnreadCount,
        enabled: Boolean(currentUserId),
        staleTime: UNREAD_STALE_MS,
    });
}
