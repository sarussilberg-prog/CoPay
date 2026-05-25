# Expense Date Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire a calendar popup to the date pill in the New/Edit Expense screen so users can pick any past or future date.

**Architecture:** Add a self-contained `DatePickerPopup` modal component (centered card, Cancel/Done, draft state, `react-native-calendars` grid) and toggle it from the existing `meta-date` pill in `AddExpenseScreen.tsx`. The screen's `date` state and the `expenseDate` field passed to `createExpense`/`updateExpense` already exist — only the picker UI is new.

**Tech Stack:** React Native 0.81 + Expo SDK 54, TypeScript, NativeWind/StyleSheet, `react-native-calendars` (pure-JS, no native modules), Jest + @testing-library/react-native, i18next.

**Spec:** `docs/superpowers/specs/2026-05-25-expense-date-picker-design.md`

---

## File map

- **Add:** `cost-share-app/apps/mobile/components/expenseV2/DatePickerPopup.tsx`
- **Add:** `cost-share-app/apps/mobile/__tests__/components/expenseV2/DatePickerPopup.test.tsx`
- **Modify:** `cost-share-app/apps/mobile/screens/expenses/AddExpenseScreen.tsx`
- **Modify:** `cost-share-app/apps/mobile/i18n/locales/en.json`
- **Modify:** `cost-share-app/apps/mobile/i18n/locales/he.json`
- **Modify:** `cost-share-app/apps/mobile/package.json` + `cost-share-app/package-lock.json`
- **Modify:** `cost-share-app/apps/mobile/__tests__/screens/expenses/AddExpenseScreen.test.tsx`
- **Modify:** `cost-share-app/apps/mobile/__tests__/screens/expenses/EditExpenseScreen.test.tsx`

All paths below are **relative to the repo root** (`/Users/avrahamsilberg/Desktop/projects/share-pay/kupa`).

---

## Task 1: Add `react-native-calendars` dependency

**Files:**
- Modify: `cost-share-app/apps/mobile/package.json`
- Modify: `cost-share-app/package-lock.json`

- [ ] **Step 1: Install the package in the mobile workspace**

Run (from the repo root):

```bash
cd cost-share-app && npm install react-native-calendars@^1.1300.0 -w @cost-share/mobile
```

Expected output: an `added N packages` line, no peer-dependency errors. If npm warns about React 19 / RN 0.81 incompatibility, downgrade to the latest minor that resolves cleanly (try `@1.1294.0`, then `@1.1286.0`).

- [ ] **Step 2: Verify the dep landed in the right `package.json`**

Run:

```bash
grep "react-native-calendars" cost-share-app/apps/mobile/package.json
```

Expected: one line under `dependencies`, e.g. `"react-native-calendars": "^1.1300.0",`.

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/apps/mobile/package.json cost-share-app/package-lock.json
git commit -m "build(mobile): add react-native-calendars for expense date picker"
```

---

## Task 2: Add the `datePickerTitle` i18n key

**Files:**
- Modify: `cost-share-app/apps/mobile/i18n/locales/en.json`
- Modify: `cost-share-app/apps/mobile/i18n/locales/he.json`

- [ ] **Step 1: Add key to `en.json`**

Open `cost-share-app/apps/mobile/i18n/locales/en.json`. Inside `expenses.v2`, after the `"today": "Today",` line, add:

```json
        "datePickerTitle": "Pick date",
```

(Preserve surrounding indentation — the file uses 4-space indent inside `expenses.v2`.)

- [ ] **Step 2: Add key to `he.json`**

Open `cost-share-app/apps/mobile/i18n/locales/he.json`. Inside `expenses.v2`, after the `"today": "היום",` line, add:

```json
        "datePickerTitle": "בחר תאריך",
```

- [ ] **Step 3: Verify JSON parses**

```bash
node -e "JSON.parse(require('fs').readFileSync('cost-share-app/apps/mobile/i18n/locales/en.json','utf8')); JSON.parse(require('fs').readFileSync('cost-share-app/apps/mobile/i18n/locales/he.json','utf8')); console.log('ok')"
```

Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/apps/mobile/i18n/locales/en.json cost-share-app/apps/mobile/i18n/locales/he.json
git commit -m "i18n(mobile): add expenses.v2.datePickerTitle"
```

---

## Task 3: `DatePickerPopup` component (TDD)

**Files:**
- Create: `cost-share-app/apps/mobile/components/expenseV2/DatePickerPopup.tsx`
- Create: `cost-share-app/apps/mobile/__tests__/components/expenseV2/DatePickerPopup.test.tsx`

We'll build the component test-first. We mock `react-native-calendars` to a stub that exposes day taps as buttons so tests don't depend on the library's internal cell layout.

- [ ] **Step 1: Create the test directory**

```bash
mkdir -p cost-share-app/apps/mobile/__tests__/components/expenseV2
```

- [ ] **Step 2: Write the failing test**

Create `cost-share-app/apps/mobile/__tests__/components/expenseV2/DatePickerPopup.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

jest.mock('react-native-calendars', () => {
    const React = require('react');
    const { Pressable, Text, View } = require('react-native');
    // Stub Calendar — exposes onDayPress as tappable buttons keyed by date string
    function Calendar(props: any) {
        const fire = (dateString: string) =>
            props.onDayPress?.({
                dateString,
                day: Number(dateString.slice(8, 10)),
                month: Number(dateString.slice(5, 7)),
                year: Number(dateString.slice(0, 4)),
                timestamp: 0,
            });
        return (
            <View testID="mock-calendar">
                <Text testID="mock-calendar-current">{props.current}</Text>
                <Pressable testID="mock-day-2026-06-15" onPress={() => fire('2026-06-15')}>
                    <Text>tap-day</Text>
                </Pressable>
                <Pressable testID="mock-day-2025-01-01" onPress={() => fire('2025-01-01')}>
                    <Text>tap-other</Text>
                </Pressable>
            </View>
        );
    }
    return { Calendar, LocaleConfig: { locales: {}, defaultLocale: 'en' } };
});

jest.mock('../../../hooks/useRtlLayout', () => ({
    useAppLanguage: () => 'en',
    useRtlLayout: () => false,
}));

import { DatePickerPopup } from '../../../components/expenseV2/DatePickerPopup';

describe('DatePickerPopup', () => {
    it('renders nothing when visible=false', () => {
        const { queryByTestId } = render(
            <DatePickerPopup
                visible={false}
                initialDate={new Date(2026, 4, 25)}
                onCancel={jest.fn()}
                onConfirm={jest.fn()}
            />,
        );
        expect(queryByTestId('date-picker-popup')).toBeNull();
    });

    it('opens with the initial date highlighted', () => {
        const { getByTestId } = render(
            <DatePickerPopup
                visible
                initialDate={new Date(2026, 4, 25)}
                onCancel={jest.fn()}
                onConfirm={jest.fn()}
            />,
        );
        expect(getByTestId('date-picker-popup')).toBeTruthy();
        expect(getByTestId('mock-calendar-current').props.children).toBe('2026-05-25');
    });

    it('calls onConfirm with the picked date when Done is pressed', () => {
        const onConfirm = jest.fn();
        const { getByTestId } = render(
            <DatePickerPopup
                visible
                initialDate={new Date(2026, 4, 25)}
                onCancel={jest.fn()}
                onConfirm={onConfirm}
            />,
        );
        fireEvent.press(getByTestId('mock-day-2026-06-15'));
        fireEvent.press(getByTestId('date-picker-done'));
        expect(onConfirm).toHaveBeenCalledTimes(1);
        const arg = onConfirm.mock.calls[0][0] as Date;
        expect(arg.getFullYear()).toBe(2026);
        expect(arg.getMonth()).toBe(5); // June
        expect(arg.getDate()).toBe(15);
    });

    it('calls onConfirm with the initial date if user taps Done without changing the day', () => {
        const onConfirm = jest.fn();
        const { getByTestId } = render(
            <DatePickerPopup
                visible
                initialDate={new Date(2026, 4, 25)}
                onCancel={jest.fn()}
                onConfirm={onConfirm}
            />,
        );
        fireEvent.press(getByTestId('date-picker-done'));
        const arg = onConfirm.mock.calls[0][0] as Date;
        expect(arg.getFullYear()).toBe(2026);
        expect(arg.getMonth()).toBe(4);
        expect(arg.getDate()).toBe(25);
    });

    it('calls onCancel and not onConfirm when Cancel is pressed', () => {
        const onCancel = jest.fn();
        const onConfirm = jest.fn();
        const { getByTestId } = render(
            <DatePickerPopup
                visible
                initialDate={new Date(2026, 4, 25)}
                onCancel={onCancel}
                onConfirm={onConfirm}
            />,
        );
        fireEvent.press(getByTestId('mock-day-2026-06-15'));
        fireEvent.press(getByTestId('date-picker-cancel'));
        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('resets the highlighted day when reopened with a new initialDate', () => {
        const { getByTestId, rerender } = render(
            <DatePickerPopup
                visible={false}
                initialDate={new Date(2026, 4, 25)}
                onCancel={jest.fn()}
                onConfirm={jest.fn()}
            />,
        );
        rerender(
            <DatePickerPopup
                visible
                initialDate={new Date(2026, 4, 25)}
                onCancel={jest.fn()}
                onConfirm={jest.fn()}
            />,
        );
        // user picks a different day but cancels
        fireEvent.press(getByTestId('mock-day-2025-01-01'));
        rerender(
            <DatePickerPopup
                visible={false}
                initialDate={new Date(2026, 4, 25)}
                onCancel={jest.fn()}
                onConfirm={jest.fn()}
            />,
        );
        // reopen with a different initial
        rerender(
            <DatePickerPopup
                visible
                initialDate={new Date(2024, 6, 4)}
                onCancel={jest.fn()}
                onConfirm={jest.fn()}
            />,
        );
        expect(getByTestId('mock-calendar-current').props.children).toBe('2024-07-04');
    });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run (from the mobile workspace):

```bash
cd cost-share-app/apps/mobile && npx jest __tests__/components/expenseV2/DatePickerPopup.test.tsx --runInBand
```

Expected: FAIL with "Cannot find module '../../../components/expenseV2/DatePickerPopup'".

- [ ] **Step 4: Implement `DatePickerPopup`**

Create `cost-share-app/apps/mobile/components/expenseV2/DatePickerPopup.tsx`:

```tsx
/**
 * DatePickerPopup — centered modal calendar for picking an expense date.
 * Internal draft state lets the user change selection before confirming.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { useTranslation } from 'react-i18next';

import { Text } from '../AppText';
import { useAppLanguage } from '../../hooks/useRtlLayout';
import { colors } from '../../theme';

LocaleConfig.locales['he'] = {
    monthNames: [
        'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
        'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
    ],
    monthNamesShort: [
        'ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני',
        'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳',
    ],
    dayNames: ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'],
    dayNamesShort: ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'],
};

function toIsoDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function fromIsoDate(iso: string): Date {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
}

export interface DatePickerPopupProps {
    visible: boolean;
    initialDate: Date;
    onCancel: () => void;
    onConfirm: (date: Date) => void;
}

export function DatePickerPopup({
    visible,
    initialDate,
    onCancel,
    onConfirm,
}: DatePickerPopupProps) {
    const { t } = useTranslation();
    const language = useAppLanguage();
    const [draft, setDraft] = useState<string>(toIsoDate(initialDate));

    useEffect(() => {
        if (visible) setDraft(toIsoDate(initialDate));
    }, [visible, initialDate]);

    useEffect(() => {
        LocaleConfig.defaultLocale = language === 'he' ? 'he' : 'en';
    }, [language]);

    const markedDates = useMemo(
        () => ({
            [draft]: {
                selected: true,
                selectedColor: colors.primaryDark,
            },
        }),
        [draft],
    );

    if (!visible) return null;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onCancel}
        >
            <Pressable
                style={styles.backdrop}
                onPress={onCancel}
                testID="date-picker-popup"
            >
                <Pressable
                    style={styles.card}
                    onPress={e => e.stopPropagation()}
                >
                    <View style={styles.header}>
                        <Pressable
                            onPress={onCancel}
                            style={styles.headerSide}
                            testID="date-picker-cancel"
                        >
                            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
                        </Pressable>
                        <Text style={styles.title}>{t('expenses.v2.datePickerTitle')}</Text>
                        <Pressable
                            onPress={() => onConfirm(fromIsoDate(draft))}
                            style={styles.headerSide}
                            testID="date-picker-done"
                        >
                            <Text style={styles.doneText}>{t('common.done')}</Text>
                        </Pressable>
                    </View>
                    <Calendar
                        current={draft}
                        markedDates={markedDates}
                        onDayPress={day => setDraft(day.dateString)}
                        theme={{
                            selectedDayBackgroundColor: colors.primaryDark,
                            selectedDayTextColor: '#FFFFFF',
                            todayTextColor: colors.primaryDark,
                            arrowColor: colors.primaryDark,
                            monthTextColor: colors.text.primary,
                            textMonthFontWeight: '600',
                        }}
                    />
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
    },
    card: {
        width: '100%',
        maxWidth: 340,
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        paddingVertical: 8,
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 8 },
        elevation: 8,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 8,
        paddingVertical: 8,
    },
    headerSide: {
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    title: {
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 0.72,
        textTransform: 'uppercase',
        color: colors.text.secondary,
    },
    cancelText: {
        fontSize: 15,
        fontWeight: '500',
        color: colors.gray600,
    },
    doneText: {
        fontSize: 15,
        fontWeight: '700',
        color: colors.primaryDark,
    },
});
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd cost-share-app/apps/mobile && npx jest __tests__/components/expenseV2/DatePickerPopup.test.tsx --runInBand
```

Expected: all 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add cost-share-app/apps/mobile/components/expenseV2/DatePickerPopup.tsx cost-share-app/apps/mobile/__tests__/components/expenseV2/DatePickerPopup.test.tsx
git commit -m "feat(mobile): add DatePickerPopup component for expense date selection"
```

---

## Task 4: Wire `DatePickerPopup` into `AddExpenseScreen` (TDD)

**Files:**
- Modify: `cost-share-app/apps/mobile/screens/expenses/AddExpenseScreen.tsx`
- Modify: `cost-share-app/apps/mobile/__tests__/screens/expenses/AddExpenseScreen.test.tsx`
- Modify: `cost-share-app/apps/mobile/__tests__/screens/expenses/EditExpenseScreen.test.tsx`

The screen test should be updated to mock the calendar library the same way, then we add a test that the date pill opens the popup and the chosen date flows through to `createExpense`.

- [ ] **Step 1: Add the calendar mock and a new failing test to `AddExpenseScreen.test.tsx`**

Open `cost-share-app/apps/mobile/__tests__/screens/expenses/AddExpenseScreen.test.tsx`. Just below the existing `jest.mock('@react-navigation/native', ...)` block at the top, add:

```tsx
jest.mock('react-native-calendars', () => {
    const React = require('react');
    const { Pressable, Text, View } = require('react-native');
    function Calendar(props: any) {
        return (
            <View testID="mock-calendar">
                <Pressable
                    testID="mock-day-2026-06-15"
                    onPress={() =>
                        props.onDayPress?.({
                            dateString: '2026-06-15',
                            day: 15,
                            month: 6,
                            year: 2026,
                            timestamp: 0,
                        })
                    }
                >
                    <Text>tap-day</Text>
                </Pressable>
            </View>
        );
    }
    return { Calendar, LocaleConfig: { locales: {}, defaultLocale: 'en' } };
});
```

Then at the bottom of the `describe('AddExpenseScreen — v2', ...)` block (inside the closing `});`), add this new test:

```tsx
    it('opens the date picker, sends the picked date to createExpense', async () => {
        mockCreateExpense.mockResolvedValueOnce({ id: 'e1' } as any);
        const { findByTestId, queryByTestId } = renderWithQuery(<AddExpenseScreen />);

        fireEvent.changeText(await findByTestId('description-input'), 'Coffee');
        fireEvent.changeText(await findByTestId('amount-display'), '10');

        expect(queryByTestId('date-picker-popup')).toBeNull();
        fireEvent.press(await findByTestId('meta-date'));
        expect(await findByTestId('date-picker-popup')).toBeTruthy();

        fireEvent.press(await findByTestId('mock-day-2026-06-15'));
        fireEvent.press(await findByTestId('date-picker-done'));

        fireEvent.press(await findByTestId('add-expense-submit'));
        await waitFor(() => expect(mockCreateExpense).toHaveBeenCalled());
        const dto = mockCreateExpense.mock.calls[0][0] as { expenseDate: Date };
        expect(dto.expenseDate.getFullYear()).toBe(2026);
        expect(dto.expenseDate.getMonth()).toBe(5);
        expect(dto.expenseDate.getDate()).toBe(15);
    });

    it('keeps the original date when the picker is cancelled', async () => {
        const { findByTestId, queryByTestId } = renderWithQuery(<AddExpenseScreen />);
        fireEvent.press(await findByTestId('meta-date'));
        await findByTestId('date-picker-popup');
        fireEvent.press(await findByTestId('mock-day-2026-06-15'));
        fireEvent.press(await findByTestId('date-picker-cancel'));
        await waitFor(() => expect(queryByTestId('date-picker-popup')).toBeNull());
    });
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
cd cost-share-app/apps/mobile && npx jest __tests__/screens/expenses/AddExpenseScreen.test.tsx -t "date picker" --runInBand
```

Expected: FAIL — `meta-date` press does nothing, `date-picker-popup` never appears.

- [ ] **Step 3: Wire `DatePickerPopup` into `AddExpenseScreen.tsx`**

In `cost-share-app/apps/mobile/screens/expenses/AddExpenseScreen.tsx`:

**a.** Add the import alongside the other expenseV2 imports (near line 36-42):

```tsx
import { DatePickerPopup } from '../../components/expenseV2/DatePickerPopup';
```

**b.** Add new state next to the other modal-visibility states (just after `const [currencyPickerVisible, setCurrencyPickerVisible] = useState(false);` at line 139):

```tsx
    const [datePickerVisible, setDatePickerVisible] = useState(false);
```

**c.** Replace the no-op `onPress` on the date pill. Find this block (currently at lines 537-545):

```tsx
                    <QuietIconPill
                        icon="calendar-outline"
                        label={dateLabel}
                        active
                        onPress={() => {
                            // Date picker is out of scope per v2 spec — date defaults to today.
                        }}
                        testID="meta-date"
                    />
```

Replace with:

```tsx
                    <QuietIconPill
                        icon="calendar-outline"
                        label={dateLabel}
                        active
                        onPress={() => setDatePickerVisible(true)}
                        testID="meta-date"
                    />
```

**d.** Render the popup alongside the other modals. Find the `CurrencyPicker` block (near line 569-574) and add immediately after it:

```tsx
            <DatePickerPopup
                visible={datePickerVisible}
                initialDate={date}
                onCancel={() => setDatePickerVisible(false)}
                onConfirm={next => {
                    setDate(next);
                    setDatePickerVisible(false);
                }}
            />
```

- [ ] **Step 4: Run the new tests to verify they pass**

```bash
cd cost-share-app/apps/mobile && npx jest __tests__/screens/expenses/AddExpenseScreen.test.tsx -t "date picker" --runInBand
```

Expected: both new tests PASS.

- [ ] **Step 5: Apply the same calendar mock to `EditExpenseScreen.test.tsx`**

`EditExpenseScreen` is a re-export of `AddExpenseScreen`, so its test file renders the same component. Open `cost-share-app/apps/mobile/__tests__/screens/expenses/EditExpenseScreen.test.tsx` and add the same `jest.mock('react-native-calendars', ...)` block as in Step 1, placed just below the existing `jest.mock('@react-navigation/native', ...)` block.

(Do not add new test cases here — just the mock, so the existing edit-mode tests don't choke on the unmocked calendar dependency when `AddExpenseScreen` now imports `DatePickerPopup`.)

- [ ] **Step 6: Run both screen test files to verify nothing regressed**

```bash
cd cost-share-app/apps/mobile && npx jest __tests__/screens/expenses/AddExpenseScreen.test.tsx __tests__/screens/expenses/EditExpenseScreen.test.tsx --runInBand
```

Expected: all tests PASS (existing + 2 new).

- [ ] **Step 7: Run the full mobile test suite to catch wider regressions**

```bash
cd cost-share-app/apps/mobile && npx jest --runInBand
```

Expected: all tests PASS. If any unrelated test now fails due to importing the calendar transitively, add the same `jest.mock('react-native-calendars', ...)` stub at the top of that file.

- [ ] **Step 8: Commit**

```bash
git add cost-share-app/apps/mobile/screens/expenses/AddExpenseScreen.tsx cost-share-app/apps/mobile/__tests__/screens/expenses/AddExpenseScreen.test.tsx cost-share-app/apps/mobile/__tests__/screens/expenses/EditExpenseScreen.test.tsx
git commit -m "feat(mobile): wire DatePickerPopup to expense date pill"
```

---

## Task 5: Manual smoke test in the simulator

**Files:** none modified.

- [ ] **Step 1: Start the dev server**

From the repo root:

```bash
cd cost-share-app && npm run dev:mobile
```

Wait for Metro to be ready, then press `i` to open the iOS simulator.

- [ ] **Step 2: Manually verify**

In the simulator:
1. Open a group, tap the "Add expense" / "+" button.
2. Tap the date pill (next to the camera pill) — the calendar popup should fade in.
3. Verify the current date is highlighted.
4. Tap a different day in another month (use the calendar arrows). Verify highlight moves.
5. Tap **Done**. Verify the pill label updates to the chosen date (e.g. "Jun 15").
6. Tap the pill again, tap a different day, tap **Cancel**. Verify the pill label stays unchanged.
7. Tap the pill again, tap the dim backdrop outside the card. Verify it dismisses without changing the date.
8. Fill in description + amount, tap **Save**. Open the expense from the list and confirm the date matches.
9. Open an existing expense in **Edit** mode and repeat steps 2-5 — verify the popup preloads the expense's existing date, not today.
10. Switch app language to Hebrew (if available in settings) and repeat step 2 — verify the calendar shows Hebrew month/day names and the Cancel/Done/Title are translated.

If any step fails, return to the relevant task and add a fix.

- [ ] **Step 3: Stop the dev server**

`Ctrl-C` in the terminal running Metro.

---

## Done — final verification

- [ ] **Step 1: Confirm clean git status**

```bash
git status
```

Expected: working tree clean, on branch `fix-expense-screen`, with 4 new commits ahead of the previous `HEAD`.

- [ ] **Step 2: List the commits**

```bash
git log --oneline -5
```

Expected (top to bottom):
- `feat(mobile): wire DatePickerPopup to expense date pill`
- `feat(mobile): add DatePickerPopup component for expense date selection`
- `i18n(mobile): add expenses.v2.datePickerTitle`
- `build(mobile): add react-native-calendars for expense date picker`
- `docs(spec): expense date picker design`
