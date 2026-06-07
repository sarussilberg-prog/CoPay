const mockExchangeCodeForSession = jest.fn();
const mockSignInWithIdToken = jest.fn();
const mockSignInWithOAuth = jest.fn();
const mockSignOut = jest.fn().mockResolvedValue({ error: null });
const mockSignOutNativeGoogle = jest.fn().mockResolvedValue(undefined);
const mockOpenAuthSessionAsync = jest.fn();
const mockOpenOAuthSession = jest.fn();
let mockPlatformOs: 'ios' | 'android' | 'web' = 'ios';
const mockMakeRedirectUri = jest.fn();

jest.mock('expo-constants', () => ({
    __esModule: true,
    default: { expoConfig: { hostUri: '192.168.1.10:8081' } },
    ExecutionEnvironment: { StoreClient: 'storeClient', Standalone: 'standalone' },
}));

jest.mock('../../lib/supabase', () => ({
    supabase: {
        auth: {
            exchangeCodeForSession: (...args: unknown[]) => mockExchangeCodeForSession(...args),
            signInWithIdToken: (...args: unknown[]) => mockSignInWithIdToken(...args),
            signInWithOAuth: (...args: unknown[]) => mockSignInWithOAuth(...args),
            signOut: (...args: unknown[]) => mockSignOut(...args),
        },
    },
}));

jest.mock('../../lib/googleSignInNative', () => ({
    signOutNativeGoogle: (...args: unknown[]) => mockSignOutNativeGoogle(...args),
}));

jest.mock('../../lib/openOAuthSession', () => ({
    openOAuthSession: (...args: unknown[]) => mockOpenOAuthSession(...args),
}));

const mockClearStaleAuthSession = jest.fn().mockResolvedValue(undefined);
const mockSetSession = jest.fn();

jest.mock('../../lib/authSessionLifecycle', () => ({
    clearStaleAuthSession: (...args: unknown[]) => mockClearStaleAuthSession(...args),
}));

jest.mock('../../store', () => ({
    useAppStore: {
        getState: () => ({ setSession: mockSetSession }),
    },
}));

const mockAssertProfileActiveWithTimeout = jest.fn().mockResolvedValue('active');
const mockIsAuthSessionAllowed = jest.fn().mockResolvedValue(true);

jest.mock('../../lib/auth', () => ({
    assertProfileActiveWithTimeout: (...args: unknown[]) => mockAssertProfileActiveWithTimeout(...args),
    isAuthSessionAllowed: (...args: unknown[]) => mockIsAuthSessionAllowed(...args),
}));

jest.mock('../../lib/queryClient', () => ({
    queryClient: { clear: jest.fn() },
}));

jest.mock('expo-auth-session', () => ({
    makeRedirectUri: (...args: unknown[]) => mockMakeRedirectUri(...args),
}));

jest.mock('expo-web-browser', () => ({
    maybeCompleteAuthSession: jest.fn(),
    openAuthSessionAsync: (...args: unknown[]) => mockOpenAuthSessionAsync(...args),
}));

import { Platform } from 'react-native';
import { queryClient } from '../../lib/queryClient';
import {
    getAuthRedirectUri,
    handleAuthRedirectUrl,
    isAuthCallbackUrl,
    signInWithGoogle,
    signOut,
} from '../../services/auth.service';

function setPlatformOs(os: 'ios' | 'android' | 'web') {
    mockPlatformOs = os;
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => mockPlatformOs });
}

function setWebLocationOrigin(origin: string | undefined) {
    Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: origin ? { origin } : undefined,
    });
}

describe('auth.service', () => {
    beforeEach(async () => {
        jest.clearAllMocks();
        setPlatformOs('ios');
        mockMakeRedirectUri.mockReturnValue('com.kupay.mobile://auth/callback');
        mockExchangeCodeForSession.mockResolvedValue({ error: null });
        mockSignOut.mockResolvedValue({ error: null });
        mockClearStaleAuthSession.mockResolvedValue(undefined);
        mockAssertProfileActiveWithTimeout.mockResolvedValue('active');
        mockIsAuthSessionAllowed.mockResolvedValue(true);
        await signOut();
    });

    describe('getAuthRedirectUri', () => {
        const previousWebAppUrl = process.env.EXPO_PUBLIC_WEB_APP_URL;

        afterEach(() => {
            if (previousWebAppUrl === undefined) {
                delete process.env.EXPO_PUBLIC_WEB_APP_URL;
            } else {
                process.env.EXPO_PUBLIC_WEB_APP_URL = previousWebAppUrl;
            }
            // @ts-expect-error test cleanup
            delete globalThis.location;
        });

        it('uses native scheme redirect on dev/production builds', () => {
            expect(getAuthRedirectUri()).toBe('com.kupay.mobile://auth/callback');
            expect(mockMakeRedirectUri).not.toHaveBeenCalled();
        });

        it('uses localhost origin on web even when EXPO_PUBLIC_WEB_APP_URL is set', () => {
            process.env.EXPO_PUBLIC_WEB_APP_URL = 'https://kupa-s1lb.vercel.app';
            setPlatformOs('web');
            setWebLocationOrigin('http://localhost:8081');

            expect(getAuthRedirectUri()).toBe('http://localhost:8081/auth/callback');
        });

        it('uses the current tab origin on deployed web', () => {
            setPlatformOs('web');
            setWebLocationOrigin('https://kupa-s1lb.vercel.app');

            expect(getAuthRedirectUri()).toBe('https://kupa-s1lb.vercel.app/auth/callback');
        });

        it('falls back to EXPO_PUBLIC_WEB_APP_URL on web when location is unavailable', () => {
            process.env.EXPO_PUBLIC_WEB_APP_URL = 'https://kupa.pro';
            setPlatformOs('web');
            setWebLocationOrigin(undefined);

            expect(getAuthRedirectUri()).toBe('https://kupa.pro/auth/callback');
        });
    });

    describe('isAuthCallbackUrl', () => {
        it('detects OAuth callback URLs', () => {
            expect(isAuthCallbackUrl('com.kupay.mobile://auth/callback?code=abc')).toBe(true);
            expect(isAuthCallbackUrl('https://kupa.pro/?code=abc')).toBe(true);
            expect(isAuthCallbackUrl('https://kupa.pro/auth/callback?code=abc')).toBe(true);
            expect(isAuthCallbackUrl('com.kupay.mobile://invite/i/token')).toBe(false);
        });
    });

    describe('handleAuthRedirectUrl', () => {
        it('exchanges auth code even when a session already exists', async () => {
            const result = await handleAuthRedirectUrl('com.kupay.mobile://auth/callback?code=new-code');

            expect(mockExchangeCodeForSession).toHaveBeenCalledWith('new-code');
            expect(result.error).toBeNull();
        });

        it('deduplicates concurrent exchanges for the same code', async () => {
            mockExchangeCodeForSession.mockImplementation(
                () => new Promise((resolve) => setTimeout(() => resolve({ error: null }), 20)),
            );

            const first = handleAuthRedirectUrl('com.kupay.mobile://auth/callback?code=same');
            const second = handleAuthRedirectUrl('com.kupay.mobile://auth/callback?code=same');

            await Promise.all([first, second]);
            expect(mockExchangeCodeForSession).toHaveBeenCalledTimes(1);
        });

        it('returns the cached result on later calls with the same code', async () => {
            mockExchangeCodeForSession.mockResolvedValueOnce({ error: null });

            const first = await handleAuthRedirectUrl('com.kupay.mobile://auth/callback?code=cached');
            // Even after the original promise settles, a delayed deep-link
            // delivery hits the cache instead of re-exchanging the code.
            const second = await handleAuthRedirectUrl('com.kupay.mobile://auth/callback?code=cached');

            expect(mockExchangeCodeForSession).toHaveBeenCalledTimes(1);
            expect(first.error).toBeNull();
            expect(second.error).toBeNull();
        });

        it('returns account_deleted when the profile is deactivated after OAuth exchange', async () => {
            mockIsAuthSessionAllowed.mockResolvedValueOnce(false);

            const { error } = await handleAuthRedirectUrl('com.kupay.mobile://auth/callback?code=deleted-user');

            expect(error?.code).toBe('account_deleted');
            expect(mockIsAuthSessionAllowed).toHaveBeenCalled();
        });
    });

    describe('handleAuthRedirectUrl — discriminated errors', () => {
        it('returns code=account_deleted when underlying error mentions email_was_deleted', async () => {
            mockExchangeCodeForSession.mockResolvedValue({
                error: { message: 'AuthApiError: email_was_deleted' },
            });

            const { error } = await handleAuthRedirectUrl('com.kupay.mobile://auth/callback?code=abc');

            expect(error).not.toBeNull();
            expect(error!.code).toBe('account_deleted');
            expect(error!.message).toContain('email_was_deleted');
        });

        it('returns code=account_deleted when user is banned', async () => {
            mockExchangeCodeForSession.mockResolvedValue({
                error: { message: 'User is banned' },
            });

            const { error } = await handleAuthRedirectUrl('com.kupay.mobile://auth/callback?code=banned');

            expect(error?.code).toBe('account_deleted');
        });

        it('returns code=generic for any other error', async () => {
            mockExchangeCodeForSession.mockResolvedValue({
                error: { message: 'invalid_grant' },
            });

            const { error } = await handleAuthRedirectUrl('com.kupay.mobile://auth/callback?code=xyz');

            expect(error?.code).toBe('generic');
            expect(error?.message).toContain('invalid_grant');
        });
    });

    describe('signInWithGoogle', () => {
        it('uses partial Chrome bottom sheet OAuth on Android', async () => {
            setPlatformOs('android');
            mockSignInWithOAuth.mockResolvedValue({
                data: { url: 'https://accounts.google.com/o/oauth2/auth' },
                error: null,
            });
            mockOpenOAuthSession.mockResolvedValue({
                type: 'success',
                url: 'com.kupay.mobile://auth/callback?code=abc',
            });

            const result = await signInWithGoogle();

            expect(mockOpenOAuthSession).toHaveBeenCalledWith(
                'https://accounts.google.com/o/oauth2/auth',
                'com.kupay.mobile://auth/callback',
            );
            expect(mockOpenAuthSessionAsync).not.toHaveBeenCalled();
            expect(result.error).toBeNull();
        });

        it('uses an ephemeral browser session on iOS', async () => {
            setPlatformOs('ios');
            mockSignInWithOAuth.mockResolvedValue({
                data: { url: 'https://accounts.google.com/o/oauth2/auth' },
                error: null,
            });
            mockOpenOAuthSession.mockResolvedValue({
                type: 'success',
                url: 'com.kupay.mobile://auth/callback?code=abc',
            });

            const result = await signInWithGoogle();

            expect(mockOpenOAuthSession).toHaveBeenCalledWith(
                'https://accounts.google.com/o/oauth2/auth',
                'com.kupay.mobile://auth/callback',
            );
            expect(result.error).toBeNull();
        });

        it('returns a clear error when OAuth falls back to the web site URL', async () => {
            setPlatformOs('ios');
            mockSignInWithOAuth.mockResolvedValue({
                data: { url: 'https://accounts.google.com/o/oauth2/auth' },
                error: null,
            });
            mockOpenOAuthSession.mockResolvedValue({
                type: 'success',
                url: 'https://kupa.pro/?code=abc',
            });

            const result = await signInWithGoogle();

            expect(result.error?.code).toBe('generic');
            expect(result.error?.message).toContain('com.kupay.mobile://auth/callback');
            expect(result.error?.message).toContain('Redirect URLs');
            expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
        });
    });

    describe('signOut', () => {
        it('clears cached data, signs out globally, and resets the local session', async () => {
            jest.clearAllMocks();
            mockSignOut.mockResolvedValue({ error: null });
            mockClearStaleAuthSession.mockResolvedValue(undefined);

            await signOut();

            expect(queryClient.clear).toHaveBeenCalledTimes(1);
            expect(mockSignOut).toHaveBeenCalledWith({ scope: 'global' });
            expect(mockSignOutNativeGoogle).toHaveBeenCalled();
            expect(mockClearStaleAuthSession).toHaveBeenCalled();
            expect(mockSetSession).toHaveBeenCalledWith(null);
        });
    });
});
