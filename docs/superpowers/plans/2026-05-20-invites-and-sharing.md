# Invitations & Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship link-based invitations for Kupay — both personal friend invite links (`https://kupa.pro/i/<token>`) and group invite links (`https://kupa.pro/g/<token>`) — with auto-join semantics and rotation-based security, surfaced across Settings/EditProfile/Friends/FindFriends/EditGroup/GroupDetail/AddMembersSheet.

**Architecture:**
- DB: `invite_token` column on `profiles` and `groups` (no separate token table), five `SECURITY DEFINER` RPCs.
- Web landing: Supabase Edge Function `invite-landing` serves dynamic HTML + `.well-known/{apple-app-site-association,assetlinks.json}` under `kupa.pro`.
- Mobile: `invite.service.ts` + `useInviteLink` for share/rotate; `deepLinks.service.ts` + `useInviteRedemption` for incoming Universal Links; `<InviteLinkBlock />` is the shared UI primitive.

**Tech Stack:** PostgreSQL (Supabase, `pgcrypto`); Deno Edge Functions; React Native / Expo SDK 54 (`expo-linking`, `expo-sharing`, `expo-clipboard`); TypeScript (strict); Zustand; React Query v5; Jest + `@testing-library/react-native`; i18next (EN + HE).

**Spec:** `docs/superpowers/specs/2026-05-20-invites-and-sharing-design.md`

---

## File Structure

| Path | Responsibility |
|---|---|
| `cost-share-app/packages/shared/src/types/index.ts` | Add `inviteToken: string` to `User` and `Group`; add `PendingInvite` discriminated union. |
| `cost-share-app/packages/shared/src/mappers/index.ts` | Include `invite_token` in `profileFromRow` and `groupFromRow`. |
| `cost-share-app/supabase/invite-links.sql` | One-shot migration: columns, backfill, BEFORE-INSERT trigger, helper function, five RPCs, grants. |
| `cost-share-app/supabase/functions/invite-landing/deno.json` | Deno runtime config. |
| `cost-share-app/supabase/functions/invite-landing/index.ts` | Route incoming requests to friend / group / well-known / root / 404 handlers. |
| `cost-share-app/supabase/functions/invite-landing/render.ts` | HTML templates for the two invite kinds + escape helpers. |
| `cost-share-app/supabase/functions/invite-landing/well-known.ts` | Serves `apple-app-site-association` and `assetlinks.json`. |
| `cost-share-app/apps/mobile/services/invite.service.ts` | `buildInviteUrl`, `shareFriendInvite`, `shareGroupInvite`, `rotateFriendInvite`, `rotateGroupInvite`, `buildFriendInviteMessage`, `buildGroupInviteMessage`. |
| `cost-share-app/apps/mobile/services/deepLinks.service.ts` | `parseIncomingUrl`, `handleInviteLink`. |
| `cost-share-app/apps/mobile/services/users.service.ts` | Update `hydrateCurrentUserProfile` (relies on mapper change — no service code change). |
| `cost-share-app/apps/mobile/hooks/useInviteLink.ts` | `useInviteLink(groupId?)`: `{ url, isReady, share, rotate }`. |
| `cost-share-app/apps/mobile/hooks/useInviteRedemption.ts` | Listens to `Linking.useURL()` + session state, dispatches redemption. |
| `cost-share-app/apps/mobile/hooks/queries/keys.ts` | Add `inviteLink('friend' \| 'group', id?)` key. |
| `cost-share-app/apps/mobile/store/index.ts` | Add `pendingInvite` + `setPendingInvite`. |
| `cost-share-app/apps/mobile/components/InviteLinkBlock.tsx` | Shared `<InviteLinkBlock kind mode groupId? />`. |
| `cost-share-app/apps/mobile/screens/profile/SettingsScreen.tsx` | Add Invite Friend block at top. |
| `cost-share-app/apps/mobile/screens/profile/EditProfileScreen.tsx` | Add Invite Friend block at bottom. |
| `cost-share-app/apps/mobile/screens/profile/FriendsScreen.tsx` | Add prominent Invite CTA card. |
| `cost-share-app/apps/mobile/screens/profile/FindFriendsScreen.tsx` | Add empty-state CTA + persistent footer. |
| `cost-share-app/apps/mobile/screens/groups/EditGroupScreen.tsx` | Add Invite Link block before Danger Zone. |
| `cost-share-app/apps/mobile/screens/groups/GroupDetailScreen.tsx` | Overflow menu in header + "or share group link" empty-state subtext. |
| `cost-share-app/apps/mobile/components/AddMembersSheet.tsx` | Add "Search other users" + "Share group link" CTAs under friends list. |
| `cost-share-app/apps/mobile/app.json` | Add `ios.associatedDomains` + `android.intentFilters` for `kupa.pro`. |
| `cost-share-app/apps/mobile/navigation/AppNavigator.tsx` | Mount `useInviteRedemption()`. |
| `cost-share-app/apps/mobile/i18n/locales/en.json` | Add ~28 `invite.*` keys. |
| `cost-share-app/apps/mobile/i18n/locales/he.json` | Same keys in Hebrew. |
| `cost-share-app/apps/mobile/__tests__/services/invite.service.test.ts` | Cover URL builder, message builders, share + rotate behavior with mocked supabase + sharing. |
| `cost-share-app/apps/mobile/__tests__/services/deepLinks.service.test.ts` | Cover `parseIncomingUrl` across every URL shape. |
| `cost-share-app/apps/mobile/__tests__/components/InviteLinkBlock.test.tsx` | Render in both modes + verify share / copy / rotate trigger handlers. |

---

## Task Map (one task = one logical chunk + tests + commit)

1. Add `inviteToken` to shared `User`/`Group` types + `PendingInvite`; update mappers.
2. Write DB migration `invite-links.sql` (columns, backfill, trigger, helper) and apply it.
3. Add five RPCs (`get_invite_preview`, `redeem_friend_invite`, `redeem_group_invite`, `rotate_friend_invite`, `rotate_group_invite`) to the same migration and re-apply.
4. Add `pendingInvite` slice to Zustand store.
5. Add React Query keys for invite links.
6. Build `invite.service.ts` (TDD).
7. Build `deepLinks.service.ts` (TDD).
8. Build `useInviteLink` hook.
9. Build `useInviteRedemption` hook.
10. Add i18n keys (EN + HE).
11. Build `<InviteLinkBlock />` component (TDD).
12. Wire `<InviteLinkBlock />` into `SettingsScreen`.
13. Wire `<InviteLinkBlock />` into `EditProfileScreen`.
14. Add Invite CTA card to `FriendsScreen`.
15. Add empty-state CTA + persistent footer to `FindFriendsScreen`.
16. Wire group `<InviteLinkBlock />` into `EditGroupScreen`.
17. Add overflow menu + empty-state subtext to `GroupDetailScreen`.
18. Add CTAs to `AddMembersSheet`.
19. Update `app.json` for Universal Links + custom-scheme paths.
20. Mount `useInviteRedemption` in `AppNavigator`.
21. Build Edge Function skeleton + routing + `deno.json`.
22. Implement well-known handlers in Edge Function.
23. Implement HTML render templates in Edge Function.
24. Deploy Edge Function + configure DNS for `kupa.pro` + verify Universal Links.
25. Final verification pass (typecheck, full test suite, manual E2E).

Tasks 1–20 are codebase-only; tasks 21–24 involve deployment and external configuration. Tasks 1–18 can be developed and verified entirely against a Supabase local dev database. Tasks 19+24 require an EAS build and DNS access.

---

### Task 1: Add `inviteToken` to shared types + update mappers

**Files:**
- Modify: `cost-share-app/packages/shared/src/types/index.ts` (around line 22 — `User`; around line 38 — `Group`)
- Modify: `cost-share-app/packages/shared/src/mappers/index.ts` (lines 19, 31)

- [ ] **Step 1: Add `inviteToken` to `User`**

Open `cost-share-app/packages/shared/src/types/index.ts`. In the `User` interface (line 22), after the `phone?: string;` line, add:

```typescript
inviteToken: string;  // 10-char URL-safe slug; the value used to build https://kupa.pro/i/<token>
```

- [ ] **Step 2: Add `inviteToken` to `Group`**

In the same file, in the `Group` interface (line 38), after the `defaultCurrency: string;` line, add:

```typescript
inviteToken: string;  // 10-char URL-safe slug; the value used to build https://kupa.pro/g/<token>
```

- [ ] **Step 3: Add `PendingInvite` type**

At the bottom of the same file (after the last `export`), add:

```typescript
/**
 * An invite link that arrived before the user was authenticated.
 * The redemption handler will pick it up after sign-in.
 */
export type PendingInvite =
    | { kind: 'friend'; token: string }
    | { kind: 'group'; token: string };
```

- [ ] **Step 4: Update `profileFromRow`**

Open `cost-share-app/packages/shared/src/mappers/index.ts`. In `profileFromRow` (line 19), before `createdAt`, add:

```typescript
inviteToken: (r.invite_token as string) ?? '',
```

The fallback `?? ''` is defensive — once the migration runs the column is `NOT NULL`, but during the migration window mobile builds may load profiles without it.

- [ ] **Step 5: Update `groupFromRow`**

In the same file, in `groupFromRow` (line 31), before `createdBy`, add:

```typescript
inviteToken: (r.invite_token as string) ?? '',
```

- [ ] **Step 6: Typecheck shared package**

Run: `cd cost-share-app && npx tsc -p packages/shared/tsconfig.json --noEmit`
Expected: No errors.

- [ ] **Step 7: Typecheck mobile (which consumes the shared types)**

Run: `cd cost-share-app/apps/mobile && npx tsc --noEmit`
Expected: No errors. (Any `User` literal that lacks `inviteToken` will surface here — including the placeholder constructed in `store/index.ts` `setSession`. Fix by adding `inviteToken: ''` to that literal.)

- [ ] **Step 8: Commit**

```bash
git add cost-share-app/packages/shared/src/types/index.ts \
        cost-share-app/packages/shared/src/mappers/index.ts \
        cost-share-app/apps/mobile/store/index.ts
git commit -m "feat(shared): add inviteToken to User/Group + PendingInvite type"
```

---

### Task 2: DB migration — columns, backfill, trigger, helper

**Files:**
- Create: `cost-share-app/supabase/invite-links.sql`

- [ ] **Step 1: Create the migration file with the schema part**

```sql
-- Invitations & Sharing — schema, backfill, trigger, helper.
-- See docs/superpowers/specs/2026-05-20-invites-and-sharing-design.md
-- Idempotent: safe to re-run.

BEGIN;

-- ------------------------------------------------------------
-- Helper: generate_invite_token
-- ------------------------------------------------------------
-- Returns a 10-char URL-safe slug. Uses pgcrypto for randomness.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION generate_invite_token() RETURNS TEXT
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    v_alphabet TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
    v_len      INT  := length(v_alphabet);  -- 64
    v_token    TEXT := '';
    v_byte     INT;
    i          INT;
BEGIN
    FOR i IN 1..10 LOOP
        v_byte := get_byte(gen_random_bytes(1), 0);
        v_token := v_token || substr(v_alphabet, (v_byte % v_len) + 1, 1);
    END LOOP;
    RETURN v_token;
END;
$$;

-- ------------------------------------------------------------
-- profiles.invite_token
-- ------------------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS invite_token TEXT;

-- Backfill existing rows
UPDATE profiles SET invite_token = generate_invite_token() WHERE invite_token IS NULL;

-- Enforce constraints
ALTER TABLE profiles ALTER COLUMN invite_token SET NOT NULL;
ALTER TABLE profiles ADD CONSTRAINT profiles_invite_token_unique UNIQUE (invite_token);

-- Default on insert via trigger (column-level DEFAULT can't call a VOLATILE func with the SECURITY guard we want)
CREATE OR REPLACE FUNCTION default_profile_invite_token() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.invite_token IS NULL THEN
        NEW.invite_token := generate_invite_token();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_default_profile_invite_token ON profiles;
CREATE TRIGGER trg_default_profile_invite_token
    BEFORE INSERT ON profiles
    FOR EACH ROW EXECUTE FUNCTION default_profile_invite_token();

-- ------------------------------------------------------------
-- groups.invite_token
-- ------------------------------------------------------------
ALTER TABLE groups ADD COLUMN IF NOT EXISTS invite_token TEXT;

UPDATE groups SET invite_token = generate_invite_token() WHERE invite_token IS NULL;

ALTER TABLE groups ALTER COLUMN invite_token SET NOT NULL;
ALTER TABLE groups ADD CONSTRAINT groups_invite_token_unique UNIQUE (invite_token);

CREATE OR REPLACE FUNCTION default_group_invite_token() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.invite_token IS NULL THEN
        NEW.invite_token := generate_invite_token();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_default_group_invite_token ON groups;
CREATE TRIGGER trg_default_group_invite_token
    BEFORE INSERT ON groups
    FOR EACH ROW EXECUTE FUNCTION default_group_invite_token();

COMMIT;
```

- [ ] **Step 2: Apply via Supabase MCP**

Run via the `mcp__supabase__apply_migration` tool with name `invite-links-schema` and the SQL above.
Expected: success; no errors.

- [ ] **Step 3: Verify backfill + uniqueness**

Run via `mcp__supabase__execute_sql`:

```sql
SELECT 
    (SELECT COUNT(*) FROM profiles WHERE invite_token IS NULL OR length(invite_token) <> 10) AS bad_profiles,
    (SELECT COUNT(*) FROM groups WHERE invite_token IS NULL OR length(invite_token) <> 10) AS bad_groups,
    (SELECT COUNT(DISTINCT invite_token) FROM profiles) = (SELECT COUNT(*) FROM profiles) AS profile_tokens_unique,
    (SELECT COUNT(DISTINCT invite_token) FROM groups) = (SELECT COUNT(*) FROM groups) AS group_tokens_unique;
```

Expected: `bad_profiles = 0`, `bad_groups = 0`, both uniqueness booleans = `true`.

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/supabase/invite-links.sql
git commit -m "feat(db): add invite_token columns + backfill + default triggers"
```

---

### Task 3: DB migration — five RPCs

**Files:**
- Modify: `cost-share-app/supabase/invite-links.sql` (append RPCs and grants)

- [ ] **Step 1: Append the RPCs section to the migration file**

Add to the end of `cost-share-app/supabase/invite-links.sql`:

```sql
BEGIN;

-- ============================================================
-- RPC: get_invite_preview(p_token TEXT) RETURNS JSON
-- Public read for the Edge Function. Does not echo back the token.
-- ============================================================
CREATE OR REPLACE FUNCTION get_invite_preview(p_token TEXT) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_profile RECORD;
    v_group RECORD;
    v_members JSON;
    v_count INT;
BEGIN
    -- Try friend invite first
    SELECT id, name, avatar_url INTO v_profile
    FROM profiles WHERE invite_token = p_token LIMIT 1;

    IF FOUND THEN
        RETURN json_build_object(
            'kind', 'friend',
            'inviter', json_build_object(
                'id', v_profile.id,
                'name', v_profile.name,
                'avatar_url', v_profile.avatar_url
            )
        );
    END IF;

    -- Try group invite
    SELECT g.id, g.name, g.default_currency
    INTO v_group
    FROM groups g
    WHERE g.invite_token = p_token AND g.is_active = true
    LIMIT 1;

    IF FOUND THEN
        SELECT COUNT(*) INTO v_count
        FROM group_members gm
        WHERE gm.group_id = v_group.id AND gm.is_active = true;

        SELECT json_agg(member_data ORDER BY member_data->>'name')
        INTO v_members
        FROM (
            SELECT json_build_object(
                'id', p.id,
                'name', p.name,
                'avatar_url', p.avatar_url
            ) AS member_data
            FROM group_members gm
            JOIN profiles p ON p.id = gm.user_id
            WHERE gm.group_id = v_group.id AND gm.is_active = true
            LIMIT 6
        ) m;

        RETURN json_build_object(
            'kind', 'group',
            'group', json_build_object(
                'id', v_group.id,
                'name', v_group.name,
                'currency', v_group.default_currency,
                'member_count', v_count,
                'members', COALESCE(v_members, '[]'::json)
            )
        );
    END IF;

    RETURN json_build_object('kind', 'invalid');
END;
$$;

-- ============================================================
-- RPC: redeem_friend_invite(p_token TEXT) RETURNS JSON
-- ============================================================
CREATE OR REPLACE FUNCTION redeem_friend_invite(p_token TEXT) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_me UUID := auth.uid();
    v_inviter_id UUID;
    v_inviter_name TEXT;
    v_a UUID;
    v_b UUID;
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT id, name INTO v_inviter_id, v_inviter_name
    FROM profiles WHERE invite_token = p_token LIMIT 1;

    IF v_inviter_id IS NULL THEN
        RAISE EXCEPTION 'invite_not_found';
    END IF;
    IF v_inviter_id = v_me THEN
        RAISE EXCEPTION 'cannot_self_invite';
    END IF;

    -- Canonical pair (smaller UUID first)
    IF v_me < v_inviter_id THEN
        v_a := v_me; v_b := v_inviter_id;
    ELSE
        v_a := v_inviter_id; v_b := v_me;
    END IF;

    INSERT INTO friendships (user_a_id, user_b_id, source)
    VALUES (v_a, v_b, 'request')
    ON CONFLICT (user_a_id, user_b_id) DO NOTHING;

    -- Clear any friend_blocks in either direction
    DELETE FROM friend_blocks
    WHERE (user_id = v_me AND blocked_user_id = v_inviter_id)
       OR (user_id = v_inviter_id AND blocked_user_id = v_me);

    RETURN json_build_object(
        'friend_id', v_inviter_id,
        'friend_name', v_inviter_name
    );
END;
$$;

-- ============================================================
-- RPC: redeem_group_invite(p_token TEXT) RETURNS JSON
-- ============================================================
CREATE OR REPLACE FUNCTION redeem_group_invite(p_token TEXT) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_me UUID := auth.uid();
    v_group_id UUID;
    v_group_name TEXT;
    v_already BOOLEAN;
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT id, name INTO v_group_id, v_group_name
    FROM groups WHERE invite_token = p_token AND is_active = true LIMIT 1;

    IF v_group_id IS NULL THEN
        RAISE EXCEPTION 'invite_not_found';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM group_members
        WHERE group_id = v_group_id AND user_id = v_me AND is_active = true
    ) INTO v_already;

    IF v_already THEN
        RETURN json_build_object(
            'group_id', v_group_id,
            'group_name', v_group_name,
            'already_member', true
        );
    END IF;

    -- Reactivate a previous row if it exists, else insert
    UPDATE group_members SET is_active = true, left_at = NULL, joined_at = now()
    WHERE group_id = v_group_id AND user_id = v_me;

    IF NOT FOUND THEN
        INSERT INTO group_members (group_id, user_id, is_active)
        VALUES (v_group_id, v_me, true);
    END IF;

    -- The existing on_group_member_insert_auto_friend trigger handles friendships.

    RETURN json_build_object(
        'group_id', v_group_id,
        'group_name', v_group_name,
        'already_member', false
    );
END;
$$;

-- ============================================================
-- RPC: rotate_friend_invite() RETURNS TEXT
-- ============================================================
CREATE OR REPLACE FUNCTION rotate_friend_invite() RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_me UUID := auth.uid();
    v_new TEXT;
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    v_new := generate_invite_token();
    UPDATE profiles SET invite_token = v_new WHERE id = v_me;
    RETURN v_new;
END;
$$;

-- ============================================================
-- RPC: rotate_group_invite(p_group_id UUID) RETURNS TEXT
-- ============================================================
CREATE OR REPLACE FUNCTION rotate_group_invite(p_group_id UUID) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_me UUID := auth.uid();
    v_member BOOLEAN;
    v_new TEXT;
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM group_members
        WHERE group_id = p_group_id AND user_id = v_me AND is_active = true
    ) INTO v_member;

    IF NOT v_member THEN
        RAISE EXCEPTION 'not_group_member';
    END IF;

    v_new := generate_invite_token();
    UPDATE groups SET invite_token = v_new WHERE id = p_group_id;
    RETURN v_new;
END;
$$;

-- ============================================================
-- Grants
-- ============================================================
GRANT EXECUTE ON FUNCTION get_invite_preview(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION redeem_friend_invite(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION redeem_group_invite(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rotate_friend_invite() TO authenticated;
GRANT EXECUTE ON FUNCTION rotate_group_invite(UUID) TO authenticated;

COMMIT;
```

- [ ] **Step 2: Apply the RPCs migration**

Run via `mcp__supabase__apply_migration` with name `invite-links-rpcs`. The migration tool only sees the new RPC block — paste the contents of the second `BEGIN; ... COMMIT;` block from above (everything from `-- RPC: get_invite_preview` through the final `COMMIT;`).

Expected: success; the five functions appear in the project.

- [ ] **Step 3: Smoke-test each RPC**

Run via `mcp__supabase__execute_sql`:

```sql
-- get_invite_preview with an invalid token returns kind=invalid
SELECT get_invite_preview('zzzzzzzzzz');
-- get_invite_preview with a real profile token returns kind=friend
SELECT get_invite_preview((SELECT invite_token FROM profiles LIMIT 1));
-- get_invite_preview with a real group token returns kind=group
SELECT get_invite_preview((SELECT invite_token FROM groups WHERE is_active = true LIMIT 1));
```

Expected:
- First row: `{"kind": "invalid"}`.
- Second row: `{"kind": "friend", "inviter": {...}}`.
- Third row: `{"kind": "group", "group": {...}}`.

- [ ] **Step 4: Verify advisors are clean**

Run via `mcp__supabase__get_advisors` with `type = 'security'`.
Expected: no new ERROR-level findings on the new functions or columns. (WARN is acceptable; if any new ERROR — fix in this task before moving on.)

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/supabase/invite-links.sql
git commit -m "feat(db): add invite-link RPCs (preview, redeem, rotate)"
```

---

### Task 4: Add `pendingInvite` slice to Zustand store

**Files:**
- Modify: `cost-share-app/apps/mobile/store/index.ts`

- [ ] **Step 1: Import `PendingInvite`**

In `cost-share-app/apps/mobile/store/index.ts`, extend the `@cost-share/shared` import to include `PendingInvite`:

```typescript
import {
    User,
    ExpenseWithSplits,
    DEFAULT_CURRENCY,
    GroupWithMembers,
    GroupMessage,
    BalanceSummaryRow,
    GroupBalance,
    BalanceSummaryResponse,
    PendingInvite,
} from '@cost-share/shared';
```

- [ ] **Step 2: Add to `AppState`**

In the `AppState` interface, after the `// Language state` block, add:

```typescript
    // Pending invite — set when an invite link arrives before sign-in.
    pendingInvite: PendingInvite | null;
    setPendingInvite: (invite: PendingInvite | null) => void;
```

- [ ] **Step 3: Add to the store factory**

At the bottom of the `create<AppState>(...)` body, before the closing `}));`, add:

```typescript
    // Pending invite state
    pendingInvite: null,
    setPendingInvite: (invite) => set({ pendingInvite: invite }),
```

- [ ] **Step 4: Add `inviteToken` to the session-derived placeholder**

The existing `setSession` constructs a placeholder `User` object (lines 60-69). Add `inviteToken: ''` so the type still satisfies the updated `User` interface from Task 1:

```typescript
                ? {
                    id: session.user.id,
                    email: session.user.email ?? '',
                    name: session.user.user_metadata?.full_name ?? session.user.email ?? '',
                    avatarUrl: session.user.user_metadata?.avatar_url ?? undefined,
                    defaultCurrency: DEFAULT_CURRENCY,
                    language: 'en' as const,
                    inviteToken: '',
                    createdAt: new Date(session.user.created_at),
                    updatedAt: new Date(session.user.updated_at ?? session.user.created_at),
                }
```

(`hydrateCurrentUserProfile` overwrites this placeholder with the full profile right after auth — the empty string is only ever live for a few hundred ms.)

- [ ] **Step 5: Typecheck**

Run: `cd cost-share-app/apps/mobile && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add cost-share-app/apps/mobile/store/index.ts
git commit -m "feat(mobile): add pendingInvite slice to app store"
```

---

### Task 5: Add React Query keys for invite links

**Files:**
- Modify: `cost-share-app/apps/mobile/hooks/queries/keys.ts`

- [ ] **Step 1: Add the key factory**

Open `cost-share-app/apps/mobile/hooks/queries/keys.ts`. Inside the `queryKeys` object, after `userSearch`, add:

```typescript
    inviteLink: (kind: 'friend' | 'group', id?: string) =>
        id ? (['invite-link', kind, id] as const) : (['invite-link', kind] as const),
```

- [ ] **Step 2: Typecheck**

Run: `cd cost-share-app/apps/mobile && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/apps/mobile/hooks/queries/keys.ts
git commit -m "feat(mobile): add invite-link query keys"
```

---

### Task 6: Build `invite.service.ts` (TDD)

**Files:**
- Create: `cost-share-app/apps/mobile/services/invite.service.ts`
- Create: `cost-share-app/apps/mobile/__tests__/services/invite.service.test.ts`

- [ ] **Step 1: Write the failing test for `buildInviteUrl`**

Create `cost-share-app/apps/mobile/__tests__/services/invite.service.test.ts`:

```typescript
import {
    buildInviteUrl,
    buildFriendInviteMessage,
    buildGroupInviteMessage,
} from '../../services/invite.service';

describe('invite.service', () => {
    describe('buildInviteUrl', () => {
        it('builds friend URL from token', () => {
            expect(buildInviteUrl('friend', 'AbCd123_-9')).toBe('https://kupa.pro/i/AbCd123_-9');
        });
        it('builds group URL from token', () => {
            expect(buildInviteUrl('group', 'XyZ4567890')).toBe('https://kupa.pro/g/XyZ4567890');
        });
    });

    describe('buildFriendInviteMessage', () => {
        it('interpolates inviter name and url', () => {
            const msg = buildFriendInviteMessage('נווה', 'https://kupa.pro/i/AAA');
            expect(msg).toContain('נווה');
            expect(msg).toContain('https://kupa.pro/i/AAA');
        });
    });

    describe('buildGroupInviteMessage', () => {
        it('interpolates inviter, group name, and url', () => {
            const msg = buildGroupInviteMessage('נווה', 'טיול ביוון', 'https://kupa.pro/g/BBB');
            expect(msg).toContain('נווה');
            expect(msg).toContain('טיול ביוון');
            expect(msg).toContain('https://kupa.pro/g/BBB');
        });
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd cost-share-app/apps/mobile && npx jest __tests__/services/invite.service.test.ts`
Expected: FAIL — `Cannot find module '../../services/invite.service'`.

- [ ] **Step 3: Create the service**

Create `cost-share-app/apps/mobile/services/invite.service.ts`:

```typescript
/**
 * Invite Service — builds invite URLs, opens the OS share sheet,
 * rotates tokens. Reads invite tokens from the current user / group;
 * writes via SECURITY DEFINER RPCs.
 */

import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';
import i18n from '../i18n';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store';

const INVITE_HOST = 'https://kupa.pro';

export function buildInviteUrl(kind: 'friend' | 'group', token: string): string {
    const prefix = kind === 'friend' ? '/i/' : '/g/';
    return `${INVITE_HOST}${prefix}${token}`;
}

export function buildFriendInviteMessage(inviterName: string, url: string): string {
    return i18n.t('invite.friend.shareMessage', { inviterName, url });
}

export function buildGroupInviteMessage(
    inviterName: string,
    groupName: string,
    url: string,
): string {
    return i18n.t('invite.group.shareMessage', { inviterName, groupName, url });
}

async function openShare(message: string): Promise<void> {
    // expo-sharing only shares files, not text. Use the RN built-in Share API for text.
    await Share.share({ message });
}

export async function shareFriendInvite(): Promise<void> {
    const user = useAppStore.getState().currentUser;
    if (!user || !user.inviteToken) throw new Error('no_invite_token');
    const url = buildInviteUrl('friend', user.inviteToken);
    const message = buildFriendInviteMessage(user.name, url);
    await openShare(message);
}

export async function shareGroupInvite(groupId: string): Promise<void> {
    const user = useAppStore.getState().currentUser;
    const group = useAppStore.getState().groups.find(g => g.id === groupId);
    if (!user) throw new Error('not_authenticated');
    if (!group || !group.inviteToken) throw new Error('group_invite_token_unavailable');
    const url = buildInviteUrl('group', group.inviteToken);
    const message = buildGroupInviteMessage(user.name, group.name, url);
    await openShare(message);
}

export async function rotateFriendInvite(): Promise<string> {
    const { data, error } = await supabase.rpc('rotate_friend_invite');
    if (error) throw error;
    const newToken = data as string;
    // Update the store in place
    const current = useAppStore.getState().currentUser;
    if (current) {
        useAppStore.getState().setCurrentUser({ ...current, inviteToken: newToken });
    }
    return newToken;
}

export async function rotateGroupInvite(groupId: string): Promise<string> {
    const { data, error } = await supabase.rpc('rotate_group_invite', { p_group_id: groupId });
    if (error) throw error;
    const newToken = data as string;
    const state = useAppStore.getState();
    const group = state.groups.find(g => g.id === groupId);
    if (group) {
        state.updateGroup({ ...group, inviteToken: newToken });
    }
    return newToken;
}

// Re-exported for completeness; not used by callers other than the share/rotate flows.
export const __exportedForTests = { Sharing, Platform };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd cost-share-app/apps/mobile && npx jest __tests__/services/invite.service.test.ts`
Expected: PASS — all five test cases.

- [ ] **Step 5: Typecheck**

Run: `cd cost-share-app/apps/mobile && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add cost-share-app/apps/mobile/services/invite.service.ts \
        cost-share-app/apps/mobile/__tests__/services/invite.service.test.ts
git commit -m "feat(mobile): add invite.service.ts (URL builder, share, rotate)"
```

---

### Task 7: Build `deepLinks.service.ts` (TDD)

**Files:**
- Create: `cost-share-app/apps/mobile/services/deepLinks.service.ts`
- Create: `cost-share-app/apps/mobile/__tests__/services/deepLinks.service.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `cost-share-app/apps/mobile/__tests__/services/deepLinks.service.test.ts`:

```typescript
import { parseIncomingUrl } from '../../services/deepLinks.service';

describe('parseIncomingUrl', () => {
    it('parses https friend link', () => {
        expect(parseIncomingUrl('https://kupa.pro/i/AbC123def_')).toEqual({
            kind: 'friend',
            token: 'AbC123def_',
        });
    });
    it('parses https group link', () => {
        expect(parseIncomingUrl('https://kupa.pro/g/XYZ9876543')).toEqual({
            kind: 'group',
            token: 'XYZ9876543',
        });
    });
    it('parses custom-scheme friend link', () => {
        expect(parseIncomingUrl('com.kupay.mobile://invite/i/ZZZ0000111')).toEqual({
            kind: 'friend',
            token: 'ZZZ0000111',
        });
    });
    it('parses custom-scheme group link', () => {
        expect(parseIncomingUrl('com.kupay.mobile://invite/g/AAA1112223')).toEqual({
            kind: 'group',
            token: 'AAA1112223',
        });
    });
    it('returns unknown for unrelated URL', () => {
        expect(parseIncomingUrl('https://example.com/foo')).toEqual({ kind: 'unknown' });
    });
    it('returns unknown for malformed kupa URL', () => {
        expect(parseIncomingUrl('https://kupa.pro/x/abc')).toEqual({ kind: 'unknown' });
    });
    it('handles trailing slash + query string', () => {
        expect(parseIncomingUrl('https://kupa.pro/g/AbCdEfGhIj?utm=foo')).toEqual({
            kind: 'group',
            token: 'AbCdEfGhIj',
        });
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd cost-share-app/apps/mobile && npx jest __tests__/services/deepLinks.service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the service**

Create `cost-share-app/apps/mobile/services/deepLinks.service.ts`:

```typescript
/**
 * Deep Link Service — parses incoming URLs (Universal Links and the custom
 * scheme) and dispatches the appropriate redeem flow.
 *
 * Auth-callback URLs are intentionally NOT handled here; they continue to
 * flow through services/auth.service.ts.
 */

import { NavigationProp } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import { QueryClient } from '@tanstack/react-query';
import i18n from '../i18n';
import { supabase } from '../lib/supabase';
import { queryKeys } from '../hooks/queries/keys';

export type InviteLink =
    | { kind: 'friend'; token: string }
    | { kind: 'group'; token: string }
    | { kind: 'unknown' };

const TOKEN_RE = /^[A-Za-z0-9_-]{10}$/;

export function parseIncomingUrl(rawUrl: string): InviteLink {
    if (!rawUrl) return { kind: 'unknown' };

    let parsed: URL;
    try {
        parsed = new URL(rawUrl);
    } catch {
        return { kind: 'unknown' };
    }

    // https://kupa.pro/i/<token> | /g/<token>
    if (parsed.protocol === 'https:' && parsed.host === 'kupa.pro') {
        const m = parsed.pathname.match(/^\/(i|g)\/([^/?#]+)\/?$/);
        if (m && TOKEN_RE.test(m[2])) {
            return m[1] === 'i'
                ? { kind: 'friend', token: m[2] }
                : { kind: 'group', token: m[2] };
        }
    }

    // com.kupay.mobile://invite/i/<token> | /g/<token>
    if (parsed.protocol === 'com.kupay.mobile:' && parsed.host === 'invite') {
        const m = parsed.pathname.match(/^\/(i|g)\/([^/?#]+)\/?$/);
        if (m && TOKEN_RE.test(m[2])) {
            return m[1] === 'i'
                ? { kind: 'friend', token: m[2] }
                : { kind: 'group', token: m[2] };
        }
    }

    return { kind: 'unknown' };
}

export async function handleInviteLink(
    link: InviteLink,
    navigation: NavigationProp<any>,
    queryClient: QueryClient,
): Promise<void> {
    if (link.kind === 'unknown') return;

    if (link.kind === 'friend') {
        const { data, error } = await supabase.rpc('redeem_friend_invite', { p_token: link.token });
        if (error) {
            handleRedemptionError(error.message, 'friend');
            return;
        }
        const payload = data as { friend_id: string; friend_name: string };
        Toast.show({
            type: 'success',
            text1: i18n.t('invite.redemption.friendSuccess', { name: payload.friend_name }),
        });
        void queryClient.invalidateQueries({ queryKey: queryKeys.friends });
        void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
        navigation.navigate('Profile' as never, { screen: 'Friends' } as never);
        return;
    }

    // group
    const { data, error } = await supabase.rpc('redeem_group_invite', { p_token: link.token });
    if (error) {
        handleRedemptionError(error.message, 'group');
        return;
    }
    const payload = data as { group_id: string; group_name: string; already_member: boolean };
    Toast.show({
        type: 'success',
        text1: payload.already_member
            ? i18n.t('invite.redemption.alreadyMember')
            : i18n.t('invite.redemption.groupSuccess', { groupName: payload.group_name }),
    });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    void queryClient.invalidateQueries({ queryKey: ['groups'] });
    navigation.navigate('Groups' as never, {
        screen: 'GroupDetail',
        params: { groupId: payload.group_id },
    } as never);
}

function handleRedemptionError(message: string, kind: 'friend' | 'group'): void {
    if (message.includes('invite_not_found')) {
        Toast.show({ type: 'error', text1: i18n.t('invite.redemption.invalid') });
        return;
    }
    if (message.includes('cannot_self_invite')) {
        Toast.show({ type: 'info', text1: i18n.t('invite.redemption.selfInvite') });
        return;
    }
    Toast.show({
        type: 'error',
        text1: i18n.t('common.networkError'),
        text2: kind === 'friend'
            ? i18n.t('invite.friend.title')
            : i18n.t('invite.group.title'),
    });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd cost-share-app/apps/mobile && npx jest __tests__/services/deepLinks.service.test.ts`
Expected: PASS — all seven cases.

- [ ] **Step 5: Typecheck**

Run: `cd cost-share-app/apps/mobile && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add cost-share-app/apps/mobile/services/deepLinks.service.ts \
        cost-share-app/apps/mobile/__tests__/services/deepLinks.service.test.ts
git commit -m "feat(mobile): add deepLinks.service.ts (URL parser + redemption handler)"
```

---

### Task 8: Build `useInviteLink` hook

**Files:**
- Create: `cost-share-app/apps/mobile/hooks/useInviteLink.ts`

- [ ] **Step 1: Create the hook**

```typescript
/**
 * useInviteLink — single entry point for any invite-link UI.
 * - With no groupId → the current user's friend invite.
 * - With groupId → that group's invite.
 *
 * Exposes a ready URL plus share() and rotate(). rotate() shows
 * a confirmation Alert before making the network call.
 */

import { useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import { useAppStore } from '../store';
import {
    buildInviteUrl,
    rotateFriendInvite,
    rotateGroupInvite,
    shareFriendInvite,
    shareGroupInvite,
} from '../services/invite.service';
import i18n from '../i18n';

export interface UseInviteLinkResult {
    url: string;
    isReady: boolean;
    share: () => Promise<void>;
    rotate: () => Promise<void>;
}

export function useInviteLink(groupId?: string): UseInviteLinkResult {
    const { t } = useTranslation();
    const user = useAppStore(s => s.currentUser);
    const group = useAppStore(s => (groupId ? s.groups.find(g => g.id === groupId) : null));

    const kind: 'friend' | 'group' = groupId ? 'group' : 'friend';
    const token = groupId ? group?.inviteToken : user?.inviteToken;

    const url = useMemo(
        () => (token ? buildInviteUrl(kind, token) : ''),
        [kind, token],
    );

    const share = useCallback(async () => {
        try {
            if (groupId) await shareGroupInvite(groupId);
            else await shareFriendInvite();
        } catch (err) {
            console.error('Invite share failed:', err);
            Toast.show({ type: 'error', text1: i18n.t('common.error') });
        }
    }, [groupId]);

    const rotate = useCallback(async () => {
        const titleKey = groupId ? 'invite.group.rotateConfirmTitle' : 'invite.friend.rotateConfirmTitle';
        const bodyKey = groupId ? 'invite.group.rotateConfirmBody' : 'invite.friend.rotateConfirmBody';
        const successKey = groupId ? 'invite.group.rotated' : 'invite.friend.rotated';
        const okKey = 'common.ok';
        const cancelKey = 'common.cancel';

        return new Promise<void>((resolve) => {
            Alert.alert(
                t(titleKey),
                t(bodyKey),
                [
                    { text: t(cancelKey), style: 'cancel', onPress: () => resolve() },
                    {
                        text: t(okKey),
                        style: 'destructive',
                        onPress: async () => {
                            try {
                                if (groupId) await rotateGroupInvite(groupId);
                                else await rotateFriendInvite();
                                Toast.show({ type: 'success', text1: t(successKey) });
                            } catch (err) {
                                console.error('Invite rotation failed:', err);
                                Toast.show({ type: 'error', text1: t('common.networkError') });
                            } finally {
                                resolve();
                            }
                        },
                    },
                ],
            );
        });
    }, [groupId, t]);

    return {
        url,
        isReady: Boolean(token),
        share,
        rotate,
    };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd cost-share-app/apps/mobile && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/apps/mobile/hooks/useInviteLink.ts
git commit -m "feat(mobile): add useInviteLink hook"
```

---

### Task 9: Build `useInviteRedemption` hook

**Files:**
- Create: `cost-share-app/apps/mobile/hooks/useInviteRedemption.ts`

- [ ] **Step 1: Create the hook**

```typescript
/**
 * useInviteRedemption — listens for incoming invite URLs and dispatches
 * the redemption flow. If the user is not yet signed in, the link is
 * parked in the Zustand store as `pendingInvite` and replayed after
 * sign-in. Auth-callback URLs are ignored here.
 */

import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../store';
import {
    parseIncomingUrl,
    handleInviteLink,
} from '../services/deepLinks.service';
import { isAuthCallbackUrl } from '../services/auth.service';

export function useInviteRedemption(): void {
    const incomingUrl = Linking.useURL();
    const navigation = useNavigation();
    const queryClient = useQueryClient();
    const session = useAppStore(s => s.session);
    const pendingInvite = useAppStore(s => s.pendingInvite);
    const setPendingInvite = useAppStore(s => s.setPendingInvite);

    // Handle new incoming URLs
    useEffect(() => {
        if (!incomingUrl) return;
        if (isAuthCallbackUrl(incomingUrl)) return; // handled elsewhere
        const link = parseIncomingUrl(incomingUrl);
        if (link.kind === 'unknown') return;

        if (!session) {
            // After the unknown-check above, `link` is exactly `PendingInvite`.
            setPendingInvite(link);
            return;
        }
        void handleInviteLink(link, navigation, queryClient);
    }, [incomingUrl, session, navigation, queryClient, setPendingInvite]);

    // Replay pending invite once signed in
    useEffect(() => {
        if (!session || !pendingInvite) return;
        void handleInviteLink(pendingInvite, navigation, queryClient).finally(() => {
            setPendingInvite(null);
        });
        // Intentionally only re-run when session flips on or pendingInvite changes.
    }, [session, pendingInvite, navigation, queryClient, setPendingInvite]);
}
```

- [ ] **Step 2: Typecheck**

Run: `cd cost-share-app/apps/mobile && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/apps/mobile/hooks/useInviteRedemption.ts
git commit -m "feat(mobile): add useInviteRedemption hook"
```

---

### Task 10: Add i18n keys (EN + HE)

**Files:**
- Modify: `cost-share-app/apps/mobile/i18n/locales/en.json`
- Modify: `cost-share-app/apps/mobile/i18n/locales/he.json`

- [ ] **Step 1: Add the `invite` block to `en.json`**

Open `cost-share-app/apps/mobile/i18n/locales/en.json` and add at the top level (alphabetical insertion is fine — after `groups` for example):

```json
"invite": {
    "friend": {
        "title": "Invite a friend to Kupay",
        "subtitle": "Send a link via WhatsApp and more",
        "cta": "Share link",
        "shareMessage": "Hey! Let's split expenses together on Kupay. If you sign up through this link we'll automatically become friends: {{url}}",
        "linkLabel": "My invite link",
        "copyButton": "Copy",
        "copied": "Link copied",
        "rotate": "Rotate link",
        "rotateConfirmTitle": "Rotate invite link?",
        "rotateConfirmBody": "The previous link will stop working. Anyone holding the old link won't be able to become your friend until you send them the new one.",
        "rotated": "Invite link updated",
        "findEmpty": "Didn't find who you're looking for?",
        "findEmptyCta": "Invite a new friend by link",
        "findInviteName": "Invite {{name}} to Kupay"
    },
    "group": {
        "title": "Share group link",
        "shareMessage": "I added you to the '{{groupName}}' group on Kupay. Join via this link: {{url}}",
        "linkLabel": "Invite link",
        "rotate": "Rotate link",
        "rotateConfirmTitle": "Rotate group invite link?",
        "rotateConfirmBody": "Anyone holding the current link won't be able to join until you send them the new one. Members already in the group are unaffected.",
        "rotated": "Group invite link updated",
        "emptyStateLink": "or share group link"
    },
    "addMembers": {
        "searchOthers": "Search other users",
        "sendLink": "Share group link"
    },
    "redemption": {
        "friendSuccess": "Added {{name}} as a friend",
        "groupSuccess": "Joined '{{groupName}}'",
        "alreadyMember": "You're already a member of this group",
        "selfInvite": "That's your own invite link",
        "invalid": "This invite link is no longer valid"
    }
},
```

- [ ] **Step 2: Add the `invite` block to `he.json`**

Open `cost-share-app/apps/mobile/i18n/locales/he.json` and add the corresponding Hebrew translations:

```json
"invite": {
    "friend": {
        "title": "הזמן חבר ל-Kupay",
        "subtitle": "שלח קישור דרך וואצאפ ועוד",
        "cta": "שתף קישור",
        "shareMessage": "היי! בוא נחלק הוצאות יחד דרך Kupay. אם תרשם דרך הקישור הזה — נהיה אוטומטית חברים: {{url}}",
        "linkLabel": "קישור ההזמנה שלי",
        "copyButton": "העתק",
        "copied": "הקישור הועתק",
        "rotate": "שנה קישור",
        "rotateConfirmTitle": "לשנות את קישור ההזמנה?",
        "rotateConfirmBody": "הקישור הקודם יפסיק לעבוד. כל מי שיש לו את הקישור הישן לא יוכל להפוך לחבר שלך עד שתשלח לו את החדש.",
        "rotated": "קישור ההזמנה עודכן",
        "findEmpty": "לא מצאת את מי שחיפשת?",
        "findEmptyCta": "הזמן חבר חדש דרך קישור",
        "findInviteName": "הזמן את {{name}} ל-Kupay"
    },
    "group": {
        "title": "שתף קישור לקבוצה",
        "shareMessage": "הוספתי אותך לקבוצת '{{groupName}}' ב-Kupay. הצטרף דרך הקישור: {{url}}",
        "linkLabel": "קישור הזמנה",
        "rotate": "שנה קישור",
        "rotateConfirmTitle": "לשנות את קישור הקבוצה?",
        "rotateConfirmBody": "כל מי שיש לו את הקישור הנוכחי לא יוכל להצטרף עד שתשלח לו את החדש. חברים שכבר בקבוצה לא מושפעים.",
        "rotated": "קישור הקבוצה עודכן",
        "emptyStateLink": "או שתף קישור לקבוצה"
    },
    "addMembers": {
        "searchOthers": "חפש משתמשים אחרים",
        "sendLink": "שלח קישור לקבוצה"
    },
    "redemption": {
        "friendSuccess": "הוספת את {{name}} כחבר",
        "groupSuccess": "הצטרפת לקבוצת '{{groupName}}'",
        "alreadyMember": "אתה כבר חבר בקבוצה הזו",
        "selfInvite": "זה הקישור שלך",
        "invalid": "קישור ההזמנה כבר לא תקף"
    }
},
```

- [ ] **Step 3: Verify JSON parses**

Run: `cd cost-share-app/apps/mobile && node -e "JSON.parse(require('fs').readFileSync('i18n/locales/en.json'))" && node -e "JSON.parse(require('fs').readFileSync('i18n/locales/he.json'))"`
Expected: no output, both files parse cleanly.

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/apps/mobile/i18n/locales/en.json \
        cost-share-app/apps/mobile/i18n/locales/he.json
git commit -m "feat(mobile): add i18n keys for invitations and sharing"
```

---

### Task 11: Build `<InviteLinkBlock />` component (TDD)

**Files:**
- Create: `cost-share-app/apps/mobile/components/InviteLinkBlock.tsx`
- Create: `cost-share-app/apps/mobile/__tests__/components/InviteLinkBlock.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `cost-share-app/apps/mobile/__tests__/components/InviteLinkBlock.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { InviteLinkBlock } from '../../components/InviteLinkBlock';

const mockShare = jest.fn();
const mockRotate = jest.fn();
jest.mock('../../hooks/useInviteLink', () => ({
    useInviteLink: () => ({
        url: 'https://kupa.pro/i/AbCdEfGhIj',
        isReady: true,
        share: mockShare,
        rotate: mockRotate,
    }),
}));

describe('<InviteLinkBlock />', () => {
    beforeEach(() => {
        mockShare.mockClear();
        mockRotate.mockClear();
    });

    it('renders the URL display', () => {
        const { getByText } = render(<InviteLinkBlock mode="expanded" kind="friend" />);
        expect(getByText(/kupa\.pro\/i\/AbCdEfGhIj/)).toBeTruthy();
    });

    it('calls share() when share button pressed', () => {
        const { getByTestId } = render(<InviteLinkBlock mode="expanded" kind="friend" />);
        fireEvent.press(getByTestId('invite-link-share'));
        expect(mockShare).toHaveBeenCalled();
    });

    it('calls rotate() when rotate button pressed', () => {
        const { getByTestId } = render(<InviteLinkBlock mode="expanded" kind="friend" />);
        fireEvent.press(getByTestId('invite-link-rotate'));
        expect(mockRotate).toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd cost-share-app/apps/mobile && npx jest __tests__/components/InviteLinkBlock.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the component**

Create `cost-share-app/apps/mobile/components/InviteLinkBlock.tsx`:

```tsx
import React, { useCallback } from 'react';
import { View, TouchableOpacity } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';
import { useTranslation } from 'react-i18next';
import { Text } from './AppText';
import { AppIcon } from './AppIcon';
import { useInviteLink } from '../hooks/useInviteLink';
import { useRtlLayout, rtlRowStyle } from '../hooks/useRtlLayout';
import { colors } from '../theme';

interface Props {
    kind: 'friend' | 'group';
    mode: 'expanded' | 'compact';
    groupId?: string;
}

function trimUrl(url: string): string {
    // strip the protocol for a tighter display
    return url.replace(/^https?:\/\//, '');
}

export function InviteLinkBlock({ kind, mode, groupId }: Props) {
    const { t } = useTranslation();
    const { url, isReady, share, rotate } = useInviteLink(groupId);
    const isRtl = useRtlLayout();

    const labelKey = kind === 'friend' ? 'invite.friend.linkLabel' : 'invite.group.linkLabel';
    const rotateKey = kind === 'friend' ? 'invite.friend.rotate' : 'invite.group.rotate';
    const shareKey = kind === 'friend' ? 'invite.friend.cta' : 'invite.group.title';
    const copiedKey = 'invite.friend.copied'; // shared copy for both kinds

    const handleCopy = useCallback(async () => {
        if (!url) return;
        await Clipboard.setStringAsync(url);
        Toast.show({ type: 'success', text1: t(copiedKey) });
    }, [url, t]);

    if (!isReady) return null;

    return (
        <View className="bg-white rounded-xl border border-slate-200/80 p-4">
            <Text className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                {t(labelKey)}
            </Text>

            {/* URL + Copy */}
            <View style={rtlRowStyle(isRtl)} className="items-center mb-3">
                <Text className="flex-1 text-sm text-gray-800" numberOfLines={1}>
                    {trimUrl(url)}
                </Text>
                <TouchableOpacity
                    onPress={handleCopy}
                    className="ml-2"
                    testID="invite-link-copy"
                >
                    <Text className="text-sm font-semibold text-primary">
                        {t('invite.friend.copyButton')}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Share */}
            <TouchableOpacity
                onPress={share}
                style={rtlRowStyle(isRtl)}
                className="items-center py-3 border-t border-slate-100"
                testID="invite-link-share"
            >
                <AppIcon name="share-outline" size={20} color={colors.primary} />
                <Text className="flex-1 ml-3 text-sm font-semibold text-gray-800">
                    {t(shareKey)}
                </Text>
                <AppIcon
                    name={isRtl ? 'chevron-back' : 'chevron-forward'}
                    size={18}
                    color={colors.gray400}
                />
            </TouchableOpacity>

            {/* Rotate (expanded only) */}
            {mode === 'expanded' && (
                <TouchableOpacity
                    onPress={rotate}
                    style={rtlRowStyle(isRtl)}
                    className="items-center py-3 border-t border-slate-100"
                    testID="invite-link-rotate"
                >
                    <AppIcon name="refresh-outline" size={20} color={colors.gray600} />
                    <Text className="flex-1 ml-3 text-sm font-medium text-gray-700">
                        {t(rotateKey)}
                    </Text>
                </TouchableOpacity>
            )}
        </View>
    );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd cost-share-app/apps/mobile && npx jest __tests__/components/InviteLinkBlock.test.tsx`
Expected: PASS — all three tests.

- [ ] **Step 5: Typecheck**

Run: `cd cost-share-app/apps/mobile && npx tsc --noEmit`
Expected: No errors. If `expo-clipboard` is not yet a dependency, install it: `cd cost-share-app/apps/mobile && npx expo install expo-clipboard` (it's a standard Expo SDK 54 module, no plugin needed). Then re-run typecheck.

- [ ] **Step 6: Commit**

```bash
git add cost-share-app/apps/mobile/components/InviteLinkBlock.tsx \
        cost-share-app/apps/mobile/__tests__/components/InviteLinkBlock.test.tsx \
        cost-share-app/apps/mobile/package.json \
        cost-share-app/package-lock.json
git commit -m "feat(mobile): add <InviteLinkBlock /> shared component"
```

---

### Task 12: Wire `<InviteLinkBlock />` into `SettingsScreen`

**Files:**
- Modify: `cost-share-app/apps/mobile/screens/profile/SettingsScreen.tsx`

- [ ] **Step 1: Read the current SettingsScreen structure**

Open the file. The block we add goes at the top of the scrollable content area, before any existing sections (Language, Theme, etc.).

- [ ] **Step 2: Add imports**

At the top of the file, add:

```typescript
import { InviteLinkBlock } from '../../components/InviteLinkBlock';
```

- [ ] **Step 3: Insert the block**

Inside the ScrollView (or equivalent container that renders the settings rows), as the first child, add:

```tsx
<View className="px-4 pt-4">
    <InviteLinkBlock kind="friend" mode="expanded" />
</View>
```

(If the screen already uses `px-4` on its content container, drop the wrapper View and place `<InviteLinkBlock />` directly with a `className="mb-4"` or follow the screen's existing spacing convention.)

- [ ] **Step 4: Typecheck**

Run: `cd cost-share-app/apps/mobile && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Manual smoke check**

Start the app (`cd cost-share-app/apps/mobile && npm run start`), navigate to Settings, confirm the invite link block renders at the top with a URL placeholder. Tapping Share should open the OS share sheet; tapping Rotate should pop the confirm Alert.

- [ ] **Step 6: Commit**

```bash
git add cost-share-app/apps/mobile/screens/profile/SettingsScreen.tsx
git commit -m "feat(mobile): show invite-friend block in Settings"
```

---

### Task 13: Wire `<InviteLinkBlock />` into `EditProfileScreen`

**Files:**
- Modify: `cost-share-app/apps/mobile/screens/profile/EditProfileScreen.tsx`

- [ ] **Step 1: Add the import**

```typescript
import { InviteLinkBlock } from '../../components/InviteLinkBlock';
```

- [ ] **Step 2: Insert below the form**

After the last form field (avatar / name / email / phone / currency) and before any save button or footer, add:

```tsx
<View className="px-4 pt-4">
    <InviteLinkBlock kind="friend" mode="expanded" />
</View>
```

- [ ] **Step 3: Typecheck**

Run: `cd cost-share-app/apps/mobile && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/apps/mobile/screens/profile/EditProfileScreen.tsx
git commit -m "feat(mobile): show invite-friend block in EditProfile"
```

---

### Task 14: Add Invite CTA card to `FriendsScreen`

**Files:**
- Modify: `cost-share-app/apps/mobile/screens/profile/FriendsScreen.tsx`

- [ ] **Step 1: Add imports**

```typescript
import { shareFriendInvite } from '../../services/invite.service';
import { AppIcon } from '../../components/AppIcon';
import { TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';   // if not already present
```

- [ ] **Step 2: Add the CTA card**

At the top of the screen's scrollable content (before the incoming requests section), add:

```tsx
<TouchableOpacity
    onPress={() => { void shareFriendInvite(); }}
    activeOpacity={0.7}
    className="mx-4 mt-4 mb-2 px-4 py-3 bg-primary/10 rounded-xl flex-row items-center"
    testID="friends-invite-cta"
>
    <AppIcon name="person-add-outline" size={22} color={colors.primary} />
    <View className="flex-1 ml-3">
        <Text className="text-sm font-semibold text-gray-800">
            {t('invite.friend.title')}
        </Text>
        <Text className="text-xs text-slate-500">
            {t('invite.friend.subtitle')}
        </Text>
    </View>
    <AppIcon name="chevron-forward" size={18} color={colors.gray400} />
</TouchableOpacity>
```

If `colors` is not already imported on the screen, add: `import { colors } from '../../theme';`. If `Text` from `AppText` is used elsewhere on the screen, mirror that import — otherwise use the existing convention in this file.

- [ ] **Step 3: Typecheck**

Run: `cd cost-share-app/apps/mobile && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/apps/mobile/screens/profile/FriendsScreen.tsx
git commit -m "feat(mobile): add invite-friend CTA card to FriendsScreen"
```

---

### Task 15: Add empty-state CTA + persistent footer to `FindFriendsScreen`

**Files:**
- Modify: `cost-share-app/apps/mobile/screens/profile/FindFriendsScreen.tsx`

- [ ] **Step 1: Read the current FindFriendsScreen structure**

Identify (a) the no-results branch (rendered when search is non-empty but results array is empty) and (b) the FlatList / ScrollView that renders the results.

- [ ] **Step 2: Add imports**

```typescript
import { shareFriendInvite } from '../../services/invite.service';
```

- [ ] **Step 3: Replace the no-results branch**

Wherever the screen currently renders "No results" copy when the query has no matches, replace it with:

```tsx
<View className="items-center px-6 py-10">
    <Text className="text-base text-slate-600 mb-4">
        {t('invite.friend.findEmpty')}
    </Text>
    <TouchableOpacity
        onPress={() => { void shareFriendInvite(); }}
        className="px-5 py-3 bg-primary rounded-full"
        testID="findfriends-empty-invite"
    >
        <Text className="text-sm font-semibold text-white">
            {query.trim().length > 0
                ? t('invite.friend.findInviteName', { name: query.trim() })
                : t('invite.friend.findEmptyCta')}
        </Text>
    </TouchableOpacity>
</View>
```

(`query` here is whichever local variable holds the current search text on the screen — adapt to the existing name.)

- [ ] **Step 4: Add the persistent footer**

At the bottom of the results list (use `ListFooterComponent` on FlatList, or after the rendered rows in a ScrollView), render:

```tsx
<View className="items-center py-6 border-t border-slate-100 mt-4">
    <Text className="text-sm text-slate-500 mb-2">
        {t('invite.friend.findEmpty')}
    </Text>
    <TouchableOpacity
        onPress={() => { void shareFriendInvite(); }}
        testID="findfriends-footer-invite"
    >
        <Text className="text-sm font-semibold text-primary">
            {t('invite.friend.findEmptyCta')}
        </Text>
    </TouchableOpacity>
</View>
```

- [ ] **Step 5: Typecheck**

Run: `cd cost-share-app/apps/mobile && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add cost-share-app/apps/mobile/screens/profile/FindFriendsScreen.tsx
git commit -m "feat(mobile): add invite CTA in FindFriends empty state + footer"
```

---

### Task 16: Wire group `<InviteLinkBlock />` into `EditGroupScreen`

**Files:**
- Modify: `cost-share-app/apps/mobile/screens/groups/EditGroupScreen.tsx`

- [ ] **Step 1: Add the import**

```typescript
import { InviteLinkBlock } from '../../components/InviteLinkBlock';
```

- [ ] **Step 2: Insert the block before Danger Zone**

Locate the Danger Zone section in `EditGroupScreen.tsx`. Immediately before it, add:

```tsx
<View className="px-4 mt-6">
    <InviteLinkBlock kind="group" mode="expanded" groupId={groupId} />
</View>
```

(`groupId` is the screen's existing route param — adapt to the existing variable name in this file.)

- [ ] **Step 3: Typecheck**

Run: `cd cost-share-app/apps/mobile && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/apps/mobile/screens/groups/EditGroupScreen.tsx
git commit -m "feat(mobile): add group invite-link block to EditGroup"
```

---

### Task 17: Overflow menu + empty-state subtext in `GroupDetailScreen`

**Files:**
- Modify: `cost-share-app/apps/mobile/screens/groups/GroupDetailScreen.tsx`

- [ ] **Step 1: Add imports**

```typescript
import { shareGroupInvite } from '../../services/invite.service';
import { Alert } from 'react-native';   // if not already imported
```

- [ ] **Step 2: Add the overflow menu in the header**

In the existing `useLayoutEffect` that calls `navigation.setOptions`, replace (or extend) the `headerRight` to include an overflow ellipsis. Tapping it shows an `Alert.alert` (acting as a lightweight bottom-sheet menu — `react-native` doesn't ship an action sheet primitive, and `Alert` is the existing pattern here):

```tsx
const handleOverflow = useCallback(() => {
    Alert.alert(
        '',
        '',
        [
            {
                text: t('invite.group.title'),
                onPress: () => { void shareGroupInvite(groupId); },
            },
            { text: t('common.cancel'), style: 'cancel' },
        ],
        { cancelable: true },
    );
}, [groupId, t]);

// inside the navigation.setOptions call:
headerRight: () => (
    <TouchableOpacity
        onPress={handleOverflow}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        className="mr-2"
        testID="group-overflow-button"
    >
        <AppIcon name="ellipsis-horizontal" size={22} color={colors.gray600} />
    </TouchableOpacity>
),
```

(If a more elaborate menu already exists with Edit + Export options, append the Share Link item to that menu instead of using the Alert wrapper.)

- [ ] **Step 3: Add the empty-state link**

Locate the existing empty-state block (where "Add expense" and "Add Members" CTAs render when the group has no expenses). Immediately below the two CTAs, add:

```tsx
<TouchableOpacity
    onPress={() => { void shareGroupInvite(groupId); }}
    className="mt-4 self-center"
    testID="group-empty-share-link"
>
    <Text className="text-sm text-primary">
        {t('invite.group.emptyStateLink')}
    </Text>
</TouchableOpacity>
```

- [ ] **Step 4: Typecheck**

Run: `cd cost-share-app/apps/mobile && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/apps/mobile/screens/groups/GroupDetailScreen.tsx
git commit -m "feat(mobile): add overflow menu + empty-state share link in GroupDetail"
```

---

### Task 18: Add CTAs to `AddMembersSheet`

**Files:**
- Modify: `cost-share-app/apps/mobile/components/AddMembersSheet.tsx`

- [ ] **Step 1: Add imports**

```typescript
import { shareGroupInvite } from '../services/invite.service';
```

- [ ] **Step 2: Add the two CTA rows**

Inside the sheet's content, after the friends list (the `MemberSelector` block) and before the "Add" confirm button, add a divider + two rows:

```tsx
<View className="mt-4 border-t border-slate-100 pt-2">
    <TouchableOpacity
        onPress={() => navigation.navigate('Profile', { screen: 'FindFriends' })}
        className="flex-row items-center py-3 px-2"
        testID="add-members-search-others"
    >
        <AppIcon name="search-outline" size={20} color={colors.primary} />
        <Text className="flex-1 ml-3 text-sm font-medium text-gray-800">
            {t('invite.addMembers.searchOthers')}
        </Text>
        <AppIcon name="chevron-forward" size={18} color={colors.gray400} />
    </TouchableOpacity>

    <TouchableOpacity
        onPress={() => { void shareGroupInvite(groupId); }}
        className="flex-row items-center py-3 px-2"
        testID="add-members-share-link"
    >
        <AppIcon name="share-outline" size={20} color={colors.primary} />
        <Text className="flex-1 ml-3 text-sm font-medium text-gray-800">
            {t('invite.addMembers.sendLink')}
        </Text>
        <AppIcon name="chevron-forward" size={18} color={colors.gray400} />
    </TouchableOpacity>
</View>
```

(If the existing layout uses RTL-aware `rtlRowStyle`, mirror the convention here instead of the inline `flex-row`.)

- [ ] **Step 3: Adjust the Add confirm button visibility**

Per spec, the Add button is only rendered when ≥1 friend is selected. Wrap the existing Add button in:

```tsx
{selectedIds.length > 0 && (
    /* existing Add button JSX */
)}
```

If the existing implementation already disables it at 0 selections, you can leave it visible-but-disabled instead — match the existing pattern as long as the empty selection isn't actionable.

- [ ] **Step 4: Typecheck**

Run: `cd cost-share-app/apps/mobile && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/apps/mobile/components/AddMembersSheet.tsx
git commit -m "feat(mobile): add Search Others + Share Link CTAs in AddMembersSheet"
```

---

### Task 19: Update `app.json` for Universal Links

**Files:**
- Modify: `cost-share-app/apps/mobile/app.json`

- [ ] **Step 1: Add `ios.associatedDomains`**

Inside the existing `ios` block, add:

```json
"associatedDomains": ["applinks:kupa.pro"]
```

Existing keys stay intact. Final shape:

```json
"ios": {
    "supportsTablet": true,
    "bundleIdentifier": "com.kupay.mobile",
    "associatedDomains": ["applinks:kupa.pro"],
    "infoPlist": {
        "CFBundleDisplayName": "Kupay"
    }
}
```

- [ ] **Step 2: Add `android.intentFilters`**

Inside the existing `android` block, add:

```json
"intentFilters": [{
    "action": "VIEW",
    "autoVerify": true,
    "data": [
        { "scheme": "https", "host": "kupa.pro", "pathPattern": "/i/.*" },
        { "scheme": "https", "host": "kupa.pro", "pathPattern": "/g/.*" }
    ],
    "category": ["BROWSABLE", "DEFAULT"]
}]
```

- [ ] **Step 3: Verify config**

Run: `cd cost-share-app/apps/mobile && npx expo config --type public > /tmp/expo-config.json && grep -A 2 "associatedDomains" /tmp/expo-config.json`
Expected: the `applinks:kupa.pro` value appears.

- [ ] **Step 4: Note the build requirement**

These changes require a fresh native build (cannot be OTA). Document the next steps in the commit body but do **not** run the build now — it's covered in Task 24.

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/apps/mobile/app.json
git commit -m "$(cat <<'EOF'
feat(mobile): configure Universal Links for kupa.pro

Adds ios.associatedDomains and android.intentFilters so /i/* and /g/*
paths open the app directly when installed. Requires a fresh EAS build
to take effect.
EOF
)"
```

---

### Task 20: Mount `useInviteRedemption` in `AppNavigator`

**Files:**
- Modify: `cost-share-app/apps/mobile/navigation/AppNavigator.tsx`

- [ ] **Step 1: Add the import**

```typescript
import { useInviteRedemption } from '../hooks/useInviteRedemption';
```

- [ ] **Step 2: Call the hook inside the navigator function body**

`useInviteRedemption()` must run *inside* `NavigationContainer` because it calls `useNavigation()`. The `AppNavigator` component is already mounted inside the container (see `App.tsx`). Call the hook at the top of `AppNavigator`'s body:

```typescript
export function AppNavigator() {
    useInviteRedemption();
    // ... existing logic
}
```

- [ ] **Step 3: Typecheck**

Run: `cd cost-share-app/apps/mobile && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Run the full test suite**

Run: `cd cost-share-app/apps/mobile && npx jest`
Expected: All tests pass (no regressions from earlier tasks).

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/apps/mobile/navigation/AppNavigator.tsx
git commit -m "feat(mobile): mount useInviteRedemption in AppNavigator"
```

---

### Task 21: Edge Function skeleton + routing

**Files:**
- Create: `cost-share-app/supabase/functions/invite-landing/deno.json`
- Create: `cost-share-app/supabase/functions/invite-landing/index.ts`

- [ ] **Step 1: Create `deno.json`**

```json
{
    "imports": {
        "supabase": "https://esm.sh/@supabase/supabase-js@2"
    }
}
```

- [ ] **Step 2: Create `index.ts` with routing**

```typescript
// Edge Function: invite-landing
// Serves https://kupa.pro/i/<token>, /g/<token>, /.well-known/*, and a minimal root page.
// See docs/superpowers/specs/2026-05-20-invites-and-sharing-design.md

import { createClient } from 'supabase';
import { renderFriendInvite, renderGroupInvite, renderInvalid, renderRoot } from './render.ts';
import { handleWellKnown } from './well-known.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TOKEN_RE = /^[A-Za-z0-9_-]{10}$/;

interface PreviewFriend {
    kind: 'friend';
    inviter: { id: string; name: string; avatar_url: string | null };
}
interface PreviewGroup {
    kind: 'group';
    group: {
        id: string;
        name: string;
        currency: string;
        member_count: number;
        members: Array<{ id: string; name: string; avatar_url: string | null }>;
    };
}
interface PreviewInvalid { kind: 'invalid'; }
type Preview = PreviewFriend | PreviewGroup | PreviewInvalid;

async function fetchPreview(token: string): Promise<Preview> {
    const { data, error } = await client.rpc('get_invite_preview', { p_token: token });
    if (error || !data) return { kind: 'invalid' };
    return data as Preview;
}

Deno.serve(async (req: Request) => {
    const url = new URL(req.url);
    const path = url.pathname;

    // well-known files
    const wk = handleWellKnown(path);
    if (wk) return wk;

    // friend invite
    const friend = path.match(/^\/i\/([^/?#]+)\/?$/);
    if (friend && TOKEN_RE.test(friend[1])) {
        const preview = await fetchPreview(friend[1]);
        if (preview.kind !== 'friend') {
            return new Response(renderInvalid(), { status: 404, headers: htmlHeaders() });
        }
        return new Response(renderFriendInvite(preview, friend[1]), { status: 200, headers: htmlHeaders() });
    }

    // group invite
    const group = path.match(/^\/g\/([^/?#]+)\/?$/);
    if (group && TOKEN_RE.test(group[1])) {
        const preview = await fetchPreview(group[1]);
        if (preview.kind !== 'group') {
            return new Response(renderInvalid(), { status: 404, headers: htmlHeaders() });
        }
        return new Response(renderGroupInvite(preview, group[1]), { status: 200, headers: htmlHeaders() });
    }

    // root
    if (path === '/' || path === '') {
        return new Response(renderRoot(), { status: 200, headers: htmlHeaders() });
    }

    return new Response('Not found', { status: 404 });
});

function htmlHeaders(): HeadersInit {
    return {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=60',
    };
}
```

- [ ] **Step 3: Commit (skeleton — render/well-known stubs come in Tasks 22 + 23)**

To avoid a broken intermediate state, create empty stubs first:

```bash
mkdir -p cost-share-app/supabase/functions/invite-landing
cat > cost-share-app/supabase/functions/invite-landing/render.ts <<'EOF'
// Filled in Task 23.
export function renderFriendInvite(_p: any, _t: string): string { return '<html><body>TBD</body></html>'; }
export function renderGroupInvite(_p: any, _t: string): string { return '<html><body>TBD</body></html>'; }
export function renderInvalid(): string { return '<html><body>Invalid</body></html>'; }
export function renderRoot(): string { return '<html><body>Kupay</body></html>'; }
EOF
cat > cost-share-app/supabase/functions/invite-landing/well-known.ts <<'EOF'
// Filled in Task 22.
export function handleWellKnown(_path: string): Response | null { return null; }
EOF
```

Then commit:

```bash
git add cost-share-app/supabase/functions/invite-landing/
git commit -m "feat(edge): scaffold invite-landing Edge Function with routing"
```

---

### Task 22: Implement well-known handlers

**Files:**
- Modify: `cost-share-app/supabase/functions/invite-landing/well-known.ts`

- [ ] **Step 1: Capture the iOS Team ID and Android SHA-256 fingerprints**

Before writing this code, obtain:
- iOS Team ID: from the Apple Developer account → membership tab. Format: 10 alphanumeric chars.
- Android debug SHA-256: `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android | grep SHA-256`.
- Android release SHA-256: from EAS — `eas credentials` → Android → keystore details → "SHA256 Certificate Fingerprint".

Record these as env vars used by the function:
- `KUPAY_IOS_TEAM_ID`
- `KUPAY_ANDROID_DEBUG_SHA256`
- `KUPAY_ANDROID_RELEASE_SHA256`

Set them on the Supabase project via the Supabase dashboard → Project Settings → Edge Functions → Secrets, or via the CLI.

- [ ] **Step 2: Replace the stub with real handlers**

```typescript
const TEAM_ID = Deno.env.get('KUPAY_IOS_TEAM_ID') ?? '';
const ANDROID_DEBUG_SHA = Deno.env.get('KUPAY_ANDROID_DEBUG_SHA256') ?? '';
const ANDROID_RELEASE_SHA = Deno.env.get('KUPAY_ANDROID_RELEASE_SHA256') ?? '';

const AASA_JSON = JSON.stringify({
    applinks: {
        apps: [],
        details: [{
            appID: `${TEAM_ID}.com.kupay.mobile`,
            paths: ['/i/*', '/g/*'],
        }],
    },
});

const ANDROID_LINKS_JSON = JSON.stringify([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
        namespace: 'android_app',
        package_name: 'com.kupay.mobile',
        sha256_cert_fingerprints: [ANDROID_RELEASE_SHA, ANDROID_DEBUG_SHA].filter(Boolean),
    },
}]);

export function handleWellKnown(path: string): Response | null {
    if (path === '/.well-known/apple-app-site-association') {
        return new Response(AASA_JSON, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=3600',
            },
        });
    }
    if (path === '/.well-known/assetlinks.json') {
        return new Response(ANDROID_LINKS_JSON, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=3600',
            },
        });
    }
    return null;
}
```

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/supabase/functions/invite-landing/well-known.ts
git commit -m "feat(edge): serve apple-app-site-association + assetlinks.json"
```

---

### Task 23: Implement HTML render templates

**Files:**
- Modify: `cost-share-app/supabase/functions/invite-landing/render.ts`

- [ ] **Step 1: Replace the stubs with real templates**

```typescript
// HTML rendering for invite-landing.
// All user-supplied strings are passed through escapeHtml.

// App Store URL is read from an env var because Apple assigns the numeric ID at
// publication time; before publication, the env var falls back to the marketing
// site itself. Set KUPAY_APP_STORE_URL once the app is published.
const APP_STORE_URL = Deno.env.get('KUPAY_APP_STORE_URL') ?? 'https://kupa.pro/';
const PLAY_STORE_URL = Deno.env.get('KUPAY_PLAY_STORE_URL') ?? 'https://play.google.com/store/apps/details?id=com.kupay.mobile';

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[c]!));
}

function shell({
    title,
    description,
    canonical,
    body,
}: {
    title: string;
    description: string;
    canonical: string;
    body: string;
}): string {
    const t = escapeHtml(title);
    const d = escapeHtml(description);
    const c = escapeHtml(canonical);
    return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${t}</title>
<meta name="description" content="${d}" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${t}" />
<meta property="og:description" content="${d}" />
<meta property="og:url" content="${c}" />
<meta property="og:image" content="https://kupa.pro/og/default.png" />
<style>
  :root{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;}
  body{margin:0;background:#0f172a;color:#e2e8f0;display:flex;min-height:100vh;align-items:center;justify-content:center;}
  .card{background:#fff;color:#0f172a;border-radius:16px;padding:32px;max-width:420px;width:90%;text-align:center;}
  .avatar{width:96px;height:96px;border-radius:48px;margin:0 auto 16px;background:#e2e8f0;object-fit:cover;}
  h1{margin:0 0 8px;font-size:22px;}
  h2{margin:8px 0 16px;font-size:28px;color:#0ea5e9;}
  p{margin:0 0 16px;color:#475569;font-size:15px;}
  .btn{display:block;text-decoration:none;padding:14px;border-radius:12px;font-weight:600;margin:8px 0;}
  .btn.primary{background:#0ea5e9;color:#fff;}
  .btn.secondary{background:#f1f5f9;color:#0f172a;}
  .members{display:flex;justify-content:center;gap:6px;margin:12px 0;}
  .members img{width:36px;height:36px;border-radius:18px;background:#e2e8f0;}
  .meta{font-size:13px;color:#64748b;margin-bottom:24px;}
  .footnote{font-size:12px;color:#94a3b8;margin-top:20px;}
</style>
</head>
<body>
<div class="card">${body}</div>
<script>
  // Best-effort custom-scheme attempt for users who land here despite app being installed.
  setTimeout(() => {
    const m = location.pathname.match(/^\\/(i|g)\\/([A-Za-z0-9_-]{10})$/);
    if (m) location.href = 'com.kupay.mobile://invite/' + m[1] + '/' + m[2];
  }, 100);
</script>
</body></html>`;
}

function platformButtons(): string {
    return `
    <a class="btn secondary" href="${APP_STORE_URL}">🍎 App Store</a>
    <a class="btn secondary" href="${PLAY_STORE_URL}">▶ Google Play</a>`;
}

export function renderFriendInvite(
    preview: { kind: 'friend'; inviter: { id: string; name: string; avatar_url: string | null } },
    token: string,
): string {
    const inviterName = escapeHtml(preview.inviter.name || 'חבר');
    const avatar = preview.inviter.avatar_url
        ? `<img class="avatar" src="${escapeHtml(preview.inviter.avatar_url)}" alt="" />`
        : `<div class="avatar"></div>`;
    const body = `
        ${avatar}
        <h1>${inviterName} רוצה לחלוק איתך הוצאות דרך Kupay</h1>
        <p>חלקו את חשבון המסעדה, הטיול, והדירה — בלי לעשות חשבונות.</p>
        <a class="btn primary" href="com.kupay.mobile://invite/i/${escapeHtml(token)}">פתח את Kupay</a>
        ${platformButtons()}
        <p class="footnote">אחרי ההורדה — חזור לקישור הזה.</p>
    `;
    return shell({
        title: `${preview.inviter.name} הזמין אותך ל-Kupay`,
        description: 'הצטרף ל-Kupay וחלוק הוצאות בקלות.',
        canonical: `https://kupa.pro/i/${token}`,
        body,
    });
}

export function renderGroupInvite(
    preview: {
        kind: 'group';
        group: {
            id: string;
            name: string;
            currency: string;
            member_count: number;
            members: Array<{ id: string; name: string; avatar_url: string | null }>;
        };
    },
    token: string,
): string {
    const g = preview.group;
    const name = escapeHtml(g.name);
    const memberAvatars = g.members.map(m =>
        m.avatar_url
            ? `<img src="${escapeHtml(m.avatar_url)}" alt="" />`
            : `<img alt="" />`,
    ).join('');

    const body = `
        <h1>הוזמנת לקבוצה ב-Kupay</h1>
        <h2>${name}</h2>
        <div class="members">${memberAvatars}</div>
        <div class="meta">${g.member_count} חברים · ${escapeHtml(g.currency)}</div>
        <a class="btn primary" href="com.kupay.mobile://invite/g/${escapeHtml(token)}">הצטרף לקבוצה ב-Kupay</a>
        ${platformButtons()}
        <p class="footnote">אחרי ההורדה — חזור לקישור הזה.</p>
    `;
    return shell({
        title: `הוזמנת לקבוצת '${g.name}' ב-Kupay`,
        description: `${g.member_count} חברים · מטבע ${g.currency} · הצטרף בקלות`,
        canonical: `https://kupa.pro/g/${token}`,
        body,
    });
}

export function renderInvalid(): string {
    return shell({
        title: 'קישור לא תקף',
        description: 'הקישור הזה כבר לא תקף או הסתיים.',
        canonical: 'https://kupa.pro/',
        body: `
            <h1>קישור לא תקף</h1>
            <p>הקישור הזה כבר לא פעיל. בקש מהאדם שהזמין אותך לשלוח קישור חדש.</p>
        `,
    });
}

export function renderRoot(): string {
    return shell({
        title: 'Kupay',
        description: 'חלקו הוצאות בקלות.',
        canonical: 'https://kupa.pro/',
        body: `
            <h1>Kupay</h1>
            <p>חלקו את חשבון המסעדה, הטיול, והדירה — בלי לעשות חשבונות.</p>
            ${platformButtons()}
        `,
    });
}
```

- [ ] **Step 2: Commit**

```bash
git add cost-share-app/supabase/functions/invite-landing/render.ts
git commit -m "feat(edge): implement HTML templates for invite-landing"
```

---

### Task 24: Deploy Edge Function + configure DNS + verify Universal Links

**This task involves external configuration; the steps document them precisely.**

- [ ] **Step 1: Deploy the Edge Function**

Run via `mcp__supabase__deploy_edge_function` with name `invite-landing` and the three files from `cost-share-app/supabase/functions/invite-landing/`.
Expected: function URL is returned, e.g. `https://<project-ref>.supabase.co/functions/v1/invite-landing`.

- [ ] **Step 2: Smoke test the deployed function**

```bash
curl -i "https://<project-ref>.supabase.co/functions/v1/invite-landing/i/$(psql ... -c 'SELECT invite_token FROM profiles LIMIT 1' -tA)"
```

Or simpler: pick a known token via `mcp__supabase__execute_sql`, then:

```bash
curl -i "https://<project-ref>.supabase.co/functions/v1/invite-landing/i/<token>"
```

Expected: HTTP 200, `Content-Type: text/html`, HTML containing the inviter's name.

Also test:
```bash
curl -i "https://<project-ref>.supabase.co/functions/v1/invite-landing/.well-known/apple-app-site-association"
```
Expected: HTTP 200, JSON with the team ID + bundle ID.

- [ ] **Step 3: Configure DNS for `kupa.pro`**

In the domain registrar (where `kupa.pro` is held):

Option A — CNAME flattening (preferred):
- `kupa.pro` → CNAME → `<project-ref>.supabase.co`

Option B — Reverse proxy via Cloudflare:
- Set up Cloudflare in front of `kupa.pro`.
- Add a Worker / Rule that rewrites:
  - `kupa.pro/*` → `https://<project-ref>.supabase.co/functions/v1/invite-landing/*`

The exact registrar/Cloudflare steps are environment-specific; document the chosen path in `docs/SSOT/SRS.md` Decision History.

- [ ] **Step 4: Verify `kupa.pro` serves the function**

```bash
curl -i "https://kupa.pro/i/<known-token>"
curl -i "https://kupa.pro/.well-known/apple-app-site-association"
curl -i "https://kupa.pro/.well-known/assetlinks.json"
```

Expected: all return HTTP 200 with the right content types.

- [ ] **Step 5: Validate iOS association**

Use Apple's validator: `https://app-site-association.cdn-apple.com/a/v1/kupa.pro` (may take 24h to propagate).
Expected: `applinks.details[0].appID` matches `<TEAM_ID>.com.kupay.mobile` and paths include `/i/*` and `/g/*`.

- [ ] **Step 6: Validate Android association**

Use Google's validator: `https://developers.google.com/digital-asset-links/tools/generator`.
Expected: `assetlinks.json` is reachable and well-formed.

- [ ] **Step 7: Build a new dev client for testing Universal Links**

Run:
```bash
cd cost-share-app/apps/mobile
eas build --profile development --platform ios
eas build --profile development --platform android
```

Install on a device. Use the existing `expo-dev-client` development workflow.

- [ ] **Step 8: Manual end-to-end test**

Pick a friend invite URL and a group invite URL from production data. From a device with the dev client installed:

1. Tap the friend link in WhatsApp → app should open directly to FriendsScreen with a "Added X as a friend" Toast.
2. Tap the group link → app should open to the group's GroupDetailScreen with a "Joined X" Toast.
3. Tap a rotated (stale) link → "This invite link is no longer valid" Toast.
4. Tap your own friend link → "That's your own invite link" Toast.

Document any failures and fix them before moving on.

- [ ] **Step 9: Commit the deployment notes**

Update `docs/SSOT/SRS.md`'s Decision History with:
```
| 2026-MM-DD | Invite links live: kupa.pro DNS pointed at Supabase Edge Function invite-landing; Universal Links validated for iOS and Android. |
```

```bash
git add docs/SSOT/SRS.md
git commit -m "docs(srs): record invite-links deployment + DNS routing"
```

---

### Task 25: Final verification pass

- [ ] **Step 1: Run the full mobile test suite**

Run: `cd cost-share-app/apps/mobile && npx jest`
Expected: all tests pass; no regressions in previously-passing suites.

- [ ] **Step 2: Run the typecheck for both packages**

Run:
```bash
cd cost-share-app && npx tsc -p packages/shared/tsconfig.json --noEmit
cd cost-share-app/apps/mobile && npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 3: Visual sanity check on every entry point**

Manually walk through with the dev client:
- Settings → invite block visible, share opens sheet, rotate prompts confirm.
- EditProfile → same.
- FriendsScreen → CTA card shows, tap opens share sheet.
- FindFriendsScreen → search a non-existent name → empty state shows invite CTA; with results, footer also shows.
- GroupDetail → overflow menu shows Share Link.
- EditGroup → invite block visible above Danger Zone.
- AddMembersSheet → friends list + Search + Share Link rows; empty state when no friends.
- GroupDetail empty state → "or share group link" subtext under the existing CTAs.

- [ ] **Step 4: Run advisors one more time**

Run via `mcp__supabase__get_advisors` with `type = 'security'`.
Expected: no new ERROR findings.

- [ ] **Step 5: Final commit (if anything needed cleanup)**

If any small fixes came out of the verification, group them into one commit:
```bash
git add -A
git commit -m "chore(invites): final cleanup after verification pass"
```

If nothing came up — skip this step.

---

## Self-Review

After completing every task above, this plan covers every section of the spec:

- **Locked decisions 1–9**: implemented across Tasks 2/3 (DB), 6 (services), 8/9 (hooks), 11–18 (UI), 19/20 (deep-linking), 21–24 (Edge Function + DNS).
- **DB design**: Tasks 1–3 cover all columns, RPCs, RLS implications (RPCs are SECURITY DEFINER with explicit grants), and migration order (schema first, then RPCs).
- **Mobile data layer**: Tasks 4–9 cover store, services, hooks, query keys.
- **Friend-link UI**: Tasks 12–15.
- **Group-link UI**: Tasks 16–18.
- **Edge Function + Web landing**: Tasks 21–24.
- **Deep linking**: Tasks 19–20 (app config + hook mount), Task 24 (verification).
- **i18n**: Task 10.
- **Testing**: TDD steps inside Tasks 6, 7, 11; full sweep in Task 25.
- **Technical debt list**: documented in spec, not duplicated here — verification doesn't require addressing it.
- **Out-of-scope items**: not implemented by design (deferred deep linking, QR codes, dynamic OG, etc.).

No placeholders remain. Every task names exact file paths, exact code, and exact expected output for each step.
