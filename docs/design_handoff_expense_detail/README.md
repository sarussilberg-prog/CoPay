# Handoff: Kupay · Expense Detail Popup

## Overview

A bottom-sheet style popup that opens when a user taps an expense row inside a group's activity feed. It shows everything about that one expense — receipt photo (or category fallback), total, the current user's involvement, the per-member split breakdown, and Edit / Delete actions.

Replaces `cost-share-app/apps/mobile/screens/expenses/ExpenseDetailScreen.tsx` — repurpose it as a modal sheet rather than a full screen if it's currently full-screen. Reuses `FeedItemDetailSheet.tsx` patterns if a bottom-sheet primitive already exists; otherwise use `react-native-modal` or the existing modal helpers in the codebase.

## About the design files

The files in `prototype/` are **design references created in HTML/JSX** — a working visual demonstrating intended look and behavior. NOT production code.

Recreate this design in **React Native + Expo + NativeWind**, matching the codebase's existing patterns. Reuse `MemberAvatar`, `AppIcon`, `Button`, `theme/*` tokens — don't introduce new ones.

## Fidelity

**High-fidelity.** Every value below maps 1:1 to a `theme/` token or an existing Tailwind class.

## Anatomy (top → bottom)

```
┌──────────────────────────────────────┐  ← Scrim: rgba(15,23,42,0.55), tap to dismiss
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ (group screen   │
│  ▓▓▓▓ faded behind ▓▓▓▓▓▓▓▓▓▓▓▓)   │
└──────────────────────────────────────┘
┌──────────────────────────────────────┐  ← Sheet: bg white, top-radius 24px,
│              ────                    │       max-height 88%, scroll inside,
│  ✕         EXPENSE         ⋮         │       shadow 0 -8px 24px rgba(0,0,0,0.15)
├──────────────────────────────────────┤
│  ┌──────────────────────────────┐   │
│  │  [Food chip]                  │   │  ← Hero card: receipt photo (or
│  │                                │   │       category gradient fallback)
│  │  Sushi on Friday              │   │       140px tall, 16-px radius
│  │  Friday, August 14            │   │       text overlay at bottom on scrim
│  └──────────────────────────────┘   │
│                                      │
│  TOTAL                               │
│  USD 84.20                           │  ← 28/700 tabular-nums, -0.01em
├──────────────────────────────────────┤
│  ┌──────────────────────────────┐   │
│  │ ⬆  You borrowed USD 21.05    │   │  ← User involvement strip
│  │    From Sarah Levin           │   │       red tint when borrowed
│  └──────────────────────────────┘   │       green tint when lent
├──────────────────────────────────────┤
│  SPLIT BETWEEN · 4 PEOPLE  Equal     │  ← Eyebrow row
│  ┌──────────────────────────────┐   │
│  │ (S)  Sarah Levin [PAID]      │   │
│  │      Lent USD 63.15  USD 21.05│   │  ← Splits list, divider between rows
│  │ (YO) You                      │   │
│  │      Owes Sarah     USD 21.05 │   │
│  │ (D)  David          USD 21.05 │   │
│  │      Owes Sarah               │   │
│  │ (M)  Maya           USD 21.05 │   │
│  │      Owes Sarah               │   │
│  └──────────────────────────────┘   │
├──────────────────────────────────────┤
│  [ ✏ Edit  ]    [ 🗑 Delete ]        │  ← Action row
└──────────────────────────────────────┘
```

## Sheet container

| Property | Value |
|--|--|
| Position | Bottom of viewport, slides up |
| Background | `#FFFFFF` |
| Border radius | `24px 24px 0 0` |
| Max height | `88%` of viewport |
| Overflow | `auto` (vertical scroll inside) |
| Shadow | `0 -8px 24px rgba(0,0,0,0.15)` |
| Scrim above | `rgba(15,23,42,0.55)` — `colors.slate900` @ 55% — tap to dismiss |
| Drag handle | 40 × 4 px, `bg colors.gray200`, radius `9999`, centered, 10 px from top |

## Header row

`display: flex; align-items: center; justify-content: space-between; padding: 0 8px 4px 8px`

- Left: `IconButton name="close"` (`Ionicons close`), size 22, `colors.gray600`. Tap → dismiss
- Center: text `"EXPENSE"` — 12 px / 600, `colors.text.secondary`, uppercase, `letter-spacing: 0.06em`
- Right: `IconButton name="ellipsis-vertical"`, size 20, `colors.gray600`. Tap → opens an anchored popover menu (below) containing **Edit** and **Delete**. This is the only place those actions live on this sheet.

### Kebab popover menu

Anchored to the kebab button (top-right). Use the codebase's existing menu primitive if one exists (otherwise a simple absolute-positioned card works).

| Property | Value |
|--|--|
| Background | `#FFFFFF` |
| Border | `1px solid colors.border.card` |
| Border radius | `12px` |
| Shadow | `0 8px 20px rgba(15,23,42,0.12)` |
| Min-width | `160px` |
| Padding | `4px` |
| Anchor | 38 px below the kebab, right-aligned to the kebab |

Each item: `display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; font-size: 14px / 500; text-align: left`

- **Edit** — 16 px Ionicon `pencil` in `colors.gray700`, label `"Edit"` in `colors.text.primary`. Tap → navigate to `EditExpense` route with `expenseId`.
- **Delete** — 16 px Ionicon `trash-outline` in `colors.error`, label `"Delete"` in `colors.error`. Tap → open `ConfirmDialog` with `expenses.deleteExpenseConfirm` copy → on confirm call `deleteExpense` service → dismiss sheet.

Tapping anywhere outside the menu closes it.

## Hero card

`padding: 4px 16px 0 16px` around the card.

- **Container:** 140 px tall, `border-radius: 16px`, `border: 1px solid colors.border.card`, `overflow: hidden`, position relative
- **Image** (when `expense.receiptUrl` exists): full-fill `object-fit: cover`
- **Fallback** (no receipt): linear-gradient from `lib/groupTypeVisuals.ts` keyed by `expense.category` (use the same gradient map; for expense categories use a per-category gradient or pick from existing palette — could be a future task). Center the category Ionicon at 64 px in `rgba(255,255,255,0.45)`.
- **Bottom scrim:** `linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.7) 100%)` — absolute inset
- **Category chip** (top-left, 10 px inset): pill, `bg rgba(0,0,0,0.55)`, color `#FFF`, padding `4px 10px`, radius `9999`. Content: 12 px Ionicon (per `CATEGORY_ICON` map below) + 5 px gap + category name `"Food"` at 11 px / 600.
- **Title block** (bottom 12 px inset, left 14 px right 14 px):
  - Title: **20 px / 700** white, `text-shadow: 0 1px 4px rgba(0,0,0,0.5)`, `letter-spacing: -0.005em`
  - Date: **12 px**, `rgba(255,255,255,0.92)`, `text-shadow: 0 1px 2px rgba(0,0,0,0.5)`, 4 px below title — format: `"Friday, August 14"` (full weekday name)

### Category icon mapping

Same as the activity feed's row icons:

```ts
const CATEGORY_ICON = {
  food: 'restaurant-outline',
  transport: 'car-outline',
  accommodation: 'bed-outline',
  utilities: 'flash-outline',
  entertainment: 'film-outline',
  shopping: 'cart-outline',
  healthcare: 'medkit-outline',
  other: 'pricetag-outline',
};
```

## Total amount

`padding: 12px 16px 6px 16px`

- Eyebrow: `"TOTAL"` — 10 px / 600, `colors.slate400`, uppercase, `letter-spacing: 0.06em`
- Amount: `"USD 84.20"` — **28 px / 700**, `colors.text.primary`, `font-variant-numeric: tabular-nums`, `letter-spacing: -0.01em`, 2 px below eyebrow

**Format**: `"{CURRENCY} {amount.toFixed(2)}"` — currency code prefix, single space, two decimals (Kupay convention).

## User-involvement strip

`margin: 6px 16px 0 16px; padding: 12px 14px; border-radius: 12px`

**Borrowed state** (current user did NOT pay):
- Background: `colors.error.bg` (`#FEF2F2`)
- Border: `1px solid colors.error.border` (`#FECACA`)
- Icon container: 32 × 32 px circle, `bg #FFFFFF`, centered Ionicon `arrow-up-circle-outline`, 18 px, `colors.error`
- Heading: `"You borrowed USD 21.05"` — 14 px / 700, `colors.error.text` (`#B91C1C`)
- Sub: `"From {payerName}"` — 11 px, `colors.error.text` @ 80% opacity, 1 px below

**Lent state** (current user paid):
- Same shape but tints swapped: `bg colors.success.bg`, `border colors.success.border`, icon `arrow-down-circle-outline` in `colors.success`, text `colors.success.text` (`#047857`)
- Heading: `"You lent USD 63.15"` (= `amount - userShare`)
- Sub: `"To {N} people"` where N = `splits.length - 1`

**Settled state** (rare — user not involved in this expense):
- Hide the strip entirely.

## Splits section

`padding: 16px 16px 24px 16px` (extra bottom padding since there's no action row below)

### Header row

`display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10px`

- Left eyebrow: `"SPLIT BETWEEN · {N} PEOPLE"` — 11 px / 600, `colors.slate400`, uppercase, `letter-spacing: 0.06em`
- Right meta: `"Equal"` or `"Custom"` — 11 px, `colors.text.secondary`

### List

Container: `background: #fff; border-radius: 14px; border: 1px solid colors.border.card; overflow: hidden`

Each row: `display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-bottom: 1px solid colors.border.soft` (omit border on last row)

- **Avatar**: `MemberAvatar size="sm"` (36 px)
- **Body** (flex 1, min-width 0):
  - Name + PAID badge (inline): name at **14 px / 600** `colors.text.primary`. Use `"You"` instead of the real name when `split.userId === currentUserId`.
    - If `split.userId === expense.paidBy`, show a **PAID** badge inline after the name:
      - `padding: 2px 6px; border-radius: 4px; background: colors.primaryExtraLight; color: colors.primaryDark; font-size: 9px; font-weight: 700; letter-spacing: 0.04em; margin-left: 8px`
  - Sub-line: **11 px**, `colors.text.tertiary`, 1 px below name. Format:
    - If split is the payer: `"Lent {currency} {(amount - userShare).toFixed(2)}"`
    - Else: `"Owes {payerFirstName}"`
- **Right** (text-align right, fixed): split amount in **14 px / 700**, `colors.text.primary`, `font-variant-numeric: tabular-nums`. Format `"{CURRENCY} {split.amount.toFixed(2)}"`.

## Action row

**Removed.** Edit and Delete live exclusively in the kebab menu at the top right of the sheet. See "Kebab popover menu" above.

## Interactions

| Trigger | What happens |
|--|--|
| Tap on scrim | Dismiss the sheet |
| Tap on ✕ | Dismiss |
| Swipe down on handle | Dismiss (use existing modal gesture handler) |
| Tap ⋮ | Toggle the anchored Edit / Delete menu |
| Tap **Edit** (in menu) | Navigate to `EditExpense` route with `expenseId` |
| Tap **Delete** (in menu) | Confirm via `ConfirmDialog` → call `deleteExpense` service → dismiss sheet |
| Tap on hero photo | (Future) Open full-screen photo viewer |
| Tap on a split row | (Optional) Open that member's profile / shared balances |

## State

Pure props — accept `expense` (with embedded `splits` and `payer`), `currentUserId`. No new global state. All mutations go through `expenses.service.ts` (existing).

`expense.userShare`: compute from `splits.find(s => s.userId === currentUserId)?.amount ?? 0`. Same convention as the activity row in the parent screen.

## Copy (i18n keys, lift from `en.json`)

| Used here | Key |
|--|--|
| "EXPENSE" header | new — `expenses.expenseDetail` (uppercased in render) |
| "TOTAL" eyebrow | new — `expenses.total` |
| "You borrowed USD X" | new key `expenses.youBorrowed` with `{{amount}}` |
| "You lent USD X" | new key `expenses.youLent` with `{{amount}}` |
| "From {name}" | new — `expenses.from` |
| "To N people" | use plural — `expenses.toNPeople` |
| "SPLIT BETWEEN · N people" | new — `expenses.splitBetween` (uppercased) |
| "Equal" / "Custom" | `expenses.equalSplit` / `expenses.unequalSplit` (exist) |
| "PAID" badge | new — `expenses.paid` |
| "Lent USD X" / "Owes {name}" | new — `expenses.splitLent`, `expenses.splitOwes` |
| "Edit" | `common.edit` |
| "Delete" | `common.delete` |

## RTL

The codebase's `useRtlLayout()` handles direction. When porting:

- Header row: don't position by `left/right`, use the existing helpers
- Total amount stays left-aligned in LTR, right-aligned in RTL (use `rtlTextAlign`)
- Splits row chevrons / PAID badge: use `marginStart` not `marginLeft`
- Action row: gap-based, RTL-safe by default

## Design tokens used

```ts
// Colors
text.primary       #111827
text.secondary     #6B7280
text.tertiary      #9CA3AF
slate400           #94A3B8
gray200            #E5E7EB
gray600            #4B5563
gray700            #374151
bg.secondary       #F8FAFC
primary            #60A5FA
primaryDark        #3B82F6
primaryExtraLight  #DBEAFE
success            #10B981
success.bg         #ECFDF5
success.border     #A7F3D0
success.text       #047857
error              #EF4444
error.bg           #FEF2F2
error.border       #FECACA
error.text         #B91C1C
border.card        #E2E8F0
border.soft        #F1F5F9
border.strong      #D1D5DB

// Radii
12, 14, 16, 24 (sheet)

// Spacing
4, 6, 8, 10, 12, 14, 16, 22

// Shadows
sheet:  0 -8px 24px rgba(0,0,0,0.15)

// Type sizes used here
9px  (PAID badge)
10px (TOTAL eyebrow)
11px (eyebrows · meta · sub-lines)
12px (date · EXPENSE header · category chip text)
14px (split row title · button label · involvement heading)
20px (hero title overlay)
28px (TOTAL amount)
```

## Files in this handoff

```
design_handoff_expense_detail/
├── README.md                  ← this file
├── colors_and_type.css        ← every design token as CSS vars
└── prototype/
    ├── expense-detail.html    ← THE design (boot file)
    ├── components.jsx         ← shared primitives
    └── ios-frame.jsx          ← iPhone bezel for context
```

Open `prototype/expense-detail.html` in a browser to see the design rendered. The sheet is shown over a faded group-detail backdrop to demonstrate context.
