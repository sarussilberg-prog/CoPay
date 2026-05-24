/**
 * useUserGroupMembershipsRealtime — subscribes to postgres_changes on
 * group_members for the current user. When a membership row is inserted or
 * re-activated, refetch the groups list and balance summary so the new group
 * appears with the correct balance. When deactivated/left/deleted, drop the
 * group from the local list immediately.
 */

import { useEffect, useId } from 'react';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store';
import { fetchGroups } from '../services/groups.service';
import { fetchBalanceSummary } from '../services/users.service';

export function useUserGroupMembershipsRealtime(
    userId: string | undefined | null,
): void {
    const instanceId = useId();
    useEffect(() => {
        if (!userId) return;

        const channel = supabase
            .channel(`user_group_memberships:${userId}:${instanceId}`)
            .on(
                'postgres_changes' as never,
                {
                    event: '*',
                    schema: 'public',
                    table: 'group_members',
                    filter: `user_id=eq.${userId}`,
                },
                (payload: {
                    eventType: string;
                    new?: Record<string, unknown>;
                    old?: Record<string, unknown>;
                }) => {
                    void (async () => {
                        try {
                            const store = useAppStore.getState();

                            if (payload.eventType === 'DELETE' && payload.old) {
                                const groupId = payload.old.group_id as string | undefined;
                                if (groupId) store.removeGroup(groupId);
                                return;
                            }

                            if (
                                payload.eventType === 'UPDATE' &&
                                payload.new &&
                                payload.new.is_active === false
                            ) {
                                const groupId = payload.new.group_id as string | undefined;
                                if (groupId) store.removeGroup(groupId);
                                return;
                            }

                            if (
                                payload.eventType === 'INSERT' ||
                                (payload.eventType === 'UPDATE' &&
                                    payload.new?.is_active === true)
                            ) {
                                await fetchGroups();
                                void fetchBalanceSummary();
                            }
                        } catch (err) {
                            console.error(
                                'memberships realtime payload error:',
                                err,
                            );
                        }
                    })();
                },
            )
            .subscribe();

        return () => {
            void channel.unsubscribe();
            void supabase.removeChannel(channel);
        };
    }, [userId, instanceId]);
}
