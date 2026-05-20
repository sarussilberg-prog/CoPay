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
    it('renders the description', () => {
        const { getByText } = render(
            <ExpenseRow
                expense={baseExpense}
                actorName="Bob"
                payerName="Alice"
                isMine={false}
                onPress={() => {}}
            />,
        );
        expect(getByText('Coffee')).toBeTruthy();
    });

    it('shows the lent label in green when myDeltaState is lent', () => {
        const { getByText } = render(
            <ExpenseRow
                expense={baseExpense}
                actorName="Bob"
                payerName="Alice"
                isMine={false}
                onPress={() => {}}
            />,
        );
        expect(getByText(/groups\.expense\.youLent/)).toBeTruthy();
    });

    it('shows the borrowed label when myDeltaState is borrowed', () => {
        const { getByText } = render(
            <ExpenseRow
                expense={{ ...baseExpense, myDelta: -10, myDeltaState: 'borrowed' }}
                actorName="Bob"
                payerName="Alice"
                isMine={false}
                onPress={() => {}}
            />,
        );
        expect(getByText(/groups\.expense\.youBorrowed/)).toBeTruthy();
    });

    it('calls onPress with the expense id', () => {
        const onPress = jest.fn();
        const { getByText } = render(
            <ExpenseRow
                expense={baseExpense}
                actorName="Bob"
                payerName="Alice"
                isMine={false}
                onPress={onPress}
            />,
        );
        fireEvent.press(getByText('Coffee'));
        expect(onPress).toHaveBeenCalledWith('e1');
    });
});
