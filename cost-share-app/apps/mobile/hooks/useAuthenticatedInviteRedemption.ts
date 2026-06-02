/**
 * Invite redemption while authenticated but outside NavigationContainer
 * (e.g. post-login onboarding create screen). Defers navigation via pendingNavigation.
 */

import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../store';
import {
    parseIncomingUrl,
    handleInviteLink,
} from '../services/deepLinks.service';
import { isAuthCallbackUrl } from '../services/auth.service';

type Options = {
    /** Called after a group invite is redeemed (user now has a group). */
    onGroupRedeemed?: () => void;
};

export function useAuthenticatedInviteRedemption({ onGroupRedeemed }: Options = {}): void {
    const incomingUrl = Linking.useURL();
    const queryClient = useQueryClient();
    const session = useAppStore(s => s.session);
    const pendingInvite = useAppStore(s => s.pendingInvite);
    const setPendingInvite = useAppStore(s => s.setPendingInvite);

    useEffect(() => {
        if (!incomingUrl || !session) return;
        if (isAuthCallbackUrl(incomingUrl)) return;
        const link = parseIncomingUrl(incomingUrl);
        if (link.kind === 'unknown') return;

        void handleInviteLink(link, null, queryClient).then(result => {
            if (result?.kind === 'group') onGroupRedeemed?.();
        });
    }, [incomingUrl, session, queryClient, onGroupRedeemed]);

    useEffect(() => {
        if (!session || !pendingInvite) return;
        void handleInviteLink(pendingInvite, null, queryClient)
            .then(result => {
                if (result?.kind === 'group') onGroupRedeemed?.();
            })
            .finally(() => {
                setPendingInvite(null);
            });
    }, [session, pendingInvite, queryClient, setPendingInvite, onGroupRedeemed]);
}
