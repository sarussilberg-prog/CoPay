import { type QueryClient, onlineManager } from '@tanstack/react-query';
import * as Sentry from '@sentry/react-native';
import { queryKeys } from '../hooks/queries/keys';
import { isPendingExpenseId } from './pendingExpense';
import { SENTRY_TAGS } from './sentryTags';

interface ZombieRecord {
    groupId: string;
    pendingId: string;
}

/**
 * Removes any pending_<uuid> expense row that has no live mutation in the
 * queue. Exported for tests. Returns the rows that were removed so triggers
 * can log them.
 */
export function sweepZombiePendingRows(client: QueryClient): ZombieRecord[] {
    const removed: ZombieRecord[] = [];

    const queries = client.getQueryCache().findAll({ queryKey: ['groupExpenses'] });
    const liveKeys = new Set(
        client
            .getMutationCache()
            .findAll({ mutationKey: ['addExpense'] })
            .map((m) => m.options.mutationKey?.[1])
            .filter((id): id is string => typeof id === 'string'),
    );

    for (const q of queries) {
        const data = q.state.data as Array<{ id: string }> | undefined;
        if (!data) continue;
        const groupId = q.queryKey[1] as string | undefined;
        if (!groupId) continue;

        const next = data.filter((e) => {
            if (!isPendingExpenseId(e.id)) return true;
            if (liveKeys.has(e.id)) return true;
            removed.push({ groupId, pendingId: e.id });
            return false;
        });
        if (next.length !== data.length) {
            client.setQueryData(queryKeys.groupExpenses(groupId), next);
        }
    }

    for (const record of removed) {
        Sentry.captureMessage('zombie pending row removed', {
            level: 'warning',
            tags: { tag: SENTRY_TAGS.SWEEP_ZOMBIE },
            extra: { ...record },
        });
    }

    return removed;
}

export function sweepIfOnline(client: QueryClient): void {
    if (!onlineManager.isOnline()) return;
    sweepZombiePendingRows(client);
}
