const mockFrom = jest.fn();
const mockToastShow = jest.fn();
const mockSplitsInsert = jest.fn().mockResolvedValue({ error: null });
const mockSplitsDeleteEq = jest.fn().mockResolvedValue({ error: null });

jest.mock('../../lib/supabase', () => ({
    supabase: {
        from: (...args: unknown[]) => mockFrom(...args),
    },
}));

jest.mock('react-native-toast-message', () => ({
    __esModule: true,
    default: { show: (...args: unknown[]) => mockToastShow(...args) },
}));

jest.mock('../../i18n', () => ({ __esModule: true, default: { t: (k: string) => k } }));

jest.mock('../../store', () => ({
    useAppStore: {
        getState: jest.fn(() => ({
            expenses: [],
            updateExpense: jest.fn(),
        })),
    },
}));

import { updateExpense } from '../../services/expenses.service';
import { useAppStore } from '../../store';

const expenseRow = {
    id: 'e1',
    group_id: 'g1',
    description: 'Dinner',
    amount: 100,
    currency: 'USD',
    category: 'food',
    expense_date: '2026-05-01',
    receipt_url: null,
    paid_by: 'u1',
    created_by: 'u1',
    is_deleted: false,
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
};

function mockExpenseSelect() {
    mockFrom.mockImplementation((table: string) => {
        if (table === 'expenses') {
            return {
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        eq: jest.fn().mockReturnValue({
                            maybeSingle: jest.fn().mockResolvedValue({ data: expenseRow, error: null }),
                        }),
                    }),
                }),
                update: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        select: jest.fn().mockReturnValue({
                            maybeSingle: jest.fn().mockResolvedValue({ data: expenseRow, error: null }),
                        }),
                    }),
                }),
            };
        }
        if (table === 'expense_splits') {
            return {
                delete: jest.fn().mockReturnValue({
                    eq: mockSplitsDeleteEq,
                }),
                insert: mockSplitsInsert,
            };
        }
        throw new Error(`Unexpected table ${table}`);
    });
}

describe('updateExpense', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockSplitsInsert.mockResolvedValue({ error: null });
        mockSplitsDeleteEq.mockResolvedValue({ error: null });
        mockExpenseSelect();
    });

    it('resolves equal splits when amounts are omitted', async () => {
        const updateExpenseInStore = jest.fn();
        (useAppStore.getState as jest.Mock).mockReturnValue({
            expenses: [],
            updateExpense: updateExpenseInStore,
        });

        const result = await updateExpense('e1', {
            splits: [{ userId: 'u1' }, { userId: 'u2' }],
        });

        expect(result).not.toBeNull();
        expect(mockToastShow).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'success' }),
        );

        expect(mockSplitsInsert).toHaveBeenCalledWith([
            { expense_id: 'e1', user_id: 'u1', amount: 50 },
            { expense_id: 'e1', user_id: 'u2', amount: 50 },
        ]);

        expect(updateExpenseInStore).toHaveBeenCalledWith(
            expect.objectContaining({
                splits: expect.arrayContaining([
                    expect.objectContaining({ userId: 'u1', amount: 50 }),
                    expect.objectContaining({ userId: 'u2', amount: 50 }),
                ]),
            }),
        );
    });

    it('rejects unequal split inputs that do not sum to the total', async () => {
        const result = await updateExpense('e1', {
            splits: [
                { userId: 'u1', amount: 30 },
                { userId: 'u2', amount: 30 },
            ],
        });

        expect(result).toBeNull();
        expect(mockToastShow).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'error',
                text2: expect.stringContaining('does not equal total amount'),
            }),
        );
    });
});
