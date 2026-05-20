const mockRpc = jest.fn();
jest.mock('../../lib/supabase', () => ({
    supabase: { rpc: (...a: any[]) => mockRpc(...a) },
}));
jest.mock('../../lib/auth', () => ({ getCurrentUserId: jest.fn().mockResolvedValue('me') }));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../i18n', () => ({ __esModule: true, default: { t: (k: string) => k } }));

import { fetchGroupPairwiseDebts } from '../../services/settlements.service';

beforeEach(() => {
    mockRpc.mockReset();
});

describe('fetchGroupPairwiseDebts', () => {
    it('calls get_group_pairwise_debts with the right group id', async () => {
        mockRpc.mockResolvedValue({ data: [], error: null });
        await fetchGroupPairwiseDebts('g1');
        expect(mockRpc).toHaveBeenCalledWith('get_group_pairwise_debts', { p_group_id: 'g1' });
    });

    it('maps snake_case RPC rows to camelCase and coerces numeric amounts', async () => {
        mockRpc.mockResolvedValue({
            data: [
                { from_user_id: 'a', to_user_id: 'b', currency: 'USD', amount: '12.34' },
            ],
            error: null,
        });
        const result = await fetchGroupPairwiseDebts('g1');
        expect(result).toEqual([
            { fromUserId: 'a', toUserId: 'b', currency: 'USD', amount: 12.34 },
        ]);
    });

    it('preserves per-currency rows separately for the same pair', async () => {
        mockRpc.mockResolvedValue({
            data: [
                { from_user_id: 'a', to_user_id: 'b', currency: 'USD', amount: 10 },
                { from_user_id: 'a', to_user_id: 'b', currency: 'EUR', amount: 7 },
                { from_user_id: 'b', to_user_id: 'a', currency: 'ILS', amount: 50 },
            ],
            error: null,
        });
        const result = await fetchGroupPairwiseDebts('g1');
        expect(result).toHaveLength(3);
        const usd = result.find(d => d.currency === 'USD');
        const eur = result.find(d => d.currency === 'EUR');
        const ils = result.find(d => d.currency === 'ILS');
        expect(usd).toMatchObject({ fromUserId: 'a', toUserId: 'b', amount: 10 });
        expect(eur).toMatchObject({ fromUserId: 'a', toUserId: 'b', amount: 7 });
        expect(ils).toMatchObject({ fromUserId: 'b', toUserId: 'a', amount: 50 });
    });

    it('returns an empty array when the RPC returns null data', async () => {
        mockRpc.mockResolvedValue({ data: null, error: null });
        expect(await fetchGroupPairwiseDebts('g1')).toEqual([]);
    });

    it('returns an empty array (and does not throw) when the RPC errors', async () => {
        // Regression: SQL bugs like 42702 ("column reference is ambiguous") and 42501 RLS
        // denials should bubble up as { error } and produce an empty list, not an exception.
        const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        mockRpc.mockResolvedValue({
            data: null,
            error: { code: '42702', message: 'column reference "currency" is ambiguous' },
        });
        expect(await fetchGroupPairwiseDebts('g1')).toEqual([]);
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('returns an empty array if the RPC promise rejects', async () => {
        const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        mockRpc.mockRejectedValue(new Error('network down'));
        expect(await fetchGroupPairwiseDebts('g1')).toEqual([]);
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });
});
