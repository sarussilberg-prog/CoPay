# First-group onboarding interactive steps — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework `OnboardingCreateGroupScreen` into an interactive accordion stepper where each step (name, category, currency, image, members) reveals its input inline.

**Architecture:** A new presentational `OnboardingStepCard` (tappable header + collapsible body, RN core `Animated` chevron + `LayoutAnimation` expand) wraps the existing inputs (`Input`, `GroupTypeSelector`, `CurrencyPicker`, `CreateGroupCoverPreview`, and an extracted `GroupMembersField`). The screen owns which step is open. The static `CreateGroupGuidancePanel` and the flat `CreateGroupFormFields` usage are removed from onboarding; the standard `CreateGroupScreen` is untouched.

**Tech Stack:** React Native 0.81 / Expo SDK 54 (per `package.json`), TypeScript, NativeWind, react-i18next, Jest + @testing-library/react-native.

**Spec:** [docs/superpowers/specs/2026-06-02-onboarding-first-group-interactive-steps-design.md](../specs/2026-06-02-onboarding-first-group-interactive-steps-design.md)

**Working directory for ALL commands:** `cost-share-app/apps/mobile` (run `cd cost-share-app/apps/mobile` first; paths below are relative to it).

**Conventions observed in this repo (do not deviate):**
- Tests mock `react-i18next` so `t(key)` returns the **key** string — assert on key strings, not Hebrew copy.
- `AppIcon`, `Input`, `Button` forward `testID`. `Button`'s `disabled` surfaces as `accessibilityState.disabled` on its host node.
- Indentation is 4 spaces.

---

## Council review (2026-06-02) — applied revisions

A 4-reviewer council vetted this plan. Outcome:

- **Rejected (verified false):** two reviewers claimed the rewrite deletes shipped features (`previewMode`, language toggle, hero, name suggestions, floating button, locale-aware currency, safe-area inset, `submitReady`, toast helpers). Verified against the **actual** `screens/onboarding/OnboardingCreateGroupScreen.tsx` (202 lines) and its sole caller `components/AuthenticatedAppGate.tsx:50` (passes `onDone` only): **none of those exist**. The rewrite below is faithful to the real screen. (Systematic agent hallucination — spot-checked and discarded.)
- **Applied:** (1) dedupe `GroupMembersField` into `CreateGroupFormFields` now — it is guarded by `CreateGroupScreen.test.tsx` (Task 2); (2) remove now-dead `groups.createForm.guidance` i18n keys (Task 5); (3) add `expo-image-picker` + `AddMembersSheet` test mocks and three behavior tests — empty-name, image-upload, members (Task 4); (4) step-card accessibility label + title truncation + body fade + expanded-border polish (Task 3); (5) verification matches CI (`npm test --workspace=@cost-share/mobile -- --ci`) and requires `npm install` first (Task 5).
- **Deferred (follow-ups):** scroll-to-opened-step (needs a ScrollView ref through `CreateGroupFormShell`), drop the cover hero's shadow/margin when embedded, dedupe `pickImage`.

---

## File Structure

- Create: `components/groups/GroupMembersField.tsx` — member-avatars + add row (extracted, used by onboarding AND `CreateGroupFormFields`).
- Create: `components/groups/OnboardingStepCard.tsx` — accordion step card.
- Modify: `components/groups/CreateGroupFormFields.tsx` — render `GroupMembersField` (behavior-preserving dedupe).
- Modify: `screens/onboarding/OnboardingCreateGroupScreen.tsx` — compose 5 step cards.
- Delete: `components/groups/CreateGroupGuidancePanel.tsx` — now unused.
- Modify: `i18n/locales/he.json`, `i18n/locales/en.json` — header rename, add `onboarding.create.steps.*`, remove dead `groups.createForm.guidance`.
- Create tests: `__tests__/components/groups/GroupMembersField.test.tsx`, `__tests__/components/groups/OnboardingStepCard.test.tsx`, `__tests__/screens/onboarding/OnboardingCreateGroupScreen.test.tsx`.

---

## Task 1: i18n — header rename + step copy

**Files:**
- Modify: `i18n/locales/he.json`
- Modify: `i18n/locales/en.json`

- [ ] **Step 1: Edit `he.json`** — under `onboarding.create`, change the `header` value and add a `steps` object.

Change:
```json
"header": "קופה חדשה",
```
to:
```json
"header": "הקופה הראשונה",
```

Add this `steps` object as a new key inside the `onboarding.create` object (e.g. right after `"header"`; remember to add a trailing comma on the line before it):
```json
"steps": {
    "intro": "בואו נפתח את הקופה הראשונה — שלב אחרי שלב.",
    "optional": "אופציונלי",
    "name": {
        "title": "שם הקופה",
        "helper": "תנו שם שכולם מזהים (למשל «טיול לים» או «דירה 2025»)."
    },
    "category": {
        "title": "קטגוריה",
        "helper": "סוג הקופה קובע את הצבעים — אפשר לשנות אחר כך."
    },
    "currency": {
        "title": "מטבע"
    },
    "image": {
        "title": "תמונת כריכה",
        "summaryDefault": "ברירת מחדל",
        "summarySet": "תמונה נבחרה"
    },
    "members": {
        "title": "הזמנת חברים",
        "helper": "שולחים בוואטסאפ, לינק או מאנשי קשר — וכל החבר'ה בקופה.",
        "summarySuffix": "חברים"
    }
},
```

- [ ] **Step 2: Edit `en.json`** — mirror the same structure under `onboarding.create`.

Change `header` to:
```json
"header": "Your first kupa",
```
Add:
```json
"steps": {
    "intro": "Let's open your first kupa — step by step.",
    "optional": "Optional",
    "name": {
        "title": "Kupa name",
        "helper": "Pick a name everyone recognizes (e.g. \"Beach trip\" or \"Apt 2025\")."
    },
    "category": {
        "title": "Category",
        "helper": "The type sets the colors — you can change it later."
    },
    "currency": {
        "title": "Currency"
    },
    "image": {
        "title": "Cover image",
        "summaryDefault": "Default",
        "summarySet": "Image selected"
    },
    "members": {
        "title": "Invite members",
        "helper": "Send via WhatsApp, a link, or contacts — everyone's in the kupa.",
        "summarySuffix": "members"
    }
},
```

- [ ] **Step 3: Verify both files are valid JSON and keys exist**

Run:
```bash
node -e "const he=require('./i18n/locales/he.json'); const en=require('./i18n/locales/en.json'); if(he.onboarding.create.header!=='הקופה הראשונה') throw new Error('he header'); for (const f of [he,en]){const s=f.onboarding.create.steps; ['intro','optional','name','category','currency','image','members'].forEach(k=>{if(!s[k]) throw new Error('missing '+k)});} console.log('i18n OK');"
```
Expected: `i18n OK` (no thrown error).

- [ ] **Step 4: Commit**

```bash
git add i18n/locales/he.json i18n/locales/en.json
git commit -m "i18n: first-group onboarding header rename + step copy"
```

---

## Task 2: GroupMembersField component

**Files:**
- Create: `components/groups/GroupMembersField.tsx`
- Test: `__tests__/components/groups/GroupMembersField.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/groups/GroupMembersField.test.tsx`:
```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import type { User } from '@cost-share/shared';
import { GroupMembersField } from '../../../components/groups/GroupMembersField';

const u = (id: string, name: string): User =>
    ({
        id,
        name,
        email: `${id}@x.com`,
        inviteToken: `${id}tok12345`,
        defaultCurrency: 'ILS',
        language: 'he',
        isActive: true,
        isAdmin: false,
        createdAt: new Date(),
        updatedAt: new Date(),
    } as User);

describe('GroupMembersField', () => {
    it('renders an add button that calls onAddMembers', () => {
        const onAdd = jest.fn();
        const { getByTestId } = render(
            <GroupMembersField
                displayMembers={[u('u1', 'Alice')]}
                currentUserId="u1"
                currentUser={u('u1', 'Alice')}
                onAddMembers={onAdd}
                onRemoveMember={jest.fn()}
            />,
        );
        fireEvent.press(getByTestId('group-form-add-member'));
        expect(onAdd).toHaveBeenCalledTimes(1);
    });

    it('shows a remove control for non-self members and calls onRemoveMember', () => {
        const onRemove = jest.fn();
        const bob = u('u2', 'Bob');
        const { getByTestId } = render(
            <GroupMembersField
                displayMembers={[u('u1', 'Alice'), bob]}
                currentUserId="u1"
                currentUser={u('u1', 'Alice')}
                onAddMembers={jest.fn()}
                onRemoveMember={onRemove}
            />,
        );
        fireEvent.press(getByTestId('group-form-member-remove-u2'));
        expect(onRemove).toHaveBeenCalledWith(bob);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest __tests__/components/groups/GroupMembersField.test.tsx`
Expected: FAIL — cannot find module `GroupMembersField`.

- [ ] **Step 3: Create the component**

Create `components/groups/GroupMembersField.tsx`:
```tsx
/**
 * GroupMembersField — member avatars + add button (shared members row).
 */

import React from 'react';
import { View, ScrollView, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { User } from '@cost-share/shared';
import { MemberAvatar } from '../MemberAvatar';
import { AppIcon } from '../AppIcon';
import { Text } from '../AppText';
import { colors } from '../../theme';
import { getAvatarUrl, getDisplayName } from '../../lib/userDisplay';

type Props = {
    displayMembers: User[];
    currentUserId: string | null;
    currentUser: User | null | undefined;
    onAddMembers: () => void;
    onRemoveMember: (member: User) => void;
    testID?: string;
};

export function GroupMembersField({
    displayMembers,
    currentUserId,
    currentUser,
    onAddMembers,
    onRemoveMember,
    testID,
}: Props) {
    const { t } = useTranslation();

    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingVertical: 4, gap: 12 }}
            testID={testID}
        >
            {displayMembers.map((m) => {
                const isSelf = m.id === currentUserId || m.id === currentUser?.id;
                return (
                    <View
                        key={m.id}
                        className="items-center"
                        style={{ width: 56 }}
                        testID={`group-form-member-${m.id}`}
                    >
                        <View>
                            <MemberAvatar
                                name={getDisplayName(m, t)}
                                avatarUrl={getAvatarUrl(m) ?? undefined}
                                size="md"
                            />
                            {!isSelf && (
                                <TouchableOpacity
                                    onPress={() => onRemoveMember(m)}
                                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                    accessibilityRole="button"
                                    accessibilityLabel={t('groups.removeMember')}
                                    testID={`group-form-member-remove-${m.id}`}
                                    className="absolute -top-1 -end-1 bg-white border border-gray-200 items-center justify-center"
                                    style={{ width: 22, height: 22, borderRadius: 11 }}
                                >
                                    <AppIcon name="close" size={12} color={colors.gray600} />
                                </TouchableOpacity>
                            )}
                        </View>
                        <Text
                            numberOfLines={1}
                            className="text-xs text-gray-600 mt-1 w-14 text-center"
                        >
                            {getDisplayName(m, t)}
                        </Text>
                    </View>
                );
            })}
            <TouchableOpacity
                onPress={onAddMembers}
                activeOpacity={0.7}
                className="items-center"
                style={{ width: 56 }}
                testID="group-form-add-member"
            >
                <View
                    className="bg-primary-extra-light border-2 border-dashed border-primary/40 items-center justify-center"
                    style={{ width: 44, height: 44, borderRadius: 22 }}
                >
                    <AppIcon name="add" size={22} color={colors.primary} />
                </View>
                <Text className="text-xs text-primary font-semibold mt-1 w-14 text-center">
                    {t('groups.members.add')}
                </Text>
            </TouchableOpacity>
        </ScrollView>
    );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest __tests__/components/groups/GroupMembersField.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Refactor `CreateGroupFormFields` to use `GroupMembersField`** (behavior-preserving — guarded by `CreateGroupScreen.test.tsx`).

In `components/groups/CreateGroupFormFields.tsx`, replace the import block (the `import` lines at the top, currently lines 5–20) with the following — it drops the now-unused `View`, `ScrollView`, `MemberAvatar`, `AppIcon`, `colors`, `getAvatarUrl`, `getDisplayName` and adds `GroupMembersField`:
```tsx
import React, { useCallback } from 'react';
import { TouchableOpacity } from 'react-native';
import { platformAlert } from '../../lib/platformAlert';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { GroupType, User } from '@cost-share/shared';
import { Input } from '../Input';
import { GroupTypeSelector } from '../GroupTypeSelector';
import { CurrencyPicker } from '../CurrencyPicker';
import { Text } from '../AppText';
import { CreateGroupCoverPreview } from './CreateGroupCoverPreview';
import { GroupFormSection } from './CreateGroupFormShell';
import { GroupMembersField } from './GroupMembersField';
```

Then, inside the members `GroupFormSection`, replace the entire `<ScrollView horizontal ...> ... </ScrollView>` block with:
```tsx
                <GroupMembersField
                    displayMembers={displayMembers}
                    currentUserId={currentUserId}
                    currentUser={currentUser}
                    onAddMembers={onAddMembers}
                    onRemoveMember={onRemoveMember}
                />
```
Leave the wrapping `<GroupFormSection title={t('groups.members.title')} testID="group-form-members-section">` and its `membersHint` `<Text>` unchanged. (The `group-form-add-member` / `group-form-member-*` testIDs are identical in `GroupMembersField`, so behavior is preserved.)

- [ ] **Step 6: Run the guarding test to confirm no regression**

Run: `npx jest __tests__/screens/groups/CreateGroupScreen.test.tsx`
Expected: PASS — unchanged behavior.

- [ ] **Step 7: Commit**

```bash
git add components/groups/GroupMembersField.tsx __tests__/components/groups/GroupMembersField.test.tsx components/groups/CreateGroupFormFields.tsx
git commit -m "refactor: extract GroupMembersField and reuse in CreateGroupFormFields"
```

---

## Task 3: OnboardingStepCard component

**Files:**
- Create: `components/groups/OnboardingStepCard.tsx`
- Test: `__tests__/components/groups/OnboardingStepCard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/groups/OnboardingStepCard.test.tsx`:
```tsx
import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { OnboardingStepCard } from '../../../components/groups/OnboardingStepCard';

const base = {
    index: 1,
    title: 'שם הקופה',
    complete: false,
    expanded: false,
    onToggle: jest.fn(),
    children: <Text>BODY</Text>,
    testID: 'step-name',
};

describe('OnboardingStepCard', () => {
    it('hides the body when collapsed and shows it when expanded', () => {
        const { queryByText, rerender } = render(
            <OnboardingStepCard {...base} expanded={false} />,
        );
        expect(queryByText('BODY')).toBeNull();
        rerender(<OnboardingStepCard {...base} expanded={true} />);
        expect(queryByText('BODY')).toBeTruthy();
    });

    it('calls onToggle when the header is pressed', () => {
        const onToggle = jest.fn();
        const { getByTestId } = render(
            <OnboardingStepCard {...base} onToggle={onToggle} />,
        );
        fireEvent.press(getByTestId('step-name-header'));
        expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('shows the index when incomplete and a check when complete', () => {
        const { getByText, queryByTestId, rerender } = render(
            <OnboardingStepCard {...base} index={2} complete={false} />,
        );
        expect(getByText('2')).toBeTruthy();
        expect(queryByTestId('step-name-check')).toBeNull();
        rerender(<OnboardingStepCard {...base} index={2} complete={true} />);
        expect(queryByTestId('step-name-check')).toBeTruthy();
    });

    it('shows the summary only while collapsed', () => {
        const { queryByTestId, rerender } = render(
            <OnboardingStepCard {...base} summary="טיול" expanded={false} />,
        );
        expect(queryByTestId('step-name-summary')).toBeTruthy();
        rerender(<OnboardingStepCard {...base} summary="טיול" expanded={true} />);
        expect(queryByTestId('step-name-summary')).toBeNull();
    });

    it('renders the optional label when provided', () => {
        const { getByText } = render(
            <OnboardingStepCard {...base} optionalLabel="אופציונלי" />,
        );
        expect(getByText('אופציונלי')).toBeTruthy();
    });

    it('exposes an accessibility label with the number, title and summary', () => {
        const { getByTestId } = render(
            <OnboardingStepCard {...base} index={3} title="מטבע" summary="ILS" />,
        );
        const label = getByTestId('step-name-header').props.accessibilityLabel;
        expect(label).toContain('3');
        expect(label).toContain('מטבע');
        expect(label).toContain('ILS');
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest __tests__/components/groups/OnboardingStepCard.test.tsx`
Expected: FAIL — cannot find module `OnboardingStepCard`.

- [ ] **Step 3: Create the component**

Create `components/groups/OnboardingStepCard.tsx`:
```tsx
/**
 * OnboardingStepCard — interactive accordion step for first-group onboarding.
 * Tappable header (numbered badge → check, title, optional tag, summary, chevron)
 * + collapsible body. Uses RN core Animated (chevron) + LayoutAnimation (expand)
 * deliberately — the repo has no reanimated jest mock.
 */

import React, { useEffect, useRef } from 'react';
import {
    View,
    TouchableOpacity,
    Animated,
    Easing,
    LayoutAnimation,
    Platform,
    UIManager,
} from 'react-native';
import { Text } from '../AppText';
import { AppIcon } from '../AppIcon';
import { colors } from '../../theme';
import { rtlTextClassName, useRtlLayout } from '../../hooks/useRtlLayout';

if (
    Platform.OS === 'android' &&
    UIManager.setLayoutAnimationEnabledExperimental
) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = {
    index: number;
    title: string;
    summary?: string;
    helper?: string;
    optionalLabel?: string;
    complete: boolean;
    expanded: boolean;
    onToggle: () => void;
    children: React.ReactNode;
    testID?: string;
};

export function OnboardingStepCard({
    index,
    title,
    summary,
    helper,
    optionalLabel,
    complete,
    expanded,
    onToggle,
    children,
    testID,
}: Props) {
    const isRtl = useRtlLayout();
    const rotate = useRef(new Animated.Value(expanded ? 1 : 0)).current;

    useEffect(() => {
        Animated.timing(rotate, {
            toValue: expanded ? 1 : 0,
            duration: 180,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [expanded, rotate]);

    const rotateDeg = rotate.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '180deg'],
    });

    const handlePress = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        onToggle();
    };

    return (
        <View
            testID={testID}
            className="mb-3 rounded-2xl bg-white border border-slate-200/80 px-4 py-3.5"
            style={{
                borderColor: expanded ? 'rgba(96,165,250,0.55)' : undefined,
                shadowColor: '#0F172A',
                shadowOffset: { width: 0, height: expanded ? 8 : 4 },
                shadowOpacity: expanded ? 0.08 : 0.04,
                shadowRadius: expanded ? 16 : 12,
                elevation: expanded ? 4 : 2,
            }}
        >
            <TouchableOpacity
                onPress={handlePress}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={[`${index}.`, title, summary, optionalLabel]
                    .filter(Boolean)
                    .join(' ')}
                testID={testID ? `${testID}-header` : undefined}
                className="flex-row items-center gap-3"
            >
                <View
                    className="w-7 h-7 rounded-full items-center justify-center"
                    style={{
                        backgroundColor: complete
                            ? colors.success.DEFAULT
                            : colors.primary,
                    }}
                    testID={testID ? `${testID}-badge` : undefined}
                >
                    {complete ? (
                        <AppIcon
                            name="checkmark"
                            size={16}
                            color={colors.white}
                            testID={testID ? `${testID}-check` : undefined}
                        />
                    ) : (
                        <Text className="text-xs font-bold text-white">
                            {String(index)}
                        </Text>
                    )}
                </View>

                <View className="flex-1">
                    <View className="flex-row items-center gap-2">
                        <Text
                            numberOfLines={1}
                            className={rtlTextClassName(
                                isRtl,
                                'text-base font-bold flex-shrink',
                            )}
                            style={{ color: colors.text.primary }}
                        >
                            {title}
                        </Text>
                        {optionalLabel ? (
                            <View className="rounded-full bg-slate-100 px-2 py-0.5">
                                <Text className="text-[10px] font-medium text-gray-500">
                                    {optionalLabel}
                                </Text>
                            </View>
                        ) : null}
                    </View>
                    {!expanded && summary ? (
                        <Text
                            numberOfLines={1}
                            className={rtlTextClassName(isRtl, 'text-sm mt-0.5')}
                            style={{ color: colors.text.secondary }}
                            testID={testID ? `${testID}-summary` : undefined}
                        >
                            {summary}
                        </Text>
                    ) : null}
                </View>

                <Animated.View style={{ transform: [{ rotate: rotateDeg }] }}>
                    <AppIcon name="chevron-down" size={20} color={colors.gray400} />
                </Animated.View>
            </TouchableOpacity>

            {expanded ? (
                <Animated.View
                    style={{ marginTop: 12, opacity: rotate }}
                    testID={testID ? `${testID}-body` : undefined}
                >
                    {helper ? (
                        <Text
                            className={rtlTextClassName(
                                isRtl,
                                'text-sm leading-relaxed mb-3',
                            )}
                            style={{ color: colors.text.secondary }}
                        >
                            {helper}
                        </Text>
                    ) : null}
                    {children}
                </Animated.View>
            ) : null}
        </View>
    );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest __tests__/components/groups/OnboardingStepCard.test.tsx`
Expected: PASS (6 tests). If `LayoutAnimation` throws in jest (unlikely with jest-expo), add to the top of the test file: `jest.mock('react-native/Libraries/LayoutAnimation/LayoutAnimation', () => ({ configureNext: jest.fn(), Presets: { easeInEaseOut: {} } }));`

- [ ] **Step 5: Commit**

```bash
git add components/groups/OnboardingStepCard.tsx __tests__/components/groups/OnboardingStepCard.test.tsx
git commit -m "feat: add OnboardingStepCard accordion step"
```

---

## Task 4: Rebuild OnboardingCreateGroupScreen with step cards

**Files:**
- Modify: `screens/onboarding/OnboardingCreateGroupScreen.tsx` (full rewrite of the component body)
- Test: `__tests__/screens/onboarding/OnboardingCreateGroupScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `__tests__/screens/onboarding/OnboardingCreateGroupScreen.test.tsx`:
```tsx
import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithQuery } from '../../helpers/renderWithQuery';

jest.mock('../../../services/groups.service', () => ({
    createGroup: jest.fn(),
    updateGroup: jest.fn(),
}));
jest.mock('../../../services/storage.service', () => ({
    uploadGroupImage: jest.fn(),
}));
jest.mock('../../../lib/onboardingStorage', () => ({
    markPostLoginOnboardingComplete: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-image-picker', () => ({
    requestMediaLibraryPermissionsAsync: jest
        .fn()
        .mockResolvedValue({ granted: true }),
    launchImageLibraryAsync: jest
        .fn()
        .mockResolvedValue({ canceled: false, assets: [{ uri: 'file://cover.jpg' }] }),
}));
// Mock the members sheet as a button that confirms a fixed selection (Bob, u2).
jest.mock('../../../components/AddMembersSheet', () => {
    const React = require('react');
    const { Pressable, Text } = require('react-native');
    function AddMembersSheet({ onConfirmSelection }: any) {
        return (
            <Pressable
                testID="mock-confirm-members"
                onPress={() => onConfirmSelection([{ id: 'u2', name: 'Bob' }])}
            >
                <Text>confirm</Text>
            </Pressable>
        );
    }
    return { AddMembersSheet };
});

import { OnboardingCreateGroupScreen } from '../../../screens/onboarding/OnboardingCreateGroupScreen';
import { createGroup, updateGroup } from '../../../services/groups.service';
import { uploadGroupImage } from '../../../services/storage.service';
import { markPostLoginOnboardingComplete } from '../../../lib/onboardingStorage';
import { useAppStore } from '../../../store';

const mockCreateGroup = createGroup as jest.MockedFunction<typeof createGroup>;
const mockUpdateGroup = updateGroup as jest.MockedFunction<typeof updateGroup>;
const mockUploadGroupImage =
    uploadGroupImage as jest.MockedFunction<typeof uploadGroupImage>;

beforeEach(() => {
    mockCreateGroup.mockReset();
    mockUpdateGroup.mockReset();
    mockUploadGroupImage.mockReset();
    (markPostLoginOnboardingComplete as jest.Mock).mockClear();
    useAppStore.setState({
        currentUser: {
            id: 'u1',
            email: 'a@x.com',
            name: 'Alice',
            inviteToken: 'alice123456',
            defaultCurrency: 'ILS',
            language: 'he',
            isActive: true,
            isAdmin: false,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });
});

describe('OnboardingCreateGroupScreen — interactive steps', () => {
    it('renders the header key and all five step cards', () => {
        const { getByText, getByTestId } = renderWithQuery(
            <OnboardingCreateGroupScreen onDone={jest.fn()} />,
        );
        expect(getByText('onboarding.create.header')).toBeTruthy();
        expect(getByTestId('onboarding-step-name')).toBeTruthy();
        expect(getByTestId('onboarding-step-category')).toBeTruthy();
        expect(getByTestId('onboarding-step-currency')).toBeTruthy();
        expect(getByTestId('onboarding-step-image')).toBeTruthy();
        expect(getByTestId('onboarding-step-members')).toBeTruthy();
    });

    it('opens the name step by default and gates submit on the name', () => {
        const { getByTestId } = renderWithQuery(
            <OnboardingCreateGroupScreen onDone={jest.fn()} />,
        );
        const submit = getByTestId('onboarding-create-submit');
        expect(submit.props.accessibilityState?.disabled).toBe(true);
        fireEvent.changeText(getByTestId('onboarding-step-name-input'), 'טיול לים');
        expect(submit.props.accessibilityState?.disabled).toBe(false);
    });

    it('expands a collapsed step on header tap and collapses the previously open one', () => {
        const { getByTestId, queryByTestId } = renderWithQuery(
            <OnboardingCreateGroupScreen onDone={jest.fn()} />,
        );
        expect(queryByTestId('onboarding-step-currency-body')).toBeNull();
        fireEvent.press(getByTestId('onboarding-step-currency-header'));
        expect(getByTestId('onboarding-step-currency-body')).toBeTruthy();
        expect(queryByTestId('onboarding-step-name-body')).toBeNull();
    });

    it('creates the group with name, type and currency on submit', async () => {
        mockCreateGroup.mockResolvedValueOnce({ id: 'g1' } as any);
        const onDone = jest.fn();
        const { getByTestId } = renderWithQuery(
            <OnboardingCreateGroupScreen onDone={onDone} />,
        );
        fireEvent.changeText(getByTestId('onboarding-step-name-input'), 'טיול לים');
        fireEvent.press(getByTestId('onboarding-create-submit'));
        await waitFor(() =>
            expect(mockCreateGroup).toHaveBeenCalledWith({
                name: 'טיול לים',
                groupType: 'trip',
                defaultCurrency: 'ILS',
                memberIds: [],
            }),
        );
        await waitFor(() =>
            expect(markPostLoginOnboardingComplete).toHaveBeenCalled(),
        );
        await waitFor(() => expect(onDone).toHaveBeenCalled());
    });

    it('keeps submit disabled and does not create when the name is empty', () => {
        const { getByTestId } = renderWithQuery(
            <OnboardingCreateGroupScreen onDone={jest.fn()} />,
        );
        const submit = getByTestId('onboarding-create-submit');
        expect(submit.props.accessibilityState?.disabled).toBe(true);
        fireEvent.press(submit);
        expect(mockCreateGroup).not.toHaveBeenCalled();
    });

    it('uploads the picked cover image and updates the group', async () => {
        mockCreateGroup.mockResolvedValueOnce({ id: 'g1' } as any);
        mockUploadGroupImage.mockResolvedValueOnce('https://cdn/cover.jpg');
        const { getByTestId } = renderWithQuery(
            <OnboardingCreateGroupScreen onDone={jest.fn()} />,
        );
        fireEvent.changeText(getByTestId('onboarding-step-name-input'), 'טיול לים');
        // Open the image step, then tap the cover to pick a photo (picker mock returns a uri).
        fireEvent.press(getByTestId('onboarding-step-image-header'));
        fireEvent.press(getByTestId('onboarding-step-cover'));
        // The remove link only renders once a local image is set — wait for it.
        await waitFor(() =>
            expect(getByTestId('onboarding-step-cover-remove')).toBeTruthy(),
        );
        fireEvent.press(getByTestId('onboarding-create-submit'));
        await waitFor(() =>
            expect(mockUploadGroupImage).toHaveBeenCalledWith('g1', 'file://cover.jpg'),
        );
        await waitFor(() =>
            expect(mockUpdateGroup).toHaveBeenCalledWith('g1', {
                imageUrl: 'https://cdn/cover.jpg',
            }),
        );
    });

    it('includes added members in the createGroup memberIds', async () => {
        mockCreateGroup.mockResolvedValueOnce({ id: 'g1' } as any);
        const { getByTestId } = renderWithQuery(
            <OnboardingCreateGroupScreen onDone={jest.fn()} />,
        );
        fireEvent.changeText(getByTestId('onboarding-step-name-input'), 'טיול לים');
        // The mocked AddMembersSheet confirms a fixed member (Bob, id u2).
        fireEvent.press(getByTestId('mock-confirm-members'));
        fireEvent.press(getByTestId('onboarding-create-submit'));
        await waitFor(() =>
            expect(mockCreateGroup).toHaveBeenCalledWith(
                expect.objectContaining({ memberIds: ['u2'] }),
            ),
        );
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest __tests__/screens/onboarding/OnboardingCreateGroupScreen.test.tsx`
Expected: FAIL — testIDs like `onboarding-step-name` not found (screen still renders the old flat form).

- [ ] **Step 3: Rewrite the screen**

Replace the entire contents of `screens/onboarding/OnboardingCreateGroupScreen.tsx` with:
```tsx
/**
 * First-group onboarding — interactive accordion steps
 * (name, category, currency, cover image, members).
 */

import React, { useCallback, useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { platformAlert } from '../../lib/platformAlert';
import { useTranslation } from 'react-i18next';
import { GroupType, DEFAULT_CURRENCY, User } from '@cost-share/shared';
import Toast from 'react-native-toast-message';
import { useLoading } from '../../hooks/useLoading';
import { useAppStore } from '../../store';
import { createGroup, updateGroup } from '../../services/groups.service';
import { uploadGroupImage } from '../../services/storage.service';
import { markPostLoginOnboardingComplete } from '../../lib/onboardingStorage';
import { Button } from '../../components/Button';
import { Text } from '../../components/AppText';
import { AppIcon } from '../../components/AppIcon';
import { Input } from '../../components/Input';
import { GroupTypeSelector } from '../../components/GroupTypeSelector';
import { CurrencyPicker } from '../../components/CurrencyPicker';
import { AddMembersSheet } from '../../components/AddMembersSheet';
import { CreateGroupFormShell } from '../../components/groups/CreateGroupFormShell';
import { CreateGroupCoverPreview } from '../../components/groups/CreateGroupCoverPreview';
import { GroupMembersField } from '../../components/groups/GroupMembersField';
import { OnboardingStepCard } from '../../components/groups/OnboardingStepCard';
import { colors } from '../../theme';
import { rtlTextClassName, useRtlLayout } from '../../hooks/useRtlLayout';

type Props = {
    onDone: () => void;
};

type StepKey = 'name' | 'category' | 'currency' | 'image' | 'members';

export function OnboardingCreateGroupScreen({ onDone }: Props) {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();
    const currentUser = useAppStore((s) => s.currentUser);
    const { isLoading, startLoading, stopLoading } = useLoading();

    const [name, setName] = useState('');
    const [nameError, setNameError] = useState('');
    const [groupType, setGroupType] = useState<GroupType>('trip');
    const [currency, setCurrency] = useState(
        currentUser?.defaultCurrency ?? DEFAULT_CURRENCY,
    );
    const [localImageUri, setLocalImageUri] = useState<string | null>(null);
    const [members, setMembers] = useState<User[]>([]);
    const [addMembersOpen, setAddMembersOpen] = useState(false);
    const [openStep, setOpenStep] = useState<StepKey | null>('name');

    const toggleStep = useCallback((key: StepKey) => {
        setOpenStep((prev) => (prev === key ? null : key));
    }, []);

    const finish = useCallback(async () => {
        await markPostLoginOnboardingComplete();
        onDone();
    }, [onDone]);

    const handleFindFriends = useCallback(() => {
        setAddMembersOpen(false);
        Toast.show({
            type: 'info',
            text1: t('onboarding.create.findFriendsAfterCreate'),
        });
    }, [t]);

    const handleSkip = useCallback(() => {
        platformAlert(
            t('onboarding.create.skipTitle'),
            t('onboarding.create.skipMessage'),
            [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('onboarding.create.skipConfirm'),
                    style: 'destructive',
                    onPress: () => void finish(),
                },
            ],
        );
    }, [finish, t]);

    const pickImage = useCallback(async () => {
        const permission =
            await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
            platformAlert(
                t('groups.imagePermissionTitle'),
                t('groups.imagePermissionMessage'),
            );
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [16, 9],
            quality: 0.85,
        });
        if (!result.canceled && result.assets[0]?.uri) {
            setLocalImageUri(result.assets[0].uri);
        }
    }, [t]);

    const handleCreate = useCallback(async () => {
        if (!name.trim()) {
            setNameError(t('groups.nameRequired'));
            setOpenStep('name');
            return;
        }
        setNameError('');
        startLoading();
        try {
            const group = await createGroup({
                name: name.trim(),
                groupType,
                defaultCurrency: currency,
                memberIds: members.map((m) => m.id),
            });
            if (!group) {
                Toast.show({ type: 'error', text1: t('common.error') });
                return;
            }
            if (localImageUri) {
                const uploadedUrl = await uploadGroupImage(
                    group.id,
                    localImageUri,
                );
                if (uploadedUrl) {
                    await updateGroup(group.id, { imageUrl: uploadedUrl });
                }
            }
            await finish();
        } finally {
            stopLoading();
        }
    }, [
        currency,
        finish,
        groupType,
        localImageUri,
        members,
        name,
        startLoading,
        stopLoading,
        t,
    ]);

    const displayMembers = currentUser ? [currentUser, ...members] : members;
    const memberIdsForSheet = [
        ...(currentUser ? [currentUser.id] : []),
        ...members.map((m) => m.id),
    ];
    const otherMembersCount = members.length;

    return (
        <>
            <CreateGroupFormShell
                testID="onboarding-create-group-screen"
                title={t('onboarding.create.header')}
                headerStart={
                    <TouchableOpacity
                        onPress={handleSkip}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        testID="onboarding-create-back"
                        accessibilityRole="button"
                    >
                        <View className="w-9 h-9 rounded-full bg-white border border-slate-200 items-center justify-center">
                            <AppIcon
                                name={isRtl ? 'chevron-forward' : 'chevron-back'}
                                size={20}
                                color={colors.gray700}
                            />
                        </View>
                    </TouchableOpacity>
                }
                headerEnd={
                    <TouchableOpacity
                        onPress={handleSkip}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        testID="onboarding-create-skip"
                    >
                        <Text
                            style={{
                                fontSize: 14,
                                fontWeight: '600',
                                color: colors.gray500,
                            }}
                        >
                            {t('onboarding.skip')}
                        </Text>
                    </TouchableOpacity>
                }
                footer={
                    <Button
                        title={t('onboarding.create.submit')}
                        onPress={() => void handleCreate()}
                        loading={isLoading}
                        disabled={isLoading || !name.trim()}
                        testID="onboarding-create-submit"
                    />
                }
            >
                <Text
                    className={rtlTextClassName(isRtl, 'text-sm leading-relaxed mb-4')}
                    style={{ color: colors.text.secondary }}
                >
                    {t('onboarding.create.steps.intro')}
                </Text>

                <OnboardingStepCard
                    index={1}
                    title={t('onboarding.create.steps.name.title')}
                    helper={t('onboarding.create.steps.name.helper')}
                    summary={name.trim() || undefined}
                    complete={name.trim().length > 0}
                    expanded={openStep === 'name'}
                    onToggle={() => toggleStep('name')}
                    testID="onboarding-step-name"
                >
                    <Input
                        placeholder={t('groups.createForm.namePlaceholder')}
                        value={name}
                        onChangeText={(text) => {
                            setName(text);
                            if (nameError) setNameError('');
                        }}
                        error={nameError}
                        containerClassName="mb-0"
                        testID="onboarding-step-name-input"
                    />
                </OnboardingStepCard>

                <OnboardingStepCard
                    index={2}
                    title={t('onboarding.create.steps.category.title')}
                    helper={t('onboarding.create.steps.category.helper')}
                    summary={t(`groups.types.${groupType}`)}
                    complete={!!groupType}
                    expanded={openStep === 'category'}
                    onToggle={() => toggleStep('category')}
                    testID="onboarding-step-category"
                >
                    <GroupTypeSelector value={groupType} onChange={setGroupType} />
                </OnboardingStepCard>

                <OnboardingStepCard
                    index={3}
                    title={t('onboarding.create.steps.currency.title')}
                    summary={currency}
                    complete={!!currency}
                    expanded={openStep === 'currency'}
                    onToggle={() => toggleStep('currency')}
                    testID="onboarding-step-currency"
                >
                    <CurrencyPicker value={currency} onChange={setCurrency} />
                </OnboardingStepCard>

                <OnboardingStepCard
                    index={4}
                    title={t('onboarding.create.steps.image.title')}
                    optionalLabel={t('onboarding.create.steps.optional')}
                    summary={
                        localImageUri
                            ? t('onboarding.create.steps.image.summarySet')
                            : t('onboarding.create.steps.image.summaryDefault')
                    }
                    complete={!!localImageUri}
                    expanded={openStep === 'image'}
                    onToggle={() => toggleStep('image')}
                    testID="onboarding-step-image"
                >
                    <CreateGroupCoverPreview
                        name={name}
                        groupType={groupType}
                        localUri={localImageUri}
                        onPress={() => void pickImage()}
                        testID="onboarding-step-cover"
                    />
                    {localImageUri ? (
                        <TouchableOpacity
                            onPress={() => setLocalImageUri(null)}
                            className="self-start mt-1"
                            testID="onboarding-step-cover-remove"
                        >
                            <Text className="text-sm font-medium text-red-500">
                                {t('groups.removeImage')}
                            </Text>
                        </TouchableOpacity>
                    ) : null}
                </OnboardingStepCard>

                <OnboardingStepCard
                    index={5}
                    title={t('onboarding.create.steps.members.title')}
                    helper={t('onboarding.create.steps.members.helper')}
                    optionalLabel={t('onboarding.create.steps.optional')}
                    summary={
                        otherMembersCount > 0
                            ? `${otherMembersCount} ${t(
                                  'onboarding.create.steps.members.summarySuffix',
                              )}`
                            : undefined
                    }
                    complete={otherMembersCount > 0}
                    expanded={openStep === 'members'}
                    onToggle={() => toggleStep('members')}
                    testID="onboarding-step-members"
                >
                    <GroupMembersField
                        displayMembers={displayMembers}
                        currentUserId={currentUser?.id ?? null}
                        currentUser={currentUser}
                        onAddMembers={() => setAddMembersOpen(true)}
                        onRemoveMember={(m) =>
                            setMembers((prev) => prev.filter((x) => x.id !== m.id))
                        }
                    />
                </OnboardingStepCard>
            </CreateGroupFormShell>

            <AddMembersSheet
                visible={addMembersOpen}
                onClose={() => setAddMembersOpen(false)}
                currentMemberIds={memberIdsForSheet}
                onFindFriends={handleFindFriends}
                onConfirmSelection={(picked) => {
                    setMembers((prev) => {
                        const ids = new Set(prev.map((m) => m.id));
                        return [
                            ...prev,
                            ...picked.filter((u) => !ids.has(u.id)),
                        ];
                    });
                    setAddMembersOpen(false);
                }}
            />
        </>
    );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest __tests__/screens/onboarding/OnboardingCreateGroupScreen.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add screens/onboarding/OnboardingCreateGroupScreen.tsx __tests__/screens/onboarding/OnboardingCreateGroupScreen.test.tsx
git commit -m "feat: interactive accordion steps for first-group onboarding"
```

---

## Task 5: Remove dead code/keys + full verification

**Files:**
- Delete: `components/groups/CreateGroupGuidancePanel.tsx`
- Modify: `i18n/locales/he.json`, `i18n/locales/en.json` (remove orphaned `groups.createForm.guidance`)

> **Prerequisite:** this worktree may have no `node_modules`. If `npx jest` / `npx tsc` fail with "command not found" or missing modules, run `npm install` at the monorepo root (`cost-share-app/`) first.

- [ ] **Step 1: Confirm the guidance panel has no remaining references**

Run:
```bash
grep -rn "CreateGroupGuidancePanel" --include='*.ts' --include='*.tsx' . | grep -v node_modules
```
Expected: no output. If anything prints, fix the importer before deleting.

- [ ] **Step 2: Delete the panel**

```bash
git rm components/groups/CreateGroupGuidancePanel.tsx
```

- [ ] **Step 3: Remove the now-orphaned `groups.createForm.guidance` i18n keys**

The `guidance` object (`title`, `subtitle`, `tip1`, `tip2`, `tip3`) was used ONLY by the deleted panel; its tips now live as the step `helper` strings added in Task 1. Delete the entire `guidance` object from `groups.createForm` in BOTH `i18n/locales/he.json` and `i18n/locales/en.json`. Keep the sibling `createForm` keys (`namePlaceholder`, `sectionIdentity`, `sectionSettings`, `coverNamePlaceholder`, `membersHint`) — they're still used by `CreateGroupFormFields`.

Verify nothing references the keys and both files still parse:
```bash
grep -rn "createForm.guidance" --include='*.ts' --include='*.tsx' . | grep -v node_modules
node -e "JSON.parse(require('fs').readFileSync('i18n/locales/he.json','utf8'));JSON.parse(require('fs').readFileSync('i18n/locales/en.json','utf8'));console.log('JSON OK')"
```
Expected: the grep prints nothing; the node command prints `JSON OK`.

- [ ] **Step 4: Typecheck**

Run (from `cost-share-app/apps/mobile`): `npx tsc --noEmit`
Expected: no errors. Confirm the `CreateGroupFormFields` import cleanup from Task 2 left nothing unused.

- [ ] **Step 5: Run the full mobile test suite (matches the CI green bar)**

From `cost-share-app/apps/mobile`: `npx jest`
— or the exact CI command from the monorepo root `cost-share-app/`: `npm test --workspace=@cost-share/mobile -- --ci`
Expected: all suites pass — the new card/screen tests, the guarded `__tests__/screens/groups/CreateGroupScreen.test.tsx` and `EditGroupScreen.test.tsx` (covering the Task 2 refactor), and `__tests__/lib/onboardingStorage.test.ts`. (Note: CI's separate `lint` job is a no-op — the repo has no ESLint config — so `tsc` + `jest` are the real gates.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove unused guidance panel and its dead i18n keys"
```

---

## Self-Review (completed during planning)

**Spec coverage:**
- Accordion stepper, one open at a time, name open by default → Task 4 (`openStep` state, `toggleStep`).
- 5 steps name→category→currency→image→members → Task 4 (five `OnboardingStepCard`s).
- Inputs revealed inline; tips merged as per-step `helper` → Task 4 (helper props) + Task 1 (copy).
- Only name gates submit; image/members optional tag → Task 4 (`disabled` on Button, `optionalLabel`).
- Badge number → check on completion → Task 3 (`complete` prop) + Task 4 (per-step `complete`).
- Image step reveals live cover hero → Task 4 (`CreateGroupCoverPreview` inside step 4).
- Header renamed "הקופה הראשונה" → Task 1.
- LayoutAnimation + core Animated (test-safe) → Task 3.
- Guidance panel removed + dead `guidance` i18n keys deleted → Task 5. `GroupMembersField` extracted AND reused in `CreateGroupFormFields` → Task 2.
- Visual style matches `GroupFormSection`/`primary` tokens; expanded-border + body fade polish → Task 3 card styling.
- Accessibility label on each step header → Task 3.
- Tests (card unit + screen incl. empty-name gate, image-upload, members) → Tasks 2–4. Verification matches CI → Task 5.

**Placeholder scan:** none — every code/step is complete.

**Type consistency:** `OnboardingStepCard` prop names (`optionalLabel`, `complete`, `expanded`, `onToggle`, `summary`, `helper`, `index`, `title`, `children`, `testID`) are identical between Task 3 definition and Task 4 usage. `GroupMembersField` props (`displayMembers`, `currentUserId`, `currentUser`, `onAddMembers`, `onRemoveMember`) match between Task 2 and Task 4. `StepKey` union matches the five `toggleStep`/`expanded` call sites.

## Follow-up (out of scope here)

- Scroll-to-opened-step: when a lower step expands, scroll it into view (needs a `ScrollView` ref exposed through `CreateGroupFormShell`).
- When `CreateGroupCoverPreview` is embedded inside the image step, drop its outer margin/shadow to avoid a double-shadow look.
- Dedupe `pickImage` (duplicated between `OnboardingCreateGroupScreen` and `CreateGroupFormFields`) into a shared hook.

---

## Revision 2026-06-09 — remaining work on current `dev`

**Supersedes Tasks 1–5 above** (they targeted a stale baseline). On current `dev`: `OnboardingStepCard` + `GroupMembersField` already landed (green); the guidance panel + header rename were done by `dev`. Only three tasks remain. Working dir: `cost-share-app/apps/mobile`. `t(key)` returns the key in tests; reanimated renders fine in jest now.

### Task R1: i18n — add `onboarding.create.steps.*`

**Files:** `i18n/locales/he.json`, `i18n/locales/en.json`

- [ ] **Step 1:** add a `steps` object inside `onboarding.create` (alongside the existing `header`, `submit`, `membersHint`, …) in `he.json`:
```json
"steps": {
    "optional": "אופציונלי",
    "name": { "title": "שם הקופה", "helper": "תנו שם שכולם מזהים (למשל «טיול לים» או «דירה 2025»)." },
    "category": { "title": "קטגוריה", "helper": "סוג הקופה קובע את הצבעים — אפשר לשנות אחר כך." },
    "currency": { "title": "מטבע" },
    "image": { "title": "תמונת כריכה", "summaryDefault": "ברירת מחדל", "summarySet": "תמונה נבחרה" },
    "members": { "title": "הזמנת חברים", "summarySuffix": "חברים" }
},
```
- [ ] **Step 2:** mirror in `en.json`:
```json
"steps": {
    "optional": "Optional",
    "name": { "title": "Kupa name", "helper": "Pick a name everyone recognizes (e.g. \"Beach trip\" or \"Apt 2025\")." },
    "category": { "title": "Category", "helper": "The type sets the colors — you can change it later." },
    "currency": { "title": "Currency" },
    "image": { "title": "Cover image", "summaryDefault": "Default", "summarySet": "Image selected" },
    "members": { "title": "Invite members", "summarySuffix": "members" }
},
```
- [ ] **Step 3:** verify: `node -e "for(const f of ['he','en']){const s=require('./i18n/locales/'+f+'.json').onboarding.create.steps; ['optional','name','category','currency','image','members'].forEach(k=>{if(!s[k])throw new Error(f+' missing '+k)});} console.log('i18n OK')"` → `i18n OK`.
- [ ] **Step 4:** commit: `git add i18n/locales/he.json i18n/locales/en.json && git commit -m "i18n: add onboarding create-group step copy"`

### Task R2: Swap the onboarding screen body for the stepper

**Files:**
- Modify (full rewrite): `screens/onboarding/OnboardingCreateGroupScreen.tsx`
- Test (create): `__tests__/screens/onboarding/OnboardingCreateGroupScreen.test.tsx`

Keep ALL existing scaffolding (hero `guidance`, language toggle, floating button, `previewMode`, locale currency, safe-area, `appToast`, name suggestions). Replace only the `<CreateGroupFormFields>` child with five `OnboardingStepCard`s.

- [ ] **Step 1: Write the failing test** — create `__tests__/screens/onboarding/OnboardingCreateGroupScreen.test.tsx`:
```tsx
import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithQuery } from '../../helpers/renderWithQuery';

jest.mock('../../../services/groups.service', () => ({
    createGroup: jest.fn(),
    updateGroup: jest.fn(),
}));
jest.mock('../../../services/storage.service', () => ({
    uploadGroupImage: jest.fn(),
}));
jest.mock('../../../lib/onboardingStorage', () => ({
    markPostLoginOnboardingComplete: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-image-picker', () => ({
    requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
    launchImageLibraryAsync: jest
        .fn()
        .mockResolvedValue({ canceled: false, assets: [{ uri: 'file://cover.jpg' }] }),
}));
jest.mock('../../../components/AddMembersSheet', () => {
    const React = require('react');
    const { Pressable, Text } = require('react-native');
    function AddMembersSheet({ onConfirmSelection }: any) {
        return (
            <Pressable
                testID="mock-confirm-members"
                onPress={() => onConfirmSelection([{ id: 'u2', name: 'Bob' }])}
            >
                <Text>confirm</Text>
            </Pressable>
        );
    }
    return { AddMembersSheet };
});

import { OnboardingCreateGroupScreen } from '../../../screens/onboarding/OnboardingCreateGroupScreen';
import { createGroup, updateGroup } from '../../../services/groups.service';
import { uploadGroupImage } from '../../../services/storage.service';
import { markPostLoginOnboardingComplete } from '../../../lib/onboardingStorage';
import { useAppStore } from '../../../store';

const mockCreateGroup = createGroup as jest.MockedFunction<typeof createGroup>;
const mockUpdateGroup = updateGroup as jest.MockedFunction<typeof updateGroup>;
const mockUploadGroupImage = uploadGroupImage as jest.MockedFunction<typeof uploadGroupImage>;

beforeEach(() => {
    mockCreateGroup.mockReset();
    mockUpdateGroup.mockReset();
    mockUploadGroupImage.mockReset();
    (markPostLoginOnboardingComplete as jest.Mock).mockClear();
    useAppStore.setState({
        currentUser: {
            id: 'u1', email: 'a@x.com', name: 'Alice', inviteToken: 'alice123456',
            defaultCurrency: 'ILS', language: 'he', isActive: true, isAdmin: false,
            createdAt: new Date(), updatedAt: new Date(),
        },
    });
});

describe('OnboardingCreateGroupScreen — interactive steps (current dev)', () => {
    it('renders the header and all five step cards (hero preserved)', () => {
        const { getByText, getByTestId } = renderWithQuery(
            <OnboardingCreateGroupScreen onDone={jest.fn()} />,
        );
        expect(getByText('onboarding.create.header')).toBeTruthy();
        ['name', 'category', 'currency', 'image', 'members'].forEach((k) =>
            expect(getByTestId(`onboarding-step-${k}`)).toBeTruthy(),
        );
    });

    it('opens the name step by default and gates submit on the name', () => {
        const { getByTestId } = renderWithQuery(
            <OnboardingCreateGroupScreen onDone={jest.fn()} />,
        );
        const submit = getByTestId('onboarding-create-submit');
        expect(submit.props.accessibilityState?.disabled).toBe(true);
        fireEvent.changeText(getByTestId('onboarding-step-name-input'), 'טיול לים');
        expect(submit.props.accessibilityState?.disabled).toBe(false);
    });

    it('expands a collapsed step on header tap and collapses the open one', () => {
        const { getByTestId, queryByTestId } = renderWithQuery(
            <OnboardingCreateGroupScreen onDone={jest.fn()} />,
        );
        expect(queryByTestId('onboarding-step-currency-body')).toBeNull();
        fireEvent.press(getByTestId('onboarding-step-currency-header'));
        expect(getByTestId('onboarding-step-currency-body')).toBeTruthy();
        expect(queryByTestId('onboarding-step-name-body')).toBeNull();
    });

    it('creates the group with name, type and currency on submit', async () => {
        mockCreateGroup.mockResolvedValueOnce({ id: 'g1' } as any);
        const onDone = jest.fn();
        const { getByTestId } = renderWithQuery(
            <OnboardingCreateGroupScreen onDone={onDone} />,
        );
        fireEvent.changeText(getByTestId('onboarding-step-name-input'), 'טיול לים');
        fireEvent.press(getByTestId('onboarding-create-submit'));
        await waitFor(() =>
            expect(mockCreateGroup).toHaveBeenCalledWith({
                name: 'טיול לים', groupType: 'trip', defaultCurrency: 'ILS', memberIds: [],
            }),
        );
        await waitFor(() => expect(markPostLoginOnboardingComplete).toHaveBeenCalled());
        await waitFor(() => expect(onDone).toHaveBeenCalled());
    });

    it('does not create when the name is empty', () => {
        const { getByTestId } = renderWithQuery(
            <OnboardingCreateGroupScreen onDone={jest.fn()} />,
        );
        fireEvent.press(getByTestId('onboarding-create-submit'));
        expect(mockCreateGroup).not.toHaveBeenCalled();
    });

    it('uploads the picked cover image and updates the group', async () => {
        mockCreateGroup.mockResolvedValueOnce({ id: 'g1' } as any);
        mockUploadGroupImage.mockResolvedValueOnce('https://cdn/cover.jpg');
        const { getByTestId } = renderWithQuery(
            <OnboardingCreateGroupScreen onDone={jest.fn()} />,
        );
        fireEvent.changeText(getByTestId('onboarding-step-name-input'), 'טיול לים');
        fireEvent.press(getByTestId('onboarding-step-image-header'));
        fireEvent.press(getByTestId('onboarding-step-cover'));
        await waitFor(() => expect(getByTestId('onboarding-step-cover-remove')).toBeTruthy());
        fireEvent.press(getByTestId('onboarding-create-submit'));
        await waitFor(() =>
            expect(mockUploadGroupImage).toHaveBeenCalledWith('g1', 'file://cover.jpg'),
        );
        await waitFor(() =>
            expect(mockUpdateGroup).toHaveBeenCalledWith('g1', { imageUrl: 'https://cdn/cover.jpg' }),
        );
    });

    it('includes added members in the createGroup memberIds', async () => {
        mockCreateGroup.mockResolvedValueOnce({ id: 'g1' } as any);
        const { getByTestId } = renderWithQuery(
            <OnboardingCreateGroupScreen onDone={jest.fn()} />,
        );
        fireEvent.changeText(getByTestId('onboarding-step-name-input'), 'טיול לים');
        fireEvent.press(getByTestId('mock-confirm-members'));
        fireEvent.press(getByTestId('onboarding-create-submit'));
        await waitFor(() =>
            expect(mockCreateGroup).toHaveBeenCalledWith(
                expect.objectContaining({ memberIds: ['u2'] }),
            ),
        );
    });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`onboarding-step-*` testIDs absent): `npx jest __tests__/screens/onboarding/OnboardingCreateGroupScreen.test.tsx`

- [ ] **Step 3: Replace the ENTIRE contents** of `screens/onboarding/OnboardingCreateGroupScreen.tsx` with:
```tsx
/**
 * First-group onboarding — interactive accordion steps under the live hero
 * (name, category, currency, cover image, members).
 */

import React, { useCallback, useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { platformAlert } from '../../lib/platformAlert';
import { useTranslation } from 'react-i18next';
import { GroupType, User } from '@cost-share/shared';
import { showAppToast, showInfoToast } from '../../lib/appToast';
import { useLoading } from '../../hooks/useLoading';
import { useAppStore } from '../../store';
import { createGroup, updateGroup } from '../../services/groups.service';
import { uploadGroupImage } from '../../services/storage.service';
import { markPostLoginOnboardingComplete } from '../../lib/onboardingStorage';
import { CreateGroupFloatingButton } from '../../components/groups/CreateGroupFloatingButton';
import { Text } from '../../components/AppText';
import { AppIcon } from '../../components/AppIcon';
import { Input } from '../../components/Input';
import { GroupTypeSelector } from '../../components/GroupTypeSelector';
import { CurrencyPicker } from '../../components/CurrencyPicker';
import { AddMembersSheet } from '../../components/AddMembersSheet';
import { CreateGroupFormShell } from '../../components/groups/CreateGroupFormShell';
import { CreateGroupCoverPreview } from '../../components/groups/CreateGroupCoverPreview';
import { GroupMembersField } from '../../components/groups/GroupMembersField';
import { OnboardingStepCard } from '../../components/groups/OnboardingStepCard';
import { OnboardingCreateGroupHero } from '../../components/onboarding/OnboardingCreateGroupHero';
import { OnboardingNameSuggestions } from '../../components/onboarding/OnboardingNameSuggestions';
import { OnboardingLanguageToggle } from '../../components/onboarding/OnboardingLanguageToggle';
import { colors } from '../../theme';
import { useAppLanguage, useRtlLayout } from '../../hooks/useRtlLayout';
import { initialCreateGroupCurrency } from '../../lib/appDefaultCurrency';

type Props = {
    onDone: () => void;
    /** Admin preview — do not persist onboarding completion. */
    previewMode?: boolean;
};

type StepKey = 'name' | 'category' | 'currency' | 'image' | 'members';

export function OnboardingCreateGroupScreen({ onDone, previewMode = false }: Props) {
    const { t } = useTranslation();
    const { bottom: safeBottom } = useSafeAreaInsets();
    const isRtl = useRtlLayout();
    const appLanguage = useAppLanguage();
    const currentUser = useAppStore((s) => s.currentUser);
    const { isLoading, startLoading, stopLoading } = useLoading();

    const [name, setName] = useState('');
    const [nameError, setNameError] = useState('');
    const [groupType, setGroupType] = useState<GroupType>('trip');
    const [currency, setCurrency] = useState(() =>
        initialCreateGroupCurrency(appLanguage, currentUser),
    );
    const [localImageUri, setLocalImageUri] = useState<string | null>(null);
    const [members, setMembers] = useState<User[]>([]);
    const [addMembersOpen, setAddMembersOpen] = useState(false);
    const [openStep, setOpenStep] = useState<StepKey | null>('name');

    const toggleStep = useCallback((key: StepKey) => {
        setOpenStep((prev) => (prev === key ? null : key));
    }, []);

    const finish = useCallback(async () => {
        if (!previewMode) {
            await markPostLoginOnboardingComplete();
        }
        onDone();
    }, [onDone, previewMode]);

    const handleSkip = useCallback(() => {
        platformAlert(
            t('onboarding.create.skipTitle'),
            t('onboarding.create.skipMessage'),
            [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('onboarding.create.skipConfirm'),
                    style: 'destructive',
                    onPress: () => void finish(),
                },
            ],
        );
    }, [finish, t]);

    const handleExit = useCallback(() => {
        if (previewMode) {
            onDone();
            return;
        }
        handleSkip();
    }, [previewMode, onDone, handleSkip]);

    const handleFindFriends = useCallback(() => {
        setAddMembersOpen(false);
        showInfoToast('onboarding.create.findFriendsAfterCreate');
    }, []);

    const pickImage = useCallback(async () => {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
            platformAlert(t('groups.imagePermissionTitle'), t('groups.imagePermissionMessage'));
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [16, 9],
            quality: 0.85,
        });
        if (!result.canceled && result.assets[0]?.uri) {
            setLocalImageUri(result.assets[0].uri);
        }
    }, [t]);

    const handleCreate = useCallback(async () => {
        if (!name.trim()) {
            setNameError(t('groups.nameRequired'));
            setOpenStep('name');
            return;
        }
        setNameError('');
        startLoading();
        try {
            const group = await createGroup({
                name: name.trim(),
                groupType,
                defaultCurrency: currency,
                memberIds: members.map((m) => m.id),
            });
            if (!group) {
                showAppToast({ type: 'error', titleKey: 'common.error' });
                return;
            }
            if (localImageUri) {
                const uploadedUrl = await uploadGroupImage(group.id, localImageUri);
                if (uploadedUrl) {
                    await updateGroup(group.id, { imageUrl: uploadedUrl });
                }
            }
            await finish();
        } finally {
            stopLoading();
        }
    }, [currency, finish, groupType, localImageUri, members, name, startLoading, stopLoading, t]);

    const displayMembers = currentUser ? [currentUser, ...members] : members;
    const hasName = name.trim().length > 0;
    const hasExtraMembers = members.length > 0;
    const memberIdsForSheet = [
        ...(currentUser ? [currentUser.id] : []),
        ...members.map((m) => m.id),
    ];

    return (
        <>
            <CreateGroupFormShell
                testID="onboarding-create-group-screen"
                extraBottomInset={safeBottom}
                title={t('onboarding.create.header')}
                guidance={
                    <OnboardingCreateGroupHero
                        hasName={hasName}
                        hasExtraMembers={hasExtraMembers}
                    />
                }
                headerStart={
                    <TouchableOpacity
                        onPress={handleExit}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        testID="onboarding-create-back"
                        accessibilityRole="button"
                    >
                        <View className="w-9 h-9 rounded-full bg-white border border-slate-200 items-center justify-center">
                            <AppIcon
                                name={isRtl ? 'chevron-forward' : 'chevron-back'}
                                size={20}
                                color={colors.gray700}
                            />
                        </View>
                    </TouchableOpacity>
                }
                headerEnd={
                    <View className="flex-row items-center gap-2">
                        <OnboardingLanguageToggle
                            variant="form"
                            testID="onboarding-create-language-button"
                        />
                        <TouchableOpacity
                            onPress={handleExit}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            testID="onboarding-create-skip"
                        >
                            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray500 }}>
                                {t(previewMode ? 'common.close' : 'onboarding.skip')}
                            </Text>
                        </TouchableOpacity>
                    </View>
                }
                footer={
                    <CreateGroupFloatingButton
                        title={t(hasName ? 'onboarding.create.submitReady' : 'onboarding.create.submit')}
                        onPress={() => void handleCreate()}
                        loading={isLoading}
                        disabled={isLoading || !name.trim()}
                        testID="onboarding-create-submit"
                    />
                }
            >
                <OnboardingStepCard
                    index={1}
                    title={t('onboarding.create.steps.name.title')}
                    helper={t('onboarding.create.steps.name.helper')}
                    summary={name.trim() || undefined}
                    complete={hasName}
                    expanded={openStep === 'name'}
                    onToggle={() => toggleStep('name')}
                    testID="onboarding-step-name"
                >
                    <OnboardingNameSuggestions
                        visible={!hasName}
                        onSelect={(suggested) => {
                            setName(suggested);
                            if (nameError) setNameError('');
                        }}
                    />
                    <Input
                        placeholder={t('groups.createForm.namePlaceholder')}
                        value={name}
                        onChangeText={(text) => {
                            setName(text);
                            if (nameError) setNameError('');
                        }}
                        error={nameError}
                        containerClassName="mb-0"
                        testID="onboarding-step-name-input"
                    />
                </OnboardingStepCard>

                <OnboardingStepCard
                    index={2}
                    title={t('onboarding.create.steps.category.title')}
                    helper={t('onboarding.create.steps.category.helper')}
                    summary={t(`groups.types.${groupType}`)}
                    complete={!!groupType}
                    expanded={openStep === 'category'}
                    onToggle={() => toggleStep('category')}
                    testID="onboarding-step-category"
                >
                    <GroupTypeSelector value={groupType} onChange={setGroupType} />
                </OnboardingStepCard>

                <OnboardingStepCard
                    index={3}
                    title={t('onboarding.create.steps.currency.title')}
                    summary={currency}
                    complete={!!currency}
                    expanded={openStep === 'currency'}
                    onToggle={() => toggleStep('currency')}
                    testID="onboarding-step-currency"
                >
                    <CurrencyPicker value={currency} onChange={setCurrency} />
                </OnboardingStepCard>

                <OnboardingStepCard
                    index={4}
                    title={t('onboarding.create.steps.image.title')}
                    optionalLabel={t('onboarding.create.steps.optional')}
                    summary={
                        localImageUri
                            ? t('onboarding.create.steps.image.summarySet')
                            : t('onboarding.create.steps.image.summaryDefault')
                    }
                    complete={!!localImageUri}
                    expanded={openStep === 'image'}
                    onToggle={() => toggleStep('image')}
                    testID="onboarding-step-image"
                >
                    <CreateGroupCoverPreview
                        name={name}
                        groupType={groupType}
                        localUri={localImageUri}
                        onPress={() => void pickImage()}
                        testID="onboarding-step-cover"
                    />
                    {localImageUri ? (
                        <TouchableOpacity
                            onPress={() => setLocalImageUri(null)}
                            className="self-start mt-1"
                            testID="onboarding-step-cover-remove"
                        >
                            <Text className="text-sm font-medium text-red-500">
                                {t('groups.removeImage')}
                            </Text>
                        </TouchableOpacity>
                    ) : null}
                </OnboardingStepCard>

                <OnboardingStepCard
                    index={5}
                    title={t('onboarding.create.steps.members.title')}
                    helper={t('onboarding.create.membersHint')}
                    optionalLabel={t('onboarding.create.steps.optional')}
                    summary={
                        hasExtraMembers
                            ? `${members.length} ${t('onboarding.create.steps.members.summarySuffix')}`
                            : undefined
                    }
                    complete={hasExtraMembers}
                    expanded={openStep === 'members'}
                    onToggle={() => toggleStep('members')}
                    testID="onboarding-step-members"
                >
                    <GroupMembersField
                        displayMembers={displayMembers}
                        currentUserId={currentUser?.id ?? null}
                        currentUser={currentUser}
                        onAddMembers={() => setAddMembersOpen(true)}
                        onRemoveMember={(m) =>
                            setMembers((prev) => prev.filter((x) => x.id !== m.id))
                        }
                    />
                </OnboardingStepCard>
            </CreateGroupFormShell>

            <AddMembersSheet
                visible={addMembersOpen}
                onClose={() => setAddMembersOpen(false)}
                currentMemberIds={memberIdsForSheet}
                onFindFriends={handleFindFriends}
                onConfirmSelection={(picked) => {
                    setMembers((prev) => {
                        const ids = new Set(prev.map((m) => m.id));
                        return [...prev, ...picked.filter((u) => !ids.has(u.id))];
                    });
                    setAddMembersOpen(false);
                }}
            />
        </>
    );
}
```

- [ ] **Step 4: Run the test — expect PASS (7 tests):** `npx jest __tests__/screens/onboarding/OnboardingCreateGroupScreen.test.tsx`
- [ ] **Step 5: commit:** `git add screens/onboarding/OnboardingCreateGroupScreen.tsx __tests__/screens/onboarding/OnboardingCreateGroupScreen.test.tsx && git commit -m "feat: interactive accordion steps in first-group onboarding (on current dev)"`

### Task R3: Verify

- [ ] `npx tsc --noEmit` → clean.
- [ ] `npx jest` → full mobile suite green (incl. the new screen test, `OnboardingStepCard`, `GroupMembersField`, `CreateGroupScreen`, onboarding component tests).
- [ ] commit anything outstanding (do NOT stage `cost-share-app/package-lock.json`).
