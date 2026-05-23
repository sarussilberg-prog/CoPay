import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

jest.mock('../../../services/auth.service', () => ({
    signInWithGoogle: jest.fn(),
}));

jest.mock('../../../i18n', () => ({
    changeLanguage: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../lib/openMailto', () => ({
    getSupportEmail: () => 'sarussilberg@gmail.com',
    openSupportContact: jest.fn(),
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
        useAppStore.setState({ language: 'en', pendingDeactivationNotice: false });
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
        mockSignIn.mockResolvedValueOnce({ error: { code: 'generic', message: 'boom' } });
        const { getByText } = render(<LoginScreen />);
        fireEvent.press(getByText('auth.signInWithGoogle'));
        await waitFor(() =>
            expect(Toast.show).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'error' })
            )
        );
    });

    it('shows account-deleted Alert when signInWithGoogle returns code=account_deleted', async () => {
        mockSignIn.mockResolvedValueOnce({
            error: { code: 'account_deleted', message: 'email_was_deleted' },
        });

        const alertSpy = jest
            .spyOn(require('react-native').Alert, 'alert')
            .mockImplementation(() => {});

        const { getByText } = render(<LoginScreen />);
        fireEvent.press(getByText('auth.signInWithGoogle'));

        await waitFor(() => expect(alertSpy).toHaveBeenCalled());

        const [titleArg] = alertSpy.mock.calls[0];
        expect(titleArg).toBe('deleteAccount.reSignupBlockedTitle');
        expect(Toast.show).not.toHaveBeenCalled();

        alertSpy.mockRestore();
    });

    it('shows the deactivation Alert and resets the flag when pendingDeactivationNotice flips on', async () => {
        const alertSpy = jest
            .spyOn(require('react-native').Alert, 'alert')
            .mockImplementation(() => {});

        const { rerender } = render(<LoginScreen />);
        expect(alertSpy).not.toHaveBeenCalled();

        // Simulate App.tsx flipping the flag after detecting a deactivated profile.
        act(() => {
            useAppStore.setState({ pendingDeactivationNotice: true });
        });
        rerender(<LoginScreen />);

        await waitFor(() => expect(alertSpy).toHaveBeenCalled());

        const [titleArg, bodyArg] = alertSpy.mock.calls[0];
        expect(titleArg).toBe('deleteAccount.deactivatedTitle');
        expect(bodyArg).toBe('deleteAccount.deactivatedMessage');
        // After display the flag is reset so the Alert doesn't loop on re-renders.
        expect(useAppStore.getState().pendingDeactivationNotice).toBe(false);

        alertSpy.mockRestore();
    });
});
