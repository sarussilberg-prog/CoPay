const mockRpc = jest.fn();
const mockSignOut = jest.fn();
jest.mock('../../lib/supabase', () => ({
    supabase: { rpc: (...a: any[]) => mockRpc(...a), auth: { signOut: (...a: any[]) => mockSignOut(...a) } },
}));

import { deleteMyAccount } from '../../services/account.service';

beforeEach(() => {
    mockRpc.mockReset();
    mockSignOut.mockReset();
    mockSignOut.mockResolvedValue({ error: null });
});

describe('deleteMyAccount', () => {
    it('calls RPC then signs out and returns ok on success', async () => {
        mockRpc.mockResolvedValue({ data: null, error: null });

        const result = await deleteMyAccount();

        expect(result).toEqual({ ok: true });
        expect(mockRpc).toHaveBeenCalledWith('delete_my_account');
        expect(mockSignOut).toHaveBeenCalledTimes(1);
    });

    it('returns error and does NOT sign out when RPC fails', async () => {
        mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

        const result = await deleteMyAccount();

        expect(result).toEqual({ ok: false, error: 'deleteAccount.deleteFailed' });
        expect(mockSignOut).not.toHaveBeenCalled();
    });

    it('returns ok even when signOut throws (account already deactivated)', async () => {
        mockRpc.mockResolvedValue({ data: null, error: null });
        mockSignOut.mockResolvedValue({ error: { message: 'network' } });

        const result = await deleteMyAccount();

        expect(result).toEqual({ ok: true });
    });
});
