# Debt Simplification Algorithm — Design Spec

**Date:** 2026-05-20  
**Status:** Implemented (a291695…091603f on `dev`)  
**Plan:** [`docs/superpowers/plans/2026-05-20-debt-simplification.md`](../plans/2026-05-20-debt-simplification.md)  
**Mapped SRS:** REQ-BAL-02, REQ-BAL-03, REQ-NFR-01, REQ-NFR-03

---

## 1. Overview

Replace the current greedy debt simplification (`simplifyDebts`) with a **hybrid algorithm** that guarantees the minimum number of transactions for small groups and falls back to a Splitwise-style heuristic for larger groups. Add a small UI summary on the Balances screen showing how many payments are needed to settle everyone.

**Scope:** Per-group debt simplification only. No cross-group simplification. No Supabase schema or RPC changes.

**Architecture approach:** Pure functions in `packages/shared/src/calculations/`; mobile `groups.service.ts` orchestrates data loading; `BalancesScreen` displays result + summary line.

---

## 2. User Decisions (confirmed)

| Topic | Decision |
|-------|----------|
| Primary goal | Minimize number of transactions (Splitwise-style) |
| ≤10 non-zero balances | Exact algorithm — minimum transactions guaranteed |
| >10 non-zero balances | Greedy sorted matching (Splitwise heuristic) |
| UI | Transparent improvement + summary line; "Minimum" badge when exact |
| Cross-group | Out of scope |
| Server-side RPC | Out of scope (keep client-side pure math) |

---

## 3. Problem Statement

### 3.1 Current behavior

`simplifyDebts` in `packages/shared/src/calculations/index.ts`:

- Iterates debtors in array order (not sorted by magnitude).
- Greedy matching without transaction-count optimization.
- Can produce **more transfers than necessary**.

### 3.2 Desired behavior

Given net balances per group member (sum = 0):

1. Produce a list of pairwise debts `{ from, to, amount }` that zero all balances.
2. Use the **fewest possible transactions**.
3. For groups with ≤10 members who have non-zero balance, the count must be **provably minimal**.
4. For larger groups, use a fast heuristic that matches Splitwise behavior.

**Theoretical bound:** For `k` non-zero members, at most `k − 1` transactions always suffice.

---

## 4. Algorithm Design

### 4.1 Pipeline

```
Input:  UserBalance[] (netBalance per member, same currency)
        ↓
Filter: members where |netBalance| > 0.01  →  k members
        ↓
k === 0  →  { debts: [], transactionCount: 0, algorithm: 'exact' }
k ≤ 10   →  simplifyDebtsExact()
k > 10   →  simplifyDebtsGreedy()
        ↓
Output: SimplifiedDebtsResult
```

**Threshold note:** Count **non-zero balance members**, not total group size. A 15-person group with only 4 non-zero balances uses the exact algorithm.

### 4.2 Exact algorithm (`simplifyDebtsExact`)

**Method:** Backtracking with memoization.

1. Convert all balances to **integer cents** (`Math.round(balance * 100)`) to avoid floating-point drift and enable memoization.
2. Normalize state key: sort `{ userId, cents }` pairs by `userId`, serialize to string.
3. Recursive search:
   - Base case: all balances zero → return `[]`.
   - Pick the first member with negative balance (debtor).
   - For each member with positive balance (creditor):
     - `amount = min(|debtor.cents|, creditor.cents)`
     - Apply transfer; recurse on updated balances.
     - Candidate = `[transfer, ...subResult]`.
   - Keep candidate with **minimum length** (fewest transactions).
4. **Tie-breaker** (same transaction count): prefer the candidate whose first transfer has the **largest amount** (Splitwise-like UX consistency).
5. Memoize `(stateKey) → best result length` to prune branches that cannot beat the current best.

**Performance (k ≤ 10):** Expected < 1 ms on mobile. Called once per Balances screen load — negligible vs Supabase fetch (~100–500 ms).

### 4.3 Greedy algorithm (`simplifyDebtsGreedy`)

Splitwise-style matching for k > 10:

1. Maintain separate lists of debtors (negative) and creditors (positive).
2. Sort both by **absolute balance descending**.
3. Match largest debtor with largest creditor:
   - `amount = min(|debtor|, creditor)`
   - Record transfer; reduce both balances.
4. Repeat until all balances are zero.

**Complexity:** O(k log k). Suitable for groups of any practical size.

### 4.4 Edge cases

| Case | Expected output |
|------|-----------------|
| All balances zero (within ±0.01) | `debts: []`, `transactionCount: 0` |
| 2 members, A owes B $50 | 1 debt: A → B $50 |
| Decimal amounts (e.g. $33.33 split 3 ways) | Correct cents handling; output rounded to 2 decimal places |
| Balances sum ≠ 0 (corrupt data) | Throw `UnbalancedLedgerError` from shared calculations |
| Single non-zero member | Throw `UnbalancedLedgerError` (invalid state) |

### 4.5 Correctness invariant

After applying all debts in the result, every member's net balance must be zero (within ±0.01 tolerance). Unit tests must assert this for all fixtures.

---

## 5. Types & API

### 5.1 New type

```typescript
// packages/shared/src/types/index.ts

export interface SimplifiedDebtsResult {
  debts: DebtSummary[];
  transactionCount: number;
  algorithm: 'exact' | 'greedy';
}
```

`DebtSummary` remains unchanged:

```typescript
export interface DebtSummary {
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  amount: number;
  currency: string;
}
```

### 5.2 Updated functions

| Function | Change |
|----------|--------|
| `simplifyDebtsExact(balances, nameById)` | **New** — returns `DebtSummary[]` |
| `simplifyDebtsGreedy(balances, nameById)` | **New** — returns `DebtSummary[]` |
| `simplifyDebts(balances, nameById)` | **Updated** — returns `SimplifiedDebtsResult`; selects exact vs greedy |
| `getGroupDebts(groupId)` | **Updated** — returns `SimplifiedDebtsResult` |

### 5.3 Domain error

```typescript
// packages/shared/src/calculations/errors.ts (or inline in index.ts)

export class UnbalancedLedgerError extends Error {
  constructor(message = 'Net balances do not sum to zero') {
    super(message);
    this.name = 'UnbalancedLedgerError';
  }
}
```

`groups.service.ts` catches `UnbalancedLedgerError`, logs, returns `{ debts: [], transactionCount: 0, algorithm: 'exact' }` to avoid crashing the UI on corrupt data.

---

## 6. UI — BalancesScreen

### 6.1 Summary line

Below the "Simplified Debts" section title, when `debts.length > 0`:

```
Simplified Debts
3 payments to settle everyone   [Minimum]
────────────────────────────────────────
Alice owes Bob                  USD 25.00
...
```

| Condition | Summary line | Badge |
|-----------|--------------|-------|
| `debts.length > 0` && `algorithm === 'exact'` | Show count | Show "Minimum" badge |
| `debts.length > 0` && `algorithm === 'greedy'` | Show count | No badge |
| `debts.length === 0` | Hidden (existing "All settled" state) | — |

### 6.2 i18n keys (EN + HE)

| Key | EN | HE |
|-----|----|----|
| `balances.paymentsToSettle` | `{{count}} payments to settle everyone` | `{{count}} תשלומים לסגירת כל החובות` |
| `balances.paymentsToSettle_one` | `1 payment to settle everyone` | `תשלום אחד לסגירת כל החובות` |
| `balances.minimumBadge` | `Minimum` | `מינימום` |

Use i18next pluralization for count = 1.

### 6.3 Visual tokens

- Summary text: `text-sm text-gray-500`
- Badge: `text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full`
- Layout: summary row in a horizontal `flex-row items-center gap-2` below section title

No other UI changes. Debt cards and Settle Up flow remain unchanged.

---

## 7. File Changes

| File | Action |
|------|--------|
| `packages/shared/src/calculations/index.ts` | Add exact + greedy; update orchestrator |
| `packages/shared/src/calculations/__tests__/simplifyDebts.test.ts` | **New** — unit tests |
| `packages/shared/src/types/index.ts` | Add `SimplifiedDebtsResult` |
| `packages/shared/src/index.ts` | Export new type if not re-exported |
| `apps/mobile/services/groups.service.ts` | Update `getGroupDebts` return type |
| `apps/mobile/screens/balances/BalancesScreen.tsx` | Summary line + badge |
| `apps/mobile/i18n/locales/en.json` | New keys |
| `apps/mobile/i18n/locales/he.json` | New keys |
| `apps/mobile/__tests__/screens/balances/BalancesScreen.test.tsx` | Summary line + badge tests |

**No changes:** Supabase schema, `SettleUpScreen`, dashboard RPC, web app.

---

## 8. Testing Plan

### 8.1 Unit tests (`simplifyDebts.test.ts`)

| # | Scenario | Assert |
|---|----------|--------|
| 1 | All zero balances | `debts: []`, count 0 |
| 2 | 2 people: A −50, B +50 | 1 debt, exact, A→B 50 |
| 3 | 3 people chain (classic Splitwise counterexample for naive greedy) | Exact produces ≤ naive greedy count |
| 4 | 4+ people random balances | Result zeros all balances; count ≤ k−1 |
| 5 | 10 non-zero members | Exact algorithm selected; count is minimal (compare brute-force for small fixture) |
| 6 | 11 non-zero members | Greedy algorithm selected |
| 7 | Decimal amounts ($10.01, $3.33, etc.) | No cent drift; sum of debts equals total owed |
| 8 | Unbalanced ledger (sum ≠ 0) | Throws `UnbalancedLedgerError` |
| 9 | Tie-breaker | When two exact solutions exist with same count, larger first transfer wins |

**Helper:** `assertBalancesZeroed(balances, debts)` — apply debts to balances, assert all ≈ 0.

### 8.2 Screen tests (`BalancesScreen.test.tsx`)

| # | Scenario | Assert |
|---|----------|--------|
| 1 | Debts with `algorithm: 'exact'`, count 3 | Summary text visible + "Minimum" badge |
| 2 | Debts with `algorithm: 'greedy'`, count 2 | Summary text visible, no badge |
| 3 | No debts | Existing "All settled" unchanged |

---

## 9. Example

**Input balances (4 members):**

| Member | netBalance |
|--------|------------|
| Alice | −30 |
| Bob | +10 |
| Carol | +10 |
| Dave | +10 |

**Naive unordered greedy:** may produce 3 transfers (still optimal here).

**Counterexample (5 members) where sorting matters:**

| Member | netBalance |
|--------|------------|
| A | −50 |
| B | +20 |
| C | +15 |
| D | +10 |
| E | +5 |

- Optimal: **4 transactions** (k−1).
- Bad ordering can produce 5+.

Exact algorithm always returns 4 for this input.

---

## 10. Out of Scope

- Cross-group debt simplification (profile dashboard friends)
- Moving calculation to Supabase RPC
- Minimizing total **amount transferred** (only transaction **count**)
- Multi-currency groups (existing: one currency per group)
- Changing balance formula or settlement recording

---

## 11. Acceptance Criteria

1. For groups with ≤10 non-zero balances, `simplifyDebts` returns the **minimum possible** transaction count (verified by unit tests including known counterexamples).
2. For groups with >10 non-zero balances, greedy sorted matching is used and labeled `algorithm: 'greedy'`.
3. All returned debts zero out member balances (±0.01).
4. `BalancesScreen` shows payment count summary; "Minimum" badge appears only for exact results.
5. i18n keys exist in EN and HE with RTL-safe layout.
6. No regression in Settle Up navigation or settlement creation.
7. Unit tests cover exact, greedy, edge cases, and error path.

---

## 12. Changelog

| Date | Change |
|------|--------|
| 2026-05-20 | Initial spec (brainstorming approved) |
| 2026-05-20 | Implemented on `dev` (commits a291695…091603f). 23 new tests (19 shared unit + 4 screen). Exact algorithm measured ~6 ms for k=10 (budget 500 ms). |
