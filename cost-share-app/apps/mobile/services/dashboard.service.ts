import { UserDashboard } from '@cost-share/shared';
import { supabase } from '../lib/supabase';
import { getCurrentUserId } from '../lib/auth';
import { useAppStore } from '../store';

export async function fetchDashboard(): Promise<UserDashboard> {
    const userId = useAppStore.getState().currentUser?.id ?? (await getCurrentUserId());
    if (!userId) {
        // Throw so React Query treats this as an error and does NOT cache a
        // null result. Otherwise the cached null persists to disk and shows
        // the dashboard skeleton on every subsequent cold boot until a
        // manual refresh.
        throw new Error('fetchDashboard: no authenticated user');
    }
    const { data, error } = await supabase.rpc('get_user_dashboard', { p_user_id: userId });
    if (error) throw error;
    if (!data) throw new Error('fetchDashboard: empty response');
    return data as UserDashboard;
}
