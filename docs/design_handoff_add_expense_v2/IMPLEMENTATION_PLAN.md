# Implementation Plan — Add / Edit Expense v2

A step-by-step plan for porting the v2 design (see [README.md](README.md)) into the CoPay mobile codebase.

**Target files:**
- Replace: [cost-share-app/apps/mobile/screens/expenses/AddExpenseScreen.tsx](../../cost-share-app/apps/mobile/screens/expenses/AddExpenseScreen.tsx)
- Replace: [cost-share-app/apps/mobile/screens/expenses/EditExpenseScreen.tsx](../../cost-share-app/apps/mobile/screens/expenses/EditExpenseScreen.tsx)
- Update tests: [cost-share-app/apps/mobile/__tests__/screens/expenses/AddExpenseScreen.test.tsx](../../cost-share-app/apps/mobile/__tests__/screens/expenses/AddExpenseScreen.test.tsx)

**Reference (do NOT copy verbatim — recreate using native patterns):**
- HTML prototype: [add-expense.html](add-expense.html)
- Design tokens: [colors_and_type.css](colors_and_type.css)
- UI kit primitives: [components.jsx](components.jsx)
- Existing screen for behavior parity: [_reference/AddExpenseScreen.original.jsx](_reference/AddExpenseScreen.original.jsx)

---

## Phase 0 — Pre-flight

- [ ] Re-read [README.md](README.md) end-to-end.
- [ ] Open `add-expense.html` in a browser; click through both screens.
- [ ] Read the current `AddExpenseScreen.tsx` (515 lines) to understand:
  - Form state shape, validation, and submission flow.
  - How it calls the create / update mutation.
  - Existing currency / date / receipt pickers (these are reused).
  - Navigation params (group, edit-mode expense, etc.).
- [ ] Confirm existing primitives in `cost-share-app/apps/mobile/components/`:
  - `MemberAvatar` — verify it already supports `avatarUrl` + initials fallback.
  - `Icon` / Ionicons wrapper — confirm name.
- [ ] Map every CSS token in `colors_and_type.css` to its existing equivalent in the app's NativeWind / tailwind config. If any are missing, plan token additions first.

---

## Phase 1 — Foundation

### 1.1 Design tokens
- [ ] Ensure every token used in the spec (see README "Design tokens" section) exists in the app's theme. Add missing ones to `tailwind.config.{js,ts}` or the equivalent theme file.
- [ ] Verify shadows `--shadow-sm` and the custom sheet shadow `0 -8px 24px rgba(0,0,0,0.20)` can be expressed (RN `shadow*` props or `elevation` on Android).

### 1.2 New shared primitives (extract once, reuse on both screens)
Create these under `cost-share-app/apps/mobile/components/`:

- [ ] **`GrabberPill.tsx`** — 40×4, `gray-200`, full radius. Used by both sheets.
- [ ] **`CurrencyPill.tsx`** — pill button: bg `primary-extra-light`, text `primary-dark`, label + `chevron-down` 12px. Props: `currency`, `onPress`.
- [ ] **`QuietIconPill.tsx`** — active vs empty variants. Props: `icon`, `label`, `active`, `onPress`. Used for Date + Receipt.
- [ ] **`NumericKeypad.tsx`** — 4×3 grid, white keys on `bg-tertiary`, erase key uses `chevron-back` icon. Props: `onKeyPress(char | 'backspace')`. Pure presentational.
- [ ] **`StackedAvatarGroup.tsx`** — up to 4 avatars, 22×22, 2px white border, negative margins as specified. Props: `members`, `max=4`. Uses real pic when available, falls back to `MemberAvatar` initials.
- [ ] **`SegmentedControl.tsx`** — 3 segments: Equal / Percent / Exact. Props: `value`, `onChange`, `options`. (Three options ONLY — do not add Shares.)
- [ ] **`CombinedPayerSplitButton.tsx`** — full-width card with left (Payer) + divider + right (Split summary) + trailing chevron. Props: `payer`, `splitMembers`, `splitMode`, `onPress`. One tap target.

Each primitive should be small, prop-driven, and styled with the app's existing styling system. Write a focused unit test per primitive.

---

## Phase 2 — Screen 1: Add expense

### 2.1 Scaffold the screen
- [ ] Replace `AddExpenseScreen.tsx` with the new layout. Keep navigation params and the create-expense mutation wiring intact (lift these from the original).
- [ ] Render as a bottom sheet (top-radius 20, white bg). Use the app's existing sheet/modal pattern (check what `EditExpenseScreen.tsx` or other screens use). If a bottom-sheet library is already in `package.json`, reuse it.

### 2.2 Header
- [ ] Render: `Cancel` (left) · `NEW EXPENSE` title (center) · `Save` (right).
- [ ] `Cancel` dismisses without saving (also handle system back gesture).
- [ ] `Save` enabled iff `description.trim().length > 0 && parseFloat(amount) > 0`. Disabled style: `gray-400`. Enabled: `primary-dark`.
- [ ] No bottom Save button anywhere in the layout.

### 2.3 Hero area (top → bottom)
- [ ] **Currency pill** centered above amount. Opens existing currency picker.
- [ ] **Amount** — 64px / 700, tabular-nums, placeholder `0.00` in `gray-300`. Mark the underlying input `readOnly` / `inputMode="none"` so the system keyboard does NOT appear. Driven only by the keypad.
- [ ] **Description** — borderless single-line input, 17/500, centered, with a 56×2 `primary-light` pill underline. Placeholder `What was this for?`. This is the **only** field that uses the system keyboard.
- [ ] **CombinedPayerSplitButton** — full width, opens Screen 2.
- [ ] **Quiet meta row** — only **Date** + **Receipt** pills (NO Notes). Camera icon for Receipt (not receipt-outline). Pushed to bottom of hero with `marginTop: auto`.

### 2.4 Keypad
- [ ] Mount `NumericKeypad` permanently docked at sheet bottom.
- [ ] Handler appends digits to `amount`, enforces: one `.` max, max 2 decimals, no leading double-zero. Backspace removes last char.

### 2.5 Wire to existing flows (do not re-invent)
- [ ] Date pill → existing date picker.
- [ ] Receipt pill → existing camera / photo library flow.
- [ ] Currency pill → existing currency picker.
- [ ] Save → existing create-expense mutation. Dismiss on success.

---

## Phase 3 — Screen 2: Edit payer & split

### 3.1 Scaffold
- [ ] New component `EditPayerSplitSheet.tsx` (or co-locate inside `AddExpenseScreen.tsx` if small). Bottom sheet with scrim, `max-height: 75%`, top radius 20.
- [ ] Tap on scrim → cancel (close without committing).
- [ ] `Done` button (top-right) → commit changes back to parent state, then close.

### 3.2 Section 1 — Paid by
- [ ] Horizontal scroll of member cells. One selected at a time. Selected style per spec.

### 3.3 Section 2 — Split between
- [ ] Eyebrow row with right-aligned meta caption (`4 of 4 · USD 21.05 ea.`).
- [ ] `SegmentedControl` with Equal / Percent / Exact (NO Shares). Default Equal.
- [ ] Member list:
  - Equal: read-only per-head amount.
  - Percent: per-row percent input, validate sum = 100%.
  - Exact: per-row amount input, validate sum = total.
- [ ] Reuse the percent/exact validation logic from the original `AddExpenseScreen` rather than rewriting.

### 3.4 Commit back to Screen 1
- [ ] On `Done`, write `payerId`, `splitMode`, and `splitMembers` back to parent state.
- [ ] CombinedPayerSplitButton on Screen 1 updates accordingly (avatars, "Equally" / "Percent" / "Exact" label).

---

## Phase 4 — Edit mode

- [ ] Re-use the same screen for edit mode. Detect via navigation param (matches current behavior).
- [ ] Header title becomes `EDIT EXPENSE`.
- [ ] Prefill all fields from the loaded expense.
- [ ] Render the existing Delete row at the bottom of the scroll area (only in edit mode, never in create).
- [ ] Confirm `EditExpenseScreen.tsx` either delegates to the same component or is updated in parallel.

---

## Phase 5 — State shape

Local screen state:

```ts
{
  amount: string,            // raw input; parse for math
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

---

## Phase 6 — Tests

- [ ] Update `AddExpenseScreen.test.tsx`:
  - Keypad: digits, single `.`, max 2 decimals, backspace.
  - Save disabled until description AND amount > 0.
  - System keyboard NOT triggered on amount (assert `inputMode` / `editable={false}` or the equivalent).
  - Combined button opens the editor sheet; `Done` commits; scrim/outside-tap cancels.
  - Equal-mode per-head math.
  - Date defaults to today; Receipt pill toggles active style when URI is set.
- [ ] Snapshot/unit tests for each new primitive.
- [ ] Edit-mode test: prefill + Delete row visible only in edit mode.

---

## Phase 7 — Manual QA checklist

Run on iOS + Android (or both Expo previews):

- [ ] Sheet animates in/out smoothly; grabber visible.
- [ ] System keyboard never appears on amount field.
- [ ] System keyboard does appear on description; sheet does not jump awkwardly when it opens.
- [ ] Tapping combined button opens editor; scrim darkens Screen 1.
- [ ] Tapping scrim cancels; `Done` commits.
- [ ] Save button color/state matches enabled/disabled logic.
- [ ] Real profile pics render where available; initials fallback otherwise — on Screen 1 (combined button) AND Screen 2 (paid-by cells + member list).
- [ ] Receipt pill uses **camera** icon (not receipt-outline).
- [ ] No Notes pill anywhere.
- [ ] Segmented control has exactly three options (no Shares).
- [ ] No "Save" button at the bottom of the keypad.
- [ ] Edit mode: title says `EDIT EXPENSE`, fields prefilled, Delete row present.
- [ ] Create mode: no Delete row.

---

## Out of scope (defer / reuse existing)

- Currency picker UI.
- Date picker UI.
- Camera / photo library UI.
- Delete-confirmation dialog (use existing destructive pattern).
- The Group screen that sits behind the sheet.

---

## Risks / open questions

- **Bottom-sheet library:** confirm what the app already uses (`@gorhom/bottom-sheet`?). The editor-over-Screen-1 stack needs nested sheets — check that the chosen library supports this.
- **`inputMode="none"` on RN:** React Native's `TextInput` doesn't expose `inputMode` the same as web. Use `showSoftInputOnFocus={false}` (Android) and `caretHidden`/`editable={false}` workarounds (iOS) — verify the right combo before building.
- **Token coverage:** any missing tokens in tailwind/NativeWind config must land in Phase 1.1 before screen work begins.
- **Test environment:** if Jest snapshots cover the old layout, they will fail wholesale — plan to delete and regenerate rather than patch.
