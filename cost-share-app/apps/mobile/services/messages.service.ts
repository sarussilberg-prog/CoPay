/**
 * Messages Service — Supabase RPCs (get_/create_/update_/delete_group_message).
 */

import * as Sentry from '@sentry/react-native';
import { GroupMessage } from '@cost-share/shared';
import { groupMessageFromRow } from '@cost-share/shared';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store';
import Toast from 'react-native-toast-message';
import i18n from '../i18n';

export async function fetchMessages(groupId: string): Promise<GroupMessage[]> {
    try {
        const { data, error } = await supabase.rpc('get_group_messages', {
            p_group_id: groupId,
            p_limit: 100,
        });
        if (error) throw error;
        const messages = ((data ?? []) as Record<string, unknown>[]).map(groupMessageFromRow);
        useAppStore.getState().setGroupMessages(groupId, messages);
        return messages;
    } catch (error) {
        Sentry.captureException(error, {
            tags: { service: 'messages', op: 'fetch' },
            extra: { groupId },
        });
        console.error('Failed to fetch messages:', error);
        useAppStore.getState().setGroupMessages(groupId, []);
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
        useAppStore.getState().upsertGroupMessage(message);
        return message;
    } catch (error) {
        Sentry.captureException(error, {
            tags: { service: 'messages', op: 'create' },
            extra: { groupId, bodyLength: trimmed.length },
        });
        console.error('Failed to create message:', error);
        Toast.show({
            type: 'error',
            text1: i18n.t('groups.message.sendError'),
            text2: i18n.t('common.networkError'),
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
        useAppStore.getState().upsertGroupMessage(message);
        return message;
    } catch (error) {
        Sentry.captureException(error, {
            tags: { service: 'messages', op: 'update' },
            extra: { messageId, bodyLength: trimmed.length },
        });
        console.error('Failed to update message:', error);
        Toast.show({
            type: 'error',
            text1: i18n.t('groups.message.sendError'),
            text2: i18n.t('common.networkError'),
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
        useAppStore.getState().removeGroupMessage(groupId, messageId);
        return true;
    } catch (error) {
        Sentry.captureException(error, {
            tags: { service: 'messages', op: 'delete' },
            extra: { groupId, messageId },
        });
        console.error('Failed to delete message:', error);
        Toast.show({
            type: 'error',
            text1: i18n.t('groups.message.sendError'),
            text2: i18n.t('common.networkError'),
        });
        return false;
    }
}
