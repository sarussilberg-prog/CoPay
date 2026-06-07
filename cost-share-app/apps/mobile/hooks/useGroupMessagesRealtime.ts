/**
 * useGroupMessagesRealtime — subscribes to postgres_changes on group_messages
 * filtered by group_id while the screen is mounted. Writes through the React
 * Query cache; idempotent upsert-by-id. On SUBSCRIBED, invalidates the query
 * so any missed events get reconciled.
 */

import { useEffect, useId } from 'react';
import * as Sentry from '@sentry/react-native';
import { supabase } from '../lib/supabase';
import { groupMessageFromRow, type GroupMessage } from '@cost-share/shared';
import { queryClient } from '../lib/queryClient';
import { SENTRY_TAGS } from '../lib/sentryTags';
import { queryKeys } from './queries/keys';

function upsertMessageInCache(groupId: string, message: GroupMessage): void {
    queryClient.setQueryData<GroupMessage[]>(
        queryKeys.groupMessages(groupId),
        (prev) => {
            const list = prev ?? [];
            const idx = list.findIndex((m) => m.id === message.id);
            if (idx >= 0) {
                return list.map((m) => (m.id === message.id ? message : m));
            }
            return [message, ...list];
        },
    );
}

function removeMessageFromCache(groupId: string, messageId: string): void {
    queryClient.setQueryData<GroupMessage[]>(
        queryKeys.groupMessages(groupId),
        (prev) => (prev ?? []).filter((m) => m.id !== messageId),
    );
}

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
                (payload: {
                    eventType: string;
                    new?: Record<string, unknown>;
                    old?: Record<string, unknown>;
                }) => {
                    try {
                        if (payload.eventType === 'INSERT' && payload.new) {
                            const msg = groupMessageFromRow(payload.new);
                            if (!msg.isDeleted) {
                                upsertMessageInCache(groupId, msg);
                            }
                            return;
                        }
                        if (payload.eventType === 'UPDATE' && payload.new) {
                            const msg = groupMessageFromRow(payload.new);
                            if (msg.isDeleted) {
                                removeMessageFromCache(groupId, msg.id);
                            } else {
                                upsertMessageInCache(groupId, msg);
                            }
                            return;
                        }
                        if (payload.eventType === 'DELETE' && payload.old) {
                            const oldId = payload.old.id as string | undefined;
                            if (oldId) {
                                removeMessageFromCache(groupId, oldId);
                            }
                        }
                    } catch (err) {
                        Sentry.captureException(err, {
                            tags: { tag: SENTRY_TAGS.REALTIME_ECHO },
                        });
                    }
                },
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    void queryClient.invalidateQueries({
                        queryKey: queryKeys.groupMessages(groupId),
                    });
                }
            });

        return () => {
            void channel.unsubscribe();
            void supabase.removeChannel(channel);
        };
    }, [groupId, instanceId]);
}
