# Profile Dashboard & Settings Redesign Implementation Plan (Direct-Supabase, no notifications)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the bare Profile and Settings screens with a personal dashboard (balance summary, group stats, friends list) and a grouped Settings screen (language picker, legal sheets, rate app, WhatsApp contact, version footer, logout).

**Architecture:** Mobile calls Supabase directly (no NestJS — server was deleted). Dashboard aggregation lives in a Postgres RPC function `get_user_dashboard(p_user_id uuid)` to avoid 4–5 roundtrips and to centralize the SQL. UI components and i18n keys live in mobile only. **No notifications, no push, no badge, no unread count** — out of scope for this branch.

**FX simplification:** No exchange-rate API. The hero card shows two headline numbers only when *all* the user's balances are in their `defaultCurrency`; otherwise the headlines render as `—` and the per-currency breakdown is shown by default. Friends list only includes balances in the user's `defaultCurrency` — multi-currency balances surface through the breakdown.

**Tech Stack:** Supabase (Postgres + Auth + Storage), Supabase JS 2.x, Expo SDK 54, React Native, NativeWind, Zustand, i18next, jest-expo, `expo-application` (Phase 2), `expo-store-review` (Phase 2), `expo-linking` (already installed).

---

## File map

| File | Responsibility |
|------|----------------|
| `cost-share-app/packages/shared/src/types/index.ts` | Add `UserDashboard`, `FriendBalance`, `DashboardStats`, `BalanceSummary` |
| `cost-share-app/supabase/schema.sql` | Append `get_user_dashboard()` Postgres function |
| `cost-share-app/apps/mobile/services/dashboard.service.ts` | `fetchDashboard()` — `supabase.rpc('get_user_dashboard', ...)` |
| `cost-share-app/apps/mobile/screens/profile/ProfileScreen.tsx` | Rewrite into dashboard |
| `cost-share-app/apps/mobile/screens/profile/SettingsScreen.tsx` | Rewrite into grouped settings |
| `cost-share-app/apps/mobile/components/dashboard/{BalanceHeroCard,StatTile,FriendBalanceRow,ProfileHeaderRow}.tsx` | Dashboard atoms |
| `cost-share-app/apps/mobile/components/settings/{SettingsSection,SettingsRow,LegalSheet,LanguageSheet}.tsx` | Settings atoms |
| `cost-share-app/apps/mobile/i18n/locales/en.json` + `he.json` | New `dashboard`, expanded `settings`, new `legal` keys |
| `cost-share-app/apps/mobile/navigation/AppNavigator.tsx` | Header title for ProfileMain → "Kupa", centered |
| `cost-share-app/apps/mobile/.env.example` | New `EXPO_PUBLIC_APP_STORE_URL`, `EXPO_PUBLIC_PLAY_STORE_URL`, `EXPO_PUBLIC_SUPPORT_WHATSAPP_NUMBER` |
| `docs/SSOT/SRS.md` | Add REQ-PROF-04, REQ-PROF-05 |

---

## Phase 0 — Foundations

### Task 0.1: Add shared dashboard types

**Files:** Modify `cost-share-app/packages/shared/src/types/index.ts`.

- [ ] **Step 1:** Append types before the `// LEGACY TYPES` divider:

```typescript
/**
 * Profile dashboard payload — supabase.rpc('get_user_dashboard')
 * Headlines (totalOwed / totalOwedToUser) are null when balances span multiple currencies.
 */
export interface BalanceSummary {
    totalOwed: number | null;
    totalOwedToUser: number | null;
    defaultCurrency: string;
    byCurrency: {
        currency: string;
        owed: number;
        owedToUser: number;
    }[];
}

export interface FriendBalance {
    userId: string;
    name: string;
    avatarUrl?: string;
    netBalance: number;          // Positive = friend owes you
    currency: string;            // Always equals user's defaultCurrency
    sharedGroupIds: string[];
}

export interface DashboardStats {
    closedGroupsCount: number;
    activeGroupsCount: number;
}

export interface UserDashboard {
    balanceSummary: BalanceSummary;
    stats: DashboardStats;
    friends: FriendBalance[];
}
```

- [ ] **Step 2:** `cd cost-share-app/packages/shared && npx tsc --noEmit` — expect no output.

- [ ] **Step 3:** Commit

```bash
git add cost-share-app/packages/shared/src/types/index.ts
git commit -m "feat(shared): add UserDashboard / FriendBalance / BalanceSummary types"
```

---

### Task 0.2: Add `get_user_dashboard` Postgres RPC

**Files:** Modify `cost-share-app/supabase/schema.sql`.

- [ ] **Step 1:** Append at the end of `schema.sql`:

```sql
-- ============================================
-- DASHBOARD RPC
-- ============================================

CREATE OR REPLACE FUNCTION get_user_dashboard(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_default_currency TEXT;
    v_by_currency JSONB;
    v_total_owed NUMERIC;
    v_total_owed_to_user NUMERIC;
    v_friends JSONB;
    v_stats JSONB;
    v_currency_count INT;
BEGIN
    SELECT COALESCE(default_currency, 'USD') INTO v_default_currency FROM profiles WHERE id = p_user_id;
    IF v_default_currency IS NULL THEN v_default_currency := 'USD'; END IF;

    -- Per-currency totals for the user across their active groups
    WITH user_groups AS (
        SELECT gm.group_id, g.default_currency
        FROM group_members gm JOIN groups g ON g.id = gm.group_id
        WHERE gm.user_id = p_user_id AND gm.is_active = TRUE AND g.is_active = TRUE
    ),
    user_paid AS (
        SELECT e.group_id, SUM(e.amount) AS amount FROM expenses e
        WHERE e.paid_by = p_user_id AND e.is_deleted = FALSE
          AND e.group_id IN (SELECT group_id FROM user_groups)
        GROUP BY e.group_id
    ),
    user_owed AS (
        SELECT e.group_id, SUM(es.amount) AS amount
        FROM expense_splits es JOIN expenses e ON e.id = es.expense_id
        WHERE es.user_id = p_user_id AND e.is_deleted = FALSE
          AND e.group_id IN (SELECT group_id FROM user_groups)
        GROUP BY e.group_id
    ),
    user_settled_received AS (
        SELECT group_id, SUM(amount) AS amount FROM settlements
        WHERE to_user_id = p_user_id AND group_id IN (SELECT group_id FROM user_groups)
        GROUP BY group_id
    ),
    user_settled_paid AS (
        SELECT group_id, SUM(amount) AS amount FROM settlements
        WHERE from_user_id = p_user_id AND group_id IN (SELECT group_id FROM user_groups)
        GROUP BY group_id
    ),
    per_group AS (
        SELECT
            ug.group_id, ug.default_currency AS currency,
            COALESCE(up.amount, 0) - COALESCE(uo.amount, 0)
              + COALESCE(usr.amount, 0) - COALESCE(usp.amount, 0) AS net_balance
        FROM user_groups ug
        LEFT JOIN user_paid up ON up.group_id = ug.group_id
        LEFT JOIN user_owed uo ON uo.group_id = ug.group_id
        LEFT JOIN user_settled_received usr ON usr.group_id = ug.group_id
        LEFT JOIN user_settled_paid usp ON usp.group_id = ug.group_id
    ),
    per_currency AS (
        SELECT currency,
            SUM(CASE WHEN net_balance < 0 THEN -net_balance ELSE 0 END) AS owed,
            SUM(CASE WHEN net_balance > 0 THEN net_balance ELSE 0 END) AS owed_to_user
        FROM per_group GROUP BY currency
    )
    SELECT
        COALESCE(jsonb_agg(jsonb_build_object(
            'currency', currency,
            'owed', ROUND(owed::numeric, 2),
            'owedToUser', ROUND(owed_to_user::numeric, 2)
        )), '[]'::jsonb),
        COUNT(*)
    INTO v_by_currency, v_currency_count
    FROM per_currency;

    -- Headlines only when single-currency
    IF v_currency_count = 1 THEN
        SELECT
            ROUND(SUM(CASE WHEN net_balance < 0 THEN -net_balance ELSE 0 END)::numeric, 2),
            ROUND(SUM(CASE WHEN net_balance > 0 THEN net_balance ELSE 0 END)::numeric, 2)
        INTO v_total_owed, v_total_owed_to_user
        FROM (
            WITH user_groups AS (
                SELECT gm.group_id FROM group_members gm JOIN groups g ON g.id = gm.group_id
                WHERE gm.user_id = p_user_id AND gm.is_active = TRUE AND g.is_active = TRUE
            ),
            user_paid AS (SELECT e.group_id, SUM(e.amount) AS amount FROM expenses e WHERE e.paid_by = p_user_id AND e.is_deleted = FALSE AND e.group_id IN (SELECT group_id FROM user_groups) GROUP BY e.group_id),
            user_owed AS (SELECT e.group_id, SUM(es.amount) AS amount FROM expense_splits es JOIN expenses e ON e.id = es.expense_id WHERE es.user_id = p_user_id AND e.is_deleted = FALSE AND e.group_id IN (SELECT group_id FROM user_groups) GROUP BY e.group_id),
            user_settled_received AS (SELECT group_id, SUM(amount) AS amount FROM settlements WHERE to_user_id = p_user_id AND group_id IN (SELECT group_id FROM user_groups) GROUP BY group_id),
            user_settled_paid AS (SELECT group_id, SUM(amount) AS amount FROM settlements WHERE from_user_id = p_user_id AND group_id IN (SELECT group_id FROM user_groups) GROUP BY group_id)
            SELECT
                COALESCE(up.amount, 0) - COALESCE(uo.amount, 0)
                  + COALESCE(usr.amount, 0) - COALESCE(usp.amount, 0) AS net_balance
            FROM user_groups ug
            LEFT JOIN user_paid up ON up.group_id = ug.group_id
            LEFT JOIN user_owed uo ON uo.group_id = ug.group_id
            LEFT JOIN user_settled_received usr ON usr.group_id = ug.group_id
            LEFT JOIN user_settled_paid usp ON usp.group_id = ug.group_id
        ) totals;
    ELSE
        v_total_owed := NULL;
        v_total_owed_to_user := NULL;
    END IF;

    -- Stats: closed (all active members net=0) vs active
    WITH user_groups AS (
        SELECT gm.group_id FROM group_members gm JOIN groups g ON g.id = gm.group_id
        WHERE gm.user_id = p_user_id AND gm.is_active = TRUE AND g.is_active = TRUE
    ),
    gma AS (
        SELECT gm.group_id, gm.user_id FROM group_members gm
        WHERE gm.is_active = TRUE AND gm.group_id IN (SELECT group_id FROM user_groups)
    ),
    mp AS (SELECT e.group_id, e.paid_by AS user_id, SUM(e.amount) AS amount FROM expenses e WHERE e.is_deleted = FALSE AND e.group_id IN (SELECT group_id FROM user_groups) GROUP BY e.group_id, e.paid_by),
    mo AS (SELECT e.group_id, es.user_id, SUM(es.amount) AS amount FROM expense_splits es JOIN expenses e ON e.id = es.expense_id WHERE e.is_deleted = FALSE AND e.group_id IN (SELECT group_id FROM user_groups) GROUP BY e.group_id, es.user_id),
    msr AS (SELECT group_id, to_user_id AS user_id, SUM(amount) AS amount FROM settlements WHERE group_id IN (SELECT group_id FROM user_groups) GROUP BY group_id, to_user_id),
    msp AS (SELECT group_id, from_user_id AS user_id, SUM(amount) AS amount FROM settlements WHERE group_id IN (SELECT group_id FROM user_groups) GROUP BY group_id, from_user_id),
    member_bal AS (
        SELECT gma.group_id, gma.user_id,
            COALESCE(mp.amount, 0) - COALESCE(mo.amount, 0)
              + COALESCE(msr.amount, 0) - COALESCE(msp.amount, 0) AS net
        FROM gma
        LEFT JOIN mp ON mp.group_id = gma.group_id AND mp.user_id = gma.user_id
        LEFT JOIN mo ON mo.group_id = gma.group_id AND mo.user_id = gma.user_id
        LEFT JOIN msr ON msr.group_id = gma.group_id AND msr.user_id = gma.user_id
        LEFT JOIN msp ON msp.group_id = gma.group_id AND msp.user_id = gma.user_id
    ),
    group_status AS (
        SELECT group_id, BOOL_AND(ABS(net) < 0.01) AS is_closed FROM member_bal GROUP BY group_id
    )
    SELECT jsonb_build_object(
        'closedGroupsCount', COALESCE(COUNT(*) FILTER (WHERE is_closed), 0),
        'activeGroupsCount', COALESCE(COUNT(*) FILTER (WHERE NOT is_closed), 0)
    ) INTO v_stats FROM group_status;

    -- Friends (only groups in user's defaultCurrency)
    WITH user_groups_in_default AS (
        SELECT gm.group_id FROM group_members gm JOIN groups g ON g.id = gm.group_id
        WHERE gm.user_id = p_user_id AND gm.is_active = TRUE
          AND g.is_active = TRUE AND g.default_currency = v_default_currency
    ),
    co_members AS (
        SELECT DISTINCT gm.user_id FROM group_members gm
        WHERE gm.group_id IN (SELECT group_id FROM user_groups_in_default)
          AND gm.is_active = TRUE AND gm.user_id <> p_user_id
    ),
    pair_per_group AS (
        SELECT
            gm.user_id AS friend_id, gm.group_id,
            COALESCE((SELECT SUM(amount) FROM expenses WHERE paid_by = gm.user_id AND group_id = gm.group_id AND is_deleted = FALSE), 0)
              - COALESCE((SELECT SUM(es.amount) FROM expense_splits es JOIN expenses e ON e.id = es.expense_id WHERE es.user_id = gm.user_id AND e.group_id = gm.group_id AND e.is_deleted = FALSE), 0)
              + COALESCE((SELECT SUM(amount) FROM settlements WHERE to_user_id = gm.user_id AND group_id = gm.group_id), 0)
              - COALESCE((SELECT SUM(amount) FROM settlements WHERE from_user_id = gm.user_id AND group_id = gm.group_id), 0) AS friend_net,
            COALESCE((SELECT SUM(amount) FROM expenses WHERE paid_by = p_user_id AND group_id = gm.group_id AND is_deleted = FALSE), 0)
              - COALESCE((SELECT SUM(es.amount) FROM expense_splits es JOIN expenses e ON e.id = es.expense_id WHERE es.user_id = p_user_id AND e.group_id = gm.group_id AND e.is_deleted = FALSE), 0)
              + COALESCE((SELECT SUM(amount) FROM settlements WHERE to_user_id = p_user_id AND group_id = gm.group_id), 0)
              - COALESCE((SELECT SUM(amount) FROM settlements WHERE from_user_id = p_user_id AND group_id = gm.group_id), 0) AS user_net
        FROM group_members gm
        JOIN co_members cm ON cm.user_id = gm.user_id
        WHERE gm.group_id IN (SELECT group_id FROM user_groups_in_default)
          AND gm.is_active = TRUE
    ),
    friend_totals AS (
        SELECT friend_id,
            -- Per group: if user is owed and friend owes → allocate min as friend-owes-user
            SUM(LEAST(GREATEST(user_net, 0), GREATEST(-friend_net, 0)))
              - SUM(LEAST(GREATEST(-user_net, 0), GREATEST(friend_net, 0))) AS net_toward_user,
            ARRAY_AGG(DISTINCT group_id) AS shared_group_ids
        FROM pair_per_group
        GROUP BY friend_id
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'userId', ft.friend_id,
        'name', p.name,
        'avatarUrl', p.avatar_url,
        'netBalance', ROUND(ft.net_toward_user::numeric, 2),
        'currency', v_default_currency,
        'sharedGroupIds', ft.shared_group_ids
    )), '[]'::jsonb) INTO v_friends
    FROM friend_totals ft JOIN profiles p ON p.id = ft.friend_id
    WHERE ABS(ft.net_toward_user) >= 0.01;

    RETURN jsonb_build_object(
        'balanceSummary', jsonb_build_object(
            'totalOwed', v_total_owed,
            'totalOwedToUser', v_total_owed_to_user,
            'defaultCurrency', v_default_currency,
            'byCurrency', v_by_currency
        ),
        'stats', v_stats,
        'friends', COALESCE(v_friends, '[]'::jsonb)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_dashboard(UUID) TO authenticated;
```

- [ ] **Step 2:** Apply to Supabase via SQL Editor (manual). Tell the user to paste the new block and run it.

- [ ] **Step 3:** Smoke-test:

```bash
cd cost-share-app/apps/mobile && node -e "
require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');
const c = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
c.rpc('get_user_dashboard', { p_user_id: '<paste a real profile id>' }).then(r => console.log(JSON.stringify(r, null, 2)));
"
```

Expected: `{ data: { balanceSummary, stats, friends }, error: null }`.

- [ ] **Step 4:** Commit

```bash
git add cost-share-app/supabase/schema.sql
git commit -m "feat(db): add get_user_dashboard RPC for profile dashboard"
```

---

## Phase 1 — Dashboard (mobile)

### Task 1.1: `dashboard.service.ts`

**Files:**
- Create: `cost-share-app/apps/mobile/services/dashboard.service.ts`
- Create: `cost-share-app/apps/mobile/__tests__/services/dashboard.service.test.ts`

- [ ] **Step 1:** Test:

```typescript
const mockRpc = jest.fn();
jest.mock('../../lib/supabase', () => ({ supabase: { rpc: (...a: any[]) => mockRpc(...a) } }));
jest.mock('../../lib/auth', () => ({ getCurrentUserId: jest.fn().mockResolvedValue('u1') }));

import { fetchDashboard } from '../../services/dashboard.service';

beforeEach(() => mockRpc.mockReset());

describe('fetchDashboard', () => {
    it('returns dashboard payload on success', async () => {
        const payload = { balanceSummary: { totalOwed: 0, totalOwedToUser: 0, defaultCurrency: 'USD', byCurrency: [] }, stats: { closedGroupsCount: 0, activeGroupsCount: 0 }, friends: [] };
        mockRpc.mockResolvedValue({ data: payload, error: null });
        expect(await fetchDashboard()).toEqual(payload);
        expect(mockRpc).toHaveBeenCalledWith('get_user_dashboard', { p_user_id: 'u1' });
    });

    it('returns null when no user', async () => {
        const auth = await import('../../lib/auth');
        (auth.getCurrentUserId as jest.Mock).mockResolvedValueOnce(null);
        expect(await fetchDashboard()).toBeNull();
    });

    it('returns null on RPC error', async () => {
        mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
        expect(await fetchDashboard()).toBeNull();
    });
});
```

- [ ] **Step 2:** Run (fail): `cd cost-share-app/apps/mobile && npx jest __tests__/services/dashboard.service.test.ts`

- [ ] **Step 3:** Implement:

```typescript
import { UserDashboard } from '@cost-share/shared';
import { supabase } from '../lib/supabase';
import { getCurrentUserId } from '../lib/auth';

export async function fetchDashboard(): Promise<UserDashboard | null> {
    const userId = await getCurrentUserId();
    if (!userId) return null;
    const { data, error } = await supabase.rpc('get_user_dashboard', { p_user_id: userId });
    if (error) {
        console.error('fetchDashboard failed:', error);
        return null;
    }
    return data as UserDashboard;
}
```

- [ ] **Step 4:** Run (pass).

- [ ] **Step 5:** Commit:

```bash
git add cost-share-app/apps/mobile/services/dashboard.service.ts cost-share-app/apps/mobile/__tests__/services/dashboard.service.test.ts
git commit -m "feat(mobile): add fetchDashboard via supabase.rpc('get_user_dashboard')"
```

---

### Task 1.2: Dashboard i18n keys

**Files:** Modify `cost-share-app/apps/mobile/i18n/locales/en.json` and `he.json`.

- [ ] **Step 1:** Add a top-level `dashboard` key to `en.json` (after the existing `history` block):

```json
,
"dashboard": {
    "appTitle": "Kupa",
    "youOwe": "You owe",
    "youAreOwed": "You're owed",
    "viewBreakdown": "View per-currency breakdown",
    "hideBreakdown": "Hide breakdown",
    "closedGroups": "Closed groups",
    "activeGroups": "Active groups",
    "friends": "Friends",
    "loadError": "Failed to load dashboard",
    "settled": "Settled up",
    "owesYou": "owes you",
    "youOweFriend": "you owe",
    "noFriendsYet": "No shared groups yet"
}
```

- [ ] **Step 2:** Mirror in `he.json` with Hebrew translations.

- [ ] **Step 3:** Commit:

```bash
git add cost-share-app/apps/mobile/i18n/locales/en.json cost-share-app/apps/mobile/i18n/locales/he.json
git commit -m "feat(mobile): add dashboard i18n keys"
```

---

### Task 1.3: `ProfileHeaderRow` component

**Files:**
- Create: `cost-share-app/apps/mobile/components/dashboard/ProfileHeaderRow.tsx`
- Create: `cost-share-app/apps/mobile/__tests__/components/dashboard/ProfileHeaderRow.test.tsx`

- [ ] **Step 1:** Test:

```typescript
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ProfileHeaderRow } from '../../../components/dashboard/ProfileHeaderRow';

describe('ProfileHeaderRow', () => {
    it('renders name, email and triggers onEditPress', () => {
        const onEdit = jest.fn();
        const { getByText, getByTestId } = render(
            <ProfileHeaderRow name="Alice" email="a@x.com" avatarUrl={undefined} onEditPress={onEdit} />,
        );
        expect(getByText('Alice')).toBeTruthy();
        expect(getByText('a@x.com')).toBeTruthy();
        fireEvent.press(getByTestId('profile-header-edit'));
        expect(onEdit).toHaveBeenCalled();
    });
});
```

- [ ] **Step 2:** Run (fail).

- [ ] **Step 3:** Implement:

```typescript
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MemberAvatar } from '../MemberAvatar';
import { AppIcon } from '../AppIcon';
import { colors } from '../../theme';

interface Props {
    name: string;
    email?: string;
    avatarUrl?: string;
    onEditPress: () => void;
}

export function ProfileHeaderRow({ name, email, avatarUrl, onEditPress }: Props) {
    return (
        <View className="bg-white rounded-2xl mx-4 mt-4 mb-4 px-4 py-4 flex-row items-center border border-gray-100">
            <MemberAvatar name={name} avatarUrl={avatarUrl} size="md" />
            <View className="flex-1 ms-3">
                <Text className="text-base font-semibold text-gray-900" numberOfLines={1}>{name}</Text>
                {email ? <Text className="text-sm text-gray-500 mt-0.5" numberOfLines={1}>{email}</Text> : null}
            </View>
            <TouchableOpacity
                onPress={onEditPress}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                testID="profile-header-edit"
                accessibilityLabel="Edit profile"
                className="w-11 h-11 items-center justify-center rounded-full"
            >
                <AppIcon name="create-outline" size={20} color={colors.primary} />
            </TouchableOpacity>
        </View>
    );
}
```

- [ ] **Step 4:** Run (pass).

- [ ] **Step 5:** Commit:

```bash
git add cost-share-app/apps/mobile/components/dashboard/ProfileHeaderRow.tsx cost-share-app/apps/mobile/__tests__/components/dashboard/ProfileHeaderRow.test.tsx
git commit -m "feat(mobile): add ProfileHeaderRow component"
```

---

### Task 1.4: `BalanceHeroCard` component

**Files:**
- Create: `cost-share-app/apps/mobile/components/dashboard/BalanceHeroCard.tsx`
- Create: `cost-share-app/apps/mobile/__tests__/components/dashboard/BalanceHeroCard.test.tsx`

- [ ] **Step 1:** Test:

```typescript
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { BalanceHeroCard } from '../../../components/dashboard/BalanceHeroCard';

const single = { totalOwed: 50, totalOwedToUser: 100, defaultCurrency: 'USD',
    byCurrency: [{ currency: 'USD', owed: 50, owedToUser: 100 }] };
const multi = { totalOwed: null, totalOwedToUser: null, defaultCurrency: 'USD',
    byCurrency: [{ currency: 'USD', owed: 0, owedToUser: 100 }, { currency: 'ILS', owed: 150, owedToUser: 0 }] };

describe('BalanceHeroCard', () => {
    it('renders headline numbers when single currency', () => {
        const { getByText } = render(<BalanceHeroCard summary={single as any} />);
        expect(getByText('dashboard.youOwe')).toBeTruthy();
        expect(getByText(/50\.00/)).toBeTruthy();
        expect(getByText(/100\.00/)).toBeTruthy();
    });

    it('renders em-dash and breakdown by default when multi-currency', () => {
        const { getAllByText, getByText } = render(<BalanceHeroCard summary={multi as any} />);
        expect(getAllByText('—').length).toBeGreaterThanOrEqual(2);
        expect(getByText('ILS')).toBeTruthy();
    });

    it('toggles breakdown for single currency', () => {
        const { getByTestId, getByText } = render(<BalanceHeroCard summary={single as any} />);
        fireEvent.press(getByTestId('balance-hero-toggle'));
        expect(getByText('USD')).toBeTruthy();
    });
});
```

- [ ] **Step 2:** Run (fail).

- [ ] **Step 3:** Implement:

```typescript
import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BalanceSummary } from '@cost-share/shared';
import { AppIcon } from '../AppIcon';
import { colors } from '../../theme';

interface Props { summary: BalanceSummary; }

function formatMoney(value: number | null, currency: string): string {
    if (value === null || !Number.isFinite(value)) return '—';
    return `${value.toFixed(2)} ${currency}`;
}

export function BalanceHeroCard({ summary }: Props) {
    const { t } = useTranslation();
    const multi = summary.totalOwed === null || summary.totalOwedToUser === null;
    const [expanded, setExpanded] = useState(multi);

    return (
        <View className="rounded-2xl mx-4 mb-4 p-5 border border-blue-100" style={{ backgroundColor: '#DBEAFE' }}>
            <View className="flex-row gap-3">
                <View className="flex-1 bg-white/60 rounded-xl p-3">
                    <Text className="text-xs text-gray-600">{t('dashboard.youOwe')}</Text>
                    <Text className="text-2xl font-bold text-red-600 mt-1">
                        {formatMoney(summary.totalOwed, summary.defaultCurrency)}
                    </Text>
                </View>
                <View className="flex-1 bg-white/60 rounded-xl p-3">
                    <Text className="text-xs text-gray-600">{t('dashboard.youAreOwed')}</Text>
                    <Text className="text-2xl font-bold text-green-600 mt-1">
                        {formatMoney(summary.totalOwedToUser, summary.defaultCurrency)}
                    </Text>
                </View>
            </View>

            {summary.byCurrency.length > 0 ? (
                <TouchableOpacity
                    onPress={() => setExpanded(v => !v)}
                    testID="balance-hero-toggle"
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    className="mt-3 flex-row items-center self-start"
                >
                    <Text className="text-sm text-primary me-1">
                        {expanded ? t('dashboard.hideBreakdown') : t('dashboard.viewBreakdown')}
                    </Text>
                    <AppIcon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.primary} />
                </TouchableOpacity>
            ) : null}

            {expanded ? (
                <View className="mt-3 bg-white/60 rounded-xl p-3">
                    {summary.byCurrency.map(row => (
                        <View key={row.currency} className="flex-row justify-between py-1">
                            <Text className="text-sm font-medium text-gray-700">{row.currency}</Text>
                            <Text className="text-sm text-gray-600">
                                -{row.owed.toFixed(2)} / +{row.owedToUser.toFixed(2)}
                            </Text>
                        </View>
                    ))}
                </View>
            ) : null}
        </View>
    );
}
```

- [ ] **Step 4:** Run (pass).

- [ ] **Step 5:** Commit:

```bash
git add cost-share-app/apps/mobile/components/dashboard/BalanceHeroCard.tsx cost-share-app/apps/mobile/__tests__/components/dashboard/BalanceHeroCard.test.tsx
git commit -m "feat(mobile): add BalanceHeroCard with collapsible per-currency breakdown"
```

---

### Task 1.5: `StatTile` component

**Files:**
- Create: `cost-share-app/apps/mobile/components/dashboard/StatTile.tsx`
- Create: `cost-share-app/apps/mobile/__tests__/components/dashboard/StatTile.test.tsx`

- [ ] **Step 1:** Test:

```typescript
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { StatTile } from '../../../components/dashboard/StatTile';

describe('StatTile', () => {
    it('renders label + value and triggers onPress', () => {
        const onPress = jest.fn();
        const { getByText } = render(<StatTile iconName="people-outline" label="Active" value={3} onPress={onPress} />);
        expect(getByText('Active')).toBeTruthy();
        expect(getByText('3')).toBeTruthy();
        fireEvent.press(getByText('3'));
        expect(onPress).toHaveBeenCalled();
    });
});
```

- [ ] **Step 2:** Run (fail).

- [ ] **Step 3:** Implement:

```typescript
import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { AppIcon, AppIconName } from '../AppIcon';
import { colors } from '../../theme';

interface Props {
    iconName: AppIconName;
    label: string;
    value: number;
    onPress: () => void;
    testID?: string;
}

export function StatTile({ iconName, label, value, onPress, testID }: Props) {
    return (
        <TouchableOpacity
            onPress={onPress}
            testID={testID}
            className="flex-1 bg-white rounded-2xl px-3 py-4 border border-gray-100 items-center"
            style={{ minHeight: 88 }}
        >
            <AppIcon name={iconName} size={24} color={colors.primary} />
            <Text className="text-xl font-bold text-gray-900 mt-2">{value}</Text>
            <Text className="text-xs text-gray-500 mt-0.5 text-center">{label}</Text>
        </TouchableOpacity>
    );
}
```

- [ ] **Step 4:** Run (pass).

- [ ] **Step 5:** Commit:

```bash
git add cost-share-app/apps/mobile/components/dashboard/StatTile.tsx cost-share-app/apps/mobile/__tests__/components/dashboard/StatTile.test.tsx
git commit -m "feat(mobile): add StatTile component"
```

---

### Task 1.6: `FriendBalanceRow` component

**Files:**
- Create: `cost-share-app/apps/mobile/components/dashboard/FriendBalanceRow.tsx`
- Create: `cost-share-app/apps/mobile/__tests__/components/dashboard/FriendBalanceRow.test.tsx`

- [ ] **Step 1:** Test:

```typescript
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { FriendBalanceRow } from '../../../components/dashboard/FriendBalanceRow';

const base = { userId: 'u2', name: 'Bob', avatarUrl: undefined, currency: 'USD', sharedGroupIds: ['g1'] };

describe('FriendBalanceRow', () => {
    it('renders amount when friend owes you', () => {
        const { getByText } = render(<FriendBalanceRow friend={{ ...base, netBalance: 25 }} onPress={() => {}} />);
        expect(getByText('Bob')).toBeTruthy();
        expect(getByText(/25\.00/)).toBeTruthy();
    });

    it('shows settled state at zero', () => {
        const { getByText } = render(<FriendBalanceRow friend={{ ...base, netBalance: 0 }} onPress={() => {}} />);
        expect(getByText('dashboard.settled')).toBeTruthy();
    });

    it('triggers onPress with friend data', () => {
        const onPress = jest.fn();
        const friend = { ...base, netBalance: 5 };
        const { getByText } = render(<FriendBalanceRow friend={friend} onPress={onPress} />);
        fireEvent.press(getByText('Bob'));
        expect(onPress).toHaveBeenCalledWith(friend);
    });
});
```

- [ ] **Step 2:** Run (fail).

- [ ] **Step 3:** Implement:

```typescript
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { FriendBalance } from '@cost-share/shared';
import { MemberAvatar } from '../MemberAvatar';

interface Props {
    friend: FriendBalance;
    onPress: (friend: FriendBalance) => void;
    testID?: string;
}

export function FriendBalanceRow({ friend, onPress, testID }: Props) {
    const { t } = useTranslation();
    const isSettled = Math.abs(friend.netBalance) < 0.01;
    const owesYou = friend.netBalance > 0;
    const amountText = isSettled
        ? t('dashboard.settled')
        : `${Math.abs(friend.netBalance).toFixed(2)} ${friend.currency}`;
    const amountClass = isSettled ? 'text-gray-400' : owesYou ? 'text-green-600' : 'text-red-600';

    return (
        <TouchableOpacity
            onPress={() => onPress(friend)}
            testID={testID}
            className="flex-row items-center bg-white rounded-2xl px-4 py-3 mx-4 mb-2 border border-gray-100"
        >
            <MemberAvatar name={friend.name} avatarUrl={friend.avatarUrl} size="sm" />
            <View className="flex-1 ms-3">
                <Text className="text-base font-medium text-gray-900">{friend.name}</Text>
                {!isSettled ? (
                    <Text className="text-xs text-gray-500 mt-0.5">
                        {owesYou ? t('dashboard.owesYou') : t('dashboard.youOweFriend')}
                    </Text>
                ) : null}
            </View>
            <Text className={`text-base font-semibold ${amountClass}`}>{amountText}</Text>
        </TouchableOpacity>
    );
}
```

- [ ] **Step 4:** Run (pass).

- [ ] **Step 5:** Commit:

```bash
git add cost-share-app/apps/mobile/components/dashboard/FriendBalanceRow.tsx cost-share-app/apps/mobile/__tests__/components/dashboard/FriendBalanceRow.test.tsx
git commit -m "feat(mobile): add FriendBalanceRow component"
```

---

### Task 1.7: Rewrite `ProfileScreen` as the dashboard

**Files:**
- Modify: `cost-share-app/apps/mobile/screens/profile/ProfileScreen.tsx`
- Modify: `cost-share-app/apps/mobile/__tests__/screens/profile/ProfileScreen.test.tsx`
- Modify: `cost-share-app/apps/mobile/navigation/AppNavigator.tsx`

- [ ] **Step 1:** Replace `ProfileScreen.test.tsx`:

```typescript
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

const mockNavigate = jest.fn();
const mockSetOptions = jest.fn();

jest.mock('@react-navigation/native', () => {
    const actual = jest.requireActual('@react-navigation/native');
    return {
        ...actual,
        useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn(), setOptions: mockSetOptions }),
        useRoute: () => ({ params: {} }),
        useFocusEffect: (cb: () => void) => cb(),
        useIsFocused: () => true,
    };
});

jest.mock('../../../services/dashboard.service', () => ({ fetchDashboard: jest.fn() }));

import { fetchDashboard } from '../../../services/dashboard.service';
import { ProfileScreen } from '../../../screens/profile/ProfileScreen';
import { useAppStore } from '../../../store';

const mockedFetch = fetchDashboard as jest.MockedFunction<typeof fetchDashboard>;

const dashboardPayload = {
    balanceSummary: { totalOwed: 0, totalOwedToUser: 50, defaultCurrency: 'USD', byCurrency: [{ currency: 'USD', owed: 0, owedToUser: 50 }] },
    stats: { closedGroupsCount: 1, activeGroupsCount: 2 },
    friends: [{ userId: 'u2', name: 'Bob', netBalance: 50, currency: 'USD', sharedGroupIds: ['g1'] }],
};

beforeEach(() => {
    mockNavigate.mockClear();
    mockSetOptions.mockClear();
    mockedFetch.mockReset();
    mockedFetch.mockResolvedValue(dashboardPayload as any);
    useAppStore.setState({
        language: 'en',
        currentUser: { id: 'u1', email: 'a@x.com', name: 'Alice', defaultCurrency: 'USD', language: 'en', createdAt: new Date(), updatedAt: new Date() },
    });
});

describe('ProfileScreen (dashboard)', () => {
    it('renders profile row, hero, tiles, friends list', async () => {
        const { getByText, findByText } = render(<ProfileScreen />);
        expect(await findByText('Alice')).toBeTruthy();
        expect(getByText('a@x.com')).toBeTruthy();
        await waitFor(() => expect(mockedFetch).toHaveBeenCalled());
        expect(await findByText('Bob')).toBeTruthy();
        expect(getByText('dashboard.youAreOwed')).toBeTruthy();
    });

    it('settings header button navigates to Settings', async () => {
        render(<ProfileScreen />);
        await waitFor(() => expect(mockSetOptions).toHaveBeenCalled());
        const headerRight = mockSetOptions.mock.calls[0][0].headerRight;
        const { getByTestId } = render(headerRight());
        fireEvent.press(getByTestId('profile-settings-button'));
        expect(mockNavigate).toHaveBeenCalledWith('Settings');
    });

    it('edit button navigates to EditProfile', async () => {
        const { findByTestId } = render(<ProfileScreen />);
        fireEvent.press(await findByTestId('profile-header-edit'));
        expect(mockNavigate).toHaveBeenCalledWith('EditProfile');
    });
});
```

- [ ] **Step 2:** Run (fail).

- [ ] **Step 3:** Rewrite `ProfileScreen.tsx`:

```typescript
import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { View, ScrollView, RefreshControl, TouchableOpacity, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { UserDashboard, FriendBalance } from '@cost-share/shared';
import { useAppStore } from '../../store';
import { fetchDashboard } from '../../services/dashboard.service';
import { AppIcon } from '../../components/AppIcon';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { EmptyState } from '../../components/EmptyState';
import { ProfileHeaderRow } from '../../components/dashboard/ProfileHeaderRow';
import { BalanceHeroCard } from '../../components/dashboard/BalanceHeroCard';
import { StatTile } from '../../components/dashboard/StatTile';
import { FriendBalanceRow } from '../../components/dashboard/FriendBalanceRow';
import { colors } from '../../theme';

export function ProfileScreen() {
    const { t } = useTranslation();
    const navigation = useNavigation<any>();
    const currentUser = useAppStore((s) => s.currentUser);

    const [dashboard, setDashboard] = useState<UserDashboard | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const load = useCallback(async () => {
        const data = await fetchDashboard();
        if (data) { setDashboard(data); setError(false); } else { setError(true); }
        setLoading(false);
        setRefreshing(false);
    }, []);

    useEffect(() => { void load(); }, [load]);

    const handleRefresh = useCallback(() => { setRefreshing(true); void load(); }, [load]);
    const handleOpenSettings = useCallback(() => navigation.navigate('Settings'), [navigation]);
    const handleEditProfile = useCallback(() => navigation.navigate('EditProfile'), [navigation]);

    useLayoutEffect(() => {
        navigation.setOptions({
            title: t('dashboard.appTitle'),
            headerTitleAlign: 'center',
            headerRight: () => (
                <TouchableOpacity
                    onPress={handleOpenSettings}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    testID="profile-settings-button"
                    className="mr-2"
                >
                    <AppIcon name="settings-outline" size={24} color={colors.primary} />
                </TouchableOpacity>
            ),
        });
    }, [navigation, handleOpenSettings, t]);

    const handleFriendPress = useCallback((friend: FriendBalance) => {
        const firstGroup = friend.sharedGroupIds[0];
        if (!firstGroup) return;
        navigation.navigate('Groups', { screen: 'GroupDetail', params: { groupId: firstGroup } });
    }, [navigation]);

    if (loading && !dashboard) return <LoadingIndicator />;

    return (
        <ScrollView
            className="flex-1 bg-slate-50"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        >
            <ProfileHeaderRow
                name={currentUser?.name || t('common.unknown')}
                email={currentUser?.email}
                avatarUrl={currentUser?.avatarUrl}
                onEditPress={handleEditProfile}
            />

            {error || !dashboard ? (
                <EmptyState
                    iconName="alert-circle-outline"
                    title={t('dashboard.loadError')}
                    message={t('common.networkError')}
                    actionLabel={t('common.retry')}
                    onAction={handleRefresh}
                />
            ) : (
                <>
                    <BalanceHeroCard summary={dashboard.balanceSummary} />

                    <View className="flex-row gap-3 mx-4 mb-4">
                        <StatTile
                            iconName="checkmark-circle-outline"
                            label={t('dashboard.closedGroups')}
                            value={dashboard.stats.closedGroupsCount}
                            onPress={() => navigation.navigate('Groups', { screen: 'GroupsList' })}
                            testID="stat-closed"
                        />
                        <StatTile
                            iconName="people-outline"
                            label={t('dashboard.activeGroups')}
                            value={dashboard.stats.activeGroupsCount}
                            onPress={() => navigation.navigate('Groups', { screen: 'GroupsList' })}
                            testID="stat-active"
                        />
                    </View>

                    {dashboard.friends.length > 0 ? (
                        <View className="mb-8">
                            <Text className="px-5 mb-2 text-sm font-semibold text-gray-500">{t('dashboard.friends')}</Text>
                            {dashboard.friends.map(f => (
                                <FriendBalanceRow key={f.userId} friend={f} onPress={handleFriendPress} testID={`friend-${f.userId}`} />
                            ))}
                        </View>
                    ) : null}
                </>
            )}
        </ScrollView>
    );
}
```

- [ ] **Step 4:** Update navigator title — in `AppNavigator.tsx`, change the `ProfileMain` `Stack.Screen` `options` to:

```typescript
                options={{ title: t('dashboard.appTitle'), headerTitleAlign: 'center' }}
```

- [ ] **Step 5:** Run all mobile tests — `cd cost-share-app/apps/mobile && npm test`.

- [ ] **Step 6:** Manual smoke (Expo dev client): header "Kupa" centered, settings icon trailing, profile row card, hero, tiles, friends, pull-to-refresh.

- [ ] **Step 7:** Commit:

```bash
git add cost-share-app/apps/mobile/screens/profile/ProfileScreen.tsx cost-share-app/apps/mobile/navigation/AppNavigator.tsx cost-share-app/apps/mobile/__tests__/screens/profile/ProfileScreen.test.tsx
git commit -m "feat(mobile): rewrite ProfileScreen as dashboard with hero, tiles, friends"
```

---

## Phase 2 — Settings redesign (no notifications)

### Task 2.1: Install packages + env vars

**Files:** Modify `cost-share-app/apps/mobile/package.json` and `cost-share-app/apps/mobile/.env.example`.

- [ ] **Step 1:** `cd cost-share-app/apps/mobile && npx expo install expo-application expo-store-review`

- [ ] **Step 2:** Append to `.env.example`:

```
EXPO_PUBLIC_APP_STORE_URL=https://apps.apple.com/app/idXXXXXXXX
EXPO_PUBLIC_PLAY_STORE_URL=https://play.google.com/store/apps/details?id=com.kupa.mobile
EXPO_PUBLIC_SUPPORT_WHATSAPP_NUMBER=+972528616878
```

- [ ] **Step 3:** Commit:

```bash
git add cost-share-app/apps/mobile/package.json cost-share-app/apps/mobile/.env.example
# Add the lock file the repo actually uses (check `ls cost-share-app/apps/mobile/*-lock.* cost-share-app/apps/mobile/*.lock 2>/dev/null` and `ls cost-share-app/package-lock.json` first)
git commit -m "chore(mobile): add expo-application + expo-store-review + settings env vars"
```

---

### Task 2.2: Settings + legal i18n keys

**Files:** Modify `cost-share-app/apps/mobile/i18n/locales/en.json` and `he.json`.

- [ ] **Step 1:** Replace the existing `settings` block in `en.json` with:

```json
"settings": {
    "title": "Settings",
    "general": "General",
    "language": "Language",
    "support": "Support",
    "rateUs": "Rate us",
    "contactWhatsApp": "Contact us on WhatsApp",
    "legal": "Legal",
    "terms": "Terms of Service",
    "privacy": "Privacy Policy",
    "account": "Account",
    "logout": "Log out",
    "version": "Version {{version}}",
    "whatsappOpenFailed": "Could not open WhatsApp"
},
```

- [ ] **Step 2:** Add a `legal` block at the same nesting depth (after `dashboard`):

```json
,
"legal": {
    "termsTitle": "Terms of Service",
    "termsBody": "By using Kupa you agree to share expenses responsibly. We do not process payments — we only track balances between users.\n\nYour data is stored securely and is never sold to third parties. You may delete your account at any time by contacting support.\n\nKupa is provided as-is, without warranty.",
    "privacyTitle": "Privacy Policy",
    "privacyBody": "Kupa stores your profile (name, email, avatar) and the groups, expenses, and settlements you create. We use your email only for authentication.\n\nWe do not sell your data. We may share anonymous aggregate analytics. You can request deletion of your data at any time.\n\nContact: support via WhatsApp +972528616878.",
    "close": "Close"
}
```

- [ ] **Step 3:** Mirror both blocks in `he.json` with Hebrew translations.

- [ ] **Step 4:** Commit:

```bash
git add cost-share-app/apps/mobile/i18n/locales/en.json cost-share-app/apps/mobile/i18n/locales/he.json
git commit -m "feat(mobile): add settings + legal i18n keys"
```

---

### Task 2.3: `SettingsRow` component

**Files:**
- Create: `cost-share-app/apps/mobile/components/settings/SettingsRow.tsx`
- Create: `cost-share-app/apps/mobile/__tests__/components/settings/SettingsRow.test.tsx`

- [ ] **Step 1:** Test:

```typescript
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SettingsRow } from '../../../components/settings/SettingsRow';

describe('SettingsRow', () => {
    it('chevron variant: onPress fires', () => {
        const onPress = jest.fn();
        const { getByText } = render(<SettingsRow iconName="globe-outline" label="Language" variant="chevron" onPress={onPress} />);
        fireEvent.press(getByText('Language'));
        expect(onPress).toHaveBeenCalled();
    });

    it('value variant renders text', () => {
        const { getByText } = render(<SettingsRow iconName="globe-outline" label="Language" variant="value" valueText="English" onPress={() => {}} />);
        expect(getByText('English')).toBeTruthy();
    });

    it('danger variant renders label', () => {
        const { getByText } = render(<SettingsRow iconName="log-out-outline" label="Log out" variant="danger" onPress={() => {}} />);
        expect(getByText('Log out')).toBeTruthy();
    });
});
```

- [ ] **Step 2:** Run (fail).

- [ ] **Step 3:** Implement:

```typescript
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { AppIcon, AppIconName } from '../AppIcon';
import { colors } from '../../theme';

type Variant = 'chevron' | 'value' | 'danger';

interface BaseProps {
    iconName: AppIconName;
    label: string;
    testID?: string;
}

interface ChevronProps extends BaseProps { variant: 'chevron' | 'danger'; onPress: () => void; }
interface ValueProps extends BaseProps { variant: 'value'; valueText: string; onPress: () => void; }

type Props = ChevronProps | ValueProps;

export function SettingsRow(props: Props) {
    const { iconName, label, testID } = props;
    const isDanger = props.variant === 'danger';
    const iconColor = isDanger ? colors.error : colors.gray500;
    const textColor = isDanger ? 'text-red-600' : 'text-gray-900';

    return (
        <TouchableOpacity onPress={props.onPress} testID={testID}>
            <View className="flex-row items-center bg-white px-4 py-3.5 min-h-[52px]">
                <AppIcon name={iconName} size={22} color={iconColor} />
                <Text className={`flex-1 ms-3 text-base ${textColor}`}>{label}</Text>
                {props.variant === 'value' ? (
                    <Text className="text-sm text-gray-500 me-2">{props.valueText}</Text>
                ) : null}
                <AppIcon name="chevron-forward" size={18} color={colors.gray400} />
            </View>
        </TouchableOpacity>
    );
}
```

- [ ] **Step 4:** Run (pass).

- [ ] **Step 5:** Commit:

```bash
git add cost-share-app/apps/mobile/components/settings/SettingsRow.tsx cost-share-app/apps/mobile/__tests__/components/settings/SettingsRow.test.tsx
git commit -m "feat(mobile): add SettingsRow component"
```

---

### Task 2.4: `SettingsSection` component

**Files:**
- Create: `cost-share-app/apps/mobile/components/settings/SettingsSection.tsx`
- Create: `cost-share-app/apps/mobile/__tests__/components/settings/SettingsSection.test.tsx`

- [ ] **Step 1:** Test:

```typescript
import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { SettingsSection } from '../../../components/settings/SettingsSection';

describe('SettingsSection', () => {
    it('renders title + children', () => {
        const { getByText } = render(<SettingsSection title="General"><Text>Inside</Text></SettingsSection>);
        expect(getByText('General')).toBeTruthy();
        expect(getByText('Inside')).toBeTruthy();
    });
});
```

- [ ] **Step 2:** Run (fail).

- [ ] **Step 3:** Implement:

```typescript
import React from 'react';
import { View, Text } from 'react-native';

interface Props { title: string; children: React.ReactNode; }

export function SettingsSection({ title, children }: Props) {
    return (
        <View className="mb-6">
            <Text className="px-5 mb-2 text-xs font-semibold uppercase text-gray-500">{title}</Text>
            <View className="mx-4 rounded-2xl overflow-hidden border border-gray-100 bg-white">{children}</View>
        </View>
    );
}
```

- [ ] **Step 4:** Run (pass).

- [ ] **Step 5:** Commit:

```bash
git add cost-share-app/apps/mobile/components/settings/SettingsSection.tsx cost-share-app/apps/mobile/__tests__/components/settings/SettingsSection.test.tsx
git commit -m "feat(mobile): add SettingsSection component"
```

---

### Task 2.5: `LegalSheet` bottom sheet

**Files:**
- Create: `cost-share-app/apps/mobile/components/settings/LegalSheet.tsx`
- Create: `cost-share-app/apps/mobile/__tests__/components/settings/LegalSheet.test.tsx`

- [ ] **Step 1:** Test:

```typescript
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { LegalSheet } from '../../../components/settings/LegalSheet';

describe('LegalSheet', () => {
    it('renders title + body when visible', () => {
        const { getByText } = render(<LegalSheet visible title="Terms" body="Body" onClose={() => {}} />);
        expect(getByText('Terms')).toBeTruthy();
        expect(getByText('Body')).toBeTruthy();
    });

    it('does not render content when hidden', () => {
        const { queryByText } = render(<LegalSheet visible={false} title="Terms" body="Body" onClose={() => {}} />);
        expect(queryByText('Terms')).toBeNull();
    });

    it('close triggers onClose', () => {
        const onClose = jest.fn();
        const { getByText } = render(<LegalSheet visible title="T" body="B" onClose={onClose} />);
        fireEvent.press(getByText('legal.close'));
        expect(onClose).toHaveBeenCalled();
    });
});
```

- [ ] **Step 2:** Run (fail).

- [ ] **Step 3:** Implement:

```typescript
import React from 'react';
import { View, Text, Modal, ScrollView, TouchableOpacity, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';

interface Props {
    visible: boolean;
    title: string;
    body: string;
    onClose: () => void;
}

export function LegalSheet({ visible, title, body, onClose }: Props) {
    const { t } = useTranslation();
    if (!visible) return null;
    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <Pressable className="flex-1 bg-black/40" onPress={onClose}>
                <Pressable
                    onPress={(e) => e.stopPropagation()}
                    className="bg-white rounded-t-2xl absolute bottom-0 inset-x-0"
                    style={{ maxHeight: '85%' }}
                >
                    <View className="items-center pt-2 pb-1">
                        <View className="w-10 h-1 bg-gray-300 rounded-full" />
                    </View>
                    <Text className="text-xl font-bold text-gray-900 px-5 mt-2">{title}</Text>
                    <ScrollView className="px-5 mt-3">
                        <Text className="text-base text-gray-700 leading-6 mb-6">{body}</Text>
                    </ScrollView>
                    <TouchableOpacity onPress={onClose} className="bg-primary mx-5 mb-5 mt-2 py-4 rounded-xl">
                        <Text className="text-white text-center font-semibold">{t('legal.close')}</Text>
                    </TouchableOpacity>
                </Pressable>
            </Pressable>
        </Modal>
    );
}
```

- [ ] **Step 4:** Run (pass).

- [ ] **Step 5:** Commit:

```bash
git add cost-share-app/apps/mobile/components/settings/LegalSheet.tsx cost-share-app/apps/mobile/__tests__/components/settings/LegalSheet.test.tsx
git commit -m "feat(mobile): add LegalSheet bottom sheet"
```

---

### Task 2.6: `LanguageSheet` bottom sheet

**Files:**
- Create: `cost-share-app/apps/mobile/components/settings/LanguageSheet.tsx`
- Create: `cost-share-app/apps/mobile/__tests__/components/settings/LanguageSheet.test.tsx`

- [ ] **Step 1:** Test:

```typescript
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { LanguageSheet } from '../../../components/settings/LanguageSheet';

describe('LanguageSheet', () => {
    it('calls onSelect', () => {
        const onSelect = jest.fn();
        const { getByText } = render(<LanguageSheet visible current="en" onSelect={onSelect} onClose={() => {}} />);
        fireEvent.press(getByText('profile.hebrew'));
        expect(onSelect).toHaveBeenCalledWith('he');
    });
});
```

- [ ] **Step 2:** Run (fail).

- [ ] **Step 3:** Implement:

```typescript
import React from 'react';
import { View, Text, Modal, TouchableOpacity, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Language } from '@cost-share/shared';
import { AppIcon } from '../AppIcon';
import { colors } from '../../theme';

interface Props {
    visible: boolean;
    current: Language;
    onSelect: (lang: Language) => void;
    onClose: () => void;
}

const OPTIONS: { code: Language; labelKey: string }[] = [
    { code: 'en', labelKey: 'profile.english' },
    { code: 'he', labelKey: 'profile.hebrew' },
];

export function LanguageSheet({ visible, current, onSelect, onClose }: Props) {
    const { t } = useTranslation();
    if (!visible) return null;
    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <Pressable className="flex-1 bg-black/40" onPress={onClose}>
                <Pressable onPress={(e) => e.stopPropagation()} className="bg-white rounded-t-2xl absolute bottom-0 inset-x-0">
                    <View className="items-center pt-2 pb-1">
                        <View className="w-10 h-1 bg-gray-300 rounded-full" />
                    </View>
                    <Text className="text-lg font-bold text-gray-900 px-5 mt-2 mb-2">{t('settings.language')}</Text>
                    {OPTIONS.map(opt => (
                        <TouchableOpacity
                            key={opt.code}
                            onPress={() => onSelect(opt.code)}
                            className="flex-row items-center px-5 py-4 border-t border-gray-100"
                        >
                            <Text className="flex-1 text-base text-gray-900">{t(opt.labelKey)}</Text>
                            {opt.code === current ? <AppIcon name="checkmark" size={20} color={colors.primary} /> : null}
                        </TouchableOpacity>
                    ))}
                    <View className="h-6" />
                </Pressable>
            </Pressable>
        </Modal>
    );
}
```

- [ ] **Step 4:** Run (pass).

- [ ] **Step 5:** Commit:

```bash
git add cost-share-app/apps/mobile/components/settings/LanguageSheet.tsx cost-share-app/apps/mobile/__tests__/components/settings/LanguageSheet.test.tsx
git commit -m "feat(mobile): add LanguageSheet bottom sheet"
```

---

### Task 2.7: Rewrite `SettingsScreen` with grouped sections

**Files:**
- Modify: `cost-share-app/apps/mobile/screens/profile/SettingsScreen.tsx`
- Modify: `cost-share-app/apps/mobile/__tests__/screens/profile/SettingsScreen.test.tsx`

- [ ] **Step 1:** Replace `SettingsScreen.test.tsx`:

```typescript
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

const mockOpenURL = jest.fn().mockResolvedValue(undefined);
const mockCanOpen = jest.fn().mockResolvedValue(true);

jest.mock('react-native/Libraries/Linking/Linking', () => ({
    openURL: (...args: any[]) => mockOpenURL(...args),
    canOpenURL: (...args: any[]) => mockCanOpen(...args),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
}));

jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.2.3' }));
jest.mock('expo-store-review', () => ({
    requestReview: jest.fn().mockResolvedValue(undefined),
    isAvailableAsync: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../../services/auth.service', () => ({ signOut: jest.fn() }));
jest.mock('../../../i18n', () => ({ changeLanguage: jest.fn().mockResolvedValue(false) }));

import { SettingsScreen } from '../../../screens/profile/SettingsScreen';
import { useAppStore } from '../../../store';

beforeEach(() => {
    mockOpenURL.mockClear();
    useAppStore.setState({ language: 'en' });
});

describe('SettingsScreen (grouped, no notifications)', () => {
    it('renders all section titles', () => {
        const { getByText } = render(<SettingsScreen />);
        expect(getByText('settings.general')).toBeTruthy();
        expect(getByText('settings.support')).toBeTruthy();
        expect(getByText('settings.legal')).toBeTruthy();
        expect(getByText('settings.account')).toBeTruthy();
    });

    it('opens WhatsApp link', () => {
        const { getByText } = render(<SettingsScreen />);
        fireEvent.press(getByText('settings.contactWhatsApp'));
        expect(mockOpenURL).toHaveBeenCalledWith(expect.stringContaining('wa.me/972528616878'));
    });

    it('renders version footer', () => {
        const { getByText } = render(<SettingsScreen />);
        expect(getByText(/1\.2\.3/)).toBeTruthy();
    });
});
```

- [ ] **Step 2:** Run (fail).

- [ ] **Step 3:** Rewrite `SettingsScreen.tsx`:

```typescript
import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Linking, Platform, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Application from 'expo-application';
import * as StoreReview from 'expo-store-review';
import { Language } from '@cost-share/shared';
import { useAppStore } from '../../store';
import { changeLanguage } from '../../i18n';
import { signOut } from '../../services/auth.service';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { SettingsSection } from '../../components/settings/SettingsSection';
import { SettingsRow } from '../../components/settings/SettingsRow';
import { LegalSheet } from '../../components/settings/LegalSheet';
import { LanguageSheet } from '../../components/settings/LanguageSheet';

const WHATSAPP_NUMBER = (process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP_NUMBER || '+972528616878').replace(/[^\d]/g, '');
const APP_STORE_URL = process.env.EXPO_PUBLIC_APP_STORE_URL;
const PLAY_STORE_URL = process.env.EXPO_PUBLIC_PLAY_STORE_URL;

export function SettingsScreen() {
    const { t } = useTranslation();
    const language = useAppStore((s) => s.language);
    const setLanguage = useAppStore((s) => s.setLanguage);

    const [showLogout, setShowLogout] = useState(false);
    const [showLanguage, setShowLanguage] = useState(false);
    const [showTerms, setShowTerms] = useState(false);
    const [showPrivacy, setShowPrivacy] = useState(false);

    const handleLanguagePick = useCallback(async (lang: Language) => {
        setShowLanguage(false);
        try {
            const needsRestart = await changeLanguage(lang);
            setLanguage(lang);
            if (needsRestart) {
                Alert.alert(t('profile.restartRequired'), t('profile.restartMessage'), [{ text: t('common.ok') }]);
            }
        } catch {
            Alert.alert(t('common.error'), t('profile.languageChangeError'));
        }
    }, [setLanguage, t]);

    const handleRate = useCallback(async () => {
        if (await StoreReview.isAvailableAsync()) {
            await StoreReview.requestReview();
            return;
        }
        const url = Platform.OS === 'ios' ? APP_STORE_URL : PLAY_STORE_URL;
        if (url) await Linking.openURL(url);
    }, []);

    const handleWhatsApp = useCallback(async () => {
        const deepLink = `whatsapp://send?phone=${WHATSAPP_NUMBER}`;
        const webLink = `https://wa.me/${WHATSAPP_NUMBER}`;
        try {
            const can = await Linking.canOpenURL(deepLink);
            await Linking.openURL(can ? deepLink : webLink);
        } catch {
            Alert.alert(t('common.error'), t('settings.whatsappOpenFailed'));
        }
    }, [t]);

    const handleLogout = useCallback(async () => {
        setShowLogout(false);
        await signOut();
    }, []);

    return (
        <ScrollView className="flex-1 bg-slate-50">
            <View className="pt-4">
                <SettingsSection title={t('settings.general')}>
                    <SettingsRow
                        iconName="globe-outline"
                        label={t('settings.language')}
                        variant="value"
                        valueText={language === 'he' ? t('profile.hebrew') : t('profile.english')}
                        onPress={() => setShowLanguage(true)}
                    />
                </SettingsSection>

                <SettingsSection title={t('settings.support')}>
                    <SettingsRow iconName="star-outline" label={t('settings.rateUs')} variant="chevron" onPress={handleRate} />
                    <SettingsRow iconName="logo-whatsapp" label={t('settings.contactWhatsApp')} variant="chevron" onPress={handleWhatsApp} />
                </SettingsSection>

                <SettingsSection title={t('settings.legal')}>
                    <SettingsRow iconName="document-text-outline" label={t('settings.terms')} variant="chevron" onPress={() => setShowTerms(true)} />
                    <SettingsRow iconName="shield-outline" label={t('settings.privacy')} variant="chevron" onPress={() => setShowPrivacy(true)} />
                </SettingsSection>

                <SettingsSection title={t('settings.account')}>
                    <SettingsRow iconName="log-out-outline" label={t('settings.logout')} variant="danger" onPress={() => setShowLogout(true)} />
                </SettingsSection>

                <Text className="text-center text-xs text-gray-400 mb-8">
                    {t('settings.version', { version: Application.nativeApplicationVersion ?? '?' })}
                </Text>
            </View>

            <ConfirmDialog
                visible={showLogout}
                title={t('settings.logout')}
                message={t('profile.logoutConfirm')}
                confirmText={t('settings.logout')}
                cancelText={t('common.cancel')}
                onConfirm={handleLogout}
                onCancel={() => setShowLogout(false)}
                destructive
            />

            <LanguageSheet
                visible={showLanguage}
                current={language as Language}
                onSelect={handleLanguagePick}
                onClose={() => setShowLanguage(false)}
            />

            <LegalSheet visible={showTerms} title={t('legal.termsTitle')} body={t('legal.termsBody')} onClose={() => setShowTerms(false)} />
            <LegalSheet visible={showPrivacy} title={t('legal.privacyTitle')} body={t('legal.privacyBody')} onClose={() => setShowPrivacy(false)} />
        </ScrollView>
    );
}
```

- [ ] **Step 4:** Run (pass).

- [ ] **Step 5:** Manual smoke — 4 sections render; language sheet flips RTL on Hebrew; legal sheets open + scroll; rate triggers store-review / store URL; WhatsApp opens app/web fallback; logout works; version footer correct.

- [ ] **Step 6:** Commit:

```bash
git add cost-share-app/apps/mobile/screens/profile/SettingsScreen.tsx cost-share-app/apps/mobile/__tests__/screens/profile/SettingsScreen.test.tsx
git commit -m "feat(mobile): redesign SettingsScreen with grouped sections, legal sheets, rate, WhatsApp"
```

---

## Phase 3 — Wrap up

### Task 3.1: Full sweep

- [ ] `cd cost-share-app/apps/mobile && npm test` — all green.
- [ ] `cd cost-share-app/packages/shared && npx tsc --noEmit` — no output.
- [ ] Fix any regression at root cause.

### Task 3.2: SRS updates

**Files:** Modify `docs/SSOT/SRS.md`.

- [ ] Append to section 3.1 (Profile):

```markdown
| REQ-PROF-04 | ✅ | Profile dashboard | Hero balance card, stat tiles, friends list; data from `get_user_dashboard` RPC |
| REQ-PROF-05 | ✅ | Enhanced settings | Grouped sections, legal sheets, rate app, WhatsApp contact, version footer |
```

- [ ] Append changelog row:

```markdown
| 2026-05-19 | Add REQ-PROF-04/05 for profile dashboard & settings redesign (direct-Supabase, no notifications) |
```

- [ ] Commit:

```bash
git add docs/SSOT/SRS.md
git commit -m "docs(srs): add REQ-PROF-04/05 for dashboard + settings redesign"
```

### Task 3.3: Final manual smoke (on device)

- [ ] Sign in.
- [ ] Profile header "Kupa" centered + settings gear trailing.
- [ ] Profile row → EditProfile via edit icon.
- [ ] Hero card: single-currency → headlines; multi-currency → "—" + breakdown open.
- [ ] Two stat tiles render correct counts; tap → Groups list.
- [ ] Friends list rows tappable → first shared group.
- [ ] Pull-to-refresh re-fetches.
- [ ] Settings: 4 grouped sections; language sheet flips RTL; legal sheets open + scroll; rate opens review/store; WhatsApp opens app or web; logout works; version footer correct.

---

## Self-review

- **Spec coverage:** REQ-PROF-04 → Tasks 1.1–1.7. REQ-PROF-05 → Tasks 2.1–2.7. Notification/push/badge requirements intentionally deferred — descoped this branch.
- **Architecture fit:** No NestJS. All data via `supabase.rpc('get_user_dashboard')` or `supabase.from(...)`. Friend currency constraint matches the spec. FX sidestepped per descope.
- **Placeholders:** none.
- **Type consistency:** `UserDashboard`, `BalanceSummary`, `DashboardStats`, `FriendBalance` defined once in Task 0.1.
