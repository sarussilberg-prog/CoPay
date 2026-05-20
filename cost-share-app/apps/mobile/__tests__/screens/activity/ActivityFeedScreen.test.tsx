import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@react-navigation/native', () => {
    const actual = jest.requireActual('@react-navigation/native');
    return {
        ...actual,
        useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
        useRoute: () => ({ params: {} }),
        useFocusEffect: (cb: () => void) => cb(),
        useIsFocused: () => true,
    };
});

jest.mock('../../../services/activity.service', () => ({
    fetchRecentActivity: jest.fn(),
    ACTIVITY_INITIAL_PAGE_SIZE: 15,
    ACTIVITY_PAGE_SIZE: 20,
    ACTIVITY_INITIAL_SKELETON_COUNT: 3,
}));

jest.mock('../../../store', () => ({
    useAppStore: jest.fn(),
}));

import { ActivityFeedScreen } from '../../../screens/activity/ActivityFeedScreen';
import { fetchRecentActivity } from '../../../services/activity.service';
import { useAppStore } from '../../../store';

const mockFetchRecentActivity = fetchRecentActivity as jest.MockedFunction<
    typeof fetchRecentActivity
>;
const mockUseAppStore = useAppStore as unknown as jest.Mock;

function renderWithQuery(ui: React.ReactElement) {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return render(
        <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
    );
}

beforeEach(() => {
    mockFetchRecentActivity.mockReset();
    mockUseAppStore.mockImplementation((selector) =>
        selector({
            currentUser: { id: 'u1' },
            groups: [{ id: 'g1', name: 'Trip', defaultCurrency: 'USD', groupType: 'trip' }],
        }),
    );
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
                    activityType: 'expense',
                    groupId: 'g1',
                    description: 'Lunch',
                    amount: 12,
                    currency: 'USD',
                    userId: 'u1',
                    userName: 'Alice',
                    activityDate: new Date('2026-05-01'),
                    createdAt: new Date(),
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
                    activityType: 'expense',
                    groupId: 'g1',
                    description: 'Lunch',
                    amount: 12,
                    currency: 'USD',
                    userId: 'u1',
                    userName: 'Alice',
                    activityDate: new Date('2026-05-01'),
                    createdAt: new Date(),
                },
                {
                    id: 'a2',
                    activityType: 'expense',
                    groupId: 'g1',
                    description: 'Dinner',
                    amount: 20,
                    currency: 'USD',
                    userId: 'u2',
                    userName: 'Bob',
                    activityDate: new Date('2026-05-02'),
                    createdAt: new Date(),
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
                    activityType: 'message',
                    groupId: 'g1',
                    description: 'Hello everyone',
                    amount: 0,
                    currency: '',
                    userId: 'u1',
                    userName: 'Alice',
                    activityDate: new Date('2026-05-01'),
                    createdAt: new Date(),
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
                activityType: 'expense' as const,
                groupId: 'g1',
                description: `Item ${i}`,
                amount: 10,
                currency: 'USD',
                userId: 'u1',
                userName: 'Alice',
                activityDate: new Date('2026-05-01'),
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
});
