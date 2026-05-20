# Settle Up — v1 Plan

Status: planning · Owner: Avi · Last updated: 2026-05-20

The current `SettleUpScreen` is being thrown away. This document plans Settle Up from scratch based on the product description below.

---

## 1. Product description (in user's words)

> The user presses the Settle Up button and sees a list of people who owe money to other people in the group. If the current user is part of any of those debts, those rows appear at the top and say "you" instead of the user's name.
>
> The user picks the debt row they want to settle, opens a form, and records a settlement. The user can edit the amount of money they actually transferred before submitting — partial or overpayment is allowed, with a small warning.
>
> A settlement is per single currency. The user picks the currency they pay in.
>
> Once added, the settlement appears in the group feed AND in the global Activity tab — both involved users see it in history.
>
> Balance math is always: **expenses owed − settlements = what's still owed**. So recording a settlement immediately reduces the displayed debt.
>
> Either party (payer or receiver) can record, edit, or delete a settlement. No notifications — the other party finds out from the feed / history.

---

## 2. Goals & non-goals

**In scope (v1)**
- Per-group settlement (no cross-group settling).
- "Settle Up" list shows **every pairwise net debt in the group**, per currency.
- Rows where the current user is the payer or receiver appear **pinned at the top** and use "you" instead of the user's display name.
- Rows where the current user is not involved are visible but **not tappable** (read-only — the user can't record someone else's payment).
- Tapping a tappable row opens a minimal settlement form pre-filled with payer, receiver, currency, and the suggested amount.
- Form fields are **only**: payer, receiver, currency, amount. Nothing else. (No date, no note, no payment method picker.)
- The amount is editable. Partial / overpayment is allowed, with an inline non-blocking warning.
- Overpayment is supported and flips the direction of the debt (creates a new opposite-direction debt).
- A settlement is scoped to **one currency**.
- Settlement appears as a distinct entry in: (a) the group feed and (b) the global Activity tab. Both involved users see it in both places.
- Either party (payer or receiver) can edit or delete a settlement at any time.
- Balance math subtracts settlements from expense debts in the same direction (and adds reverse-direction settlements).

**Out of scope (v1)**
- Notifications of any kind (push, in-app inbox, email).
- Debt simplification across more than two parties (no "Splitwise simplify" — only raw pairwise net per currency).
- Cross-group / per-friend aggregate settling.
- FX conversion between currencies (each currency stays separate).
- Optional fields on the form: date, note, payment method.
- Dispute mechanism (edit/delete is the only "dispute" path).

---

## 3. UX flow

### 3.1 Entry — the Settle Up list

User taps the **Settle Up** button on Group Detail. A screen (or sheet) opens listing every non-zero pairwise debt in the group, **per currency**.

Each row shows:
- Payer → Receiver (with avatars).
- Amount + currency.
- "You" replaces the current user's display name in either position.

Ordering:
1. Rows where the current user is involved — at the top.
2. Rows where the current user is not involved — below, visually de-emphasized and not tappable.

If there are no debts in the group: empty state ("Everyone is settled up").

### 3.2 Picking a row → settlement form

Tapping a tappable row opens the **Settle Up form** (bottom sheet preferred). Pre-filled:
- **Payer**: the debtor from that row.
- **Receiver**: the creditor from that row.
- **Currency**: the row's currency (the user can change currency, but this is unusual — see §3.4).
- **Amount**: the full pairwise net debt in that currency. User can change it.

Submitting inserts a row into the `settlements` table and closes the form.

### 3.3 Editable amount + partial / overpay warnings

Inline warnings under the amount field:
- Amount < suggested: *"This is a partial payment. ₪X will still be owed."*
- Amount > suggested: *"This is more than what's owed. ₪Y will now be owed in the other direction."*
- Amount = 0 or negative: submit disabled.

Warnings do not block submission (except amount ≤ 0).

### 3.4 Currency selection

The user picks the currency they paid in. By default it's the row's currency. The user can change it to any currency in which they have a debt to that person.

If the user picks a currency in which there's no current debt, the settlement still records (and creates a reverse-direction debt in that currency). This is rare but supported, matching "overpay flips direction" semantics.

### 3.5 Feed and Activity entries

- **Group feed**: a new `FeedItem` variant for settlement. Rendered as a distinct payment row (icon + accent color, e.g. "Avi paid Dana ₪50"). Sorts by settlement creation/date.
- **Global Activity tab** (`ActivityFeedScreen`): settlements involving the current user show up alongside other activity. Format: "You paid Dana ₪50 in <group>" or "Dana paid you ₪50 in <group>".

### 3.6 Edit / delete

Tapping a settlement entry (in either the group feed or the Activity tab) opens an action sheet with:
- **View** (always)
- **Edit** (if current user is the payer or receiver) — reopens the Settle Up form pre-filled with the existing values.
- **Delete** (if current user is the payer or receiver) — confirmation prompt, then soft-delete.

Edited / deleted settlements:
- Soft-deleted (kept in DB with `deleted_at`) so the row vanishes from feed/history/balances but remains in audit history.
- Edits modify the row in place and bump `updated_at`. The new values immediately reflect in feed, Activity, and balance math.

---

## 4. Data model

### 4.1 `settlements` (existing table — extend)
File: [cost-share-app/supabase/schema.sql](../cost-share-app/supabase/schema.sql) (line 93)

Already has: `id`, `group_id`, `from_user_id`, `to_user_id`, `amount`, `currency`, `payment_method`, `settlement_date`, `created_by`.

Changes for v1:
- Add `updated_at TIMESTAMPTZ` — bumped on edit.
- Add `deleted_at TIMESTAMPTZ NULL` — soft delete.
- Keep `payment_method` and `settlement_date` columns (already there, harmless), but the form does not expose them — `settlement_date = now()` and `payment_method = NULL`.
- **RLS update:** both `from_user_id` and `to_user_id` may `UPDATE` and (soft-)`DELETE`. Group members may `SELECT` (where `deleted_at IS NULL`).

No new tables for v1.

### 4.2 Balance calculation

Pairwise net debt per (group, payer, receiver, currency):

```
debt(A → B, currency) =
   sum(expense_splits where user=A, expense.paid_by=B, currency=currency, expense not deleted)
 − sum(expense_splits where user=B, expense.paid_by=A, currency=currency, expense not deleted)
 − sum(settlements where from=A, to=B, currency=currency, settlement not deleted)
 + sum(settlements where from=B, to=A, currency=currency, settlement not deleted)
```

If positive: A owes B that amount. If negative: B owes A `|amount|`. Computed per currency, independently.

**New RPC:** `get_group_pairwise_debts(p_group_id UUID)`
Returns one row per (payer, receiver, currency) with `amount > 0` only (normalizes direction):
```
[
  { from_user_id, to_user_id, currency, amount },
  ...
]
```

This drives the Settle Up list.

---

## 5. UI surfaces

### 5.1 Settle Up entry — `GroupDetailScreen`
File: [cost-share-app/apps/mobile/screens/groups/GroupDetailScreen.tsx](../cost-share-app/apps/mobile/screens/groups/GroupDetailScreen.tsx)

Keep the existing **Settle Up** quick-action button in `QuickActionsRow`. Rewire it to navigate to a new screen (or open a sheet) — **not** the old `SettleUpScreen`.

### 5.2 Settle Up list — new screen `SettleUpListScreen`
- Title: "Settle up"
- Body: `FlatList` of pairwise debts from `get_group_pairwise_debts`, with the "you-involved" rows pinned at the top.
- Row tap: if current user is `from` or `to`, opens the Settle Up form pre-filled. Otherwise no-op (visually disabled).
- Empty state: "Everyone is settled up".

### 5.3 Settle Up form — new `SettleUpSheet`
Bottom sheet. Fields: payer, receiver, currency picker, amount input. Warnings for partial / overpay. Submit / cancel.

### 5.4 Feed integration
File: [cost-share-app/apps/mobile/types/index.ts:456](../cost-share-app/apps/mobile/types/index.ts)

- Extend `FeedItem` union with `{ kind: 'settlement', sortAt, settlement }`.
- New `SettlementRow` component (sibling of `ExpenseRow` / `MessageRow`). Distinct visual treatment.
- Row text: "Avi paid Dana ₪50" (use "You" for current user).
- Tap → View / Edit / Delete action sheet (Edit / Delete only if current user is involved).

### 5.5 Activity tab integration
File: [cost-share-app/apps/mobile/screens/activity/ActivityFeedScreen.tsx](../cost-share-app/apps/mobile/screens/activity/ActivityFeedScreen.tsx)

- Settlements involving the current user are merged into the Activity feed alongside existing activity items.
- Row text: "You paid Dana ₪50 in <group>" / "Dana paid you ₪50 in <group>".
- Tap → opens the relevant group, scrolls to the settlement in the feed.

### 5.6 SettlementHistoryScreen (existing — keep as-is for now)
File: [cost-share-app/apps/mobile/screens/balances/SettlementHistoryScreen.tsx](../cost-share-app/apps/mobile/screens/balances/SettlementHistoryScreen.tsx)

Per-group settlement history. Already exists, already lists settlements. Will keep working with the extended schema (`deleted_at` filter applied). Not the primary surface but no reason to remove.

### 5.7 Cleanup
- Delete the old [SettleUpScreen.tsx](../cost-share-app/apps/mobile/screens/balances/SettleUpScreen.tsx).
- Remove its route from [AppNavigator.tsx](../cost-share-app/apps/mobile/navigation/AppNavigator.tsx).
- Remove any unused props/types from `@cost-share/shared` that only referenced the old flow.

---

## 6. i18n

Reuse `balances.*` and `activity.*` where possible. New keys (English baseline — Hebrew equivalents added in [he.json](../cost-share-app/apps/mobile/i18n/locales/he.json)):

```
settleUp.title                  "Settle up"
settleUp.empty                  "Everyone is settled up"
settleUp.you                    "you"
settleUp.row                    "{{from}} owes {{to}} {{amount}}"
settleUp.payer                  "Payer"
settleUp.receiver               "Receiver"
settleUp.currency               "Currency"
settleUp.amount                 "Amount"
settleUp.submit                 "Record payment"
settleUp.warnPartial            "Partial payment — {{remaining}} will still be owed"
settleUp.warnOverpay            "More than owed — {{flipAmount}} will be owed back"

settleUp.edit                   "Edit payment"
settleUp.delete                 "Delete payment"
settleUp.confirmDelete          "Delete this payment?"

activity.youPaid                "You paid {{name}} {{amount}}"
activity.paidYou                "{{name}} paid you {{amount}}"
activity.inGroup                "in {{group}}"

feed.settlement                 "{{from}} paid {{to}} {{amount}}"
```

---

## 7. Implementation order

1. **DB**
   - Add `updated_at`, `deleted_at` columns to `settlements`.
   - Update RLS to allow both parties to UPDATE / soft-DELETE.
   - Create RPC `get_group_pairwise_debts`.

2. **Service / hook layer**
   - Extend [settlements.service.ts](../cost-share-app/apps/mobile/services/settlements.service.ts) with `updateSettlement`, `deleteSettlement` (soft), `fetchGroupPairwiseDebts`.
   - Add query hooks under [hooks/queries/](../cost-share-app/apps/mobile/hooks/queries/) (`useGroupPairwiseDebtsQuery`, `useSettlementMutations`).
   - Add new query keys in [keys.ts](../cost-share-app/apps/mobile/hooks/queries/keys.ts).

3. **SettleUpListScreen** — new screen for the list of pairwise debts (with "you" pinning).

4. **SettleUpSheet** — bottom sheet form with partial/overpay warnings.

5. **Feed integration** — extend `FeedItem` union, add `SettlementRow`, wire into `GroupDetailScreen`'s feed.

6. **Activity tab integration** — merge settlements into `ActivityFeedScreen`.

7. **Edit / delete** — action sheet on settlement row in feed and Activity, wire to mutations.

8. **Cleanup** — delete old `SettleUpScreen`, remove its route.

9. **i18n** — add the new keys to `en.json` and `he.json`.

---

## 8. Locked decisions

| Question | Decision |
|---|---|
| Core goal | Show pairwise debts + record settlement that reduces them |
| Scope | Per-group only |
| Settle Up list contents | Every pairwise debt in the group, per currency |
| List ordering | Rows involving current user pinned at top, with "you" label |
| Non-involved rows | Visible but not tappable |
| Who can record | Either party (payer or receiver) |
| Form fields | Payer, receiver, currency, amount — nothing else |
| Amount editing | Allowed; partial / overpay both allowed with inline warning |
| Overpay behavior | Creates reverse-direction debt |
| Currency | One per settlement; user picks |
| Multi-currency balances | Tracked independently per currency, no FX |
| Edit / delete | Either party can do either, anytime; soft-delete; audit via `updated_at` |
| Notifications | None — counterparty finds out via feed / history |
| Settlement visibility | Group feed entry + global Activity tab entry (both parties) + existing SettlementHistoryScreen |
| Dispute | Skipped (edit/delete is the mechanism) |
| Simplification | None — only raw pairwise net per currency |
