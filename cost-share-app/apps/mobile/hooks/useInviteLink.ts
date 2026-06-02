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
import Toast from 'react-native-toast-message';
import { useAppStore } from '../store';
import {
    buildInviteUrl,
    rotateFriendInvite,
    rotateGroupInvite,
    shareFriendInvite,
    shareGroupInvite,
} from '../services/invite.service';
import i18n from '../i18n';

export interface UseInviteLinkResult {
    url: string;
    isReady: boolean;
    share: () => Promise<void>;
    rotate: () => Promise<void>;
}

export function useInviteLink(groupId?: string): UseInviteLinkResult {
    const { t } = useTranslation();
    const user = useAppStore(s => s.currentUser);
    const group = useAppStore(s => (groupId ? s.groups.find(g => g.id === groupId) : null));

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
            console.error('Invite share failed:', err);
            Toast.show({ type: 'error', text1: i18n.t('common.error') });
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
                                Toast.show({ type: 'success', text1: t(successKey) });
                            } catch (err) {
                                console.error('Invite rotation failed:', err);
                                Toast.show({ type: 'error', text1: t('common.networkError') });
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
