/** @jest-environment jsdom */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
    useNavigation: () => ({ navigate: mockNavigate }),
}));

import { ContactSupportRow } from '../../../components/settings/ContactSupportRow';

describe('ContactSupportRow', () => {
    beforeEach(() => {
        mockNavigate.mockReset();
    });

    it('renders contact row', () => {
        const { getByTestId } = render(<ContactSupportRow />);
        expect(getByTestId('settings-contact-row')).toBeTruthy();
    });

    it('navigates to ContactUs on press', () => {
        const { getByTestId } = render(<ContactSupportRow />);
        fireEvent.press(getByTestId('settings-contact-row'));
        expect(mockNavigate).toHaveBeenCalledWith('ContactUs');
    });
});
