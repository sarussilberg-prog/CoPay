const mockRpc = jest.fn();
jest.mock('../../lib/supabase', () => ({ supabase: { rpc: (...a: any[]) => mockRpc(...a) } }));
jest.mock('../../lib/auth', () => ({ getCurrentUserId: jest.fn().mockResolvedValue('u1') }));

import { fetchDashboard } from '../../services/dashboard.service';
import { useAppStore } from '../../store';

beforeEach(() => {
    mockRpc.mockReset();
    useAppStore.setState({ currentUser: null } as any);
});

describe('fetchDashboard', () => {
    it('uses store user id without calling auth when available', async () => {
        useAppStore.setState({
            currentUser: { id: 'store-user' },
        } as any);
        const auth = jest.requireMock('../../lib/auth');
        mockRpc.mockResolvedValue({ data: {}, error: null });
        await fetchDashboard();
        expect(auth.getCurrentUserId).not.toHaveBeenCalled();
        expect(mockRpc).toHaveBeenCalledWith('get_user_dashboard', { p_user_id: 'store-user' });
    });

    it('returns dashboard payload on success', async () => {
        const payload = { balanceSummary: { totalOwed: 0, totalOwedToUser: 0, defaultCurrency: 'USD', byCurrency: [] }, stats: { closedGroupsCount: 0, activeGroupsCount: 0 }, friends: [] };
        mockRpc.mockResolvedValue({ data: payload, error: null });
        expect(await fetchDashboard()).toEqual(payload);
        expect(mockRpc).toHaveBeenCalledWith('get_user_dashboard', { p_user_id: 'u1' });
    });

    it('throws when no authenticated user', async () => {
        const auth = jest.requireMock('../../lib/auth');
        (auth.getCurrentUserId as jest.Mock).mockResolvedValueOnce(null);
        await expect(fetchDashboard()).rejects.toThrow(/no authenticated user/);
    });

    it('throws on RPC error so React Query treats it as a failure', async () => {
        mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
        await expect(fetchDashboard()).rejects.toMatchObject({ message: 'boom' });
    });
});
