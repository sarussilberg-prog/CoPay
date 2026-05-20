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
});
