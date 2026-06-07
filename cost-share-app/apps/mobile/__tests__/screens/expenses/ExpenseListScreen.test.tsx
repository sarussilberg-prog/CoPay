import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithQuery as render } from '../../helpers/renderWithQuery';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => {
    const actual = jest.requireActual('@react-navigation/native');
    return {
        ...actual,
        useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
        useRoute: () => ({ params: { groupId: 'g1' } }),
        useFocusEffect: (cb: () => void) => cb(),
        useIsFocused: () => true,
    };
});

jest.mock('../../../services/expenses.service', () => ({
    fetchExpenses: jest.fn().mockResolvedValue([]),
}));

import { ExpenseListScreen } from '../../../screens/expenses/ExpenseListScreen';
import { fetchExpenses } from '../../../services/expenses.service';
import { useAppStore } from '../../../store';
import { queryClient } from '../../../lib/queryClient';
import { queryKeys } from '../../../hooks/queries/keys';

const mockFetchExpenses = fetchExpenses as jest.MockedFunction<typeof fetchExpenses>;

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
    splits: [],
};

beforeEach(() => {
    mockNavigate.mockClear();
    mockFetchExpenses.mockClear();
    queryClient.clear();
});

describe('ExpenseListScreen', () => {
    it('shows empty state when no expenses', async () => {
        const { findByText } = render(<ExpenseListScreen />);
        expect(await findByText('expenses.noExpenses')).toBeTruthy();
    });

    it('calls fetchExpenses on mount with groupId', async () => {
        render(<ExpenseListScreen />);
        await waitFor(() => expect(mockFetchExpenses).toHaveBeenCalledWith('g1'));
    });

    it('renders expenses from store', async () => {
        queryClient.setQueryData(queryKeys.groupExpenses('g1'), [expense]);
        const { findByText } = render(<ExpenseListScreen />);
        expect(await findByText('Coffee')).toBeTruthy();
    });

    it('navigates to ExpenseDetail when an expense is pressed', async () => {
        queryClient.setQueryData(queryKeys.groupExpenses('g1'), [expense]);
        const { findByText } = render(<ExpenseListScreen />);
        fireEvent.press(await findByText('Coffee'));
        expect(mockNavigate).toHaveBeenCalledWith('ExpenseDetail', {
            expenseId: 'e1',
            groupId: 'g1',
        });
    });
});
