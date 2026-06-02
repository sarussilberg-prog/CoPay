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

jest.mock('react-native-calendars', () => {
    const React = require('react');
    const { Pressable, Text, View } = require('react-native');
    function Calendar(props: any) {
        return (
            <View testID="mock-calendar">
                <Pressable
                    testID="mock-day-2026-06-15"
                    onPress={() =>
                        props.onDayPress?.({
                            dateString: '2026-06-15',
                            day: 15,
                            month: 6,
                            year: 2026,
                            timestamp: 0,
                        })
                    }
                >
                    <Text>tap-day</Text>
                </Pressable>
            </View>
        );
    }
    return { Calendar, LocaleConfig: { locales: {}, defaultLocale: 'en' } };
});

jest.mock('../../../services/groups.service', () => ({
    getGroupMembers: jest.fn().mockResolvedValue([
        { id: 'm1', groupId: 'g1', userId: 'u1', role: 'member', isActive: true, joinedAt: new Date() },
        { id: 'm2', groupId: 'g1', userId: 'u2', role: 'member', isActive: true, joinedAt: new Date() },
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
        { id: 'u2', name: 'Bob', email: 'b@x.com', inviteToken: 'bob12345678', defaultCurrency: 'USD', language: 'en', createdAt: new Date(), updatedAt: new Date() },
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
    splitMode: 'equal' as const,
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
            isAdmin: false,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });
});

describe('AddExpenseScreen — edit mode (v2)', () => {
    it('shows the EDIT EXPENSE header and prefills description + amount', async () => {
        const { findByText, findByDisplayValue } = renderWithQuery(<AddExpenseScreen />);
        expect(await findByText('expenses.v2.headerEdit')).toBeTruthy();
        expect(await findByDisplayValue('Coffee')).toBeTruthy();
        expect(await findByDisplayValue('5')).toBeTruthy();
    });

    it('calls updateExpense with new values on Save', async () => {
        mockUpdate.mockResolvedValueOnce({ ...expense, description: 'Tea' });
        const { findByDisplayValue, findByTestId } = renderWithQuery(<AddExpenseScreen />);
        const descInput = await findByDisplayValue('Coffee');
        fireEvent.changeText(descInput, 'Tea');
        fireEvent.press(await findByTestId('add-expense-submit'));
        await waitFor(() =>
            expect(mockUpdate).toHaveBeenCalledWith(
                'e1',
                expect.objectContaining({ description: 'Tea' }),
            ),
        );
    });

    it('opens the editor in percent mode for an expense persisted as percent — even when amounts happen to be equal', async () => {
        // Regression for split-mode persistence (2026-05-26):
        // $50/$50 of $100 is indistinguishable between 'equal', 'percent 50/50',
        // and 'amount 50/50' purely from the stored amounts. Trust the stored mode.
        mockGet.mockResolvedValue({
            expense: { ...expense, amount: 100, splitMode: 'percent' },
            splits: [
                { id: 's1', expenseId: 'e1', userId: 'u1', amount: 50, createdAt: new Date() },
                { id: 's2', expenseId: 'e1', userId: 'u2', amount: 50, createdAt: new Date() },
            ],
        });

        const { findByTestId } = renderWithQuery(<AddExpenseScreen />);
        // Open the editor and confirm the percent segment is selected and inputs are %.
        fireEvent.press(await findByTestId('combined-payer-split'));
        const percentInput = await findByTestId('split-input-u1');
        expect(percentInput.props.value).toBe('50');
        expect(percentInput.props.placeholder).toBe('0');  // percent placeholder
    });

    it('falls back to inference when expense.splitMode is undefined (transitional rows)', async () => {
        // Until the migration runs on both DBs, some rows lack split_mode.
        // The editor should keep working via the legacy inference path.
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        mockGet.mockResolvedValue({
            expense: { ...expense, amount: 100, splitMode: undefined },
            splits: [
                { id: 's1', expenseId: 'e1', userId: 'u1', amount: 60, createdAt: new Date() },
                { id: 's2', expenseId: 'e1', userId: 'u2', amount: 40, createdAt: new Date() },
            ],
        });

        const { findByTestId } = renderWithQuery(<AddExpenseScreen />);
        fireEvent.press(await findByTestId('combined-payer-split'));
        // 60/100 is a clean percent so legacy inference picks 'percent' mode.
        const input = await findByTestId('split-input-u1');
        expect(input.props.placeholder).toBe('0');
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it('switching from unequal to equal sends equal splits without amounts', async () => {
        mockGet.mockResolvedValue({
            expense: { ...expense, amount: 100, splitMode: 'amount' as const },
            splits: [
                { id: 's1', expenseId: 'e1', userId: 'u1', amount: 60, createdAt: new Date() },
                { id: 's2', expenseId: 'e1', userId: 'u2', amount: 40, createdAt: new Date() },
            ],
        });
        mockUpdate.mockResolvedValueOnce({ ...expense, amount: 100 });

        const { findByTestId } = renderWithQuery(<AddExpenseScreen />);
        fireEvent.press(await findByTestId('combined-payer-split'));
        fireEvent.press(await findByTestId('split-mode-equal'));
        fireEvent.press(await findByTestId('edit-payer-split-done'));
        fireEvent.press(await findByTestId('add-expense-submit'));

        await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
        expect(mockUpdate).toHaveBeenCalledWith(
            'e1',
            expect.objectContaining({
                splits: [{ userId: 'u1' }, { userId: 'u2' }],
            }),
        );
    });
});
