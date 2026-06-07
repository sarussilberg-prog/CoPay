/**
 * Deep Link Service — parses incoming URLs (Universal Links and the custom
 * scheme) and dispatches the appropriate redeem flow.
 *
 * Auth-callback URLs are intentionally NOT handled here; they continue to
 * flow through services/auth.service.ts.
 */

import { APP_WEB_HOST } from '@cost-share/shared';
import { NavigationProp } from '@react-navigation/native';
import { showAppToast, showInfoToast } from '../lib/appToast';
import { handleError } from '../lib/handleError';
import { QueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryKeys } from '../hooks/queries/keys';
import { useAppStore } from '../store';

export type InviteRedemptionResult =
    | { kind: 'friend' }
    | { kind: 'group'; groupId: string };

export type InviteLink =
    | { kind: 'friend'; token: string }
    | { kind: 'group'; token: string }
    | { kind: 'unknown' };

const TOKEN_RE = /^[A-Za-z0-9_-]{10}$/;

export function parseIncomingUrl(rawUrl: string): InviteLink {
    if (!rawUrl) return { kind: 'unknown' };

    let parsed: URL;
    try {
        parsed = new URL(rawUrl);
    } catch {
        return { kind: 'unknown' };
    }

    // https://<APP_WEB_HOST>/i/<token> | /g/<token>
    if (parsed.protocol === 'https:' && parsed.hostname === APP_WEB_HOST) {
        const m = parsed.pathname.match(/^\/(i|g)\/([^/?#]+)\/?$/);
        if (m && TOKEN_RE.test(m[2])) {
            return m[1] === 'i'
                ? { kind: 'friend', token: m[2] }
                : { kind: 'group', token: m[2] };
        }
    }

    // com.kupay.mobile://invite/i/<token> | /g/<token>
    if (parsed.protocol === 'com.kupay.mobile:' && parsed.hostname === 'invite') {
        const m = parsed.pathname.match(/^\/(i|g)\/([^/?#]+)\/?$/);
        if (m && TOKEN_RE.test(m[2])) {
            return m[1] === 'i'
                ? { kind: 'friend', token: m[2] }
                : { kind: 'group', token: m[2] };
        }
    }

    return { kind: 'unknown' };
}

function navigateAfterFriendInvite(navigation: NavigationProp<any> | null): void {
    if (navigation) {
        (navigation.navigate as any)('Profile', { screen: 'Friends' });
        return;
    }
    useAppStore.getState().setPendingNavigation({ target: 'friends' });
}

function navigateAfterGroupInvite(
    navigation: NavigationProp<any> | null,
    groupId: string,
): void {
    if (navigation) {
        (navigation.navigate as any)('Groups', {
            screen: 'GroupDetail',
            params: { groupId },
        });
        return;
    }
    useAppStore.getState().setPendingNavigation({ target: 'groupDetail', groupId });
}

export async function handleInviteLink(
    link: InviteLink,
    navigation: NavigationProp<any> | null,
    queryClient: QueryClient,
): Promise<InviteRedemptionResult | null> {
    if (link.kind === 'unknown') return null;

    if (link.kind === 'friend') {
        const { data, error } = await supabase.rpc('redeem_friend_invite', { p_token: link.token });
        if (error) {
            handleRedemptionError(error, 'friend');
            return null;
        }
        const payload = data as { friend_id: string; friend_name: string };
        showAppToast({
            type: 'success',
            titleKey: 'invite.redemption.friendSuccess',
            titleParams: { name: payload.friend_name },
        });
        void queryClient.invalidateQueries({ queryKey: queryKeys.friends });
        void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
        navigateAfterFriendInvite(navigation);
        return { kind: 'friend' };
    }

    const { data, error } = await supabase.rpc('redeem_group_invite', { p_token: link.token });
    if (error) {
        handleRedemptionError(error, 'group');
        return null;
    }
    const payload = data as { group_id: string; group_name: string; already_member: boolean };
    showAppToast({
        type: 'success',
        titleKey: payload.already_member
            ? 'invite.redemption.alreadyMember'
            : 'invite.redemption.groupSuccess',
        titleParams: payload.already_member ? undefined : { groupName: payload.group_name },
    });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    void queryClient.invalidateQueries({ queryKey: ['groups'] });
    navigateAfterGroupInvite(navigation, payload.group_id);
    return { kind: 'group', groupId: payload.group_id };
}

function handleRedemptionError(error: { message: string }, kind: 'friend' | 'group'): void {
    const message = error.message;
    // cannot_self_invite is pure UX guidance, not a bug — info toast, no Sentry.
    if (message.includes('cannot_self_invite')) {
        showInfoToast('invite.redemption.selfInvite');
        return;
    }
    if (message.includes('invite_not_found')) {
        handleError(error, {
            toast: { titleKey: 'invite.redemption.invalid' },
            tags: { service: 'deepLinks', op: 'redeem', kind, reason: 'invite_not_found' },
        });
        return;
    }
    handleError(error, {
        toast: {
            titleKey: 'common.networkError',
            messageKey: kind === 'friend' ? 'invite.friend.title' : 'invite.group.title',
        },
        tags: { service: 'deepLinks', op: 'redeem', kind },
    });
}
