import React, { useCallback, useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { AppNavigator } from '../navigation/AppNavigator';
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
import { colors } from '../theme';

type GateState = 'loading' | 'create' | 'main';

export function AuthenticatedAppGate() {
    const [gate, setGate] = useState<GateState>('loading');

    const enterMainAfterGroupInvite = useCallback(async () => {
        await markPostLoginOnboardingComplete();
        setGate('main');
    }, []);

    useAuthenticatedInviteRedemption({ onGroupRedeemed: () => void enterMainAfterGroupInvite() });

    const resolveGate = useCallback(async () => {
        const postOnboardingComplete = await hasCompletedPostLoginOnboarding();
        if (postOnboardingComplete) {
            setGate('main');
            return;
        }

        let groupsCount = 0;
        let fetchFailed = false;
        try {
            const groups = await fetchGroups();
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
        return (
            <View className="flex-1 justify-center items-center bg-white">
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    if (gate === 'create') {
        return <OnboardingCreateGroupScreen onDone={() => setGate('main')} />;
    }

    return (
        <NavigationContainer>
            <AppNavigator />
        </NavigationContainer>
    );
}
