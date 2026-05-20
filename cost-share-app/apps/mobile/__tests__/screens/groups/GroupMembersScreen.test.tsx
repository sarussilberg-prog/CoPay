import React from 'react';
import { renderWithQuery } from '../../helpers/renderWithQuery';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => {
    const actual = jest.requireActual('@react-navigation/native');
    return {
        ...actual,
        useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
        useRoute: () => ({ params: { groupId: 'g1' } }),
        useFocusEffect: (cb: () => void) => cb(),
        useIsFocused: () => true,
    };
});

jest.mock('../../../services/groups.service', () => ({
    getGroupMembers: jest.fn(),
    addGroupMember: jest.fn(),
    removeGroupMember: jest.fn(),
}));

jest.mock('../../../services/users.service', () => ({
    fetchGroupUsers: jest.fn(),
}));

import { GroupMembersScreen } from '../../../screens/groups/GroupMembersScreen';
import { getGroupMembers } from '../../../services/groups.service';
import { fetchGroupUsers } from '../../../services/users.service';

const mockGetMembers = getGroupMembers as jest.MockedFunction<typeof getGroupMembers>;
const mockFetchGroupUsers = fetchGroupUsers as jest.MockedFunction<typeof fetchGroupUsers>;

const user = {
    id: 'u1',
    email: 'a@x.com',
    name: 'Alice',
    defaultCurrency: 'USD',
    language: 'en' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
};

const member = {
    id: 'm1',
    groupId: 'g1',
    userId: 'u1',
    role: 'member' as const,
    isActive: true,
    joinedAt: new Date(),
};

beforeEach(() => {
    mockGetMembers.mockReset();
    mockFetchGroupUsers.mockReset();
});

describe('GroupMembersScreen', () => {
    it('renders members with their names', async () => {
        mockGetMembers.mockResolvedValueOnce([member]);
        mockFetchGroupUsers.mockResolvedValueOnce([user]);
        const { findByText } = renderWithQuery(<GroupMembersScreen />);
        expect(await findByText('Alice')).toBeTruthy();
    });

    it('shows empty state when no members', async () => {
        mockGetMembers.mockResolvedValueOnce([]);
        mockFetchGroupUsers.mockResolvedValueOnce([]);
        const { findByText } = renderWithQuery(<GroupMembersScreen />);
        expect(await findByText('groups.noMembers')).toBeTruthy();
    });
});
