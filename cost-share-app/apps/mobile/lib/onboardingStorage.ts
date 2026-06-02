import AsyncStorage from '@react-native-async-storage/async-storage';

const PRE_KEY = '@onboarding_pre_v1_complete';
const POST_KEY = '@onboarding_post_v1_complete';

export async function hasCompletedPreLoginOnboarding(): Promise<boolean> {
    const value = await AsyncStorage.getItem(PRE_KEY);
    return value === 'true';
}

export async function markPreLoginOnboardingComplete(): Promise<void> {
    await AsyncStorage.setItem(PRE_KEY, 'true');
}

export async function hasCompletedPostLoginOnboarding(): Promise<boolean> {
    const value = await AsyncStorage.getItem(POST_KEY);
    return value === 'true';
}

export async function markPostLoginOnboardingComplete(): Promise<void> {
    await AsyncStorage.setItem(POST_KEY, 'true');
}

/** Test / dev helper — not used in production UI */
export async function clearOnboardingFlags(): Promise<void> {
    await AsyncStorage.multiRemove([PRE_KEY, POST_KEY]);
}
