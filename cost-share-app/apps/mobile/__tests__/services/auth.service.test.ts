const mockExchangeCodeForSession = jest.fn();
const mockSignInWithOAuth = jest.fn();
const mockSignOut = jest.fn().mockResolvedValue({ error: null });
const mockOpenAuthSessionAsync = jest.fn();
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
            signInWithOAuth: (...args: unknown[]) => mockSignInWithOAuth(...args),
            signOut: (...args: unknown[]) => mockSignOut(...args),
        },
    },
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

jest.mock('../../lib/groupFeedCache', () => ({
    clearGroupFeedHydration: jest.fn(),
}));

jest.mock('expo-auth-session', () => ({
    makeRedirectUri: (...args: unknown[]) => mockMakeRedirectUri(...args),
}));

jest.mock('expo-web-browser', () => ({
    maybeCompleteAuthSession: jest.fn(),
    openAuthSessionAsync: (...args: unknown[]) => mockOpenAuthSessionAsync(...args),
}));

import { queryClient } from '../../lib/queryClient';
import {
    getAuthRedirectUri,
    handleAuthRedirectUrl,
    isAuthCallbackUrl,
    signInWithGoogle,
    signOut,
} from '../../services/auth.service';

describe('auth.service', () => {
    beforeEach(async () => {
        jest.clearAllMocks();
        mockMakeRedirectUri.mockReturnValue('com.kupa.mobile://auth/callback');
        mockExchangeCodeForSession.mockResolvedValue({ error: null });
        mockSignOut.mockResolvedValue({ error: null });
        mockClearStaleAuthSession.mockResolvedValue(undefined);
        mockAssertProfileActiveWithTimeout.mockResolvedValue('active');
        mockIsAuthSessionAllowed.mockResolvedValue(true);
        await signOut();
    });

    describe('getAuthRedirectUri', () => {
        it('uses native scheme redirect on iOS', () => {
            expect(getAuthRedirectUri()).toBe('com.kupa.mobile://auth/callback');
        });
    });

    describe('isAuthCallbackUrl', () => {
        it('detects OAuth callback URLs', () => {
            expect(isAuthCallbackUrl('com.kupa.mobile://auth/callback?code=abc')).toBe(true);
            expect(isAuthCallbackUrl('https://kupa.pro/?code=abc')).toBe(true);
            expect(isAuthCallbackUrl('https://kupa.pro/auth/callback?code=abc')).toBe(true);
            expect(isAuthCallbackUrl('com.kupa.mobile://invite/i/token')).toBe(false);
        });
    });

    describe('handleAuthRedirectUrl', () => {
        it('exchanges auth code even when a session already exists', async () => {
            const result = await handleAuthRedirectUrl('com.kupa.mobile://auth/callback?code=new-code');

            expect(mockExchangeCodeForSession).toHaveBeenCalledWith('new-code');
            expect(result.error).toBeNull();
        });

        it('deduplicates concurrent exchanges for the same code', async () => {
            mockExchangeCodeForSession.mockImplementation(
                () => new Promise((resolve) => setTimeout(() => resolve({ error: null }), 20)),
            );

            const first = handleAuthRedirectUrl('com.kupa.mobile://auth/callback?code=same');
            const second = handleAuthRedirectUrl('com.kupa.mobile://auth/callback?code=same');

            await Promise.all([first, second]);
            expect(mockExchangeCodeForSession).toHaveBeenCalledTimes(1);
        });

        it('returns the cached result on later calls with the same code', async () => {
            mockExchangeCodeForSession.mockResolvedValueOnce({ error: null });

            const first = await handleAuthRedirectUrl('com.kupa.mobile://auth/callback?code=cached');
            // Even after the original promise settles, a delayed deep-link
            // delivery hits the cache instead of re-exchanging the code.
            const second = await handleAuthRedirectUrl('com.kupa.mobile://auth/callback?code=cached');

            expect(mockExchangeCodeForSession).toHaveBeenCalledTimes(1);
            expect(first.error).toBeNull();
            expect(second.error).toBeNull();
        });

        it('returns account_deleted when the profile is deactivated after OAuth exchange', async () => {
            mockIsAuthSessionAllowed.mockResolvedValueOnce(false);

            const { error } = await handleAuthRedirectUrl('com.kupa.mobile://auth/callback?code=deleted-user');

            expect(error?.code).toBe('account_deleted');
            expect(mockIsAuthSessionAllowed).toHaveBeenCalled();
        });
    });

    describe('handleAuthRedirectUrl — discriminated errors', () => {
        it('returns code=account_deleted when underlying error mentions email_was_deleted', async () => {
            mockExchangeCodeForSession.mockResolvedValue({
                error: { message: 'AuthApiError: email_was_deleted' },
            });

            const { error } = await handleAuthRedirectUrl('com.kupa.mobile://auth/callback?code=abc');

            expect(error).not.toBeNull();
            expect(error!.code).toBe('account_deleted');
            expect(error!.message).toContain('email_was_deleted');
        });

        it('returns code=account_deleted when user is banned', async () => {
            mockExchangeCodeForSession.mockResolvedValue({
                error: { message: 'User is banned' },
            });

            const { error } = await handleAuthRedirectUrl('com.kupa.mobile://auth/callback?code=banned');

            expect(error?.code).toBe('account_deleted');
        });

        it('returns code=generic for any other error', async () => {
            mockExchangeCodeForSession.mockResolvedValue({
                error: { message: 'invalid_grant' },
            });

            const { error } = await handleAuthRedirectUrl('com.kupa.mobile://auth/callback?code=xyz');

            expect(error?.code).toBe('generic');
            expect(error?.message).toContain('invalid_grant');
        });
    });

    describe('signInWithGoogle', () => {
        it('requests account selection and uses an ephemeral browser session', async () => {
            mockSignInWithOAuth.mockResolvedValue({
                data: { url: 'https://accounts.google.com/o/oauth2/auth' },
                error: null,
            });
            mockOpenAuthSessionAsync.mockResolvedValue({
                type: 'success',
                url: 'com.kupa.mobile://auth/callback?code=abc',
            });

            const result = await signInWithGoogle();

            expect(mockSignInWithOAuth).toHaveBeenCalledWith({
                provider: 'google',
                options: expect.objectContaining({
                    redirectTo: 'com.kupa.mobile://auth/callback',
                    skipBrowserRedirect: true,
                    queryParams: { prompt: 'select_account' },
                }),
            });
            expect(mockOpenAuthSessionAsync).toHaveBeenCalledWith(
                'https://accounts.google.com/o/oauth2/auth',
                'com.kupa.mobile://auth/callback',
                { preferEphemeralSession: true },
            );
            expect(result.error).toBeNull();
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
            expect(mockClearStaleAuthSession).toHaveBeenCalled();
            expect(mockSetSession).toHaveBeenCalledWith(null);
        });
    });
});
