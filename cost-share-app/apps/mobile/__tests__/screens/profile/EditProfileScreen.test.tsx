import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

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

jest.mock('../../../services/users.service', () => ({
    updateUser: jest.fn(),
}));
jest.mock('../../../services/storage.service', () => ({
    uploadProfileImage: jest.fn(),
}));
jest.mock('../../../components/ProfileImagePicker', () => ({
    ProfileImagePicker: ({ onChange }: { onChange: (uri: string | null) => void }) => {
        const { TouchableOpacity, Text } = require('react-native');
        return (
            <TouchableOpacity
                testID="profile-image-picker-mock"
                onPress={() => onChange('file:///new-avatar.jpg')}
            >
                <Text>mock picker</Text>
            </TouchableOpacity>
        );
    },
}));

import { EditProfileScreen } from '../../../screens/profile/EditProfileScreen';
import { useAppStore } from '../../../store';
import { updateUser } from '../../../services/users.service';
import { uploadProfileImage } from '../../../services/storage.service';

const mockUpdate = updateUser as jest.MockedFunction<typeof updateUser>;
const mockUploadProfileImage = uploadProfileImage as jest.MockedFunction<typeof uploadProfileImage>;

beforeEach(() => {
    mockNavigate.mockClear();
    mockGoBack.mockClear();
    mockUpdate.mockReset();
    mockUploadProfileImage.mockReset();
    mockUploadProfileImage.mockResolvedValue('https://cdn.example.com/avatar.jpg');
    useAppStore.setState({
        currentUser: {
            id: 'u1',
            email: 'a@x.com',
            name: 'Alice',
            phone: '555-1212',
            inviteToken: 'alice123456',
            defaultCurrency: 'USD',
            language: 'en',
            isActive: true,
            isAdmin: false,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });
});

describe('EditProfileScreen', () => {
    it('pre-fills name and phone from currentUser', () => {
        const { getByDisplayValue } = render(<EditProfileScreen />);
        expect(getByDisplayValue('Alice')).toBeTruthy();
        expect(getByDisplayValue('555-1212')).toBeTruthy();
    });

    it('shows nameRequired error when name is cleared', async () => {
        const { getByDisplayValue, getByText, findByText } = render(<EditProfileScreen />);
        fireEvent.changeText(getByDisplayValue('Alice'), '');
        fireEvent.press(getByText('common.save'));
        expect(await findByText('profile.nameRequired')).toBeTruthy();
        expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('calls updateUser with the new values', async () => {
        mockUpdate.mockResolvedValueOnce({ id: 'u1' } as any);
        const { getByDisplayValue, getByText } = render(<EditProfileScreen />);
        fireEvent.changeText(getByDisplayValue('Alice'), 'Bob');
        fireEvent.press(getByText('common.save'));
        await waitFor(() =>
            expect(mockUpdate).toHaveBeenCalledWith(
                'u1',
                expect.objectContaining({ name: 'Bob' })
            )
        );
    });

    it('cancel navigates back', () => {
        const { getByText } = render(<EditProfileScreen />);
        fireEvent.press(getByText('common.cancel'));
        expect(mockGoBack).toHaveBeenCalled();
    });

    it('renders profile image picker', () => {
        const { getByTestId } = render(<EditProfileScreen />);
        expect(getByTestId('profile-image-picker-mock')).toBeTruthy();
    });

    it('uploads avatar and saves avatarUrl when a new photo is selected', async () => {
        mockUpdate.mockResolvedValueOnce({ id: 'u1' } as any);
        const { getByTestId, getByText } = render(<EditProfileScreen />);
        fireEvent.press(getByTestId('profile-image-picker-mock'));
        fireEvent.press(getByText('common.save'));
        await waitFor(() => expect(mockUploadProfileImage).toHaveBeenCalledWith('u1', 'file:///new-avatar.jpg'));
        await waitFor(() =>
            expect(mockUpdate).toHaveBeenCalledWith(
                'u1',
                expect.objectContaining({ avatarUrl: 'https://cdn.example.com/avatar.jpg' })
            )
        );
    });
});
