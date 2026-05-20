/**
 * Feed selector — builds a FeedItem[] for GroupDetailScreen
 * by interleaving the group's expenses, messages, and settlements,
 * sorted by createdAt DESC.
 */

import {
    ExpenseWithSplits,
    GroupMessage,
    FeedItem,
    Settlement,
} from '@cost-share/shared';
import { decorateExpense } from './expense-delta';

export function buildFeed(
    groupId: string,
    expenses: ExpenseWithSplits[],
    messages: GroupMessage[],
    settlements: Settlement[],
    currentUserId: string,
): FeedItem[] {
    const expenseItems: FeedItem[] = expenses
        .filter(e => e.groupId === groupId && !e.isDeleted)
        .map(e => ({
            kind: 'expense',
            sortAt: e.createdAt,
            expense: decorateExpense(e, currentUserId),
        }));

    const messageItems: FeedItem[] = messages
        .filter(m => !m.isDeleted)
        .map(m => ({
            kind: 'message',
            sortAt: m.createdAt,
            message: m,
        }));

    const settlementItems: FeedItem[] = settlements
        .filter(s => s.groupId === groupId && s.deletedAt === null)
        .map(s => ({
            kind: 'settlement',
            sortAt: s.createdAt,
            settlement: s,
        }));

    return [...expenseItems, ...messageItems, ...settlementItems].sort(
        (a, b) => b.sortAt.getTime() - a.sortAt.getTime(),
    );
}
