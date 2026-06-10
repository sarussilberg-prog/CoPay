# Handoff: CoPay · Settle-up popup

## Overview

A bottom-sheet popup that opens when the user taps **Settle up** on a group's summary card (or on a friend balance). Lets the user record a payment that will zero out — or chip away at — a balance with another member.

This is the **create-settlement** counterpart to the existing **Settlement Detail popup** (see `design_handoff_settlement_detail/`). They share the same sheet chrome: scrim, rounded top, drag handle, "SETTLE UP" header label, Cancel / Save on the header row.

Replaces or augments the current settle flow in `cost-share-app/apps/mobile/screens/settlements/` — repurpose as a modal bottom sheet rather than a full screen if it's currently full-screen.

## About the design files

`settle-popup.html` is a **design reference created in HTML/JSX** — a working visual demonstrating intended look and behavior. NOT production code.

Recreate this design in **React Native + Expo + NativeWind**, matching the codebase's existing patterns. Reuse `MemberAvatar`, `AppIcon`, `theme/*` tokens — don't introduce new ones.

## Fidelity

**High-fidelity.** Every value maps 1:1 to a `theme/` token or an existing Tailwind class. Sample scenario in the design: *you owe David USD 18.00 in "Weekend in Tel Aviv"*.

## Anatomy (top → bottom)

```
┌──────────────────────────────────────┐  ← Scrim: rgba(15,23,42,0.55), tap to dismiss
│  ▓▓▓▓ (group screen faded behind) ▓▓│
└──────────────────────────────────────┘
┌──────────────────────────────────────┐  ← Sheet: bg white, top-radius 24px,
│              ────                    │       height 62% of viewport,
│  Cancel    SETTLE UP        Save     │       shadow 0 -8px 24px rgba(0,0,0,0.18)
├──────────────────────────────────────┤
│  ┌──────────────────────────────┐   │  ← Emerald hero, 196 px tall, radius 16
│  │ ⏺ New payment    Weekend …   │   │       border: success-border (#A7F3D0)
│  │                                │   │       bg: linear-gradient 135° emerald
│  │  ( YO )  ╔ USD ⌄ 18.00 │ ╗ ( D ) │       From [you] → To [david]
│  │   You   ────────────►   David │       Editable amount in the middle,
│  │         ╔  ⇄ SWAP  ╗          │       with blinking caret + currency chevron
│  │   FROM                  TO    │       Swap chip flips direction
│  └──────────────────────────────┘   │
│                                      │
│  METHOD                              │
│  [ 💵 ] [ 💳 ] [ Ⓟ ] [ ⋯ ]          │  ← 4 icon-only tiles, 56×56, radius 14
│                                      │       Bank transfer is selected
├──────────────────────────────────────┤
│       📅 Today, Aug 14 ⌄             │  ← Small date chip, centered
│  ┌──────────────────────────────┐   │
│  │  ✔  Record payment · USD 18  │   │  ← Big primary button (blue)
│  └──────────────────────────────┘   │
└──────────────────────────────────────┘
```

## Sheet container

| Property | Value |
|--|--|
| Position | Bottom of viewport, slides up |
| Background | `#FFFFFF` |
| Border radius | `24px 24px 0 0` |
| Height | `62%` of viewport |
| Overflow | `hidden`; body scrolls internally |
| Shadow | `0 -8px 24px rgba(0,0,0,0.18)` |
| Scrim above | `rgba(15,23,42,0.55)` — `colors.slate900` @ 55% — tap to dismiss |
| Drag handle | 40 × 4 px, `bg colors.gray200`, radius `9999`, centered, 8 px from top |

Same chrome as `design_handoff_settlement_detail`. Reuse the same wrapper.

## Header row

- Left: **`Cancel`** text button, 15px / 500, `colors.gray600`
- Center: **`SETTLE UP`** label — 12px / 600, `colors.text.secondary`, uppercase, letter-spacing `0.06em`
- Right: **`Save`** text button, 15px / 700, `colors.primary-dark` when enabled

Below the row: 1px hairline divider `colors.border.soft`.

## Hero — payment flow

The whole point of the sheet. Tells the user **who pays whom**, **how much**, in one visual.

### Container

| Property | Value |
|--|--|
| Height | `196px` |
| Margin | `12px 16px 0 16px` |
| Border radius | `16px` |
| Border | `1px solid colors.success.border` (`#A7F3D0`) |
| Background | `linear-gradient(135deg, #10B981 0%, #047857 100%)` |
| Overflow | `hidden`, position relative |

### Top chrome (inside hero, top 10px inset)

- Left: **"New payment"** pill — `bg rgba(0,0,0,0.45)`, white text, 11px / 600, prefixed with a 12px `checkmark-circle` icon.
- Right: **Group name** — 11px / 500, `rgba(255,255,255,0.92)`, with `text-shadow: 0 1px 2px rgba(0,0,0,0.4)`.

A subtle vertical inner scrim (top+bottom black gradient at 18% opacity) sits behind the chrome and labels for legibility.

### Center flow

Three columns:

#### 1. From column (left) — `FlowAvatar`
- 96 px fixed width
- 44 × 44 px avatar on `#FFFFFF` with a `box-shadow: 0 0 0 3px rgba(255,255,255,0.25)` glow ring + 2px white border
- Name below — 13 px / 700, white, `text-shadow: 0 1px 3px rgba(0,0,0,0.35)`
- Label `"FROM"` — 9 px / 700, `rgba(255,255,255,0.8)`, uppercase, letter-spacing `0.08em`

#### 2. Middle column — editable amount + arrow + swap

The amount lives inside a tappable button with a translucent white background — signals it's editable:

| Property | Value |
|--|--|
| Background | `rgba(255,255,255,0.14)` |
| Border | `1px solid rgba(255,255,255,0.32)` |
| Inner shadow | `inset 0 0 0 1px rgba(255,255,255,0.05)` |
| Radius | `12px` |
| Padding | `4px 12px 6px 12px` |
| Layout | `display: inline-flex; align-items: baseline; gap: 6px` |

Inside the button:
- **`USD ⌄`** — currency label + chevron-down (10 px). 11 px / 700, `rgba(255,255,255,0.78)`, letter-spacing `0.04em`. Both label and chevron are part of the same tap target, but conceptually the *currency picker* opens on tap.
- **`18.00`** — 26 px / 700, white, `font-variant-numeric: tabular-nums`, letter-spacing `-0.02em`, `text-shadow: 0 1px 3px rgba(0,0,0,0.35)`.
- **Blinking caret** — `2 × 22 px` white bar, `border-radius: 1px`, animated `copay-caret 1s steps(2) infinite` (`0–49% opacity 1, 50–100% opacity 0`).

Tapping anywhere on the amount button opens the numeric editor (system numeric keyboard or in-sheet keypad — pick what fits the platform conventions). Tapping the `USD ⌄` substring opens the currency picker.

Below the amount:
- An **arrow line** — full-width row: 2 px white line (85% opacity) + 18 px `chevron-forward` (95% opacity). RTL flips the chevron to `chevron-back`.
- **Swap chip** — small pill, `padding: 2px 8px`, `bg rgba(255,255,255,0.18)`, `border: 1px solid rgba(255,255,255,0.35)`, 10 px / 700 white text, label `"SWAP"`, prefixed with an 11 px `swap-horizontal-outline`. Tap swaps the from / to members (used when you're recording someone *else's* payment, or correcting direction).

#### 3. To column (right) — `FlowAvatar`

Mirror of the From column. Label `"TO"`. Same style.

## Method tiles

Below the hero, padding `20px 16px 0 16px`.

- Eyebrow label: `"Method"` — 9 px / 700, `colors.text.tertiary`, uppercase, letter-spacing `0.06em` (see `.text-eyebrow`).
- Four square icon-only tiles, 10 px gap between them.

| Property | Default | Selected |
|--|--|--|
| Size | `56 × 56 px` | same |
| Radius | `14 px` | same |
| Background | `#FFFFFF` | `colors.primary-extra-light` (`#DBEAFE`) |
| Border | `1px solid colors.border.card` | `1px solid colors.primary-light` |
| Shadow | `shadow-sm` | none |
| Icon | 22 px, `colors.gray-700` | 22 px, `colors.primary-dark` |

Methods (in this order):
1. **Cash** — `cash-outline`
2. **Bank transfer** — `card-outline` *(default selected in the design)*
3. **PayPal** — `logo-paypal`
4. **Other** — `ellipsis-horizontal`

Single-select. Tapping a tile updates the settlement's `method`. `aria-label` carries the human-readable label.

> If the user needs more methods (e.g. Venmo, credit card), expand on tap of the **Other** tile into a full list.

## Bottom dock

Absolutely positioned at the bottom of the sheet container.

- `padding: 10px 16px 22px 16px`
- `background: rgba(255,255,255,0.92)` with `backdrop-filter: saturate(180%) blur(12px)` (Safari prefix included)
- `border-top: 1px solid colors.border.soft`

### Date chip (centered, 8 px below the top edge)

- 5 × 12 px padding pill, `bg #FFFFFF`, `border: 1px solid colors.border.card`, `shadow-sm`, radius `9999`
- Content: 13 px `calendar-outline` (gray-600) + 12 px / 600 text `"Today, Aug 14"` (text-secondary) + 11 px `chevron-down` (gray-500)
- Tap opens the native date picker

### Primary button

| Property | Value |
|--|--|
| Width | `100%` |
| Padding | `14px 20px` |
| Background | `colors.primary` (`#60A5FA`) when valid; `colors.gray-200` when disabled |
| Color | `#FFFFFF` / `colors.gray-400` disabled |
| Border radius | `radius-xl` (16 px) |
| Font | 16 px / 700 |
| Shadow | `shadow-fab` when enabled |
| Icon | 20 px `checkmark-circle` prefix |
| Label | `"Record payment · {currency} {amount}"` — e.g. `"Record payment · USD 18.00"` |

Tap → call the existing `createSettlement` service with `{ fromUserId, toUserId, amount, currency, method, date }` → dismiss the sheet → show a "Payment recorded" toast.

## Interactions

| Trigger | What happens |
|--|--|
| Tap on scrim | Dismiss the sheet |
| Tap **Cancel** | Dismiss |
| Swipe down on handle | Dismiss (existing modal gesture handler) |
| Tap **Save** (header) | Equivalent to **Record payment**, same call |
| Tap on amount | Open numeric editor |
| Tap **USD ⌄** | Open currency picker |
| Tap **SWAP** | Swap `from` / `to` members |
| Tap a method tile | Set method, update selected state |
| Tap date chip | Open date picker |
| Tap an avatar | (Optional) open a member picker for that side |
| Tap **Record payment** | Submit, dismiss, toast |

## State

Pure props: accept `defaults` (with `fromUserId`, `toUserId`, `amount`, `currency`, `method`, `date`, and the group context `groupId` + `groupName`). Pre-fill `amount` with the exact balance owed when known. All mutations go through the existing settlements service.

## Copy (i18n keys, lift from `en.json`)

| Used here | Key |
|--|--|
| "SETTLE UP" header label | `settlements.settleUp` (uppercased in render) |
| "Cancel" | `common.cancel` |
| "Save" | `common.save` |
| "New payment" chip | `settlements.newPayment` |
| "FROM" / "TO" labels | reuse `settlements.flow.paid` / `settlements.flow.received` or add `settlements.flow.from` / `settlements.flow.to` |
| "SWAP" chip | `common.swap` |
| Method tile aria-labels | existing `settlements.method.cash`, `bankTransfer`, `paypal`, `other` |
| Date chip | existing date formatter (`formatDate`) |
| "Record payment · USD 18.00" | `settlements.recordPayment` with `{{currencyAndAmount}}` |

## RTL

The codebase's `useRtlLayout()` handles direction. When porting:

- The from → to flow mirrors: in RTL, the **TO** column moves to the left, **FROM** to the right, arrow flips to `chevron-back`.
- The method tiles stay in source order; they're symmetric.
- The date chip's chevron flips (`chevron-down` is direction-agnostic).
- The header's Cancel / Save swap sides.

## Design tokens used

```ts
// Colors
text.primary       #111827
text.secondary     #6B7280
text.tertiary      #9CA3AF
gray400            #9CA3AF
gray500            #6B7280
gray600            #4B5563
gray700            #374151
gray200            #E5E7EB
primary            #60A5FA
primary-dark       #3B82F6
primary-light      #93C5FD
primary-extra-light #DBEAFE
success            #10B981
success-text       #047857
success-border     #A7F3D0
slate900           #0F172A
border-card        #E2E8F0
border-soft        #F1F5F9
bg-secondary       #F8FAFC

// Radii
12, 14, 16, 24 (sheet top), 9999 (chips, pills)

// Spacing
2, 4, 6, 8, 10, 12, 14, 16, 22

// Shadows
sheet:   0 -8px 24px rgba(0,0,0,0.18)
shadow-sm
shadow-fab

// Type sizes
9 px   (FROM / TO labels)
10 px  (SWAP label, currency chevron)
11 px  (currency code, "New payment" chip, group name)
12 px  (SETTLE UP header, date chip text)
13 px  (FlowAvatar names, method icons via container)
15 px  (Cancel / Save header buttons)
16 px  (primary button)
22 px  (method icons)
26 px  (hero amount)
```

## Files

```
design_handoff_settle/
├── README.md                ← this file
├── colors_and_type.css      ← every design token as CSS vars
├── settle-popup.html        ← THE design (boot file)
├── components.jsx           ← shared primitives (Icon, MemberAvatar, IconButton)
└── ios-frame.jsx            ← iPhone bezel for context
```

Open `settle-popup.html` in a browser to see the design rendered. The sheet shows over a faded group screen to demonstrate context.

## Related handoffs

- `design_handoff_settlement_detail/` — the sibling popup for viewing an existing settlement. Same chrome, identical kebab-menu pattern. Build the shared bottom-sheet wrapper once and reuse for both.
- `design_handoff_expense_detail/` — same chrome for expenses.
- `design_handoff_group_detail/` — the screen this popup opens FROM.
