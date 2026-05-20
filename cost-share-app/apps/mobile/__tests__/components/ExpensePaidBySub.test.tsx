import React from 'react';
import { render } from '@testing-library/react-native';
import { ExpensePaidBySub } from '../../components/ExpensePaidBySub';
import { useAppStore } from '../../store';

describe('ExpensePaidBySub', () => {
    it('renders paid-by label before the payer name in Hebrew UI', () => {
        useAppStore.setState({ language: 'he' });
        const { getByText } = render(
            <ExpensePaidBySub amount="ILS 3000.00" payerName="Nave Sarussi" />,
        );

        expect(getByText(/expenses\.paidBy/)).toBeTruthy();
        expect(getByText('Nave Sarussi')).toBeTruthy();
        expect(getByText('ILS 3000.00')).toBeTruthy();
        expect(getByText('Nave Sarussi').props.style).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ writingDirection: 'ltr' }),
            ]),
        );
    });

    it('renders amount before paid-by label in English UI', () => {
        useAppStore.setState({ language: 'en' });
        const { getByText } = render(
            <ExpensePaidBySub amount="USD 30.00" payerName="Bob" />,
        );

        expect(getByText('USD 30.00')).toBeTruthy();
        expect(getByText(/expenses\.paidBy/)).toBeTruthy();
        expect(getByText('Bob')).toBeTruthy();
    });
});
