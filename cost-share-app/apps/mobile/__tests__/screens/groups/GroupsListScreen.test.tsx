import React from 'react';
import { waitFor, fireEvent } from '@testing-library/react-native';
import { renderWithQuery as render } from '../../helpers/renderWithQuery';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => {
    const actual = jest.requireActual('@react-navigation/native');
    return {
        ...actual,
        useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
        useRoute: () => ({ params: {} }),
        useFocusEffect: (cb: () => void) => cb(),
        useIsFocused: () => true,
    };
});

jest.mock('@react-navigation/bottom-tabs', () => {
    const actual = jest.requireActual('@react-navigation/bottom-tabs');
    return {
        ...actual,
        useBottomTabBarHeight: () => 0,
    };
});

jest.mock('../../../services/groups.service', () => ({
    fetchGroups: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../../services/users.service', () => ({
    fetchBalanceSummary: jest.fn().mockResolvedValue({ summary: [], byGroup: [] }),
}));

import { GroupsListScreen } from '../../../screens/groups/GroupsListScreen';
import { useAppStore } from '../../../store';
import { fetchGroups } from '../../../services/groups.service';
import { fetchBalanceSummary } from '../../../services/users.service';
import { queryClient } from '../../../lib/queryClient';
import { queryKeys } from '../../../hooks/queries/keys';

const mockFetchGroups = fetchGroups as jest.MockedFunction<typeof fetchGroups>;
const mockFetchSummary = fetchBalanceSummary as jest.MockedFunction<
    typeof fetchBalanceSummary
>;

const makeGroup = (overrides: Partial<{
    id: string;
    name: string;
    members: { userId: string; displayName: string; isActive: boolean }[];
}>) => ({
    id: 'g1',
    name: 'Trip',
    description: 'A trip',
    groupType: 'trip' as const,
    defaultCurrency: 'USD',
    inviteToken: 'trip123456',
    createdBy: 'u1',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    members: [{ userId: 'u1', displayName: 'Alice', isActive: true }],
    isArchivedByMe: false,
    isAutoArchived: false,
    ...overrides,
});

beforeEach(() => {
    mockNavigate.mockClear();
    mockGoBack.mockClear();
    mockFetchGroups.mockClear();
    mockFetchSummary.mockClear();
    useAppStore.setState({
        balanceSummary: [],
        groupBalances: {},
    });
    queryClient.clear();
});

describe('GroupsListScreen', () => {
    it('calls fetchGroups on mount', async () => {
        render(<GroupsListScreen />);
        await waitFor(() => {
            expect(mockFetchGroups).toHaveBeenCalled();
        });
    });

    it('shows EmptyState when no groups exist', async () => {
        const { findByText } = render(<GroupsListScreen />);
        expect(await findByText('groups.noGroups')).toBeTruthy();
    });

    it('shows network error state when fetch fails', async () => {
        mockFetchGroups.mockRejectedValue(new Error('Network error'));
        const { findByText } = render(<GroupsListScreen />);
        expect(await findByText('groups.loadError')).toBeTruthy();
        expect(await findByText('common.networkError')).toBeTruthy();
        expect(await findByText('common.retry')).toBeTruthy();
    });

    it('renders groups from store', async () => {
        queryClient.setQueryData(queryKeys.groups, [makeGroup({})]);
        const { findByText } = render(<GroupsListScreen />);
        expect(await findByText('Trip')).toBeTruthy();
    });

    it('navigates to GroupDetail when a group is pressed', async () => {
        queryClient.setQueryData(queryKeys.groups, [makeGroup({})]);
        const { findByText } = render(<GroupsListScreen />);
        fireEvent.press(await findByText('Trip'));
        expect(mockNavigate).toHaveBeenCalledWith('GroupDetail', { groupId: 'g1' });
    });

    it('renders the big create CTA when list has items', async () => {
        queryClient.setQueryData(queryKeys.groups, [makeGroup({})]);
        const { findByTestId } = render(<GroupsListScreen />);
        expect(await findByTestId('groups-bottom-cta')).toBeTruthy();
    });

    it('renders the bottom create CTA even when the filtered list is empty', async () => {
        const { findByTestId } = render(<GroupsListScreen />);
        await waitFor(() => expect(mockFetchGroups).toHaveBeenCalled());
        expect(await findByTestId('groups-bottom-cta')).toBeTruthy();
    });

    it('filters groups by member name', async () => {
        queryClient.setQueryData(queryKeys.groups, [
            makeGroup({
                id: 'g1',
                name: 'Trip',
                members: [{ userId: 'u1', displayName: 'Alice', isActive: true }],
            }),
            makeGroup({
                id: 'g2',
                name: 'Home',
                members: [{ userId: 'u2', displayName: 'Bob', isActive: true }],
            }),
        ]);
        const { findByTestId, queryByText, getByText } = render(<GroupsListScreen />);
        const input = await findByTestId('groups-search-input');
        fireEvent.changeText(input, 'bob');
        await waitFor(() => {
            expect(getByText('Home')).toBeTruthy();
            expect(queryByText('Trip')).toBeNull();
        });
    });

    it('navigates to CreateGroup from the top-right add button', async () => {
        queryClient.setQueryData(queryKeys.groups, [makeGroup({})]);
        const { findByTestId } = render(<GroupsListScreen />);
        fireEvent.press(await findByTestId('groups-create-btn'));
        expect(mockNavigate).toHaveBeenCalledWith('CreateGroup');
    });
});
