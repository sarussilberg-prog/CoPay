import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithQuery } from '../../helpers/renderWithQuery';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => {
    const actual = jest.requireActual('@react-navigation/native');
    return {
        ...actual,
        useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
        useRoute: () => ({ params: { expenseId: 'e1', groupId: 'g1' } }),
        useFocusEffect: (cb: () => void) => cb(),
        useIsFocused: () => true,
    };
});

jest.mock('../../../services/expenses.service', () => ({
    getExpenseWithSplits: jest.fn(),
    deleteExpense: jest.fn(),
}));

jest.mock('../../../services/users.service', () => ({
    fetchGroupUsers: jest.fn().mockResolvedValue([]),
}));

import { ExpenseDetailScreen } from '../../../screens/expenses/ExpenseDetailScreen';
import { getExpenseWithSplits } from '../../../services/expenses.service';

const mockGet = getExpenseWithSplits as jest.MockedFunction<typeof getExpenseWithSplits>;

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
});

describe('ExpenseDetailScreen', () => {
    it('renders the expense description and amount', async () => {
        mockGet.mockResolvedValueOnce({ expense, splits: [] });
        const { findByText } = renderWithQuery(<ExpenseDetailScreen />);
        expect(await findByText('Coffee')).toBeTruthy();
        expect(await findByText(/USD 5\.00/)).toBeTruthy();
    });

    it('navigates to EditExpense on edit press', async () => {
        mockGet.mockResolvedValueOnce({ expense, splits: [] });
        const { findByText } = renderWithQuery(<ExpenseDetailScreen />);
        fireEvent.press(await findByText('common.edit'));
        expect(mockNavigate).toHaveBeenCalledWith('EditExpense', {
            expenseId: 'e1',
            groupId: 'g1',
        });
    });
});
