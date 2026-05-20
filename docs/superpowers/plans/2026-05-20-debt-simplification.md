# Debt Simplification Implementation Plan

**Status:** Executed on `dev` (commits a291695…091603f, 2026-05-20). All 11 tasks complete; 23 new tests pass; shared + mobile typecheck clean.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current greedy `simplifyDebts` with a hybrid (exact for ≤10 non-zero balances, greedy otherwise) algorithm that guarantees the minimum number of transactions for small groups, and surface the result on `BalancesScreen` with a payment-count summary and a "Minimum" badge.

**Architecture:** Pure functions in `packages/shared/src/calculations/simplifyDebts/` (modularly split: orchestrator / exact / greedy / shared utilities). Mobile `groups.service.ts` orchestrates data loading and catches `UnbalancedLedgerError`. `BalancesScreen` consumes the new `SimplifiedDebtsResult` shape and renders the summary + badge with full i18next pluralization (EN + HE) and RTL-safe layout.

**Tech Stack:** TypeScript (strict), Jest (`jest-expo`) + `@testing-library/react-native`, NativeWind v4 (Tailwind for RN), `i18next` v25 with `compatibilityJSON: 'v4'` plural rules, React Native 0.81 / Expo SDK 54.

**Spec:** `docs/superpowers/specs/2026-05-20-debt-simplification-design.md`

---

## File Structure

We split the algorithm across small focused files instead of cramming it into one file. This makes each module easier to reason about, easier to unit-test in isolation, and prevents `calculations/index.ts` from growing unbounded.

| Path | Responsibility |
|------|----------------|
| `packages/shared/src/calculations/simplifyDebts/shared.ts` | `UnbalancedLedgerError`, integer-cents helpers (`toCents`, `centsToAmount`), `EXACT_THRESHOLD` constant, internal `CentBalance` type. |
| `packages/shared/src/calculations/simplifyDebts/greedy.ts` | `simplifyDebtsGreedy` — Splitwise-style sorted matching on cent balances. |
| `packages/shared/src/calculations/simplifyDebts/exact.ts` | `simplifyDebtsExact` — backtracking with memoization + branch-and-bound, minimum-transactions guarantee. |
| `packages/shared/src/calculations/simplifyDebts/index.ts` | Orchestrator: filters non-zero balances, validates sum-to-zero invariant, dispatches exact vs greedy, hydrates `DebtSummary` objects (names, currency). |
| `packages/shared/src/calculations/index.ts` | Re-exports `simplifyDebts`, `simplifyDebtsExact`, `simplifyDebtsGreedy`, `UnbalancedLedgerError` from the new module. The old `simplifyDebts` function in this file is replaced. |
| `packages/shared/src/types/index.ts` | Add `SimplifiedDebtsResult` interface. |
| `apps/mobile/__tests__/shared/simplifyDebts.test.ts` | Unit tests (Jest in mobile app — shared package has no own test runner; mobile jest config already aliases `@cost-share/shared` → `packages/shared/src`). |
| `apps/mobile/services/groups.service.ts` | `getGroupDebts` returns `SimplifiedDebtsResult`, catches `UnbalancedLedgerError`. |
| `apps/mobile/screens/balances/BalancesScreen.tsx` | Consume `SimplifiedDebtsResult`; render summary line + "Minimum" badge below the section title. |
| `apps/mobile/i18n/locales/en.json` | Add `paymentsToSettle` (with `_one`/`_other`) + `minimumBadge`. |
| `apps/mobile/i18n/locales/he.json` | Same keys in Hebrew. |
| `apps/mobile/__tests__/screens/balances/BalancesScreen.test.tsx` | Update existing mocks to return `SimplifiedDebtsResult`; add tests for summary + badge. |

**No changes:** Supabase schema/RPC, `SettleUpScreen`, dashboard RPC, web app.

---

## Task Map (one task = one logical chunk + tests + commit)

1. Add `SimplifiedDebtsResult` type.
2. Create `simplifyDebts/shared.ts` (error class + cents helpers + threshold).
3. Build `simplifyDebtsGreedy` (TDD).
4. Build `simplifyDebtsExact` (TDD).
5. Build `simplifyDebts` orchestrator (TDD).
6. Wire orchestrator into `calculations/index.ts` and remove old implementation.
7. Update `groups.service.ts#getGroupDebts` to return the new shape and handle errors.
8. Add i18n keys (EN + HE) with pluralization.
9. Update `BalancesScreen` to render summary + badge.
10. Update `BalancesScreen` test mocks and add summary/badge assertions.
11. Final verification pass (typecheck, full test suite, perf sanity).

---

### Task 1: Add `SimplifiedDebtsResult` type

**Files:**
- Modify: `cost-share-app/packages/shared/src/types/index.ts` (insert near `DebtSummary`, around line 160)

- [ ] **Step 1: Add the type next to `DebtSummary`**

Open `cost-share-app/packages/shared/src/types/index.ts`. Directly **after** the `DebtSummary` interface (currently ending around line 160), add:

```typescript
/**
 * Result of debt simplification — list of transfers + metadata about
 * how the result was computed.
 *
 * - `algorithm: 'exact'` means the transaction count is provably minimal.
 * - `algorithm: 'greedy'` means a Splitwise-style heuristic was used
 *   (small groups always get 'exact'; very large groups get 'greedy').
 */
export interface SimplifiedDebtsResult {
    debts: DebtSummary[];
    transactionCount: number;
    algorithm: 'exact' | 'greedy';
}
```

- [ ] **Step 2: Typecheck**

Run: `cd cost-share-app && npx tsc -p packages/shared/tsconfig.json --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/packages/shared/src/types/index.ts
git commit -m "feat(shared): add SimplifiedDebtsResult type"
```

---

### Task 2: Create `simplifyDebts/shared.ts` (error + cents helpers + threshold)

**Files:**
- Create: `cost-share-app/packages/shared/src/calculations/simplifyDebts/shared.ts`

- [ ] **Step 1: Create the file**

Path: `cost-share-app/packages/shared/src/calculations/simplifyDebts/shared.ts`

```typescript
/**
 * Internal building blocks shared by the exact + greedy debt-simplification
 * algorithms. Working in integer cents avoids floating-point drift and lets
 * the exact algorithm memoize on a stable string key.
 */

/**
 * Thrown when the input balances do not sum to zero within tolerance.
 * The Balances screen catches this and renders an empty state rather
 * than crashing on corrupt data.
 */
export class UnbalancedLedgerError extends Error {
    constructor(message = 'Net balances do not sum to zero') {
        super(message);
        this.name = 'UnbalancedLedgerError';
    }
}

/** Maximum number of non-zero balances at which we still run the exact algorithm. */
export const EXACT_THRESHOLD = 10;

/** Internal: a user's balance expressed in integer cents. */
export interface CentBalance {
    userId: string;
    cents: number; // positive = creditor, negative = debtor
}

/** Internal: a single transfer expressed in integer cents. */
export interface CentTransfer {
    fromUserId: string;
    toUserId: string;
    cents: number; // always positive
}

/** Round a decimal amount to integer cents. */
export function toCents(amount: number): number {
    return Math.round(amount * 100);
}

/** Convert integer cents back to a 2-decimal amount. */
export function centsToAmount(cents: number): number {
    return Number((cents / 100).toFixed(2));
}
```

- [ ] **Step 2: Typecheck**

Run: `cd cost-share-app && npx tsc -p packages/shared/tsconfig.json --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/packages/shared/src/calculations/simplifyDebts/shared.ts
git commit -m "feat(shared): scaffold simplifyDebts module (errors + cents helpers)"
```

---

### Task 3: Build `simplifyDebtsGreedy` (TDD)

**Files:**
- Create: `cost-share-app/apps/mobile/__tests__/shared/simplifyDebts.test.ts` (tests live here; jest config in mobile already aliases `@cost-share/shared` to the package source)
- Create: `cost-share-app/packages/shared/src/calculations/simplifyDebts/greedy.ts`

- [ ] **Step 1: Write the failing greedy tests**

Create `cost-share-app/apps/mobile/__tests__/shared/simplifyDebts.test.ts`:

```typescript
import {
    simplifyDebtsGreedy,
} from '@cost-share/shared/calculations/simplifyDebts/greedy';
import type { CentBalance } from '@cost-share/shared/calculations/simplifyDebts/shared';

/**
 * Helper: assert applying all transfers zeroes every balance.
 * Operates on integer cents to avoid floating-point noise.
 */
function assertBalancesZeroed(
    balances: CentBalance[],
    transfers: { fromUserId: string; toUserId: string; cents: number }[],
): void {
    const net = new Map<string, number>();
    for (const b of balances) net.set(b.userId, b.cents);
    for (const t of transfers) {
        net.set(t.fromUserId, (net.get(t.fromUserId) ?? 0) + t.cents);
        net.set(t.toUserId, (net.get(t.toUserId) ?? 0) - t.cents);
    }
    for (const [userId, cents] of net) {
        expect({ userId, cents }).toEqual({ userId, cents: 0 });
    }
}

describe('simplifyDebtsGreedy', () => {
    it('returns no transfers when all balances are zero', () => {
        expect(simplifyDebtsGreedy([])).toEqual([]);
    });

    it('handles two-person debt', () => {
        const balances: CentBalance[] = [
            { userId: 'A', cents: -5000 },
            { userId: 'B', cents: 5000 },
        ];
        const transfers = simplifyDebtsGreedy(balances);
        expect(transfers).toEqual([
            { fromUserId: 'A', toUserId: 'B', cents: 5000 },
        ]);
        assertBalancesZeroed(balances, transfers);
    });

    it('matches largest debtor with largest creditor first', () => {
        const balances: CentBalance[] = [
            { userId: 'A', cents: -5000 },
            { userId: 'B', cents: 2000 },
            { userId: 'C', cents: 1500 },
            { userId: 'D', cents: 1000 },
            { userId: 'E', cents: 500 },
        ];
        const transfers = simplifyDebtsGreedy(balances);
        // A is the only debtor; first match must go to the largest creditor (B).
        expect(transfers[0]).toEqual({ fromUserId: 'A', toUserId: 'B', cents: 2000 });
        expect(transfers.length).toBeLessThanOrEqual(balances.length - 1);
        assertBalancesZeroed(balances, transfers);
    });

    it('produces at most k-1 transfers for k non-zero members', () => {
        const balances: CentBalance[] = [
            { userId: 'A', cents: -3000 },
            { userId: 'B', cents: -2000 },
            { userId: 'C', cents: 1500 },
            { userId: 'D', cents: 1500 },
            { userId: 'E', cents: 2000 },
        ];
        const transfers = simplifyDebtsGreedy(balances);
        expect(transfers.length).toBeLessThanOrEqual(4);
        assertBalancesZeroed(balances, transfers);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd cost-share-app/apps/mobile && npx jest __tests__/shared/simplifyDebts.test.ts`
Expected: FAIL — `Cannot find module '@cost-share/shared/calculations/simplifyDebts/greedy'`.

- [ ] **Step 3: Implement `simplifyDebtsGreedy`**

Create `cost-share-app/packages/shared/src/calculations/simplifyDebts/greedy.ts`:

```typescript
import type { CentBalance, CentTransfer } from './shared';

/**
 * Splitwise-style greedy matching for groups too large for exact search.
 *
 * Sort debtors and creditors by absolute balance descending, then keep
 * pairing the largest of each until everyone is square. For `k` non-zero
 * balances this produces at most `k - 1` transfers — not always optimal,
 * but fast (O(k log k)) and consistent with what other apps display.
 *
 * Input balances are assumed to sum to zero; the orchestrator validates
 * this before calling.
 */
export function simplifyDebtsGreedy(balances: CentBalance[]): CentTransfer[] {
    const debtors = balances
        .filter(b => b.cents < 0)
        .map(b => ({ ...b }))
        .sort((a, b) => a.cents - b.cents); // most negative first
    const creditors = balances
        .filter(b => b.cents > 0)
        .map(b => ({ ...b }))
        .sort((a, b) => b.cents - a.cents); // most positive first

    const transfers: CentTransfer[] = [];
    let di = 0;
    let ci = 0;
    while (di < debtors.length && ci < creditors.length) {
        const debtor = debtors[di];
        const creditor = creditors[ci];
        const amount = Math.min(-debtor.cents, creditor.cents);
        transfers.push({
            fromUserId: debtor.userId,
            toUserId: creditor.userId,
            cents: amount,
        });
        debtor.cents += amount;
        creditor.cents -= amount;
        if (debtor.cents === 0) di += 1;
        if (creditor.cents === 0) ci += 1;
    }
    return transfers;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd cost-share-app/apps/mobile && npx jest __tests__/shared/simplifyDebts.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/packages/shared/src/calculations/simplifyDebts/greedy.ts \
        cost-share-app/apps/mobile/__tests__/shared/simplifyDebts.test.ts
git commit -m "feat(shared): add simplifyDebtsGreedy with sorted matching"
```

---

### Task 4: Build `simplifyDebtsExact` (TDD, backtracking + memoization)

**Files:**
- Modify: `cost-share-app/apps/mobile/__tests__/shared/simplifyDebts.test.ts` (append exact-algorithm tests)
- Create: `cost-share-app/packages/shared/src/calculations/simplifyDebts/exact.ts`

- [ ] **Step 1: Append the failing exact-algorithm tests**

Add to the **bottom** of `cost-share-app/apps/mobile/__tests__/shared/simplifyDebts.test.ts`:

```typescript
import {
    simplifyDebtsExact,
} from '@cost-share/shared/calculations/simplifyDebts/exact';

describe('simplifyDebtsExact', () => {
    it('returns no transfers when all balances are zero', () => {
        expect(simplifyDebtsExact([])).toEqual([]);
    });

    it('handles two-person debt with a single transfer', () => {
        const balances: CentBalance[] = [
            { userId: 'A', cents: -5000 },
            { userId: 'B', cents: 5000 },
        ];
        const transfers = simplifyDebtsExact(balances);
        expect(transfers).toHaveLength(1);
        assertBalancesZeroed(balances, transfers);
    });

    it('produces the minimum number of transfers (classic Splitwise counterexample)', () => {
        // Naive unsorted greedy can do 4 here; optimal is 3.
        // A=-50, B=-10, C=+30, D=+30, can be settled in 3 transfers:
        //   B->C 10, A->C 20, A->D 30  (3 transfers)
        const balances: CentBalance[] = [
            { userId: 'A', cents: -5000 },
            { userId: 'B', cents: -1000 },
            { userId: 'C', cents: 3000 },
            { userId: 'D', cents: 3000 },
        ];
        const transfers = simplifyDebtsExact(balances);
        expect(transfers.length).toBe(3);
        assertBalancesZeroed(balances, transfers);
    });

    it('finds the optimal solution when a subset sums perfectly', () => {
        // {-5, -10, +3, +12} — debtors total -15, creditors total +15.
        // Optimal: 2 transfers if a subset sums match perfectly, else 3.
        // Here {-3 from -5}+{-12 from -10} doesn't work; minimum is 3.
        // But {-50, -25, +25, +50}: {-25 to +25, -50 to +50} = 2 transfers.
        const balances: CentBalance[] = [
            { userId: 'A', cents: -5000 },
            { userId: 'B', cents: -2500 },
            { userId: 'C', cents: 2500 },
            { userId: 'D', cents: 5000 },
        ];
        const transfers = simplifyDebtsExact(balances);
        expect(transfers.length).toBe(2);
        assertBalancesZeroed(balances, transfers);
    });

    it('handles 10 non-zero balances within budget', () => {
        // 5 debtors / 5 creditors with mixed magnitudes.
        const balances: CentBalance[] = [
            { userId: 'd1', cents: -1000 },
            { userId: 'd2', cents: -1500 },
            { userId: 'd3', cents: -2000 },
            { userId: 'd4', cents: -2500 },
            { userId: 'd5', cents: -3000 },
            { userId: 'c1', cents: 500 },
            { userId: 'c2', cents: 1500 },
            { userId: 'c3', cents: 2000 },
            { userId: 'c4', cents: 2500 },
            { userId: 'c5', cents: 3500 },
        ];
        const t0 = Date.now();
        const transfers = simplifyDebtsExact(balances);
        const elapsed = Date.now() - t0;
        assertBalancesZeroed(balances, transfers);
        expect(transfers.length).toBeLessThanOrEqual(9); // k-1 upper bound
        expect(elapsed).toBeLessThan(500); // generous CI bound; expected <5 ms
    });

    it('tie-breaks toward the largest first transfer when counts are equal', () => {
        // Two valid 1-transfer solutions exist (only one debtor/creditor pair),
        // so the first transfer is unambiguous. Use a 2-transfer scenario where
        // either creditor could be visited first; prefer the larger amount.
        const balances: CentBalance[] = [
            { userId: 'A', cents: -3000 },
            { userId: 'B', cents: 1000 },
            { userId: 'C', cents: 2000 },
        ];
        const transfers = simplifyDebtsExact(balances);
        expect(transfers.length).toBe(2);
        // First transfer should be the larger one (A -> C, 2000).
        expect(transfers[0]).toEqual({ fromUserId: 'A', toUserId: 'C', cents: 2000 });
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd cost-share-app/apps/mobile && npx jest __tests__/shared/simplifyDebts.test.ts`
Expected: FAIL — `Cannot find module '@cost-share/shared/calculations/simplifyDebts/exact'`.

- [ ] **Step 3: Implement `simplifyDebtsExact`**

Create `cost-share-app/packages/shared/src/calculations/simplifyDebts/exact.ts`:

```typescript
import type { CentBalance, CentTransfer } from './shared';

/**
 * Exact debt simplification: returns the shortest possible list of
 * transfers that zeroes every balance. Pure backtracking with two
 * pruning tricks:
 *
 *   1. Branch-and-bound — we abandon any branch that already has
 *      more transfers than the best complete solution seen so far.
 *   2. Memoization — when we revisit the same multiset of remaining
 *      balances, we already know the best length from there.
 *
 * Tie-breaker: among solutions of equal length, prefer the one whose
 * first transfer is largest. This matches Splitwise's "round numbers
 * first" feel and is stable across runs.
 *
 * Intended for k ≤ 10. Expected runtime <1 ms on mobile for k ≤ 10.
 *
 * Input balances are assumed to sum to zero; the orchestrator validates.
 */
export function simplifyDebtsExact(input: CentBalance[]): CentTransfer[] {
    if (input.length === 0) return [];

    const memo = new Map<string, number>(); // stateKey -> best length from here
    let best: CentTransfer[] = [];
    let bestLength = Number.POSITIVE_INFINITY;

    /** Stable key for the current multiset of balances. */
    function stateKey(balances: CentBalance[]): string {
        return balances
            .filter(b => b.cents !== 0)
            .map(b => `${b.userId}:${b.cents}`)
            .sort()
            .join('|');
    }

    function search(balances: CentBalance[], path: CentTransfer[]): void {
        // Prune: branch already worse than best known full solution.
        if (path.length >= bestLength) return;

        const remaining = balances.filter(b => b.cents !== 0);
        if (remaining.length === 0) {
            // Found a complete solution. Update best with tie-breaker on
            // first transfer amount.
            if (
                path.length < bestLength
                || (path.length === bestLength
                    && best.length > 0
                    && path[0].cents > best[0].cents)
            ) {
                best = path.slice();
                bestLength = path.length;
            }
            return;
        }

        const key = stateKey(remaining);
        const seenBest = memo.get(key);
        // If we've reached this state before with no fewer transfers ahead
        // than we'd need to beat `bestLength`, skip.
        if (seenBest !== undefined && path.length + seenBest >= bestLength) {
            return;
        }

        // Pick the first debtor deterministically.
        const debtor = remaining.find(b => b.cents < 0)!;
        const creditors = remaining.filter(b => b.cents > 0);

        // Try larger creditors first — this finds good solutions fast and
        // makes the branch-and-bound prune aggressively. Also aligns with
        // the tie-breaker.
        creditors.sort((a, b) => b.cents - a.cents);

        for (const creditor of creditors) {
            const amount = Math.min(-debtor.cents, creditor.cents);
            const next = balances.map(b => {
                if (b.userId === debtor.userId) return { ...b, cents: b.cents + amount };
                if (b.userId === creditor.userId) return { ...b, cents: b.cents - amount };
                return b;
            });
            path.push({
                fromUserId: debtor.userId,
                toUserId: creditor.userId,
                cents: amount,
            });
            search(next, path);
            path.pop();
        }

        // Record best-length-from-here for memoization. We only know an
        // upper bound (the best we found), but that's enough to prune.
        const lengthFromHere = bestLength - path.length;
        if (seenBest === undefined || lengthFromHere < seenBest) {
            memo.set(key, lengthFromHere);
        }
    }

    search(input.map(b => ({ ...b })), []);
    return best;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd cost-share-app/apps/mobile && npx jest __tests__/shared/simplifyDebts.test.ts`
Expected: PASS — all greedy + exact tests.

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/packages/shared/src/calculations/simplifyDebts/exact.ts \
        cost-share-app/apps/mobile/__tests__/shared/simplifyDebts.test.ts
git commit -m "feat(shared): add simplifyDebtsExact with backtracking + memoization"
```

---

### Task 5: Build the `simplifyDebts` orchestrator (TDD)

**Files:**
- Modify: `cost-share-app/apps/mobile/__tests__/shared/simplifyDebts.test.ts` (append orchestrator tests)
- Create: `cost-share-app/packages/shared/src/calculations/simplifyDebts/index.ts`

- [ ] **Step 1: Append the failing orchestrator tests**

Add to the **bottom** of `cost-share-app/apps/mobile/__tests__/shared/simplifyDebts.test.ts`:

```typescript
import { simplifyDebts } from '@cost-share/shared/calculations/simplifyDebts';
import { UnbalancedLedgerError } from '@cost-share/shared/calculations/simplifyDebts/shared';
import type { UserBalance } from '@cost-share/shared';

function bal(userId: string, netBalance: number, currency = 'USD'): UserBalance {
    return {
        groupId: 'g1',
        userId,
        currency,
        totalPaid: 0,
        totalOwed: 0,
        totalSettledPaid: 0,
        totalSettledReceived: 0,
        netBalance,
    };
}

const names = new Map<string, string>([
    ['A', 'Alice'],
    ['B', 'Bob'],
    ['C', 'Carol'],
    ['D', 'Dave'],
    ['E', 'Eve'],
]);

describe('simplifyDebts (orchestrator)', () => {
    it('returns empty result with algorithm "exact" when all balances are zero', () => {
        const result = simplifyDebts([bal('A', 0), bal('B', 0)], names);
        expect(result).toEqual({ debts: [], transactionCount: 0, algorithm: 'exact' });
    });

    it('returns empty result when no members are provided', () => {
        expect(simplifyDebts([], names)).toEqual({
            debts: [],
            transactionCount: 0,
            algorithm: 'exact',
        });
    });

    it('selects exact algorithm for ≤10 non-zero balances', () => {
        const result = simplifyDebts(
            [bal('A', -50), bal('B', 50)],
            names,
        );
        expect(result.algorithm).toBe('exact');
        expect(result.transactionCount).toBe(1);
        expect(result.debts).toEqual([
            {
                fromUserId: 'A',
                fromUserName: 'Alice',
                toUserId: 'B',
                toUserName: 'Bob',
                amount: 50,
                currency: 'USD',
            },
        ]);
    });

    it('selects greedy algorithm for >10 non-zero balances', () => {
        const balances: UserBalance[] = [];
        for (let i = 0; i < 6; i++) balances.push(bal(`d${i}`, -10));
        for (let i = 0; i < 6; i++) balances.push(bal(`c${i}`, 10));
        const result = simplifyDebts(balances, new Map());
        expect(result.algorithm).toBe('greedy');
        expect(result.transactionCount).toBeGreaterThan(0);
    });

    it('correctly handles decimal balances ($33.33 split three ways)', () => {
        // $100 paid by A, split evenly: A -33.33, others gain.
        // Easier: A = -33.34, B = +16.67, C = +16.67.
        const result = simplifyDebts(
            [bal('A', -33.34), bal('B', 16.67), bal('C', 16.67)],
            names,
        );
        expect(result.algorithm).toBe('exact');
        const totalCents = result.debts.reduce((sum, d) => sum + Math.round(d.amount * 100), 0);
        expect(totalCents).toBe(3334);
        expect(result.debts.every(d => d.currency === 'USD')).toBe(true);
    });

    it('falls back to "Unknown" for missing names rather than crashing', () => {
        const result = simplifyDebts(
            [bal('A', -50), bal('B', 50)],
            new Map(), // empty
        );
        expect(result.debts[0].fromUserName).toBe('Unknown');
        expect(result.debts[0].toUserName).toBe('Unknown');
    });

    it('throws UnbalancedLedgerError when balances do not sum to zero', () => {
        expect(() => simplifyDebts([bal('A', -50), bal('B', 30)], names))
            .toThrow(UnbalancedLedgerError);
    });

    it('throws UnbalancedLedgerError on a single non-zero member', () => {
        expect(() => simplifyDebts([bal('A', -50), bal('B', 0)], names))
            .toThrow(UnbalancedLedgerError);
    });

    it('preserves the input currency on each debt', () => {
        const result = simplifyDebts(
            [bal('A', -25, 'ILS'), bal('B', 25, 'ILS')],
            names,
        );
        expect(result.debts[0].currency).toBe('ILS');
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd cost-share-app/apps/mobile && npx jest __tests__/shared/simplifyDebts.test.ts`
Expected: FAIL — `Cannot find module '@cost-share/shared/calculations/simplifyDebts'`.

- [ ] **Step 3: Implement the orchestrator**

Create `cost-share-app/packages/shared/src/calculations/simplifyDebts/index.ts`:

```typescript
import { DebtSummary, SimplifiedDebtsResult, UserBalance } from '../../types';
import { simplifyDebtsExact } from './exact';
import { simplifyDebtsGreedy } from './greedy';
import {
    CentBalance,
    CentTransfer,
    EXACT_THRESHOLD,
    UnbalancedLedgerError,
    centsToAmount,
    toCents,
} from './shared';

export { simplifyDebtsExact } from './exact';
export { simplifyDebtsGreedy } from './greedy';
export { UnbalancedLedgerError } from './shared';

/**
 * Compute the minimum (or near-minimum) list of transfers that settles
 * every member's net balance in a group.
 *
 * For ≤10 non-zero balances we run an exact backtracking search and
 * return `algorithm: 'exact'` — the count is provably minimal. Above
 * the threshold we use a sorted-matching heuristic and return
 * `algorithm: 'greedy'`.
 *
 * Throws `UnbalancedLedgerError` if the input balances do not sum to
 * zero (within ±1 cent of tolerance from rounding).
 */
export function simplifyDebts(
    balances: UserBalance[],
    nameById: Map<string, string>,
): SimplifiedDebtsResult {
    // Work in integer cents from here on.
    const cents: CentBalance[] = balances.map(b => ({
        userId: b.userId,
        cents: toCents(b.netBalance),
    }));

    const nonZero = cents.filter(b => b.cents !== 0);

    if (nonZero.length === 0) {
        return { debts: [], transactionCount: 0, algorithm: 'exact' };
    }

    // Sanity check: a valid ledger always sums to zero. With per-row
    // rounding to 2dp, drift can be at most ±(n/2) cents, but for a
    // well-formed group it should be exactly 0. Anything else means the
    // input is corrupt — refuse rather than producing garbage transfers.
    const totalCents = nonZero.reduce((s, b) => s + b.cents, 0);
    if (totalCents !== 0) {
        throw new UnbalancedLedgerError(
            `Net balances sum to ${totalCents} cents (expected 0)`,
        );
    }
    if (nonZero.length < 2) {
        // Sum is 0 but only one non-zero member — impossible unless data
        // is corrupt. Treat as unbalanced.
        throw new UnbalancedLedgerError('Single non-zero member detected');
    }

    const useExact = nonZero.length <= EXACT_THRESHOLD;
    const transfers: CentTransfer[] = useExact
        ? simplifyDebtsExact(nonZero)
        : simplifyDebtsGreedy(nonZero);

    // Map currency from the original balances (one currency per group).
    const currency = balances[0]?.currency ?? 'USD';

    const debts: DebtSummary[] = transfers.map(t => ({
        fromUserId: t.fromUserId,
        fromUserName: nameById.get(t.fromUserId) ?? 'Unknown',
        toUserId: t.toUserId,
        toUserName: nameById.get(t.toUserId) ?? 'Unknown',
        amount: centsToAmount(t.cents),
        currency,
    }));

    return {
        debts,
        transactionCount: debts.length,
        algorithm: useExact ? 'exact' : 'greedy',
    };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd cost-share-app/apps/mobile && npx jest __tests__/shared/simplifyDebts.test.ts`
Expected: PASS — all tests (greedy + exact + orchestrator).

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/packages/shared/src/calculations/simplifyDebts/index.ts \
        cost-share-app/apps/mobile/__tests__/shared/simplifyDebts.test.ts
git commit -m "feat(shared): add simplifyDebts orchestrator (exact/greedy dispatch)"
```

---

### Task 6: Wire the orchestrator into `calculations/index.ts` and remove the old implementation

**Files:**
- Modify: `cost-share-app/packages/shared/src/calculations/index.ts`

- [ ] **Step 1: Replace the existing `simplifyDebts` function with re-exports**

Open `cost-share-app/packages/shared/src/calculations/index.ts`.

Delete the existing `simplifyDebts` function (lines 77-107 in the current file).

At the **top** of the file, after the existing `import { DebtSummary, UserBalance } from '../types';` import, add:

```typescript
export {
    simplifyDebts,
    simplifyDebtsExact,
    simplifyDebtsGreedy,
    UnbalancedLedgerError,
} from './simplifyDebts';
```

Verify the resulting file still imports `DebtSummary` and `UserBalance` from `../types` (they're used by other functions in this file).

- [ ] **Step 2: Typecheck the whole monorepo**

Run: `cd cost-share-app && npx tsc -p packages/shared/tsconfig.json --noEmit && npx tsc -p apps/mobile/tsconfig.json --noEmit`
Expected: No errors.

- [ ] **Step 3: Run the shared unit tests to confirm the new entry point still resolves**

Run: `cd cost-share-app/apps/mobile && npx jest __tests__/shared/simplifyDebts.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/packages/shared/src/calculations/index.ts
git commit -m "refactor(shared): replace inline simplifyDebts with modular impl"
```

---

### Task 7: Update `getGroupDebts` to return `SimplifiedDebtsResult` and handle `UnbalancedLedgerError`

**Files:**
- Modify: `cost-share-app/apps/mobile/services/groups.service.ts`

- [ ] **Step 1: Update imports**

In `cost-share-app/apps/mobile/services/groups.service.ts`, change the imports at the top of the file:

Replace:
```typescript
import {
    Group,
    GroupMember,
    GroupWithMembers,
    UserBalance,
    DebtSummary,
    GroupSummary,
    CreateGroupDto,
    UpdateGroupDto,
    DEFAULT_CURRENCY,
} from '@cost-share/shared';
import {
    groupFromRow,
    groupWithMembersFromRow,
    groupMemberFromRow,
    calculateUserBalancesFromData,
    simplifyDebts,
} from '@cost-share/shared';
```

With:
```typescript
import {
    Group,
    GroupMember,
    GroupWithMembers,
    UserBalance,
    SimplifiedDebtsResult,
    GroupSummary,
    CreateGroupDto,
    UpdateGroupDto,
    DEFAULT_CURRENCY,
} from '@cost-share/shared';
import {
    groupFromRow,
    groupWithMembersFromRow,
    groupMemberFromRow,
    calculateUserBalancesFromData,
    simplifyDebts,
    UnbalancedLedgerError,
} from '@cost-share/shared';
```

(`DebtSummary` is no longer imported here — `SimplifiedDebtsResult` contains it.)

- [ ] **Step 2: Replace `getGroupDebts`**

In the same file, replace the existing `getGroupDebts` function (around lines 307-327) with:

```typescript
export async function getGroupDebts(groupId: string): Promise<SimplifiedDebtsResult> {
    const empty: SimplifiedDebtsResult = {
        debts: [],
        transactionCount: 0,
        algorithm: 'exact',
    };
    try {
        const balances = await getGroupBalances(groupId);
        const userIds = Array.from(new Set(balances.map(b => b.userId)));
        const nameById = new Map<string, string>();

        if (userIds.length > 0) {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, name')
                .in('id', userIds);
            if (error) throw error;
            (data ?? []).forEach(p => nameById.set(p.id as string, p.name as string));
        }

        return simplifyDebts(balances, nameById);
    } catch (error) {
        if (error instanceof UnbalancedLedgerError) {
            console.warn('Skipping debt simplification: unbalanced ledger', error.message);
            return empty;
        }
        console.error('Failed to fetch debts:', error);
        return empty;
    }
}
```

- [ ] **Step 3: Typecheck**

Run: `cd cost-share-app && npx tsc -p apps/mobile/tsconfig.json --noEmit`
Expected: Failure in `BalancesScreen.tsx` and `BalancesScreen.test.tsx` (they still expect `DebtSummary[]`). That's intentional — those are the next tasks. Confirm errors are limited to those two files.

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/apps/mobile/services/groups.service.ts
git commit -m "feat(mobile): getGroupDebts returns SimplifiedDebtsResult"
```

---

### Task 8: Add i18n keys (EN + HE) with pluralization

**Files:**
- Modify: `cost-share-app/apps/mobile/i18n/locales/en.json`
- Modify: `cost-share-app/apps/mobile/i18n/locales/he.json`

Note: i18next is configured with `compatibilityJSON: 'v4'` (CLDR plural rules). The English keys use `_one` / `_other`. Hebrew has multiple plural forms in CLDR (`one`, `two`, `many`, `other`); we provide `_one`, `_two`, `_many`, `_other` to cover them all.

- [ ] **Step 1: Add keys to `en.json`**

In `cost-share-app/apps/mobile/i18n/locales/en.json`, inside the `"balances": { ... }` block (starting around line 222), add the following three keys **alongside existing keys** (e.g. right after `"simplifiedDebts": "Simplified Debts",` on line 228):

```json
"paymentsToSettle_one": "1 payment to settle everyone",
"paymentsToSettle_other": "{{count}} payments to settle everyone",
"minimumBadge": "Minimum",
```

- [ ] **Step 2: Add keys to `he.json`**

In `cost-share-app/apps/mobile/i18n/locales/he.json`, inside the `"balances": { ... }` block (starting around line 222), add the same keys with Hebrew values, right after `"simplifiedDebts": "חובות מפושטים",`:

```json
"paymentsToSettle_one": "תשלום אחד לסגירת כל החובות",
"paymentsToSettle_two": "{{count}} תשלומים לסגירת כל החובות",
"paymentsToSettle_many": "{{count}} תשלומים לסגירת כל החובות",
"paymentsToSettle_other": "{{count}} תשלומים לסגירת כל החובות",
"minimumBadge": "מינימום",
```

- [ ] **Step 3: Verify both JSON files parse**

Run: `cd cost-share-app && node -e "JSON.parse(require('fs').readFileSync('apps/mobile/i18n/locales/en.json','utf8'));JSON.parse(require('fs').readFileSync('apps/mobile/i18n/locales/he.json','utf8'));console.log('OK')"`
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/apps/mobile/i18n/locales/en.json \
        cost-share-app/apps/mobile/i18n/locales/he.json
git commit -m "feat(mobile): add i18n keys for debt simplification summary"
```

---

### Task 9: Update `BalancesScreen` to render summary line + "Minimum" badge

**Files:**
- Modify: `cost-share-app/apps/mobile/screens/balances/BalancesScreen.tsx`

- [ ] **Step 1: Update the state type**

Open `cost-share-app/apps/mobile/screens/balances/BalancesScreen.tsx`.

Replace the imports of `DebtSummary` on line 12:

```typescript
import { UserBalance, DebtSummary } from '@cost-share/shared';
```

With:

```typescript
import { UserBalance, SimplifiedDebtsResult, DebtSummary } from '@cost-share/shared';
```

(`DebtSummary` is still needed for the `handleSettleUp` parameter type.)

- [ ] **Step 2: Replace the local `debts` state with the full result**

Locate the state declaration (line 29):

```typescript
const [debts, setDebts] = useState<DebtSummary[]>([]);
```

Replace with:

```typescript
const [debtsResult, setDebtsResult] = useState<SimplifiedDebtsResult>({
    debts: [],
    transactionCount: 0,
    algorithm: 'exact',
});
```

- [ ] **Step 3: Update `loadData` to consume the new shape**

Locate the `loadData` callback (lines 33-42). Replace:

```typescript
const loadData = useCallback(async () => {
    startLoading();
    const [balancesData, debtsData] = await Promise.all([
        getGroupBalances(groupId),
        getGroupDebts(groupId),
    ]);
    setBalances(balancesData);
    setDebts(debtsData);
    stopLoading();
}, [groupId, startLoading, stopLoading]);
```

With:

```typescript
const loadData = useCallback(async () => {
    startLoading();
    const [balancesData, debtsData] = await Promise.all([
        getGroupBalances(groupId),
        getGroupDebts(groupId),
    ]);
    setBalances(balancesData);
    setDebtsResult(debtsData);
    stopLoading();
}, [groupId, startLoading, stopLoading]);
```

- [ ] **Step 4: Replace the "Simplified Debts" section with the summary line + debt list**

Locate the simplified-debts `<View>` block (currently lines 115-157). Replace the **entire block** with:

```tsx
{/* Simplified Debts */}
<View className="px-4 mb-4">
    <Text className="text-lg font-semibold text-gray-900 mb-1">
        {t('balances.simplifiedDebts')}
    </Text>
    {debtsResult.debts.length > 0 && (
        <View
            testID="debts-summary"
            className="flex-row items-center mb-3"
            style={{ gap: 8 }}
        >
            <Text className="text-sm text-gray-500">
                {t('balances.paymentsToSettle', { count: debtsResult.transactionCount })}
            </Text>
            {debtsResult.algorithm === 'exact' && (
                <View
                    testID="minimum-badge"
                    className="bg-emerald-50 rounded-full px-2 py-0.5"
                >
                    <Text className="text-xs font-medium text-emerald-700">
                        {t('balances.minimumBadge')}
                    </Text>
                </View>
            )}
        </View>
    )}
    {debtsResult.debts.length > 0 ? (
        debtsResult.debts.map((debt, index) => (
            <View
                key={`${debt.fromUserId}-${debt.toUserId}-${index}`}
                className="bg-white rounded-xl p-4 mb-2"
            >
                <View className="flex-row items-center justify-between mb-3">
                    <View className="flex-1">
                        <Text className="text-sm text-gray-500">
                            {debt.fromUserName}
                        </Text>
                        <Text className="text-xs text-gray-400">
                            {t('balances.owes')} {debt.toUserName}
                        </Text>
                    </View>
                    <Text className="text-base font-bold text-red-500">
                        {debt.currency} {debt.amount.toFixed(2)}
                    </Text>
                </View>
                <Button
                    title={t('groups.settleUp')}
                    onPress={() => handleSettleUp(debt)}
                    variant="secondary"
                />
            </View>
        ))
    ) : (
        <View className="bg-green-50 rounded-xl p-6 items-center">
            <Text className="text-2xl mb-2">✅</Text>
            <Text className="text-base font-medium text-green-700">
                {t('balances.allSettled')}
            </Text>
            <Text className="text-sm text-green-600 mt-1">
                {t('balances.noDebts')}
            </Text>
        </View>
    )}
</View>
```

Note: the `gap: 8` is on a plain style prop because NativeWind's `gap-2` is supported but can be inconsistent across RN versions — inline style is safe. RTL: `flex-row` flips automatically under `I18nManager.isRTL`, so summary text + badge stay visually adjacent in Hebrew.

- [ ] **Step 5: Typecheck**

Run: `cd cost-share-app && npx tsc -p apps/mobile/tsconfig.json --noEmit`
Expected: Failure still in `BalancesScreen.test.tsx` (next task fixes it). All other errors should be gone.

- [ ] **Step 6: Commit**

```bash
git add cost-share-app/apps/mobile/screens/balances/BalancesScreen.tsx
git commit -m "feat(mobile): show debt simplification summary + Minimum badge"
```

---

### Task 10: Update `BalancesScreen` test mocks + add summary/badge assertions

**Files:**
- Modify: `cost-share-app/apps/mobile/__tests__/screens/balances/BalancesScreen.test.tsx`

- [ ] **Step 1: Update the existing test file**

Open `cost-share-app/apps/mobile/__tests__/screens/balances/BalancesScreen.test.tsx`.

Replace the **entire test file** with:

```typescript
import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithQuery } from '../../helpers/renderWithQuery';

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

jest.mock('../../../services/groups.service', () => ({
    getGroupBalances: jest.fn(),
    getGroupDebts: jest.fn(),
}));

jest.mock('../../../services/users.service', () => ({
    fetchGroupUsers: jest.fn().mockResolvedValue([]),
}));

import { BalancesScreen } from '../../../screens/balances/BalancesScreen';
import {
    getGroupBalances,
    getGroupDebts,
} from '../../../services/groups.service';

const mockBalances = getGroupBalances as jest.MockedFunction<typeof getGroupBalances>;
const mockDebts = getGroupDebts as jest.MockedFunction<typeof getGroupDebts>;

beforeEach(() => {
    mockNavigate.mockClear();
    mockBalances.mockReset();
    mockDebts.mockReset();
});

describe('BalancesScreen', () => {
    it('shows "all settled" message when there are no debts', async () => {
        mockBalances.mockResolvedValueOnce([]);
        mockDebts.mockResolvedValueOnce({
            debts: [],
            transactionCount: 0,
            algorithm: 'exact',
        });
        const { findByText, queryByTestId } = renderWithQuery(<BalancesScreen />);
        expect(await findByText('balances.allSettled')).toBeTruthy();
        // Summary line is hidden when there are no debts.
        expect(queryByTestId('debts-summary')).toBeNull();
    });

    it('renders debts with the simplified summary line and a Minimum badge for exact results', async () => {
        mockBalances.mockResolvedValueOnce([]);
        mockDebts.mockResolvedValueOnce({
            debts: [
                {
                    fromUserId: 'u1',
                    fromUserName: 'Alice',
                    toUserId: 'u2',
                    toUserName: 'Bob',
                    amount: 25,
                    currency: 'USD',
                },
            ],
            transactionCount: 1,
            algorithm: 'exact',
        });
        const { findByText, findByTestId } = renderWithQuery(<BalancesScreen />);
        expect(await findByText('Alice')).toBeTruthy();
        expect(await findByText(/USD 25\.00/)).toBeTruthy();
        // Summary text is the i18n key — t() returns the key in tests.
        const summary = await findByTestId('debts-summary');
        expect(summary).toBeTruthy();
        expect(await findByTestId('minimum-badge')).toBeTruthy();
    });

    it('hides the Minimum badge for greedy results but keeps the summary', async () => {
        mockBalances.mockResolvedValueOnce([]);
        mockDebts.mockResolvedValueOnce({
            debts: [
                {
                    fromUserId: 'u1',
                    fromUserName: 'Alice',
                    toUserId: 'u2',
                    toUserName: 'Bob',
                    amount: 10,
                    currency: 'USD',
                },
                {
                    fromUserId: 'u3',
                    fromUserName: 'Carol',
                    toUserId: 'u2',
                    toUserName: 'Bob',
                    amount: 5,
                    currency: 'USD',
                },
            ],
            transactionCount: 2,
            algorithm: 'greedy',
        });
        const { findByTestId, queryByTestId } = renderWithQuery(<BalancesScreen />);
        expect(await findByTestId('debts-summary')).toBeTruthy();
        expect(queryByTestId('minimum-badge')).toBeNull();
    });

    it('navigates to SettlementHistory when the history button is pressed', async () => {
        mockBalances.mockResolvedValueOnce([]);
        mockDebts.mockResolvedValueOnce({
            debts: [],
            transactionCount: 0,
            algorithm: 'exact',
        });
        const { findByText } = renderWithQuery(<BalancesScreen />);
        fireEvent.press(await findByText('balances.settlementHistory'));
        expect(mockNavigate).toHaveBeenCalledWith('SettlementHistory', {
            groupId: 'g1',
        });
    });
});
```

- [ ] **Step 2: Run the screen tests**

Run: `cd cost-share-app/apps/mobile && npx jest __tests__/screens/balances/BalancesScreen.test.tsx`
Expected: PASS — 4 tests.

- [ ] **Step 3: Run typecheck**

Run: `cd cost-share-app && npx tsc -p apps/mobile/tsconfig.json --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/apps/mobile/__tests__/screens/balances/BalancesScreen.test.tsx
git commit -m "test(mobile): cover debt simplification summary + Minimum badge"
```

---

### Task 11: Final verification (full test run + typecheck + perf sanity)

- [ ] **Step 1: Full mobile typecheck**

Run: `cd cost-share-app && npx tsc -p apps/mobile/tsconfig.json --noEmit`
Expected: No errors.

- [ ] **Step 2: Full shared typecheck**

Run: `cd cost-share-app && npx tsc -p packages/shared/tsconfig.json --noEmit`
Expected: No errors.

- [ ] **Step 3: Run the entire mobile test suite**

Run: `cd cost-share-app/apps/mobile && npx jest`
Expected: All previously-passing tests still pass; new `simplifyDebts.test.ts` + updated `BalancesScreen.test.tsx` pass. No new failures.

- [ ] **Step 4: Perf sanity check — run the 10-balance exact case 100×**

Add a quick one-off measurement to confirm exact-mode latency is well under the spec budget. From repo root:

```bash
cd cost-share-app && node -e "
const { simplifyDebts } = require('./packages/shared/dist/calculations');
" 2>/dev/null || \
cd cost-share-app && npx tsx -e "
import { simplifyDebts } from './packages/shared/src/calculations';
const balances = [
  { groupId:'g',userId:'d1',currency:'USD',totalPaid:0,totalOwed:0,totalSettledPaid:0,totalSettledReceived:0,netBalance:-10 },
  { groupId:'g',userId:'d2',currency:'USD',totalPaid:0,totalOwed:0,totalSettledPaid:0,totalSettledReceived:0,netBalance:-15 },
  { groupId:'g',userId:'d3',currency:'USD',totalPaid:0,totalOwed:0,totalSettledPaid:0,totalSettledReceived:0,netBalance:-20 },
  { groupId:'g',userId:'d4',currency:'USD',totalPaid:0,totalOwed:0,totalSettledPaid:0,totalSettledReceived:0,netBalance:-25 },
  { groupId:'g',userId:'d5',currency:'USD',totalPaid:0,totalOwed:0,totalSettledPaid:0,totalSettledReceived:0,netBalance:-30 },
  { groupId:'g',userId:'c1',currency:'USD',totalPaid:0,totalOwed:0,totalSettledPaid:0,totalSettledReceived:0,netBalance:5 },
  { groupId:'g',userId:'c2',currency:'USD',totalPaid:0,totalOwed:0,totalSettledPaid:0,totalSettledReceived:0,netBalance:15 },
  { groupId:'g',userId:'c3',currency:'USD',totalPaid:0,totalOwed:0,totalSettledPaid:0,totalSettledReceived:0,netBalance:20 },
  { groupId:'g',userId:'c4',currency:'USD',totalPaid:0,totalOwed:0,totalSettledPaid:0,totalSettledReceived:0,netBalance:25 },
  { groupId:'g',userId:'c5',currency:'USD',totalPaid:0,totalOwed:0,totalSettledPaid:0,totalSettledReceived:0,netBalance:35 },
];
const t0 = Date.now();
let last;
for (let i = 0; i < 100; i++) last = simplifyDebts(balances, new Map());
console.log('100 runs:', Date.now() - t0, 'ms; result:', last.algorithm, last.transactionCount);
"
```

Expected: `100 runs: <100 ms; result: exact <some_count>`. If you don't have `tsx` available locally, skip this step — the `simplifyDebtsExact` unit test already enforces `<500 ms` for the 10-balance case on CI.

- [ ] **Step 5: Manual sanity check on device/simulator (UI only)**

If the Expo dev server is running, open the Balances screen for a group with debts and visually confirm:
- The summary line "N payments to settle everyone" appears below the section title.
- The "Minimum" badge appears in green for exact results.
- In Hebrew (Settings → language → עברית), the line reads "N תשלומים לסגירת כל החובות" with the badge labelled "מינימום", and the layout remains visually correct under RTL.

If no device is available, skip — automated tests cover the rendering.

- [ ] **Step 6: Final commit (if any small fixes were needed)**

If no further changes, this task closes without a commit.

---

## Acceptance Criteria (from spec)

1. ✅ For groups with ≤10 non-zero balances, `simplifyDebts` returns the minimum possible transaction count — Task 4 unit tests assert this on the classic counterexample.
2. ✅ For groups with >10 non-zero balances, greedy sorted matching is used — Task 5 orchestrator test asserts `algorithm: 'greedy'` on a 12-balance fixture.
3. ✅ All returned debts zero out member balances — `assertBalancesZeroed` helper in Tasks 3–4.
4. ✅ `BalancesScreen` shows payment count summary + Minimum badge for exact results only — Task 10 tests cover both cases plus the "no debts" case.
5. ✅ i18n keys exist in EN + HE with RTL-safe layout — Task 8 adds keys; Task 9 uses `flex-row` which flips under `I18nManager.isRTL`.
6. ✅ No regression in Settle Up navigation or settlement creation — Task 10 keeps the existing navigation test; debt cards keep their existing structure and `handleSettleUp` is unchanged.
7. ✅ Unit tests cover exact, greedy, edge cases, and error path — Tasks 3–5 cover greedy, exact, orchestrator + `UnbalancedLedgerError`.
