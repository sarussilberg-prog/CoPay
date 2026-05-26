import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    clearNavigationState,
    loadNavigationState,
    saveNavigationState,
} from '../../lib/navigationPersistence';

describe('navigationPersistence', () => {
    beforeEach(() => {
        globalThis.localStorage?.clear();
        void AsyncStorage.clear();
    });

    it('round-trips navigation state on native', async () => {
        if (Platform.OS === 'web') return;

        const state = {
            stale: false as const,
            type: 'tab',
            key: 'root',
            index: 2,
            routeNames: ['Profile', 'Activity', 'Groups'],
            routes: [],
        };

        await saveNavigationState(state);
        await expect(loadNavigationState()).resolves.toEqual(state);
        await clearNavigationState();
        await expect(loadNavigationState()).resolves.toBeUndefined();
    });

    it('round-trips navigation state on web', async () => {
        if (Platform.OS !== 'web') return;

        const state = {
            stale: false as const,
            type: 'tab',
            key: 'root',
            index: 0,
            routeNames: ['Profile'],
            routes: [],
        };

        await saveNavigationState(state);
        await expect(loadNavigationState()).resolves.toEqual(state);
        await clearNavigationState();
        await expect(loadNavigationState()).resolves.toBeUndefined();
    });
});
