import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { fetchDashboard } from '../../services/dashboard.service';
import { queryKeys } from './keys';

export const DASHBOARD_STALE_MS = 60_000;

export function useDashboardQuery() {
    return useQuery({
        queryKey: queryKeys.dashboard,
        queryFn: fetchDashboard,
        // Stale-while-revalidate: show persisted dashboard instantly on cold
        // boot, refetch in the background to reconcile drift. Without this,
        // the screen showed full-skeleton on every entry because data was
        // either missing or stale.
        staleTime: 0,
        refetchOnMount: 'always',
        refetchOnWindowFocus: false,
        placeholderData: keepPreviousData,
    });
}
