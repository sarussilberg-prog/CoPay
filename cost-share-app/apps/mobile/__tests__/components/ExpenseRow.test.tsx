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
    splits: [
        {
            id: 's1',
            expenseId: 'e1',
            userId: 'me',
            amount: 10,
            createdAt: new Date('2026-05-12'),
        },
        {
            id: 's2',
            expenseId: 'e1',
            userId: 'bob',
            amount: 20,
            createdAt: new Date('2026-05-12'),
        },
    ],
    myDelta: 20,
    myDeltaState: 'lent',
};

describe('ExpenseRow', () => {
    it('renders the description and amount', () => {
        const { getByText } = render(
            <ExpenseRow
                expense={baseExpense}
                currentUserId="me"
                payerName="Alice"
                onPress={() => {}}
            />,
        );
        expect(getByText('Coffee')).toBeTruthy();
        expect(getByText('30.00')).toBeTruthy();
    });

    it('shows the lent label when myDeltaState is lent', () => {
        const { getByText } = render(
            <ExpenseRow
                expense={baseExpense}
                currentUserId="me"
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
                currentUserId="me"
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
                currentUserId="me"
                payerName="Alice"
                onPress={() => {}}
            />,
        );
        expect(queryByText(/groups\.expense\.youLent/)).toBeNull();
    });

    it('shows user-relative summary when the user paid', () => {
        const { getByText } = render(
            <ExpenseRow
                expense={baseExpense}
                currentUserId="me"
                payerName="Me"
                onPress={() => {}}
            />,
        );
        expect(getByText(/groups\.expense\.feedYouPaid/)).toBeTruthy();
    });

    it('calls onPress with the expense id', () => {
        const onPress = jest.fn();
        const { getByText } = render(
            <ExpenseRow
                expense={baseExpense}
                currentUserId="me"
                payerName="Alice"
                onPress={onPress}
            />,
        );
        fireEvent.press(getByText('Coffee'));
        expect(onPress).toHaveBeenCalledWith('e1');
    });
});
