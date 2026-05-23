const mockRpc = jest.fn();
const mockClearLocalAuthSession = jest.fn();
jest.mock('../../lib/supabase', () => ({
    supabase: { rpc: (...a: any[]) => mockRpc(...a) },
}));
jest.mock('../../services/auth.service', () => ({
    clearLocalAuthSession: (...a: unknown[]) => mockClearLocalAuthSession(...a),
}));

import { deleteMyAccount, getMyOpenBalances } from '../../services/account.service';

beforeEach(() => {
    mockRpc.mockReset();
    mockClearLocalAuthSession.mockReset();
    mockClearLocalAuthSession.mockResolvedValue(undefined);
});

describe('deleteMyAccount', () => {
    it('calls RPC then clears the local auth session and returns ok on success', async () => {
        mockRpc.mockResolvedValue({ data: null, error: null });

        const result = await deleteMyAccount();

        expect(result).toEqual({ ok: true });
        expect(mockRpc).toHaveBeenCalledWith('delete_my_account');
        expect(mockClearLocalAuthSession).toHaveBeenCalled();
    });

    it('returns error and does NOT clear session when RPC fails', async () => {
        mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

        const result = await deleteMyAccount();

        expect(result).toEqual({ ok: false, error: 'deleteAccount.deleteFailed' });
        expect(mockClearLocalAuthSession).not.toHaveBeenCalled();
    });
});

describe('getMyOpenBalances', () => {
    it('returns hasOpenBalances=false when summary array is empty', async () => {
        mockRpc.mockResolvedValue({
            data: { summary: [], byGroup: [] },
            error: null,
        });

        const result = await getMyOpenBalances();

        expect(mockRpc).toHaveBeenCalledWith('get_my_open_balances');
        expect(result).toEqual({
            hasOpenBalances: false,
            totalOwed: 0,
            totalOwing: 0,
            currency: 'ILS',
        });
    });

    it('aggregates owed and owing across currencies and picks the largest as display currency', async () => {
        mockRpc.mockResolvedValue({
            data: {
                summary: [
                    { currency: 'ILS', owed: 100, owe: 20, net: 80 },
                    { currency: 'USD', owed: 50, owe: 5, net: 45 },
                ],
                byGroup: [],
            },
            error: null,
        });

        const result = await getMyOpenBalances();

        expect(result.hasOpenBalances).toBe(true);
        expect(result.totalOwed).toBe(150);
        expect(result.totalOwing).toBe(25);
        expect(result.currency).toBe('ILS');
    });

    it('falls back to ILS currency on RPC error', async () => {
        mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

        const result = await getMyOpenBalances();

        expect(result).toEqual({
            hasOpenBalances: false,
            totalOwed: 0,
            totalOwing: 0,
            currency: 'ILS',
        });
    });
});
