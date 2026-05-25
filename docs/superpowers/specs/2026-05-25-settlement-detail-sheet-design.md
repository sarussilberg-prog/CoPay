# Settlement Detail Sheet — Design Spec

**Status:** Approved
**Date:** 2026-05-25
**Author:** avi
**Design handoff:** `docs/design_handoff_settlement_detail/`

## Background

The activity feed in `GroupDetailScreen` opens a unified bottom sheet
([FeedItemDetailSheet.tsx](../../../cost-share-app/apps/mobile/components/FeedItemDetailSheet.tsx))
for both expenses and settlements. The expense half of the sheet was redesigned
as part of [PR #15](https://github.com/anthropics/apps/pull/15) (commit
`346e7a4`, "Group detail redesign + expense detail sheet") and now matches its
own design handoff at `docs/design_handoff_expense_detail/`.

The **settlement half** of the same sheet still renders the older design — an
icon + amount + three `DetailSection` cards (From, To, Payment method) plus a
header with two pill buttons. This work replaces it with the spec in
`docs/design_handoff_settlement_detail/` so the two halves share chrome and
visual rhythm.

## Goals

- Settlement body inside `FeedItemDetailSheet` matches the design handoff 1:1
  (hero card with payment flow + single involvement strip).
- The header chrome (close ✕ · uppercase label · ⋮ kebab popover) is shared
  between expense and settlement views.
- Existing wiring is preserved: edit opens `SettleUpSheet`, delete goes through
  `deleteSettlementMutation`, both already coordinated in
  [GroupDetailScreen.tsx](../../../cost-share-app/apps/mobile/screens/groups/GroupDetailScreen.tsx).

## Non-goals

- Tap-avatar → member-balance navigation (marked "(Optional)" in the handoff;
  deferred).
- Any change to `SettleUpSheet`, `deleteSettlementMutation`, settlement
  services, or the settlement data model.
- Any change to the expense detail body.
- Removing or repurposing a standalone settlement detail screen — none exists
  in the current codebase (the handoff's reference to
  `screens/settlements/SettlementDetailScreen.tsx` is stale).
- `ActivityFeedScreen` — its redesign is a separate follow-up.

## Architecture

### Files touched

| File | Change |
|---|---|
| `cost-share-app/apps/mobile/components/FeedItemDetailSheet.tsx` | Rewrite `SettlementDetailBody`; remove old `SettlementHeader`; switch expense branch to render the new shared header. |
| `cost-share-app/apps/mobile/components/DetailSheetHeader.tsx` | NEW — extracted from today's inline `ExpenseHeader`. |
| `cost-share-app/apps/mobile/__tests__/components/FeedItemDetailSheet.test.tsx` | Rewrite settlement assertions; add coverage for the three involvement variants. |
| `cost-share-app/apps/mobile/i18n/locales/en.json` | Add 10 keys under `settleUp.*` (see below). |
| `cost-share-app/apps/mobile/i18n/locales/he.json` | Add the same 10 keys in Hebrew. |

No new screens, no new routes, no new services, no schema changes.

### Component tree (after change)

```
FeedItemDetailSheet (existing — props unchanged)
├── DetailSheetHeader  ← NEW: { label, onClose, onEdit, onDelete }
│     internally: close button · centered uppercase label · kebab popover
│     with Edit + Delete items (anchored, dismissed on outside tap)
│
├── ExpenseDetailBody  (existing — body unchanged)
└── SettlementDetailBody  ← REWRITTEN
    ├── SettlementHero
    │     hero card · 180 px · green gradient · Payment chip · date ·
    │     From column · amount + arrow · To column
    └── SettlementInvolvementStrip
          green tint · icon · two text lines tailored to currentUserId
```

`SettlementHero` and `SettlementInvolvementStrip` are local sub-components in
`FeedItemDetailSheet.tsx`, matching how `InvolvementStrip` already lives there
for the expense side. The only new file is `DetailSheetHeader.tsx`.

### Props on `DetailSheetHeader`

```ts
interface DetailSheetHeaderProps {
    label: string;          // e.g. t('groups.feedDetail.expenseHeaderLabel')
                            // or t('settleUp.detailHeaderLabel')
                            // rendered uppercase by the component
    onClose: () => void;
    onEdit: () => void;
    onDelete: () => void;
}
```

The component owns the `menuOpen` state and the close-on-outside-tap pressable.
Existing test IDs (`detail-kebab-btn`, `detail-edit-btn`, `detail-delete-btn`)
move with it and remain stable.

### Settlement body data flow

`SettlementDetailBody` receives the same props it already does:

```ts
{
  settlement: Settlement,             // from @cost-share/shared
  memberMap: Record<string, GroupMemberLite>,
  currentUserId: string,
  language: 'en' | 'he',
}
```

The body computes (no state):

- `fromName`, `toName` via the existing `memberName()` helper
- `amountText = `${currency} ${amount.toFixed(2)}`` (same pattern as the expense
  body)
- `heroDate` via the existing `formatHeroDate(date, language)` helper
- `involvement: 'received' | 'paid' | 'other'` based on `currentUserId`
  vs `settlement.fromUserId` / `settlement.toUserId`
- `methodLabel`: when `settlement.paymentMethod` is set,
  `t(`balances.paymentMethods.${settlement.paymentMethod}`)` (existing keys at
  [en.json:390](../../../cost-share-app/apps/mobile/i18n/locales/en.json#L390)).
  When unset, the sub line omits the "via …" segment.

No new hooks, no new selectors. Pure presentational.

## Visual mapping

All values map to existing `theme/` tokens or established Tailwind utilities
already used in the expense body. Pixel values come from the handoff.

### Hero card

| Property | Value |
|---|---|
| Height | 180 px |
| Border radius | 16 px |
| Border | 1 px solid `colors.success.border` |
| Background | LinearGradient 135° from `colors.success` to `colors.success.text` |
| Overflow | hidden |
| Outer padding | `px-4 pt-1` (matches expense hero) |

Top decoration:

- Vertical legibility scrim (top + bottom rgba black 0.18) as an absolutely
  positioned `<View>` at `zIndex: 0`.
- **Payment chip** — top-left, 10 px inset, `bg rgba(0,0,0,0.45)`, radius 9999,
  padding `4 10`. Contents: 12 px `checkmark-circle` icon · 4 px gap · text
  `t('settleUp.payment')` at 11 px / 600 white.
- **Date** — top-right, 12 px from top, 14 px from right. 11 px / 500 in
  `rgba(255,255,255,0.92)` with subtle text-shadow.

Center flow (`flex-row items-center justify-between` with `zIndex: 2`):

| Column | Width | Contents |
|---|---|---|
| From | 96 px fixed, column layout, gap 6 | `MemberAvatar size="md"` on white bg with a 3 px white-alpha "glow" wrapper · name 13 px / 700 white (truncate) · `t('settleUp.paid')` label 9 px / 700 white@80% uppercase |
| Middle | flex 1, padding-x 6 | Amount 20 px / 700 white tabular-nums · arrow line below: 2 px white@85% line + 18 px `chevron-forward` (or `chevron-back` in RTL) |
| To | 96 px fixed | Mirror of From column · `t('settleUp.received')` label |

Avatar "glow ring" — wrap the `MemberAvatar` in a `<View>` with
`padding: 3, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 9999`
(React Native does not support `box-shadow: 0 0 0 3px` directly).

### Involvement strip

Single strip, always green (settlements are positive events).

| Property | Value |
|---|---|
| Margin | `mx-4 mt-3.5 mb-6` |
| Padding | 14 px / 14 px |
| Border radius | 12 px |
| Background | `colors.success.bg` (#ECFDF5) |
| Border | 1 px `colors.success.border` (#A7F3D0) |
| Layout | `flex-row items-center gap-3` |

Left icon container: 36 × 36 white circle (radius 9999) holding a 20 px icon in
`colors.success`. Icon name depends on involvement:

| Case | Icon |
|---|---|
| `currentUserId === toUserId` (received) | `arrow-down-circle-outline` |
| `currentUserId === fromUserId` (paid) | `arrow-up-circle-outline` |
| neither party | `swap-horizontal-outline` |

Right content (`flex-1 min-w-0`):

| Case | Heading (15 / 700, `colors.success.text`) | Sub (12, same color @ 80%) |
|---|---|---|
| received | `t('settleUp.youReceivedAmount', { amount })` | If method set: `t('settleUp.fromVia', { name: fromName, method: methodLabel })`. Else: `t('settleUp.fromName', { name: fromName })` — fall back to the bare "From {name}" string. |
| paid | `t('settleUp.youPaidAmount', { amount })` | If method set: `t('settleUp.toVia', { name: toName, method: methodLabel })`. Else: `t('settleUp.toName', { name: toName })`. |
| neither | `t('settleUp.someonePaid', { from: fromName, to: toName })` | If method set: `t('settleUp.via', { method: methodLabel })`. Else: omit sub line. |

Sub-line `margin-top: 2`.

## i18n

New keys live under the existing `settleUp.*` namespace (settlement copy
already lives there at [en.json:504](../../../cost-share-app/apps/mobile/i18n/locales/en.json#L504)).
The handoff's `settlements.*` namespace is renamed to match what exists.

Add to **both** `en.json` and `he.json`:

```jsonc
"settleUp": {
    // … existing keys …
    "detailHeaderLabel": "Settlement",       // rendered uppercase
    "payment": "Payment",
    "paid": "PAID",
    "received": "RECEIVED",
    "youReceivedAmount": "You received {{amount}}",
    "youPaidAmount": "You paid {{amount}}",
    "someonePaid": "{{from}} paid {{to}}",
    "fromVia": "From {{name}} · via {{method}}",
    "toVia": "To {{name}} · via {{method}}",
    "fromName": "From {{name}}",
    "toName": "To {{name}}",
    "via": "via {{method}}"
}
```

Hebrew translations are finalized during implementation; preliminary draft:

| Key | Hebrew |
|---|---|
| `detailHeaderLabel` | תשלום |
| `payment` | תשלום |
| `paid` | שולם |
| `received` | התקבל |
| `youReceivedAmount` | קיבלת {{amount}} |
| `youPaidAmount` | שילמת {{amount}} |
| `someonePaid` | {{from}} שילם ל-{{to}} |
| `fromVia` | מ-{{name}} · באמצעות {{method}} |
| `toVia` | ל-{{name}} · באמצעות {{method}} |
| `fromName` | מ-{{name}} |
| `toName` | ל-{{name}} |
| `via` | באמצעות {{method}} |

Existing keys reused (no change): `balances.paymentMethods.{cash | bank_transfer
| venmo | paypal | credit_card | other}`, `common.edit`, `common.delete`,
`settleUp.you`, `groups.filters.close`.

The expense-side header label `groups.feedDetail.expenseHeaderLabel` stays as
the prop fed to `DetailSheetHeader` for the expense branch.

## RTL

`useAppLanguage()` returns `'en' | 'he'` and is already imported. RTL changes:

- Hero center row: when `language === 'he'`, render with `flexDirection:
  'row-reverse'` so the "To" column appears on the visual left.
- Chevron icon switches from `chevron-forward` → `chevron-back`.
- Involvement strip gap uses `gap-3` (direction-neutral).
- `DetailSheetHeader` anchors its kebab popover to the end-side: keep today's
  `right: 4` for LTR, switch to `left: 4` for RTL. The close button stays at
  the visual start (no change from today).

## Tests

Rewrite [FeedItemDetailSheet.test.tsx](../../../cost-share-app/apps/mobile/__tests__/components/FeedItemDetailSheet.test.tsx)
settlement coverage. Expense test continues to pass once the shared header is
extracted.

### Test cases (settlement)

1. **Kebab-gated edit & delete (third-party viewer)** —
   `currentUserId = 'u3'`, settlement between `u1` → `u2`.
   - Assert `detail-edit-btn` and `detail-delete-btn` are NOT present initially.
   - Press `detail-kebab-btn`; assert both appear; press `detail-edit-btn`;
     assert `onEdit` called.
   - Repeat for delete.
   - Assert the involvement heading renders the `someonePaid` copy.

2. **Current user is recipient** — `currentUserId = settlement.toUserId`.
   - Assert heading contains `You received` and the amount.
   - Assert sub line contains the payer's name.

3. **Current user is payer** — `currentUserId = settlement.fromUserId`.
   - Assert heading contains `You paid` and the amount.
   - Assert sub line contains the recipient's name.

4. **No paymentMethod set** — recipient case.
   - Assert sub line is `From {{name}}` (no "via …").

All four cases assert `getByTestId('settlement-detail-sheet')` is present, so
the kind discrimination keeps working.

### Existing expense test

The "shows expense details and exposes edit/delete via the kebab menu" test
(line 46) should pass unchanged after `DetailSheetHeader` extraction — the test
IDs (`detail-kebab-btn`, `detail-edit-btn`, `detail-delete-btn`) move into the
shared component but keep the same names.

## Manual QA checklist

- [ ] Settlement row in `GroupDetailScreen` activity feed opens the sheet.
- [ ] Hero shows correct From and To avatars + names, amount, and full
      weekday/month/day date.
- [ ] Sheet header shows close · "SETTLEMENT" centered · kebab.
- [ ] Kebab tap opens popover; outside-tap dismisses it.
- [ ] Edit from kebab opens `SettleUpSheet` pre-filled with the settlement.
- [ ] Delete from kebab opens confirm dialog, then removes the settlement.
- [ ] Recipient view: green strip reads "You received USD X · From {payer}
      · via {method}".
- [ ] Payer view: green strip reads "You paid USD X · To {recipient}
      · via {method}".
- [ ] Third-party view (admin / non-party member): green strip reads
      "{from} paid {to} · via {method}" and uses `swap-horizontal-outline`.
- [ ] Settlement without `paymentMethod`: sub line omits "via …".
- [ ] RTL (he): To column on the left, From on the right, chevron points left,
      kebab popover anchors to start-side.
- [ ] LTR (en): To on the right, From on the left, chevron points right.
- [ ] Scroll inside the sheet works; tap-outside the sheet dismisses it; swipe
      down on the handle dismisses it.

## Open questions

None — the design handoff is high-fidelity and all scope decisions are
captured above.
