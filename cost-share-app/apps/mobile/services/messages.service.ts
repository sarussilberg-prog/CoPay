/**
 * Messages Service — Supabase RPCs (get_/create_/update_/delete_group_message).
 */

import { captureError } from '../lib/captureError';
import { handleError } from '../lib/handleError';
import { GroupMessage } from '@cost-share/shared';
import { groupMessageFromRow } from '@cost-share/shared';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';
import { queryKeys } from '../hooks/queries/keys';

function upsertMessageInCache(message: GroupMessage): void {
    queryClient.setQueryData<GroupMessage[]>(
        queryKeys.groupMessages(message.groupId),
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

export async function fetchMessages(groupId: string): Promise<GroupMessage[]> {
    try {
        const { data, error } = await supabase.rpc('get_group_messages', {
            p_group_id: groupId,
            p_limit: 100,
        });
        if (error) throw error;
        const messages = ((data ?? []) as Record<string, unknown>[]).map(groupMessageFromRow);
        return messages;
    } catch (error) {
        captureError(error, {
            tags: { service: 'messages', op: 'fetch' },
            extra: { groupId },
        });
        console.error('Failed to fetch messages:', error);
        return [];
    }
}

export async function createMessage(
    groupId: string,
    body: string,
): Promise<GroupMessage | null> {
    const trimmed = body.trim();
    if (!trimmed) return null;
    try {
        const { data, error } = await supabase.rpc('create_group_message', {
            p_group_id: groupId,
            p_body: trimmed,
        });
        if (error) throw error;
        const message = groupMessageFromRow(data as Record<string, unknown>);
        upsertMessageInCache(message);
        return message;
    } catch (error) {
        handleError(error, {
            toast: { titleKey: 'groups.message.sendError', messageKey: 'common.networkError' },
            tags: { service: 'messages', op: 'create' },
            extra: { groupId, bodyLength: trimmed.length },
        });
        return null;
    }
}

export async function updateMessage(
    messageId: string,
    body: string,
): Promise<GroupMessage | null> {
    const trimmed = body.trim();
    if (!trimmed) return null;
    try {
        const { data, error } = await supabase.rpc('update_group_message', {
            p_message_id: messageId,
            p_body: trimmed,
        });
        if (error) throw error;
        const message = groupMessageFromRow(data as Record<string, unknown>);
        upsertMessageInCache(message);
        return message;
    } catch (error) {
        handleError(error, {
            toast: { titleKey: 'groups.message.sendError', messageKey: 'common.networkError' },
            tags: { service: 'messages', op: 'update' },
            extra: { messageId, bodyLength: trimmed.length },
        });
        return null;
    }
}

export async function deleteMessage(
    groupId: string,
    messageId: string,
): Promise<boolean> {
    try {
        const { error } = await supabase.rpc('delete_group_message', {
            p_message_id: messageId,
        });
        if (error) throw error;
        removeMessageFromCache(groupId, messageId);
        return true;
    } catch (error) {
        handleError(error, {
            toast: { titleKey: 'groups.message.sendError', messageKey: 'common.networkError' },
            tags: { service: 'messages', op: 'delete' },
            extra: { groupId, messageId },
        });
        return false;
    }
}
