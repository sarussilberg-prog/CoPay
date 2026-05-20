import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('../../../services/auth.service', () => ({
    signInWithGoogle: jest.fn(),
}));

jest.mock('../../../i18n', () => ({
    changeLanguage: jest.fn().mockResolvedValue(undefined),
}));

import { LoginScreen } from '../../../screens/auth/LoginScreen';
import { signInWithGoogle } from '../../../services/auth.service';
import { changeLanguage } from '../../../i18n';
import { useAppStore } from '../../../store';
import Toast from 'react-native-toast-message';

const mockSignIn = signInWithGoogle as jest.MockedFunction<typeof signInWithGoogle>;
const mockChangeLanguage = changeLanguage as jest.MockedFunction<typeof changeLanguage>;

describe('LoginScreen', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        useAppStore.setState({ language: 'en' });
    });

    it('renders the app logo, name and subtitle', () => {
        const { getByText, getByTestId } = render(<LoginScreen />);
        expect(getByTestId('app-logo')).toBeTruthy();
        expect(getByText('Kupa')).toBeTruthy();
        expect(getByText('auth.subtitle')).toBeTruthy();
    });

    it('opens language picker modal when language icon is pressed', () => {
        const { getByTestId, queryByTestId } = render(<LoginScreen />);
        expect(queryByTestId('login-language-picker')).toBeNull();
        fireEvent.press(getByTestId('login-language-button'));
        expect(getByTestId('login-language-picker')).toBeTruthy();
        expect(getByTestId('login-language-picker')).toHaveTextContent('settings.language');
    });

    it('changes language when Hebrew is selected from picker', () => {
        const { getByTestId, getByText } = render(<LoginScreen />);
        fireEvent.press(getByTestId('login-language-button'));
        fireEvent.press(getByText('profile.hebrew'));
        expect(mockChangeLanguage).toHaveBeenCalledWith('he');
    });

    it('renders the Google sign-in button', () => {
        const { getByText } = render(<LoginScreen />);
        expect(getByText('auth.signInWithGoogle')).toBeTruthy();
    });

    it('calls signInWithGoogle on button press', async () => {
        mockSignIn.mockResolvedValueOnce({ error: null });
        const { getByText } = render(<LoginScreen />);
        fireEvent.press(getByText('auth.signInWithGoogle'));
        await waitFor(() => expect(mockSignIn).toHaveBeenCalled());
    });

    it('shows an error toast when sign-in fails', async () => {
        mockSignIn.mockResolvedValueOnce({ error: new Error('boom') });
        const { getByText } = render(<LoginScreen />);
        fireEvent.press(getByText('auth.signInWithGoogle'));
        await waitFor(() =>
            expect(Toast.show).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'error' })
            )
        );
    });
});
