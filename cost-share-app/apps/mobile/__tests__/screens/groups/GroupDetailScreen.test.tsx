import React from 'react';
import { waitFor, fireEvent } from '@testing-library/react-native';
import { renderWithQuery } from '../../helpers/renderWithQuery';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => {
    const actual = jest.requireActual('@react-navigation/native');
    return {
        ...actual,
        useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
        useRoute: () => ({ params: { groupId: 'g1' } }),
        useFocusEffect: (cb: () => void) => cb(),
        useIsFocused: () => true,
    };
});

jest.mock('expo-linear-gradient', () => {
    const { View } = require('react-native');
    return { LinearGradient: View };
});

jest.mock('../../../services/groups.service', () => ({
    getGroupById: jest.fn(),
    fetchProfilesByUserIds: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../../services/expenses.service', () => ({
    fetchExpenses: jest.fn().mockResolvedValue([]),
    deleteExpense: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../../services/messages.service', () => ({
    fetchMessages: jest.fn().mockResolvedValue([]),
    createMessage: jest.fn(),
    updateMessage: jest.fn(),
    deleteMessage: jest.fn(),
}));

const mockDeleteSettlement = jest.fn().mockResolvedValue(true);
const mockUpdateSettlement = jest.fn().mockResolvedValue({
    id: 'st1',
    groupId: 'g1',
    fromUserId: 'me',
    toUserId: 'u2',
    amount: 50,
    currency: 'USD',
    settlementDate: new Date(),
    createdBy: 'me',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
});

jest.mock('../../../services/settlements.service', () => ({
    fetchSettlements: jest.fn().mockResolvedValue([]),
    fetchGroupPairwiseDebts: jest.fn().mockResolvedValue([]),
    createSettlement: jest.fn(),
    updateSettlement: (...args: unknown[]) => mockUpdateSettlement(...args),
    deleteSettlement: (...args: unknown[]) => mockDeleteSettlement(...args),
}));

jest.mock('../../../services/users.service', () => ({
    fetchGroupUsers: jest.fn().mockResolvedValue([]),
    fetchBalanceSummary: jest.fn().mockResolvedValue({ summary: [], byGroup: [] }),
}));

jest.mock('../../../services/group-share.service', () => ({
    exportGroupCsv: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../../hooks/useGroupMessagesRealtime', () => ({
    useGroupMessagesRealtime: jest.fn(),
}));

jest.mock('react-native-toast-message', () => ({
    __esModule: true,
    default: { show: jest.fn() },
}));

jest.mock('../../../lib/auth', () => ({
    getCurrentUserId: jest.fn().mockResolvedValue('me'),
}));

jest.mock('../../../components/AddMembersSheet', () => ({
    AddMembersSheet: () => null,
}));

import { GroupDetailScreen } from '../../../screens/groups/GroupDetailScreen';
import { getGroupById } from '../../../services/groups.service';
import { fetchExpenses } from '../../../services/expenses.service';
import { fetchMessages, createMessage } from '../../../services/messages.service';
import { fetchSettlements } from '../../../services/settlements.service';
import { exportGroupCsv } from '../../../services/group-share.service';
import { clearGroupFeedHydration } from '../../../lib/groupFeedCache';
import { useAppStore } from '../../../store';

const mockGetGroup = getGroupById as jest.MockedFunction<typeof getGroupById>;
const mockFetchExpenses = fetchExpenses as jest.MockedFunction<typeof fetchExpenses>;
const mockFetchMessages = fetchMessages as jest.MockedFunction<typeof fetchMessages>;
const mockFetchSettlements = fetchSettlements as jest.MockedFunction<typeof fetchSettlements>;
const mockCreateMessage = createMessage as jest.MockedFunction<typeof createMessage>;
const mockExport = exportGroupCsv as jest.MockedFunction<typeof exportGroupCsv>;

const settlement = {
    id: 'st1',
    groupId: 'g1',
    fromUserId: 'me',
    toUserId: 'u2',
    amount: 50,
    currency: 'USD',
    settlementDate: new Date(),
    createdBy: 'me',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
};

const group = {
    id: 'g1',
    name: 'Trip',
    groupType: 'trip' as const,
    defaultCurrency: 'USD',
    inviteToken: 'trip123456',
    createdBy: 'me',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    members: [],
    isArchivedByMe: false,
    isAutoArchived: false,
};

beforeEach(() => {
    jest.clearAllMocks();
    clearGroupFeedHydration();
    mockGetGroup.mockResolvedValue(group);
    mockFetchExpenses.mockResolvedValue([]);
    mockFetchMessages.mockResolvedValue([]);
    mockFetchSettlements.mockResolvedValue([]);
    useAppStore.setState({
        expenses: [],
        messagesByGroup: {},
        groups: [],
    });
});

describe('GroupDetailScreen', () => {
    it('renders the hero with the group name', async () => {
        const { findByText } = renderWithQuery(<GroupDetailScreen />);
        expect(await findByText('Trip')).toBeTruthy();
    });

    it('renders the search input without the balance banner', async () => {
        const { findByTestId, queryByTestId } = renderWithQuery(<GroupDetailScreen />);
        expect(await findByTestId('detail-search-input')).toBeTruthy();
        expect(queryByTestId('group-balance-banner')).toBeNull();
    });

    it('navigates back when the hero back button is tapped', async () => {
        const { findByTestId } = renderWithQuery(<GroupDetailScreen />);
        fireEvent.press(await findByTestId('hero-back-btn'));
        expect(mockGoBack).toHaveBeenCalled();
    });

    it('navigates to EditGroup via the kebab menu', async () => {
        const { findByTestId, findByText } = renderWithQuery(<GroupDetailScreen />);
        fireEvent.press(await findByTestId('hero-menu-btn'));
        fireEvent.press(await findByText('groups.editGroup'));
        expect(mockNavigate).toHaveBeenCalledWith('EditGroup', { groupId: 'g1' });
    });

    it('invokes exportGroupCsv when Export is chosen from the group menu', async () => {
        const { findByTestId, findByText } = renderWithQuery(<GroupDetailScreen />);
        fireEvent.press(await findByTestId('hero-menu-btn'));
        fireEvent.press(await findByText('groups.actions.export'));
        await waitFor(() => expect(mockExport).toHaveBeenCalled());
    });

    it('renders floating message and expense actions', async () => {
        const { findByTestId } = renderWithQuery(<GroupDetailScreen />);
        expect(await findByTestId('detail-add-expense')).toBeTruthy();
    });

    it('shows the empty feed card when there is no feed content', async () => {
        const { findByTestId } = renderWithQuery(<GroupDetailScreen />);
        expect(await findByTestId('empty-feed-add-members')).toBeTruthy();
    });

    it('shows loading instead of empty feed while data is fetching', async () => {
        useAppStore.setState({ groups: [group] });

        mockFetchExpenses.mockImplementation(() => new Promise(() => {}));
        mockFetchMessages.mockImplementation(() => new Promise(() => {}));

        const { findByTestId, queryByTestId } = renderWithQuery(<GroupDetailScreen />);
        expect(await findByTestId('detail-search-input')).toBeTruthy();
        expect(await findByTestId('feed-loading')).toBeTruthy();
        expect(queryByTestId('empty-feed-add-members')).toBeNull();
    });

    it('shows no-results state when search filters out all feed items', async () => {
        useAppStore.setState({
            expenses: [
                {
                    id: 'e1',
                    groupId: 'g1',
                    description: 'Dinner',
                    amount: 100,
                    currency: 'USD',
                    paidBy: 'me',
                    createdBy: 'me',
                    category: 'food',
                    expenseDate: new Date(),
                    isDeleted: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    splits: [
                        {
                            id: 's1',
                            expenseId: 'e1',
                            userId: 'me',
                            amount: 100,
                            createdAt: new Date(),
                        },
                    ],
                },
            ],
            messagesByGroup: {},
        });

        const { findByTestId, queryByTestId, getByTestId } = renderWithQuery(
            <GroupDetailScreen />,
        );
        await findByTestId('detail-search-input');
        fireEvent.changeText(getByTestId('detail-search-input'), 'xyz-no-match');
        expect(await findByTestId('empty-feed-clear-filters')).toBeTruthy();
        expect(queryByTestId('empty-feed-add-members')).toBeNull();
    });

    it('opens the composer when the Message quick action is tapped', async () => {
        const { findByTestId } = renderWithQuery(<GroupDetailScreen />);
        fireEvent.press(await findByTestId('detail-message-btn'));
        await waitFor(async () => {
            expect(await findByTestId('composer-input')).toBeTruthy();
        });
    });

    it('deletes settlement via Supabase mutation and closes the detail sheet', async () => {
        useAppStore.setState({ currentUser: { id: 'me', name: 'Me' } as never });
        mockFetchSettlements.mockResolvedValue([settlement]);

        const { findByTestId, findByText } = renderWithQuery(<GroupDetailScreen />);
        fireEvent.press(await findByTestId('settlement-press-st1'));
        fireEvent.press(await findByTestId('detail-delete-btn'));
        fireEvent.press(await findByText('common.delete'));

        await waitFor(() => {
            expect(mockDeleteSettlement).toHaveBeenCalledWith('st1');
        });
    });

    it('opens expense detail sheet and navigates to edit on edit icon', async () => {
        useAppStore.setState({
            currentUser: { id: 'me', name: 'Me' } as never,
            expenses: [
                {
                    id: 'e1',
                    groupId: 'g1',
                    description: 'Dinner',
                    amount: 100,
                    currency: 'USD',
                    paidBy: 'me',
                    createdBy: 'me',
                    category: 'food',
                    expenseDate: new Date(),
                    isDeleted: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    splits: [
                        {
                            id: 's1',
                            expenseId: 'e1',
                            userId: 'me',
                            amount: 100,
                            createdAt: new Date(),
                        },
                    ],
                },
            ],
            messagesByGroup: {},
        });

        const { findByText, findByTestId } = renderWithQuery(<GroupDetailScreen />);
        fireEvent.press(await findByText('Dinner'));
        await waitFor(async () => {
            expect(await findByTestId('detail-edit-btn')).toBeTruthy();
        });
        fireEvent.press(await findByTestId('detail-edit-btn'));
        expect(mockNavigate).toHaveBeenCalledWith('AddExpense', {
            expenseId: 'e1',
            groupId: 'g1',
        });
    });

    it('sends a new message via createMessage when composer submits', async () => {
        mockCreateMessage.mockResolvedValue({
            id: 'm1',
            groupId: 'g1',
            userId: 'me',
            body: 'hello',
            editedAt: null,
            isDeleted: false,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        const { findByTestId } = renderWithQuery(<GroupDetailScreen />);
        fireEvent.press(await findByTestId('detail-message-btn'));
        const input = await findByTestId('composer-input');
        fireEvent.changeText(input, 'hello');
        fireEvent.press(await findByTestId('composer-send'));
        await waitFor(() => expect(mockCreateMessage).toHaveBeenCalledWith('g1', 'hello'));
    });
});
