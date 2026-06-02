const mockMaybeSingle = jest.fn();
const mockRpc = jest.fn();
const mockClearLocalAuthSession = jest.fn().mockResolvedValue(undefined);
const mockSetCurrentUser = jest.fn();

jest.mock('../../lib/supabase', () => ({
    supabase: {
        from: jest.fn(() => ({
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: mockMaybeSingle,
        })),
        rpc: (...a: any[]) => mockRpc(...a),
    },
}));

jest.mock('../../services/auth.service', () => ({
    clearLocalAuthSession: (...args: unknown[]) => mockClearLocalAuthSession(...args),
}));

jest.mock('../../store', () => ({
    useAppStore: {
        getState: () => ({ setCurrentUser: mockSetCurrentUser }),
    },
}));

jest.mock('../../lib/queryClient', () => ({
    queryClient: { clear: jest.fn() },
}));

jest.mock('../../hooks/queries/keys', () => ({
    queryKeys: {},
}));

jest.mock('../../lib/auth', () => ({
    getCurrentUserId: jest.fn(),
}));

import { hydrateCurrentUserProfile } from '../../services/users.service';

describe('hydrateCurrentUserProfile', () => {
    beforeEach(() => {
        mockMaybeSingle.mockReset();
        mockRpc.mockReset();
        mockRpc.mockResolvedValue({ data: false, error: null });  // default: non-admin
        mockClearLocalAuthSession.mockClear();
        mockSetCurrentUser.mockClear();
    });

    it("returns 'active' and populates the store when profile is_active=true", async () => {
        mockMaybeSingle.mockResolvedValue({
            data: { id: 'u1', is_active: true, display_name: 'Alice', email: 'a@example.com' },
            error: null,
        });

        const result = await hydrateCurrentUserProfile('u1');

        expect(result).toBe('active');
        expect(mockSetCurrentUser).toHaveBeenCalledTimes(1);
        expect(mockClearLocalAuthSession).not.toHaveBeenCalled();
    });

    it("returns 'deactivated' and clears the local session when profile is_active=false", async () => {
        mockMaybeSingle.mockResolvedValue({
            data: { id: 'u1', is_active: false, display_name: 'Alice', email: 'a@example.com' },
            error: null,
        });

        const result = await hydrateCurrentUserProfile('u1');

        expect(result).toBe('deactivated');
        expect(mockClearLocalAuthSession).toHaveBeenCalledTimes(1);
        expect(mockSetCurrentUser).not.toHaveBeenCalled();
    });

    it("returns 'unknown' on fetch error (e.g. offline) without clearing the session", async () => {
        mockMaybeSingle.mockResolvedValue({ data: null, error: new Error('Network request failed') });

        const result = await hydrateCurrentUserProfile('u1');

        expect(result).toBe('unknown');
        expect(mockClearLocalAuthSession).not.toHaveBeenCalled();
        expect(mockSetCurrentUser).not.toHaveBeenCalled();
    });

    it("returns 'unknown' when the profile row is not yet present (race with profile-creation trigger)", async () => {
        mockMaybeSingle.mockResolvedValue({ data: null, error: null });

        const result = await hydrateCurrentUserProfile('u1');

        expect(result).toBe('unknown');
        expect(mockClearLocalAuthSession).not.toHaveBeenCalled();
        expect(mockSetCurrentUser).not.toHaveBeenCalled();
    });
});
