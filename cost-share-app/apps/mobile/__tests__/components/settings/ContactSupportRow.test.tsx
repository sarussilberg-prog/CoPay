/** @jest-environment jsdom */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

jest.mock('expo-clipboard', () => ({
    setStringAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../lib/openMailto', () => ({
    getSupportEmail: jest.fn(() => 'sarussilberg@gmail.com'),
    getSupportMailtoUrl: jest.fn(() => 'mailto:sarussilberg@gmail.com?subject=KupaPay%20Support'),
    openSupportContact: jest.fn().mockResolvedValue(undefined),
}));

import { ContactSupportRow } from '../../../components/settings/ContactSupportRow';
import { openSupportContact } from '../../../lib/openMailto';

const mockOpenSupportContact = openSupportContact as jest.MockedFunction<typeof openSupportContact>;
const originalPlatform = Platform.OS;

describe('ContactSupportRow', () => {
    afterEach(() => {
        Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
        mockOpenSupportContact.mockReset();
        mockOpenSupportContact.mockResolvedValue(undefined);
    });

    it('renders contact row on web without calling native handler', () => {
        Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
        const { getByTestId } = render(<ContactSupportRow />);
        expect(getByTestId('settings-contact-row')).toBeTruthy();
        expect(mockOpenSupportContact).not.toHaveBeenCalled();
    });

    it('opens support contact on native press', async () => {
        Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
        const { getByTestId } = render(<ContactSupportRow />);

        fireEvent.press(getByTestId('settings-contact-row'));
        await waitFor(() => expect(mockOpenSupportContact).toHaveBeenCalled());
    });
});
