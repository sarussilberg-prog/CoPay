import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

jest.mock('../../../services/auth.service', () => ({
    signInWithGoogle: jest.fn(),
    signInWithApple: jest.fn(),
}));

jest.mock('../../../hooks/useChangeAppLanguage', () => ({
    useChangeAppLanguage: jest.fn(() => jest.fn().mockResolvedValue(undefined)),
}));

jest.mock('../../../lib/openMailto', () => ({
    getSupportEmail: () => 'sarussilberg@gmail.com',
    openSupportContact: jest.fn(),
}));

jest.mock('../../../lib/deactivationNoticeStorage', () => ({
    consumeDeactivationNoticePending: jest.fn().mockResolvedValue(false),
    clearDeactivationNoticePending: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../lib/appToast', () => ({
    showAppToast: jest.fn(),
    showErrorToast: jest.fn(),
}));

import { LoginScreen } from '../../../screens/auth/LoginScreen';
import { signInWithGoogle } from '../../../services/auth.service';
import { useChangeAppLanguage } from '../../../hooks/useChangeAppLanguage';
import { useAppStore } from '../../../store';
import {
    clearDeactivationNoticePending,
    consumeDeactivationNoticePending,
} from '../../../lib/deactivationNoticeStorage';
import { showAppToast, showErrorToast } from '../../../lib/appToast';

const mockSignIn = signInWithGoogle as jest.MockedFunction<typeof signInWithGoogle>;
const mockUseChangeAppLanguage = useChangeAppLanguage as jest.MockedFunction<
    typeof useChangeAppLanguage
>;
const mockConsumeNotice = consumeDeactivationNoticePending as jest.MockedFunction<
    typeof consumeDeactivationNoticePending
>;

describe('LoginScreen', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        useAppStore.setState({ language: 'en', pendingDeactivationNotice: false });
        mockConsumeNotice.mockResolvedValue(false);
        mockUseChangeAppLanguage.mockImplementation(() =>
            jest.fn().mockResolvedValue(undefined),
        );
    });

    it('renders the app logo, name, tagline and feature chips', () => {
        const { getByText, getByTestId } = render(<LoginScreen />);
        expect(getByTestId('login-screen')).toBeTruthy();
        expect(getByTestId('app-logo')).toBeTruthy();
        expect(getByText('CoPay')).toBeTruthy();
        expect(getByText('auth.tagline')).toBeTruthy();
        expect(getByTestId('login-feature-chips')).toBeTruthy();
    });

    it('opens language picker modal when language icon is pressed', () => {
        const { getByTestId, queryByTestId } = render(<LoginScreen />);
        expect(queryByTestId('login-language-picker')).toBeNull();
        fireEvent.press(getByTestId('login-language-button'));
        expect(getByTestId('login-language-picker')).toBeTruthy();
        expect(getByTestId('login-language-picker')).toHaveTextContent('settings.language');
    });

    it('changes language when Hebrew is selected from picker', () => {
        const changeAppLanguage = jest.fn().mockResolvedValue(undefined);
        mockUseChangeAppLanguage.mockReturnValue(changeAppLanguage);

        const { getByTestId, getByText } = render(<LoginScreen />);
        fireEvent.press(getByTestId('login-language-button'));
        fireEvent.press(getByText('profile.hebrew'));
        expect(changeAppLanguage).toHaveBeenCalledWith('he');
    });

    it('renders the Google sign-in button', () => {
        const { getByTestId, getByText } = render(<LoginScreen />);
        expect(getByTestId('login-google-button')).toBeTruthy();
        expect(getByText('auth.signInWithGoogle')).toBeTruthy();
    });

    it('calls signInWithGoogle on button press', async () => {
        mockSignIn.mockResolvedValueOnce({ error: null });
        const { getByTestId } = render(<LoginScreen />);
        fireEvent.press(getByTestId('login-google-button'));
        await waitFor(() => expect(mockSignIn).toHaveBeenCalled());
    });

    it('shows an error toast when sign-in fails', async () => {
        mockSignIn.mockResolvedValueOnce({ error: { code: 'generic', message: 'boom' } });
        const { getByTestId } = render(<LoginScreen />);
        fireEvent.press(getByTestId('login-google-button'));
        await waitFor(() =>
            expect(showErrorToast).toHaveBeenCalledWith(
                'auth.signInError',
                undefined,
                'boom',
            ),
        );
    });

    it('shows deleted-account dialog when signInWithGoogle returns code=account_deleted', async () => {
        mockSignIn.mockResolvedValueOnce({
            error: { code: 'account_deleted', message: 'email_was_deleted' },
        });

        const { getByTestId, findByText } = render(<LoginScreen />);
        fireEvent.press(getByTestId('login-google-button'));

        expect(await findByText('deleteAccount.deactivatedTitle')).toBeTruthy();
        expect(showAppToast).not.toHaveBeenCalled();
        expect(showErrorToast).not.toHaveBeenCalled();
    });

    it('shows deleted-account dialog when pendingDeactivationNotice flips on', async () => {
        const { rerender, findByText } = render(<LoginScreen />);

        act(() => {
            useAppStore.setState({ pendingDeactivationNotice: true });
        });
        rerender(<LoginScreen />);

        expect(await findByText('deleteAccount.deactivatedTitle')).toBeTruthy();
        expect(clearDeactivationNoticePending).toHaveBeenCalled();
        expect(useAppStore.getState().pendingDeactivationNotice).toBe(false);
    });

    it('shows deleted-account dialog when persisted notice is consumed on mount', async () => {
        mockConsumeNotice.mockResolvedValueOnce(true);

        const { findByText } = render(<LoginScreen />);

        expect(await findByText('deleteAccount.deactivatedTitle')).toBeTruthy();
    });
});
