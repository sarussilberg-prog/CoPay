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
    getGroupMembers: jest.fn().mockResolvedValue([]),
    getGroupBalances: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../../services/expenses.service', () => ({
    fetchExpenses: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../../services/messages.service', () => ({
    fetchMessages: jest.fn().mockResolvedValue([]),
    createMessage: jest.fn(),
    updateMessage: jest.fn(),
    deleteMessage: jest.fn(),
}));

jest.mock('../../../services/settlements.service', () => ({
    fetchSettlements: jest.fn().mockResolvedValue([]),
    fetchGroupPairwiseDebts: jest.fn().mockResolvedValue([]),
    createSettlement: jest.fn(),
    updateSettlement: jest.fn(),
    deleteSettlement: jest.fn(),
}));

jest.mock('../../../services/group-share.service', () => ({
    exportGroupCsv: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../../hooks/useGroupMessagesRealtime', () => ({
    useGroupMessagesRealtime: jest.fn(),
}));

jest.mock('../../../lib/auth', () => ({
    getCurrentUserId: jest.fn().mockResolvedValue('me'),
}));

jest.mock('../../../lib/supabase', () => ({
    supabase: {
        from: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
                in: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
        }),
    },
}));

jest.mock('../../../components/AddMembersSheet', () => ({
    AddMembersSheet: () => null,
}));

import { GroupDetailScreen } from '../../../screens/groups/GroupDetailScreen';
import { getGroupById } from '../../../services/groups.service';
import { fetchMessages, createMessage } from '../../../services/messages.service';
import { exportGroupCsv } from '../../../services/group-share.service';
import { useAppStore } from '../../../store';

const mockGetGroup = getGroupById as jest.MockedFunction<typeof getGroupById>;
const mockFetchMessages = fetchMessages as jest.MockedFunction<typeof fetchMessages>;
const mockCreateMessage = createMessage as jest.MockedFunction<typeof createMessage>;
const mockExport = exportGroupCsv as jest.MockedFunction<typeof exportGroupCsv>;

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
};

beforeEach(() => {
    jest.clearAllMocks();
    mockGetGroup.mockResolvedValue(group);
    mockFetchMessages.mockResolvedValue([]);
    useAppStore.setState({
        expenses: [],
        messagesByGroup: {},
    });
});

describe('GroupDetailScreen', () => {
    it('renders the hero with the group name', async () => {
        const { findByText } = renderWithQuery(<GroupDetailScreen />);
        expect(await findByText('Trip')).toBeTruthy();
    });

    it('navigates back when the hero back button is tapped', async () => {
        const { findByTestId } = renderWithQuery(<GroupDetailScreen />);
        fireEvent.press(await findByTestId('hero-back-btn'));
        expect(mockGoBack).toHaveBeenCalled();
    });

    it('navigates to EditGroup via the kebab menu', async () => {
        const { findByTestId, findByText } = renderWithQuery(<GroupDetailScreen />);
        fireEvent.press(await findByTestId('hero-settings-btn'));
        fireEvent.press(await findByText('groups.editGroup'));
        expect(mockNavigate).toHaveBeenCalledWith('EditGroup', { groupId: 'g1' });
    });

    it('renders the sticky Add expense footer', async () => {
        const { findByTestId } = renderWithQuery(<GroupDetailScreen />);
        expect(await findByTestId('detail-add-expense')).toBeTruthy();
    });

    it('shows the empty feed card when there is no feed content', async () => {
        const { findByTestId } = renderWithQuery(<GroupDetailScreen />);
        expect(await findByTestId('empty-feed-add-members')).toBeTruthy();
    });

    it('invokes exportGroupCsv when the Export quick action is tapped', async () => {
        const { findByTestId } = renderWithQuery(<GroupDetailScreen />);
        fireEvent.press(await findByTestId('qa-export'));
        await waitFor(() => expect(mockExport).toHaveBeenCalled());
    });

    it('opens the composer when the Message quick action is tapped', async () => {
        const { findByTestId } = renderWithQuery(<GroupDetailScreen />);
        fireEvent.press(await findByTestId('detail-message-btn'));
        await waitFor(async () => {
            expect(await findByTestId('composer-input')).toBeTruthy();
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
