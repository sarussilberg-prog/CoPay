/**
 * Scans every avatar source in the app and ensures each is cached to disk
 * keyed by `(kind, id)`. Replaces the OS-level Image.prefetch approach,
 * which was opaque and not reliably available offline.
 *
 * Single mount at AuthenticatedAppGate. Subscribes to the React Query cache
 * and the Zustand store; rescans on every change (debounced) and lets the
 * cache layer dedupe per identity. When a user's avatar URL changes (they
 * upload a new picture), the next scan sees the new URL, the cache notices
 * the difference, downloads it, and overwrites the single file on disk.
 */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
    GroupWithMembers,
    User,
    UserDashboard,
} from '@cost-share/shared';
import { useAppStore } from '../store';
import { prefetchAvatar } from '../lib/avatarCache';
import { queryKeys } from './queries/keys';

const DEBOUNCE_MS = 250;

function scanAndPrefetch(client: ReturnType<typeof useQueryClient>): void {
    // currentUser (signed-in profile) — held in Zustand, not React Query.
    const me = useAppStore.getState().currentUser;
    if (me?.id && me.avatarUrl) {
        void prefetchAvatar({ kind: 'user', id: me.id, url: me.avatarUrl });
    }

    // Groups list: per-group cover image + each member's avatar (keyed by userId).
    const groups =
        client.getQueryData<GroupWithMembers[]>(queryKeys.groups) ?? [];
    for (const g of groups) {
        if (g.imageUrl) {
            void prefetchAvatar({ kind: 'group', id: g.id, url: g.imageUrl });
        }
        for (const m of g.members ?? []) {
            if (m.userId && m.avatarUrl) {
                void prefetchAvatar({
                    kind: 'user',
                    id: m.userId,
                    url: m.avatarUrl,
                });
            }
        }
    }

    // Per-group user profiles (includes former members).
    const groupUsersQueries = client
        .getQueryCache()
        .findAll({ queryKey: ['groupUsers'] });
    for (const q of groupUsersQueries) {
        const users = q.state.data as User[] | undefined;
        if (!users) continue;
        for (const u of users) {
            if (u.id && u.avatarUrl) {
                void prefetchAvatar({ kind: 'user', id: u.id, url: u.avatarUrl });
            }
        }
    }

    // Dashboard friends.
    const dashboard = client.getQueryData<UserDashboard>(queryKeys.dashboard);
    for (const f of dashboard?.friends ?? []) {
        if (f.userId && f.avatarUrl) {
            void prefetchAvatar({
                kind: 'user',
                id: f.userId,
                url: f.avatarUrl,
            });
        }
    }

    // Friends list (`['friends']` key).
    const friendsList = client.getQueryData<
        Array<{ userId?: string; id?: string; avatarUrl?: string }>
    >(queryKeys.friends);
    for (const f of friendsList ?? []) {
        const id = f.userId ?? f.id;
        if (id && f.avatarUrl) {
            void prefetchAvatar({ kind: 'user', id, url: f.avatarUrl });
        }
    }
}

export function useAvatarPrefetcher(): void {
    const client = useQueryClient();
    useEffect(() => {
        let pending: ReturnType<typeof setTimeout> | null = null;
        const flush = () => {
            pending = null;
            scanAndPrefetch(client);
        };
        const schedule = () => {
            if (pending !== null) return;
            pending = setTimeout(flush, DEBOUNCE_MS);
        };

        // Initial pass covers any data already restored from disk.
        flush();

        const unsubQueryCache = client.getQueryCache().subscribe(schedule);
        const unsubStore = useAppStore.subscribe(schedule);

        return () => {
            if (pending !== null) clearTimeout(pending);
            unsubQueryCache();
            unsubStore();
        };
    }, [client]);
}
