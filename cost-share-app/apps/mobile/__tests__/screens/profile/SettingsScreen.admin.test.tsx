jest.mock('../../../store', () => {
    const state: any = {
        language: 'he',
        currentUser: null,
        setLanguage: jest.fn(),
        setCurrentUser: jest.fn(),
    };
    const useAppStore = (selector: any) => selector(state);
    (useAppStore as any).getState = () => state;
    (useAppStore as any).__setUser = (u: any) => { state.currentUser = u; };
    return { useAppStore };
});

jest.mock('@react-navigation/native', () => ({
    useNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock('../../../services/account.service', () => ({
    deleteMyAccount: jest.fn(),
    getMyOpenBalances: jest.fn().mockResolvedValue(null),
}));

// LegalDocumentSheet pulls in react-query without a provider in this unit test.
// Stub it out — it has its own dedicated component tests.
jest.mock('../../../components/settings/LegalDocumentSheet', () => ({
    LegalDocumentSheet: () => null,
}));

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SettingsScreen } from '../../../screens/profile/SettingsScreen';
import { useAppStore } from '../../../store';

const baseUser = {
    id: 'u1', name: 'Sar', email: 'sar@test.local', inviteToken: 'tok',
    defaultCurrency: 'ILS', language: 'he', isActive: true, isAdmin: false,
    createdAt: new Date(), updatedAt: new Date(),
};

describe('SettingsScreen admin row', () => {
    it('hides the admin row when currentUser.isAdmin is false', () => {
        (useAppStore as any).__setUser({ ...baseUser, isAdmin: false });
        render(<SettingsScreen />);
        expect(screen.queryByTestId('settings-admin-portal')).toBeNull();
    });

    it('shows the admin row when currentUser.isAdmin is true', () => {
        (useAppStore as any).__setUser({ ...baseUser, isAdmin: true });
        render(<SettingsScreen />);
        expect(screen.getByTestId('settings-admin-portal')).toBeTruthy();
    });
});
