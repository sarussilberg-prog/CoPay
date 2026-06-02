import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    clearOnboardingFlags,
    hasCompletedPreLoginOnboarding,
    hasCompletedPostLoginOnboarding,
    markPreLoginOnboardingComplete,
    markPostLoginOnboardingComplete,
} from '../../lib/onboardingStorage';

describe('onboardingStorage', () => {
    beforeEach(async () => {
        await AsyncStorage.clear();
    });

    it('starts with pre and post incomplete', async () => {
        expect(await hasCompletedPreLoginOnboarding()).toBe(false);
        expect(await hasCompletedPostLoginOnboarding()).toBe(false);
    });

    it('persists pre-login completion', async () => {
        await markPreLoginOnboardingComplete();
        expect(await hasCompletedPreLoginOnboarding()).toBe(true);
        expect(await hasCompletedPostLoginOnboarding()).toBe(false);
    });

    it('persists post-login completion', async () => {
        await markPostLoginOnboardingComplete();
        expect(await hasCompletedPostLoginOnboarding()).toBe(true);
    });

    it('clearOnboardingFlags resets both', async () => {
        await markPreLoginOnboardingComplete();
        await markPostLoginOnboardingComplete();
        await clearOnboardingFlags();
        expect(await hasCompletedPreLoginOnboarding()).toBe(false);
        expect(await hasCompletedPostLoginOnboarding()).toBe(false);
    });
});
