/**
 * Collect user IDs referenced in a group feed so profiles can be resolved
 * for members who left or deactivated their account.
 */

import {
    Expense,
    ExpenseWithDelta,
    GroupMessage,
    Settlement,
} from '@cost-share/shared';

type FeedExpense = Expense | ExpenseWithDelta;

export function collectFeedUserIds(
    expenses: FeedExpense[],
    messages: GroupMessage[],
    settlements: Settlement[],
): string[] {
    const ids = new Set<string>();
    for (const e of expenses) {
        ids.add(e.createdBy);
        ids.add(e.paidBy);
    }
    for (const m of messages) {
        ids.add(m.userId);
    }
    for (const s of settlements) {
        ids.add(s.createdBy);
        ids.add(s.fromUserId);
        ids.add(s.toUserId);
    }
    return [...ids];
}
