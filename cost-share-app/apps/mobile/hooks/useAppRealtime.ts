/**
 * useAppRealtime — single app-level Supabase channel that keeps user-level
 * data (groups metadata, memberships, friends, friend requests, per-user
 * archive) live across all screens.
 *
 * Mounted once at the App root after authentication, identified by userId.
 * Per-group high-volume streams (expenses/settlements/messages) stay on
 * their own per-screen hooks.
 *
 * On (re)subscribe we run a one-shot snapshot refetch so any events missed
 * while disconnected are reconciled.
 */

import { useEffect } from 'react';
import * as Sentry from '@sentry/react-native';
import { groupFromRow, type GroupWithMembers } from '@cost-share/shared';
import { supabase } from '../lib/supabase';
import { fetchBalanceSummary } from '../services/users.service';
import { queryClient } from '../lib/queryClient';
import { sweepIfOnline } from '../lib/zombieSweep';
import { SENTRY_TAGS } from '../lib/sentryTags';
import { queryKeys } from './queries/keys';

type RealtimePayload = {
    eventType: 'INSERT' | 'UPDATE' | 'DELETE';
    new?: Record<string, unknown>;
    old?: Record<string, unknown>;
};

function snapshotRefetch(): void {
    void queryClient.invalidateQueries({ queryKey: queryKeys.groups });
    void fetchBalanceSummary();
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    void queryClient.invalidateQueries({ queryKey: queryKeys.friends });
    void queryClient.invalidateQueries({ queryKey: queryKeys.friendRequestsIncoming });
    void queryClient.invalidateQueries({ queryKey: queryKeys.friendRequestsOutgoing });
    void queryClient.invalidateQueries({ queryKey: queryKeys.activity });
    void queryClient.invalidateQueries({ queryKey: queryKeys.activityUnreadCount });
    sweepIfOnline(queryClient);
}

const ACTIVITY_INVALIDATE_DEBOUNCE_MS = 500;
let activityInvalidateTimer: ReturnType<typeof setTimeout> | null = null;
function invalidateActivityDebounced(): void {
    if (activityInvalidateTimer) clearTimeout(activityInvalidateTimer);
    activityInvalidateTimer = setTimeout(() => {
        activityInvalidateTimer = null;
        void queryClient.invalidateQueries({ queryKey: queryKeys.activity });
    }, ACTIVITY_INVALIDATE_DEBOUNCE_MS);
}

/**
 * Pure, idempotent group-event applier — exported for tests. Upserts by id;
 * applying the same UPDATE twice yields the same cache. INSERT is ignored
 * here because the membership listener does a full refetch when joins land.
 */
export function applyGroupsRealtimeEventToCache(
    client: typeof queryClient,
    payload: RealtimePayload,
): void {
    if (payload.eventType === 'DELETE' && payload.old) {
        const oldId = payload.old.id as string | undefined;
        if (!oldId) return;
        client.setQueryData<GroupWithMembers[]>(queryKeys.groups, (prev) =>
            (prev ?? []).filter((g) => g.id !== oldId),
        );
        return;
    }

    if (payload.eventType === 'UPDATE' && payload.new) {
        const id = payload.new.id as string | undefined;
        if (!id) return;
        const isActive = payload.new.is_active !== false;

        client.setQueryData<GroupWithMembers[]>(queryKeys.groups, (prev) => {
            const list = prev ?? [];
            const existing = list.find((g) => g.id === id);

            if (!isActive) {
                return list.filter((g) => g.id !== id);
            }
            if (!existing) {
                // Membership listener will refetch with members joined.
                return list;
            }

            const base = groupFromRow(payload.new!);
            const merged: GroupWithMembers = {
                ...base,
                members: existing.members,
                isArchivedByMe: existing.isArchivedByMe,
                isAutoArchived: existing.isAutoArchived,
            };
            return list.map((g) => (g.id === id ? merged : g));
        });
    }
    // INSERT: ignored — membership listener performs full refetch.
}

function handleGroupsEvent(payload: RealtimePayload): void {
    try {
        applyGroupsRealtimeEventToCache(queryClient, payload);
    } catch (err) {
        Sentry.captureException(err, { tags: { tag: SENTRY_TAGS.REALTIME_ECHO } });
    }
}

function handleMembershipEvent(payload: RealtimePayload): void {
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });

    if (payload.eventType === 'DELETE' && payload.old) {
        const groupId = payload.old.group_id as string | undefined;
        if (groupId) {
            queryClient.setQueryData<GroupWithMembers[]>(queryKeys.groups, (prev) =>
                (prev ?? []).filter((g) => g.id !== groupId),
            );
        }
        return;
    }

    if (
        payload.eventType === 'UPDATE' &&
        payload.new &&
        payload.new.is_active === false
    ) {
        const groupId = payload.new.group_id as string | undefined;
        if (groupId) {
            queryClient.setQueryData<GroupWithMembers[]>(queryKeys.groups, (prev) =>
                (prev ?? []).filter((g) => g.id !== groupId),
            );
        }
        return;
    }

    if (
        payload.eventType === 'INSERT' ||
        (payload.eventType === 'UPDATE' && payload.new?.is_active === true)
    ) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.groups });
        void fetchBalanceSummary();
    }
}

function handleFriendshipsEvent(): void {
    void queryClient.invalidateQueries({ queryKey: queryKeys.friends });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
}

function handleFriendRequestsEvent(): void {
    void queryClient.invalidateQueries({ queryKey: queryKeys.friendRequestsIncoming });
    void queryClient.invalidateQueries({ queryKey: queryKeys.friendRequestsOutgoing });
}

function applyArchiveEventToCache(payload: RealtimePayload): void {
    if (payload.eventType === 'INSERT' && payload.new) {
        const groupId = payload.new.group_id as string | undefined;
        if (!groupId) return;
        queryClient.setQueryData<GroupWithMembers[]>(queryKeys.groups, (prev) =>
            (prev ?? []).map((g) =>
                g.id === groupId ? { ...g, isArchivedByMe: true } : g,
            ),
        );
        return;
    }

    if (payload.eventType === 'DELETE' && payload.old) {
        const groupId = payload.old.group_id as string | undefined;
        if (!groupId) return;
        queryClient.setQueryData<GroupWithMembers[]>(queryKeys.groups, (prev) =>
            (prev ?? []).map((g) =>
                g.id === groupId ? { ...g, isArchivedByMe: false } : g,
            ),
        );
        return;
    }
    // UPDATE: not expected (rows are existence-based); ignore.
}

function handleArchiveEvent(payload: RealtimePayload): void {
    try {
        applyArchiveEventToCache(payload);
    } catch (err) {
        Sentry.captureException(err, { tags: { tag: SENTRY_TAGS.REALTIME_ECHO } });
    }
}

export function useAppRealtime(userId: string | undefined | null): void {
    useEffect(() => {
        if (!userId) return;

        const channel = supabase
            .channel(`app:user:${userId}`)
            .on(
                'postgres_changes' as never,
                { event: '*', schema: 'public', table: 'groups' },
                (payload: RealtimePayload) => {
                    try {
                        handleGroupsEvent(payload);
                    } catch (err) {
                        Sentry.captureException(err, { tags: { tag: SENTRY_TAGS.REALTIME_ECHO } });
                    }
                },
            )
            .on(
                'postgres_changes' as never,
                {
                    event: '*',
                    schema: 'public',
                    table: 'group_members',
                    filter: `user_id=eq.${userId}`,
                },
                (payload: RealtimePayload) => {
                    try {
                        handleMembershipEvent(payload);
                    } catch (err) {
                        Sentry.captureException(err, { tags: { tag: SENTRY_TAGS.REALTIME_ECHO } });
                    }
                },
            )
            .on(
                'postgres_changes' as never,
                { event: '*', schema: 'public', table: 'friendships' },
                () => {
                    try {
                        handleFriendshipsEvent();
                    } catch (err) {
                        Sentry.captureException(err, { tags: { tag: SENTRY_TAGS.REALTIME_ECHO } });
                    }
                },
            )
            .on(
                'postgres_changes' as never,
                { event: '*', schema: 'public', table: 'friend_requests' },
                () => {
                    try {
                        handleFriendRequestsEvent();
                    } catch (err) {
                        Sentry.captureException(err, { tags: { tag: SENTRY_TAGS.REALTIME_ECHO } });
                    }
                },
            )
            .on(
                'postgres_changes' as never,
                {
                    event: '*',
                    schema: 'public',
                    table: 'group_user_archive',
                    filter: `user_id=eq.${userId}`,
                },
                (payload: RealtimePayload) => {
                    try {
                        handleArchiveEvent(payload);
                    } catch (err) {
                        Sentry.captureException(err, { tags: { tag: SENTRY_TAGS.REALTIME_ECHO } });
                    }
                },
            )
            .on(
                'postgres_changes' as never,
                {
                    event: '*',
                    schema: 'public',
                    table: 'activity_events',
                    filter: `user_id=eq.${userId}`,
                },
                () => {
                    try {
                        invalidateActivityDebounced();
                        void queryClient.invalidateQueries({ queryKey: queryKeys.activityUnreadCount });
                    } catch (err) {
                        Sentry.captureException(err, { tags: { tag: SENTRY_TAGS.REALTIME_ECHO } });
                    }
                },
            )
            .subscribe(status => {
                if (status === 'SUBSCRIBED') {
                    snapshotRefetch();
                }
            });

        return () => {
            void channel.unsubscribe();
            void supabase.removeChannel(channel);
        };
    }, [userId]);
}
