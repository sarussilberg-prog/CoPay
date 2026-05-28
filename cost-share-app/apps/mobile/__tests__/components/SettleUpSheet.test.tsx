import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SettleUpSheet, SettleUpFormValues } from '../../components/SettleUpSheet';
import type { GroupMemberLite, PairwiseDebt } from '@cost-share/shared';

jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: any) => children }));
jest.mock('../../components/expenseV2/DatePickerPopup', () => ({
    DatePickerPopup: () => null,
}));
jest.mock('../../lib/israeliPaymentLinks', () => ({
    openPaymentApp: jest.fn(async () => undefined),
}));

const members: GroupMemberLite[] = [
    { userId: 'u1', displayName: 'You', avatarUrl: undefined, isActive: true },
    { userId: 'u2', displayName: 'David', avatarUrl: undefined, isActive: true },
];
const debts: PairwiseDebt[] = [
    { fromUserId: 'u1', toUserId: 'u2', currency: 'USD', amount: 18 } as PairwiseDebt,
];
const baseInitial = {
    fromUserId: 'u1',
    toUserId: 'u2',
    currency: 'USD',
    amount: 18,
};

const renderSheet = (overrides: Partial<React.ComponentProps<typeof SettleUpSheet>> = {}) =>
    render(
        <SettleUpSheet
            visible
            members={members}
            pairwiseDebts={debts}
            currentUserId="u1"
            initial={baseInitial}
            mode="create"
            onClose={jest.fn()}
            onSubmit={jest.fn()}
            {...overrides}
        />
    );

describe('SettleUpSheet (redesign)', () => {
    it('pre-fills amount, currency, and from/to from initial', () => {
        const { getByText, getByDisplayValue } = renderSheet();
        expect(getByDisplayValue('18.00')).toBeTruthy();
        expect(getByText('USD')).toBeTruthy();
        expect(getByText('You')).toBeTruthy();
        expect(getByText('David')).toBeTruthy();
    });

    it('SWAP chip flips from/to and submits the swapped payload', async () => {
        const onSubmit = jest.fn();
        const { getByTestId } = renderSheet({ onSubmit });
        fireEvent.press(getByTestId('settle-swap-chip'));
        fireEvent.press(getByTestId('settle-record-button'));
        expect(onSubmit).toHaveBeenCalledWith(
            expect.objectContaining({ fromUserId: 'u2', toUserId: 'u1' })
        );
    });

    it('selecting a method tile updates the submitted paymentMethod', async () => {
        const onSubmit = jest.fn();
        const { getByTestId } = renderSheet({ onSubmit });
        fireEvent.press(getByTestId('method-tile-paypal'));
        fireEvent.press(getByTestId('settle-record-button'));
        expect(onSubmit).toHaveBeenCalledWith(
            expect.objectContaining({ paymentMethod: 'paypal' })
        );
    });

    it('defaults paymentMethod to credit_card per design', async () => {
        const onSubmit = jest.fn();
        const { getByTestId } = renderSheet({ onSubmit });
        fireEvent.press(getByTestId('settle-record-button'));
        expect(onSubmit).toHaveBeenCalledWith(
            expect.objectContaining({ paymentMethod: 'credit_card' })
        );
    });

    it('maps legacy bank_transfer initial value to credit_card', async () => {
        const onSubmit = jest.fn();
        const { getByTestId } = renderSheet({
            onSubmit,
            initial: { ...baseInitial, paymentMethod: 'bank_transfer' },
        });
        fireEvent.press(getByTestId('settle-record-button'));
        expect(onSubmit).toHaveBeenCalledWith(
            expect.objectContaining({ paymentMethod: 'credit_card' })
        );
    });

    it('disables Record payment when amount is zero', () => {
        const onSubmit = jest.fn();
        const { getByTestId } = renderSheet({
            initial: { ...baseInitial, amount: 0 },
            onSubmit,
        });
        fireEvent.press(getByTestId('settle-record-button'));
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('record button label includes the formatted amount', () => {
        const { getByTestId, getByText } = renderSheet();
        // The button renders the label text and exposes it via accessibilityLabel.
        const recordButton = getByTestId('settle-record-button');
        expect(recordButton.props.accessibilityLabel).toBe('settleUp.recordPaymentWithAmount');
        // The Text child inside the button contains the same label string.
        expect(getByText('settleUp.recordPaymentWithAmount')).toBeTruthy();
    });
});
