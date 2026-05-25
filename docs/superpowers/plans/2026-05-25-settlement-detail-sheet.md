# Settlement Detail Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the settlement half of `FeedItemDetailSheet` to match the
2026-05-25 settlement-detail design spec (green-gradient hero with From → amount →
To flow, single involvement strip), and extract the kebab-popover header chrome
into a shared `DetailSheetHeader` consumed by both the expense and settlement
branches.

**Architecture:** Single component file already exists
(`cost-share-app/apps/mobile/components/FeedItemDetailSheet.tsx`). One new
extracted file (`DetailSheetHeader.tsx`). Two local sub-components for the
settlement body (`SettlementHero`, `SettlementInvolvementStrip`). i18n keys
added in `en.json` + `he.json` under the existing `settleUp.*` namespace.
Existing wiring in `GroupDetailScreen` (edit opens `SettleUpSheet`, delete goes
through `deleteSettlementMutation`) is unchanged.

**Tech Stack:** React Native + Expo · NativeWind · `expo-linear-gradient` ·
`react-i18next` · Jest + `@testing-library/react-native`

**Spec:** [`docs/superpowers/specs/2026-05-25-settlement-detail-sheet-design.md`](../specs/2026-05-25-settlement-detail-sheet-design.md)

**Design handoff:** [`docs/design_handoff_settlement_detail/README.md`](../../design_handoff_settlement_detail/README.md)

---

## Conventions used in this plan

- Working directory for all bash commands: `cost-share-app/apps/mobile/`
  unless otherwise stated. Example:
  `cd cost-share-app/apps/mobile && npm test`.
- Test runner: `jest` via `npm test`. Single-test invocation:
  `npm test -- __tests__/components/FeedItemDetailSheet.test.tsx`.
- Commit style follows existing history (`feat(mobile): …`, `refactor(mobile): …`,
  `test(mobile): …`, `i18n(mobile): …`). End every commit with the
  `Co-Authored-By: Claude Opus 4.7 (1M context)` trailer.

## File map

| File | Action | Responsibility |
|---|---|---|
| `cost-share-app/apps/mobile/components/DetailSheetHeader.tsx` | **Create** | Shared top bar for both detail-sheet kinds: close ✕ · uppercase label · ⋮ kebab popover with Edit + Delete. Owns `menuOpen` state and outside-tap dismissal. |
| `cost-share-app/apps/mobile/components/FeedItemDetailSheet.tsx` | **Modify** | Delete inline `ExpenseHeader` + `SettlementHeader` + `DetailSection`; render shared header for both branches; rewrite `SettlementDetailBody` with new hero + involvement strip. |
| `cost-share-app/apps/mobile/__tests__/components/DetailSheetHeader.test.tsx` | **Create** | Unit tests for shared header (kebab gate, callbacks, accessibility labels). |
| `cost-share-app/apps/mobile/__tests__/components/FeedItemDetailSheet.test.tsx` | **Modify** | Keep expense test (passes after extraction); update existing settlement test to assert the kebab gate; add four new settlement-body cases (received / paid / third-party / no-method). |
| `cost-share-app/apps/mobile/i18n/locales/en.json` | **Modify** | Add 10 keys under `settleUp.*`. |
| `cost-share-app/apps/mobile/i18n/locales/he.json` | **Modify** | Add the same 10 keys in Hebrew. |

No other files touched. No new services, hooks, or routes.

---

## Task 1: Extract `DetailSheetHeader` shared component

Pull the kebab-popover chrome currently inlined inside `ExpenseHeader` into a
new component that both detail-sheet kinds render. The settlement body stays on
its OLD layout in this task — we only swap the header. The existing expense
test passes as-is; the existing settlement test gets one line changed so it
asserts the new kebab-gated edit/delete behavior.

**Files:**
- Create: `cost-share-app/apps/mobile/components/DetailSheetHeader.tsx`
- Create: `cost-share-app/apps/mobile/__tests__/components/DetailSheetHeader.test.tsx`
- Modify: `cost-share-app/apps/mobile/components/FeedItemDetailSheet.tsx` (delete `ExpenseHeader`, `SettlementHeader`; render `DetailSheetHeader` from both branches; drop unused `styles.headerRow`)
- Modify: `cost-share-app/apps/mobile/__tests__/components/FeedItemDetailSheet.test.tsx` (settlement test: assert kebab-gated edit/delete, mirror of expense test)

- [ ] **Step 1: Write the failing test for the new shared header**

Create `cost-share-app/apps/mobile/__tests__/components/DetailSheetHeader.test.tsx`:

```tsx
import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithQuery } from '../helpers/renderWithQuery';
import { DetailSheetHeader } from '../../components/DetailSheetHeader';

describe('DetailSheetHeader', () => {
    it('hides edit/delete until the kebab is pressed', () => {
        const onEdit = jest.fn();
        const onDelete = jest.fn();
        const onClose = jest.fn();

        const { getByTestId, queryByTestId } = renderWithQuery(
            <DetailSheetHeader
                label="SETTLEMENT"
                onClose={onClose}
                onEdit={onEdit}
                onDelete={onDelete}
            />,
        );

        expect(queryByTestId('detail-edit-btn')).toBeNull();
        expect(queryByTestId('detail-delete-btn')).toBeNull();

        fireEvent.press(getByTestId('detail-kebab-btn'));

        fireEvent.press(getByTestId('detail-edit-btn'));
        expect(onEdit).toHaveBeenCalledTimes(1);

        fireEvent.press(getByTestId('detail-kebab-btn'));
        fireEvent.press(getByTestId('detail-delete-btn'));
        expect(onDelete).toHaveBeenCalledTimes(1);
    });

    it('invokes onClose when the close button is pressed', () => {
        const onClose = jest.fn();
        const { getByLabelText } = renderWithQuery(
            <DetailSheetHeader
                label="EXPENSE"
                onClose={onClose}
                onEdit={jest.fn()}
                onDelete={jest.fn()}
            />,
        );
        // Close button uses the existing groups.filters.close key for its
        // accessibilityLabel — this is what the i18n test setup resolves to.
        fireEvent.press(getByLabelText('Close'));
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd cost-share-app/apps/mobile && npm test -- __tests__/components/DetailSheetHeader.test.tsx`
Expected: FAIL with `Cannot find module '../../components/DetailSheetHeader' from '__tests__/components/DetailSheetHeader.test.tsx'`

- [ ] **Step 3: Create `DetailSheetHeader.tsx`**

Create `cost-share-app/apps/mobile/components/DetailSheetHeader.tsx`:

```tsx
/**
 * DetailSheetHeader — shared top bar for FeedItemDetailSheet (expense + settlement).
 * Layout: close ✕ · centered uppercase label · ⋮ kebab popover (Edit / Delete).
 */

import React, { useState } from 'react';
import {
    View,
    Pressable,
    StyleSheet,
    TouchableOpacity,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from './AppText';
import { AppIcon } from './AppIcon';
import { colors } from '../theme';

export interface DetailSheetHeaderProps {
    /** Label shown centered; rendered uppercase by the component. */
    label: string;
    onClose: () => void;
    onEdit: () => void;
    onDelete: () => void;
}

export function DetailSheetHeader({
    label,
    onClose,
    onEdit,
    onDelete,
}: DetailSheetHeaderProps) {
    const { t } = useTranslation();
    const [menuOpen, setMenuOpen] = useState(false);

    const handleEdit = () => {
        setMenuOpen(false);
        onEdit();
    };
    const handleDelete = () => {
        setMenuOpen(false);
        onDelete();
    };

    return (
        <View
            className="flex-row items-center justify-between px-2 pb-1"
            style={{ position: 'relative', zIndex: 5 }}
        >
            <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t('groups.filters.close')}
                className="w-11 h-11 items-center justify-center"
            >
                <AppIcon name="close" size={22} color={colors.gray600} />
            </TouchableOpacity>

            <Text
                className="text-xs font-semibold uppercase text-gray-500"
                style={{ letterSpacing: 0.7 }}
            >
                {label}
            </Text>

            <View>
                <TouchableOpacity
                    onPress={() => setMenuOpen((o) => !o)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.edit')}
                    className="w-11 h-11 items-center justify-center"
                    testID="detail-kebab-btn"
                >
                    <AppIcon
                        name="ellipsis-vertical"
                        size={20}
                        color={colors.gray600}
                    />
                </TouchableOpacity>

                {menuOpen && (
                    <>
                        <Pressable
                            onPress={() => setMenuOpen(false)}
                            style={styles.menuBackdrop}
                        />
                        <View style={styles.menuCard}>
                            <TouchableOpacity
                                onPress={handleEdit}
                                accessibilityRole="button"
                                accessibilityLabel={t('common.edit')}
                                className="flex-row items-center px-3 py-2.5 rounded-lg"
                                testID="detail-edit-btn"
                            >
                                <AppIcon
                                    name="create-outline"
                                    size={16}
                                    color={colors.gray700}
                                />
                                <Text className="text-sm font-medium text-gray-900 ml-2.5">
                                    {t('common.edit')}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handleDelete}
                                accessibilityRole="button"
                                accessibilityLabel={t('common.delete')}
                                className="flex-row items-center px-3 py-2.5 rounded-lg"
                                testID="detail-delete-btn"
                            >
                                <AppIcon
                                    name="trash-outline"
                                    size={16}
                                    color={colors.error}
                                />
                                <Text
                                    className="text-sm font-medium ml-2.5"
                                    style={{ color: colors.error }}
                                >
                                    {t('common.delete')}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    menuCard: {
        position: 'absolute',
        top: 42,
        right: 4,
        minWidth: 160,
        padding: 4,
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#0F172A',
        shadowOpacity: 0.12,
        shadowOffset: { width: 0, height: 8 },
        shadowRadius: 20,
        elevation: 8,
        zIndex: 10,
    },
    menuBackdrop: {
        position: 'absolute',
        top: -1000,
        left: -1000,
        right: -1000,
        bottom: -1000,
        zIndex: 9,
    },
});
```

- [ ] **Step 4: Run the new test — expect PASS**

Run: `cd cost-share-app/apps/mobile && npm test -- __tests__/components/DetailSheetHeader.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire `DetailSheetHeader` into both branches of `FeedItemDetailSheet`**

In `cost-share-app/apps/mobile/components/FeedItemDetailSheet.tsx`:

1. Import the new header at the top of the file (add the import line next to the other component imports):

```tsx
import { DetailSheetHeader } from './DetailSheetHeader';
```

2. Replace the JSX at lines 136-153 (the expense / settlement header branches inside the sheet) with a single shared call. Find this block:

```tsx
                    {item?.kind === 'expense' && (
                        <ExpenseHeader
                            onClose={onClose}
                            menuOpen={menuOpen}
                            onToggleMenu={() => setMenuOpen(o => !o)}
                            onCloseMenu={() => setMenuOpen(false)}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                        />
                    )}

                    {item?.kind === 'settlement' && (
                        <SettlementHeader
                            onClose={onClose}
                            onEdit={onEdit}
                            onDelete={onDelete}
                        />
                    )}
```

Replace with:

```tsx
                    {item && (
                        <DetailSheetHeader
                            label={
                                item.kind === 'expense'
                                    ? t('groups.feedDetail.expenseHeaderLabel')
                                    : t('settleUp.detailHeaderLabel')
                            }
                            onClose={onClose}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                        />
                    )}
```

3. The top-level `FeedItemDetailSheet` no longer owns `menuOpen` — it lives inside `DetailSheetHeader`. Remove these lines from the component body (around lines 95-99):

```tsx
    const [menuOpen, setMenuOpen] = useState(false);

    React.useEffect(() => {
        if (!visible) setMenuOpen(false);
    }, [visible]);
```

The `handleEdit` / `handleDelete` wrappers that close the menu are also no longer needed at the sheet level; replace lines 101-108 so they just forward:

```tsx
    const handleEdit = () => onEdit();
    const handleDelete = () => onDelete();
```

(Or pass `onEdit` / `onDelete` directly to `DetailSheetHeader` — either is fine; pick the simpler one. Direct pass is cleaner.)

4. Delete the `ExpenseHeader` and `SettlementHeader` function components further down the file (lines 184-344). Also delete the `headerRow` entry from the StyleSheet at the bottom (line 773-776).

5. Remove the now-unused `useState` import if it has no other consumers — keep it; the body components don't use it but leaving the named import is harmless if other code in the file uses it. (Currently it's used only by the deleted state — remove from the import to avoid a lint warning.)

6. Also remove from the top-of-file React import the `useState` named import if it became unused.

- [ ] **Step 6: Update the existing settlement test to match the new kebab-gated behavior**

In `cost-share-app/apps/mobile/__tests__/components/FeedItemDetailSheet.test.tsx`, replace the second test (`'shows edit/delete for settlements to any group member'`, lines 77-109) with:

```tsx
    it('exposes settlement edit/delete via the kebab menu', () => {
        const onEdit = jest.fn();
        const onDelete = jest.fn();
        const { getByTestId, queryByTestId } = renderWithQuery(
            <FeedItemDetailSheet
                item={{
                    kind: 'settlement',
                    settlement: {
                        id: 'st1',
                        groupId: 'g1',
                        fromUserId: 'u1',
                        toUserId: 'u2',
                        amount: 30,
                        currency: 'USD',
                        settlementDate: new Date(),
                        createdBy: 'u1',
                        createdAt: new Date(),
                        updatedAt: new Date(),
                        deletedAt: null,
                    },
                }}
                memberMap={memberMap}
                currentUserId="u3"
                onClose={jest.fn()}
                onEdit={onEdit}
                onDelete={onDelete}
            />,
        );

        expect(getByTestId('settlement-detail-sheet')).toBeTruthy();
        expect(queryByTestId('detail-edit-btn')).toBeNull();
        expect(queryByTestId('detail-delete-btn')).toBeNull();

        fireEvent.press(getByTestId('detail-kebab-btn'));
        fireEvent.press(getByTestId('detail-edit-btn'));
        expect(onEdit).toHaveBeenCalledTimes(1);

        fireEvent.press(getByTestId('detail-kebab-btn'));
        fireEvent.press(getByTestId('detail-delete-btn'));
        expect(onDelete).toHaveBeenCalledTimes(1);
    });
```

- [ ] **Step 7: Run the full test file — expect PASS**

Run: `cd cost-share-app/apps/mobile && npm test -- __tests__/components/FeedItemDetailSheet.test.tsx __tests__/components/DetailSheetHeader.test.tsx`
Expected: PASS (3 tests total: 1 expense, 1 settlement, 2 DetailSheetHeader).

- [ ] **Step 8: Commit**

```bash
git add cost-share-app/apps/mobile/components/DetailSheetHeader.tsx \
        cost-share-app/apps/mobile/components/FeedItemDetailSheet.tsx \
        cost-share-app/apps/mobile/__tests__/components/DetailSheetHeader.test.tsx \
        cost-share-app/apps/mobile/__tests__/components/FeedItemDetailSheet.test.tsx
git commit -m "$(cat <<'EOF'
refactor(mobile): extract DetailSheetHeader from FeedItemDetailSheet

Shared kebab-popover top bar consumed by both the expense and settlement
branches of FeedItemDetailSheet. Same close/label/kebab layout as before,
no visual change to either branch. The settlement header drops its old
pill-button row in favor of the kebab gate the expense side already used.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add settlement-detail i18n keys

Pure additions under the existing `settleUp.*` namespace.

**Files:**
- Modify: `cost-share-app/apps/mobile/i18n/locales/en.json`
- Modify: `cost-share-app/apps/mobile/i18n/locales/he.json`

- [ ] **Step 1: Add keys to `en.json`**

Open `cost-share-app/apps/mobile/i18n/locales/en.json` and locate the existing
`"settleUp"` object (starts at line 504). Add the following keys inside it,
just before the closing `}` of `settleUp`:

```jsonc
        "detailHeaderLabel": "Settlement",
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
```

(Mind the trailing comma on the previous last key — `notInvolved` — and the
missing comma after the new last key `via`. The block as written above ends
without a comma.)

- [ ] **Step 2: Add the same keys to `he.json`**

Open `cost-share-app/apps/mobile/i18n/locales/he.json` and locate the
`"settleUp"` object. Add the same keys in Hebrew:

```jsonc
        "detailHeaderLabel": "תשלום",
        "payment": "תשלום",
        "paid": "שולם",
        "received": "התקבל",
        "youReceivedAmount": "קיבלת {{amount}}",
        "youPaidAmount": "שילמת {{amount}}",
        "someonePaid": "{{from}} שילם ל-{{to}}",
        "fromVia": "מ-{{name}} · באמצעות {{method}}",
        "toVia": "ל-{{name}} · באמצעות {{method}}",
        "fromName": "מ-{{name}}",
        "toName": "ל-{{name}}",
        "via": "באמצעות {{method}}"
```

- [ ] **Step 3: Run the full mobile test suite to verify JSON parses**

Run: `cd cost-share-app/apps/mobile && npm test -- __tests__/components/FeedItemDetailSheet.test.tsx`
Expected: PASS (no JSON parse errors at startup).

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/apps/mobile/i18n/locales/en.json \
        cost-share-app/apps/mobile/i18n/locales/he.json
git commit -m "$(cat <<'EOF'
i18n(mobile): add settlement detail-sheet copy under settleUp.*

Keys for the redesigned settlement detail sheet — header label,
PAID/RECEIVED flow labels, involvement-strip headings and sub lines.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Rewrite `SettlementDetailBody` with hero + involvement strip

Replace the old icon / three-card layout with the spec's design. Write the
failing test cases first, then implement the two sub-components.

**Files:**
- Modify: `cost-share-app/apps/mobile/__tests__/components/FeedItemDetailSheet.test.tsx` (replace the single settlement test with four cases)
- Modify: `cost-share-app/apps/mobile/components/FeedItemDetailSheet.tsx` (rewrite `SettlementDetailBody`; add `SettlementHero` + `SettlementInvolvementStrip`; delete `DetailSection`)

- [ ] **Step 1: Write the failing tests**

In `cost-share-app/apps/mobile/__tests__/components/FeedItemDetailSheet.test.tsx`,
add a shared settlement fixture above the existing `describe`:

```tsx
import type {
    ExpenseWithDelta,
    Settlement,
} from '@cost-share/shared';

const baseSettlement: Settlement = {
    id: 'st1',
    groupId: 'g1',
    fromUserId: 'u1',
    toUserId: 'u2',
    amount: 30,
    currency: 'USD',
    settlementDate: new Date('2026-08-13'),
    paymentMethod: 'bank_transfer',
    createdBy: 'u1',
    createdAt: new Date('2026-08-13'),
    updatedAt: new Date('2026-08-13'),
    deletedAt: null,
};
```

Then, **inside** the existing `describe('FeedItemDetailSheet', ...)` block,
add these four cases after the kebab-gated edit/delete test from Task 1
(the existing expense test and the Task 1 settlement test stay as they are):

```tsx
    it('renders the "you received" involvement strip when current user is the recipient', () => {
        const { getByText } = renderWithQuery(
            <FeedItemDetailSheet
                item={{ kind: 'settlement', settlement: baseSettlement }}
                memberMap={memberMap}
                currentUserId="u2"  // recipient
                onClose={jest.fn()}
                onEdit={jest.fn()}
                onDelete={jest.fn()}
            />,
        );

        expect(getByText('You received USD 30.00')).toBeTruthy();
        expect(getByText('From Alice · via Bank Transfer')).toBeTruthy();
    });

    it('renders the "you paid" involvement strip when current user is the payer', () => {
        const { getByText } = renderWithQuery(
            <FeedItemDetailSheet
                item={{ kind: 'settlement', settlement: baseSettlement }}
                memberMap={memberMap}
                currentUserId="u1"  // payer
                onClose={jest.fn()}
                onEdit={jest.fn()}
                onDelete={jest.fn()}
            />,
        );

        expect(getByText('You paid USD 30.00')).toBeTruthy();
        expect(getByText('To Bob · via Bank Transfer')).toBeTruthy();
    });

    it('renders the third-party "someone paid" copy when current user is neither party', () => {
        const { getByText } = renderWithQuery(
            <FeedItemDetailSheet
                item={{ kind: 'settlement', settlement: baseSettlement }}
                memberMap={memberMap}
                currentUserId="u3"
                onClose={jest.fn()}
                onEdit={jest.fn()}
                onDelete={jest.fn()}
            />,
        );

        expect(getByText('Alice paid Bob')).toBeTruthy();
        expect(getByText('via Bank Transfer')).toBeTruthy();
    });

    it('omits the "via …" sub line when paymentMethod is not set', () => {
        const noMethodSettlement: Settlement = {
            ...baseSettlement,
            paymentMethod: undefined,
        };
        const { getByText, queryByText } = renderWithQuery(
            <FeedItemDetailSheet
                item={{ kind: 'settlement', settlement: noMethodSettlement }}
                memberMap={memberMap}
                currentUserId="u2"  // recipient
                onClose={jest.fn()}
                onEdit={jest.fn()}
                onDelete={jest.fn()}
            />,
        );

        expect(getByText('You received USD 30.00')).toBeTruthy();
        expect(getByText('From Alice')).toBeTruthy();
        expect(queryByText(/via/)).toBeNull();
    });
```

(Existing fixture: `memberMap` already maps `u1 → Alice` and `u2 → Bob` — line 40
of the test file.)

- [ ] **Step 2: Run the tests to verify three of four fail**

Run: `cd cost-share-app/apps/mobile && npm test -- __tests__/components/FeedItemDetailSheet.test.tsx`
Expected: 3 NEW tests fail (received / paid / no-method) because the current
body doesn't render those strings. The third-party "someone paid" case may
pass coincidentally if the existing body string happens to match — verify
the FAIL output identifies the right three. If all four fail that's fine too
(the third-party case currently uses a different translation key).

- [ ] **Step 3: Add the `SettlementHero` sub-component**

In `cost-share-app/apps/mobile/components/FeedItemDetailSheet.tsx`, add this
component just above the existing `SettlementDetailBody` function (around
line 663):

```tsx
function SettlementHero({
    fromName,
    toName,
    amountText,
    heroDate,
    isRtl,
}: {
    fromName: string;
    toName: string;
    amountText: string;
    heroDate: string;
    isRtl: boolean;
}) {
    const { t } = useTranslation();
    const chevronName: AppIconName = isRtl
        ? 'chevron-back'
        : 'chevron-forward';

    return (
        <View className="px-4 pt-1">
            <View
                className="rounded-2xl overflow-hidden border"
                style={{
                    height: 180,
                    borderColor: '#A7F3D0',
                    position: 'relative',
                }}
            >
                <LinearGradient
                    colors={['#10B981', '#047857']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                />

                {/* Top + bottom legibility scrim */}
                <View
                    pointerEvents="none"
                    style={[
                        StyleSheet.absoluteFill,
                        { zIndex: 0 },
                    ]}
                >
                    <LinearGradient
                        colors={[
                            'rgba(0,0,0,0.18)',
                            'rgba(0,0,0,0)',
                            'rgba(0,0,0,0)',
                            'rgba(0,0,0,0.18)',
                        ]}
                        locations={[0, 0.3, 0.7, 1]}
                        style={StyleSheet.absoluteFill}
                    />
                </View>

                {/* Payment chip — top-left */}
                <View
                    className="flex-row items-center rounded-full"
                    style={{
                        position: 'absolute',
                        top: 10,
                        left: 10,
                        backgroundColor: 'rgba(0,0,0,0.45)',
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        zIndex: 2,
                    }}
                >
                    <AppIcon
                        name="checkmark-circle"
                        size={12}
                        color="#FFFFFF"
                    />
                    <Text
                        className="text-white font-semibold ml-1"
                        style={{ fontSize: 11 }}
                    >
                        {t('settleUp.payment')}
                    </Text>
                </View>

                {/* Date — top-right */}
                <Text
                    style={{
                        position: 'absolute',
                        top: 12,
                        right: 14,
                        fontSize: 11,
                        color: 'rgba(255,255,255,0.92)',
                        textShadowColor: 'rgba(0,0,0,0.4)',
                        textShadowOffset: { width: 0, height: 1 },
                        textShadowRadius: 2,
                        zIndex: 2,
                    }}
                >
                    {heroDate}
                </Text>

                {/* Center payment flow */}
                <View
                    style={{
                        flex: 1,
                        flexDirection: isRtl ? 'row-reverse' : 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingHorizontal: 14,
                        zIndex: 2,
                    }}
                >
                    <FlowPerson
                        name={fromName}
                        label={t('settleUp.paid')}
                    />

                    <View
                        style={{
                            flex: 1,
                            minWidth: 0,
                            paddingHorizontal: 6,
                            alignItems: 'center',
                        }}
                    >
                        <Text
                            style={{
                                fontSize: 20,
                                fontWeight: '700',
                                color: '#FFFFFF',
                                fontVariant: ['tabular-nums'],
                                letterSpacing: -0.2,
                                textShadowColor: 'rgba(0,0,0,0.35)',
                                textShadowOffset: { width: 0, height: 1 },
                                textShadowRadius: 3,
                            }}
                            numberOfLines={1}
                        >
                            {amountText}
                        </Text>
                        <View
                            style={{
                                flexDirection: isRtl ? 'row-reverse' : 'row',
                                alignItems: 'center',
                                width: '100%',
                                marginTop: 4,
                            }}
                        >
                            <View
                                style={{
                                    flex: 1,
                                    height: 2,
                                    backgroundColor: 'rgba(255,255,255,0.85)',
                                    borderRadius: 9999,
                                }}
                            />
                            <AppIcon
                                name={chevronName}
                                size={18}
                                color="rgba(255,255,255,0.95)"
                            />
                        </View>
                    </View>

                    <FlowPerson
                        name={toName}
                        label={t('settleUp.received')}
                    />
                </View>
            </View>
        </View>
    );
}

function FlowPerson({ name, label }: { name: string; label: string }) {
    return (
        <View
            style={{
                width: 96,
                alignItems: 'center',
            }}
        >
            <View
                style={{
                    padding: 3,
                    backgroundColor: 'rgba(255,255,255,0.25)',
                    borderRadius: 9999,
                }}
            >
                <View
                    style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: 9999,
                    }}
                >
                    <MemberAvatar name={name} size="md" />
                </View>
            </View>
            <Text
                style={{
                    marginTop: 6,
                    fontSize: 13,
                    fontWeight: '700',
                    color: '#FFFFFF',
                    width: 96,
                    textAlign: 'center',
                    textShadowColor: 'rgba(0,0,0,0.35)',
                    textShadowOffset: { width: 0, height: 1 },
                    textShadowRadius: 3,
                }}
                numberOfLines={1}
            >
                {name}
            </Text>
            <Text
                style={{
                    fontSize: 9,
                    fontWeight: '700',
                    color: 'rgba(255,255,255,0.8)',
                    letterSpacing: 0.8,
                    marginTop: 2,
                }}
            >
                {label}
            </Text>
        </View>
    );
}
```

- [ ] **Step 4: Add the `SettlementInvolvementStrip` sub-component**

In the same file, add this component just below `SettlementHero`:

```tsx
function SettlementInvolvementStrip({
    settlement,
    currentUserId,
    fromName,
    toName,
    amountText,
    methodLabel,
}: {
    settlement: Settlement;
    currentUserId: string;
    fromName: string;
    toName: string;
    amountText: string;
    methodLabel: string | null;
}) {
    const { t } = useTranslation();

    const isRecipient = settlement.toUserId === currentUserId;
    const isPayer = settlement.fromUserId === currentUserId;

    let iconName: AppIconName;
    let heading: string;
    let sub: string | null;

    if (isRecipient) {
        iconName = 'arrow-down-circle-outline';
        heading = t('settleUp.youReceivedAmount', { amount: amountText });
        sub = methodLabel
            ? t('settleUp.fromVia', { name: fromName, method: methodLabel })
            : t('settleUp.fromName', { name: fromName });
    } else if (isPayer) {
        iconName = 'arrow-up-circle-outline';
        heading = t('settleUp.youPaidAmount', { amount: amountText });
        sub = methodLabel
            ? t('settleUp.toVia', { name: toName, method: methodLabel })
            : t('settleUp.toName', { name: toName });
    } else {
        iconName = 'swap-horizontal-outline';
        heading = t('settleUp.someonePaid', { from: fromName, to: toName });
        sub = methodLabel
            ? t('settleUp.via', { method: methodLabel })
            : null;
    }

    return (
        <View
            className="flex-row items-center mx-4 mt-3.5 mb-6 rounded-xl"
            style={{
                backgroundColor: '#ECFDF5',
                borderColor: '#A7F3D0',
                borderWidth: 1,
                paddingVertical: 14,
                paddingHorizontal: 14,
            }}
        >
            <View
                className="items-center justify-center bg-white"
                style={{ width: 36, height: 36, borderRadius: 9999 }}
            >
                <AppIcon name={iconName} size={20} color={colors.success} />
            </View>
            <View className="flex-1 mx-3 min-w-0">
                <Text
                    style={{
                        fontSize: 15,
                        fontWeight: '700',
                        color: '#047857',
                    }}
                >
                    {heading}
                </Text>
                {sub && (
                    <Text
                        style={{
                            fontSize: 12,
                            color: '#047857',
                            opacity: 0.8,
                            marginTop: 2,
                        }}
                    >
                        {sub}
                    </Text>
                )}
            </View>
        </View>
    );
}
```

- [ ] **Step 5: Rewrite `SettlementDetailBody`**

In the same file, replace the existing `SettlementDetailBody` function
(currently lines 663-743) with this new body:

```tsx
function SettlementDetailBody({
    settlement,
    memberMap,
    currentUserId,
    language,
}: {
    settlement: Settlement;
    memberMap: Record<string, GroupMemberLite>;
    currentUserId: string;
    language: 'en' | 'he';
}) {
    const { t } = useTranslation();
    const fromName = memberName(
        memberMap,
        settlement.fromUserId,
        currentUserId,
        t('settleUp.you'),
        t('common.unknown'),
    );
    const toName = memberName(
        memberMap,
        settlement.toUserId,
        currentUserId,
        t('settleUp.you'),
        t('common.unknown'),
    );
    const amountText = `${settlement.currency} ${settlement.amount.toFixed(2)}`;
    const heroDate = formatHeroDate(
        new Date(settlement.settlementDate ?? settlement.createdAt),
        language,
    );
    const methodLabel = settlement.paymentMethod
        ? t(`balances.paymentMethods.${settlement.paymentMethod}`)
        : null;

    return (
        <View>
            <SettlementHero
                fromName={fromName}
                toName={toName}
                amountText={amountText}
                heroDate={heroDate}
                isRtl={language === 'he'}
            />
            <SettlementInvolvementStrip
                settlement={settlement}
                currentUserId={currentUserId}
                fromName={fromName}
                toName={toName}
                amountText={amountText}
                methodLabel={methodLabel}
            />
        </View>
    );
}
```

- [ ] **Step 6: Delete the now-dead `DetailSection` helper**

In the same file, delete the `DetailSection` function component (currently
lines 745-758). It is only used by the old `SettlementDetailBody`.

- [ ] **Step 7: Run all tests in the file — expect PASS**

Run: `cd cost-share-app/apps/mobile && npm test -- __tests__/components/FeedItemDetailSheet.test.tsx`
Expected: PASS (6 tests: 1 expense, 1 settlement edit/delete, 4 new settlement body cases).

If any of the new tests fails, the failure messages will say which string was
expected — match the failing assertion against the corresponding i18n value
in `en.json` and the resolved key in the body.

- [ ] **Step 8: Commit**

```bash
git add cost-share-app/apps/mobile/components/FeedItemDetailSheet.tsx \
        cost-share-app/apps/mobile/__tests__/components/FeedItemDetailSheet.test.tsx
git commit -m "$(cat <<'EOF'
feat(mobile): redesign settlement detail sheet body

Replaces the old icon + three-DetailSection layout with the spec's
green-gradient hero (Payment chip · date · From -> amount -> To) and a
single involvement strip below tailored to the current user (received /
paid / third-party). Removes the now-dead DetailSection helper.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: RTL polish — popover anchor

The hero already swaps its center row to `row-reverse` and switches the
chevron name via `isRtl` (Task 3, Step 3, both wired via `language === 'he'`
inside `SettlementDetailBody`). The remaining piece is the kebab popover in
`DetailSheetHeader`, which is hardcoded to anchor `right: 4`. In Hebrew it
should anchor `left: 4` so it stays on the end-side of the kebab.

The hero `row-reverse` and chevron flip are visual; they're verified during
manual QA in Task 5 (the spec's RTL checklist line). We don't unit-test the
icon name because `AppIcon` wraps the underlying Ionicon in a `<View>`, so
`testID` doesn't sit on the same node as the `name` prop — the assertion
would be brittle.

**Files:**
- Modify: `cost-share-app/apps/mobile/components/DetailSheetHeader.tsx`

- [ ] **Step 1: Implement RTL popover anchor in `DetailSheetHeader`**

In `DetailSheetHeader.tsx`, pull in `useAppLanguage` and swap the popover
anchor side based on language. Add the import:

```tsx
import { useAppLanguage } from '../hooks/useRtlLayout';
```

Inside the component:

```tsx
    const language = useAppLanguage();
    const isRtl = language === 'he';
```

Replace the `menuCard` style with a dynamic version. Remove `right: 4` from
the `StyleSheet.create` block and apply it inline:

```tsx
                        <View
                            style={[
                                styles.menuCard,
                                isRtl ? { left: 4 } : { right: 4 },
                            ]}
                        >
```

…and update the static `menuCard` style to drop the `right: 4` line (just
the `right` property — leave the rest):

```tsx
    menuCard: {
        position: 'absolute',
        top: 42,
        minWidth: 160,
        padding: 4,
        ...
    },
```

- [ ] **Step 2: Run all detail-sheet tests — expect PASS**

Run: `cd cost-share-app/apps/mobile && npm test -- __tests__/components/FeedItemDetailSheet.test.tsx __tests__/components/DetailSheetHeader.test.tsx`
Expected: PASS — same 8 tests as after Task 3 (DetailSheetHeader: 2, FeedItemDetailSheet: 6). No new tests added.

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/apps/mobile/components/DetailSheetHeader.tsx
git commit -m "$(cat <<'EOF'
feat(mobile): anchor detail-sheet kebab popover to end-side in RTL

Reads useAppLanguage(); when Hebrew, the menu card anchors left: 4
instead of right: 4 so it stays on the same side as the kebab button.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Verification

Final cross-cutting check.

- [ ] **Step 1: Run the entire mobile test suite**

Run: `cd cost-share-app/apps/mobile && npm test`
Expected: all suites pass. Pay attention to anything in `__tests__/screens/groups/`
or `__tests__/components/` that may render `FeedItemDetailSheet` indirectly.

If a snapshot test fails because of the now-empty `menuOpen` state at the
top-level component or a removed prop, update the snapshot only after
confirming the new render is correct.

- [ ] **Step 2: Type-check the workspace**

If a TypeScript build step is wired anywhere, run it:

```bash
cd cost-share-app && npx tsc --noEmit -p apps/mobile/tsconfig.json
```

If there is no `tsconfig.json` at that path, run `npx tsc --noEmit` from the
mobile root. Expected: no errors. Common issues:
- Unused `useState` import in `FeedItemDetailSheet.tsx` — remove from
  the React import line.
- Missing `Settlement` type import in the new sub-component signatures —
  the existing file already imports `Settlement` at the top (line 22).

- [ ] **Step 3: Manual QA — open the app and walk the checklist from the spec**

Boot the app via `npm run start` (or `npm run start:device` on a physical
device). Open a group with at least one settlement in its activity feed.

Walk the spec's manual QA checklist
([`docs/superpowers/specs/2026-05-25-settlement-detail-sheet-design.md`](../specs/2026-05-25-settlement-detail-sheet-design.md)
"Manual QA checklist" section). Confirm each box. The most important checks:

- Header shows close · "SETTLEMENT" centered · kebab. No pill buttons.
- Hero shows correct From / To avatars, names, amount, full weekday-month-day
  date.
- Kebab opens a popover with Edit + Delete; outside tap dismisses; both
  callbacks navigate correctly (edit → `SettleUpSheet` prefilled; delete →
  confirm dialog).
- Recipient sees "You received …" + "From {payer} · via {method}".
- Payer sees "You paid …" + "To {recipient} · via {method}".
- Switch app language to Hebrew (Settings → Language) and verify the To
  column appears on the LEFT, the chevron points left, the kebab popover
  anchors to the left.
- A settlement created without a payment method shows no "via …" sub line.

- [ ] **Step 4: Run the visual reference for cross-check**

If iterating on visual fidelity, open
`docs/design_handoff_settlement_detail/prototype/settlement-detail.html` in
a browser and compare side-by-side with the mobile sheet. The handoff is
high-fidelity, so any noticeable deviation likely indicates a missed token
or a typo — fix and re-run tests before committing.

- [ ] **Step 5: Final commit (if anything was tweaked during manual QA)**

Only commit if you actually touched code in Step 3 or 4. If everything was
green and pixel-correct, no further commit is needed — the work is done.

```bash
# Only if needed:
git add <changed files>
git commit -m "$(cat <<'EOF'
chore(mobile): manual-QA fixups for settlement detail sheet
<describe the actual fix>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Done

After Task 5, the settlement detail sheet matches the spec, shares its top
bar with the expense sheet, and is covered by 9 new/updated unit tests. No
follow-up tickets unless manual QA surfaces something.
