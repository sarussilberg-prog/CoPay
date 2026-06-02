import { handleInviteLink } from '../../services/deepLinks.service';
import { useAppStore } from '../../store';

const mockRpc = jest.fn();
const mockInvalidate = jest.fn();

jest.mock('../../lib/supabase', () => ({
    supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

jest.mock('../../hooks/queries/keys', () => ({
    queryKeys: { friends: ['friends'], dashboard: ['dashboard'] },
}));

jest.mock('react-native-toast-message', () => ({
    show: jest.fn(),
}));

describe('handleInviteLink navigation deferral', () => {
    const queryClient = { invalidateQueries: mockInvalidate } as any;

    beforeEach(() => {
        mockRpc.mockReset();
        mockInvalidate.mockReset();
        useAppStore.setState({ pendingNavigation: null });
    });

    it('queues friends navigation when navigation is null', async () => {
        mockRpc.mockResolvedValue({
            data: { friend_id: 'f1', friend_name: 'Dana' },
            error: null,
        });

        const result = await handleInviteLink(
            { kind: 'friend', token: 'AbCdEfGhIj' },
            null,
            queryClient,
        );

        expect(result).toEqual({ kind: 'friend' });
        expect(useAppStore.getState().pendingNavigation).toEqual({ target: 'friends' });
    });

    it('queues group detail navigation when navigation is null', async () => {
        mockRpc.mockResolvedValue({
            data: { group_id: 'g1', group_name: 'Trip', already_member: false },
            error: null,
        });

        const result = await handleInviteLink(
            { kind: 'group', token: 'KlMnOpQrSt' },
            null,
            queryClient,
        );

        expect(result).toEqual({ kind: 'group', groupId: 'g1' });
        expect(useAppStore.getState().pendingNavigation).toEqual({
            target: 'groupDetail',
            groupId: 'g1',
        });
    });
});
