import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithQuery } from '../helpers/renderWithQuery';
import { FeedItemDetailSheet } from '../../components/FeedItemDetailSheet';
import type { ExpenseWithDelta, Settlement } from '@cost-share/shared';

const baseSettlement: Settlement = {
    id: 'st1',
    groupId: 'g1',
    fromUserId: 'u1',
    toUserId: 'u2',
    amount: 30,
    currency: 'USD',
    settlementDate: new Date('2026-08-13'),
    paymentMethod: 'bank_transfer',
    createdBy: 'u1',
    createdAt: new Date('2026-08-13'),
    updatedAt: new Date('2026-08-13'),
    deletedAt: null,
};

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
    u1: { userId: 'u1', displayName: 'Alice', isActive: true },
    u2: { userId: 'u2', displayName: 'Bob', isActive: true },
};

describe('FeedItemDetailSheet', () => {
    it('shows expense details and exposes edit/delete via the kebab menu', () => {
        const onEdit = jest.fn();
        const onDelete = jest.fn();
        const { getByTestId, getByText, queryByTestId } = renderWithQuery(
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

        // Edit/Delete live inside a popover that opens via the kebab button.
        expect(queryByTestId('detail-edit-btn')).toBeNull();
        expect(queryByTestId('detail-delete-btn')).toBeNull();

        fireEvent.press(getByTestId('detail-kebab-btn'));
        fireEvent.press(getByTestId('detail-edit-btn'));
        expect(onEdit).toHaveBeenCalled();

        fireEvent.press(getByTestId('detail-kebab-btn'));
        fireEvent.press(getByTestId('detail-delete-btn'));
        expect(onDelete).toHaveBeenCalled();
    });

    it('exposes settlement edit/delete via the kebab menu', () => {
        const onEdit = jest.fn();
        const onDelete = jest.fn();
        const { getByTestId, queryByTestId } = renderWithQuery(
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
                onDelete={onDelete}
            />,
        );

        expect(getByTestId('settlement-detail-sheet')).toBeTruthy();
        expect(queryByTestId('detail-edit-btn')).toBeNull();
        expect(queryByTestId('detail-delete-btn')).toBeNull();

        fireEvent.press(getByTestId('detail-kebab-btn'));
        fireEvent.press(getByTestId('detail-edit-btn'));
        expect(onEdit).toHaveBeenCalledTimes(1);

        fireEvent.press(getByTestId('detail-kebab-btn'));
        fireEvent.press(getByTestId('detail-delete-btn'));
        expect(onDelete).toHaveBeenCalledTimes(1);
    });

    it('renders the "you received" involvement strip when current user is the recipient', () => {
        const { getByText } = renderWithQuery(
            <FeedItemDetailSheet
                item={{ kind: 'settlement', settlement: baseSettlement }}
                memberMap={memberMap}
                currentUserId="u2"
                onClose={jest.fn()}
                onEdit={jest.fn()}
                onDelete={jest.fn()}
            />,
        );

        expect(getByText('settleUp.youReceivedAmount')).toBeTruthy();
        expect(getByText('settleUp.fromVia')).toBeTruthy();
        expect(getByText('USD 30.00')).toBeTruthy();
    });

    it('renders the "you paid" involvement strip when current user is the payer', () => {
        const { getByText } = renderWithQuery(
            <FeedItemDetailSheet
                item={{ kind: 'settlement', settlement: baseSettlement }}
                memberMap={memberMap}
                currentUserId="u1"
                onClose={jest.fn()}
                onEdit={jest.fn()}
                onDelete={jest.fn()}
            />,
        );

        expect(getByText('settleUp.youPaidAmount')).toBeTruthy();
        expect(getByText('settleUp.toVia')).toBeTruthy();
        expect(getByText('USD 30.00')).toBeTruthy();
    });

    it('renders the third-party "someone paid" copy when current user is neither party', () => {
        const { getByText } = renderWithQuery(
            <FeedItemDetailSheet
                item={{ kind: 'settlement', settlement: baseSettlement }}
                memberMap={memberMap}
                currentUserId="u3"
                onClose={jest.fn()}
                onEdit={jest.fn()}
                onDelete={jest.fn()}
            />,
        );

        expect(getByText('settleUp.someonePaid')).toBeTruthy();
        expect(getByText('settleUp.via')).toBeTruthy();
    });

    it('omits the "via …" sub line when paymentMethod is not set', () => {
        const noMethodSettlement: Settlement = {
            ...baseSettlement,
            paymentMethod: undefined,
        };
        const { getByText, queryByText } = renderWithQuery(
            <FeedItemDetailSheet
                item={{ kind: 'settlement', settlement: noMethodSettlement }}
                memberMap={memberMap}
                currentUserId="u2"
                onClose={jest.fn()}
                onEdit={jest.fn()}
                onDelete={jest.fn()}
            />,
        );

        expect(getByText('settleUp.youReceivedAmount')).toBeTruthy();
        expect(getByText('settleUp.fromName')).toBeTruthy();
        expect(queryByText('settleUp.fromVia')).toBeNull();
        expect(queryByText('settleUp.via')).toBeNull();
    });
});
