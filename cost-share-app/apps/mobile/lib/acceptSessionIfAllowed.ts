import type { Session } from '@supabase/supabase-js';
import { assertProfileActiveWithTimeout } from './auth';
import { clearStaleAuthSession } from './authSessionLifecycle';
import { signalDeactivatedAccount } from './signalDeactivatedAccount';
import { hydrateCurrentUserProfile } from '../services/users.service';

export type SessionAcceptMode = 'fresh' | 'hydration';

export interface AcceptSessionDeps {
    setSession: (session: Session | null) => void;
    setPendingDeactivationNotice: (value: boolean) => void;
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

    const hydration = await hydrateCurrentUserProfile(nextSession.user.id);
    if (hydration === 'deactivated') {
        void signalDeactivatedAccount(setPendingDeactivationNotice);
        await clearStaleAuthSession();
        setSession(null);
        return;
    }

    setSession(nextSession);
}
