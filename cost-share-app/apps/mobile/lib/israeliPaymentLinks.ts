import { Linking, Platform } from 'react-native';

export type IsraeliPaymentApp = 'bit' | 'paybox';

/** Candidate deep links, most specific first. */
const APP_URL_CANDIDATES: Record<IsraeliPaymentApp, readonly string[]> = {
    bit: ['bit://', 'bit://pay'],
    paybox: ['paybox://pay', 'paybox://', 'PayBox://pay', 'PayBox://'],
};

const STORE_URLS: Record<IsraeliPaymentApp, { ios: string; android: string }> = {
    bit: {
        ios: 'https://apps.apple.com/app/id1182007739',
        android: 'https://play.google.com/store/apps/details?id=com.bnhp.payments.paymentsapp',
    },
    paybox: {
        ios: 'https://apps.apple.com/app/id895491053',
        android: 'https://play.google.com/store/apps/details?id=com.payboxapp',
    },
};

export function isIsraeliPaymentAppAvailable(): boolean {
    return Platform.OS === 'ios' || Platform.OS === 'android';
}

async function tryOpenUrl(url: string): Promise<boolean> {
    try {
        await Linking.openURL(url);
        return true;
    } catch {
        return false;
    }
}

async function openStoreListing(app: IsraeliPaymentApp): Promise<void> {
    const storeUrl = Platform.select({
        ios: STORE_URLS[app].ios,
        android: STORE_URLS[app].android,
        default: STORE_URLS[app].ios,
    });
    if (!storeUrl) throw new Error('unsupported_platform');
    await Linking.openURL(storeUrl);
}

export async function openPaymentApp(app: IsraeliPaymentApp): Promise<void> {
    if (Platform.OS === 'web') {
        throw new Error('unsupported_platform');
    }

    for (const url of APP_URL_CANDIDATES[app]) {
        if (Platform.OS === 'ios') {
            try {
                const supported = await Linking.canOpenURL(url);
                if (supported && (await tryOpenUrl(url))) return;
            } catch {
                // Scheme not declared in LSApplicationQueriesSchemes — try direct open below.
            }
        }
        if (await tryOpenUrl(url)) return;
    }

    await openStoreListing(app);
}
