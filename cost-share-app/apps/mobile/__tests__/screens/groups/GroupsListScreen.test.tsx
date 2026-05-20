import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';

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

const mockFetchGroups = fetchGroups as jest.MockedFunction<typeof fetchGroups>;
const mockFetchSummary = fetchBalanceSummary as jest.MockedFunction<
    typeof fetchBalanceSummary
>;

const makeGroup = (overrides: Partial<{
    id: string;
    name: string;
    members: { userId: string; displayName: string }[];
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
    members: [{ userId: 'u1', displayName: 'Alice' }],
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
        groups: [],
        balanceSummary: [],
        groupBalances: {},
    });
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

    it('renders groups from store', async () => {
        useAppStore.setState({ groups: [makeGroup({})] });
        const { findByText } = render(<GroupsListScreen />);
        expect(await findByText('Trip')).toBeTruthy();
    });

    it('navigates to GroupDetail when a group is pressed', async () => {
        useAppStore.setState({ groups: [makeGroup({})] });
        const { findByText } = render(<GroupsListScreen />);
        fireEvent.press(await findByText('Trip'));
        expect(mockNavigate).toHaveBeenCalledWith('GroupDetail', { groupId: 'g1' });
    });

    it('renders the big create CTA when list has items', async () => {
        useAppStore.setState({ groups: [makeGroup({})] });
        const { findByTestId } = render(<GroupsListScreen />);
        expect(await findByTestId('groups-bottom-cta')).toBeTruthy();
    });

    it('does not render the big create CTA when list is empty', async () => {
        const { queryByTestId } = render(<GroupsListScreen />);
        await waitFor(() => expect(mockFetchGroups).toHaveBeenCalled());
        expect(queryByTestId('groups-bottom-cta')).toBeNull();
    });

    it('filters groups by member name', async () => {
        useAppStore.setState({
            groups: [
                makeGroup({
                    id: 'g1',
                    name: 'Trip',
                    members: [{ userId: 'u1', displayName: 'Alice' }],
                }),
                makeGroup({
                    id: 'g2',
                    name: 'Home',
                    members: [{ userId: 'u2', displayName: 'Bob' }],
                }),
            ],
        });
        const { findByTestId, queryByText, getByText } = render(<GroupsListScreen />);
        // Expand the search input.
        fireEvent.press(await findByTestId('groups-search'));
        const input = await findByTestId('groups-search-input');
        fireEvent.changeText(input, 'bob');
        await waitFor(() => {
            expect(getByText('Home')).toBeTruthy();
            expect(queryByText('Trip')).toBeNull();
        });
    });

    it('navigates to CreateGroup from the top-right add button', async () => {
        useAppStore.setState({ groups: [makeGroup({})] });
        const { findByTestId } = render(<GroupsListScreen />);
        fireEvent.press(await findByTestId('groups-create-btn'));
        expect(mockNavigate).toHaveBeenCalledWith('CreateGroup');
    });
});
