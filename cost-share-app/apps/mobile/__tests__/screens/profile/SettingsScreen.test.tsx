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
jest.mock('../../../i18n', () => ({ changeLanguage: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../services/account.service', () => ({
    deleteMyAccount: jest.fn().mockResolvedValue({ ok: true }),
    getMyOpenBalances: jest.fn(),
}));
jest.mock('../../../services/users.service', () => ({
    updateUser: jest.fn(),
}));

jest.mock('expo-clipboard', () => ({
    setStringAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../lib/openMailto', () => ({
    getSupportEmail: jest.fn(() => 'sarussilberg@gmail.com'),
    getSupportMailtoUrl: jest.fn(() => 'mailto:sarussilberg@gmail.com?subject=Kupa%20Support'),
    openSupportContact: jest.fn().mockResolvedValue(undefined),
    DEFAULT_SUPPORT_EMAIL: 'sarussilberg@gmail.com',
}));

// LegalDocumentSheet depends on react-query (QueryClientProvider) which is not
// wired up in these unit tests. Replace it with a no-op stub — the legal sheet
// itself is covered by its own component tests.
jest.mock('../../../components/settings/LegalDocumentSheet', () => ({
    LegalDocumentSheet: () => null,
}));

import { SettingsScreen } from '../../../screens/profile/SettingsScreen';
import { useAppStore } from '../../../store';
import { updateUser } from '../../../services/users.service';
import { openSupportContact } from '../../../lib/openMailto';
import { getMyOpenBalances } from '../../../services/account.service';

const mockOpenSupportContact = openSupportContact as jest.MockedFunction<typeof openSupportContact>;

const mockUpdateUser = updateUser as jest.MockedFunction<typeof updateUser>;

const mockGetMyOpenBalances = getMyOpenBalances as jest.MockedFunction<typeof getMyOpenBalances>;

let mockOpenURL: jest.SpyInstance;

beforeEach(() => {
    mockOpenURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    mockOpenSupportContact.mockReset();
    mockOpenSupportContact.mockResolvedValue(undefined);
    mockUpdateUser.mockReset();
    mockUpdateUser.mockResolvedValue({ id: 'u1' } as any);
    mockGetMyOpenBalances.mockReset();
    mockGetMyOpenBalances.mockResolvedValue({
        hasOpenBalances: false,
        totalOwed: 0,
        totalOwing: 0,
        currency: 'ILS',
    });
    useAppStore.setState({
        language: 'en',
        currentUser: { id: 'u1', email: 'a@x.com', name: 'Alice', inviteToken: 'alice123456', defaultCurrency: 'USD', language: 'en', isActive: true, isAdmin: false, createdAt: new Date(), updatedAt: new Date() },
    });
});

afterEach(() => {
    mockOpenURL.mockRestore();
});

describe('SettingsScreen (grouped, no notifications)', () => {
    it('renders all section titles', () => {
        const { getByText } = render(<SettingsScreen />);
        expect(getByText('settings.general')).toBeTruthy();
        expect(getByText('settings.support')).toBeTruthy();
        expect(getByText('settings.legal')).toBeTruthy();
        expect(getByText('settings.account')).toBeTruthy();
    });

    it('opens support contact when Contact us is pressed', async () => {
        const { getByTestId } = render(<SettingsScreen />);
        fireEvent.press(getByTestId('settings-contact-row'));
        await waitFor(() => expect(mockOpenSupportContact).toHaveBeenCalled());
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

    it('opens the warning sheet when Delete account is pressed', async () => {
        const { getByText } = render(<SettingsScreen />);
        fireEvent.press(getByText('settings.deleteAccount'));
        await waitFor(() => expect(getByText('deleteAccount.warningTitle')).toBeTruthy());
    });

    it('fetches open balances when delete-account row is tapped', async () => {
        mockGetMyOpenBalances.mockResolvedValue({
            hasOpenBalances: true,
            totalOwed: 50,
            totalOwing: 0,
            currency: 'ILS',
        });

        const { getByText } = render(<SettingsScreen />);

        fireEvent.press(getByText('settings.deleteAccount'));

        await waitFor(() => expect(mockGetMyOpenBalances).toHaveBeenCalledTimes(1));
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
