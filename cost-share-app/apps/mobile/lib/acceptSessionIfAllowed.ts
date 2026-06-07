import type { Session } from '@supabase/supabase-js';
import { onlineManager } from '@tanstack/react-query';
import { assertProfileActiveWithTimeout } from './auth';
import { clearStaleAuthSession } from './authSessionLifecycle';
import { signalDeactivatedAccount } from './signalDeactivatedAccount';
import { wipePersistedCache } from './persistQueryClient';
import { hydrateCurrentUserProfile } from '../services/users.service';
import { useAppStore } from '../store';

export type SessionAcceptMode = 'fresh' | 'hydration';

export interface AcceptSessionDeps {
    setSession: (session: Session | null) => void;
    setPendingDeactivationNotice: (value: boolean) => void;
}

const HYDRATE_PROFILE_TIMEOUT_MS = 4000;

function hydrateProfileWithTimeout(
    userId: string,
): Promise<Awaited<ReturnType<typeof hydrateCurrentUserProfile>>> {
    return new Promise((resolve) => {
        const t = setTimeout(() => resolve('unknown'), HYDRATE_PROFILE_TIMEOUT_MS);
        hydrateCurrentUserProfile(userId).then(
            (result) => {
                clearTimeout(t);
                resolve(result);
            },
            () => {
                clearTimeout(t);
                resolve('unknown');
            },
        );
    });
}

/**
 * Verify a session is allowed before committing it to the app store.
 *
 * - mode = 'fresh': the session just came in from an OAuth callback or
 *   `onAuthStateChange` SIGNED_IN event. The user has not yet been let into
 *   the app, so we fail-CLOSED — anything other than 'active' rejects.
 * - mode = 'hydration': we're reloading a previously-issued session on app
 *   cold-start. The session was already validated when issued, so we
 *   fail-OPEN on 'unknown' (offline / RPC failure) to avoid booting
 *   returning users who just opened the app on a flaky network.
 */
export async function acceptSessionIfAllowed(
    nextSession: Session | null,
    mode: SessionAcceptMode,
    deps: AcceptSessionDeps,
): Promise<void> {
    const { setSession, setPendingDeactivationNotice } = deps;

    if (!nextSession) {
        setSession(null);
        return;
    }

    const status = await assertProfileActiveWithTimeout();

    if (status === 'deactivated' || (status === 'unknown' && mode === 'fresh')) {
        void signalDeactivatedAccount(setPendingDeactivationNotice);
        await clearStaleAuthSession();
        setSession(null);
        return;
    }

    // Profile hydration: on cold-boot ('hydration'), currentUser is already
    // restored from disk by the Zustand persist middleware — we don't need a
    // server fetch to render the app, so we skip when offline OR fire-and-
    // forget when online (the rest of the app can proceed immediately while
    // the profile refresh happens in the background). On fresh sign-in we
    // still await the fetch so account-deactivation can be detected before
    // the user is let into the main UI.
    if (mode === 'hydration') {
        const haveCachedProfile = useAppStore.getState().currentUser != null;
        if (haveCachedProfile || !onlineManager.isOnline()) {
            // Best-effort background refresh; never blocks boot. The catch
            // handles any rejection so a transient network failure during
            // resume can't leave a hanging promise.
            void hydrateProfileWithTimeout(nextSession.user.id).then((result) => {
                if (result === 'deactivated') {
                    void signalDeactivatedAccount(setPendingDeactivationNotice);
                    void clearStaleAuthSession();
                    setSession(null);
                }
            });
        } else {
            // First-ever hydration without a cached profile + online: still
            // bounded by the timeout so a slow connection doesn't strand us.
            const hydration = await hydrateProfileWithTimeout(nextSession.user.id);
            if (hydration === 'deactivated') {
                void signalDeactivatedAccount(setPendingDeactivationNotice);
                await clearStaleAuthSession();
                setSession(null);
                return;
            }
        }
    } else {
        // mode === 'fresh': new sign-in. Bounded fetch, fail-closed on
        // deactivation so a deleted account can't get in.
        const hydration = await hydrateProfileWithTimeout(nextSession.user.id);
        if (hydration === 'deactivated') {
            void signalDeactivatedAccount(setPendingDeactivationNotice);
            await clearStaleAuthSession();
            setSession(null);
            return;
        }
    }

    // Fresh sign-in wipes any anon/previous-user persisted cache. On 'hydration'
    // (cold-boot restoring an existing session) we keep what restoreClient just
    // brought back from disk — that's the instant-load path.
    if (mode === 'fresh') {
        await wipePersistedCache();
    }
    setSession(nextSession);
}
