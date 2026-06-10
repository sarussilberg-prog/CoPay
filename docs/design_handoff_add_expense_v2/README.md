# Handoff: Add / Edit Expense Screen — CoPay Mobile

## Overview

A redesign of the **create / edit expense** screen in the CoPay mobile app (a Splitwise-style cost‑share app). The current screen (`_reference/AddExpenseScreen.original.jsx`) is a vertical stack of form rows — description → amount → category → payer → split. This redesign re‑arranges the same fields around a single goal: **enter amount + description as fast as possible**, with smart defaults that handle the rest.

## About the design files

The files in this bundle are **design references created in HTML** — high‑fidelity prototypes that show intended look, layout, and behavior. They are **not production code to copy directly.** Your task is to **recreate these designs in the CoPay codebase's existing environment** (React Native + NativeWind, based on the original `AddExpenseScreen.jsx` in `_reference/`), using its established patterns, component primitives, and design tokens.

## Fidelity

**High‑fidelity.** Final colors, type scale, spacing, and radii are all sourced from the CoPay design system (`colors_and_type.css`, included). Pixel‑perfect recreation is the goal.

## Files

| File | Purpose |
|---|---|
| `README.md` | This document. |
| `add-expense.html` | The prototype. Open in a browser — shows both screens side‑by‑side. |
| `colors_and_type.css` | CoPay design tokens — colors, spacing, radii, shadows, typography. The source of truth. |
| `components.jsx` | The mobile UI kit primitives used by the prototype (`Icon`, `MemberAvatar`, etc.). Match these names/signatures in your implementation. |
| `ios-frame.jsx` | iOS device bezel used only to frame the prototype. Not part of the screen. |
| `_reference/AddExpenseScreen.original.jsx` | The **existing** AddExpenseScreen in the codebase. The new design replaces this. |

---

## Screens

There are **two screens** to build:

1. **Add expense** — the main sheet for entering an amount + description.
2. **Edit payer & split** — a bottom sheet that opens when the user taps the combined Payer + Split button on screen 1.

---

## Screen 1 — Add expense

### Purpose

Creating or editing an expense in a group. User has already navigated in from a Group detail screen. Happy path: type amount → type description → press **Save**. Everything else has a sensible default.

### Frame

- Presented as a **modal sheet** that slides up from the bottom over a faded Group screen.
- Top of sheet has a small **grabber pill** (40×4, `--gray-200`, radius 9999) centered above the header.
- Background of the sheet body is `#fff`.
- Sheet corners: top‑left and top‑right `20px`.

### Layout (top → bottom)

```
┌─────────────────────────────────────────┐
│              ▬▬▬▬                        │  grabber
├─────────────────────────────────────────┤
│  Cancel        NEW EXPENSE       Save   │  header
├─────────────────────────────────────────┤
│                                          │
│              ╭─ USD ▾ ─╮                 │  currency pill
│                                          │
│              84.20                       │  amount (giant)
│                                          │
│           Sushi on Friday                │  description
│           ───────                        │  underline
│                                          │
│   ┌────────────┬─────────────────────┐   │
│   │  👤 You   ┊ ▣▣▣▣ Split           │   │  combined Payer + Split button
│   │  Paid by  ┊       Equally    ›   │   │
│   └────────────┴─────────────────────┘   │
│                                          │
│            ▢ Today  📷 Receipt           │  quiet meta row
├─────────────────────────────────────────┤
│   1     2     3                          │
│   4     5     6                          │  numeric keypad
│   7     8     9                          │
│   .     0     ⌫                          │
└─────────────────────────────────────────┘
```

### Components

#### 1. Sheet header

- Padding `4px 8px 8px 8px`; bottom border `1px solid var(--border-soft)`. Background `#fff`.
- Layout: `flex`, `justify-content: space-between`, `align-items: center`.
- **Left — Cancel**: transparent button, padding `6px 10px`, `15px / 500`, color `var(--gray-600)`.
- **Center — Title**: text `NEW EXPENSE` (uppercase via `text-transform`), `12px / 600`, `letter-spacing: 0.06em`, color `var(--text-secondary)`.
- **Right — Save** (primary action):
  - Transparent button, padding `6px 10px`, `15px / 700`.
  - Enabled color: `var(--primary-dark)` (`#3B82F6`). Disabled color: `var(--gray-400)`.
  - **Enabled condition**: description non‑empty AND amount > 0.

There is **no bottom Save button.** The header **Save** is the only commit action.

#### 2. Currency pill

- Centered above the amount.
- Padding `5px 12px`; `border-radius: 9999`.
- Background `var(--primary-extra-light)` (`#DBEAFE`); text `var(--primary-dark)` (`#3B82F6`).
- `font-size: 12px`, `font-weight: 700`, `letter-spacing: 0.04em`.
- Layout: inline‑flex, `gap: 4`, label + 12px `chevron-down` Ionicon in the same color.
- Tap target: opens a currency picker (out of scope — existing pattern).

#### 3. Amount

- Centered, single line.
- `font-size: 64px`, `font-weight: 700`, `letter-spacing: -0.03em`, `line-height: 1`.
- Color `var(--text-primary)` when > 0, `var(--gray-300)` for placeholder.
- `font-variant-numeric: tabular-nums`.
- Placeholder when empty: `0.00`.
- Input rules: numeric only, allows one `.`, max 2 decimal places.
- Driven by the numeric keypad below — **suppress the system keyboard** on this field (use `readOnly` or `inputMode="none"`).

#### 4. Description

- Centered, borderless one‑line input directly below the amount.
- `font-size: 17px`, `font-weight: 500`, color `var(--text-primary)`.
- Padding `12px 0 4px 0` between amount and description; `2px` underline below.
- Underline: 56×2 pill, `border-radius: 9999`, background `var(--primary-light)` (`#93C5FD`), centered.
- Placeholder: `What was this for?` in `var(--gray-300)`.
- Uses the **system keyboard** (the only field that does).

#### 5. Combined Payer + Split button

The centerpiece — **one tap target** that opens the editor sheet (Screen 2).

- Full‑width, padding `12px 14px`, `border-radius: 14px`, `1px solid var(--border-card)`, `box-shadow: var(--shadow-sm)`, background `#fff`.
- Margin‑top from underline: `22px`.
- Inside, two halves separated by a hairline divider.

**Left half — Payer:**
- Flex row, `gap: 10`, `align-items: center`.
- Avatar: `MemberAvatar` size `sm` for the current payer. **Use the member's profile picture if available; fall back to the initials chip otherwise.**
- Stacked text:
  - Eyebrow `Paid by` — uppercase, `12px / 600 / 0.06em`, `var(--slate-400)`.
  - Value `You` (or member name) — `14px / 700`, `var(--text-primary)`.

**Divider:** 1px wide × 32px tall, `var(--border-soft)`.

**Right half — Split:**
- Flex row, `gap: 10`, `align-items: center`.
- **Stacked avatar group** — up to 4 visible avatars of the members included in the split. Each:
  - 22×22, circular, `2px solid #fff` border (so they overlap cleanly), `font-size: 9` for initials fallback.
  - Negative margin between: first `margin-left: -6px`; subsequent ones `margin-left: -10px`.
  - **Show real profile pic when available; initials fallback otherwise.**
- Stacked text:
  - Eyebrow `Split`.
  - Value `Equally` — `14px / 700`, `var(--text-primary)`.
  - **Intentionally short.** Do **not** spell out "4 · USD 21.05 ea." — the avatars carry the count visually, and the editor sheet has the math.
- Trailing chevron: `chevron-forward` Ionicon, 14px, `var(--gray-400)`.

**Behavior:**
- The whole card is one tap target. Tap → open the **Screen 2 editor sheet**.
- The divider is decorative. One ripple / press state on the whole card.

#### 6. Quiet meta row (Date · Receipt)

Docked just above the keypad, visually demoted.

- Centered flex row, `gap: 8`, `padding-top: 16px`, `margin-bottom: 8px`.
- Positioned with `margin-top: auto` so it pushes to the bottom of the hero area.

Each pill (`QuietIcon`):
- Padding `5px 10px`, `border-radius: 9999`. Inline‑flex, `gap: 5`, 13px icon + `11px / 500` label.
- **Active** (value set): background `var(--gray-50)`, `1px solid var(--border-card)`, text `var(--text-secondary)`, icon `var(--gray-600)`.
- **Empty** (no value yet): transparent background, `1px solid transparent`, text `var(--gray-400)`, icon `var(--gray-400)`.

**Two pills only — no Notes pill.** Notes are not a feature.

- **Date** — icon `calendar-outline`. Label: `Today` if today, otherwise the formatted date (`Aug 14`). Tap → date picker. Defaults to **today**, so renders in active style by default.
- **Receipt** — icon `camera-outline` (camera, **not** receipt-outline). Label: `Receipt` when none attached; filename when one is. Tap → camera / photo library. Active style when a receipt is attached.

#### 7. Numeric keypad

Permanent at the bottom of the sheet.

- Container: background `var(--bg-tertiary)` (`#F3F4F6`), padding `10px 8px 22px 8px`, `border-top: 1px solid var(--border-soft)`.
- Grid: `grid-template-columns: repeat(3, 1fr)`, `gap: 6px`.
- Rows: `[1 2 3] [4 5 6] [7 8 9] [. 0 ⌫]`.
- Each key:
  - Padding `14px 0`, `border-radius: 12px`, background `#fff`, `1px solid var(--border-card)`, `box-shadow: var(--shadow-sm)`.
  - `font-size: 22`, `font-weight: 600`, `font-variant-numeric: tabular-nums`, color `var(--text-primary)`.
  - Tap: append the character to the amount, respecting format rules (one `.`, max 2 decimals).
- Erase key (`⌫`): same dimensions, 20px `chevron-back` Ionicon in `var(--gray-500)` instead of a glyph. Tap removes last character.

**No primary "Save" button below the keypad.** Save lives only in the header.

---

## Screen 2 — Edit payer & split

Opens when the user taps the combined Payer + Split button on Screen 1.

### Frame

- Bottom sheet over a scrim, presented above Screen 1.
- Sheet background `#fff`, `border-radius: 20px 20px 0 0`, `box-shadow: 0 -8px 24px rgba(0,0,0,0.20)`.
- `max-height: 75%` of the viewport; scrolls internally if the member list is long.
- Padding `8px 16px 22px 16px`.
- Scrim behind the sheet: `rgba(15, 23, 42, 0.45)`. Tap the scrim → cancel.

### Header

- Grabber pill at top (same as Screen 1).
- Title row: `flex`, `space-between`, `align-items: center`, `margin-bottom: 14px`.
  - **Left** — `Who & how`, `15px / 700`, `var(--text-primary)`.
  - **Right** — `Done` button. Transparent, padding `4px 8px`, `14px / 700`, `var(--primary-dark)`. Commits changes and dismisses the editor.

### Section 1 — Paid by

- Eyebrow `PAID BY` — `12px / 600 / 0.06em`, `var(--slate-400)`, `margin-bottom: 8px`.
- Horizontal scrolling avatar picker (`overflow-x: auto`, no scrollbar visible).
- Each member cell:
  - `min-width: 72px`, padding `8px 10px 6px 10px`, `border-radius: 12px`, `1px solid var(--border-card)`, background `#fff`.
  - Inside: `MemberAvatar` size `sm` (real pic if available, initials fallback) + name in `11px / 500`, `var(--text-secondary)`. Label current user as `You`.
  - **Selected**: background `var(--primary-extra-light)`, border `var(--primary-light)`, label `var(--primary-dark) / 700`.
- Tapping a member sets them as the payer. Only one selected at a time.
- `margin-bottom: 16px` below the section.

### Section 2 — Split between

Eyebrow + meta on one row:
- Left: `SPLIT BETWEEN` eyebrow.
- Right (right‑aligned): meta caption like `4 of 4 · USD 21.05 ea.` — `11px / 600`, `var(--text-secondary)`, `font-variant-numeric: tabular-nums`.

**Segmented control — Equal / Percent / Exact:**

> **Important: three options only. No "Shares" mode.**

- Container: `background: var(--gray-100)`, `border-radius: 10px`, padding `3px`, flex with `gap: 2`.
- Each segment: `flex: 1`, padding `7px 0`, `border-radius: 8px`, `font-size: 12`.
- **Selected**: `background: #fff`, `font-weight: 700`, `var(--text-primary)`, `box-shadow: 0 1px 2px rgba(0,0,0,0.06)`.
- **Unselected**: transparent, `font-weight: 500`, `var(--text-secondary)`.
- Default = `Equal`. `margin-bottom: 10px`.

**Member list:**

- Container: `background: #fff`, `border-radius: 12`, `1px solid var(--border-card)`, `overflow: hidden`.
- Each row: padding `10px 12px`, `gap: 12`, flex, `align-items: center`. Internal dividers `1px solid var(--border-soft)`.
- Row contents (left → right):
  1. **Checkbox** — 20×20, `border-radius: 6`. Checked: `1.5px solid var(--primary)`, filled `var(--primary)`, white `checkmark-circle` icon (12px). Unchecked: white background, `1.5px solid var(--border-strong)`.
  2. **MemberAvatar** size `xs` (real pic if available, initials fallback).
  3. **Member name** — `flex: 1`, `13px / 600`, `var(--text-primary)`. `You` for current user.
  4. **Per‑head amount** — `13px / 700`, `var(--text-secondary)`, `font-variant-numeric: tabular-nums`. Format `USD 21.05`.

- **Equal mode**: all checked members share equally, amounts read‑only.
- **Percent mode**: each row exposes a percentage input (right‑aligned, must total 100%).
- **Exact mode**: each row exposes an amount input (must sum to the total).

---

## Avatars — global rule

> **Use the member's profile picture wherever an avatar appears.** If the member has no profile pic on file, fall back to the existing `MemberAvatar` initials chip (initials on a colored circle).

The existing `MemberAvatar` component in `components.jsx` already supports this — pass `avatarUrl` when present; it handles the fallback automatically. Apply this rule everywhere an avatar shows on either screen.

---

## Interactions & behavior

### Open
- Sheet slides up from the bottom.
- Cancel and the system back gesture both dismiss without saving.

### Amount entry
- The numeric keypad is the only input for the amount; the system keyboard is suppressed for that field.
- Description uses the system keyboard.

### Tap combined button → editor sheet
- Animate the editor sheet in from the bottom over Screen 1.
- Screen 1 stays in place but darkens behind a scrim.
- `Done` (top‑right of editor sheet) commits changes and dismisses the editor; the combined button on Screen 1 updates to reflect the new payer + split summary.
- Tapping outside the editor (on the scrim) cancels.

### Quiet meta row
- Tap Date → open a native date picker (out of scope; use existing pattern).
- Tap Receipt → open camera / photo library (existing pattern). Once attached, the pill switches to the active style. Long‑press on an active pill could allow removing or replacing.

### Save (header)
- Disabled while `description` is empty or `amount <= 0`.
- On tap, commits the expense and dismisses the sheet.

### Edit mode
- When opened in edit mode (rather than create), header title becomes `EDIT EXPENSE`, all fields are prefilled, and the existing Delete‑expense destructive pattern applies (e.g. a Delete row at the bottom of the scroll area). The destructive action is **not** present in the create flow.

---

## State management

Local state for the screen:

```ts
{
  amount: string,            // raw input, parse to number for math
  description: string,
  currency: 'USD' | 'EUR' | ...,
  payerId: string,
  splitMode: 'equal' | 'percent' | 'exact',
  splitMembers: Array<{ memberId: string, share?: number, amount?: number }>,
  date: Date,                // defaults to today
  receiptUri: string | null,
}
```

Derived:
- `perPerson = amount / splitMembers.length` when `splitMode === 'equal'`.
- `canSave = description.trim().length > 0 && parseFloat(amount) > 0`.

The editor sheet is its own modal state; commits via `Done` write back into the parent state.

---

## Design tokens (from `colors_and_type.css`)

### Colors

| Token | Hex | Used for |
|---|---|---|
| `--primary` | `#60A5FA` | Editor checkbox fill |
| `--primary-dark` | `#3B82F6` | Header **Save**, **Done**, currency pill text & chevron |
| `--primary-light` | `#93C5FD` | Description underline, selected payer cell border |
| `--primary-extra-light` | `#DBEAFE` | Currency pill bg, selected payer cell bg |
| `--text-primary` | `#111827` | Amount, description, primary labels, keypad digits |
| `--text-secondary` | `#6B7280` | Header title, Cancel label, meta amount, secondary text |
| `--text-tertiary` | `#9CA3AF` | Empty‑state pill text, chevrons |
| `--slate-400` | `#94A3B8` | Eyebrow labels |
| `--gray-50` | `#F9FAFB` | Active quiet pill background |
| `--gray-100` | `#F3F4F6` | Segmented control track background |
| `--gray-200` | `#E5E7EB` | Grabber pill |
| `--gray-300` | `#D1D5DB` | Placeholder amount, input border default |
| `--gray-400` | `#9CA3AF` | Disabled save label, empty quiet pill text/icon |
| `--gray-500` | `#6B7280` | Erase key icon |
| `--gray-600` | `#4B5563` | Cancel label, active quiet pill icon |
| `--border-card` | `#E2E8F0` | Combined button border, keypad keys, quiet pills, member list, picker cells |
| `--border-soft` | `#F1F5F9` | Header bottom, divider in combined button, keypad top, dividers between member rows |
| `--bg-tertiary` | `#F3F4F6` | Keypad track background |

### Radii

| Value | Used for |
|---|---|
| `12px` (`--radius-lg`) | Keypad keys, picker cells, member list outer |
| `14px` | Combined button |
| `20px` (`--radius-2xl`) | Sheet top corners |
| `9999px` (`--radius-full`) | Currency pill, quiet pills, grabber, avatars |

### Shadows

| Token | Used for |
|---|---|
| `--shadow-sm` | Combined button, keypad keys |
| Custom `0 -8px 24px rgba(0,0,0,0.20)` | Sheet elevation over the underlying screen |

### Typography

- Family: `--font-sans` (Inter on web; San Francisco / Roboto on device).
- Amount: `64px / 700 / -0.03em` letter‑spacing, tabular‑nums.
- Description: `17px / 500`.
- Combined button value: `14px / 700`.
- Eyebrow: `12px / 600 / 0.06em` uppercase, `var(--slate-400)`.
- Header title: `12px / 600 / 0.06em` uppercase, `var(--text-secondary)`.
- Cancel / Save: `15px / 500` and `15px / 700`.
- Quiet pill: `11px / 500`.
- Keypad digit: `22px / 600`, tabular‑nums.
- Editor sheet title: `15px / 700`.
- Segmented control: `12px / 500` (700 when selected).
- Member row: `13px / 600` name, `13px / 700` amount.

---

## Icons

All icons are **Ionicons** (the existing icon set in the CoPay codebase, referenced via the `Icon` component in `components.jsx`).

| Where | Icon | Size |
|---|---|---|
| Currency pill chevron | `chevron-down` | 12 |
| Combined button trailing | `chevron-forward` | 14 |
| Quiet meta — Date | `calendar-outline` | 13 |
| Quiet meta — Receipt | `camera-outline` (NOT `receipt-outline`) | 13 |
| Keypad erase | `chevron-back` | 20 |
| Editor sheet — checked checkbox | `checkmark-circle` | 12 |

> The receipt pill uses a **camera** icon, not a receipt icon — this was a specific design decision based on the action (take/choose a photo) being more direct than the noun.

---

## Out of scope

- The Group screen that sits behind the sheet.
- Currency picker, date picker, photo picker, camera UI — use existing patterns.
- Edit‑mode delete confirmation dialog — assume the existing destructive‑action pattern.
- Percent and Exact split modes' input behavior — the existing AddExpenseScreen handles this; reuse that logic.
