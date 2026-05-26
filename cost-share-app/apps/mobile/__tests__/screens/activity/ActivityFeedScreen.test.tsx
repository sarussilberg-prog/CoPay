import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@react-navigation/native', () => {
    const actual = jest.requireActual('@react-navigation/native');
    return {
        ...actual,
        useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
        useRoute: () => ({ params: {} }),
        useFocusEffect: jest.fn(),
        useIsFocused: () => true,
    };
});

jest.mock('../../../services/activity.service', () => ({
    fetchRecentActivity: jest.fn(),
    fetchActivityLastSeenAt: jest.fn().mockResolvedValue(null),
    ACTIVITY_INITIAL_PAGE_SIZE: 15,
    ACTIVITY_PAGE_SIZE: 20,
    ACTIVITY_INITIAL_SKELETON_COUNT: 3,
}));

jest.mock('../../../services/groups.service', () => ({
    fetchProfilesByUserIds: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../../services/expenses.service', () => ({
    getExpenseWithSplitsById: jest.fn(),
    deleteExpense: jest.fn(),
}));

jest.mock('../../../services/settlements.service', () => ({
    getSettlementById: jest.fn(),
}));

jest.mock('../../../services/expense-delta', () => ({
    decorateExpense: jest.fn((expense) => expense),
}));

jest.mock('../../../lib/supabase', () => ({
    supabase: {
        rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    },
}));

jest.mock('../../../store', () => ({
    useAppStore: jest.fn(),
}));

import { ActivityFeedScreen } from '../../../screens/activity/ActivityFeedScreen';
import { fetchRecentActivity } from '../../../services/activity.service';
import { useAppStore } from '../../../store';
import { supabase } from '../../../lib/supabase';
import { queryKeys } from '../../../hooks/queries/keys';

const mockFetchRecentActivity = fetchRecentActivity as jest.MockedFunction<
    typeof fetchRecentActivity
>;
const mockUseAppStore = useAppStore as unknown as jest.Mock;
const mockSupabaseRpc = supabase.rpc as jest.MockedFunction<typeof supabase.rpc>;

function renderWithQuery(ui: React.ReactElement) {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    const utils = render(
        <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
    );
    return { ...utils, client };
}

beforeEach(() => {
    mockFetchRecentActivity.mockReset();
    mockSupabaseRpc.mockClear();
    mockSupabaseRpc.mockResolvedValue({ data: null, error: null } as never);
    const navMock = jest.requireMock('@react-navigation/native');
    (navMock.useFocusEffect as jest.Mock).mockClear();
    const storeState = {
        currentUser: { id: 'u1' },
        groups: [{ id: 'g1', name: 'Trip', defaultCurrency: 'USD', groupType: 'trip', members: [] }],
    };
    mockUseAppStore.mockImplementation((selector) => selector(storeState));
    (mockUseAppStore as unknown as { getState: () => typeof storeState }).getState = () => storeState;
});

describe('ActivityFeedScreen', () => {
    it('shows skeleton placeholders while the first page loads', async () => {
        mockFetchRecentActivity.mockReturnValue(new Promise(() => {}));
        const { findAllByTestId } = renderWithQuery(<ActivityFeedScreen />);
        expect((await findAllByTestId('activity-item-skeleton')).length).toBe(3);
    });

    it('shows empty state when no activities', async () => {
        mockFetchRecentActivity.mockResolvedValue({ items: [] });
        const { findByText } = renderWithQuery(<ActivityFeedScreen />);
        expect(await findByText('activity.noActivity')).toBeTruthy();
    });

    it('shows network error state when fetch fails', async () => {
        mockFetchRecentActivity.mockRejectedValue(new Error('Network error'));
        const { findByText } = renderWithQuery(<ActivityFeedScreen />);
        expect(await findByText('activity.loadError')).toBeTruthy();
        expect(await findByText('common.networkError')).toBeTruthy();
        expect(await findByText('common.retry')).toBeTruthy();
    });

    it('renders activities when present', async () => {
        mockFetchRecentActivity.mockResolvedValue({
            items: [
                {
                    id: 'a1',
                    userId: 'u1',
                    kind: 'expense_added',
                    groupId: 'g1',
                    refId: 'e1',
                    actorUserId: 'u1',
                    metadata: { description: 'Lunch', amount: 12, currency: 'USD' },
                    createdAt: new Date('2026-05-01'),
                },
            ],
        });
        const { findByText } = renderWithQuery(<ActivityFeedScreen />);
        expect(await findByText('Lunch')).toBeTruthy();
    });

    it('filters activities by search query', async () => {
        mockFetchRecentActivity.mockResolvedValue({
            items: [
                {
                    id: 'a1',
                    userId: 'u1',
                    kind: 'expense_added',
                    groupId: 'g1',
                    refId: 'e1',
                    actorUserId: 'u1',
                    metadata: { description: 'Lunch', amount: 12, currency: 'USD' },
                    createdAt: new Date('2026-05-01'),
                },
                {
                    id: 'a2',
                    userId: 'u1',
                    kind: 'expense_added',
                    groupId: 'g1',
                    refId: 'e2',
                    actorUserId: 'u2',
                    metadata: { description: 'Dinner', amount: 20, currency: 'USD' },
                    createdAt: new Date('2026-05-02'),
                },
            ],
        });

        const { findByText, findByTestId, queryByText } = renderWithQuery(
            <ActivityFeedScreen />,
        );
        expect(await findByText('Lunch')).toBeTruthy();

        fireEvent.changeText(await findByTestId('activity-search-input'), 'Dinner');

        expect(await findByText('Dinner')).toBeTruthy();
        expect(queryByText('Lunch')).toBeNull();
    });

    it('renders group messages in the feed', async () => {
        mockFetchRecentActivity.mockResolvedValue({
            items: [
                {
                    id: 'm1',
                    userId: 'u1',
                    kind: 'message_posted',
                    groupId: 'g1',
                    refId: 'msg1',
                    actorUserId: 'u1',
                    metadata: { body: 'Hello everyone' },
                    createdAt: new Date('2026-05-01'),
                },
            ],
        });
        const { findByText } = renderWithQuery(<ActivityFeedScreen />);
        expect(await findByText('Hello everyone')).toBeTruthy();
    });

    it('fetches activity only once on mount (no double-fetch)', async () => {
        mockFetchRecentActivity.mockResolvedValue({ items: [] });
        renderWithQuery(<ActivityFeedScreen />);

        await waitFor(() => {
            expect(mockFetchRecentActivity).toHaveBeenCalledTimes(1);
        });
    });

    it('does not auto-fetch next page before user scrolls', async () => {
        mockFetchRecentActivity.mockResolvedValue({
            items: Array.from({ length: 15 }, (_, i) => ({
                id: `a${i}`,
                userId: 'u1',
                kind: 'expense_added' as const,
                groupId: 'g1',
                refId: `e${i}`,
                actorUserId: 'u1',
                metadata: { description: `Item ${i}`, amount: 10, currency: 'USD' },
                createdAt: new Date(`2026-05-01T00:00:${String(i).padStart(2, '0')}.000Z`),
            })),
            nextCursor: '2026-05-01T00:00:00.000Z',
        });

        renderWithQuery(<ActivityFeedScreen />);

        await waitFor(() => {
            expect(mockFetchRecentActivity).toHaveBeenCalledTimes(1);
        });

        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(mockFetchRecentActivity).toHaveBeenCalledTimes(1);
    });

    it('calls mark_activity_seen RPC when the screen gains focus', async () => {
        mockFetchRecentActivity.mockResolvedValue({ items: [] });
        renderWithQuery(<ActivityFeedScreen />);

        // useFocusEffect is a no-op stub; invoke the registered callback to
        // simulate the screen gaining focus.
        const navMock = jest.requireMock('@react-navigation/native');
        const focusCb = (navMock.useFocusEffect as jest.Mock).mock.calls[0][0];
        focusCb();

        await waitFor(() => {
            expect(mockSupabaseRpc).toHaveBeenCalledWith('mark_activity_seen');
        });
    });

    it('opens the expense detail sheet when an expense_added row is pressed', async () => {
        const { getExpenseWithSplitsById } = jest.requireMock('../../../services/expenses.service');
        (getExpenseWithSplitsById as jest.Mock).mockResolvedValue({
            id: 'exp1',
            groupId: 'g1',
            description: 'Lunch',
            amount: 12,
            currency: 'USD',
            expenseDate: new Date('2026-05-01'),
            paidBy: 'u2',
            createdBy: 'u2',
            splits: [{ userId: 'u1', amount: 6 }, { userId: 'u2', amount: 6 }],
        });
        mockFetchRecentActivity.mockResolvedValue({
            items: [
                {
                    id: 'a1',
                    userId: 'u1',
                    kind: 'expense_added',
                    groupId: 'g1',
                    refId: 'exp1',
                    actorUserId: 'u2',
                    metadata: { description: 'Lunch', amount: 12, currency: 'USD' },
                    createdAt: new Date('2026-05-01'),
                },
            ],
        });

        const { findByTestId } = renderWithQuery(<ActivityFeedScreen />);
        const card = await findByTestId('activity-card-a1');
        fireEvent.press(card);

        await waitFor(() => {
            expect(getExpenseWithSplitsById).toHaveBeenCalledWith('exp1');
        });
        expect(await findByTestId('expense-detail-sheet')).toBeTruthy();
    });

    it('invalidates the unread-count query with the correct queryKey on focus', async () => {
        mockFetchRecentActivity.mockResolvedValue({ items: [] });

        const invalidateSpy = jest.spyOn(
            QueryClient.prototype,
            'invalidateQueries',
        );

        try {
            renderWithQuery(<ActivityFeedScreen />);

            const navMock = jest.requireMock('@react-navigation/native');
            const focusCb = (navMock.useFocusEffect as jest.Mock).mock.calls[0][0];
            focusCb();

            await waitFor(() => {
                expect(mockSupabaseRpc).toHaveBeenCalledWith('mark_activity_seen');
            });

            await waitFor(() => {
                expect(invalidateSpy).toHaveBeenCalledWith({
                    queryKey: queryKeys.activityUnreadCount,
                });
            });
        } finally {
            invalidateSpy.mockRestore();
        }
    });
});
