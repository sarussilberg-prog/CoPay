/**
 * Scans the React Query cache + Zustand store for every avatar URL and
 * prefetches them into the native image cache, so they're available offline.
 *
 * Single mount at AuthenticatedAppGate. Subscribes to the query cache and the
 * Zustand store; rescans on every change (debounced) but only ever fires
 * Image.prefetch for URLs we haven't already seen this session (see
 * lib/avatarPrefetch).
 */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
    GroupWithMembers,
    User,
    UserDashboard,
} from '@cost-share/shared';
import { useAppStore } from '../store';
import { prefetchAvatarUrls } from '../lib/avatarPrefetch';
import { queryKeys } from './queries/keys';

const DEBOUNCE_MS = 250;

function collectAvatarUrls(client: ReturnType<typeof useQueryClient>): string[] {
    const urls = new Set<string>();

    // currentUser (signed-in profile) — held in Zustand, not React Query.
    const me = useAppStore.getState().currentUser;
    if (me?.avatarUrl) urls.add(me.avatarUrl);

    // Groups list: per-group cover image + each member's avatar.
    const groups =
        client.getQueryData<GroupWithMembers[]>(queryKeys.groups) ?? [];
    for (const g of groups) {
        if (g.imageUrl) urls.add(g.imageUrl);
        for (const m of g.members ?? []) {
            if (m.avatarUrl) urls.add(m.avatarUrl);
        }
    }

    // Per-group user profiles (includes former members the group still
    // references). Iterates every cached `groupUsers` entry.
    const groupUsersQueries = client
        .getQueryCache()
        .findAll({ queryKey: ['groupUsers'] });
    for (const q of groupUsersQueries) {
        const users = q.state.data as User[] | undefined;
        if (!users) continue;
        for (const u of users) {
            if (u.avatarUrl) urls.add(u.avatarUrl);
        }
    }

    // Profile dashboard friends.
    const dashboard = client.getQueryData<UserDashboard>(queryKeys.dashboard);
    for (const f of dashboard?.friends ?? []) {
        if (f.avatarUrl) urls.add(f.avatarUrl);
    }

    // Friends list (separate query keyed under `friends`).
    const friendsQuery = client.getQueryData<Array<{ avatarUrl?: string }>>(
        queryKeys.friends,
    );
    for (const f of friendsQuery ?? []) {
        if (f.avatarUrl) urls.add(f.avatarUrl);
    }

    return Array.from(urls);
}

export function useAvatarPrefetcher(): void {
    const client = useQueryClient();
    useEffect(() => {
        let pending: ReturnType<typeof setTimeout> | null = null;
        const flush = () => {
            pending = null;
            prefetchAvatarUrls(collectAvatarUrls(client));
        };
        const schedule = () => {
            if (pending !== null) return;
            pending = setTimeout(flush, DEBOUNCE_MS);
        };

        // Initial pass — covers data restored from disk before any subscription.
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
