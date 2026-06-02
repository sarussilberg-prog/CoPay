/**
 * Invite Service — builds invite URLs, opens the OS share sheet,
 * rotates tokens. Reads invite tokens from the current user / group;
 * writes via SECURITY DEFINER RPCs.
 */

import i18n from '../i18n';
import { shareTextMessage } from '../lib/platformShare';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store';

const INVITE_HOST = 'https://kupa.pro';

export function buildInviteUrl(kind: 'friend' | 'group', token: string): string {
    const prefix = kind === 'friend' ? '/i/' : '/g/';
    return `${INVITE_HOST}${prefix}${token}`;
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
    const group = useAppStore.getState().groups.find(g => g.id === groupId);
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
    const state = useAppStore.getState();
    const group = state.groups.find(g => g.id === groupId);
    if (group) {
        state.updateGroup({ ...group, inviteToken: newToken });
    }
    return newToken;
}

