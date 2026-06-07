/**
 * useInviteLink — single entry point for any invite-link UI.
 * - With no groupId → the current user's friend invite.
 * - With groupId → that group's invite.
 *
 * Exposes a ready URL plus share() and rotate(). rotate() shows
 * a confirmation Alert before making the network call.
 */

import { useCallback, useMemo } from 'react';
import { platformAlert } from '../lib/platformAlert';
import { useTranslation } from 'react-i18next';
import { showSuccessMessage } from '../lib/appToast';
import { handleError } from '../lib/handleError';
import { useAppStore } from '../store';
import { queryClient } from '../lib/queryClient';
import { queryKeys } from './queries/keys';
import type { GroupWithMembers } from '@cost-share/shared';
import {
    buildInviteUrl,
    rotateFriendInvite,
    rotateGroupInvite,
    shareFriendInvite,
    shareGroupInvite,
} from '../services/invite.service';

export interface UseInviteLinkResult {
    url: string;
    isReady: boolean;
    share: () => Promise<void>;
    rotate: () => Promise<void>;
}

export function useInviteLink(groupId?: string): UseInviteLinkResult {
    const { t } = useTranslation();
    const user = useAppStore(s => s.currentUser);
    const cachedGroups =
        queryClient.getQueryData<GroupWithMembers[]>(queryKeys.groups) ?? [];
    const group = groupId
        ? cachedGroups.find(g => g.id === groupId) ?? null
        : null;

    const kind: 'friend' | 'group' = groupId ? 'group' : 'friend';
    const token = groupId ? group?.inviteToken : user?.inviteToken;

    const url = useMemo(
        () => (token ? buildInviteUrl(kind, token) : ''),
        [kind, token],
    );

    const share = useCallback(async () => {
        try {
            if (groupId) await shareGroupInvite(groupId);
            else await shareFriendInvite();
        } catch (err) {
            handleError(err, {
                toast: { titleKey: 'common.error' },
                tags: { service: 'invite', op: 'share', kind: groupId ? 'group' : 'friend' },
                extra: { groupId },
            });
        }
    }, [groupId]);

    const rotate = useCallback(async () => {
        const titleKey = groupId ? 'invite.group.rotateConfirmTitle' : 'invite.friend.rotateConfirmTitle';
        const bodyKey = groupId ? 'invite.group.rotateConfirmBody' : 'invite.friend.rotateConfirmBody';
        const successKey = groupId ? 'invite.group.rotated' : 'invite.friend.rotated';
        const okKey = 'common.ok';
        const cancelKey = 'common.cancel';

        return new Promise<void>((resolve) => {
            platformAlert(
                t(titleKey),
                t(bodyKey),
                [
                    { text: t(cancelKey), style: 'cancel', onPress: () => resolve() },
                    {
                        text: t(okKey),
                        style: 'destructive',
                        onPress: async () => {
                            try {
                                if (groupId) await rotateGroupInvite(groupId);
                                else await rotateFriendInvite();
                                showSuccessMessage(successKey);
                            } catch (err) {
                                handleError(err, {
                                    toast: { titleKey: 'common.networkError' },
                                    tags: { service: 'invite', op: 'rotate', kind: groupId ? 'group' : 'friend' },
                                    extra: { groupId },
                                });
                            } finally {
                                resolve();
                            }
                        },
                    },
                ],
            );
        });
    }, [groupId, t]);

    return {
        url,
        isReady: Boolean(token),
        share,
        rotate,
    };
}
