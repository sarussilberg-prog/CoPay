const mockFrom = jest.fn();
const mockSelect = jest.fn();
const mockIn = jest.fn();
const mockEq = jest.fn();
const mockOrder = jest.fn();

jest.mock('../../lib/supabase', () => ({
    supabase: {
        from: (...args: any[]) => mockFrom(...args),
    },
}));

jest.mock('../../lib/auth', () => ({
    getCurrentUserId: jest.fn().mockResolvedValue('user-me'),
}));

import { fetchFriends, fetchIncomingRequests, fetchOutgoingRequests } from '../../services/friends.service';

describe('friends service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('fetchFriends filters out inactive friends', async () => {
        // mock friendships call
        mockFrom.mockReturnValueOnce({
            select: jest.fn().mockResolvedValue({
                data: [
                    { user_a_id: 'user-me', user_b_id: 'friend-active' },
                    { user_a_id: 'friend-inactive', user_b_id: 'user-me' },
                ],
                error: null,
            }),
        });

        // mock profiles call
        mockFrom.mockReturnValueOnce({
            select: jest.fn().mockReturnThis(),
            in: jest.fn().mockResolvedValue({
                data: [
                    { id: 'friend-active', name: 'Alice', is_active: true },
                    { id: 'friend-inactive', name: 'Bob', is_active: false },
                ],
                error: null,
            }),
        });

        const result = await fetchFriends();
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('friend-active');
        expect(result[0].name).toBe('Alice');
    });

    it('fetchIncomingRequests filters out requests from inactive users', async () => {
        // mock friend_requests call
        const mockOrderFn = jest.fn().mockResolvedValue({
            data: [
                { id: 'req1', from_user_id: 'active-sender', to_user_id: 'user-me', status: 'pending', created_at: new Date().toISOString() },
                { id: 'req2', from_user_id: 'inactive-sender', to_user_id: 'user-me', status: 'pending', created_at: new Date().toISOString() },
            ],
            error: null,
        });
        const mockEqFn2 = jest.fn().mockReturnValue({ order: mockOrderFn });
        const mockEqFn1 = jest.fn().mockReturnValue({ eq: mockEqFn2 });
        const mockSelectFn = jest.fn().mockReturnValue({ eq: mockEqFn1 });

        mockFrom.mockReturnValueOnce({
            select: mockSelectFn,
        });

        // mock profiles call for fetchProfilesByIds (inside fetchIncomingRequests)
        mockFrom.mockReturnValueOnce({
            select: jest.fn().mockReturnThis(),
            in: jest.fn().mockResolvedValue({
                data: [
                    { id: 'active-sender', name: 'Alice', is_active: true },
                    { id: 'inactive-sender', name: 'Bob', is_active: false },
                ],
                error: null,
            }),
        });

        const result = await fetchIncomingRequests();
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('req1');
        expect(result[0].profile?.name).toBe('Alice');
    });

    it('fetchOutgoingRequests filters out requests to inactive users', async () => {
        // mock friend_requests call
        const mockOrderFn = jest.fn().mockResolvedValue({
            data: [
                { id: 'req1', from_user_id: 'user-me', to_user_id: 'active-receiver', status: 'pending', created_at: new Date().toISOString() },
                { id: 'req2', from_user_id: 'user-me', to_user_id: 'inactive-receiver', status: 'pending', created_at: new Date().toISOString() },
            ],
            error: null,
        });
        const mockEqFn2 = jest.fn().mockReturnValue({ order: mockOrderFn });
        const mockEqFn1 = jest.fn().mockReturnValue({ eq: mockEqFn2 });
        const mockSelectFn = jest.fn().mockReturnValue({ eq: mockEqFn1 });

        mockFrom.mockReturnValueOnce({
            select: mockSelectFn,
        });

        // mock profiles call for fetchProfilesByIds (inside fetchOutgoingRequests)
        mockFrom.mockReturnValueOnce({
            select: jest.fn().mockReturnThis(),
            in: jest.fn().mockResolvedValue({
                data: [
                    { id: 'active-receiver', name: 'Alice', is_active: true },
                    { id: 'inactive-receiver', name: 'Bob', is_active: false },
                ],
                error: null,
            }),
        });

        const result = await fetchOutgoingRequests();
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('req1');
        expect(result[0].profile?.name).toBe('Alice');
    });
});
