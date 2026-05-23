import { supabase } from './supabase';
import { clearStaleAuthSession } from './authSessionLifecycle';
import { useAppStore } from '../store';

/** Returns the signed-in Supabase user id, or null if not authenticated. */
export async function getCurrentUserId(): Promise<string | null> {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
}

export type ProfileStatus = 'active' | 'deactivated' | 'missing';

export const PROFILE_CHECK_TIMEOUT_MS = 8_000;

export type AssertProfileOptions = {
    /** When false, treat errors/timeouts as deactivated (used when accepting a session). */
    failOpen?: boolean;
};

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((resolve) => {
            setTimeout(() => resolve(fallback), ms);
        }),
    ]);
}

async function revokeLocalSession(): Promise<void> {
    await clearStaleAuthSession();
    useAppStore.getState().setSession(null);
}

/**
 * Verifies the signed-in user's profile is active.
 * - 'active'      : profile exists and is_active=true (or no user is signed in — caller decides what to do).
 * - 'deactivated' : profile exists and is_active=false. Side effect: clears the local session before returning.
 * - 'missing'     : signed in but no profile row yet (first-login race with the profile-creation trigger).
 */
export async function assertProfileActive(options: AssertProfileOptions = {}): Promise<ProfileStatus> {
    const { failOpen = true } = options;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 'active';

    const { data: callerActive, error: rpcError } = await supabase.rpc('is_caller_active');

    if (!rpcError) {
        if (callerActive === false) {
            await revokeLocalSession();
            return 'deactivated';
        }
    } else {
        console.error('assertProfileActive: is_caller_active RPC failed', rpcError);
    }

    const { data, error } = await supabase
        .from('profiles')
        .select('is_active')
        .eq('id', user.id)
        .maybeSingle();

    if (error) {
        console.error('assertProfileActive: profile lookup failed', error);
        return failOpen ? 'active' : 'deactivated';
    }
    if (!data) return 'missing';
    if (data.is_active === false) {
        await revokeLocalSession();
        return 'deactivated';
    }
    return 'active';
}

/**
 * Same as assertProfileActive but bounded — prevents the app boot loader from
 * hanging forever when the profile check stalls (common on flaky web networks).
 * Fail-open on timeout by default; pass failOpen=false when accepting a session.
 */
export async function assertProfileActiveWithTimeout(
    timeoutMs = PROFILE_CHECK_TIMEOUT_MS,
    options: AssertProfileOptions = {},
): Promise<ProfileStatus> {
    const fallback: ProfileStatus = options.failOpen === false ? 'deactivated' : 'active';
    return withTimeout(assertProfileActive(options), timeoutMs, fallback);
}

/** Returns true when the current Supabase session may enter the authenticated app. */
export async function isAuthSessionAllowed(): Promise<boolean> {
    const status = await assertProfileActiveWithTimeout(PROFILE_CHECK_TIMEOUT_MS, { failOpen: false });
    return status === 'active' || status === 'missing';
}
