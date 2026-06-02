import { acceptSessionIfAllowed } from '../../lib/acceptSessionIfAllowed';
import type { Session } from '@supabase/supabase-js';

const mockAssertProfileActive = jest.fn();
const mockHydrateProfile = jest.fn();
const mockClearStaleAuthSession = jest.fn().mockResolvedValue(undefined);
const mockSignalDeactivated = jest.fn().mockResolvedValue(undefined);

jest.mock('../../lib/auth', () => ({
    assertProfileActiveWithTimeout: (...args: unknown[]) => mockAssertProfileActive(...args),
}));

jest.mock('../../lib/authSessionLifecycle', () => ({
    clearStaleAuthSession: (...args: unknown[]) => mockClearStaleAuthSession(...args),
}));

jest.mock('../../lib/signalDeactivatedAccount', () => ({
    signalDeactivatedAccount: (...args: unknown[]) => mockSignalDeactivated(...args),
}));

jest.mock('../../services/users.service', () => ({
    hydrateCurrentUserProfile: (...args: unknown[]) => mockHydrateProfile(...args),
}));

const fakeSession = { user: { id: 'u1' } } as unknown as Session;

function makeDeps() {
    return {
        setSession: jest.fn(),
        setPendingDeactivationNotice: jest.fn(),
    };
}

describe('acceptSessionIfAllowed', () => {
    beforeEach(() => {
        mockAssertProfileActive.mockReset();
        mockHydrateProfile.mockReset();
        mockClearStaleAuthSession.mockClear();
        mockSignalDeactivated.mockClear();
    });

    it('rejects a null session by calling setSession(null)', async () => {
        const deps = makeDeps();
        await acceptSessionIfAllowed(null, 'fresh', deps);
        expect(deps.setSession).toHaveBeenCalledWith(null);
        expect(mockAssertProfileActive).not.toHaveBeenCalled();
    });

    it('accepts a session when status is active (fresh)', async () => {
        mockAssertProfileActive.mockResolvedValue('active');
        mockHydrateProfile.mockResolvedValue('active');
        const deps = makeDeps();
        await acceptSessionIfAllowed(fakeSession, 'fresh', deps);
        expect(deps.setSession).toHaveBeenCalledWith(fakeSession);
        expect(mockSignalDeactivated).not.toHaveBeenCalled();
    });

    it('rejects a session when status is deactivated (fresh)', async () => {
        mockAssertProfileActive.mockResolvedValue('deactivated');
        const deps = makeDeps();
        await acceptSessionIfAllowed(fakeSession, 'fresh', deps);
        expect(mockSignalDeactivated).toHaveBeenCalledWith(deps.setPendingDeactivationNotice);
        expect(mockClearStaleAuthSession).toHaveBeenCalled();
        expect(deps.setSession).toHaveBeenCalledWith(null);
        expect(deps.setSession).not.toHaveBeenCalledWith(fakeSession);
    });

    it('rejects a session when status is unknown AND mode is fresh (fail-closed)', async () => {
        mockAssertProfileActive.mockResolvedValue('unknown');
        mockHydrateProfile.mockResolvedValue('unknown');
        const deps = makeDeps();
        await acceptSessionIfAllowed(fakeSession, 'fresh', deps);
        expect(mockSignalDeactivated).toHaveBeenCalledWith(deps.setPendingDeactivationNotice);
        expect(mockClearStaleAuthSession).toHaveBeenCalled();
        expect(deps.setSession).toHaveBeenCalledWith(null);
        expect(deps.setSession).not.toHaveBeenCalledWith(fakeSession);
    });

    it('accepts a session when status is unknown AND mode is hydration (fail-open)', async () => {
        mockAssertProfileActive.mockResolvedValue('unknown');
        mockHydrateProfile.mockResolvedValue('unknown');
        const deps = makeDeps();
        await acceptSessionIfAllowed(fakeSession, 'hydration', deps);
        expect(deps.setSession).toHaveBeenCalledWith(fakeSession);
        expect(mockSignalDeactivated).not.toHaveBeenCalled();
    });

    it('rejects a session when hydration returns deactivated (fresh)', async () => {
        mockAssertProfileActive.mockResolvedValue('active');
        mockHydrateProfile.mockResolvedValue('deactivated');
        const deps = makeDeps();
        await acceptSessionIfAllowed(fakeSession, 'fresh', deps);
        expect(mockSignalDeactivated).toHaveBeenCalled();
        expect(deps.setSession).toHaveBeenCalledWith(null);
    });
});
