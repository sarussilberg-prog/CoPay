import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => {
    const actual = jest.requireActual('@react-navigation/native');
    return {
        ...actual,
        useNavigation: () => ({
            navigate: mockNavigate,
            goBack: mockGoBack,
            setOptions: jest.fn(),
        }),
        useRoute: () => ({ params: { groupId: 'g1' } }),
        useFocusEffect: (cb: () => void) => cb(),
        useIsFocused: () => true,
    };
});

jest.mock('../../../services/groups.service', () => ({
    createGroup: jest.fn(),
    getGroupById: jest.fn(),
    updateGroup: jest.fn(),
    deleteGroup: jest.fn().mockResolvedValue(true),
    removeGroupMember: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../../services/storage.service', () => ({
    uploadGroupImage: jest.fn(),
}));

jest.mock('../../../services/users.service', () => ({
    fetchGroupUsers: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../../services/settlements.service', () => ({
    fetchGroupPairwiseDebts: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../../components/AddMembersSheet', () => ({
    AddMembersSheet: () => null,
}));

jest.mock('../../../components/InviteLinkBlock', () => ({
    InviteLinkBlock: () => null,
}));

jest.mock('../../../lib/auth', () => ({
    getCurrentUserId: jest.fn().mockResolvedValue('me'),
}));

jest.mock('expo-image-picker', () => ({
    requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
    launchImageLibraryAsync: jest.fn().mockResolvedValue({ canceled: true }),
    MediaTypeOptions: { Images: 'images' },
}));


import { CreateGroupScreen as EditGroupScreen } from '../../../screens/groups/CreateGroupScreen';
import {
    getGroupById,
    updateGroup,
} from '../../../services/groups.service';
import { uploadGroupImage } from '../../../services/storage.service';

const mockGetGroup = getGroupById as jest.MockedFunction<typeof getGroupById>;
const mockUpdateGroup = updateGroup as jest.MockedFunction<typeof updateGroup>;
const mockUploadGroupImage = uploadGroupImage as jest.MockedFunction<typeof uploadGroupImage>;

const existingGroup = {
    id: 'g1',
    name: 'Old Name',
    description: 'Old desc',
    groupType: 'home' as const,
    defaultCurrency: 'EUR',
    inviteToken: 'xyz1234567',
    createdBy: 'u1',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
};

beforeEach(() => {
    mockNavigate.mockClear();
    mockGoBack.mockClear();
    mockGetGroup.mockReset();
    mockUpdateGroup.mockReset();
    mockUploadGroupImage.mockReset();
    mockUploadGroupImage.mockResolvedValue('https://cdn.example.com/group.jpg');
});

describe('EditGroupScreen', () => {
    it('loads existing group data into form', async () => {
        mockGetGroup.mockResolvedValueOnce(existingGroup);
        const { findByDisplayValue, queryByDisplayValue } = render(<EditGroupScreen />);
        expect(await findByDisplayValue('Old Name')).toBeTruthy();
        expect(queryByDisplayValue('Old desc')).toBeNull();
    });

    it('calls updateGroup with the new values', async () => {
        mockGetGroup.mockResolvedValueOnce(existingGroup);
        mockUpdateGroup.mockResolvedValue({ ...existingGroup, name: 'New' });
        const { findByDisplayValue, findByText } = render(<EditGroupScreen />);
        const nameInput = await findByDisplayValue('Old Name');
        fireEvent.changeText(nameInput, 'New');
        fireEvent.press(await findByText('common.save'));
        await waitFor(() =>
            expect(mockUpdateGroup).toHaveBeenCalledWith(
                'g1',
                expect.objectContaining({ name: 'New' })
            )
        );
        expect(mockUpdateGroup).toHaveBeenCalledTimes(1);
    });

    it('uploads image and updates imageUrl before metadata', async () => {
        mockGetGroup.mockResolvedValueOnce(existingGroup);
        mockUpdateGroup.mockResolvedValue({ ...existingGroup });

        const ImagePicker = require('expo-image-picker');
        ImagePicker.launchImageLibraryAsync.mockResolvedValueOnce({
            canceled: false,
            assets: [{ uri: 'file:///picked.jpg' }],
        });

        const { findByText, findByTestId } = render(<EditGroupScreen />);
        fireEvent.press(await findByTestId('group-form-cover'));
        fireEvent.press(await findByText('common.save'));

        await waitFor(() => expect(mockUploadGroupImage).toHaveBeenCalledWith('g1', 'file:///picked.jpg'));
        expect(mockUpdateGroup).toHaveBeenNthCalledWith(
            1,
            'g1',
            expect.objectContaining({ imageUrl: 'https://cdn.example.com/group.jpg' }),
        );
        expect(mockUpdateGroup).toHaveBeenCalledTimes(2);
    });

    it('cancel button navigates back', async () => {
        mockGetGroup.mockResolvedValueOnce(existingGroup);
        const { findByText } = render(<EditGroupScreen />);
        fireEvent.press(await findByText('common.cancel'));
        expect(mockGoBack).toHaveBeenCalled();
    });

    it('shows an error and skips update when image upload fails', async () => {
        mockGetGroup.mockResolvedValueOnce(existingGroup);
        mockUploadGroupImage.mockResolvedValueOnce(null);

        const ImagePicker = require('expo-image-picker');
        ImagePicker.launchImageLibraryAsync.mockResolvedValueOnce({
            canceled: false,
            assets: [{ uri: 'file:///picked.jpg' }],
        });

        const { findByDisplayValue, findByText, findByTestId } = render(<EditGroupScreen />);
        fireEvent.press(await findByTestId('group-form-cover'));
        fireEvent.changeText(await findByDisplayValue('Old Name'), 'New Name');
        fireEvent.press(await findByText('common.save'));

        await waitFor(() => expect(mockUploadGroupImage).toHaveBeenCalled());
        expect(mockUpdateGroup).not.toHaveBeenCalled();
        expect(mockGoBack).not.toHaveBeenCalled();
    });
});
