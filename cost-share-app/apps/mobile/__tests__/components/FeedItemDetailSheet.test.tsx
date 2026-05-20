import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithQuery } from '../helpers/renderWithQuery';
import { FeedItemDetailSheet } from '../../components/FeedItemDetailSheet';
import type { ExpenseWithDelta } from '@cost-share/shared';

const expense: ExpenseWithDelta = {
    id: 'e1',
    groupId: 'g1',
    description: 'Dinner',
    amount: 100,
    currency: 'USD',
    paidBy: 'u1',
    createdBy: 'u1',
    category: 'food',
    expenseDate: new Date('2026-01-15'),
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    splits: [
        {
            id: 's1',
            expenseId: 'e1',
            userId: 'u1',
            amount: 50,
            createdAt: new Date(),
        },
        {
            id: 's2',
            expenseId: 'e1',
            userId: 'u2',
            amount: 50,
            createdAt: new Date(),
        },
    ],
    myDelta: 50,
    myDeltaState: 'lent',
};

const memberMap = {
    u1: { userId: 'u1', displayName: 'Alice' },
    u2: { userId: 'u2', displayName: 'Bob' },
};

describe('FeedItemDetailSheet', () => {
    it('shows expense details and action buttons', () => {
        const onEdit = jest.fn();
        const onDelete = jest.fn();
        const { getByTestId, getByText } = renderWithQuery(
            <FeedItemDetailSheet
                item={{ kind: 'expense', expense }}
                memberMap={memberMap}
                currentUserId="u1"
                onClose={jest.fn()}
                onEdit={onEdit}
                onDelete={onDelete}
            />,
        );

        expect(getByTestId('expense-detail-sheet')).toBeTruthy();
        expect(getByText('Dinner')).toBeTruthy();
        expect(getByText('USD 100.00')).toBeTruthy();
        fireEvent.press(getByTestId('detail-edit-btn'));
        expect(onEdit).toHaveBeenCalled();
        fireEvent.press(getByTestId('detail-delete-btn'));
        expect(onDelete).toHaveBeenCalled();
    });

    it('shows edit/delete for settlements to any group member', () => {
        const onEdit = jest.fn();
        const { getByTestId } = renderWithQuery(
            <FeedItemDetailSheet
                item={{
                    kind: 'settlement',
                    settlement: {
                        id: 'st1',
                        groupId: 'g1',
                        fromUserId: 'u1',
                        toUserId: 'u2',
                        amount: 30,
                        currency: 'USD',
                        settlementDate: new Date(),
                        createdBy: 'u1',
                        createdAt: new Date(),
                        updatedAt: new Date(),
                        deletedAt: null,
                    },
                }}
                memberMap={memberMap}
                currentUserId="u3"
                onClose={jest.fn()}
                onEdit={onEdit}
                onDelete={jest.fn()}
            />,
        );

        expect(getByTestId('settlement-detail-sheet')).toBeTruthy();
        expect(getByTestId('detail-edit-btn')).toBeTruthy();
        fireEvent.press(getByTestId('detail-edit-btn'));
        expect(onEdit).toHaveBeenCalled();
    });
});
