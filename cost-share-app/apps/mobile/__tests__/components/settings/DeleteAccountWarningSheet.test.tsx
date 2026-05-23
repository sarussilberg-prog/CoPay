import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { DeleteAccountWarningSheet } from '../../../components/settings/DeleteAccountWarningSheet';

describe('DeleteAccountWarningSheet', () => {
    it('renders title + 4 bullets when visible', () => {
        const { getByText } = render(
            <DeleteAccountWarningSheet visible onClose={() => {}} onContinue={() => {}} />,
        );
        expect(getByText('deleteAccount.warningTitle')).toBeTruthy();
        expect(getByText('deleteAccount.warningBullet1')).toBeTruthy();
        expect(getByText('deleteAccount.warningBullet2')).toBeTruthy();
        expect(getByText('deleteAccount.warningBullet3')).toBeTruthy();
        expect(getByText('deleteAccount.warningBullet4')).toBeTruthy();
    });

    it('does not render content when hidden', () => {
        const { queryByText } = render(
            <DeleteAccountWarningSheet visible={false} onClose={() => {}} onContinue={() => {}} />,
        );
        expect(queryByText('deleteAccount.warningTitle')).toBeNull();
    });

    it('Cancel triggers onClose', () => {
        const onClose = jest.fn();
        const { getByText } = render(
            <DeleteAccountWarningSheet visible onClose={onClose} onContinue={() => {}} />,
        );
        fireEvent.press(getByText('common.cancel'));
        expect(onClose).toHaveBeenCalled();
    });

    it('Continue triggers onContinue', () => {
        const onContinue = jest.fn();
        const { getByText } = render(
            <DeleteAccountWarningSheet visible onClose={() => {}} onContinue={onContinue} />,
        );
        fireEvent.press(getByText('deleteAccount.continueBtn'));
        expect(onContinue).toHaveBeenCalled();
    });

    it('renders the open-balances banner when openBalances.hasOpenBalances=true', () => {
        const onClose = jest.fn();
        const onContinue = jest.fn();
        const onSettleUp = jest.fn();
        const { getByText, getByTestId } = render(
            <DeleteAccountWarningSheet
                visible
                openBalances={{ hasOpenBalances: true, totalOwed: 100, totalOwing: 30, currency: 'ILS' }}
                onClose={onClose}
                onContinue={onContinue}
                onSettleUp={onSettleUp}
            />,
        );

        expect(getByText('deleteAccount.openBalancesWarningTitle')).toBeTruthy();
        fireEvent.press(getByTestId('delete-account-settle-up-btn'));
        expect(onSettleUp).toHaveBeenCalledTimes(1);
    });

    it('omits the banner when openBalances.hasOpenBalances=false', () => {
        const { queryByText } = render(
            <DeleteAccountWarningSheet
                visible
                openBalances={{ hasOpenBalances: false, totalOwed: 0, totalOwing: 0, currency: 'ILS' }}
                onClose={jest.fn()}
                onContinue={jest.fn()}
                onSettleUp={jest.fn()}
            />,
        );

        expect(queryByText('deleteAccount.openBalancesWarningTitle')).toBeNull();
    });
});
