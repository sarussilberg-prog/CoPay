# Handoff: Kupay · Group Detail Screen

## Overview

This is the **group detail screen** for the Kupay cost-sharing app — the screen a user sees after tapping a group on the list. It shows the group's cover image, the user's balance in this group, a quick "Settle up" action, a "Note" affordance, and the activity feed (expenses + chat messages). A floating action pair lets the user add an expense or send a message.

The design was iterated through several rounds and the final layout was the user's pick from variant sets (cover-card hero, M1 middle strip, R1 expense rows, F2 note pill in footer).

## About the design files

The files in `prototype/` are **design references created in HTML/JSX-via-Babel** — they're a working clickable prototype that demonstrates intended look and behavior. They are NOT production code to copy directly.

Your task is to **recreate this design in the target codebase's existing environment** (the Kupay app uses React Native + Expo + NativeWind — `cost-share-app/apps/mobile/`). Reuse the codebase's existing components, theme tokens, i18n strings, and patterns. Do not introduce new fonts, libraries, or design tokens that aren't already in the project.

If the target file is `cost-share-app/apps/mobile/screens/groups/GroupDetailScreen.tsx`, this handoff replaces / restyles the current hero + balance banner with a single composite **summary card**.

## Fidelity

**High-fidelity.** Every color is a `theme/colors.ts` value (or a Tailwind / NativeWind class that maps to it). Spacing, radii, shadows match `tailwind.config.js`. Typography matches `theme/typography.ts`. You should be able to lift the values 1:1.

## Source-code anchors

When implementing in `cost-share-app/apps/mobile/`:

| Concern | Lift from |
|--|--|
| Colors | `theme/colors.ts` + `tailwind.config.js` |
| Type scale | `theme/typography.ts` |
| Spacing / radii / shadows | `theme/spacing.ts`, `theme/borderRadius.ts`, `theme/shadows.ts` |
| Group-type icons + gradients | `lib/groupTypeVisuals.ts` |
| i18n strings | `i18n/locales/en.json` + `he.json` |
| Existing component reference | `components/GroupHero.tsx` (replace), `components/GroupBalanceBanner.tsx` (merge into summary card), `components/GroupDetailFloatingActions.tsx` (keep, unchanged) |
| Data plumbing | `screens/groups/GroupDetailScreen.tsx` |

The new layout collapses **GroupHero + GroupBalanceBanner** into one composite card. Both components can be replaced by a new `<GroupSummaryCard>` exposed alongside or inside `GroupDetailScreen.tsx`.

## Screen anatomy

Top → bottom inside the screen body (the bottom tab bar sits below this and is part of the navigation host, not this screen):

```
┌────────────────────────────────────────┐
│ App bar (white, 56 px)                 │
│  ← chevron     Group           ⇪ ⋮     │
├────────────────────────────────────────┤
│ Summary card (white, 20-px radius)     │
│  ┌──────────────────────────────────┐  │
│  │  COVER (150 px tall)              │  │
│  │  • image (or type-gradient        │  │
│  │    fallback with centered icon)   │  │
│  │  • [Trip] type chip (top-left)    │  │
│  │  • scrim @ bottom for legibility  │  │
│  │  • Group name (24/18 white,       │  │
│  │    text-shadow)                   │  │
│  │  • "4 people" (11px white)        │  │
│  │  • Member stack (top 4 + "+N")    │  │
│  │    bottom-right, overlapping      │  │
│  └──────────────────────────────────┘  │
│                                        │
│  Middle strip (tappable)               │
│  "You have USD 42.00 to your credit" › │
│  ─────────────────── (border-soft)     │
│  Footer row                            │
│  "1 payment to settle"  [Note·] [Settle up →]
│                                        │
└────────────────────────────────────────┘

[ ACTIVITY ]   ← eyebrow

  ┌──────────────────────────────────┐
  │ [img/icon]  Sushi on Friday      │
  │             Aug 14 · Paid by Sarah │ USD 84.20
  │                                  │ You borrowed USD 21.05
  └──────────────────────────────────┘
  … more expense / message rows …

┌────────────────────────────────────────┐
│ Floating actions (above tab bar):      │
│         [💬 Message]  [+ Add expense]  │
└────────────────────────────────────────┘
```

## Components — exact specs

### 1. App bar

- Background: `#FFFFFF` (`colors.white`)
- Height: ~48–52 px content area
- Left: chevron-back IconButton (24 px Ionicon `chevron-back`, `colors.gray700`)
- Center: text `"Group"` — 14 px `font-weight: 600` `colors.text.secondary` (`#6B7280`)
- Right: share-outline (22 px) + ellipsis-vertical (22 px), both `colors.gray700`

### 2. Summary card

- Container: `#FFFFFF`, border `1px solid colors.border.card` (`#E2E8F0` @ 80%), border-radius **20 px**, shadow `shadows.sm` (`0 1px 2px rgba(0,0,0,0.05)`)
- Page padding: 16 px sides, 6–12 px above and below the card

#### 2a. Cover (top half)

- Height: **150 px**
- If `group.imageUrl`: render `<Image source={{uri: group.imageUrl}} resizeMode="cover" />` filling the whole region
- If no image: background uses the group-type gradient (`getGroupTypeVisual(group.groupType).gradient`) with the type's outline icon centered, 72 px, `rgba(255,255,255,0.45)`
- **Bottom scrim:** `linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,0.55) 100%)` — full overlay, behind text
- **Type chip:** top-left, 10 px inset
  - padding `4px 10px`, radius `9999px`, bg `rgba(0,0,0,0.55)`, color `#FFF`
  - 12-px Ionicon of the type + 11 px `font-weight: 600` capitalized type name (`"Trip"`)
- **Title block:** bottom 10 px inset, left 14 px right 14 px
  - Group name: **18 px / 700** white, `text-shadow: 0 1px 4px rgba(0,0,0,0.5)`, single line, ellipsize on overflow
  - Member count: **11 px** `rgba(255,255,255,0.92)` 2 px below title, `text-shadow: 0 1px 2px rgba(0,0,0,0.5)`
- **Member stack:** bottom-right, aligned with title baseline
  - First 4 members as `MemberAvatar size="xs"` (32 px), each with `margin-left: -8px` after the first
  - 2 px white ring (`box-shadow: 0 0 0 2px #fff`) on each so they stack cleanly
  - If `members.length > 4`: 5th tile is a `+N` chip — 32 px circle, `bg colors.gray100`, `colors.gray700`, 11 px font-weight 600

#### 2b. Middle strip — balance message (M1)

- Tappable area (whole row) — opens a per-currency breakdown screen
- Padding: `14px 16px`
- Layout: row, `justify-content: space-between`, `align-items: center`
- Left text: `"You have <amount> to your credit"` (or `"You owe <amount>"` / `"You're all settled in this group"`)
  - Plain copy: **15 px**, `colors.text.primary`
  - Amount inside `<Text style={{fontWeight: 700, color: …, fontVariantNumeric: 'tabular-nums'}}>` — green `colors.success` (`#10B981`) when owed, red `colors.error` (`#EF4444`) when you owe
- Right: chevron-forward icon, 18 px, `colors.gray400`

**Settled state copy:** `"You're all settled in this group"` — no amount, no color highlight.

#### 2c. Footer row

- Divider above: `1px solid colors.border.soft` (`#F1F5F9`), inset by 16 px on both sides
- Padding: `12px 16px 14px 16px`
- Layout: row, `space-between`
- Left text: `"1 payment to settle everyone"` (or `"N payments to settle everyone"`) — 12 px `colors.text.secondary`
  - Settled state: `"No open payments"`, same style
- Right: two pills in a `flex-direction: row; gap: 8px` group:

##### Note pill (variant **F2**)

- Background `#FFFFFF`, color `colors.gray700`
- Border `1px solid colors.border.card`
- Radius `9999`, padding `7px 12px`
- Content: 13 px Ionicon `receipt-outline` (color `colors.gray700`) + 5 px gap + text `"Note"` at 12 px / `font-weight: 600`
- **Unread/has-content indicator:** 7-px round dot, `bg colors.warning` (`#F59E0B`), `1.5px solid #fff` ring, absolutely positioned top-right of the button (offset `top: 4px; right: 4px`) — only when `group.hasNote` is truthy
- Tap → open the existing `GroupNoteScreen.tsx` (route already exists in the codebase)

##### Settle up pill

- Background `colors.primaryExtraLight` (`#DBEAFE`), color `colors.primaryDark` (`#3B82F6`)
- Radius `9999`, padding `7px 14px`
- Text: `"Settle up →"`, 12 px / 600
- Settled disabled state: background `colors.gray100`, color `colors.gray400`, no press response

### 3. Activity feed

A scrolling region under the summary card.

- Background: `colors.bg.secondary` (`#F8FAFC`)
- Section eyebrow: `"ACTIVITY"` — 11 px `font-weight: 600`, `colors.slate400` (`#94A3B8`), uppercase, `letter-spacing: 0.06em`, padded `6px 4px`
- Bottom padding: 100 px so the FAB pair clears the last row

#### Expense row (variant **R1**)

- White card, border `1px solid colors.gray100`, radius **16 px** (`xl`)
- Padding `12px 14px`, `margin-bottom: 8px`
- Row layout: `display: flex; align-items: center; gap: 12px`
- **Left thumbnail (44×44, 10-px radius):**
  - If `expense.receiptUrl`: render the image with `objectFit: cover`, `border: 1px solid colors.border.soft`
  - Else: bg `colors.primaryExtraLight` (`#DBEAFE`), centered Ionicon mapped from category:

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

   Icon size **22 px**, color `colors.primaryDark`.

- **Body (flex 1, min-width 0):**
  - Title: **15 px** `font-weight: 600`, `colors.text.primary`, single-line ellipsize
  - Meta: **11 px** `colors.text.tertiary` (`#9CA3AF`), 2 px below title — format `"{date} · Paid by {payerName}"` (date FIRST, deliberately, so the date column is consistent across rows)

- **Right column (text-align: right):**
  - Amount: **15 px** `font-weight: 700`, `colors.text.primary`, `font-variant-numeric: tabular-nums`, `whiteSpace: nowrap`. Format `"{CURRENCY} {amount.toFixed(2)}"` — code prefix, space, two decimals.
  - Involvement sub-line: **11 px** `font-weight: 500`, **`colors.text.secondary`** (neutral gray, intentionally NOT colored), `font-variant-numeric: tabular-nums`. Computed:
    ```ts
    // If the current user paid → "You lent USD X" where X = amount - userShare
    // Otherwise                  → "You borrowed USD X" where X = userShare
    ```
    Only render the line when `userShare > 0`.

#### Message row

For chat messages in the same feed, render a small avatar on the left (`MemberAvatar size="xs"`) and a white bubble with `border-radius: 16 px`, padding `10px 12px`, `border: 1px solid colors.gray100`, `shadow: shadows.sm`. Body text 14 px, meta line 11 px (`"{author} · Message · {time}"`).

### 4. Floating action pair (`GroupDetailFloatingActions.tsx`)

**Unchanged from the existing component.** Two pills pinned 6 px above the tab bar:
- "Message" — white, blue-tinted border, primary-colored icon
- "Add expense" — primary-blue solid, white icon and label

## Interactions & behavior

| Trigger | What happens |
|--|--|
| Tap on app-bar chevron-back | `navigation.goBack()` |
| Tap on share-outline | Open existing invite/share sheet (`invite.group.menuTitle` from i18n) |
| Tap on ellipsis-vertical | Open existing group-menu sheet |
| Tap on middle strip ("You have …") | Open per-user balance breakdown screen (existing route — e.g. `BalancesScreen` filtered to the current user) |
| Tap on Note pill | `navigation.navigate('GroupNote', { groupId })` — the screen exists |
| Tap on Settle up pill | `navigation.navigate('SettleUpList', { groupId })` — the screen exists |
| Tap on any expense row | `navigation.navigate('ExpenseDetail', { expenseId })` — exists |
| Tap on a message row | Existing message detail/edit sheet |
| Add expense FAB | `navigation.navigate('AddExpense', { groupId })` — exists |
| Message FAB | Scrolls to the composer or opens the message sheet |
| Press feedback | `activeOpacity={0.7}` on every TouchableOpacity, `0.85` for the FABs |

## State

This screen is mostly a composition of existing queries. New fields needed:

- `group.hasNote: boolean` — already implied by `groups.note.title` being non-empty; expose as a derived boolean or via `useGroupNoteQuery`
- `expense.userShare: number` — what the current user owes for this expense. **Pull from the existing splits**: `splits.find(s => s.userId === currentUserId)?.amount ?? 0`. Compute the involvement line from `(expense.paidBy === currentUserId)`.

No new global state.

## Design tokens used (all already in `theme/`)

```ts
// Color
primary:           '#60A5FA'
primaryDark:       '#3B82F6'
primaryExtraLight: '#DBEAFE'
success:           '#10B981'
error:             '#EF4444'
warning:           '#F59E0B'
text.primary:      '#111827'
text.secondary:    '#6B7280'
text.tertiary:     '#9CA3AF'
bg.secondary:      '#F8FAFC'
gray100:           '#F3F4F6'
gray400:           '#9CA3AF'
gray700:           '#374151'
slate100:          '#F1F5F9'
border.card:       '#E2E8F0'
border.soft:       '#F1F5F9'

// Radii
radius.md:   8
radius.xl:   16
radius.2xl:  20
radius.full: 9999

// Spacing
space.sm:   8
space.md:   12
space.base: 16

// Shadow
shadow.sm: '0 1px 2px rgba(0,0,0,0.05)' (or elevation: 1 on Android)

// Type sizes used here
11px (meta · eyebrow · type chip)
12px (small button label · secondary text)
13px (button icon · type chip text)
14px (button label · message body)
15px (row title · balance message · row amount)
18px (cover group name)
```

## Copy (lift exactly from `i18n/locales/en.json`)

| Used here | Key |
|--|--|
| "Group" (app bar title) | new key `groups.detail.title` or reuse existing convention |
| "You have USD X to your credit" / "You owe USD X" | `groups.summary.youAreOwed` / `groups.summary.youOwe` (already used in `GroupBalanceBanner`) |
| "You're all settled in this group" | derive from `groups.card.settled` |
| "1 payment to settle everyone" | `balances.paymentsToSettle` (existing pluralized key) |
| "No open payments" | new — short alternative to `balances.allSettled` |
| "Note" (button label) | `groups.actions.note` |
| "Settle up →" | `groups.actions.settleUp` + the arrow |
| "Add expense" (FAB) | `expenses.addExpense` |
| "Message" (FAB) | `groups.actions.message` |
| Activity eyebrow | `activity.title` (uppercase) |
| Expense row meta — "Aug 14 · Paid by Sarah" | format using `expenses.paidBy` after the date |
| Involvement — "You lent USD X" / "You borrowed USD X" | new keys: `groups.expense.youLent` / `groups.expense.youBorrowed` (the existing `youLent`/`youBorrowed` keys take an `{{amount}}` placeholder — reuse them) |

## Assets

No new images required. The cover photo is the **user-uploaded** group image (stored in Supabase Storage today). The fallback gradient + icon comes from `lib/groupTypeVisuals.ts`. Receipt thumbnails on expense rows are user-uploaded photos.

The prototype uses a placeholder Unsplash photo (`photo-1502602898657-3e91760cbb34`) for the cover and a sushi photo for one receipt — both are stand-ins.

## RTL

This screen MUST be RTL-aware. The codebase already uses `useRtlLayout()` and helpers in `hooks/useRtlLayout.ts`. When porting:

- App bar buttons: don't position by `left`/`right` — use the existing pattern (RTL helpers from the codebase)
- Chevrons: flip `chevron-forward` ↔ `chevron-back` per `isRtl`
- Member stack overlap direction: keep the same `margin-left` cascade — RTL will mirror it
- The balance text — `"You have {amount} to your credit"` — already gets RTL handling automatically via `<AppText>` from `useRtlLayout`

## Files in this handoff

```
design_handoff_group_detail/
├── README.md                         ← this file
├── colors_and_type.css               ← every design token as CSS vars
└── prototype/
    ├── index.html                    ← boot file for the prototype
    ├── data.js                       ← fake data (groups, members, expenses, messages)
    ├── components.jsx                ← shared primitives (Icon, MemberAvatar, etc.)
    ├── ios-frame.jsx                 ← iPhone bezel for the preview
    ├── App.jsx                       ← prototype router
    └── screens/
        ├── GroupDetailScreen.jsx     ← THE SCREEN (main reference)
        ├── LoginScreen.jsx
        ├── GroupsListScreen.jsx
        ├── ProfileScreen.jsx
        ├── ActivityScreen.jsx
        └── AddExpenseScreen.jsx
```

Open `prototype/index.html` in a browser to interact with the prototype. The `GroupDetailScreen` is the canonical reference — every other file is supporting context.
