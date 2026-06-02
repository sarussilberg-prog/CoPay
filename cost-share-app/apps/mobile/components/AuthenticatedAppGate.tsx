import React, { useCallback, useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { AppNavigator } from '../navigation/AppNavigator';
import { OnboardingCreateGroupScreen } from '../screens/onboarding/OnboardingCreateGroupScreen';
import {
    hasCompletedPostLoginOnboarding,
    markPostLoginOnboardingComplete,
} from '../lib/onboardingStorage';
import { fetchGroups } from '../services/groups.service';
import { colors } from '../theme';

type GateState = 'loading' | 'create' | 'main';

export function AuthenticatedAppGate() {
    const [gate, setGate] = useState<GateState>('loading');

    const resolveGate = useCallback(async () => {
        if (await hasCompletedPostLoginOnboarding()) {
            setGate('main');
            return;
        }
        try {
            const groups = await fetchGroups();
            if (groups.length > 0) {
                await markPostLoginOnboardingComplete();
                setGate('main');
                return;
            }
        } catch {
            setGate('main');
            return;
        }
        setGate('create');
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
