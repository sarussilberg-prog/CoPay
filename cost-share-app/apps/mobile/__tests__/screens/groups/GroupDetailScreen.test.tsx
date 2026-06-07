import React from 'react';
import { waitFor, fireEvent } from '@testing-library/react-native';
import { renderWithQuery } from '../../helpers/renderWithQuery';
import * as platformAlertModule from '../../../lib/platformAlert';

// Auto-confirm any platformAlert popup by invoking the first destructive
// button's onPress (used for expense/settlement delete confirmation).
jest.spyOn(platformAlertModule, 'platformAlert').mockImplementation((_title, _message, buttons) => {
    const destructive = buttons?.find(b => b.style === 'destructive');
    destructive?.onPress?.();
});

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
    getGroupSimplifiedDebtsByCurrency: jest.fn().mockResolvedValue([]),
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

const mockShareGroupInvite = jest.fn().mockResolvedValue(undefined);

jest.mock('../../../services/invite.service', () => ({
    shareGroupInvite: (...args: unknown[]) => mockShareGroupInvite(...args),
}));

jest.mock('../../../hooks/useGroupMessagesRealtime', () => ({
    useGroupMessagesRealtime: jest.fn(),
}));

jest.mock('../../../hooks/useGroupExpensesRealtime', () => ({
    useGroupExpensesRealtime: jest.fn(),
}));

jest.mock('../../../hooks/useGroupSettlementsRealtime', () => ({
    useGroupSettlementsRealtime: jest.fn(),
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
import { useAppStore } from '../../../store';
import { queryClient } from '../../../lib/queryClient';
import { queryKeys } from '../../../hooks/queries/keys';

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
    mockGetGroup.mockResolvedValue(group);
    mockFetchExpenses.mockResolvedValue([]);
    mockFetchMessages.mockResolvedValue([]);
    mockFetchSettlements.mockResolvedValue([]);
    queryClient.clear();
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
        fireEvent.press(await findByTestId('appbar-back'));
        expect(mockGoBack).toHaveBeenCalled();
    });

    it('navigates to EditGroup via the kebab menu', async () => {
        const { findByTestId, findByText } = renderWithQuery(<GroupDetailScreen />);
        fireEvent.press(await findByTestId('appbar-menu'));
        fireEvent.press(await findByText('groups.editGroup'));
        expect(mockNavigate).toHaveBeenCalledWith('EditGroup', { groupId: 'g1' });
    });

    it('invokes shareGroupInvite when the share button is tapped', async () => {
        queryClient.setQueryData(queryKeys.groups, [group]);
        const { findByTestId } = renderWithQuery(<GroupDetailScreen />);
        fireEvent.press(await findByTestId('appbar-share'));
        await waitFor(() => expect(mockShareGroupInvite).toHaveBeenCalledWith('g1'));
    });

    it('invokes exportGroupCsv when Export is chosen from the group menu', async () => {
        const { findByTestId } = renderWithQuery(<GroupDetailScreen />);
        fireEvent.press(await findByTestId('appbar-menu'));
        fireEvent.press(await findByTestId('group-menu-export'));
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
        queryClient.setQueryData(queryKeys.groups, [group]);

        mockFetchExpenses.mockImplementation(() => new Promise(() => {}));
        mockFetchMessages.mockImplementation(() => new Promise(() => {}));

        const { findByTestId, queryByTestId } = renderWithQuery(<GroupDetailScreen />);
        expect(await findByTestId('detail-search-input')).toBeTruthy();
        expect(await findByTestId('feed-loading')).toBeTruthy();
        expect(queryByTestId('empty-feed-add-members')).toBeNull();
    });

    it('shows no-results state when search filters out all feed items', async () => {
        const seedExpense = {
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
        };
        queryClient.setQueryData(queryKeys.groupExpenses('g1'), [seedExpense]);
        // refetchOnMount: 'always' fires a background refetch on mount;
        // mock the service so the cache isn't overwritten with [].
        mockFetchExpenses.mockResolvedValue([seedExpense] as any);

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

        const { findByTestId } = renderWithQuery(<GroupDetailScreen />);
        fireEvent.press(await findByTestId('settlement-press-st1'));
        fireEvent.press(await findByTestId('detail-kebab-btn'));
        fireEvent.press(await findByTestId('detail-delete-btn'));
        // platformAlert is auto-confirmed by the mock at the top of this file.

        await waitFor(() => {
            expect(mockDeleteSettlement).toHaveBeenCalledWith('st1');
        });
    });

    it('opens expense detail sheet and navigates to edit on edit icon', async () => {
        useAppStore.setState({
            currentUser: { id: 'me', name: 'Me' } as never,
        });
        const seedExpense = {
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
        };
        queryClient.setQueryData(queryKeys.groupExpenses('g1'), [seedExpense]);
        // refetchOnMount: 'always' fires a background refetch — mock the
        // service so the cache isn't overwritten.
        mockFetchExpenses.mockResolvedValue([seedExpense] as any);

        const { findByText, findByTestId } = renderWithQuery(<GroupDetailScreen />);
        fireEvent.press(await findByTestId(`expense-row-e1`));
        await waitFor(async () => {
            expect(await findByTestId('detail-kebab-btn')).toBeTruthy();
        });
        fireEvent.press(await findByTestId('detail-kebab-btn'));
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
