/**
 * Warm the user dashboard query as soon as the user is signed in,
 * so the Profile tab renders from cache instead of waiting on mount.
 */

import { fetchDashboard } from '../../services/dashboard.service';
import { queryClient } from '../../lib/queryClient';
import { useAppStore } from '../../store';
import { queryKeys } from './keys';
import { DASHBOARD_STALE_MS } from './useDashboardQuery';

let prefetchInFlight: Promise<void> | null = null;

export function prefetchDashboard(): void {
    const { currentUser } = useAppStore.getState();
    if (!currentUser?.id) return;

    if (prefetchInFlight) return;

    const existing = queryClient.getQueryState(queryKeys.dashboard);
    if (
        existing?.dataUpdatedAt &&
        Date.now() - existing.dataUpdatedAt < DASHBOARD_STALE_MS
    ) {
        return;
    }

    prefetchInFlight = queryClient
        .prefetchQuery({
            queryKey: queryKeys.dashboard,
            queryFn: fetchDashboard,
            staleTime: DASHBOARD_STALE_MS,
        })
        .catch(err => {
            console.error('prefetchDashboard failed:', err);
        })
        .finally(() => {
            prefetchInFlight = null;
        });
}
