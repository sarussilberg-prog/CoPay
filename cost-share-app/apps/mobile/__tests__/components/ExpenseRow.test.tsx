import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ExpenseRow } from '../../components/ExpenseRow';
import type { ExpenseWithDelta } from '@cost-share/shared';

const baseExpense: ExpenseWithDelta = {
    id: 'e1',
    groupId: 'g1',
    description: 'Coffee',
    amount: 30,
    currency: 'USD',
    category: 'food',
    expenseDate: new Date('2026-05-12'),
    paidBy: 'me',
    createdBy: 'me',
    isDeleted: false,
    createdAt: new Date('2026-05-12'),
    updatedAt: new Date('2026-05-12'),
    splits: [],
    myDelta: 20,
    myDeltaState: 'lent',
};

describe('ExpenseRow', () => {
    it('renders the description and amount', () => {
        const { getByText } = render(
            <ExpenseRow
                expense={baseExpense}
                payerName="Alice"
                onPress={() => {}}
            />,
        );
        expect(getByText('Coffee')).toBeTruthy();
        expect(getByText(/USD 30\.00/)).toBeTruthy();
    });

    it('shows the lent label when myDeltaState is lent', () => {
        const { getByText } = render(
            <ExpenseRow
                expense={baseExpense}
                payerName="Alice"
                onPress={() => {}}
            />,
        );
        expect(getByText(/groups\.expense\.youLent/)).toBeTruthy();
    });

    it('shows the borrowed label when myDeltaState is borrowed', () => {
        const { getByText } = render(
            <ExpenseRow
                expense={{ ...baseExpense, myDelta: -10, myDeltaState: 'borrowed' }}
                payerName="Alice"
                onPress={() => {}}
            />,
        );
        expect(getByText(/groups\.expense\.youBorrowed/)).toBeTruthy();
    });

    it('omits the involvement sub-line when myDelta is zero', () => {
        const { queryByText } = render(
            <ExpenseRow
                expense={{ ...baseExpense, myDelta: 0, myDeltaState: 'lent' }}
                payerName="Alice"
                onPress={() => {}}
            />,
        );
        expect(queryByText(/groups\.expense\.youLent/)).toBeNull();
    });

    it('calls onPress with the expense id', () => {
        const onPress = jest.fn();
        const { getByText } = render(
            <ExpenseRow
                expense={baseExpense}
                payerName="Alice"
                onPress={onPress}
            />,
        );
        fireEvent.press(getByText('Coffee'));
        expect(onPress).toHaveBeenCalledWith('e1');
    });
});
