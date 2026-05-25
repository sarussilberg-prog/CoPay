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
import { groupFromRow, type GroupWithMembers } from '@cost-share/shared';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store';
import { fetchGroups } from '../services/groups.service';
import { fetchBalanceSummary } from '../services/users.service';
import { queryClient } from '../lib/queryClient';
import { queryKeys } from './queries/keys';

type RealtimePayload = {
    eventType: 'INSERT' | 'UPDATE' | 'DELETE';
    new?: Record<string, unknown>;
    old?: Record<string, unknown>;
};

function snapshotRefetch(): void {
    void fetchGroups();
    void fetchBalanceSummary();
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    void queryClient.invalidateQueries({ queryKey: queryKeys.friends });
    void queryClient.invalidateQueries({ queryKey: queryKeys.friendRequestsIncoming });
    void queryClient.invalidateQueries({ queryKey: queryKeys.friendRequestsOutgoing });
}

function handleGroupsEvent(payload: RealtimePayload): void {
    const store = useAppStore.getState();

    if (payload.eventType === 'DELETE' && payload.old) {
        const oldId = payload.old.id as string | undefined;
        if (oldId) store.removeGroup(oldId);
        return;
    }

    if (payload.eventType === 'UPDATE' && payload.new) {
        const id = payload.new.id as string | undefined;
        if (!id) return;

        const isActive = payload.new.is_active !== false;
        if (!isActive) {
            store.removeGroup(id);
            return;
        }

        const existing = store.groups.find(g => g.id === id);
        if (!existing) return; // membership listener will refetch the full row

        const base = groupFromRow(payload.new);
        const merged: GroupWithMembers = {
            ...base,
            members: existing.members,
            isArchivedByMe: existing.isArchivedByMe,
            isAutoArchived: existing.isAutoArchived,
        };
        store.updateGroup(merged);
    }
    // INSERT: ignore. New groups come in via the group_members listener,
    // which refetches the full groups list with members joined.
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
                        console.error('app realtime: groups payload error:', err);
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
