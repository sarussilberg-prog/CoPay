import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithQuery } from '../../helpers/renderWithQuery';

jest.mock('../../../services/groups.service', () => ({
    createGroup: jest.fn(),
    updateGroup: jest.fn(),
}));
jest.mock('../../../services/storage.service', () => ({
    uploadGroupImage: jest.fn(),
}));
jest.mock('../../../lib/onboardingStorage', () => ({
    markPostLoginOnboardingComplete: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-image-picker', () => ({
    requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
    launchImageLibraryAsync: jest
        .fn()
        .mockResolvedValue({ canceled: false, assets: [{ uri: 'file://cover.jpg' }] }),
}));
jest.mock('../../../components/onboarding/OnboardingNameSuggestions', () => {
    const React = require('react');
    const { View } = require('react-native');
    function OnboardingNameSuggestions() {
        return <View testID="mock-name-suggestions" />;
    }
    return { OnboardingNameSuggestions };
});

jest.mock('../../../components/onboarding/OnboardingCreateGroupHero', () => {
    const React = require('react');
    const { View } = require('react-native');
    function OnboardingCreateGroupHero() {
        return <View testID="mock-onboarding-hero" />;
    }
    return { OnboardingCreateGroupHero };
});

jest.mock('../../../components/AddMembersSheet', () => {
    const React = require('react');
    const { Pressable, Text } = require('react-native');
    function AddMembersSheet({ onConfirmSelection }: any) {
        return (
            <Pressable
                testID="mock-confirm-members"
                onPress={() => onConfirmSelection([{ id: 'u2', name: 'Bob' }])}
            >
                <Text>confirm</Text>
            </Pressable>
        );
    }
    return { AddMembersSheet };
});

import { OnboardingCreateGroupScreen } from '../../../screens/onboarding/OnboardingCreateGroupScreen';
import { createGroup, updateGroup } from '../../../services/groups.service';
import { uploadGroupImage } from '../../../services/storage.service';
import { markPostLoginOnboardingComplete } from '../../../lib/onboardingStorage';
import { useAppStore } from '../../../store';

const mockCreateGroup = createGroup as jest.MockedFunction<typeof createGroup>;
const mockUpdateGroup = updateGroup as jest.MockedFunction<typeof updateGroup>;
const mockUploadGroupImage = uploadGroupImage as jest.MockedFunction<typeof uploadGroupImage>;

beforeEach(() => {
    mockCreateGroup.mockReset();
    mockUpdateGroup.mockReset();
    mockUploadGroupImage.mockReset();
    (markPostLoginOnboardingComplete as jest.Mock).mockClear();
    useAppStore.setState({
        currentUser: {
            id: 'u1', email: 'a@x.com', name: 'Alice', inviteToken: 'alice123456',
            defaultCurrency: 'ILS', language: 'he', isActive: true, isAdmin: false,
            createdAt: new Date(), updatedAt: new Date(),
        },
    });
});

describe('OnboardingCreateGroupScreen — interactive steps (current dev)', () => {
    it('renders the header and all five step cards (hero preserved)', () => {
        const { getByText, getByTestId } = renderWithQuery(
            <OnboardingCreateGroupScreen onDone={jest.fn()} />,
        );
        expect(getByText('onboarding.create.header')).toBeTruthy();
        ['name', 'category', 'currency', 'image', 'members'].forEach((k) =>
            expect(getByTestId(`onboarding-step-${k}`)).toBeTruthy(),
        );
    });

    it('opens the name step by default and gates submit on the name', () => {
        const { getByTestId } = renderWithQuery(
            <OnboardingCreateGroupScreen onDone={jest.fn()} />,
        );
        const submit = getByTestId('onboarding-create-submit');
        expect(submit.props.accessibilityState?.disabled).toBe(true);
        fireEvent.changeText(getByTestId('onboarding-step-name-input'), 'טיול לים');
        expect(submit.props.accessibilityState?.disabled).toBe(false);
    });

    it('expands a collapsed step on header tap and collapses the open one', () => {
        const { getByTestId, queryByTestId } = renderWithQuery(
            <OnboardingCreateGroupScreen onDone={jest.fn()} />,
        );
        expect(queryByTestId('onboarding-step-currency-body')).toBeNull();
        fireEvent.press(getByTestId('onboarding-step-currency-header'));
        expect(getByTestId('onboarding-step-currency-body')).toBeTruthy();
        expect(queryByTestId('onboarding-step-name-body')).toBeNull();
    });

    it('creates the group with name, type and currency on submit', async () => {
        mockCreateGroup.mockResolvedValueOnce({ id: 'g1' } as any);
        const onDone = jest.fn();
        const { getByTestId } = renderWithQuery(
            <OnboardingCreateGroupScreen onDone={onDone} />,
        );
        fireEvent.changeText(getByTestId('onboarding-step-name-input'), 'טיול לים');
        fireEvent.press(getByTestId('onboarding-create-submit'));
        await waitFor(() =>
            expect(mockCreateGroup).toHaveBeenCalledWith({
                name: 'טיול לים', groupType: 'trip', defaultCurrency: 'ILS', memberIds: [],
            }),
        );
        await waitFor(() => expect(markPostLoginOnboardingComplete).toHaveBeenCalled());
        await waitFor(() => expect(onDone).toHaveBeenCalled());
    });

    it('does not create when the name is empty', () => {
        const { getByTestId } = renderWithQuery(
            <OnboardingCreateGroupScreen onDone={jest.fn()} />,
        );
        fireEvent.press(getByTestId('onboarding-create-submit'));
        expect(mockCreateGroup).not.toHaveBeenCalled();
    });

    it('uploads the picked cover image and updates the group', async () => {
        mockCreateGroup.mockResolvedValueOnce({ id: 'g1' } as any);
        mockUploadGroupImage.mockResolvedValueOnce('https://cdn/cover.jpg');
        const { getByTestId } = renderWithQuery(
            <OnboardingCreateGroupScreen onDone={jest.fn()} />,
        );
        fireEvent.changeText(getByTestId('onboarding-step-name-input'), 'טיול לים');
        fireEvent.press(getByTestId('onboarding-step-image-header'));
        fireEvent.press(getByTestId('onboarding-step-cover'));
        await waitFor(() => expect(getByTestId('onboarding-step-cover-remove')).toBeTruthy());
        fireEvent.press(getByTestId('onboarding-create-submit'));
        await waitFor(() =>
            expect(mockUploadGroupImage).toHaveBeenCalledWith('g1', 'file://cover.jpg'),
        );
        await waitFor(() =>
            expect(mockUpdateGroup).toHaveBeenCalledWith('g1', { imageUrl: 'https://cdn/cover.jpg' }),
        );
    });

    it('includes added members in the createGroup memberIds', async () => {
        mockCreateGroup.mockResolvedValueOnce({ id: 'g1' } as any);
        const { getByTestId } = renderWithQuery(
            <OnboardingCreateGroupScreen onDone={jest.fn()} />,
        );
        fireEvent.changeText(getByTestId('onboarding-step-name-input'), 'טיול לים');
        fireEvent.press(getByTestId('mock-confirm-members'));
        fireEvent.press(getByTestId('onboarding-create-submit'));
        await waitFor(() =>
            expect(mockCreateGroup).toHaveBeenCalledWith(
                expect.objectContaining({ memberIds: ['u2'] }),
            ),
        );
    });
});
