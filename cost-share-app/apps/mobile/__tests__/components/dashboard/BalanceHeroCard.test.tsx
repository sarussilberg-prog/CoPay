import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { BalanceHeroCard } from '../../../components/dashboard/BalanceHeroCard';

const single = { totalOwed: 50, totalOwedToUser: 100, defaultCurrency: 'ILS',
    byCurrency: [{ currency: 'ILS', owed: 50, owedToUser: 100 }] };
const zero = { totalOwed: 0, totalOwedToUser: 0, defaultCurrency: 'ILS', byCurrency: [] };
const multi = { totalOwed: null, totalOwedToUser: null, defaultCurrency: 'ILS',
    byCurrency: [{ currency: 'ILS', owed: 0, owedToUser: 100 }, { currency: 'USD', owed: 150, owedToUser: 0 }] };

describe('BalanceHeroCard', () => {
    it('renders single net balance (owed to user minus owed)', () => {
        const { getByTestId, getByText } = render(<BalanceHeroCard summary={single as any} />);
        expect(getByText('dashboard.netOwedToYou')).toBeTruthy();
        expect(getByTestId('balance-hero-net').props.children).toMatch(/50\.00/);
    });

    it('renders settled label when net is zero', () => {
        const { getByText } = render(<BalanceHeroCard summary={zero as any} />);
        expect(getByText('dashboard.netSettled')).toBeTruthy();
        expect(getByText('dashboard.settled')).toBeTruthy();
    });

    it('renders em-dash when multi-currency without conversion', () => {
        const { getByTestId } = render(<BalanceHeroCard summary={multi as any} />);
        expect(getByTestId('balance-hero-net').props.children).toBe('—');
        expect(getByTestId('currency-badge-USD')).toBeTruthy();
    });

    it('renders converted net total with footnote', () => {
        const converted = {
            totalOwed: 150,
            totalOwedToUser: 100,
            defaultCurrency: 'ILS',
            byCurrency: multi.byCurrency,
        };
        const { getByText, getByTestId } = render(
            <BalanceHeroCard
                summary={converted as any}
                conversion={{
                    isConverted: true,
                    ratesDate: '2026-05-20',
                    isLoading: false,
                    failed: false,
                }}
            />,
        );
        expect(getByText('dashboard.convertedLabel')).toBeTruthy();
        expect(getByText('dashboard.netYouOwe')).toBeTruthy();
        expect(getByTestId('balance-hero-net').props.children).toMatch(/50\.00/);
    });

    it('toggles breakdown with currency symbols and chips', () => {
        const { getByTestId, queryByTestId } = render(<BalanceHeroCard summary={single as any} />);
        fireEvent.press(getByTestId('balance-hero-toggle'));
        expect(getByTestId('currency-badge-ILS')).toBeTruthy();
        expect(getByTestId('breakdown-owe-ILS')).toBeTruthy();
        expect(getByTestId('breakdown-owed-ILS')).toBeTruthy();
        expect(queryByTestId('breakdown-owe-USD')).toBeNull();
    });

    it('shows dollar symbol badge for USD row', () => {
        const { getByTestId } = render(<BalanceHeroCard summary={multi as any} />);
        const badge = getByTestId('currency-badge-USD');
        expect(badge).toBeTruthy();
    });

    it('shows zero amount with currency symbol instead of text for empty side', () => {
        const amdRow = {
            totalOwed: 0,
            totalOwedToUser: 5,
            defaultCurrency: 'AMD',
            byCurrency: [{ currency: 'AMD', owed: 0, owedToUser: 5 }],
        };
        const { getByTestId, getByText } = render(<BalanceHeroCard summary={amdRow as any} />);
        fireEvent.press(getByTestId('balance-hero-toggle'));
        expect(getByTestId('breakdown-owe-zero-AMD')).toBeTruthy();
        expect(getByText(/֏0\.00/)).toBeTruthy();
    });
});
