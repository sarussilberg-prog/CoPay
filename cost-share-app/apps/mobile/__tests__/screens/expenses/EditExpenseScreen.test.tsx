import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithQuery } from '../../helpers/renderWithQuery';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => {
    const actual = jest.requireActual('@react-navigation/native');
    return {
        ...actual,
        useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack, setOptions: jest.fn() }),
        useRoute: () => ({ params: { expenseId: 'e1', groupId: 'g1' } }),
        useFocusEffect: (cb: () => void) => cb(),
        useIsFocused: () => true,
    };
});

jest.mock('../../../services/groups.service', () => ({
    getGroupMembers: jest.fn().mockResolvedValue([
        { id: 'm1', groupId: 'g1', userId: 'u1', role: 'member', isActive: true, joinedAt: new Date() },
    ]),
    getGroupById: jest.fn().mockResolvedValue({
        id: 'g1',
        name: 'Test Group',
        defaultCurrency: 'USD',
    }),
}));

jest.mock('../../../services/users.service', () => ({
    fetchGroupUsers: jest.fn().mockResolvedValue([
        { id: 'u1', name: 'Alice', email: 'a@x.com', inviteToken: 'alice123456', defaultCurrency: 'USD', language: 'en', createdAt: new Date(), updatedAt: new Date() },
    ]),
}));

jest.mock('../../../services/expenses.service', () => ({
    getExpenseWithSplits: jest.fn(),
    updateExpense: jest.fn(),
    deleteExpense: jest.fn(),
    createExpense: jest.fn(),
}));

import { AddExpenseScreen } from '../../../screens/expenses/AddExpenseScreen';
import {
    getExpenseWithSplits,
    updateExpense,
} from '../../../services/expenses.service';
import { useAppStore } from '../../../store';

const mockGet = getExpenseWithSplits as jest.MockedFunction<typeof getExpenseWithSplits>;
const mockUpdate = updateExpense as jest.MockedFunction<typeof updateExpense>;

const expense = {
    id: 'e1',
    groupId: 'g1',
    description: 'Coffee',
    amount: 5,
    currency: 'USD',
    category: 'food' as const,
    expenseDate: new Date('2026-05-01'),
    paidBy: 'u1',
    createdBy: 'u1',
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
};

beforeEach(() => {
    mockNavigate.mockClear();
    mockGoBack.mockClear();
    mockGet.mockReset();
    mockUpdate.mockReset();
    mockGet.mockResolvedValue({
        expense,
        splits: [{ id: 's1', expenseId: 'e1', userId: 'u1', amount: 5, createdAt: new Date() }],
    });
    useAppStore.setState({
        currentUser: {
            id: 'u1',
            email: 'a@x.com',
            name: 'Alice',
            inviteToken: 'alice123456',
            defaultCurrency: 'USD',
            language: 'en',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });
});

describe('AddExpenseScreen edit mode', () => {
    it('loads existing expense data into form', async () => {
        const { findByDisplayValue } = renderWithQuery(<AddExpenseScreen />);
        expect(await findByDisplayValue('Coffee')).toBeTruthy();
        expect(await findByDisplayValue('5')).toBeTruthy();
    });

    it('calls updateExpense with new values', async () => {
        mockUpdate.mockResolvedValueOnce({ ...expense, description: 'Tea' });
        const { findByDisplayValue, findByText } = renderWithQuery(<AddExpenseScreen />);
        const descInput = await findByDisplayValue('Coffee');
        fireEvent.changeText(descInput, 'Tea');
        fireEvent.press(await findByText('common.save'));
        await waitFor(() =>
            expect(mockUpdate).toHaveBeenCalledWith(
                'e1',
                expect.objectContaining({ description: 'Tea' })
            )
        );
    });

    it('sends equal splits without amounts when switching from unequal to equal', async () => {
        mockGet.mockResolvedValue({
            expense: { ...expense, amount: 100 },
            splits: [
                { id: 's1', expenseId: 'e1', userId: 'u1', amount: 60, createdAt: new Date() },
                { id: 's2', expenseId: 'e1', userId: 'u2', amount: 40, createdAt: new Date() },
            ],
        });
        mockUpdate.mockResolvedValueOnce({ ...expense, amount: 100 });

        const { findByTestId, findByText } = renderWithQuery(<AddExpenseScreen />);
        await findByTestId('split-type-unequal');
        fireEvent.press(await findByTestId('split-type-equal'));
        fireEvent.press(await findByText('common.save'));

        await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
        expect(mockUpdate).toHaveBeenCalledWith(
            'e1',
            expect.objectContaining({
                amount: 100,
                splits: [{ userId: 'u1' }, { userId: 'u2' }],
            }),
        );
    });

    it('does not show cancel-only button in edit mode', async () => {
        const { queryByText } = renderWithQuery(<AddExpenseScreen />);
        await waitFor(() => expect(mockGet).toHaveBeenCalled());
        expect(queryByText('common.cancel')).toBeNull();
    });
});
