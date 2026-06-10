# Handoff: CoPay · Settlement Detail Popup

## Overview

A bottom-sheet style popup that opens when a user taps a **settlement** row inside a group's activity feed. A settlement is a direct payment between two members (A pays B) that adjusts their balances — it is NOT an expense and does not get split between the rest of the group.

This popup is the settlement counterpart to the **Expense Detail Popup** (see `design_handoff_expense_detail/`). It uses identical sheet chrome, kebab menu, and overall rhythm — only the body content differs to reflect what a payment is about.

Replaces or augments `cost-share-app/apps/mobile/screens/settlements/SettlementDetailScreen.tsx` — repurpose as a modal sheet rather than a full screen if it's currently full-screen.

## About the design files

The files in `prototype/` are **design references created in HTML/JSX** — a working visual demonstrating intended look and behavior. NOT production code.

Recreate this design in **React Native + Expo + NativeWind**, matching the codebase's existing patterns. Reuse `MemberAvatar`, `AppIcon`, `theme/*` tokens — don't introduce new ones.

## Fidelity

**High-fidelity.** Every value maps 1:1 to a `theme/` token or an existing Tailwind class.

## Anatomy (top → bottom)

```
┌──────────────────────────────────────┐  ← Scrim: rgba(15,23,42,0.55), tap to dismiss
│  ▓▓▓▓ (group screen faded behind) ▓▓│
└──────────────────────────────────────┘
┌──────────────────────────────────────┐  ← Sheet: bg white, top-radius 24px,
│              ────                    │       max-height 88%, scroll inside,
│  ✕         SETTLEMENT       ⋮ ┌─────┐│       shadow 0 -8px 24px rgba(0,0,0,0.15)
│                                │Edit │
│                                │Delete│ ← Kebab menu opens on tap
│                                └─────┘
├──────────────────────────────────────┤
│  ┌──────────────────────────────┐   │
│  │ ⏺ Payment        Wed, Aug 13 │   │  ← Hero card · green gradient
│  │                                │   │       180 px tall · 16-px radius
│  │   ( D )   USD 18.00   ( YO )  │   │       border: success-border
│  │   David  ──────────►   You    │   │       Names + PAID/RECEIVED labels
│  │   PAID                RECEIVED│   │       are the central proof of who → who
│  └──────────────────────────────┘   │
│                                      │
│  ┌──────────────────────────────┐   │
│  │ ⬇  You received USD 18.00    │   │  ← Involvement strip
│  │    From David · via Bank …    │   │       green tint always — settlements
│  └──────────────────────────────┘   │       are always a positive event
└──────────────────────────────────────┘
```

There is **no separate "Total" block**, **no splits list**, and **no Details rows**. Everything you need to understand the settlement is in the hero + the involvement strip.

Edit / Delete live in the **anchored kebab menu** at the top right — they are NOT a row at the bottom of the sheet.

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

Same as the expense detail sheet. Reuse the same wrapper component.

## Header row

`display: flex; align-items: center; justify-content: space-between; padding: 0 8px 4px 8px`

- Left: `IconButton name="close"`, size 22, `colors.gray600`. Tap → dismiss
- Center: text `"SETTLEMENT"` — 12 px / 600, `colors.text.secondary`, uppercase, `letter-spacing: 0.06em`
- Right: `IconButton name="ellipsis-vertical"`, size 20, `colors.gray600`. Tap → opens an anchored popover with **Edit** and **Delete**. This is the only place those actions live.

### Kebab popover menu

Identical to the one in the expense detail popup — reuse the same component if you build one.

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

- **Edit** — 16 px Ionicon `pencil` in `colors.gray700`, label `"Edit"` in `colors.text.primary`. Tap → navigate to the existing edit-settlement route with `settlementId`.
- **Delete** — 16 px Ionicon `trash-outline` in `colors.error`, label `"Delete"` in `colors.error`. Tap → open `ConfirmDialog` (existing) with `settlements.deleteConfirm` copy → on confirm call `deleteSettlement` service → dismiss sheet.

Tapping anywhere outside the menu closes it.

## Hero card — payment flow

The whole point of the popup. Tells the user **who paid whom**, **how much**, and **when** at one glance.

`padding: 4px 16px 0 16px` around the card.

### Container

| Property | Value |
|--|--|
| Height | `180px` |
| Border radius | `16px` |
| Border | `1px solid colors.success.border` (`#A7F3D0`) |
| Background | `linear-gradient(135deg, #10B981 0%, #047857 100%)` — `success` → `success.text` |
| Overflow | `hidden`, position relative |
| Layout | `display: flex; align-items: center; justify-content: center` (centers the flow vertically) |

### Top decoration

- **Subtle vertical scrim** for legibility of the chip + date:
  `background: linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 70%, rgba(0,0,0,0.18) 100%)`
  Absolute inset, behind content (`zIndex: 0`).

- **"Payment" chip** — top-left, 10 px inset
  - Pill, `bg rgba(0,0,0,0.45)`, color `#FFF`
  - Padding `4px 10px`, radius `9999`
  - Content: 12 px Ionicon `checkmark-circle` + 4 px gap + text `"Payment"` at 11 px / 600

- **Date** — top-right, 12 px from top, 14 px from right
  - Text: 11 px / 500, `rgba(255,255,255,0.92)`
  - `text-shadow: 0 1px 2px rgba(0,0,0,0.4)`
  - Format: `"Wednesday, August 13"` (full weekday name, full month name)

### Payment flow (centered in the card body)

`display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 0 14px; box-sizing: border-box; position: relative; z-index: 2`

Three children:

#### 1. From column (left)

| Property | Value |
|--|--|
| Width | `96px` (fixed; not flex-grow) |
| Layout | `display: flex; flex-direction: column; align-items: center; gap: 6px` |

- Avatar: `MemberAvatar size="md"` (44 × 44 px) on `bg: #FFFFFF` with a `box-shadow: 0 0 0 3px rgba(255,255,255,0.25)` glow ring.
- Name: 13 px / 700, `#FFF`, `text-shadow: 0 1px 3px rgba(0,0,0,0.35)`, centered, `width: 96px` `whiteSpace: nowrap` `overflow: hidden` `text-overflow: ellipsis`
- Label: `"PAID"` — 9 px / 700, `rgba(255,255,255,0.8)`, uppercase, `letter-spacing: 0.08em`

#### 2. Arrow + amount column (middle)

| Property | Value |
|--|--|
| Flex | `flex: 1; min-width: 0; padding: 0 6px` |
| Layout | `display: flex; flex-direction: column; align-items: center; gap: 4px` |

- Amount text: **20 px / 700**, `#FFF`, `font-variant-numeric: tabular-nums`, `letter-spacing: -0.01em`, `text-shadow: 0 1px 3px rgba(0,0,0,0.35)`, `whiteSpace: nowrap`
- Format: `"USD 18.00"` — currency code + space + two decimals
- Below the amount: an arrow line spanning the full middle column width:
  - `display: flex; align-items: center; gap: 2px; width: 100%`
  - Line: `flex: 1; height: 2px; background: rgba(255,255,255,0.85); border-radius: 9999px`
  - Arrowhead: 18 px Ionicon `chevron-forward` in `rgba(255,255,255,0.95)`

#### 3. To column (right)

Mirror of the From column:
- Same width / layout / avatar / name styling
- Label: `"RECEIVED"` — same style as `"PAID"`

### Sample render

```
┌──────────────────────────────────────────────┐
│ ● Payment                Wednesday, August 13│
│                                              │
│   ⓓ        USD 18.00         ⓨ              │
│  David   ────────────►       You             │
│  PAID                        RECEIVED        │
│                                              │
└──────────────────────────────────────────────┘
```

## Involvement strip

A green-tinted strip below the hero that calls out the meaning of the settlement for the **current user** specifically. Always present, always green (settlements are positive events — debts close, not open).

`margin: 14px 16px 24px 16px` (note the bottom margin — this is the last item in the sheet, before sheet-end padding)
`padding: 14px 14px; border-radius: 12px`
`background: colors.success.bg` (`#ECFDF5`)
`border: 1px solid colors.success.border` (`#A7F3D0`)
`display: flex; align-items: center; gap: 12px`

### Left icon container

- 36 × 36 px circle, `background: #FFFFFF`
- Centered Ionicon, 20 px, `color: colors.success`
  - `arrow-down-circle-outline` when the current user **received** the payment
  - `arrow-up-circle-outline` when the current user **paid**
  - If neither party is the current user (rare — e.g. an admin view), use `swap-horizontal-outline`

### Right content (flex 1, min-width 0)

Two text lines:

| Case | Heading (15 px / 700, `colors.success.text`) | Sub (12 px, `colors.success.text` @ 80%) |
|--|--|--|
| Current user is recipient (`settlement.to === currentUserId`) | `"You received USD 18.00"` | `"From David · via Bank transfer"` |
| Current user is payer (`settlement.from === currentUserId`) | `"You paid USD 18.00"` | `"To Sarah · via Cash"` |
| Current user is neither | `"David paid Sarah"` | `"via Bank transfer"` |

Sub line spacing: `margin-top: 2px`.

Use the settlement's `method` to render the human-readable label (existing `getSettlementMethodLabel()` helper or i18n keys `settlements.method.{method}`).

## Interactions

| Trigger | What happens |
|--|--|
| Tap on scrim | Dismiss the sheet |
| Tap on ✕ | Dismiss |
| Swipe down on handle | Dismiss (existing modal gesture handler) |
| Tap ⋮ | Toggle the anchored Edit / Delete menu |
| Tap **Edit** (in menu) | Navigate to the existing edit-settlement route |
| Tap **Delete** (in menu) | Confirm via `ConfirmDialog` → call `deleteSettlement` service → dismiss sheet |
| Tap on hero avatars (from / to) | (Optional) Open that member's shared-balance view |

## State

Pure props — accept `settlement` (with `fromUserId`, `toUserId`, `amount`, `currency`, `method`, `createdAt`), `members` (to resolve names + avatars), `currentUserId`. No new global state. Mutations go through the existing settlements service.

## Copy (i18n keys, lift from `en.json`)

| Used here | Key |
|--|--|
| "SETTLEMENT" header | new — `settlements.detail` (uppercased in render) |
| "Payment" chip | reuse `settlements.payment` if it exists, otherwise add it |
| Date format | use existing `formatDate(date, 'full-weekday')` helper (e.g. via `date-fns`) |
| "PAID" label | new — `settlements.flow.paid` |
| "RECEIVED" label | new — `settlements.flow.received` |
| "You received USD X" | new — `settlements.youReceived` with `{{amount}}` |
| "You paid USD X" | new — `settlements.youPaid` with `{{amount}}` |
| "{from} paid {to}" | new — `settlements.someonePaid` with `{{from}}`, `{{to}}` |
| "From {name} · via {method}" | composed from `settlements.from` + `settlements.viaMethod` |
| "To {name} · via {method}" | composed from `settlements.to` + `settlements.viaMethod` |
| Method labels | existing keys `settlements.method.cash`, `bankTransfer`, `venmo`, `paypal`, `creditCard`, `other` |
| "Edit" | `common.edit` |
| "Delete" | `common.delete` |

## RTL

The codebase's `useRtlLayout()` handles direction. When porting:

- The from → to flow should mirror: in RTL the "To" column moves to the left, the "From" to the right, and the arrow flips direction (`chevron-back` instead of `chevron-forward`).
- The involvement strip's icon stays at `start`-side using `marginStart`.
- The kebab menu anchor flips to the start-side per RTL.

## Design tokens used

```ts
// Colors
text.primary       #111827
text.secondary     #6B7280
gray600            #4B5563
gray700            #374151
gray200            #E5E7EB
success            #10B981
success.bg         #ECFDF5
success.border     #A7F3D0
success.text       #047857
error              #EF4444
slate900           #0F172A
border.card        #E2E8F0

// Radii
12, 14, 16, 24 (sheet)

// Spacing
4, 6, 10, 12, 14, 16, 24

// Shadows
sheet:  0 -8px 24px rgba(0,0,0,0.15)
menu:   0 8px 20px rgba(15,23,42,0.12)

// Type sizes used here
9px   (PAID / RECEIVED labels)
11px  (Payment chip · date · sub line)
12px  (SETTLEMENT header)
13px  (avatar name)
14px  (menu item)
15px  (involvement heading)
20px  (hero amount)
```

## Files in this handoff

```
design_handoff_settlement_detail/
├── README.md                       ← this file
├── colors_and_type.css             ← every design token as CSS vars
└── prototype/
    ├── settlement-detail.html      ← THE design (boot file)
    ├── components.jsx              ← shared primitives (Icon, MemberAvatar)
    └── ios-frame.jsx               ← iPhone bezel for context
```

Open `prototype/settlement-detail.html` in a browser to see the design rendered. The sheet shows over a faded group-detail backdrop to demonstrate context.

## Related handoffs

- `design_handoff_group_detail/` — the screen this sheet opens FROM (a settlement row in its activity feed)
- `design_handoff_expense_detail/` — the sibling sheet for expenses; shares chrome, kebab menu, and copy patterns. Build the shared bottom-sheet wrapper once and reuse it for both.
