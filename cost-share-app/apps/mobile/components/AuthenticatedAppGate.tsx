import React, { useCallback, useEffect, useState } from 'react';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { onlineManager } from '@tanstack/react-query';
import type { GroupWithMembers } from '@cost-share/shared';
import { AppNavigator } from '../navigation/AppNavigator';
import { navigationIntegration } from '../lib/sentry';
import { OnboardingCreateGroupScreen } from '../screens/onboarding/OnboardingCreateGroupScreen';
import {
    hasCompletedPostLoginOnboarding,
    markPostLoginOnboardingComplete,
} from '../lib/onboardingStorage';
import {
    resolveAuthenticatedGateTarget,
    shouldMarkPostOnboardingAfterGroups,
} from '../lib/authenticatedGateResolve';
import { useAuthenticatedInviteRedemption } from '../hooks/useAuthenticatedInviteRedemption';
import { fetchGroups } from '../services/groups.service';
import { useAvatarPrefetcher } from '../hooks/useAvatarPrefetcher';
import { queryClient } from '../lib/queryClient';
import { queryKeys } from '../hooks/queries/keys';
import { AppGateSkeleton } from './skeletons/AppGateSkeleton';

/**
 * Hard ceiling on how long resolveGate will wait for fetchGroups before
 * giving up and falling through to the main app. Supabase calls can hang
 * indefinitely on flaky / offline connections, and a hung gate means the
 * user stares at the skeleton forever.
 */
const GATE_FETCH_TIMEOUT_MS = 4000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('gate fetch timeout')), ms);
        promise.then(
            (v) => {
                clearTimeout(t);
                resolve(v);
            },
            (err) => {
                clearTimeout(t);
                reject(err);
            },
        );
    });
}

type GateState = 'loading' | 'create' | 'main';

export function AuthenticatedAppGate() {
    const [gate, setGate] = useState<GateState>('loading');
    const navigationRef = useNavigationContainerRef();

    const enterMainAfterGroupInvite = useCallback(async () => {
        await markPostLoginOnboardingComplete();
        setGate('main');
    }, []);

    useAuthenticatedInviteRedemption({ onGroupRedeemed: () => void enterMainAfterGroupInvite() });

    // Cache every avatar URL the app knows about into the OS image cache so
    // member/friend/group avatars render instantly and work offline. Single
    // mount, debounced, deduped — runs for the whole authenticated session.
    useAvatarPrefetcher();

    const resolveGate = useCallback(async () => {
        const postOnboardingComplete = await hasCompletedPostLoginOnboarding();
        if (postOnboardingComplete) {
            setGate('main');
            return;
        }

        // If we have ANY cached groups, the user is clearly past onboarding —
        // no need to hit the network. This is the fast offline path.
        const cachedGroups =
            queryClient.getQueryData<GroupWithMembers[]>(queryKeys.groups) ?? [];
        if (cachedGroups.length > 0) {
            await markPostLoginOnboardingComplete();
            setGate('main');
            return;
        }

        // No cached groups + offline → fall through to the main app. The
        // GroupsListScreen will show its empty state with a create CTA.
        // Better UX than getting stuck on the skeleton, and the user can
        // still browse the rest of the app from cache.
        if (!onlineManager.isOnline()) {
            setGate('main');
            return;
        }

        // Online — try fetchGroups but never block on it. If Supabase hangs
        // (poor connectivity, etc.) we still resolve the gate within the
        // timeout instead of stranding the user.
        let groupsCount = 0;
        let fetchFailed = false;
        try {
            const groups = await withTimeout(fetchGroups(), GATE_FETCH_TIMEOUT_MS);
            groupsCount = groups.length;
        } catch {
            fetchFailed = true;
        }

        const input = { postOnboardingComplete, groupsCount, fetchFailed };
        if (shouldMarkPostOnboardingAfterGroups(input)) {
            await markPostLoginOnboardingComplete();
        }
        setGate(resolveAuthenticatedGateTarget(input));
    }, []);

    useEffect(() => {
        void resolveGate();
    }, [resolveGate]);

    if (gate === 'loading') {
        return <AppGateSkeleton />;
    }

    if (gate === 'create') {
        return <OnboardingCreateGroupScreen onDone={() => setGate('main')} />;
    }

    return (
        <NavigationContainer
            ref={navigationRef}
            onReady={() => navigationIntegration.registerNavigationContainer(navigationRef)}
        >
            <AppNavigator />
        </NavigationContainer>
    );
}
