import React from 'react';
import { render } from '@testing-library/react-native';
import { BalanceChip } from '../../components/BalanceChip';

describe('BalanceChip', () => {
    it('shows Settled label when display is undefined', () => {
        const { getByText } = render(<BalanceChip defaultCurrency="USD" />);
        expect(getByText('groups.card.settled')).toBeTruthy();
    });

    it('shows Settled label when net rounds to zero', () => {
        const { getByText } = render(
            <BalanceChip
                defaultCurrency="USD"
                display={{ net: 0.004, currency: 'USD', isConverted: false }}
            />,
        );
        expect(getByText('groups.card.settled')).toBeTruthy();
    });

    it('formats a positive balance with + and the display currency', () => {
        const { getByText } = render(
            <BalanceChip
                defaultCurrency="USD"
                display={{ net: 17, currency: 'ILS', isConverted: true }}
            />,
        );
        expect(getByText('+ILS 17.00')).toBeTruthy();
    });

    it('formats a negative balance using an absolute value', () => {
        const { getByText } = render(
            <BalanceChip
                defaultCurrency="USD"
                display={{ net: -8.5, currency: 'USD', isConverted: false }}
            />,
        );
        expect(getByText('−USD 8.50')).toBeTruthy();
    });
});
