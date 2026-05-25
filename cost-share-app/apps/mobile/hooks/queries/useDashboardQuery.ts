import { useQuery } from '@tanstack/react-query';
import { fetchDashboard } from '../../services/dashboard.service';
import { queryKeys } from './keys';

export const DASHBOARD_STALE_MS = 60_000;

export function useDashboardQuery() {
    return useQuery({
        queryKey: queryKeys.dashboard,
        queryFn: fetchDashboard,
        staleTime: DASHBOARD_STALE_MS,
    });
}
