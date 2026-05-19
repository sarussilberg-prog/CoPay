const mockGetUser = jest.fn();
const mockSignOut = jest.fn().mockResolvedValue({ error: null });
const mockMaybeSingle = jest.fn();
const mockEq = jest.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = jest.fn(() => ({ eq: mockEq }));
const mockFrom = jest.fn((_table: string) => ({ select: mockSelect }));

jest.mock('../../lib/supabase', () => ({
    supabase: {
        auth: { getUser: (...a: any[]) => mockGetUser(...a), signOut: (...a: any[]) => mockSignOut(...a) },
        from: (table: string) => mockFrom(table),
    },
}));

import { assertProfileActive, getCurrentUserId } from '../../lib/auth';

beforeEach(() => {
    mockGetUser.mockReset();
    mockSignOut.mockClear();
    mockMaybeSingle.mockReset();
    mockFrom.mockClear();
});

describe('assertProfileActive', () => {
    it('returns "active" and does not sign out when is_active=true', async () => {
        mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
        mockMaybeSingle.mockResolvedValue({ data: { is_active: true }, error: null });

        expect(await assertProfileActive()).toBe('active');
        expect(mockSignOut).not.toHaveBeenCalled();
        expect(mockFrom).toHaveBeenCalledWith('profiles');
    });

    it('returns "deactivated" and signs out when is_active=false', async () => {
        mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
        mockMaybeSingle.mockResolvedValue({ data: { is_active: false }, error: null });

        expect(await assertProfileActive()).toBe('deactivated');
        expect(mockSignOut).toHaveBeenCalledTimes(1);
    });

    it('returns "missing" when no profile row exists', async () => {
        mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
        mockMaybeSingle.mockResolvedValue({ data: null, error: null });

        expect(await assertProfileActive()).toBe('missing');
        expect(mockSignOut).not.toHaveBeenCalled();
    });

    it('returns "active" with no side effect when there is no signed-in user', async () => {
        mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

        expect(await assertProfileActive()).toBe('active');
        expect(mockFrom).not.toHaveBeenCalled();
        expect(mockSignOut).not.toHaveBeenCalled();
    });
});

describe('getCurrentUserId (unchanged, sanity)', () => {
    it('returns the signed-in user id', async () => {
        mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
        expect(await getCurrentUserId()).toBe('u1');
    });
});
