/**
 * Warm groups list + balance summary as soon as the user is signed in,
 * so the Groups tab renders from cache instead of waiting on mount.
 */

import { fetchGroups } from '../../services/groups.service';
import { fetchBalanceSummary } from '../../services/users.service';
import { useAppStore } from '../../store';

let prefetchInFlight: Promise<void> | null = null;

export function prefetchGroupsList(): void {
    const { currentUser } = useAppStore.getState();
    if (!currentUser?.id) return;

    if (prefetchInFlight) return;

    prefetchInFlight = Promise.all([fetchGroups(), fetchBalanceSummary()])
        .then(() => undefined)
        .catch(err => {
            console.error('prefetchGroupsList failed:', err);
        })
        .finally(() => {
            prefetchInFlight = null;
        });
}
