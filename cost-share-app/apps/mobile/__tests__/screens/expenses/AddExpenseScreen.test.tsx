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
        useRoute: () => ({ params: { groupId: 'g1' } }),
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

jest.mock('../../../services/expenses.service', () => ({
    createExpense: jest.fn(),
    updateExpense: jest.fn(),
    deleteExpense: jest.fn(),
    getExpenseWithSplits: jest.fn(),
}));

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

import { AddExpenseScreen } from '../../../screens/expenses/AddExpenseScreen';
import { createExpense } from '../../../services/expenses.service';
import { getGroupMembers } from '../../../services/groups.service';
import { fetchGroupUsers } from '../../../services/users.service';
import { useAppStore } from '../../../store';

const mockCreateExpense = createExpense as jest.MockedFunction<typeof createExpense>;
const mockGetGroupMembers = getGroupMembers as jest.MockedFunction<typeof getGroupMembers>;
const mockFetchGroupUsers = fetchGroupUsers as jest.MockedFunction<typeof fetchGroupUsers>;

beforeEach(() => {
    mockNavigate.mockClear();
    mockGoBack.mockClear();
    mockCreateExpense.mockReset();
    mockFetchGroupUsers.mockReset();
    mockFetchGroupUsers.mockResolvedValue([
        { id: 'u1', name: 'Alice', email: 'a@x.com', inviteToken: 'alice123456', defaultCurrency: 'USD', language: 'en', createdAt: new Date(), updatedAt: new Date(), isActive: true },
        { id: 'u2', name: 'Bob', email: 'b@x.com', inviteToken: 'bob12345678', defaultCurrency: 'USD', language: 'en', createdAt: new Date(), updatedAt: new Date(), isActive: true },
    ]);
    useAppStore.setState({
        groups: [
            {
                id: 'g1',
                name: 'Test Group',
                defaultCurrency: 'USD',
                groupType: 'general',
                inviteToken: 'testgroup1',
                createdBy: 'u1',
                isActive: true,
                isArchivedByMe: false,
                isAutoArchived: false,
                createdAt: new Date(),
                updatedAt: new Date(),
                members: [
                    { userId: 'u1', displayName: 'Alice', isActive: true },
                    { userId: 'u2', displayName: 'Bob', isActive: true },
                ],
            },
        ],
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

describe('AddExpenseScreen — v2', () => {
    it('shows header title NEW EXPENSE in create mode', async () => {
        const { findByText } = renderWithQuery(<AddExpenseScreen />);
        await waitFor(() => expect(mockGetGroupMembers).toHaveBeenCalled());
        expect(await findByText('expenses.v2.headerNew')).toBeTruthy();
    });

    it('opens the numeric system keyboard on the amount field', async () => {
        const { findByTestId } = renderWithQuery(<AddExpenseScreen />);
        const amount = await findByTestId('amount-display');
        expect(amount.props.placeholder).toBe('0.00');
        expect(amount.props.keyboardType).toBe('decimal-pad');
        expect(amount.props.editable).not.toBe(false);
    });

    it('sanitizes the amount input — letters dropped, one dot max, 2 decimal cap', async () => {
        const { findByTestId } = renderWithQuery(<AddExpenseScreen />);
        const amount = await findByTestId('amount-display');
        fireEvent.changeText(amount, '12a.34b');
        await waitFor(() => expect(amount.props.value).toBe('12.34'));
        fireEvent.changeText(amount, '12.34.56');
        await waitFor(() => expect(amount.props.value).toBe('12.34'));
        fireEvent.changeText(amount, '12,5');
        await waitFor(() => expect(amount.props.value).toBe('12.5'));
        fireEvent.changeText(amount, '1.999');
        await waitFor(() => expect(amount.props.value).toBe('1.99'));
    });

    it('keeps Save disabled until description AND amount are set', async () => {
        const { findByTestId } = renderWithQuery(<AddExpenseScreen />);
        const submit = await findByTestId('add-expense-submit');
        expect(submit.props.accessibilityState?.disabled).toBe(true);

        fireEvent.changeText(await findByTestId('description-input'), 'Coffee');
        expect(submit.props.accessibilityState?.disabled).toBe(true);

        fireEvent.changeText(await findByTestId('amount-display'), '10');
        await waitFor(() => {
            expect(submit.props.accessibilityState?.disabled).toBe(false);
        });
    });

    it('calls createExpense with the correct DTO on Save', async () => {
        mockCreateExpense.mockResolvedValueOnce({ id: 'e1' } as any);
        const { findByTestId } = renderWithQuery(<AddExpenseScreen />);
        fireEvent.changeText(await findByTestId('description-input'), 'Coffee');
        fireEvent.changeText(await findByTestId('amount-display'), '10');

        fireEvent.press(await findByTestId('add-expense-submit'));

        await waitFor(() => expect(mockCreateExpense).toHaveBeenCalled());
        expect(mockCreateExpense).toHaveBeenCalledWith(
            expect.objectContaining({
                groupId: 'g1',
                description: 'Coffee',
                amount: 10,
                paidBy: 'u1',
                expenseDate: expect.any(Date),
                splitMode: 'equal',
            }),
        );
    });

    it('passes splitMode=percent when the user creates a percent-mode expense', async () => {
        mockCreateExpense.mockResolvedValueOnce({ id: 'e1' } as any);
        const { findByTestId } = renderWithQuery(<AddExpenseScreen />);

        fireEvent.changeText(await findByTestId('description-input'), 'Dinner');
        fireEvent.changeText(await findByTestId('amount-display'), '100');

        // Switch to percent mode and enter a 60/40 split.
        fireEvent.press(await findByTestId('combined-payer-split'));
        fireEvent.press(await findByTestId('split-mode-percent'));
        fireEvent.changeText(await findByTestId('split-input-u1'), '60');
        fireEvent.changeText(await findByTestId('split-input-u2'), '40');
        fireEvent.press(await findByTestId('edit-payer-split-done'));

        fireEvent.press(await findByTestId('add-expense-submit'));

        await waitFor(() => expect(mockCreateExpense).toHaveBeenCalled());
        expect(mockCreateExpense).toHaveBeenCalledWith(
            expect.objectContaining({
                splitMode: 'percent',
                splits: [
                    { userId: 'u1', amount: 60 },
                    { userId: 'u2', amount: 40 },
                ],
            }),
        );
    });

    it('opens the editor sheet from the combined payer/split button', async () => {
        const { findByTestId, queryByTestId } = renderWithQuery(<AddExpenseScreen />);
        await findByTestId('combined-payer-split');
        expect(queryByTestId('edit-payer-split-done')).toBeNull();
        fireEvent.press(await findByTestId('combined-payer-split'));
        expect(await findByTestId('edit-payer-split-done')).toBeTruthy();
    });

    it('commits payer/split changes when Done is pressed in the editor', async () => {
        mockCreateExpense.mockResolvedValueOnce({ id: 'e1' } as any);
        const { findByTestId } = renderWithQuery(<AddExpenseScreen />);
        await findByTestId('combined-payer-split');
        fireEvent.press(await findByTestId('combined-payer-split'));

        fireEvent.press(await findByTestId('payer-cell-u2'));
        fireEvent.press(await findByTestId('edit-payer-split-done'));

        fireEvent.changeText(await findByTestId('description-input'), 'Dinner');
        fireEvent.changeText(await findByTestId('amount-display'), '20');

        fireEvent.press(await findByTestId('add-expense-submit'));

        await waitFor(() => expect(mockCreateExpense).toHaveBeenCalled());
        expect(mockCreateExpense).toHaveBeenCalledWith(
            expect.objectContaining({ paidBy: 'u2', amount: 20 }),
        );
    });

    it('discards editor changes when the scrim is tapped', async () => {
        const { findByTestId, queryByTestId } = renderWithQuery(<AddExpenseScreen />);
        fireEvent.press(await findByTestId('combined-payer-split'));
        fireEvent.press(await findByTestId('payer-cell-u2'));
        fireEvent.press(await findByTestId('edit-payer-split-scrim'));

        await waitFor(() => {
            expect(queryByTestId('edit-payer-split-done')).toBeNull();
        });

        // Re-open: the editor's draft should reset to the unchanged payer (u1).
        fireEvent.press(await findByTestId('combined-payer-split'));
        fireEvent.press(await findByTestId('edit-payer-split-done'));

        mockCreateExpense.mockResolvedValueOnce({ id: 'e1' } as any);
        fireEvent.changeText(await findByTestId('description-input'), 'X');
        fireEvent.changeText(await findByTestId('amount-display'), '5');
        fireEvent.press(await findByTestId('add-expense-submit'));

        await waitFor(() => expect(mockCreateExpense).toHaveBeenCalled());
        expect(mockCreateExpense).toHaveBeenCalledWith(
            expect.objectContaining({ paidBy: 'u1' }),
        );
    });

    it('defaults the date pill to Today', async () => {
        const { findByTestId } = renderWithQuery(<AddExpenseScreen />);
        const dateP = await findByTestId('meta-date');
        const labelText = dateP.findAllByType('Text' as any)
            .map((n: any) => n.props.children)
            .filter(Boolean)
            .join('');
        expect(labelText).toContain('expenses.v2.today');
    });

    it('opens the date picker, sends the picked date to createExpense', async () => {
        mockCreateExpense.mockResolvedValueOnce({ id: 'e1' } as any);
        const { findByTestId, queryByTestId } = renderWithQuery(<AddExpenseScreen />);

        fireEvent.changeText(await findByTestId('description-input'), 'Coffee');
        fireEvent.changeText(await findByTestId('amount-display'), '10');

        expect(queryByTestId('date-picker-popup')).toBeNull();
        fireEvent.press(await findByTestId('meta-date'));
        expect(await findByTestId('date-picker-popup')).toBeTruthy();

        fireEvent.press(await findByTestId('mock-day-2026-06-15'));
        fireEvent.press(await findByTestId('date-picker-done'));

        fireEvent.press(await findByTestId('add-expense-submit'));
        await waitFor(() => expect(mockCreateExpense).toHaveBeenCalled());
        const dto = mockCreateExpense.mock.calls[0][0] as { expenseDate: Date };
        expect(dto.expenseDate.getFullYear()).toBe(2026);
        expect(dto.expenseDate.getMonth()).toBe(5);
        expect(dto.expenseDate.getDate()).toBe(15);
    });

    it('keeps the original date when the picker is cancelled', async () => {
        mockCreateExpense.mockResolvedValueOnce({ id: 'e1' } as any);
        const before = new Date();
        const { findByTestId, queryByTestId } = renderWithQuery(<AddExpenseScreen />);

        fireEvent.press(await findByTestId('meta-date'));
        await findByTestId('date-picker-popup');
        fireEvent.press(await findByTestId('mock-day-2026-06-15'));
        fireEvent.press(await findByTestId('date-picker-cancel'));
        await waitFor(() => expect(queryByTestId('date-picker-popup')).toBeNull());

        fireEvent.changeText(await findByTestId('description-input'), 'Coffee');
        fireEvent.changeText(await findByTestId('amount-display'), '10');
        fireEvent.press(await findByTestId('add-expense-submit'));

        await waitFor(() => expect(mockCreateExpense).toHaveBeenCalled());
        const dto = mockCreateExpense.mock.calls[0][0] as { expenseDate: Date };
        expect(dto.expenseDate.getFullYear()).toBe(before.getFullYear());
        expect(dto.expenseDate.getMonth()).toBe(before.getMonth());
        expect(dto.expenseDate.getDate()).toBe(before.getDate());
        expect(
            dto.expenseDate.getFullYear() === 2026 &&
            dto.expenseDate.getMonth() === 5 &&
            dto.expenseDate.getDate() === 15,
        ).toBe(false);
    });

    it('does not include soft-deleted users in the split selections when creating a new expense', async () => {
        mockFetchGroupUsers.mockResolvedValueOnce([
            { id: 'u1', name: 'Alice', email: 'a@x.com', inviteToken: 'alice123456', defaultCurrency: 'USD', language: 'en', createdAt: new Date(), updatedAt: new Date(), isActive: true },
            { id: 'u2', name: 'Bob', email: 'b@x.com', inviteToken: 'bob12345678', defaultCurrency: 'USD', language: 'en', createdAt: new Date(), updatedAt: new Date(), isActive: false }, // inactive
        ]);
        mockGetGroupMembers.mockResolvedValueOnce([
            { id: 'm1', groupId: 'g1', userId: 'u1', role: 'member', isActive: true, joinedAt: new Date() },
            { id: 'm2', groupId: 'g1', userId: 'u2', role: 'member', isActive: true, joinedAt: new Date() },
        ]);

        mockCreateExpense.mockResolvedValueOnce({ id: 'e1' } as any);
        const { findByTestId } = renderWithQuery(<AddExpenseScreen />);

        fireEvent.changeText(await findByTestId('description-input'), 'Coffee');
        fireEvent.changeText(await findByTestId('amount-display'), '10');

        fireEvent.press(await findByTestId('add-expense-submit'));

        await waitFor(() => expect(mockCreateExpense).toHaveBeenCalled());
        expect(mockCreateExpense).toHaveBeenCalledWith(
            expect.objectContaining({
                splits: [
                    { userId: 'u1' } // Bob (u2) is not selected because he is soft-deleted
                ],
            }),
        );
    });
});
