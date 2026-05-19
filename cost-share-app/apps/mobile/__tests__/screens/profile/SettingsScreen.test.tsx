import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Linking } from 'react-native';

jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.2.3' }));
jest.mock('expo-store-review', () => ({
    requestReview: jest.fn().mockResolvedValue(undefined),
    isAvailableAsync: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../../services/auth.service', () => ({ signOut: jest.fn() }));
jest.mock('../../../i18n', () => ({ changeLanguage: jest.fn().mockResolvedValue(false) }));

import { SettingsScreen } from '../../../screens/profile/SettingsScreen';
import { useAppStore } from '../../../store';

let mockOpenURL: jest.SpyInstance;

beforeEach(() => {
    mockOpenURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    useAppStore.setState({ language: 'en' });
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

    it('opens WhatsApp link', () => {
        const { getByText } = render(<SettingsScreen />);
        fireEvent.press(getByText('settings.contactWhatsApp'));
        expect(mockOpenURL).toHaveBeenCalledWith(expect.stringContaining('wa.me/972528616878'));
    });

    it('renders version footer', () => {
        const { getByText } = render(<SettingsScreen />);
        expect(getByText(/1\.2\.3/)).toBeTruthy();
    });
});
