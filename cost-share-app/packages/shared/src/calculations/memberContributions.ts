/**
 * Per-currency aggregations for the Balances screen.
 *
 * - `calculateMemberContributions` produces the gross "payer → consumer"
 *   matrix used to render the per-member drill-in dialog (no settlement
 *   offsets, no reverse-direction netting).
 * - `calculateUserBalancesByCurrencyFromData` produces per-currency net
 *   balances that the simplified-debts section runs `simplifyDebts` on,
 *   once per currency.
 *
 * Both functions work in integer cents internally to avoid floating-
 * point drift while summing many rows.
 */

export interface CurrencyAmount {
    currency: string;
    amount: number;
}

export interface PaidByMatrixRow {
    payerId: string;
    consumerId: string;
    currency: string;
    amount: number;
}

export interface MemberContributionTotals {
    userId: string;
    paid: CurrencyAmount[];
    owed: CurrencyAmount[];
}

export interface MemberContributionsResult {
    totals: MemberContributionTotals[];
    matrix: PaidByMatrixRow[];
}

export interface BalanceExpenseRowWithCurrency {
    id: string;
    paidBy: string;
    amount: number;
    currency: string;
}

export interface BalanceSplitRowInput {
    expenseId: string;
    userId: string;
    amount: number;
}

export interface BalanceSettlementRowWithCurrency {
    fromUserId: string;
    toUserId: string;
    amount: number;
    currency: string;
}

function toCents(n: number): number {
    return Math.round(n * 100);
}

function fromCents(cents: number): number {
    return Number((cents / 100).toFixed(2));
}

function sortByCurrency(a: CurrencyAmount, b: CurrencyAmount): number {
    return a.currency.localeCompare(b.currency);
}

export function calculateMemberContributions(args: {
    userIds: string[];
    expenses: BalanceExpenseRowWithCurrency[];
    splits: BalanceSplitRowInput[];
}): MemberContributionsResult {
    const { userIds, expenses, splits } = args;

    const expenseById = new Map<string, BalanceExpenseRowWithCurrency>();
    for (const e of expenses) expenseById.set(e.id, e);

    // totals: userId -> currency -> { paidCents, owedCents }
    const totalsMap = new Map<string, Map<string, { paid: number; owed: number }>>();
    for (const uid of userIds) totalsMap.set(uid, new Map());

    const ensureTotals = (uid: string, currency: string) => {
        let perCurrency = totalsMap.get(uid);
        if (!perCurrency) {
            perCurrency = new Map();
            totalsMap.set(uid, perCurrency);
        }
        let entry = perCurrency.get(currency);
        if (!entry) {
            entry = { paid: 0, owed: 0 };
            perCurrency.set(currency, entry);
        }
        return entry;
    };

    // matrix: payerId -> consumerId -> currency -> cents
    const matrixMap = new Map<string, Map<string, Map<string, number>>>();
    const addMatrix = (payerId: string, consumerId: string, currency: string, cents: number) => {
        let perPayer = matrixMap.get(payerId);
        if (!perPayer) {
            perPayer = new Map();
            matrixMap.set(payerId, perPayer);
        }
        let perConsumer = perPayer.get(consumerId);
        if (!perConsumer) {
            perConsumer = new Map();
            perPayer.set(consumerId, perConsumer);
        }
        perConsumer.set(currency, (perConsumer.get(currency) ?? 0) + cents);
    };

    for (const e of expenses) {
        ensureTotals(e.paidBy, e.currency).paid += toCents(e.amount);
    }

    for (const s of splits) {
        const expense = expenseById.get(s.expenseId);
        if (!expense) continue;
        const currency = expense.currency;
        const splitCents = toCents(s.amount);

        ensureTotals(s.userId, currency).owed += splitCents;
        addMatrix(expense.paidBy, s.userId, currency, splitCents);
    }

    const totals: MemberContributionTotals[] = userIds.map(uid => {
        const perCurrency = totalsMap.get(uid) ?? new Map();
        const paid: CurrencyAmount[] = [];
        const owed: CurrencyAmount[] = [];
        for (const [currency, { paid: p, owed: o }] of perCurrency) {
            if (p !== 0) paid.push({ currency, amount: fromCents(p) });
            if (o !== 0) owed.push({ currency, amount: fromCents(o) });
        }
        paid.sort(sortByCurrency);
        owed.sort(sortByCurrency);
        return { userId: uid, paid, owed };
    });

    const matrix: PaidByMatrixRow[] = [];
    for (const [payerId, perPayer] of matrixMap) {
        for (const [consumerId, perConsumer] of perPayer) {
            for (const [currency, cents] of perConsumer) {
                if (cents === 0) continue;
                matrix.push({
                    payerId,
                    consumerId,
                    currency,
                    amount: fromCents(cents),
                });
            }
        }
    }
    matrix.sort((a, b) => {
        if (a.payerId !== b.payerId) return a.payerId.localeCompare(b.payerId);
        if (a.consumerId !== b.consumerId) return a.consumerId.localeCompare(b.consumerId);
        return a.currency.localeCompare(b.currency);
    });

    return { totals, matrix };
}

export interface UserBalanceByCurrencyRow {
    currency: string;
    totalPaid: number;
    totalOwed: number;
    totalSettledPaid: number;
    totalSettledReceived: number;
    netBalance: number;
}

export interface UserBalanceByCurrency {
    groupId: string;
    userId: string;
    byCurrency: UserBalanceByCurrencyRow[];
}

export function calculateUserBalancesByCurrencyFromData(args: {
    groupId: string;
    userIds: string[];
    expenses: BalanceExpenseRowWithCurrency[];
    splits: BalanceSplitRowInput[];
    settlements: BalanceSettlementRowWithCurrency[];
}): UserBalanceByCurrency[] {
    const { groupId, userIds, expenses, splits, settlements } = args;

    const expenseById = new Map<string, BalanceExpenseRowWithCurrency>();
    for (const e of expenses) expenseById.set(e.id, e);

    // userId -> currency -> totals (cents)
    const acc = new Map<
        string,
        Map<
            string,
            {
                paid: number;
                owed: number;
                settledPaid: number;
                settledReceived: number;
            }
        >
    >();
    for (const uid of userIds) acc.set(uid, new Map());

    const ensure = (uid: string, currency: string) => {
        let perUser = acc.get(uid);
        if (!perUser) {
            perUser = new Map();
            acc.set(uid, perUser);
        }
        let entry = perUser.get(currency);
        if (!entry) {
            entry = { paid: 0, owed: 0, settledPaid: 0, settledReceived: 0 };
            perUser.set(currency, entry);
        }
        return entry;
    };

    for (const e of expenses) {
        ensure(e.paidBy, e.currency).paid += toCents(e.amount);
    }

    for (const s of splits) {
        const expense = expenseById.get(s.expenseId);
        if (!expense) continue;
        ensure(s.userId, expense.currency).owed += toCents(s.amount);
    }

    for (const s of settlements) {
        ensure(s.fromUserId, s.currency).settledPaid += toCents(s.amount);
        ensure(s.toUserId, s.currency).settledReceived += toCents(s.amount);
    }

    return userIds.map(userId => {
        const perCurrency = acc.get(userId) ?? new Map();
        const rows: UserBalanceByCurrencyRow[] = [];
        for (const [currency, t] of perCurrency) {
            const netCents = t.paid - t.owed + t.settledReceived - t.settledPaid;
            if (
                t.paid === 0 &&
                t.owed === 0 &&
                t.settledPaid === 0 &&
                t.settledReceived === 0
            ) {
                continue;
            }
            rows.push({
                currency,
                totalPaid: fromCents(t.paid),
                totalOwed: fromCents(t.owed),
                totalSettledPaid: fromCents(t.settledPaid),
                totalSettledReceived: fromCents(t.settledReceived),
                netBalance: fromCents(netCents),
            });
        }
        rows.sort((a, b) => a.currency.localeCompare(b.currency));
        return { groupId, userId, byCurrency: rows };
    });
}
