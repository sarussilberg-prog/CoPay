import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { DeleteAccountConfirmSheet } from '../../../components/settings/DeleteAccountConfirmSheet';

describe('DeleteAccountConfirmSheet', () => {
    it('renders title + email hint when visible', () => {
        const { getByText } = render(
            <DeleteAccountConfirmSheet
                visible
                expectedEmail="a@x.com"
                onClose={() => {}}
                onConfirm={async () => {}}
            />,
        );
        expect(getByText('deleteAccount.confirmTitle')).toBeTruthy();
        expect(getByText('a@x.com')).toBeTruthy();
    });

    it('Delete button is disabled until typed email matches (case-insensitive, trimmed)', async () => {
        const onConfirm = jest.fn().mockResolvedValue(undefined);
        const { getByPlaceholderText, getByTestId } = render(
            <DeleteAccountConfirmSheet
                visible
                expectedEmail="a@x.com"
                onClose={() => {}}
                onConfirm={onConfirm}
            />,
        );

        const input = getByPlaceholderText('profile.email');

        fireEvent.press(getByTestId('delete-account-confirm-btn'));
        expect(onConfirm).not.toHaveBeenCalled();

        fireEvent.changeText(input, 'wrong');
        fireEvent.press(getByTestId('delete-account-confirm-btn'));
        expect(onConfirm).not.toHaveBeenCalled();

        fireEvent.changeText(input, '  A@X.COM  ');
        fireEvent.press(getByTestId('delete-account-confirm-btn'));
        await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    });

    it('does not render when hidden', () => {
        const { queryByText } = render(
            <DeleteAccountConfirmSheet
                visible={false}
                expectedEmail="a@x.com"
                onClose={() => {}}
                onConfirm={async () => {}}
            />,
        );
        expect(queryByText('deleteAccount.confirmTitle')).toBeNull();
    });
});
