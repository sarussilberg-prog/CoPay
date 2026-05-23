/**
 * useGroupMessagesRealtime — subscribes to postgres_changes on group_messages
 * filtered by group_id while the screen is mounted.
 */

import { useEffect, useId } from 'react';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store';
import { groupMessageFromRow } from '@cost-share/shared';

export function useGroupMessagesRealtime(groupId: string | undefined | null): void {
    const instanceId = useId();
    useEffect(() => {
        if (!groupId) return;

        const channel = supabase
            .channel(`group_messages:${groupId}:${instanceId}`)
            .on(
                'postgres_changes' as never,
                {
                    event: '*',
                    schema: 'public',
                    table: 'group_messages',
                    filter: `group_id=eq.${groupId}`,
                },
                (payload: { eventType: string; new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
                    try {
                        if (payload.eventType === 'INSERT' && payload.new) {
                            const msg = groupMessageFromRow(payload.new);
                            if (!msg.isDeleted) {
                                useAppStore.getState().upsertGroupMessage(msg);
                            }
                            return;
                        }
                        if (payload.eventType === 'UPDATE' && payload.new) {
                            const msg = groupMessageFromRow(payload.new);
                            if (msg.isDeleted) {
                                useAppStore.getState().removeGroupMessage(groupId, msg.id);
                            } else {
                                useAppStore.getState().upsertGroupMessage(msg);
                            }
                            return;
                        }
                        if (payload.eventType === 'DELETE' && payload.old) {
                            const oldId = payload.old.id as string | undefined;
                            if (oldId) {
                                useAppStore.getState().removeGroupMessage(groupId, oldId);
                            }
                        }
                    } catch (err) {
                        console.error('realtime payload error:', err);
                    }
                },
            )
            .subscribe();

        return () => {
            void channel.unsubscribe();
            void supabase.removeChannel(channel);
        };
    }, [groupId, instanceId]);
}
