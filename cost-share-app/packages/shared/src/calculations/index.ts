import { UserBalance } from '../types';

export {
    aggregateBalanceInBaseCurrency,
    aggregateBalanceWithoutFx,
    convertToBaseCurrency,
    type BalanceByCurrencyRow,
    type RatesFromBase,
} from './fxConversion';

export {
    collectFriendFxCurrencies,
    friendBalanceRows,
    resolveFriendDisplayBalance,
    type FriendBalanceDisplay,
} from './friendBalanceDisplay';

export {
    collectGroupFxCurrencies,
    resolveGroupBalanceDisplay,
    type GroupBalanceDisplay,
} from './groupBalanceDisplay';

export {
    simplifyDebts,
    simplifyDebtsExact,
    simplifyDebtsGreedy,
    UnbalancedLedgerError,
} from './simplifyDebts';

export {
    calculateMemberContributions,
    calculateUserBalancesByCurrencyFromData,
    type CurrencyAmount,
    type PaidByMatrixRow,
    type MemberContributionTotals,
    type MemberContributionsResult,
    type UserBalanceByCurrency,
    type UserBalanceByCurrencyRow,
    type BalanceExpenseRowWithCurrency,
    type BalanceSplitRowInput,
    type BalanceSettlementRowWithCurrency,
} from './memberContributions';

export function calculateEqualSplit(totalAmount: number, numPeople: number): number[] {
    const baseAmount = Math.floor((totalAmount * 100) / numPeople) / 100;
    const remainder = Number((totalAmount - baseAmount * numPeople).toFixed(2));
    const splits = new Array(numPeople).fill(baseAmount);
    if (remainder > 0) {
        splits[splits.length - 1] = Number((splits[splits.length - 1] + remainder).toFixed(2));
    }
    return splits;
}

export function validateExpenseSplits(
    totalAmount: number,
    splits: { userId: string; amount: number }[],
): { valid: boolean; message?: string; difference?: number } {
    const splitSum = splits.reduce((sum, s) => sum + s.amount, 0);
    const difference = Number((totalAmount - splitSum).toFixed(2));

    if (Math.abs(difference) > 0.01) {
        return {
            valid: false,
            message: `Splits sum (${splitSum.toFixed(2)}) does not equal total amount (${totalAmount.toFixed(2)})`,
            difference,
        };
    }
    if (splits.some(s => s.amount < 0)) {
        return { valid: false, message: 'Split amounts cannot be negative' };
    }
    return { valid: true };
}

export type BalanceExpenseRow = { id: string; paidBy: string; amount: number };
export type BalanceSplitRow = { expenseId: string; userId: string; amount: number };
export type BalanceSettlementRow = { fromUserId: string; toUserId: string; amount: number };

export function calculateUserBalancesFromData(
    groupId: string,
    defaultCurrency: string,
    userIds: string[],
    expenses: BalanceExpenseRow[],
    splits: BalanceSplitRow[],
    settlements: BalanceSettlementRow[],
): UserBalance[] {
    return userIds.map(uid => {
        const totalPaid = expenses
            .filter(e => e.paidBy === uid)
            .reduce((sum, e) => sum + e.amount, 0);

        const totalOwed = splits
            .filter(s => s.userId === uid)
            .reduce((sum, s) => sum + s.amount, 0);

        const totalSettledPaid = settlements
            .filter(s => s.fromUserId === uid)
            .reduce((sum, s) => sum + s.amount, 0);

        const totalSettledReceived = settlements
            .filter(s => s.toUserId === uid)
            .reduce((sum, s) => sum + s.amount, 0);

        const netBalance = totalPaid - totalOwed + totalSettledReceived - totalSettledPaid;

        return {
            groupId,
            userId: uid,
            currency: defaultCurrency,
            totalPaid: Number(totalPaid.toFixed(2)),
            totalOwed: Number(totalOwed.toFixed(2)),
            totalSettledPaid: Number(totalSettledPaid.toFixed(2)),
            totalSettledReceived: Number(totalSettledReceived.toFixed(2)),
            netBalance: Number(netBalance.toFixed(2)),
        };
    });
}

export function validateSettlementAmount(
    balances: UserBalance[],
    fromUserId: string,
    toUserId: string,
    amount: number,
): { valid: boolean; message?: string; maxAmount?: number } {
    const fromUserBalance = balances.find(b => b.userId === fromUserId);
    const toUserBalance = balances.find(b => b.userId === toUserId);

    if (!fromUserBalance || !toUserBalance) {
        return { valid: false, message: 'User not found in group' };
    }
    if (fromUserBalance.netBalance >= 0) {
        return { valid: false, message: 'User does not owe money in this group' };
    }
    if (toUserBalance.netBalance <= 0) {
        return { valid: false, message: 'Target user is not owed money in this group' };
    }

    const maxAmount = Math.min(
        Math.abs(fromUserBalance.netBalance),
        toUserBalance.netBalance,
    );

    if (amount > maxAmount + 0.01) {
        return {
            valid: false,
            message: `Settlement amount exceeds maximum of ${maxAmount.toFixed(2)}`,
            maxAmount: Number(maxAmount.toFixed(2)),
        };
    }

    return { valid: true, maxAmount: Number(maxAmount.toFixed(2)) };
}
