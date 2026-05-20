import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

jest.mock('expo-constants', () => ({
    __esModule: true,
    default: { expoConfig: { version: '1.0.0' } },
}));
jest.mock('expo-store-review', () => ({
    requestReview: jest.fn().mockResolvedValue(undefined),
    isAvailableAsync: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../../services/auth.service', () => ({ signOut: jest.fn() }));
jest.mock('../../../i18n', () => ({ changeLanguage: jest.fn().mockResolvedValue(false) }));
jest.mock('../../../services/account.service', () => ({
    deleteMyAccount: jest.fn().mockResolvedValue({ ok: true }),
}));
jest.mock('../../../services/users.service', () => ({
    updateUser: jest.fn(),
}));

import { SettingsScreen } from '../../../screens/profile/SettingsScreen';
import { useAppStore } from '../../../store';
import { updateUser } from '../../../services/users.service';

const mockUpdateUser = updateUser as jest.MockedFunction<typeof updateUser>;

let mockOpenURL: jest.SpyInstance;
let mockCanOpen: jest.SpyInstance;

beforeEach(() => {
    mockOpenURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    mockCanOpen = jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    mockUpdateUser.mockReset();
    mockUpdateUser.mockResolvedValue({ id: 'u1' } as any);
    useAppStore.setState({
        language: 'en',
        currentUser: { id: 'u1', email: 'a@x.com', name: 'Alice', inviteToken: 'alice123456', defaultCurrency: 'USD', language: 'en', createdAt: new Date(), updatedAt: new Date() },
    });
});

afterEach(() => {
    mockOpenURL.mockRestore();
    mockCanOpen.mockRestore();
});

describe('SettingsScreen (grouped, no notifications)', () => {
    it('renders all section titles', () => {
        const { getByText } = render(<SettingsScreen />);
        expect(getByText('settings.general')).toBeTruthy();
        expect(getByText('settings.support')).toBeTruthy();
        expect(getByText('settings.legal')).toBeTruthy();
        expect(getByText('settings.account')).toBeTruthy();
    });

    it('opens WhatsApp deeplink when canOpenURL is true', async () => {
        const { getByText } = render(<SettingsScreen />);
        fireEvent.press(getByText('settings.contactWhatsApp'));
        await waitFor(() => expect(mockOpenURL).toHaveBeenCalled());
        expect(mockOpenURL).toHaveBeenCalledWith('whatsapp://send?phone=972528616878');
    });

    it('falls back to wa.me when WhatsApp not installed', async () => {
        mockCanOpen.mockResolvedValueOnce(false);
        const { getByText } = render(<SettingsScreen />);
        fireEvent.press(getByText('settings.contactWhatsApp'));
        await waitFor(() => expect(mockOpenURL).toHaveBeenCalled());
        expect(mockOpenURL).toHaveBeenCalledWith('https://wa.me/972528616878');
    });

    it('renders version footer', () => {
        const { getByText, queryByText } = render(<SettingsScreen />);
        expect(getByText('settings.version')).toBeTruthy();
        expect(queryByText(/\{\{version\}\}/)).toBeNull();
    });

    it('renders Delete account row in Account section', () => {
        const { getByText } = render(<SettingsScreen />);
        expect(getByText('settings.deleteAccount')).toBeTruthy();
    });

    it('opens the warning sheet when Delete account is pressed', () => {
        const { getByText } = render(<SettingsScreen />);
        fireEvent.press(getByText('settings.deleteAccount'));
        expect(getByText('deleteAccount.warningTitle')).toBeTruthy();
    });

    it('renders default currency row in General section', () => {
        const { getByText, getByTestId } = render(<SettingsScreen />);
        expect(getByText('settings.defaultCurrency')).toBeTruthy();
        expect(getByTestId('settings-currency-row')).toBeTruthy();
    });

    it('opens currency picker when default currency row is pressed', () => {
        const { getByTestId, getByText } = render(<SettingsScreen />);
        fireEvent.press(getByTestId('settings-currency-row'));
        expect(getByText('currencyPicker.title')).toBeTruthy();
    });
});
