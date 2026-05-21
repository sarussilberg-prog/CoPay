import React from 'react';
import { render } from '@testing-library/react-native';
import { CurrencyAmountList } from '../../../components/balances/CurrencyAmountList';

describe('CurrencyAmountList', () => {
    it('renders a "No activity" line when amounts is empty', () => {
        const { getByText } = render(
            <CurrencyAmountList amounts={[]} testID="list" />,
        );
        expect(getByText('balances.noActivityInMode')).toBeTruthy();
    });

    it('renders a custom empty label when provided', () => {
        const { getByText } = render(
            <CurrencyAmountList amounts={[]} emptyLabel="Nothing here" />,
        );
        expect(getByText('Nothing here')).toBeTruthy();
    });

    it('renders one line per non-zero currency', () => {
        const { getByText, queryByText } = render(
            <CurrencyAmountList
                amounts={[
                    { currency: 'USD', amount: 12.5 },
                    { currency: 'ILS', amount: 33 },
                ]}
            />,
        );
        expect(getByText('USD 12.50')).toBeTruthy();
        expect(getByText('ILS 33.00')).toBeTruthy();
        expect(queryByText('balances.noActivityInMode')).toBeNull();
    });

    it('filters out amounts that round to zero', () => {
        const { getByText, queryByText } = render(
            <CurrencyAmountList
                amounts={[
                    { currency: 'USD', amount: 0.001 },
                    { currency: 'ILS', amount: 5 },
                ]}
            />,
        );
        expect(getByText('ILS 5.00')).toBeTruthy();
        expect(queryByText(/USD/)).toBeNull();
    });

    it('shows the empty state when every amount rounds to zero', () => {
        const { getByText } = render(
            <CurrencyAmountList
                amounts={[{ currency: 'USD', amount: 0.001 }]}
            />,
        );
        expect(getByText('balances.noActivityInMode')).toBeTruthy();
    });
});
