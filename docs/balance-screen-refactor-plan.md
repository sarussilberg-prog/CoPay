# Balance Screen — Refactor Plan

Status: planning · Owner: Avi · Last updated: 2026-05-21

**Decisions locked in (§10 resolved):**
- All group members are listed; members with no activity in the selected mode show a "No activity" line.
- Drill-in shows **gross** amounts (raw "X paid for Y" from the expense ledger, no settlement offsets) — the simplified-debts section is where net resolution lives.
- "Settle debt" button opens `SettleUpSheet` directly as a modal with `{from, to, currency, amount}` pre-filled.
- Second toggle label is **"Spent on"** (e.g., "Spent on Alice: $95 USD"). Avoids overloading "owed" with debt language.
- Toggle does **not** persist; default is **Paid** every entry.
- Drill-in is a **centered modal dialog**, not a pushed screen. Roughly 3/5 of screen height, centered, with backdrop dismiss.

The current `BalancesScreen` is being rebuilt. This document plans the new screen from scratch based on the product description below.

---

## 1. Product description (in user's words)

> The user presses the Balance button. He will have a toggle at the top which indicates if the view is from the **paid** point of view or from the **lent/owed** point of view.
>
> A list of all users in the group will appear with info like "member paid X amount of dollars, Y amount of ILS, etc."
>
> When pressing on a row in the list, the user will see a list of money the user lent and to whom.
>
> If the toggle is on the **owed** view point, the user will see a list of users in the group that had expenses on them — "user A had X money paid on him." When pressing it we would see the details of who paid on him and how much.
>
> At the bottom of the screen I want to see the **simplified debts** — a list of simplified debts between the users based on our simplify algorithm. So if A owes B 10 and B owes C 10, then A owes C 10 directly. That's the gist of it.
>
> Each of these rows will have a little **"Settle debt"** button which will take you to the settle-debt screen with the relevant details.

---

## 2. Current state (what exists today)

- `apps/mobile/screens/balances/BalancesScreen.tsx` shows a flat list of per-user net balances (`BalanceCard`) + a "Simplified Debts" section with inline Settle Up buttons that all navigate to `SettleUpListScreen`.
- Data path: `getGroupBalances(groupId)` → `loadBalanceData` (groups.service.ts:31) → `calculateUserBalancesFromData` (shared/calculations/index.ts:59) → `UserBalance[]` (single currency, flattens to `group.default_currency`).
- `getGroupDebts` runs `simplifyDebts(balances, nameById)` on those single-currency balances (shared/calculations/simplifyDebts).
- Per-currency pairwise debts already exist for Settle Up (`fetchGroupPairwiseDebts` → `PairwiseDebt[]` in `useSettlementQueries.ts`).
- DB shape: `expenses.currency` (per-row), `expense_splits` inherits expense currency (no own column), `settlements.currency` (per-row). Multi-currency data IS in the DB; the current balance pipeline collapses it to a single currency, which is a known limitation we need to fix as part of this refactor.

---

## 3. Goals & non-goals

**In scope**
- A redesigned `BalancesScreen` with the toggle + member list + simplified debts described in §1.
- Per-currency totals everywhere on this screen (USD / ILS / etc.) — the screen never silently collapses currencies.
- Drill-in detail view per member, in both Paid and Owed modes.
- Bottom section: simplified debts, per currency, each row with a "Settle debt" button that opens the settle flow pre-filled.
- Multi-currency-aware data layer: new aggregation that preserves expense currency.
- Tests for new screens / hooks / aggregation.
- i18n for all new strings.

**Out of scope**
- Changes to the Settle Up form itself (`SettleUpSheet`). We reuse it as-is, pre-filled.
- Changes to `SettlementHistoryScreen`.
- FX conversion between currencies on this screen (we display each currency as a separate line, like the existing `BalanceSummaryHeader` pattern).
- Notifications, friend-level balances, cross-group views.
- Changing the `simplifyDebts` algorithm itself — we only call it once per currency.

---

## 4. UX flow

### 4.1 Entry
User taps **Balance** on Group Detail → `BalancesScreen` opens with `groupId` route param.

### 4.2 Top — Mode toggle
A segmented control at the top of the screen with two segments:
- **Paid** — what each member has paid into the group.
- **Spent on** — what has been paid on each member's behalf.

Default selection: **Paid**, every time the screen opens (no persistence). Switching is instant — same data, different projection.

### 4.3 Middle — Per-member list

Each row represents one group member. **All group members are listed** regardless of activity — the list is the group roster. The row body depends on the toggle:

- **Paid mode** — "<Member name> paid: `$120.00 USD`, `₪450 ILS`" (one line per non-zero currency, or a compact pill-list if it fits).
- **Spent on mode** — "Spent on <Member name>: `$95.00 USD`, `₪300 ILS`".

If the member has zero activity in the selected mode, the row shows a muted line: `t('balances.noActivityInMode')` — e.g., "No activity".

Rows are sorted: current user first (labeled "You"), then the rest alphabetically.

Tapping a row → opens the drill-in **dialog** (§4.4).

### 4.4 Drill-in dialog — per-member breakdown
Tapping a member row opens a **centered modal dialog** (`MemberContributionDialog`) — *not* a pushed screen. The dialog:

- Covers roughly **3/5 of the screen height**, centered vertically and horizontally.
- Has a dimmed backdrop; tap-outside or hardware-back dismisses.
- Implemented with React Native's `Modal` (`transparent` + `animationType="fade"`) — same modal primitive used elsewhere in this app. *(Implementation note: confirm against the app's current modal conventions — if there's an existing dialog wrapper component, reuse it; otherwise wire a thin one in `components/balances/MemberContributionDialog.tsx`.)*
- Content scrolls vertically inside the dialog when the breakdown is taller than the available area.
- Header inside the dialog: member avatar + name + the same per-currency totals shown on the list row, then the breakdown sections, then a Close button at the bottom.

Amounts are **gross** — the raw "X paid for Y" matrix from expenses + splits, with **no** offsetting from the reverse direction or from settlements. Net resolution lives only in the simplified-debts section. (This is why the simplified-debts section exists at all — it does the net math; the dialog answers a different question: "how much did this person actually front for each other member".)

- **Paid mode dialog**: "<Member> paid for these people:"
  - One section per counterparty: "Paid for <Other member>"
  - Inside each section, one line per currency: `$40.00 USD`, `₪150 ILS`.
  - Counterparties with zero gross activity show a muted "No activity" line.

- **Spent on mode dialog**: "Spent on <Member>:"
  - One section per counterparty: "<Other member> paid for <Member>"
  - One line per currency.
  - Counterparties with zero gross activity show a muted "No activity" line.

### 4.5 Bottom — Simplified debts
Below the list (in the same scroll view, not a separate screen):

- Section title: "Simplified debts" + the existing "Minimum" badge when applicable.
- One row per simplified debt, **grouped by currency**. Each currency runs `simplifyDebts` independently — there is no cross-currency simplification.
- Row content: `<Payer> → <Receiver>` with avatars, amount + currency, **"Settle debt"** button.
- Empty state: green "All settled ✅" card (same as today) when every currency simplifies to zero debts.

### 4.6 Settle debt button
Tapping "Settle debt" on a simplified-debt row opens `SettleUpSheet` directly as a modal — pre-filled with `{fromUserId, toUserId, amount, currency}` from that row. We do NOT route through `SettleUpListScreen`. The sheet's existing partial-payment / overpayment warnings and submit flow are reused as-is.

---

## 5. Data layer changes

### 5.1 New aggregation (shared)
Add to `packages/shared/src/calculations/`:

```ts
export type CurrencyAmount = { currency: string; amount: number };

export type PaidByMatrixRow = {
  payerId: string;
  consumerId: string;
  currency: string;
  amount: number; // gross amount payer covered for consumer in this currency
};

export type MemberContributionTotals = {
  userId: string;
  paid: CurrencyAmount[];    // sum of expenses where userId is paid_by
  owed: CurrencyAmount[];    // sum of expense_splits where userId is the consumer
};

export function calculateMemberContributions(args: {
  userIds: string[];
  expenses: Array<{ id: string; paidBy: string; amount: number; currency: string }>;
  splits: Array<{ expenseId: string; userId: string; amount: number }>;
}): {
  totals: MemberContributionTotals[];
  matrix: PaidByMatrixRow[]; // groupBy(payer, consumer, currency)
};
```

Pure function, integer-cents internally for safe summing, returns rows sorted/deduped. Settlements are **not** an input here — settlements only affect the simplified-debt section at the bottom.

### 5.2 New per-currency balance calc (shared)
Currently `calculateUserBalancesFromData` returns a single-currency `UserBalance`. Add:

```ts
export type UserBalanceByCurrency = {
  groupId: string;
  userId: string;
  byCurrency: Array<{
    currency: string;
    totalPaid: number;
    totalOwed: number;
    totalSettledPaid: number;
    totalSettledReceived: number;
    netBalance: number;
  }>;
};

export function calculateUserBalancesByCurrencyFromData(args: {
  groupId: string;
  userIds: string[];
  expenses: Array<{ id: string; paidBy: string; amount: number; currency: string }>;
  splits: Array<{ expenseId: string; userId: string; amount: number }>;
  settlements: Array<{ fromUserId: string; toUserId: string; amount: number; currency: string }>;
}): UserBalanceByCurrency[];
```

This is what `simplifyDebts` will run on — once per currency. The existing single-currency `calculateUserBalancesFromData` stays untouched for now (used by other screens) and we deprecate it incrementally in a follow-up.

### 5.3 New service entry (mobile)
`apps/mobile/services/groups.service.ts`:

- Update `loadBalanceData` to keep `expense.currency` and `settlement.currency` on each row instead of discarding them.
- Add `getGroupContributions(groupId)` → `{ totals, matrix }` using `calculateMemberContributions`.
- Add `getGroupBalancesByCurrency(groupId)` → `UserBalanceByCurrency[]`.
- Add `getGroupSimplifiedDebtsByCurrency(groupId)` → `Array<{ currency: string; result: SimplifiedDebtsResult }>` — runs `simplifyDebts` per currency.

### 5.4 React Query hooks
`apps/mobile/hooks/queries/useGroupBalancesQueries.ts` (new file):

- `useGroupContributionsQuery(groupId)` — returns `{ totals, matrix }`. Cache key: `['group-contributions', groupId]`.
- `useGroupSimplifiedDebtsByCurrencyQuery(groupId)` — runs the per-currency simplification. Cache key: `['group-simplified-debts-by-currency', groupId]`.
- Both invalidate on the same triggers as today's balance queries (expense create/update/delete, settlement create/update/delete, group membership change). Reuse the existing invalidation patterns from `useSettlementQueries.ts`.

---

## 6. Component architecture

```
screens/balances/
  BalancesScreen.tsx                  (rewritten)

components/balances/
  BalanceModeToggle.tsx               (new — segmented control)
  MemberContributionRow.tsx           (new — list row for Paid/Spent on mode)
  CurrencyAmountList.tsx              (new — compact per-currency pill list, reused on row + dialog)
  SimplifiedDebtsSection.tsx          (new — bottom section: per-currency simplified debts + settle button)
  SimplifiedDebtRow.tsx               (new — one row in the section above)
  MemberContributionDialog.tsx       (new — centered modal dialog, 3/5 height)
  MemberContributionBreakdown.tsx     (new — content rendered inside the dialog)
```

Notes:
- `BalanceModeToggle` lives in a new `components/balances/` folder to keep this feature's surface area clean — small parallel to `components/dashboard/`.
- `CurrencyAmountList` is the shared per-currency display primitive (avoids duplicating "$120 USD · ₪450 ILS" rendering logic). Handles RTL.
- The existing `BalanceCard` is *not* reused on this screen (it shows net balance, which isn't the new model). Keep `BalanceCard` for other consumers (dashboard).
- The dialog renders the breakdown for *whichever* member was tapped — `BalancesScreen` holds `selectedMemberId | null` local state and the toggle's current `mode`, both passed to `MemberContributionDialog` as props (`open`, `member`, `mode`, `onClose`). No new navigation entry.

---

## 7. Navigation

No new screens. The drill-in is an in-screen modal, not a route. `AppNavigator.tsx` is unchanged for this refactor — the existing `Balances` screen entry stays as-is.

- `MemberContributionDialog` is rendered inside `BalancesScreen` and controlled by local state (`selectedMemberId`, `mode`).
- `SettleUpSheet` is opened the same way (rendered inside `BalancesScreen` or another modal owner) with `{from, to, currency, amount}` pre-filled from the tapped simplified-debt row.

---

## 8. i18n

Add keys to `apps/mobile/i18n/locales/en.json` and `he.json` (and any others present):

```
balances.modeToggle.paid               "Paid"
balances.modeToggle.spentOn            "Spent on"
balances.paidMode.row                  "{{name}} paid"
balances.spentOnMode.row               "Spent on {{name}}"
balances.noActivityInMode              "No activity"
balances.memberContributionTitle       "Breakdown"
balances.paidMode.detailSection        "Paid for {{name}}"
balances.spentOnMode.detailSection     "{{name}} paid for {{owner}}"
balances.simplifiedDebts.settleButton  "Settle debt"
```

Reuse existing `balances.allSettled`, `balances.noDebts`, `balances.minimumBadge`, `groups.settleUp` where possible.

---

## 9. Tests

Mirror current coverage. New / updated tests:

- `__tests__/calculations/calculateMemberContributions.test.ts` — pure-function tests for the matrix + totals: empty group, single-currency, multi-currency, payer-is-also-consumer, members with zero activity.
- `__tests__/calculations/calculateUserBalancesByCurrency.test.ts` — per-currency net balance correctness.
- `__tests__/screens/balances/BalancesScreen.test.tsx` — rewrite covering: toggle switches mode (Paid ↔ Spent on), default is Paid, list shows per-currency amounts, zero-activity members render with "No activity" line, tapping a row opens `MemberContributionDialog`, simplified-debts section renders per currency, "Settle debt" opens `SettleUpSheet` modal pre-filled, "all settled" empty state.
- `__tests__/components/balances/MemberContributionDialog.test.tsx` — dialog open/close, backdrop dismiss, Paid and Spent on mode breakdowns, multi-currency sections, gross amounts (not net), counterparty with no activity shows "No activity".
- `__tests__/components/balances/CurrencyAmountList.test.tsx` — RTL, empty list, single-currency, multi-currency.

---

## 10. Resolved decisions

- **a. Empty members:** show all members; rows with no activity in the selected mode render a muted "No activity" line.
- **b. Drill-in:** **gross** amounts only — raw "X paid for Y" from expenses + splits, no settlement offsets, no reverse-direction offsets. The simplified-debts section is the dedicated place for net math.
- **c. Settle debt target:** opens `SettleUpSheet` directly as a modal with `{from, to, currency, amount}` pre-filled.
- **d. Second toggle label:** **"Spent on"**.
- **e. Mode persistence:** none. Defaults to **Paid** on every screen entry.
- **f. Existing screen consumers:** route name `Balances` stays the same so deep links / call sites keep working. Audit `BalancesScreen.test.tsx`, dashboard surfaces, and any place navigating to the route during implementation.

---

## 11. Implementation phases

Order is dependency-driven. Each phase ends green (typecheck + tests pass).

1. **Shared calculations** — add `calculateMemberContributions` + `calculateUserBalancesByCurrencyFromData` + tests. No screen changes yet.
2. **Service + query layer** — update `loadBalanceData` to preserve currencies, add the new service functions and React Query hooks, plus cache-invalidation wiring. No UI yet.
3. **Components** — build `BalanceModeToggle`, `CurrencyAmountList`, `MemberContributionRow`, `SimplifiedDebtsSection`, `SimplifiedDebtRow` in isolation with tests.
4. **Screens** — rewrite `BalancesScreen` using new components + hooks; wire the `MemberContributionDialog` inside the screen via local state. No navigator changes.
5. **i18n** — add EN + HE strings; sweep for any hardcoded copy.
6. **Tests** — rewrite `BalancesScreen.test.tsx`, add `MemberContributionScreen.test.tsx`, verify existing `SettleUpListScreen` / settlement flow tests still pass.
7. **Cleanup** — remove now-unused exports if any (e.g., `getGroupDebts` if no other consumer remains — audit before deleting).

---

## 12. Risks

- `loadBalanceData` is currency-lossy today. Other features (dashboard, group cards) may rely on the single-currency `UserBalance`. Solution: keep the old function intact, add new ones alongside, migrate consumers incrementally.
- Multi-currency `simplifyDebts` per currency means N independent ledgers must each balance to zero. If the DB has stale / partial settlements that imbalance a single-currency ledger, the `UnbalancedLedgerError` path already in place will skip simplification for that currency — confirm the new code handles per-currency errors gracefully (skip that currency, render the others).
- The "Settle debt" pre-fill uses simplified-debt amounts. After simplification, the payer→receiver pair in the row may not correspond to any *direct* expense/settlement history — that's fine, the existing settle form accepts arbitrary {from, to, currency, amount}, but the user-visible delta after settling will only fully resolve if the payment matches the simplified amount.
