import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockReplace = jest.fn();

jest.mock('@react-navigation/native', () => {
    const actual = jest.requireActual('@react-navigation/native');
    return {
        ...actual,
        useNavigation: () => ({
            navigate: mockNavigate,
            goBack: mockGoBack,
            replace: mockReplace,
        }),
        useRoute: () => ({ params: {} }),
        useFocusEffect: (cb: () => void) => cb(),
        useIsFocused: () => true,
    };
});

jest.mock('../../../services/groups.service', () => ({
    createGroup: jest.fn(),
    updateGroup: jest.fn(),
}));

jest.mock('../../../services/storage.service', () => ({
    uploadGroupImage: jest.fn(),
}));

jest.mock('expo-image-picker', () => ({
    requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
    launchImageLibraryAsync: jest.fn().mockResolvedValue({ canceled: true }),
    MediaTypeOptions: { Images: 'images' },
}));

jest.mock('../../../services/users.service', () => ({
    fetchUsers: jest.fn().mockResolvedValue([]),
    fetchGroupUsers: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../../services/settlements.service', () => ({
    fetchGroupPairwiseDebts: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../../components/AddMembersSheet', () => ({
    AddMembersSheet: () => null,
}));

import { CreateGroupScreen } from '../../../screens/groups/CreateGroupScreen';
import { createGroup } from '../../../services/groups.service';
import { useAppStore } from '../../../store';

const mockCreateGroup = createGroup as jest.MockedFunction<typeof createGroup>;

beforeEach(() => {
    mockNavigate.mockClear();
    mockGoBack.mockClear();
    mockReplace.mockClear();
    mockCreateGroup.mockClear();
    useAppStore.setState({
        currentUser: {
            id: 'u1',
            email: 'a@x.com',
            name: 'Alice',
            inviteToken: 'alice123456',
            defaultCurrency: 'USD',
            language: 'en',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });
});

describe('CreateGroupScreen', () => {
    it('renders form fields', async () => {
        const { findByText, queryByText } = render(<CreateGroupScreen />);
        expect(await findByText('groups.groupName')).toBeTruthy();
        expect(await findByText('groups.groupType')).toBeTruthy();
        expect(queryByText('groups.description')).toBeNull();
    });

    it('shows validation error for empty name on submit', async () => {
        const { findAllByText, findByText } = render(<CreateGroupScreen />);
        const buttons = await findAllByText('groups.createGroup');
        fireEvent.press(buttons[buttons.length - 1]);
        expect(await findByText('groups.nameRequired')).toBeTruthy();
        expect(mockCreateGroup).not.toHaveBeenCalled();
    });

    it('calls createGroup with the form data and enters the new group on success', async () => {
        mockCreateGroup.mockResolvedValueOnce({ id: 'g1' } as any);
        const { findAllByText, getByPlaceholderText } = render(<CreateGroupScreen />);
        fireEvent.changeText(
            getByPlaceholderText('groups.enterGroupName'),
            'My Group'
        );
        const buttons = await findAllByText('groups.createGroup');
        fireEvent.press(buttons[buttons.length - 1]);
        await waitFor(() => expect(mockCreateGroup).toHaveBeenCalled());
        expect(mockCreateGroup).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'My Group' })
        );
        await waitFor(() =>
            expect(mockReplace).toHaveBeenCalledWith('GroupDetail', { groupId: 'g1' })
        );
    });
});
