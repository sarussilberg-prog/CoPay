# Group Detail Screen — Redesign (Summary Card + R1 Activity Rows)

**Date:** 2026-05-24
**Author:** Avi Silberg (with Claude)
**Status:** Approved — ready for implementation plan
**Branch:** `group-detail-design`
**Design handoff:** [`docs/design_handoff_group_detail/README.md`](../../design_handoff_group_detail/README.md)

---

## 1. Goal

Port the approved Group Detail design (handoff version, May 24) into the live mobile app. The redesign collapses the current `GroupHero` + `GroupBalanceBanner` + `QuickActionsRow` into a single composite **summary card** at the top of the screen, and replaces the activity-feed row visuals with the R1 variant (smaller thumbnail, receipt-or-icon, neutral "You lent / borrowed" sub-line).

The redesign is scoped to `GroupDetailScreen.tsx`. The global Activity feed is **not** migrated in this round; the new row primitives are built reusable so a follow-up PR can swap `ActivityFeedScreen` over.

## 2. Scope

| Region | Today | After |
|---|---|---|
| Header chrome | `GroupHero` (image background, overlaid buttons, stats panel) | New flat-white `GroupDetailAppBar` (back · "Group" · share · menu) above a new `GroupSummaryCard` |
| Balance banner | `GroupBalanceBanner` (separate card with arrow icon + amount) | Merged into the summary card as the middle "You have X to your credit ›" strip |
| Quick actions | `QuickActionsRow` (Settle up / Balances / Note buttons) | **Removed** — Settle + Note in card footer; Balances via tap on middle strip |
| Search + filter row | Present | **Kept**, unchanged |
| Activity feed rows | `ExpenseRow` / `MessageRow` / `FeedChatRow` / `SettlementRow` (via `FeedItemRow`) | Restyled in place to R1 / new message style, composed from new `FeedRowCard` + `FeedRowThumbnail` primitives |
| Floating action pair | `GroupDetailFloatingActions` | **Unchanged** (handoff says so) |
| `GroupHero.tsx` / `GroupBalanceBanner.tsx` | Only used here | **Deleted** after the swap |
| `QuickActionsRow.tsx` | Used only here (verify) | **Deleted** if no other consumers |
| `ActivityFeedScreen` and `ActivityItem.tsx` | Status quo | **Untouched** this round |

## 3. UX trade-off explicitly accepted

The handoff's footer pills (Settle up, Note) duplicate the dropped `QuickActionsRow`'s functionality, and the middle strip's tap target replaces the old "Balances" action — so the redesign loses no capability. The above-feed search + filter row is **retained** because the new design doesn't substitute for it and groups with many expenses benefit from it.

## 4. Component layout

### 4.1 New files under `components/groupDetail/`

```
components/groupDetail/
├── GroupDetailAppBar.tsx        ← flat white bar: back · "Group" · share · menu
├── GroupSummaryCard.tsx         ← orchestrator; owns the card frame and composes the three regions
├── SummaryCover.tsx             ← 150-px cover (image or type-gradient + icon), scrim, type chip, title block, member stack
├── SummaryBalanceStrip.tsx      ← tappable "You have X to your credit ›" middle row
├── SummaryFooter.tsx            ← divider + "N payments to settle" + Note pill + Settle-up pill
└── MemberStack.tsx              ← first-4 stacked avatars + "+N" tile (kept generic — likely reusable elsewhere)
```

### 4.2 New shared row primitives under `components/`

```
components/
├── FeedRowCard.tsx              ← white card, 16px radius, gray-100 border, padding, gap; accepts display-ready props
└── FeedRowThumbnail.tsx         ← 44×44, image-or-icon, primary-extra-light bg when icon
```

### 4.3 Rewritten in place

```
components/
├── ExpenseRow.tsx               ← composes FeedRowCard + FeedRowThumbnail; R1 visual
├── MessageRow.tsx               ← avatar + bubble, new typography
├── FeedChatRow.tsx              ← same body as MessageRow, used by FeedItemRow
└── SettlementRow.tsx            ← composes FeedRowCard for visual consistency
```

### 4.4 Modified

- `screens/groups/GroupDetailScreen.tsx` —
  - Replace `<GroupHero/>` + `<GroupBalanceBanner/>` + `<QuickActionsRow/>` with `<GroupDetailAppBar/>` + `<GroupSummaryCard/>` in the `ListHeaderComponent`.
  - Hide the React Navigation header for this screen if it isn't already hidden (current code uses `GroupHero` which positions its own chrome with `useSafeAreaInsets()`, so the navigation header is most likely already hidden — verify in `RootStackParamList` / wherever the screen is registered).
  - Remove `heroStats` `useMemo` and its `calculateGroupTotalSpent` / `calculateGroupTotalUnsettled` imports (only used to feed `GroupHero`); if those helpers have no other consumers, remove their imports from the file but **do not delete the helpers themselves** unless a project-wide grep confirms zero remaining consumers.
  - Add a derivation for `noteHasContent` — `Boolean(note?.body?.trim())` using the existing `useGroupNoteQuery(groupId)` if present; otherwise add a one-line store selector. Confirm the hook exists during implementation; if not, the spec deliberately leaves the exact mechanism flexible — the only requirement is that the dot's source-of-truth is "the note has non-empty content".
  - Compute `balance` and `settlementCount` from values already in scope (`useAppStore(s => s.groupBalances[groupId])` and `pairwiseDebts.length`).

### 4.5 Deleted

- `components/GroupHero.tsx`
- `components/GroupBalanceBanner.tsx`
- `components/QuickActionsRow.tsx` — **only if** a project-wide grep confirms no consumers outside `GroupDetailScreen`. If it has other consumers, leave the file and just stop importing it from this screen.

## 5. Data flow & props

All data comes from state already in scope on `GroupDetailScreen`. No new queries, no new store fields.

### 5.1 `GroupDetailAppBar`
```ts
interface Props {
  onBack: () => void;
  onShare: () => void;
  onMenu: () => void;
  title?: string;  // default: t('groups.detail.title') → "Group"
}
```
Pure UI. Handles safe-area top inset internally via `useSafeAreaInsets()`.

### 5.2 `GroupSummaryCard`
```ts
interface Props {
  group: Group;                       // for name, imageUrl, groupType
  members: GroupMemberLite[];         // for MemberStack and "N people" subtitle
  balance: {
    net: number;                      // signed
    currency: string;
    isSettled: boolean;               // Math.abs(net) < 0.01
  };
  settlementCount: number;            // for "N payments to settle everyone" / "No open payments"
  noteHasContent: boolean;            // toggles the amber dot on the Note pill; pill itself always renders
  onOpenBalances: () => void;         // middle-strip tap → navigate to Balances
  onOpenNote: () => void;             // Note pill → GroupNote
  onOpenSettleUp: () => void;         // Settle-up pill → SettleUpList (disabled when isSettled)
}
```

Internally splits to:
- `SummaryCover({ group, members })`
- `SummaryBalanceStrip({ balance, onPress: onOpenBalances })`
- `SummaryFooter({ noteHasContent, settlementCount, isSettled, onOpenNote, onOpenSettleUp })`

### 5.3 `FeedRowCard` (shared primitive)
```ts
interface Props {
  thumbnail: React.ReactNode;         // typically a <FeedRowThumbnail/>
  title: string;
  meta: string;                       // pre-formatted "Aug 14 · Paid by Sarah"
  amount: string;                     // pre-formatted "USD 84.20"
  subLine?: string;                   // pre-formatted "You lent USD 21.05" — omit when undefined
  onPress?: () => void;
  testID?: string;
}
```

### 5.4 `FeedRowThumbnail` (shared primitive)
```ts
interface Props {
  imageUrl?: string;                  // if present → <Image>; else icon path
  iconName?: IconName;
  iconColor?: string;                 // default colors.primaryDark
  iconBgColor?: string;               // default colors.primaryExtraLight
}
```

### 5.5 `ExpenseRow` after rewrite
Takes the existing `ExpenseWithDelta` prop; computes the category icon, formats date + amount + involvement line; renders `<FeedRowCard thumbnail={<FeedRowThumbnail ... />} ... />`. The category-icon map lives co-located:

```ts
const CATEGORY_ICON: Record<ExpenseCategory, IconName> = {
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

### 5.6 Balance source on the screen
```ts
const groupBalance = useAppStore(s => s.groupBalances[groupId]);
const balance = useMemo(() => {
  const net = groupBalance?.net ?? 0;
  return {
    net,
    currency: groupBalance?.currency ?? displayGroup.defaultCurrency,
    isSettled: Math.abs(net) < 0.01,
  };
}, [groupBalance, displayGroup.defaultCurrency]);

const settlementCount = pairwiseDebts.length;  // already in scope
```

## 6. i18n

All copy is lifted verbatim from the handoff. Existing keys are reused; new keys are added in both `en.json` and `he.json` **before** the UI commits land, so the components can reference them safely.

| Used in | Key | Status |
|---|---|---|
| App-bar title "Group" | `groups.detail.title` | **NEW** |
| Type chip text | reuse existing `groups.types.<type>` | exists |
| Member count "4 people" | `groups.memberCount` `{ count }` | exists |
| "You have {amount} to your credit" | `groups.summary.youAreOwed` | exists — verify wording during implementation; if it currently says "You are owed X", update the value in both locales to "You have X to your credit" (and the Hebrew equivalent) rather than adding a new key |
| "You owe {amount}" | `groups.summary.youOwe` | exists |
| "You're all settled in this group" | `groups.card.settled` | exists |
| "1 payment to settle everyone" / "N payments…" | `balances.paymentsToSettle` `{ count }` | exists |
| "No open payments" | `groups.summary.noOpenPayments` | **NEW** |
| Note pill label | `groups.actions.note` | exists |
| Settle up pill label | `groups.actions.settleUp` (arrow is a JSX `<AppIcon>`, not in the string) | exists |
| Activity eyebrow | `activity.title` (uppercased in JSX) | exists |
| Expense meta "Paid by Sarah" | `expenses.paidBy` `{ name }` (composed with formatted date by JS) | exists |
| "You lent {amount}" | `groups.expense.youLent` or existing `youLent` key | verify during implementation |
| "You borrowed {amount}" | `groups.expense.youBorrowed` or existing `youBorrowed` key | verify during implementation |

**Implementation step:** the first commit is an i18n audit — confirm each "exists" row, add the **NEW** rows in both locales. Hebrew copy follows existing tone; user reviews the Hebrew strings before merge.

## 7. RTL

The codebase already has `useRtlLayout`, `rtlTextAlign`, `rtlTextClassName`, and the existing `GroupHero` follows the patterns. New components inherit them:

- **App bar:** flex-row + space-between (never positional `left`/`right`); back chevron flips to `chevron-forward` when `isRtl`.
- **Middle strip:** `›` icon is `chevron-forward` LTR, `chevron-back` RTL — matches the existing `GroupBalanceBanner` behavior. Sentence comes from `t(...)`; `<Text>` handles direction via the existing AppText wrapper.
- **Settle-up pill arrow:** the arrow is a JSX `<AppIcon>`, swapped per `isRtl` (or mirrored via `transform: scaleX(-1)`, whichever the codebase already prefers for similar buttons — verify with one grep before picking).
- **Member stack:** keep the `marginLeft: -8` cascade; RN handles RTL mirroring of children for `flex-row`. Verify visually on first render.
- **Cover title block:** prefer logical-property classes (`start-*`, `end-*`) if NativeWind has them in this project; otherwise manual `isRtl` swap.
- **Type chip:** position via `start: 10` rather than `left: 10`.
- **Feed row primitives:** `FeedRowCard` is `flex-row`; thumbnail and amount column naturally swap edges. Title/meta text alignment uses `rtlTextAlign(isRtl)`.

**Manual QA hot spot:** Hebrew + long group name + 5+ member stack — the cell most likely to break (stack overlapping title block).

## 8. Testing

### 8.1 Unit / component (Jest + RNTL — matches existing `__tests__/components/*.test.tsx` patterns)

1. **`__tests__/components/GroupSummaryCard.test.tsx`** (new — flat, matching existing convention)
   - Settled state → settled copy, no amount, Settle-up pill disabled, footer says "No open payments".
   - Owed state (`net > 0`) → green amount, "to your credit" copy, pill enabled.
   - Owe state (`net < 0`) → red amount, "you owe" copy.
   - With `imageUrl` → `<Image>` cover; without → gradient + type icon.
   - 5+ members → first 4 + "+N" tile.
   - `noteHasContent=true` → amber dot rendered on Note pill; `false` → no dot, pill still rendered.
   - Tap middle strip / Note / Settle → respective callbacks fire.

2. **`__tests__/components/FeedRowCard.test.tsx`** (new)
   - Renders title / meta / amount / subLine.
   - Omits subLine when undefined.
   - Calls `onPress` when tapped.

3. **`__tests__/components/GroupDetailAppBar.test.tsx`** (new)
   - Renders title (default and override).
   - Back / share / menu callbacks fire on tap.

4. **Updates** to `ExpenseRow.test.tsx`, `MessageRow.test.tsx`, `SettlementRow.test.tsx` — match new R1 markup; preserve press / RTL / money-formatting cases. Pre-existing assertions on specific class names or layout that no longer apply get rewritten; the cases they cover stay.

5. **Light tests** for `SummaryCover` / `SummaryBalanceStrip` / `SummaryFooter` only for behavior not already covered by the parent `GroupSummaryCard` test.

### 8.2 Screen-level smoke

`__tests__/screens/groups/GroupDetailScreen.test.tsx` — if it exists, update it; otherwise add a minimal case asserting:
- `QuickActionsRow` no longer in the tree.
- `GroupSummaryCard` is, with the correct balance value piped through.

### 8.3 Manual QA checklist

Per `AGENTS.md` reminder about Expo 55, run on device — not just via type-check / unit tests.

- LTR + RTL × image cover + gradient cover (4 visual states).
- Settled + owed + owe (3 balance states).
- Empty feed, search-results-empty, and populated feed.
- Tap each interactive region; verify navigation targets (`Balances`, `GroupNote`, `SettleUpList`, `ExpenseDetail`, `AddExpense`).
- Long group name (truncation on cover and in app bar).
- Groups of 1, 4, and 5+ members (stack rendering).
- Note pill — amber dot appears when the note has content; pill always renders.

## 9. Out of scope

- `ActivityFeedScreen` and `ActivityItem.tsx` migration — follow-up PR.
- Any change to `GroupDetailFloatingActions.tsx` — handoff says unchanged.
- Empty-state copy redesign — keep current `groups.emptyFeed.*` strings.
- The pending `createdAt` field swap on `ExpenseRow` / `ActivityItem` / `SettlementRow` (currently in the working tree as uncommitted edits) is unrelated to this design and will be committed independently before or after the redesign work — keep the two changes separate to ease review.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Hebrew copy regression for the reworded "You have X to your credit" key | User reviews the Hebrew translation before merge; revert the change to the existing key value if regression found. |
| Deleting `GroupHero` / `GroupBalanceBanner` / `QuickActionsRow` and surfacing a hidden consumer | Grep for each component name across the whole `cost-share-app/` tree before deleting; only delete when zero hits remain outside of the file itself and its test. |
| RTL break on the member stack overlapping the title block | Specifically tested in manual QA matrix (§8.3). |
| React Navigation header re-appearing because the new app bar's safe-area handling differs from `GroupHero`'s | Verify the screen registration explicitly sets `headerShown: false`; if not, add it. |
| Re-styled row components diverging from `FeedItemDetailSheet` (which references them visually) | Open the sheet in manual QA; rows displayed inside it should still render correctly since they get the same props. |
