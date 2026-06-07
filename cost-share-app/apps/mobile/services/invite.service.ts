/**
 * Invite Service — builds invite URLs, opens the OS share sheet,
 * rotates tokens. Reads invite tokens from the current user / group;
 * writes via SECURITY DEFINER RPCs.
 */

import { APP_WEB_ORIGIN, type GroupWithMembers } from '@cost-share/shared';
import i18n from '../i18n';
import { shareTextMessage } from '../lib/platformShare';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store';
import { queryClient } from '../lib/queryClient';
import { queryKeys } from '../hooks/queries/keys';

const INVITE_ORIGIN = (process.env.EXPO_PUBLIC_WEB_APP_URL ?? APP_WEB_ORIGIN).replace(/\/$/, '');

export function buildInviteUrl(kind: 'friend' | 'group', token: string): string {
    const prefix = kind === 'friend' ? '/i/' : '/g/';
    return `${INVITE_ORIGIN}${prefix}${token}`;
}

export function buildFriendInviteMessage(inviterName: string, url: string): string {
    return i18n.t('invite.friend.shareMessage', { inviterName, url });
}

export function buildGroupInviteMessage(
    inviterName: string,
    groupName: string,
    url: string,
): string {
    return i18n.t('invite.group.shareMessage', { inviterName, groupName, url });
}

async function openShare(message: string): Promise<void> {
    await shareTextMessage(message);
}

export async function shareFriendInvite(): Promise<void> {
    const user = useAppStore.getState().currentUser;
    if (!user || !user.inviteToken) throw new Error('no_invite_token');
    const url = buildInviteUrl('friend', user.inviteToken);
    const message = buildFriendInviteMessage(user.name, url);
    await openShare(message);
}

export async function shareGroupInvite(groupId: string): Promise<void> {
    const user = useAppStore.getState().currentUser;
    const groups = queryClient.getQueryData<GroupWithMembers[]>(queryKeys.groups) ?? [];
    const group = groups.find(g => g.id === groupId);
    if (!user) throw new Error('not_authenticated');
    if (!group || !group.inviteToken) throw new Error('group_invite_token_unavailable');
    const url = buildInviteUrl('group', group.inviteToken);
    const message = buildGroupInviteMessage(user.name, group.name, url);
    await openShare(message);
}

export async function rotateFriendInvite(): Promise<string> {
    const { data, error } = await supabase.rpc('rotate_friend_invite');
    if (error) throw error;
    const newToken = data as string;
    // Update the store in place
    const current = useAppStore.getState().currentUser;
    if (current) {
        useAppStore.getState().setCurrentUser({ ...current, inviteToken: newToken });
    }
    return newToken;
}

export async function rotateGroupInvite(groupId: string): Promise<string> {
    const { data, error } = await supabase.rpc('rotate_group_invite', { p_group_id: groupId });
    if (error) throw error;
    const newToken = data as string;
    queryClient.setQueryData<GroupWithMembers[]>(queryKeys.groups, (prev) =>
        (prev ?? []).map((g) =>
            g.id === groupId ? { ...g, inviteToken: newToken } : g,
        ),
    );
    return newToken;
}

