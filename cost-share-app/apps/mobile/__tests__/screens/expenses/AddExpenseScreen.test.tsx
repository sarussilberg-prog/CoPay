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
import { useAppStore } from '../../../store';

const mockCreateExpense = createExpense as jest.MockedFunction<typeof createExpense>;
const mockGetGroupMembers = getGroupMembers as jest.MockedFunction<typeof getGroupMembers>;

beforeEach(() => {
    mockNavigate.mockClear();
    mockGoBack.mockClear();
    mockCreateExpense.mockReset();
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
                    { userId: 'u1', displayName: 'Alice' },
                    { userId: 'u2', displayName: 'Bob' },
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
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });
});

describe('AddExpenseScreen', () => {
    it('renders the description and amount inputs', async () => {
        const { findByText } = renderWithQuery(<AddExpenseScreen />);
        await waitFor(() => expect(mockGetGroupMembers).toHaveBeenCalled());
        expect(await findByText('expenses.description')).toBeTruthy();
        expect(await findByText('expenses.amount')).toBeTruthy();
    });

    it('keeps submit disabled without description or amount', async () => {
        const { findByTestId, getByPlaceholderText } = renderWithQuery(<AddExpenseScreen />);
        const submit = await findByTestId('add-expense-submit');
        expect(submit.props.accessibilityState?.disabled ?? submit.props.disabled).toBe(true);

        fireEvent.changeText(getByPlaceholderText('0.00'), '10');
        expect(submit.props.accessibilityState?.disabled ?? submit.props.disabled).toBe(true);

        fireEvent.changeText(getByPlaceholderText('expenses.enterDescription'), 'Coffee');
        await waitFor(() => {
            expect(submit.props.accessibilityState?.disabled ?? submit.props.disabled).toBe(false);
        });
        expect(mockCreateExpense).not.toHaveBeenCalled();
    });

    it('calls createExpense with proper DTO', async () => {
        mockCreateExpense.mockResolvedValueOnce({ id: 'e1' } as any);
        const { findByText, getByPlaceholderText, findAllByText } = renderWithQuery(<AddExpenseScreen />);
        await findByText('expenses.description');
        fireEvent.changeText(getByPlaceholderText('expenses.enterDescription'), 'Coffee');
        fireEvent.changeText(getByPlaceholderText('0.00'), '10');
        const addButtons = await findAllByText('expenses.addExpense');
        fireEvent.press(addButtons[addButtons.length - 1]);
        await waitFor(() => expect(mockCreateExpense).toHaveBeenCalled());
        expect(mockCreateExpense).toHaveBeenCalledWith(
            expect.objectContaining({
                groupId: 'g1',
                description: 'Coffee',
                amount: 10,
                paidBy: 'u1',
            })
        );
    });

    it('shows unequal split panel when unequal is selected', async () => {
        const { findByText, getByTestId } = renderWithQuery(<AddExpenseScreen />);
        await findByText('expenses.description');
        fireEvent.press(getByTestId('split-type-unequal'));
        expect(await findByText('expenses.unequalSplitTitle')).toBeTruthy();
        expect(getByTestId('unequal-split-panel')).toBeTruthy();
    });

    it('disables submit until description and amount are filled', async () => {
        const { findByTestId, getByPlaceholderText } = renderWithQuery(<AddExpenseScreen />);
        const submit = await findByTestId('add-expense-submit');
        expect(submit.props.accessibilityState?.disabled ?? submit.props.disabled).toBe(true);

        fireEvent.changeText(getByPlaceholderText('expenses.enterDescription'), 'Coffee');
        expect(submit.props.accessibilityState?.disabled ?? submit.props.disabled).toBe(true);

        fireEvent.changeText(getByPlaceholderText('0.00'), '10');
        await waitFor(() => {
            expect(submit.props.accessibilityState?.disabled ?? submit.props.disabled).toBe(false);
        });
    });

    it('creates expense with unequal percent splits', async () => {
        mockCreateExpense.mockResolvedValueOnce({ id: 'e1' } as any);
        const { findByText, getByPlaceholderText, getByTestId, findByTestId } =
            renderWithQuery(<AddExpenseScreen />);
        await findByText('expenses.description');
        fireEvent.changeText(getByPlaceholderText('expenses.enterDescription'), 'Dinner');
        fireEvent.changeText(getByPlaceholderText('0.00'), '100');
        fireEvent.press(getByTestId('split-type-unequal'));
        await findByTestId('unequal-split-panel');
        fireEvent.changeText(getByTestId('split-input-u1'), '60');
        fireEvent.changeText(getByTestId('split-input-u2'), '40');
        fireEvent.press(await findByTestId('add-expense-submit'));
        await waitFor(() => expect(mockCreateExpense).toHaveBeenCalled());
        expect(mockCreateExpense).toHaveBeenCalledWith(
            expect.objectContaining({
                amount: 100,
                splits: expect.arrayContaining([
                    expect.objectContaining({ userId: 'u1', amount: 60 }),
                    expect.objectContaining({ userId: 'u2', amount: 40 }),
                ]),
            }),
        );
    });
});
