import { Linking, Platform, Share } from 'react-native';

export const DEFAULT_SUPPORT_EMAIL = 'sarussilberg@gmail.com';

export function getSupportEmail(): string {
    const fromEnv = process.env.EXPO_PUBLIC_SUPPORT_EMAIL?.trim();
    return fromEnv || DEFAULT_SUPPORT_EMAIL;
}

function buildMailtoUrl(email: string): string {
    return `mailto:${email}?subject=${encodeURIComponent('KupaPay Support')}`;
}

export function getSupportMailtoUrl(email: string = getSupportEmail()): string {
    return buildMailtoUrl(email);
}

export async function openSupportContact(): Promise<void> {
    const email = getSupportEmail();
    const url = buildMailtoUrl(email);

    if (Platform.OS === 'web') {
        globalThis.location.href = url;
        return;
    }

    try {
        await Linking.openURL(url);
        return;
    } catch {
        // Fall through to Share, then caller Alert.
    }

    try {
        const result = await Share.share(
            Platform.OS === 'ios'
                ? { url }
                : { message: email, title: 'KupaPay Support' },
        );
        if (result.action === 'sharedAction') return;
    } catch {
        // Fall through to caller Alert.
    }

    throw new Error('contact_unavailable');
}
