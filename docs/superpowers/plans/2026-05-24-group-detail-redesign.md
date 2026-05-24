# Group Detail Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the approved Group Detail design (summary card + R1 activity rows) into `cost-share-app/apps/mobile/`, scoped to `GroupDetailScreen`. ActivityFeedScreen migration is a follow-up.

**Architecture:** Replace `GroupHero` + `GroupBalanceBanner` + `QuickActionsRow` with a new `GroupDetailAppBar` + `GroupSummaryCard` (composed of `SummaryCover`, `SummaryBalanceStrip`, `SummaryFooter`, `MemberStack`). Extract two shared row primitives (`FeedRowCard`, `FeedRowThumbnail`) and rewrite the in-feed rows (`ExpenseRow`, `MessageRow`, `FeedChatRow`, `SettlementRow`) on top of them.

**Tech Stack:** React Native, Expo SDK 55, NativeWind / Tailwind, TypeScript, Jest + React Native Testing Library, react-i18next.

**Spec:** [`docs/superpowers/specs/2026-05-24-group-detail-redesign-design.md`](../specs/2026-05-24-group-detail-redesign-design.md)
**Handoff:** [`docs/design_handoff_group_detail/README.md`](../../design_handoff_group_detail/README.md)
**Working directory for code:** `cost-share-app/apps/mobile/` — all source paths below are relative to this dir.

**Branch:** Already on `group-detail-design`. There are unrelated WIP edits in the working tree (date-field swap on `ExpenseRow` / `ActivityItem` / `SettlementRow` / `FeedItemDetailSheet`). Leave them out of every commit in this plan — keep them as a separate change.

---

## Task 1: i18n — add and update keys

**Files:**
- Modify: `i18n/locales/en.json`
- Modify: `i18n/locales/he.json`

The new design uses two new keys and reworded copy on one existing key. Land i18n first so component code can reference the keys safely.

- [ ] **Step 1: Open `i18n/locales/en.json` and locate the `groups.summary` block (around line 162)**

It currently looks like:
```json
"summary": {
  "youAreOwed": "You are owed {{amount}}",
  "youOwe": "You owe {{amount}}"
},
```

Replace with:
```json
"summary": {
  "youAreOwed": "You have {{amount}} to your credit",
  "youOwe": "You owe {{amount}}",
  "noOpenPayments": "No open payments"
},
```

- [ ] **Step 2: Add `groups.detail.title` in en.json**

Inside the `"groups"` object (right after `"settings": "Group settings",` around line 175), add a new sibling:
```json
"detail": {
  "title": "Group"
},
```

(If a `groups.detail` block already exists, append `"title": "Group"` to it instead.)

- [ ] **Step 3: Mirror the same three changes in `i18n/locales/he.json`**

Find `groups.summary` and update / add:
```json
"summary": {
  "youAreOwed": "יש לך {{amount}} לזכות",
  "youOwe": "אתה חייב {{amount}}",
  "noOpenPayments": "אין תשלומים פתוחים"
},
```

Find `groups` and add:
```json
"detail": {
  "title": "קבוצה"
},
```

(If you are unsure about the Hebrew phrasing, copy from the existing `groups.summary.youOwe` tone — both strings use 2nd-person masculine singular in the rest of the file.)

- [ ] **Step 4: Validate JSON parses**

Run:
```bash
cd cost-share-app/apps/mobile && node -e "JSON.parse(require('fs').readFileSync('i18n/locales/en.json','utf8')); JSON.parse(require('fs').readFileSync('i18n/locales/he.json','utf8')); console.log('OK')"
```
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/apps/mobile/i18n/locales/en.json cost-share-app/apps/mobile/i18n/locales/he.json
git commit -m "i18n(mobile): add groups.detail.title and groups.summary.noOpenPayments, reword youAreOwed"
```

---

## Task 2: `FeedRowThumbnail` — shared 44×44 image-or-icon

**Files:**
- Create: `components/FeedRowThumbnail.tsx`
- Test: `__tests__/components/FeedRowThumbnail.test.tsx`

44×44 square with 10-px radius. Image when `imageUrl` is set; otherwise an icon centered on a tinted background. Pure UI — accepts everything as props, no state, no data hooks.

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/FeedRowThumbnail.test.tsx`:
```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { FeedRowThumbnail } from '../../components/FeedRowThumbnail';

describe('FeedRowThumbnail', () => {
  it('renders an Image when imageUrl is provided', () => {
    const { getByTestId, queryByTestId } = render(
      <FeedRowThumbnail imageUrl="https://example.com/x.jpg" testID="thumb" />,
    );
    expect(getByTestId('thumb-image')).toBeTruthy();
    expect(queryByTestId('thumb-icon')).toBeNull();
  });

  it('renders an icon when no imageUrl is provided', () => {
    const { getByTestId, queryByTestId } = render(
      <FeedRowThumbnail iconName="restaurant-outline" testID="thumb" />,
    );
    expect(getByTestId('thumb-icon')).toBeTruthy();
    expect(queryByTestId('thumb-image')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

Run:
```bash
cd cost-share-app/apps/mobile && npx jest __tests__/components/FeedRowThumbnail.test.tsx
```
Expected: `Cannot find module '../../components/FeedRowThumbnail'`

- [ ] **Step 3: Implement `FeedRowThumbnail`**

Create `components/FeedRowThumbnail.tsx`:
```tsx
/**
 * FeedRowThumbnail — 44×44 thumbnail used by activity feed rows.
 * Renders an Image when imageUrl is provided; otherwise a centered icon
 * on a tinted background.
 */

import React from 'react';
import { View, Image } from 'react-native';
import { AppIcon } from './AppIcon';
import { colors } from '../theme';

interface FeedRowThumbnailProps {
    imageUrl?: string;
    iconName?: React.ComponentProps<typeof AppIcon>['name'];
    iconColor?: string;
    iconBgColor?: string;
    testID?: string;
}

export function FeedRowThumbnail({
    imageUrl,
    iconName,
    iconColor = colors.primaryDark,
    iconBgColor = colors.primaryExtraLight,
    testID,
}: FeedRowThumbnailProps) {
    if (imageUrl) {
        return (
            <Image
                source={{ uri: imageUrl }}
                style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: colors.borderSoft,
                }}
                resizeMode="cover"
                testID={testID ? `${testID}-image` : undefined}
            />
        );
    }
    return (
        <View
            style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                backgroundColor: iconBgColor,
                alignItems: 'center',
                justifyContent: 'center',
            }}
            testID={testID ? `${testID}-icon` : undefined}
        >
            {iconName && <AppIcon name={iconName} size={22} color={iconColor} />}
        </View>
    );
}
```

**Note on token names:** if `colors.borderSoft` or `colors.primaryExtraLight` don't exist verbatim in `theme/colors.ts`, open that file and use the closest names — likely `colors.border?.soft` or `colors.borderCard`, and `colors.primaryExtraLight` is referenced elsewhere in the codebase so it should exist. If not, the design tokens table at the top of the spec (and the live `theme/colors.ts`) is the source of truth.

- [ ] **Step 4: Run the test — expect pass**

Run:
```bash
npx jest __tests__/components/FeedRowThumbnail.test.tsx
```
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/apps/mobile/components/FeedRowThumbnail.tsx cost-share-app/apps/mobile/__tests__/components/FeedRowThumbnail.test.tsx
git commit -m "feat(mobile): add FeedRowThumbnail primitive for activity feed rows"
```

---

## Task 3: `FeedRowCard` — shared row container

**Files:**
- Create: `components/FeedRowCard.tsx`
- Test: `__tests__/components/FeedRowCard.test.tsx`

White card, 16-px radius, 1-px gray-100 border, padding 12×14, gap 12 between thumbnail and body, body flex-1 with title + meta, right column with amount + optional sub-line. Press-through to `onPress` when provided.

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/FeedRowCard.test.tsx`:
```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { FeedRowCard } from '../../components/FeedRowCard';
import { View } from 'react-native';

describe('FeedRowCard', () => {
  const baseProps = {
    thumbnail: <View testID="thumb-stub" />,
    title: 'Sushi on Friday',
    meta: 'Aug 14 · Paid by Sarah',
    amount: 'USD 84.20',
  };

  it('renders title, meta, and amount', () => {
    const { getByText } = render(<FeedRowCard {...baseProps} />);
    expect(getByText('Sushi on Friday')).toBeTruthy();
    expect(getByText('Aug 14 · Paid by Sarah')).toBeTruthy();
    expect(getByText('USD 84.20')).toBeTruthy();
  });

  it('renders the sub-line when provided', () => {
    const { getByText, queryByText, rerender } = render(
      <FeedRowCard {...baseProps} subLine="You lent USD 21.05" />,
    );
    expect(getByText('You lent USD 21.05')).toBeTruthy();
    rerender(<FeedRowCard {...baseProps} />);
    expect(queryByText('You lent USD 21.05')).toBeNull();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <FeedRowCard {...baseProps} onPress={onPress} testID="card" />,
    );
    fireEvent.press(getByTestId('card'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

Run:
```bash
npx jest __tests__/components/FeedRowCard.test.tsx
```
Expected: module-not-found.

- [ ] **Step 3: Implement `FeedRowCard`**

Create `components/FeedRowCard.tsx`:
```tsx
/**
 * FeedRowCard — the white card frame used by activity feed rows (expenses,
 * settlements). Accepts pre-formatted display strings; data shaping happens
 * in the caller.
 */

import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Text } from './AppText';

interface FeedRowCardProps {
    thumbnail: React.ReactNode;
    title: string;
    meta: string;
    amount: string;
    subLine?: string;
    onPress?: () => void;
    testID?: string;
}

export function FeedRowCard({
    thumbnail,
    title,
    meta,
    amount,
    subLine,
    onPress,
    testID,
}: FeedRowCardProps) {
    const Container: any = onPress ? TouchableOpacity : View;
    const containerProps = onPress
        ? { onPress, activeOpacity: 0.7, testID }
        : { testID };

    return (
        <Container
            {...containerProps}
            className="bg-white rounded-2xl border border-gray-100 px-3.5 py-3 mb-2 flex-row items-center"
            style={{ gap: 12 }}
        >
            {thumbnail}
            <View className="flex-1 min-w-0">
                <Text
                    className="text-[15px] font-semibold text-gray-900"
                    numberOfLines={1}
                >
                    {title}
                </Text>
                <Text
                    className="text-[11px] text-gray-400 mt-0.5"
                    numberOfLines={1}
                >
                    {meta}
                </Text>
            </View>
            <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
                <Text
                    className="text-[15px] font-bold text-gray-900"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                    {amount}
                </Text>
                {subLine && (
                    <Text
                        className="text-[11px] font-medium text-gray-500 mt-0.5"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                        {subLine}
                    </Text>
                )}
            </View>
        </Container>
    );
}
```

- [ ] **Step 4: Run the test — expect pass**

Run:
```bash
npx jest __tests__/components/FeedRowCard.test.tsx
```
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/apps/mobile/components/FeedRowCard.tsx cost-share-app/apps/mobile/__tests__/components/FeedRowCard.test.tsx
git commit -m "feat(mobile): add FeedRowCard primitive for activity feed rows"
```

---

## Task 4: `MemberStack` — stacked avatars with "+N"

**Files:**
- Create: `components/groupDetail/MemberStack.tsx`
- Test: `__tests__/components/MemberStack.test.tsx`

Renders the first 4 members as `MemberAvatar size="xs"` (32 px) with overlapping `-8` margins. If there are more than 4, the fifth slot is a `+N` tile with `gray100` bg and `gray700` text.

- [ ] **Step 1: Create the folder if needed**

Run:
```bash
mkdir -p cost-share-app/apps/mobile/components/groupDetail
```

- [ ] **Step 2: Write the failing test**

Create `__tests__/components/MemberStack.test.tsx`:
```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { MemberStack } from '../../components/groupDetail/MemberStack';
import { GroupMemberLite } from '@cost-share/shared';

const member = (i: number): GroupMemberLite => ({
  userId: `u${i}`,
  displayName: `User ${i}`,
  isActive: true,
});

describe('MemberStack', () => {
  it('renders up to four avatars and no overflow tile when ≤4', () => {
    const { queryByTestId } = render(
      <MemberStack members={[member(1), member(2), member(3), member(4)]} testID="stack" />,
    );
    expect(queryByTestId('stack-overflow')).toBeNull();
  });

  it('renders the +N overflow tile when more than four members', () => {
    const { getByTestId, getByText } = render(
      <MemberStack
        members={[member(1), member(2), member(3), member(4), member(5), member(6)]}
        testID="stack"
      />,
    );
    expect(getByTestId('stack-overflow')).toBeTruthy();
    expect(getByText('+2')).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run the test — expect failure**

Run:
```bash
npx jest __tests__/components/MemberStack.test.tsx
```
Expected: module-not-found.

- [ ] **Step 4: Implement `MemberStack`**

Create `components/groupDetail/MemberStack.tsx`:
```tsx
/**
 * MemberStack — first four members as overlapping 32px avatars, with a "+N"
 * tile for the rest. Used inside SummaryCover but kept generic.
 */

import React from 'react';
import { View } from 'react-native';
import { Text } from '../AppText';
import { MemberAvatar } from '../MemberAvatar';
import { GroupMemberLite } from '@cost-share/shared';
import { colors } from '../../theme';

interface MemberStackProps {
    members: GroupMemberLite[];
    testID?: string;
}

const MAX_VISIBLE = 4;

export function MemberStack({ members, testID }: MemberStackProps) {
    const shown = members.slice(0, MAX_VISIBLE);
    const extra = Math.max(0, members.length - shown.length);
    return (
        <View
            style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 0 }}
            testID={testID}
        >
            {shown.map((m, i) => (
                <View
                    key={m.userId}
                    style={{
                        marginLeft: i === 0 ? 0 : -8,
                        borderRadius: 9999,
                        shadowColor: '#fff',
                        shadowOpacity: 1,
                        shadowRadius: 0,
                        shadowOffset: { width: 0, height: 0 },
                    }}
                >
                    <MemberAvatar member={m} size="xs" />
                </View>
            ))}
            {extra > 0 && (
                <View
                    style={{
                        marginLeft: -8,
                        width: 32,
                        height: 32,
                        borderRadius: 9999,
                        backgroundColor: colors.gray100,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 2,
                        borderColor: '#fff',
                    }}
                    testID={testID ? `${testID}-overflow` : undefined}
                >
                    <Text
                        className="text-[11px] font-semibold"
                        style={{ color: colors.gray700 }}
                    >
                        +{extra}
                    </Text>
                </View>
            )}
        </View>
    );
}
```

**Verify the `MemberAvatar` prop name:** the existing `MemberAvatar.tsx` may take `member={m}` OR `name={...} initials={...}` style. Open `components/MemberAvatar.tsx` and adapt the call to the actual signature.

- [ ] **Step 5: Run the test — expect pass**

Run:
```bash
npx jest __tests__/components/MemberStack.test.tsx
```
Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add cost-share-app/apps/mobile/components/groupDetail/MemberStack.tsx cost-share-app/apps/mobile/__tests__/components/MemberStack.test.tsx
git commit -m "feat(mobile): add MemberStack component for stacked group avatars"
```

---

## Task 5: `SummaryCover` — 150-px cover with title and members

**Files:**
- Create: `components/groupDetail/SummaryCover.tsx`

Top half of the summary card. Image (cover) or type gradient with centered type icon. Bottom scrim. Type chip top-start. Title + member count bottom-start. `MemberStack` bottom-end.

- [ ] **Step 1: Implement `SummaryCover`**

Create `components/groupDetail/SummaryCover.tsx`:
```tsx
/**
 * SummaryCover — top region of GroupSummaryCard.
 * Image background OR type gradient + icon, with scrim, type chip,
 * title block, and member stack overlaid.
 */

import React from 'react';
import { View, ImageBackground } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Group, GroupMemberLite } from '@cost-share/shared';
import { Text } from '../AppText';
import { AppIcon } from '../AppIcon';
import { MemberStack } from './MemberStack';
import { getGroupTypeVisual } from '../../lib/groupTypeVisuals';

const COVER_HEIGHT = 150;

interface SummaryCoverProps {
    group: Group;
    members: GroupMemberLite[];
}

export function SummaryCover({ group, members }: SummaryCoverProps) {
    const { t } = useTranslation();
    const visual = getGroupTypeVisual(group.groupType);
    const typeLabel = t(`groups.types.${group.groupType}`, {
        defaultValue: group.groupType,
    });

    const overlay = (
        <>
            <View
                pointerEvents="none"
                style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    top: 0,
                }}
            >
                <LinearGradient
                    colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']}
                    locations={[0.35, 1]}
                    style={{ flex: 1 }}
                />
            </View>

            <View
                style={{
                    position: 'absolute',
                    top: 10,
                    start: 10,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 9999,
                    backgroundColor: 'rgba(0,0,0,0.55)',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                }}
            >
                <AppIcon name={visual.icon} size={12} color="#fff" />
                <Text
                    className="text-[11px] font-semibold text-white"
                    style={{ textTransform: 'capitalize' }}
                >
                    {typeLabel}
                </Text>
            </View>

            <View
                style={{
                    position: 'absolute',
                    start: 14,
                    end: 14,
                    bottom: 10,
                    flexDirection: 'row',
                    alignItems: 'flex-end',
                    justifyContent: 'space-between',
                    gap: 10,
                }}
            >
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                        numberOfLines={1}
                        className="text-[18px] font-bold text-white"
                        style={{
                            textShadowColor: 'rgba(0,0,0,0.5)',
                            textShadowOffset: { width: 0, height: 1 },
                            textShadowRadius: 4,
                        }}
                    >
                        {group.name}
                    </Text>
                    <Text
                        numberOfLines={1}
                        className="text-[11px] text-white/90 mt-0.5"
                        style={{
                            textShadowColor: 'rgba(0,0,0,0.5)',
                            textShadowOffset: { width: 0, height: 1 },
                            textShadowRadius: 2,
                        }}
                    >
                        {t('groups.memberCount', { count: members.length })}
                    </Text>
                </View>
                <MemberStack members={members} />
            </View>
        </>
    );

    if (group.imageUrl) {
        return (
            <ImageBackground
                source={{ uri: group.imageUrl }}
                resizeMode="cover"
                style={{ width: '100%', height: COVER_HEIGHT }}
                testID="summary-cover-image"
            >
                {overlay}
            </ImageBackground>
        );
    }

    return (
        <LinearGradient
            colors={visual.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ width: '100%', height: COVER_HEIGHT }}
            testID="summary-cover-gradient"
        >
            <View
                style={{
                    position: 'absolute',
                    inset: 0,
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <AppIcon
                    name={visual.icon}
                    size={72}
                    color="rgba(255,255,255,0.45)"
                />
            </View>
            {overlay}
        </LinearGradient>
    );
}
```

**Notes:**
- `start` / `end` in `style` are RN's logical-edge properties (RN 0.71+). If TypeScript complains, fall back to `useRtlLayout()` and manually swap `left`/`right`.
- `inset: 0` is RN 0.72+. If it errors, expand to `top: 0, left: 0, right: 0, bottom: 0`.
- The `groups.types.<type>` lookup falls back to the raw type slug if a translation is missing.

- [ ] **Step 2: Quick smoke render test**

Create `__tests__/components/SummaryCover.test.tsx`:
```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { SummaryCover } from '../../components/groupDetail/SummaryCover';

const mockGroup = (overrides: Partial<any> = {}): any => ({
  id: 'g1',
  name: 'Paris Trip',
  groupType: 'trip',
  imageUrl: undefined,
  defaultCurrency: 'USD',
  ...overrides,
});

describe('SummaryCover', () => {
  it('renders gradient variant when no imageUrl', () => {
    const { getByTestId, queryByTestId } = render(
      <SummaryCover group={mockGroup()} members={[]} />,
    );
    expect(getByTestId('summary-cover-gradient')).toBeTruthy();
    expect(queryByTestId('summary-cover-image')).toBeNull();
  });

  it('renders image variant when imageUrl is set', () => {
    const { getByTestId, queryByTestId } = render(
      <SummaryCover
        group={mockGroup({ imageUrl: 'https://example.com/x.jpg' })}
        members={[]}
      />,
    );
    expect(getByTestId('summary-cover-image')).toBeTruthy();
    expect(queryByTestId('summary-cover-gradient')).toBeNull();
  });

  it('renders the group name and member count', () => {
    const { getByText } = render(
      <SummaryCover
        group={mockGroup({ name: 'Paris Trip' })}
        members={[
          { userId: 'u1', displayName: 'A', isActive: true },
          { userId: 'u2', displayName: 'B', isActive: true },
        ]}
      />,
    );
    expect(getByText('Paris Trip')).toBeTruthy();
    // memberCount uses pluralization — assert digit + "people"
    expect(getByText(/2/)).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run the test — expect pass**

Run:
```bash
npx jest __tests__/components/SummaryCover.test.tsx
```
Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/apps/mobile/components/groupDetail/SummaryCover.tsx cost-share-app/apps/mobile/__tests__/components/SummaryCover.test.tsx
git commit -m "feat(mobile): add SummaryCover for new group summary card"
```

---

## Task 6: `SummaryBalanceStrip` — tappable balance row

**Files:**
- Create: `components/groupDetail/SummaryBalanceStrip.tsx`
- Test: `__tests__/components/SummaryBalanceStrip.test.tsx`

Middle strip of the card. One line of copy with the amount inline (colored green/red). Chevron at the end. Whole row tappable.

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/SummaryBalanceStrip.test.tsx`:
```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SummaryBalanceStrip } from '../../components/groupDetail/SummaryBalanceStrip';

describe('SummaryBalanceStrip', () => {
  it('renders the owed copy when net is positive', () => {
    const { getByText } = render(
      <SummaryBalanceStrip
        balance={{ net: 42, currency: 'USD', isSettled: false }}
        onPress={() => {}}
      />,
    );
    expect(getByText(/USD 42\.00/)).toBeTruthy();
    expect(getByText(/credit/i)).toBeTruthy();
  });

  it('renders the owe copy when net is negative', () => {
    const { getByText } = render(
      <SummaryBalanceStrip
        balance={{ net: -10, currency: 'USD', isSettled: false }}
        onPress={() => {}}
      />,
    );
    expect(getByText(/USD 10\.00/)).toBeTruthy();
    expect(getByText(/owe/i)).toBeTruthy();
  });

  it('renders the settled copy when isSettled', () => {
    const { queryByText, getByText } = render(
      <SummaryBalanceStrip
        balance={{ net: 0, currency: 'USD', isSettled: true }}
        onPress={() => {}}
      />,
    );
    expect(getByText(/settled/i)).toBeTruthy();
    expect(queryByText(/USD 0/)).toBeNull();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <SummaryBalanceStrip
        balance={{ net: 42, currency: 'USD', isSettled: false }}
        onPress={onPress}
        testID="strip"
      />,
    );
    fireEvent.press(getByTestId('strip'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

Run:
```bash
npx jest __tests__/components/SummaryBalanceStrip.test.tsx
```
Expected: module-not-found.

- [ ] **Step 3: Implement `SummaryBalanceStrip`**

Create `components/groupDetail/SummaryBalanceStrip.tsx`:
```tsx
/**
 * SummaryBalanceStrip — tappable middle row of GroupSummaryCard.
 * One sentence with the inline amount in green (owed) or red (owe).
 */

import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { useTranslation, Trans } from 'react-i18next';
import { Text } from '../AppText';
import { AppIcon } from '../AppIcon';
import { useRtlLayout } from '../../hooks/useRtlLayout';
import { colors } from '../../theme';

interface BalanceShape {
    net: number;
    currency: string;
    isSettled: boolean;
}

interface SummaryBalanceStripProps {
    balance: BalanceShape;
    onPress: () => void;
    testID?: string;
}

function formatAmount(amount: number, currency: string): string {
    return `${currency} ${Math.abs(amount).toFixed(2)}`;
}

export function SummaryBalanceStrip({
    balance,
    onPress,
    testID,
}: SummaryBalanceStripProps) {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();
    const { net, currency, isSettled } = balance;
    const owed = net > 0;
    const amount = formatAmount(net, currency);
    const amountColor = owed ? colors.success : colors.error;

    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.7}
            testID={testID}
            style={{
                paddingHorizontal: 16,
                paddingVertical: 14,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
            }}
        >
            <Text
                className="text-[15px] text-gray-900 flex-1"
                numberOfLines={2}
            >
                {isSettled ? (
                    t('groups.card.settled')
                ) : (
                    <Trans
                        i18nKey={owed ? 'groups.summary.youAreOwed' : 'groups.summary.youOwe'}
                        values={{ amount }}
                        components={{
                            1: (
                                <Text
                                    className="font-bold"
                                    style={{
                                        color: amountColor,
                                        fontVariantNumeric: 'tabular-nums',
                                    }}
                                />
                            ),
                        }}
                    />
                )}
            </Text>
            <AppIcon
                name={isRtl ? 'chevron-back' : 'chevron-forward'}
                size={18}
                color={colors.gray400}
            />
        </TouchableOpacity>
    );
}
```

**Why `<Trans>`:** the amount needs colored styling inline with the sentence. The existing translation values are simple "You have {{amount}} to your credit" — to color just the amount, wrap it in a `<1>...</1>` placeholder. Update `en.json` (Task 1) to use `"You have <1>{{amount}}</1> to your credit"` if it doesn't already — see Step 4 below.

- [ ] **Step 4: Update i18n strings to support inline color spans**

Open `i18n/locales/en.json` and update the two summary strings to wrap the amount in `<1>...</1>`:
```json
"summary": {
  "youAreOwed": "You have <1>{{amount}}</1> to your credit",
  "youOwe": "You owe <1>{{amount}}</1>",
  "noOpenPayments": "No open payments"
},
```

Mirror in `i18n/locales/he.json`:
```json
"summary": {
  "youAreOwed": "יש לך <1>{{amount}}</1> לזכות",
  "youOwe": "אתה חייב <1>{{amount}}</1>",
  "noOpenPayments": "אין תשלומים פתוחים"
},
```

If `react-i18next`'s `<Trans>` is already used elsewhere in the project (grep for `import.*Trans`), follow the same import style. Otherwise importing `Trans` from `react-i18next` is the standard path.

- [ ] **Step 5: Verify other consumers of `youAreOwed` / `youOwe` still render correctly**

Grep:
```bash
grep -rn "youAreOwed\|youOwe" cost-share-app/apps/mobile/ --include="*.tsx" --include="*.ts" | grep -v __tests__ | grep -v "/i18n/"
```
Each consumer that uses `t('groups.summary.youAreOwed', { amount })` directly (not via `<Trans>`) will render the literal `<1>…</1>` markers. For each one, decide: either also switch the call site to `<Trans>`, OR strip the markers in JS:
```ts
t('groups.summary.youAreOwed', { amount }).replace(/<\/?1>/g, '')
```
Pick the simpler local fix per consumer. The dashboard and balance screens are the likely candidates — check `BalanceSummaryHeader.tsx` and `GroupBalanceBanner.tsx` first.

**Note:** `GroupBalanceBanner.tsx` is one of those consumers, but it's being deleted in Task 12 — so no fix needed there.

- [ ] **Step 6: Run the test — expect pass**

Run:
```bash
npx jest __tests__/components/SummaryBalanceStrip.test.tsx
```
Expected: 4 passed.

- [ ] **Step 7: Commit**

```bash
git add cost-share-app/apps/mobile/components/groupDetail/SummaryBalanceStrip.tsx cost-share-app/apps/mobile/__tests__/components/SummaryBalanceStrip.test.tsx cost-share-app/apps/mobile/i18n/locales/en.json cost-share-app/apps/mobile/i18n/locales/he.json
# also any consumer files you adjusted in Step 5
git commit -m "feat(mobile): add SummaryBalanceStrip with inline-colored amount"
```

---

## Task 7: `SummaryFooter` — divider + payments-to-settle + Note + Settle-up pills

**Files:**
- Create: `components/groupDetail/SummaryFooter.tsx`
- Test: `__tests__/components/SummaryFooter.test.tsx`

Below the balance strip. Top border (16-px inset). Left text: pluralized "N payments to settle everyone" or "No open payments" when settled. Right: Note pill (always visible, amber dot when content) + Settle up pill (disabled when settled).

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/SummaryFooter.test.tsx`:
```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SummaryFooter } from '../../components/groupDetail/SummaryFooter';

describe('SummaryFooter', () => {
  const base = {
    settlementCount: 1,
    isSettled: false,
    noteHasContent: false,
    onOpenNote: jest.fn(),
    onOpenSettleUp: jest.fn(),
  };

  it('shows pluralized "payments to settle" text when not settled', () => {
    const { getByText } = render(<SummaryFooter {...base} settlementCount={1} />);
    expect(getByText(/1 payment/i)).toBeTruthy();
  });

  it('shows "No open payments" when settled', () => {
    const { getByText } = render(
      <SummaryFooter {...base} isSettled settlementCount={0} />,
    );
    expect(getByText(/no open payments/i)).toBeTruthy();
  });

  it('shows the amber dot when noteHasContent is true', () => {
    const { getByTestId, queryByTestId } = render(
      <SummaryFooter {...base} noteHasContent />,
    );
    expect(getByTestId('summary-note-dot')).toBeTruthy();
  });

  it('hides the amber dot when noteHasContent is false', () => {
    const { queryByTestId } = render(<SummaryFooter {...base} />);
    expect(queryByTestId('summary-note-dot')).toBeNull();
  });

  it('disables the settle-up pill when settled', () => {
    const onOpenSettleUp = jest.fn();
    const { getByTestId } = render(
      <SummaryFooter {...base} isSettled onOpenSettleUp={onOpenSettleUp} />,
    );
    fireEvent.press(getByTestId('summary-settle-pill'));
    expect(onOpenSettleUp).not.toHaveBeenCalled();
  });

  it('calls onOpenNote / onOpenSettleUp on tap', () => {
    const onOpenNote = jest.fn();
    const onOpenSettleUp = jest.fn();
    const { getByTestId } = render(
      <SummaryFooter
        {...base}
        onOpenNote={onOpenNote}
        onOpenSettleUp={onOpenSettleUp}
      />,
    );
    fireEvent.press(getByTestId('summary-note-pill'));
    fireEvent.press(getByTestId('summary-settle-pill'));
    expect(onOpenNote).toHaveBeenCalledTimes(1);
    expect(onOpenSettleUp).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

Run:
```bash
npx jest __tests__/components/SummaryFooter.test.tsx
```
Expected: module-not-found.

- [ ] **Step 3: Implement `SummaryFooter`**

Create `components/groupDetail/SummaryFooter.tsx`:
```tsx
/**
 * SummaryFooter — bottom region of GroupSummaryCard.
 * Shows "N payments to settle" on the left and Note + Settle-up pills
 * on the right. Note pill is always rendered; the amber dot toggles on
 * noteHasContent. Settle-up is disabled in the settled state.
 */

import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '../AppText';
import { AppIcon } from '../AppIcon';
import { useRtlLayout } from '../../hooks/useRtlLayout';
import { colors } from '../../theme';

interface SummaryFooterProps {
    settlementCount: number;
    isSettled: boolean;
    noteHasContent: boolean;
    onOpenNote: () => void;
    onOpenSettleUp: () => void;
}

export function SummaryFooter({
    settlementCount,
    isSettled,
    noteHasContent,
    onOpenNote,
    onOpenSettleUp,
}: SummaryFooterProps) {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();

    return (
        <View
            style={{
                marginHorizontal: 16,
                paddingTop: 12,
                paddingBottom: 14,
                borderTopWidth: 1,
                borderTopColor: colors.borderSoft,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
            }}
        >
            <Text
                className="text-[12px] text-gray-500 flex-1"
                numberOfLines={1}
            >
                {isSettled
                    ? t('groups.summary.noOpenPayments')
                    : t('balances.paymentsToSettle', { count: settlementCount })}
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TouchableOpacity
                    onPress={onOpenNote}
                    activeOpacity={0.7}
                    testID="summary-note-pill"
                    style={{
                        backgroundColor: '#fff',
                        borderColor: colors.borderCard,
                        borderWidth: 1,
                        borderRadius: 9999,
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                    }}
                >
                    <AppIcon
                        name="receipt-outline"
                        size={13}
                        color={colors.gray700}
                    />
                    <Text
                        className="text-[12px] font-semibold"
                        style={{ color: colors.gray700 }}
                    >
                        {t('groups.actions.note')}
                    </Text>
                    {noteHasContent && (
                        <View
                            testID="summary-note-dot"
                            style={{
                                position: 'absolute',
                                top: 4,
                                right: 4,
                                width: 7,
                                height: 7,
                                borderRadius: 9999,
                                backgroundColor: colors.warning,
                                borderWidth: 1.5,
                                borderColor: '#fff',
                            }}
                        />
                    )}
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={isSettled ? undefined : onOpenSettleUp}
                    activeOpacity={isSettled ? 1 : 0.7}
                    disabled={isSettled}
                    testID="summary-settle-pill"
                    style={{
                        backgroundColor: isSettled
                            ? colors.gray100
                            : colors.primaryExtraLight,
                        borderRadius: 9999,
                        paddingHorizontal: 14,
                        paddingVertical: 7,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                    }}
                >
                    <Text
                        className="text-[12px] font-semibold"
                        style={{
                            color: isSettled
                                ? colors.gray400
                                : colors.primaryDark,
                        }}
                    >
                        {t('groups.actions.settleUp')}
                    </Text>
                    <AppIcon
                        name={isRtl ? 'arrow-back' : 'arrow-forward'}
                        size={12}
                        color={isSettled ? colors.gray400 : colors.primaryDark}
                    />
                </TouchableOpacity>
            </View>
        </View>
    );
}
```

**Note on color tokens:** the implementation references `colors.borderSoft`, `colors.borderCard`, `colors.warning`, `colors.primaryExtraLight`, `colors.primaryDark`, `colors.success`, `colors.error`, `colors.gray*`. Open `theme/colors.ts` once during implementation and substitute any names that differ — the spec's "Design tokens used" table lists every value but not necessarily the JS export name.

- [ ] **Step 4: Run the test — expect pass**

Run:
```bash
npx jest __tests__/components/SummaryFooter.test.tsx
```
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/apps/mobile/components/groupDetail/SummaryFooter.tsx cost-share-app/apps/mobile/__tests__/components/SummaryFooter.test.tsx
git commit -m "feat(mobile): add SummaryFooter with Note + Settle-up pills"
```

---

## Task 8: `GroupSummaryCard` — orchestrator

**Files:**
- Create: `components/groupDetail/GroupSummaryCard.tsx`
- Test: `__tests__/components/GroupSummaryCard.test.tsx`

Wraps the three regions in a single white card (radius 20, border, shadow). Page-side padding 16, top/bottom 6/12 around the card.

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/GroupSummaryCard.test.tsx`:
```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { GroupSummaryCard } from '../../components/groupDetail/GroupSummaryCard';
import { Group, GroupMemberLite } from '@cost-share/shared';

const group: Group = {
  id: 'g1',
  name: 'Paris Trip',
  groupType: 'trip',
  defaultCurrency: 'USD',
  // fill remaining required fields with sensible defaults; the spec
  // only relies on name, groupType, imageUrl
} as Group;

const members: GroupMemberLite[] = [
  { userId: 'u1', displayName: 'A', isActive: true },
  { userId: 'u2', displayName: 'B', isActive: true },
];

describe('GroupSummaryCard', () => {
  it('renders the cover, balance strip, and footer', () => {
    const { getByText, getByTestId } = render(
      <GroupSummaryCard
        group={group}
        members={members}
        balance={{ net: 42, currency: 'USD', isSettled: false }}
        settlementCount={1}
        noteHasContent={false}
        onOpenBalances={() => {}}
        onOpenNote={() => {}}
        onOpenSettleUp={() => {}}
      />,
    );
    expect(getByText('Paris Trip')).toBeTruthy();
    expect(getByText(/USD 42\.00/)).toBeTruthy();
    expect(getByTestId('summary-note-pill')).toBeTruthy();
    expect(getByTestId('summary-settle-pill')).toBeTruthy();
  });

  it('routes the three tap targets to their handlers', () => {
    const onOpenBalances = jest.fn();
    const onOpenNote = jest.fn();
    const onOpenSettleUp = jest.fn();
    const { getByTestId } = render(
      <GroupSummaryCard
        group={group}
        members={members}
        balance={{ net: 42, currency: 'USD', isSettled: false }}
        settlementCount={1}
        noteHasContent={false}
        onOpenBalances={onOpenBalances}
        onOpenNote={onOpenNote}
        onOpenSettleUp={onOpenSettleUp}
      />,
    );
    fireEvent.press(getByTestId('summary-balance-strip'));
    fireEvent.press(getByTestId('summary-note-pill'));
    fireEvent.press(getByTestId('summary-settle-pill'));
    expect(onOpenBalances).toHaveBeenCalledTimes(1);
    expect(onOpenNote).toHaveBeenCalledTimes(1);
    expect(onOpenSettleUp).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

Run:
```bash
npx jest __tests__/components/GroupSummaryCard.test.tsx
```
Expected: module-not-found.

- [ ] **Step 3: Implement `GroupSummaryCard`**

Create `components/groupDetail/GroupSummaryCard.tsx`:
```tsx
/**
 * GroupSummaryCard — composite hero card replacing GroupHero +
 * GroupBalanceBanner. Composes SummaryCover, SummaryBalanceStrip, and
 * SummaryFooter inside a single rounded white frame.
 */

import React from 'react';
import { View } from 'react-native';
import { Group, GroupMemberLite } from '@cost-share/shared';
import { SummaryCover } from './SummaryCover';
import { SummaryBalanceStrip } from './SummaryBalanceStrip';
import { SummaryFooter } from './SummaryFooter';
import { colors, shadows } from '../../theme';

export interface GroupSummaryBalance {
    net: number;
    currency: string;
    isSettled: boolean;
}

interface GroupSummaryCardProps {
    group: Group;
    members: GroupMemberLite[];
    balance: GroupSummaryBalance;
    settlementCount: number;
    noteHasContent: boolean;
    onOpenBalances: () => void;
    onOpenNote: () => void;
    onOpenSettleUp: () => void;
}

export function GroupSummaryCard({
    group,
    members,
    balance,
    settlementCount,
    noteHasContent,
    onOpenBalances,
    onOpenNote,
    onOpenSettleUp,
}: GroupSummaryCardProps) {
    return (
        <View
            style={{
                paddingHorizontal: 16,
                paddingTop: 6,
                paddingBottom: 12,
                backgroundColor: '#fff',
            }}
        >
            <View
                style={{
                    borderRadius: 20,
                    overflow: 'hidden',
                    borderWidth: 1,
                    borderColor: colors.borderCard,
                    backgroundColor: '#fff',
                    ...(shadows?.sm ?? {}),
                }}
            >
                <SummaryCover group={group} members={members} />
                <SummaryBalanceStrip
                    balance={balance}
                    onPress={onOpenBalances}
                    testID="summary-balance-strip"
                />
                <SummaryFooter
                    settlementCount={settlementCount}
                    isSettled={balance.isSettled}
                    noteHasContent={noteHasContent}
                    onOpenNote={onOpenNote}
                    onOpenSettleUp={onOpenSettleUp}
                />
            </View>
        </View>
    );
}
```

**On `shadows`:** the theme exports `shadows` from `theme/shadows.ts`. If `shadows.sm` doesn't exist, replace the spread with the literal RN shadow:
```ts
shadowColor: '#000',
shadowOffset: { width: 0, height: 1 },
shadowOpacity: 0.05,
shadowRadius: 2,
elevation: 1,
```

- [ ] **Step 4: Run the test — expect pass**

Run:
```bash
npx jest __tests__/components/GroupSummaryCard.test.tsx
```
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/apps/mobile/components/groupDetail/GroupSummaryCard.tsx cost-share-app/apps/mobile/__tests__/components/GroupSummaryCard.test.tsx
git commit -m "feat(mobile): add GroupSummaryCard composite component"
```

---

## Task 9: `GroupDetailAppBar` — flat white app bar

**Files:**
- Create: `components/groupDetail/GroupDetailAppBar.tsx`
- Test: `__tests__/components/GroupDetailAppBar.test.tsx`

Sits above the summary card. Back chevron · "Group" title · share + menu icons. Handles its own safe-area top inset.

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/GroupDetailAppBar.test.tsx`:
```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { GroupDetailAppBar } from '../../components/groupDetail/GroupDetailAppBar';

describe('GroupDetailAppBar', () => {
  it('renders the default "Group" title', () => {
    const { getByText } = render(
      <GroupDetailAppBar onBack={() => {}} onShare={() => {}} onMenu={() => {}} />,
    );
    expect(getByText(/^Group$/i)).toBeTruthy();
  });

  it('fires the three callbacks on tap', () => {
    const onBack = jest.fn();
    const onShare = jest.fn();
    const onMenu = jest.fn();
    const { getByTestId } = render(
      <GroupDetailAppBar onBack={onBack} onShare={onShare} onMenu={onMenu} />,
    );
    fireEvent.press(getByTestId('appbar-back'));
    fireEvent.press(getByTestId('appbar-share'));
    fireEvent.press(getByTestId('appbar-menu'));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onMenu).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

Run:
```bash
npx jest __tests__/components/GroupDetailAppBar.test.tsx
```
Expected: module-not-found.

- [ ] **Step 3: Implement `GroupDetailAppBar`**

Create `components/groupDetail/GroupDetailAppBar.tsx`:
```tsx
/**
 * GroupDetailAppBar — flat white app bar above the GroupSummaryCard.
 * Back chevron, centered "Group" title, share + menu icons on the end.
 */

import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Text } from '../AppText';
import { AppIcon } from '../AppIcon';
import { useRtlLayout } from '../../hooks/useRtlLayout';
import { colors } from '../../theme';

interface GroupDetailAppBarProps {
    onBack: () => void;
    onShare: () => void;
    onMenu: () => void;
    title?: string;
}

export function GroupDetailAppBar({
    onBack,
    onShare,
    onMenu,
    title,
}: GroupDetailAppBarProps) {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const isRtl = useRtlLayout();
    const resolvedTitle = title ?? t('groups.detail.title');

    return (
        <View
            style={{
                backgroundColor: '#fff',
                paddingTop: insets.top + 4,
                paddingBottom: 6,
                paddingHorizontal: 8,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
            }}
        >
            <TouchableOpacity
                onPress={onBack}
                accessibilityRole="button"
                accessibilityLabel="Back"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                testID="appbar-back"
                style={{ padding: 8 }}
            >
                <AppIcon
                    name={isRtl ? 'chevron-forward' : 'chevron-back'}
                    size={24}
                    color={colors.gray700}
                />
            </TouchableOpacity>

            <Text
                className="text-[14px] font-semibold"
                style={{ color: colors.gray500, flex: 1, textAlign: 'center' }}
                numberOfLines={1}
            >
                {resolvedTitle}
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity
                    onPress={onShare}
                    accessibilityRole="button"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    testID="appbar-share"
                    style={{ padding: 8 }}
                >
                    <AppIcon
                        name="share-outline"
                        size={22}
                        color={colors.gray700}
                    />
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={onMenu}
                    accessibilityRole="button"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    testID="appbar-menu"
                    style={{ padding: 8 }}
                >
                    <AppIcon
                        name="ellipsis-vertical"
                        size={22}
                        color={colors.gray700}
                    />
                </TouchableOpacity>
            </View>
        </View>
    );
}
```

- [ ] **Step 4: Run the test — expect pass**

Run:
```bash
npx jest __tests__/components/GroupDetailAppBar.test.tsx
```
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/apps/mobile/components/groupDetail/GroupDetailAppBar.tsx cost-share-app/apps/mobile/__tests__/components/GroupDetailAppBar.test.tsx
git commit -m "feat(mobile): add GroupDetailAppBar"
```

---

## Task 10: Rewrite `ExpenseRow` on top of `FeedRowCard`

**Files:**
- Modify: `components/ExpenseRow.tsx`
- Modify: `__tests__/components/ExpenseRow.test.tsx`

Drop the existing visual layout, compose `<FeedRowCard thumbnail={<FeedRowThumbnail …/>} …/>`. Computes:
- Title = `expense.description`
- Meta = `${formattedDate} · ${t('expenses.paidBy')} ${payerName}` (date first, deliberately, per spec §3 R1)
- Amount = `${expense.currency} ${expense.amount.toFixed(2)}`
- SubLine = involvement line using `groups.expense.youLent` / `groups.expense.youBorrowed` (omit if `userShare ≤ 0`)
- Thumbnail = `receiptUrl` image if present; otherwise category icon

Category icon map lives co-located in this file.

- [ ] **Step 1: Read the current `ExpenseRow.tsx` to capture the existing prop shape**

Run:
```bash
cd cost-share-app/apps/mobile && cat components/ExpenseRow.tsx | head -80
```

Note the props the callers pass in (likely `{ expense: ExpenseWithDelta, payerName?, currentUserId?, onPress? }`). Keep the **same** outer prop signature so callers (`FeedItemRow`) don't need changes.

- [ ] **Step 2: Rewrite `ExpenseRow.tsx`**

Replace the file's body (everything inside the component function) with:
```tsx
/**
 * ExpenseRow — activity-feed row for an expense.
 * Composes the shared FeedRowCard + FeedRowThumbnail primitives.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { ExpenseCategory, ExpenseWithDelta } from '@cost-share/shared';
import { FeedRowCard } from './FeedRowCard';
import { FeedRowThumbnail } from './FeedRowThumbnail';
import { useAppLanguage } from '../hooks/useAppLanguage';
import { formatFeedDateTime } from '../lib/feedDate';

// Map ExpenseCategory → Ionicon for the icon thumbnail fallback.
const CATEGORY_ICON: Record<ExpenseCategory, React.ComponentProps<typeof FeedRowThumbnail>['iconName']> = {
    food: 'restaurant-outline',
    transport: 'car-outline',
    accommodation: 'bed-outline',
    utilities: 'flash-outline',
    entertainment: 'film-outline',
    shopping: 'cart-outline',
    healthcare: 'medkit-outline',
    other: 'pricetag-outline',
};

interface ExpenseRowProps {
    expense: ExpenseWithDelta;
    payerName?: string;
    onPress?: (expenseId: string) => void;
}

function ExpenseRowBase({ expense, payerName, onPress }: ExpenseRowProps) {
    const { t } = useTranslation();
    const language = useAppLanguage();
    const timestamp = formatFeedDateTime(new Date(expense.createdAt), language);

    const amount = `${expense.currency} ${expense.amount.toFixed(2)}`;
    const meta = `${timestamp} · ${t('expenses.paidBy')} ${payerName ?? ''}`.trim();

    // Involvement line — pulled from existing myDelta / myDeltaState fields.
    let subLine: string | undefined;
    const userShare = Math.abs(expense.myDelta);
    if (userShare > 0) {
        const amountStr = userShare.toFixed(2);
        const key =
            expense.myDeltaState === 'lent'
                ? 'groups.expense.youLent'
                : 'groups.expense.youBorrowed';
        subLine = t(key, { amount: `${expense.currency} ${amountStr}` });
    }

    const thumbnail = (
        <FeedRowThumbnail
            imageUrl={expense.receiptUrl ?? undefined}
            iconName={CATEGORY_ICON[expense.category] ?? CATEGORY_ICON.other}
        />
    );

    return (
        <FeedRowCard
            thumbnail={thumbnail}
            title={expense.description}
            meta={meta}
            amount={amount}
            subLine={subLine}
            onPress={onPress ? () => onPress(expense.id) : undefined}
            testID={`expense-row-${expense.id}`}
        />
    );
}

export const ExpenseRow = React.memo(ExpenseRowBase);
```

**Verify before saving:**
1. The `expense.createdAt` field is present on `ExpenseWithDelta`. (The current WIP edits in the working tree already swap to `createdAt`, so the shared type exposes it.) If your branch state still has `expenseDate`, use that here and commit a follow-up swap.
2. `formatFeedDateTime` lives at `lib/feedDate.ts` (or similar) — adjust the import path to whatever the current `ExpenseRow.tsx` uses.
3. `useAppLanguage` — same: copy its import path from the existing file.
4. `expense.receiptUrl` field name — if it's something else (`receipt_url`, `receipt`), adjust.

- [ ] **Step 3: Update `__tests__/components/ExpenseRow.test.tsx`**

The existing test asserts on the old visual. Re-target it:
- Assert that `expense.description` is rendered as the title.
- Assert that the formatted `currency amount.toFixed(2)` is rendered.
- Assert that "You lent" or "You borrowed" appears when `myDelta != 0`.
- Assert that with `receiptUrl`, the thumb renders an image (you can check via testID propagation if `FeedRowThumbnail`'s testID propagates through `FeedRowCard` — if not, just assert that the row doesn't render the icon variant).
- Drop any assertions tied to the old `BalanceChip` / `MemberAvatar`-in-row layout.

Keep the test cases that exercise behavior (onPress, RTL alignment). Delete cases that exercise the old visual contract.

If the existing test file is short and easier to rewrite, rewrite it to mirror the structure of `FeedRowCard.test.tsx`.

- [ ] **Step 4: Run tests**

```bash
npx jest __tests__/components/ExpenseRow.test.tsx
```
Expected: pass.

Also re-run any test that imports `ExpenseRow`:
```bash
npx jest --listTests | xargs grep -l "ExpenseRow" || true
```
Run each one and fix breakages — likely `FeedItemRow.test.tsx` if it exists, and `FeedItemDetailSheet.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/apps/mobile/components/ExpenseRow.tsx cost-share-app/apps/mobile/__tests__/components/ExpenseRow.test.tsx
# plus any sibling test files you adjusted
git commit -m "refactor(mobile): rewrite ExpenseRow using FeedRowCard primitive"
```

---

## Task 11: Rewrite `MessageRow`, `FeedChatRow`, `SettlementRow`

**Files:**
- Modify: `components/MessageRow.tsx`
- Modify: `components/FeedChatRow.tsx`
- Modify: `components/SettlementRow.tsx`
- Modify: `__tests__/components/MessageRow.test.tsx`

Goal: visual consistency with the new ExpenseRow. Specifically:

### 11.1 MessageRow + FeedChatRow

Small avatar (`MemberAvatar size="xs"`) on the start side, white bubble on the rest. Bubble: 16-px radius, 1-px gray-100 border, 10×12 padding, `shadows.sm`. Body text 14 px, meta 11 px (`"{author} · Message · {time}"`).

`FeedChatRow.tsx` is the variant used by `FeedItemRow`. The two files likely already share a body — if so, keep them DRY by having one of them re-export the other or by extracting a tiny `MessageBubble` co-located in the same file. Don't over-engineer it; if the two files differ by a few props today, leave them as two thin files.

- [ ] **Step 1: Read both files to confirm current structure**

```bash
cd cost-share-app/apps/mobile && cat components/MessageRow.tsx components/FeedChatRow.tsx
```

- [ ] **Step 2: Rewrite `MessageRow.tsx` body**

Adjust the JSX to the spec — single avatar on the start side, bubble with the new typography & padding. Preserve the existing prop shape. Reuse `shadows.sm` from `theme` (or the literal RN shadow values from Task 8 Step 3) for the bubble shadow.

Sketch:
```tsx
return (
    <View
        style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 10,
            marginBottom: 10,
            paddingHorizontal: 8,
        }}
    >
        <MemberAvatar member={author} size="xs" />
        <View
            style={{
                flex: 1,
                backgroundColor: '#fff',
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.gray100,
                paddingHorizontal: 12,
                paddingVertical: 10,
                ...(shadows?.sm ?? {}),
            }}
        >
            <Text className="text-[14px] text-gray-900">
                {message.body}
            </Text>
            <Text className="text-[11px] text-gray-500 mt-1">
                {`${authorName} · ${t('groups.share.typeMessage')} · ${time}`}
            </Text>
        </View>
    </View>
);
```

**Naming check before saving:** the current code probably uses `MemberAvatar` with either `member={author}` or `name={...} initials={...}` — copy whichever signature is in use today.

- [ ] **Step 3: Make `FeedChatRow.tsx` re-export `MessageRow` (if they truly do the same thing)**

If `FeedChatRow` was just `MessageRow` with a slightly different prop adapter, replace its body with a thin adapter (`export const FeedChatRow = (props) => <MessageRow ... />`) — or simply rewrite both to delegate to a single body. Keep both files in place so callers don't need to change imports.

- [ ] **Step 4: Rewrite `SettlementRow.tsx` on top of `FeedRowCard`**

A settlement is a "USER A paid USER B X" row. Reuse `FeedRowCard`:
- Thumbnail: an icon (e.g., `swap-horizontal-outline` or `checkmark-circle-outline`) in `primaryExtraLight`.
- Title: settlement summary (e.g., `${fromName} → ${toName}`) — reuse whatever title the current code computes.
- Meta: date · "Settlement" (or whatever the current code does for the type label).
- Amount: `${currency} ${amount.toFixed(2)}`.
- No subLine.

Keep the same outer prop signature.

- [ ] **Step 5: Update tests**

Update `__tests__/components/MessageRow.test.tsx` to match new markup. There's no `SettlementRow.test.tsx` today — add one if behavior-relevant assertions are missing; otherwise skip.

- [ ] **Step 6: Run all affected tests**

```bash
npx jest __tests__/components/MessageRow.test.tsx __tests__/components/FeedItemDetailSheet.test.tsx
```
Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add cost-share-app/apps/mobile/components/MessageRow.tsx cost-share-app/apps/mobile/components/FeedChatRow.tsx cost-share-app/apps/mobile/components/SettlementRow.tsx cost-share-app/apps/mobile/__tests__/components/MessageRow.test.tsx
git commit -m "refactor(mobile): restyle MessageRow, FeedChatRow, SettlementRow for R1 design"
```

---

## Task 12: Swap `GroupDetailScreen` to the new components

**Files:**
- Modify: `screens/groups/GroupDetailScreen.tsx`

This is the integration step. Replace the `ListHeaderComponent` chunk that renders `<GroupHero/>` + `<QuickActionsRow/>` with the new app bar + summary card. Drop the `<GroupBalanceBanner/>` call site (likely already absent from the current `ListHeaderComponent` — confirm via grep — but the screen file imports `GroupBalanceBanner` indirectly through `<View>` wrappers; just confirm no stray reference remains).

- [ ] **Step 1: Re-read the current screen header block**

The current `ListHeaderComponent` (around lines 591–656 in `screens/groups/GroupDetailScreen.tsx`) contains:
1. `<GroupHero …/>`
2. `<QuickActionsRow …/>`
3. The inline search + filter row.

You'll replace items 1 + 2 with `<GroupDetailAppBar/>` + `<GroupSummaryCard/>`. Item 3 (search + filter row) stays unchanged.

- [ ] **Step 2: Add the new imports**

At the top of `GroupDetailScreen.tsx`, replace the `GroupHero` and `QuickActionsRow` imports with:
```tsx
import { GroupDetailAppBar } from '../../components/groupDetail/GroupDetailAppBar';
import { GroupSummaryCard } from '../../components/groupDetail/GroupSummaryCard';
```
Remove these old imports:
```tsx
import { GroupHero } from '../../components/GroupHero';
import { QuickActionsRow } from '../../components/QuickActionsRow';
```

If `GroupBalanceBanner` is imported but unused (no `<GroupBalanceBanner/>` JSX), remove its import too.

Also remove these unused-after-swap imports:
- `calculateGroupTotalSpent`, `calculateGroupTotalUnsettled`, `sortCurrencyAmounts` from `@cost-share/shared` (only used by `heroStats`).

If the linter complains about other unused imports after this change, drop them.

- [ ] **Step 3: Compute the new derived values**

Inside the component (above the JSX return), after the existing `useGroupSettlementsQuery`/`useGroupPairwiseDebtsQuery` lines, add:

```tsx
const groupBalance = useAppStore(s => s.groupBalances[groupId]);
const balance = useMemo(() => {
    const net = groupBalance?.net ?? 0;
    return {
        net,
        currency: groupBalance?.currency ?? displayGroup?.defaultCurrency ?? 'USD',
        isSettled: Math.abs(net) < 0.01,
    };
}, [groupBalance, displayGroup?.defaultCurrency]);

const noteHasContent = Boolean(displayGroup?.note?.trim());
const settlementCount = pairwiseDebts.length;
```

`groupBalance` may be a different shape than `{ net, currency }` — open `store/` to confirm. The existing `GroupBalanceBanner` was called with `balance={...}` — copy how the screen used to compute that. If the call site used to be inside `ListHeaderComponent`, look there.

Remove the existing `heroStats` `useMemo` block (about 15 lines) — nothing uses it after this task.

- [ ] **Step 4: Render the new header block**

Find the `ListHeaderComponent` value (a JSX fragment) and replace the first two children:
```tsx
ListHeaderComponent={
    <>
        <GroupDetailAppBar
            onBack={handleBack}
            onShare={handleShare}
            onMenu={handleOpenGroupMenu}
        />
        <GroupSummaryCard
            group={displayGroup}
            members={memberLites}
            balance={balance}
            settlementCount={settlementCount}
            noteHasContent={noteHasContent}
            onOpenBalances={handleBalances}
            onOpenNote={handleNote}
            onOpenSettleUp={handleSettleUp}
        />
        {/* Search + filter row (unchanged) */}
        <View className="px-4 mt-3 mb-2 flex-row items-center">
            …
        </View>
    </>
}
```

The handler names (`handleBack`, `handleShare`, `handleOpenGroupMenu`, `handleBalances`, `handleNote`, `handleSettleUp`) all exist in the current file — no new handlers to add.

- [ ] **Step 5: Type-check the file**

Run:
```bash
cd cost-share-app/apps/mobile && npx tsc --noEmit -p tsconfig.json 2>&1 | head -40
```
Expected: no errors in `GroupDetailScreen.tsx`. Fix any type mismatch (most likely: `balance.currency` typing, or the `displayGroup` non-null assertion).

- [ ] **Step 6: Run unit tests once more**

```bash
npx jest __tests__/components/GroupSummaryCard.test.tsx __tests__/components/GroupDetailAppBar.test.tsx __tests__/components/ExpenseRow.test.tsx __tests__/components/MessageRow.test.tsx
```
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add cost-share-app/apps/mobile/screens/groups/GroupDetailScreen.tsx
git commit -m "feat(mobile): wire GroupSummaryCard and new app bar into GroupDetailScreen"
```

---

## Task 13: Delete dead components and their tests

**Files:**
- Delete: `components/GroupHero.tsx`
- Delete: `components/GroupBalanceBanner.tsx`
- Delete: `components/QuickActionsRow.tsx`
- Delete: `__tests__/components/GroupHero.test.tsx`
- Delete: `__tests__/components/GroupBalanceBanner.test.tsx`
- Delete: `__tests__/components/QuickActionsRow.test.tsx`

- [ ] **Step 1: Re-confirm no consumers remain**

Run:
```bash
cd cost-share-app/apps/mobile && grep -rn "GroupHero\|GroupBalanceBanner\|QuickActionsRow" --include="*.tsx" --include="*.ts" | grep -v __tests__ | grep -v "/GroupHero.tsx\|/GroupBalanceBanner.tsx\|/QuickActionsRow.tsx"
```
Expected: empty output. If any path appears, that consumer must be updated before deletion — most likely a stale import comment in `GroupDetailScreen.tsx`.

- [ ] **Step 2: Delete the files**

```bash
git rm cost-share-app/apps/mobile/components/GroupHero.tsx \
        cost-share-app/apps/mobile/components/GroupBalanceBanner.tsx \
        cost-share-app/apps/mobile/components/QuickActionsRow.tsx \
        cost-share-app/apps/mobile/__tests__/components/GroupHero.test.tsx \
        cost-share-app/apps/mobile/__tests__/components/GroupBalanceBanner.test.tsx \
        cost-share-app/apps/mobile/__tests__/components/QuickActionsRow.test.tsx
```

- [ ] **Step 3: Run the full test suite**

```bash
cd cost-share-app/apps/mobile && npx jest 2>&1 | tail -30
```
Expected: all suites pass.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(mobile): remove GroupHero, GroupBalanceBanner, QuickActionsRow (replaced by GroupSummaryCard)"
```

---

## Task 14: Type-check and manual QA pass

**Files:** none — verification only.

- [ ] **Step 1: Type-check the whole mobile app**

```bash
cd cost-share-app/apps/mobile && npx tsc --noEmit -p tsconfig.json 2>&1 | tail -30
```
Expected: zero errors.

- [ ] **Step 2: Lint**

```bash
cd cost-share-app/apps/mobile && npx eslint 'components/**/*.tsx' 'screens/groups/GroupDetailScreen.tsx' 2>&1 | tail -30
```
Expected: zero errors. (Warnings OK if existing.)

- [ ] **Step 3: Start the dev server and walk the QA checklist**

```bash
cd cost-share-app/apps/mobile && npx expo start --clear
```

Visit Group Detail and check each item:
- [ ] LTR — group with cover image — looks correct
- [ ] LTR — group without cover image (gradient + type icon) — looks correct
- [ ] RTL (switch device to Hebrew) — group with cover image — buttons mirrored, title block on the start side
- [ ] RTL — gradient — same
- [ ] Settled state (`net = 0`) — middle strip shows "You're all settled in this group", Settle-up pill disabled
- [ ] Owed state (`net > 0`) — green amount, "to your credit" copy
- [ ] Owe state (`net < 0`) — red amount, "you owe" copy
- [ ] Empty feed — empty state still renders
- [ ] Search-results-empty — still works
- [ ] Populated feed — expense rows render with thumbnails (image when receipt, icon otherwise), "You lent / borrowed" sub-line visible only when `userShare > 0`
- [ ] Tap middle strip → navigates to Balances
- [ ] Tap Note pill → navigates to GroupNote; back; amber dot appears if the note has content
- [ ] Tap Settle up pill → navigates to SettleUpList (when not settled); doesn't navigate when settled
- [ ] Tap an expense row → opens `FeedItemDetailSheet`
- [ ] Tap a message row → opens the message edit sheet
- [ ] FAB pair still works (Add expense + Message)
- [ ] Long group name (>20 chars) — truncates with ellipsis on cover; app-bar title stays "Group"
- [ ] 1-member group — single avatar, no overflow tile
- [ ] 4-member group — four avatars, no overflow
- [ ] 6-member group — four avatars + "+2" tile

- [ ] **Step 4: If anything looks off, file findings and fix**

Each fix lands as its own commit. Don't squash visual fixes into the integration commit — keeps the diff legible during review.

---

## Done

When all 14 tasks are checked off, the new Group Detail design is live on the branch. Open a PR to `main`.

**PR title:** `feat(mobile): redesign Group Detail screen — summary card + R1 activity rows`

**PR body** (skeleton):
```markdown
## Summary
- Replaces GroupHero + GroupBalanceBanner + QuickActionsRow with a single GroupSummaryCard
- Adds a flat GroupDetailAppBar above the card
- Restyles activity feed rows (ExpenseRow / MessageRow / FeedChatRow / SettlementRow) on top of shared FeedRowCard + FeedRowThumbnail primitives
- Adds/updates 3 i18n keys in en.json + he.json

ActivityFeedScreen migration to the new row primitives is a follow-up.

## Test plan
- [ ] All unit tests pass (`npx jest`)
- [ ] Type-check passes (`npx tsc --noEmit`)
- [ ] Manual QA matrix from the plan (LTR/RTL × image/gradient × settled/owed/owe)
```
