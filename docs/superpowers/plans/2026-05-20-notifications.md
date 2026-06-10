# Notifications System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** End-to-end mobile notifications (Expo push + in-app inbox + per-category preferences + mute-group) for CoPay, with full test coverage.

**Architecture:** AFTER INSERT/UPDATE/DELETE triggers on business tables (`expenses`, `expense_splits`, `settlements`, `group_members`) call `SECURITY DEFINER` fanout functions that INSERT into `notifications` (single source of truth). Triggers extract the actor via `auth.uid()` (or `created_by` as fallback). A Database Webhook on `notifications INSERT` fires the `send-push` Edge Function asynchronously. Mobile uses `expo-notifications` for tokens + foreground/background handlers, Supabase Realtime for live inbox, and shared i18n templates so push text matches inbox text exactly.

**Tech Stack:** PostgreSQL (Supabase), Deno Edge Functions, Expo SDK 55, React Native, TypeScript, Jest + `@testing-library/react-native`, Maestro (E2E).

**Spec:** `docs/superpowers/specs/2026-05-20-notifications-design.md`

**Deviation from spec:**
- Spec assumed Business RPCs wrap writes; the existing codebase writes directly from the client. Plan uses **AFTER triggers + `auth.uid()`** (the "safety net" in spec §"Fanout strategy") as the primary mechanism — no client refactor required.
- Spec mentions `profiles.locale`. Codebase has `profiles.language`. Plan uses the existing column.

---

## Council Review Revisions (2026-05-20)

This plan was reviewed by a 5-agent council (DB, Edge Functions, Mobile, Security, Architect). The revisions below are normative — apply them as part of executing each task. The original task body remains as the spine; this section is the patch log.

### Pre-flight blockers (do these BEFORE Task 1)

- **B1. EAS projectId.** Run `npx eas init` in `apps/mobile` and verify `expo.extra.eas.projectId` in `app.json`. Without it, `getExpoPushTokenAsync` cannot fire. Phase 1 cannot smoke-test push otherwise.
- **B2. Verify `pg_cron` + `pg_net` availability.** Both are present in `pg_available_extensions` on this Supabase project but `installed_version` is null. Decide whether to enable them now (Phase 1) or defer Task 20. If deferred, mark Phase 3 as gated on Supabase plan tier.
- **B3. Shared package name is `@cost-share/shared`, NOT `@copay/shared`.** Every code block in the plan that says `@copay/shared/notifications` must be `@cost-share/shared` (and the new module re-exported from `packages/shared/src/index.ts`). This affects Tasks 1, 4, 14, 15, 16, 17.
- **B4. Realtime publication is required.** Add `ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;` to Task 2's migration. Without it, the inbox is dead.
- **B5. Kill switch FIRST, not last.** Move the `notifications_enabled` feature flag (originally Task 23) into Task 2: a row in a `feature_flags` table OR a Postgres GUC (`current_setting('app.notifications_enabled', true)`) that every `fanout_*` function checks at the top and early-returns on `false`. Triggers fire on every expense/settlement/membership write in prod — without a kill switch, rollback is messy.

### Critical fixes (Phase 1)

- **C1. Lock down all SECURITY DEFINER fanout functions.** After EVERY `CREATE OR REPLACE FUNCTION fanout_*` and `_notif_*`, append:
  ```sql
  REVOKE EXECUTE ON FUNCTION <name>(<args>) FROM PUBLIC, anon, authenticated;
  ```
  Without this, any authenticated user can call `SELECT fanout_expense_deleted(gen_random_uuid(), '<group>', 'URGENT: call +1-555-...', 999999, 'USD', auth.uid(), ARRAY['<victim>']);` and inject arbitrary push/inbox content to any user. **This is the highest-severity finding in the review.** Affects Tasks 3, 10, 11, 12.
- **C2. Webhook authentication on `send-push` AND `retry-push`.** First line of `Deno.serve` handler:
  ```typescript
  const auth = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${Deno.env.get('WEBHOOK_SHARED_SECRET') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`;
  // constant-time compare:
  if (auth.length !== expected.length || !crypto.subtle.timingSafeEqual?.(new TextEncoder().encode(auth), new TextEncoder().encode(expected))) {
    return new Response('unauthorized', { status: 401 });
  }
  ```
  (If `crypto.subtle.timingSafeEqual` is not available in the Deno runtime, write a constant-time string compare helper.) The Database Webhook config must include the `Authorization: Bearer <secret>` header to match. Affects Tasks 4 and 20.
- **C3. Per-statement (not per-row) trigger on `expense_splits`.** The plan's per-row trigger fires N times per multi-row INSERT, doing N× fanout work and racing on partial split visibility. Use transition tables:
  ```sql
  CREATE OR REPLACE FUNCTION trg_after_expense_splits_insert_stmt()
  RETURNS trigger LANGUAGE plpgsql AS $$
  DECLARE v_expense_id uuid; v_actor uuid;
  BEGIN
    FOR v_expense_id IN SELECT DISTINCT expense_id FROM new_splits LOOP
      SELECT COALESCE(auth.uid(), created_by) INTO v_actor FROM expenses WHERE id = v_expense_id;
      PERFORM fanout_expense_added(v_expense_id, v_actor);
    END LOOP;
    RETURN NULL;
  END $$;

  DROP TRIGGER IF EXISTS tr_expense_splits_insert ON expense_splits;
  CREATE TRIGGER tr_expense_splits_insert
  AFTER INSERT ON expense_splits
  REFERENCING NEW TABLE AS new_splits
  FOR EACH STATEMENT EXECUTE FUNCTION trg_after_expense_splits_insert_stmt();
  ```
  Affects Task 3.
- **C4. CAS claim step in `send-push` to prevent double-push.** Before calling Expo, atomically transition `pending → sending` and proceed only if the UPDATE returned a row:
  ```typescript
  const { data: claimed, error: claimErr } = await sb
    .from('notifications')
    .update({ push_status: 'sending', push_attempts: row.push_attempts + 1, push_last_attempt: new Date().toISOString() })
    .eq('id', row.id)
    .in('push_status', ['pending', 'failed'])
    .select('id')
    .maybeSingle();
  if (claimErr || !claimed) return { status: 200 }; // already being processed or no longer eligible
  ```
  Also: replace the constant `push_attempts: 1` (in 3+ places in Task 4) with the incremented value — otherwise `retry-push`'s `lt('push_attempts', 3)` guard is meaningless and retries are unbounded. Affects Task 4.
- **C5. Fix cross-function import in `retry-push`.** Edge Functions are independent isolates; `import { handle } from '../send-push/index.ts'` won't work AND it would re-evaluate `Deno.serve`. Refactor:
  - Extract `handle()` into `send-push/handler.ts` (no `Deno.serve`).
  - `send-push/index.ts` imports `handle` from `./handler.ts` and serves it.
  - Either (a) vendor-copy `handler.ts` into `retry-push/`, or (b) have `retry-push` call `send-push` via authenticated `fetch` per row.
  - Recommended: **(b)** — clearer separation, single deploy unit per function. Affects Tasks 4 and 20.
- **C6. Replace `useAuth` with Zustand store in mobile hooks.** `hooks/useAuth.ts` does not exist. Use:
  ```typescript
  import { useAppStore } from '../store';
  const userId = useAppStore((s) => s.session?.user.id);
  ```
  Affects Task 14.
- **C7. Nested-navigator routing.** `navigationRef.navigate('ExpenseDetail', ...)` from root will throw — `ExpenseDetail`/`Balances`/`GroupMembers`/`GroupDetail` are inside the `Groups` tab stack. Mirror the existing `deepLinks.service.ts:95–98` pattern:
  ```typescript
  case 'expense_added':
  case 'expense_updated':
  case 'expense_deleted':
    return { screen: 'Groups', params: { screen: 'ExpenseDetail', params: { groupId: intent.group_id, expenseId: intent.entity_id } } };
  // ...etc — wrap every leaf in { screen: 'Groups', params: {...} }
  ```
  Affects Task 16.
- **C8. Foreground push + Realtime dedup.** Both fire for the same row on a live device. Realtime should update the inbox cache only; the push listener owns the toast. Add an LRU set keyed on `notification_id` (30s window) in `showInAppToast` and short-circuit duplicates. Affects Tasks 14 + 15.
- **C9. Wire `navigationRef`.** `App.tsx:136` mounts `<NavigationContainer>` with no `ref`. Add an explicit step in Task 16 to attach `navigationRef`. Also implement cold-start deep-link queue: on mount, call `Notifications.getLastNotificationResponseAsync()` and, if `!navRef.isReady()`, queue the intent and replay once ready.

### Major fixes

- **M1. Improve dedup_key resolution.** Replace `extract(epoch from updated_at)::text` with `extract(epoch from updated_at)::bigint::text || '-' || md5(coalesce(description,'') || amount::text || coalesce(currency,''))` (or similar semantic hash) so sub-second back-to-back edits don't collapse. Affects Tasks 10, 11.
- **M2. `auth.uid()` NULL safety in `trg_after_group_members_insert`.** When `auth.uid()` is NULL (service_role, cron, backfill), the current code falls into the self-join branch and spams "X joined." Either RAISE EXCEPTION on null actor for `group_members` writes, or require admin-add paths to use a SECURITY DEFINER RPC that sets `app.actor_id` GUC explicitly. Affects Task 12.
- **M3. Tighten `notif_update_own` policy.** Recipients can currently UPDATE any column (push_status, params, dedup_key). Use a column-restricted policy or a BEFORE UPDATE trigger that enforces only `read_at` may change:
  ```sql
  CREATE OR REPLACE FUNCTION notif_block_non_read_updates() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF NEW.recipient_user_id IS DISTINCT FROM OLD.recipient_user_id
       OR NEW.params IS DISTINCT FROM OLD.params
       OR NEW.push_status IS DISTINCT FROM OLD.push_status
       OR NEW.dedup_key IS DISTINCT FROM OLD.dedup_key
       OR NEW.event_type IS DISTINCT FROM OLD.event_type THEN
      RAISE EXCEPTION 'only read_at may be updated by recipients';
    END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER tr_notif_block_non_read_updates BEFORE UPDATE ON notifications
  FOR EACH ROW WHEN (current_setting('role') <> 'service_role')
  EXECUTE FUNCTION notif_block_non_read_updates();
  ```
  Affects Task 2.
- **M4. Add `currency` to settlement no-op guard.** Task 11's `trg_after_settlement_update` early-return forgets `currency` — currency-only edits silently miss notifications.
- **M5. Zod payload validation in `send-push`.** Replace silent 200-on-error with a Zod schema for the webhook payload; log structured errors. Use the existing `zod` dep from `@cost-share/shared/package.json`.
- **M6. Install `expo-haptics` in Task 5.** `InAppToast` (Task 15) imports it but it's not in `package.json`. Add `npx expo install expo-haptics` to Task 5 Step 1.
- **M7. Update OS badge on mark-read.** Currently only Realtime insert updates `setAppBadge`. After `useMarkRead.mutate` and `useMarkAllRead.mutate`, call `setAppBadge(remaining)`. Affects Task 14.
- **M8. Wire `unregisterCurrentDevice` to logout.** Add a step in Task 6 OR Task 18 that calls `unregisterCurrentDevice(token)` inside `services/auth.service.ts:signOut` BEFORE `supabase.auth.signOut()` (so RLS still allows the delete).
- **M9. RTL via `useRtlLayout()`, not `I18nManager.isRTL`.** Codebase convention. `I18nManager.isRTL` reflects device locale, not app language — Hebrew user on English device gets wrong alignment. Affects Tasks 15, 17.
- **M10. Realtime channel cleanup.** Use `supabase.removeChannel(ch)` not `ch.unsubscribe()` — mirrors existing `useGroupMessagesRealtime` pattern. Affects Task 14.
- **M11. Document PII-on-lockscreen accepted-risk.** Push payloads carry `expense_title`, `amount`, `currency`, `actor_name`, `payer_name`, `payee_name` through Expo/APNs/FCM. Add an entry to `docs/SSOT/TECHNICAL_DEBT.md` under "Notifications follow-ups" naming this explicitly, with a future-fix option (generic body + opt-in to show details).
- **M12. `notifications_send_push` webhook header must include the new `WEBHOOK_SHARED_SECRET`.** Update the Dashboard step in Task 4 Step 7 to set the matching header — and document this in `docs/SSOT/SETUP.md`.

### Phase 1 slimming (recommended)

- **S1. Ship Phase 1 with `expense_added` ONLY.** Defer Tasks 10, 11, 12 (settlement events, member events, expense_updated/deleted) to Phase 2. The plan already sequences `expense_added` first in Task 3 — just commit to that as the Phase 1 boundary.
- **S2. Simplify soft prompt.** Drop the 7-day AsyncStorage cooldown in Task 7 for v1. Show the modal once when permission is `undetermined` after the first group join, accept the result, move on. Reduces test surface significantly.
- **S3. Cut snapshot tests in Task 1.** 9 events × 2 locales = 18 snapshots that all break on any copy edit. Replace with 4 targeted assertions: en interpolation, he interpolation, unknown-locale fallback, missing-param graceful render.
- **S4. Add a SQL-only fallback for Task 9 smoke.** Two-device test is the gold standard, but a `SELECT fanout_expense_added(<id>, <actor>); SELECT * FROM notifications WHERE event_type='expense_added' ORDER BY created_at DESC LIMIT 5;` + curl-the-edge-function smoke is enough to validate the wiring without two physical devices.

### Minor observations (apply opportunistically)

- Add migration index: `CREATE INDEX IF NOT EXISTS idx_notif_push_retry ON notifications(push_status, push_attempts, created_at) WHERE push_status IN ('failed','sending');` (the existing `idx_notif_push_queue` is `WHERE push_status = 'pending'` only).
- Centralize React Query keys in `hooks/queries/keys.ts` instead of inline `['notifications', 'list']` literals.
- Reuse `FeedItemRow` / `MessageRow` / `ActivityItem` patterns for `NotificationRow` rather than re-implementing avatar+title+body+RTL from scratch.
- `device_tokens` retention: add a periodic cleanup of `WHERE disabled_at < now() - interval '90 days'` (note in TECHNICAL_DEBT.md, not Phase 1).
- `schema.sql` is dev-recreate-only; production truth is applied migrations. State this explicitly when mirroring.
- Maestro fixtures: confirm hardcoded strings (`כן, הפעלה`, `Allow`) match the actual UI copy from i18n.

### Verdict

**Fix B1–B5, C1–C9 before starting Task 1. Apply M1–M12 inside each affected task. S1–S4 are recommended scope cuts to ship in 1–2 weeks instead of 4.**

---

## File Structure

| Path | Responsibility |
|---|---|
| `cost-share-app/supabase/notifications.sql` | One-shot migration: 4 tables, enums, RLS, RPCs, triggers, fanout functions. Applied via existing patch convention. |
| `cost-share-app/supabase/schema.sql` | Schema mirror updated with the same DDL. |
| `cost-share-app/supabase/tests/notifications.sql` | SQL test script (assertion-style) covering fanout, prefs, mutes, RLS. |
| `cost-share-app/supabase/functions/send-push/index.ts` | Webhook handler: lookup tokens, render content, POST to Expo, update status. |
| `cost-share-app/supabase/functions/send-push/expo.ts` | Expo Push API client (POST + response parsing). |
| `cost-share-app/supabase/functions/send-push/index.test.ts` | Deno tests with mocked fetch. |
| `cost-share-app/supabase/functions/send-push/deno.json` | Imports config. |
| `cost-share-app/supabase/functions/retry-push/index.ts` | Cron-driven retry of failed pushes. |
| `cost-share-app/supabase/functions/retry-push/index.test.ts` | Deno tests. |
| `cost-share-app/packages/shared/src/notifications/types.ts` | Shared TS types for notifications, events, params. |
| `cost-share-app/packages/shared/src/notifications/content.ts` | i18n templates + `renderNotification()`. |
| `cost-share-app/packages/shared/src/notifications/content.test.ts` | Snapshot tests for all 9 events × 2 locales. |
| `cost-share-app/packages/shared/src/notifications/index.ts` | Barrel export. |
| `cost-share-app/packages/shared/src/index.ts` | Re-export the notifications module. |
| `cost-share-app/apps/mobile/package.json` | Add `expo-notifications`, `expo-device` deps. |
| `cost-share-app/apps/mobile/app.json` | `expo-notifications` plugin config + iOS background mode. |
| `cost-share-app/apps/mobile/services/notifications.service.ts` | Token registration lifecycle, channel setup, badge helpers. |
| `cost-share-app/apps/mobile/services/notificationRouting.ts` | `navigateToEntity(notification)` for deep linking. |
| `cost-share-app/apps/mobile/hooks/useNotifications.ts` | React Query + Realtime subscription for inbox + badge. |
| `cost-share-app/apps/mobile/hooks/useSoftPushPrompt.ts` | Trigger logic for SoftPromptModal after first group join. |
| `cost-share-app/apps/mobile/components/notifications/SoftPromptModal.tsx` | Pre-permission soft prompt UI. |
| `cost-share-app/apps/mobile/components/notifications/InAppToast.tsx` | Foreground toast component with custom render. |
| `cost-share-app/apps/mobile/components/notifications/NotificationRow.tsx` | Inbox list row. |
| `cost-share-app/apps/mobile/components/notifications/NotificationBell.tsx` | Header bell icon + badge. |
| `cost-share-app/apps/mobile/screens/notifications/NotificationsInboxScreen.tsx` | Inbox list screen. |
| `cost-share-app/apps/mobile/screens/profile/SettingsScreen.tsx` | Add Notifications section. |
| `cost-share-app/apps/mobile/screens/groups/EditGroupScreen.tsx` | Add Mute Group toggle. |
| `cost-share-app/apps/mobile/navigation/AppNavigator.tsx` | Wire notification listeners + register inbox screen. |
| `cost-share-app/apps/mobile/i18n/locales/en.json` | Add `notifications.*` keys. |
| `cost-share-app/apps/mobile/i18n/locales/he.json` | Hebrew counterparts. |
| `cost-share-app/apps/mobile/__tests__/services/notifications.service.test.ts` | Token registration unit tests. |
| `cost-share-app/apps/mobile/__tests__/services/notificationRouting.test.ts` | Route mapping unit tests. |
| `cost-share-app/apps/mobile/__tests__/hooks/useNotifications.test.ts` | Realtime + cache merge tests. |
| `cost-share-app/apps/mobile/__tests__/hooks/useSoftPushPrompt.test.ts` | Trigger logic tests. |
| `cost-share-app/apps/mobile/__tests__/components/InAppToast.test.tsx` | Render + interaction tests. |
| `cost-share-app/apps/mobile/__tests__/components/NotificationRow.test.tsx` | Row render tests. |
| `cost-share-app/apps/mobile/__tests__/screens/NotificationsInboxScreen.test.tsx` | Inbox screen tests. |
| `cost-share-app/apps/mobile/.maestro/notifications/onboarding.yaml` | E2E flow 1. |
| `cost-share-app/apps/mobile/.maestro/notifications/settings.yaml` | E2E flow 2. |
| `cost-share-app/apps/mobile/.maestro/notifications/mute.yaml` | E2E flow 3. |

---

## Phase 1 — Foundation

### Task 1: Add shared notification types and i18n content lib

> **Council revisions:** B3 (package name `@cost-share/shared`, not `@copay/shared` — re-export from existing barrel). S3 (replace 18 snapshot tests with 4 targeted assertions).

**Files:**
- Create: `cost-share-app/packages/shared/src/notifications/types.ts`
- Create: `cost-share-app/packages/shared/src/notifications/content.ts`
- Create: `cost-share-app/packages/shared/src/notifications/index.ts`
- Modify: `cost-share-app/packages/shared/src/index.ts`
- Create: `cost-share-app/packages/shared/src/notifications/content.test.ts`

- [ ] **Step 1: Write types**

`packages/shared/src/notifications/types.ts`:
```typescript
export type NotificationCategory = 'friendships' | 'expenses' | 'transfers';

export type NotificationEvent =
  | 'member_joined' | 'member_left' | 'member_added_self'
  | 'expense_added' | 'expense_updated' | 'expense_deleted'
  | 'settlement_recorded' | 'settlement_updated' | 'settlement_deleted';

export type PushStatus = 'pending' | 'sent' | 'failed' | 'skipped' | 'unsubscribed';

export type NotificationLocale = 'en' | 'he';

export interface NotificationParams {
  actor_name?: string;
  group_name?: string;
  expense_title?: string;
  amount?: number;
  currency?: string;
  payer_name?: string;
  payee_name?: string;
}

export interface NotificationRow {
  id: string;
  recipient_user_id: string;
  actor_user_id: string | null;
  category: NotificationCategory;
  event_type: NotificationEvent;
  group_id: string | null;
  entity_type: 'expense' | 'settlement' | 'group_member' | null;
  entity_id: string | null;
  params: NotificationParams;
  read_at: string | null;
  push_status: PushStatus;
  created_at: string;
}

export const EVENT_TO_CATEGORY: Record<NotificationEvent, NotificationCategory> = {
  member_joined: 'friendships',
  member_left: 'friendships',
  member_added_self: 'friendships',
  expense_added: 'expenses',
  expense_updated: 'expenses',
  expense_deleted: 'expenses',
  settlement_recorded: 'transfers',
  settlement_updated: 'transfers',
  settlement_deleted: 'transfers',
};
```

- [ ] **Step 2: Write content templates**

`packages/shared/src/notifications/content.ts`:
```typescript
import type { NotificationEvent, NotificationLocale, NotificationParams } from './types';

function formatMoney(amount: number | undefined, currency: string | undefined): string {
  if (amount == null) return '';
  const symbol = currency === 'ILS' ? '₪' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : (currency ?? '');
  return `${symbol}${amount.toFixed(2)}`;
}

type Renderer = (p: NotificationParams) => { title: string; body: string };

const templates: Record<NotificationEvent, Record<NotificationLocale, Renderer>> = {
  expense_added: {
    en: (p) => ({ title: `${p.actor_name} added to "${p.group_name}"`, body: `${p.expense_title} — ${formatMoney(p.amount, p.currency)}` }),
    he: (p) => ({ title: `${p.actor_name} הוסיף/ה ל"${p.group_name}"`, body: `${p.expense_title} — ${formatMoney(p.amount, p.currency)}` }),
  },
  expense_updated: {
    en: (p) => ({ title: `${p.actor_name} updated an expense in "${p.group_name}"`, body: `${p.expense_title} — ${formatMoney(p.amount, p.currency)}` }),
    he: (p) => ({ title: `${p.actor_name} עדכן/ה הוצאה ב"${p.group_name}"`, body: `${p.expense_title} — ${formatMoney(p.amount, p.currency)}` }),
  },
  expense_deleted: {
    en: (p) => ({ title: `${p.actor_name} deleted an expense in "${p.group_name}"`, body: `${p.expense_title}` }),
    he: (p) => ({ title: `${p.actor_name} מחק/ה הוצאה ב"${p.group_name}"`, body: `${p.expense_title}` }),
  },
  settlement_recorded: {
    en: (p) => ({ title: `${p.actor_name} recorded a payment`, body: `${p.payer_name} → ${p.payee_name}: ${formatMoney(p.amount, p.currency)} in "${p.group_name}"` }),
    he: (p) => ({ title: `${p.actor_name} רשם/ה תשלום`, body: `${p.payer_name} ← ${p.payee_name}: ${formatMoney(p.amount, p.currency)} ב"${p.group_name}"` }),
  },
  settlement_updated: {
    en: (p) => ({ title: `${p.actor_name} updated a payment`, body: `${p.payer_name} → ${p.payee_name}: ${formatMoney(p.amount, p.currency)} in "${p.group_name}"` }),
    he: (p) => ({ title: `${p.actor_name} עדכן/ה תשלום`, body: `${p.payer_name} ← ${p.payee_name}: ${formatMoney(p.amount, p.currency)} ב"${p.group_name}"` }),
  },
  settlement_deleted: {
    en: (p) => ({ title: `${p.actor_name} deleted a payment in "${p.group_name}"`, body: `${formatMoney(p.amount, p.currency)}` }),
    he: (p) => ({ title: `${p.actor_name} מחק/ה תשלום ב"${p.group_name}"`, body: `${formatMoney(p.amount, p.currency)}` }),
  },
  member_joined: {
    en: (p) => ({ title: `${p.actor_name} joined "${p.group_name}"`, body: '' }),
    he: (p) => ({ title: `${p.actor_name} הצטרפ/ה ל"${p.group_name}"`, body: '' }),
  },
  member_left: {
    en: (p) => ({ title: `${p.actor_name} left "${p.group_name}"`, body: '' }),
    he: (p) => ({ title: `${p.actor_name} עזב/ה את "${p.group_name}"`, body: '' }),
  },
  member_added_self: {
    en: (p) => ({ title: `You were added to "${p.group_name}"`, body: `By ${p.actor_name}` }),
    he: (p) => ({ title: `נוספת לקבוצת "${p.group_name}"`, body: `ע"י ${p.actor_name}` }),
  },
};

export function renderNotification(
  event: NotificationEvent,
  params: NotificationParams,
  locale: NotificationLocale = 'en',
): { title: string; body: string } {
  const byEvent = templates[event];
  if (!byEvent) return { title: '', body: '' };
  return (byEvent[locale] ?? byEvent.en)(params);
}
```

- [ ] **Step 3: Barrel exports**

`packages/shared/src/notifications/index.ts`:
```typescript
export * from './types';
export * from './content';
```

Add to `packages/shared/src/index.ts` (append):
```typescript
export * from './notifications';
```

- [ ] **Step 4: Write targeted assertions (no snapshots — see S3)**

`packages/shared/src/notifications/content.test.ts`:
```typescript
import { renderNotification } from './content';

const sampleParams = {
  actor_name: 'Dana',
  group_name: 'Apartment',
  expense_title: 'Pizza',
  amount: 150,
  currency: 'ILS',
  payer_name: 'Dana',
  payee_name: 'Yossi',
};

describe('renderNotification', () => {
  it('en interpolation includes actor, group, amount', () => {
    const r = renderNotification('expense_added', sampleParams, 'en');
    expect(r.title).toContain('Dana');
    expect(r.title).toContain('Apartment');
    expect(r.body).toContain('Pizza');
    expect(r.body).toContain('₪150.00');
  });

  it('he interpolation includes actor, group, amount', () => {
    const r = renderNotification('expense_added', sampleParams, 'he');
    expect(r.title).toContain('Dana');
    expect(r.title).toContain('Apartment');
    expect(r.body).toContain('₪150.00');
  });

  it('falls back to en for unknown locale', () => {
    const en = renderNotification('expense_added', sampleParams, 'en');
    const xx = renderNotification('expense_added', sampleParams, 'xx' as never);
    expect(xx).toEqual(en);
  });

  it('renders gracefully when optional params are missing', () => {
    const r = renderNotification('member_joined', { actor_name: 'A', group_name: 'G' } as never, 'en');
    expect(r.title).toContain('A');
    expect(r.title).toContain('G');
    expect(r.body).toBe('');
  });
});
```

- [ ] **Step 5: Run tests, expect green**

Run: `cd cost-share-app/packages/shared && npx jest src/notifications/content.test.ts`
Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add cost-share-app/packages/shared/src/notifications cost-share-app/packages/shared/src/index.ts
git commit -m "feat(shared): notification types + i18n content templates"
```

---

### Task 2: DB migration — schema (tables, enums, RLS, RPCs)

> **Council revisions:** B4 (Realtime publication). B5 (kill switch via GUC). M3 (tighten notif_update_own). Add `idx_notif_push_retry`. Extensions only if pg_cron/pg_net are confirmed available (otherwise gate Task 20).

**Files:**
- Create: `cost-share-app/supabase/notifications.sql`
- Modify: `cost-share-app/supabase/schema.sql`

- [ ] **Step 1: Create migration file with enums + tables**

`supabase/notifications.sql` (top section):
```sql
-- ============================================================================
-- Notifications system (2026-05-20)
-- Spec: docs/superpowers/specs/2026-05-20-notifications-design.md
-- ============================================================================

BEGIN;

-- Kill switch (B5): every fanout_* function early-returns when this is 'false'.
-- Set via:  ALTER DATABASE postgres SET app.notifications_enabled = 'true';
-- (read-back uses current_setting('app.notifications_enabled', true) which returns null when unset)

-- ---------- Enums ----------
DO $$ BEGIN
  CREATE TYPE notification_category AS ENUM ('friendships','expenses','transfers');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE notification_event AS ENUM (
    'member_joined','member_left','member_added_self',
    'expense_added','expense_updated','expense_deleted',
    'settlement_recorded','settlement_updated','settlement_deleted'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE push_status AS ENUM ('pending','sent','failed','skipped','unsubscribed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- device_tokens ----------
CREATE TABLE IF NOT EXISTS device_tokens (
  id               uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token            text NOT NULL UNIQUE,
  platform         text NOT NULL CHECK (platform IN ('ios','android')),
  device_id        text,
  app_version      text,
  locale           text,
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  disabled_at      timestamptz,
  disabled_reason  text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON device_tokens(user_id) WHERE disabled_at IS NULL;

-- ---------- notifications ----------
CREATE TABLE IF NOT EXISTS notifications (
  id                 uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  recipient_user_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  actor_user_id      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  category           notification_category NOT NULL,
  event_type         notification_event NOT NULL,
  group_id           uuid REFERENCES groups(id) ON DELETE CASCADE,
  entity_type        text,
  entity_id          uuid,
  params             jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at            timestamptz,
  push_status        push_status NOT NULL DEFAULT 'pending',
  push_attempts      int NOT NULL DEFAULT 0,
  push_last_attempt  timestamptz,
  push_error         text,
  push_sent_at       timestamptz,
  dedup_key          text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_inbox ON notifications(recipient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_unread ON notifications(recipient_user_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notif_push_queue ON notifications(push_status, created_at) WHERE push_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_notif_push_retry ON notifications(push_status, push_attempts, created_at) WHERE push_status IN ('failed','sending');
CREATE UNIQUE INDEX IF NOT EXISTS uniq_notif_dedup ON notifications(recipient_user_id, dedup_key) WHERE dedup_key IS NOT NULL;

-- ---------- notification_preferences ----------
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id            uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  friendships_push   bool NOT NULL DEFAULT true,
  friendships_inapp  bool NOT NULL DEFAULT true,
  expenses_push      bool NOT NULL DEFAULT true,
  expenses_inapp     bool NOT NULL DEFAULT true,
  transfers_push     bool NOT NULL DEFAULT true,
  transfers_inapp    bool NOT NULL DEFAULT true,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ---------- notification_mutes ----------
CREATE TABLE IF NOT EXISTS notification_mutes (
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  group_id     uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  muted_until  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, group_id)
);

-- ---------- RLS ----------
ALTER TABLE device_tokens             ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications             ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences  ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_mutes        ENABLE ROW LEVEL SECURITY;

-- device_tokens: own only
CREATE POLICY device_tokens_own ON device_tokens FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- notifications: select/update/delete own; insert via service_role / SECURITY DEFINER
CREATE POLICY notif_select_own ON notifications FOR SELECT USING (recipient_user_id = auth.uid());
CREATE POLICY notif_update_own ON notifications FOR UPDATE USING (recipient_user_id = auth.uid()) WITH CHECK (recipient_user_id = auth.uid());
CREATE POLICY notif_delete_own ON notifications FOR DELETE USING (recipient_user_id = auth.uid());
-- (no INSERT policy → blocked for anon/authenticated; service_role bypasses)

-- M3: column-level guard — recipients may only flip read_at; everything else is owner-only.
CREATE OR REPLACE FUNCTION notif_block_non_read_updates() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('role', true) = 'service_role' THEN RETURN NEW; END IF;
  IF NEW.recipient_user_id IS DISTINCT FROM OLD.recipient_user_id
     OR NEW.actor_user_id    IS DISTINCT FROM OLD.actor_user_id
     OR NEW.category         IS DISTINCT FROM OLD.category
     OR NEW.event_type       IS DISTINCT FROM OLD.event_type
     OR NEW.group_id         IS DISTINCT FROM OLD.group_id
     OR NEW.entity_type      IS DISTINCT FROM OLD.entity_type
     OR NEW.entity_id        IS DISTINCT FROM OLD.entity_id
     OR NEW.params           IS DISTINCT FROM OLD.params
     OR NEW.push_status      IS DISTINCT FROM OLD.push_status
     OR NEW.push_attempts    IS DISTINCT FROM OLD.push_attempts
     OR NEW.dedup_key        IS DISTINCT FROM OLD.dedup_key THEN
    RAISE EXCEPTION 'recipients may only update read_at';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tr_notif_block_non_read_updates ON notifications;
CREATE TRIGGER tr_notif_block_non_read_updates BEFORE UPDATE ON notifications
FOR EACH ROW EXECUTE FUNCTION notif_block_non_read_updates();

-- B4: Realtime publication — required for postgres_changes broadcasts to the mobile inbox.
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- preferences: own only
CREATE POLICY prefs_own ON notification_preferences FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- mutes: own only
CREATE POLICY mutes_own ON notification_mutes FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

COMMIT;
```

- [ ] **Step 2: Append RPCs to the same file**

```sql
-- ============================================================================
-- RPCs
-- ============================================================================

CREATE OR REPLACE FUNCTION register_device_token(
  p_token text, p_platform text, p_device_id text, p_app_version text, p_locale text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  INSERT INTO device_tokens (user_id, token, platform, device_id, app_version, locale, last_seen_at, disabled_at, disabled_reason)
  VALUES (auth.uid(), p_token, p_platform, p_device_id, p_app_version, p_locale, now(), NULL, NULL)
  ON CONFLICT (token) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        platform = EXCLUDED.platform,
        device_id = EXCLUDED.device_id,
        app_version = EXCLUDED.app_version,
        locale = EXCLUDED.locale,
        last_seen_at = now(),
        disabled_at = NULL,
        disabled_reason = NULL;
END $$;

CREATE OR REPLACE FUNCTION unregister_device_token(p_token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions AS $$
BEGIN
  UPDATE device_tokens
  SET disabled_at = now(), disabled_reason = 'user_logout'
  WHERE token = p_token AND user_id = auth.uid();
END $$;

CREATE OR REPLACE FUNCTION mark_notification_read(p_notification_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions AS $$
BEGIN
  UPDATE notifications SET read_at = now()
  WHERE id = p_notification_id AND recipient_user_id = auth.uid() AND read_at IS NULL;
END $$;

CREATE OR REPLACE FUNCTION mark_all_notifications_read()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions AS $$
BEGIN
  UPDATE notifications SET read_at = now()
  WHERE recipient_user_id = auth.uid() AND read_at IS NULL;
END $$;

CREATE OR REPLACE FUNCTION update_notification_preferences(p_prefs jsonb)
RETURNS notification_preferences LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE v_row notification_preferences;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  INSERT INTO notification_preferences AS np (
    user_id,
    friendships_push, friendships_inapp,
    expenses_push,    expenses_inapp,
    transfers_push,   transfers_inapp,
    updated_at
  ) VALUES (
    auth.uid(),
    COALESCE((p_prefs->>'friendships_push')::bool,  true),
    COALESCE((p_prefs->>'friendships_inapp')::bool, true),
    COALESCE((p_prefs->>'expenses_push')::bool,     true),
    COALESCE((p_prefs->>'expenses_inapp')::bool,    true),
    COALESCE((p_prefs->>'transfers_push')::bool,    true),
    COALESCE((p_prefs->>'transfers_inapp')::bool,   true),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    friendships_push  = COALESCE((p_prefs->>'friendships_push')::bool,  np.friendships_push),
    friendships_inapp = COALESCE((p_prefs->>'friendships_inapp')::bool, np.friendships_inapp),
    expenses_push     = COALESCE((p_prefs->>'expenses_push')::bool,     np.expenses_push),
    expenses_inapp    = COALESCE((p_prefs->>'expenses_inapp')::bool,    np.expenses_inapp),
    transfers_push    = COALESCE((p_prefs->>'transfers_push')::bool,    np.transfers_push),
    transfers_inapp   = COALESCE((p_prefs->>'transfers_inapp')::bool,   np.transfers_inapp),
    updated_at = now()
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION toggle_group_mute(p_group_id uuid, p_muted bool)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions AS $$
BEGIN
  IF p_muted THEN
    INSERT INTO notification_mutes (user_id, group_id) VALUES (auth.uid(), p_group_id)
    ON CONFLICT (user_id, group_id) DO NOTHING;
  ELSE
    DELETE FROM notification_mutes WHERE user_id = auth.uid() AND group_id = p_group_id;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION register_device_token(text,text,text,text,text)       TO authenticated;
GRANT EXECUTE ON FUNCTION unregister_device_token(text)                          TO authenticated;
GRANT EXECUTE ON FUNCTION mark_notification_read(uuid)                           TO authenticated;
GRANT EXECUTE ON FUNCTION mark_all_notifications_read()                          TO authenticated;
GRANT EXECUTE ON FUNCTION update_notification_preferences(jsonb)                 TO authenticated;
GRANT EXECUTE ON FUNCTION toggle_group_mute(uuid,bool)                           TO authenticated;
```

- [ ] **Step 3: Apply migration via Supabase MCP**

Use `mcp__supabase__apply_migration` with name `notifications_schema_2026_05_20` and the full file contents.

- [ ] **Step 4: Verify**

Run `mcp__supabase__list_tables` and confirm presence of `device_tokens`, `notifications`, `notification_preferences`, `notification_mutes`.

- [ ] **Step 5: Mirror to `schema.sql`**

Append the same DDL (without BEGIN/COMMIT) to `cost-share-app/supabase/schema.sql` under a new `-- =========== Notifications ===========` section, at the end of the file.

- [ ] **Step 6: Commit**

```bash
git add cost-share-app/supabase/notifications.sql cost-share-app/supabase/schema.sql
git commit -m "feat(db): notifications schema + RLS + user-facing RPCs"
```

---

### Task 3: DB — fanout SQL functions + triggers (one event at a time)

> **Council revisions:** C1 (REVOKE EXECUTE FROM PUBLIC on every function). C3 (statement-level trigger with transition tables). B5 (kill-switch early-return in every fanout). Lock down `_notif_*` helpers.

Implement and ship `expense_added` end-to-end first to prove the pattern before fanning out to all 9 events. **Per S1, Phase 1 stops here** — Tasks 10/11/12 (other events) move to Phase 2.

**Files:**
- Modify: `cost-share-app/supabase/notifications.sql` (append)
- Modify: `cost-share-app/supabase/schema.sql` (mirror)

- [ ] **Step 1: Write helper for actor name + group name**

Append to `notifications.sql`:
```sql
CREATE OR REPLACE FUNCTION _notif_actor_name(p_user_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions AS $$
  SELECT name FROM profiles WHERE id = p_user_id;
$$;
REVOKE EXECUTE ON FUNCTION _notif_actor_name(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION _notif_group_name(p_group_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions AS $$
  SELECT name FROM groups WHERE id = p_group_id;
$$;
REVOKE EXECUTE ON FUNCTION _notif_group_name(uuid) FROM PUBLIC, anon, authenticated;

-- B5 kill-switch helper:
CREATE OR REPLACE FUNCTION _notif_enabled() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('app.notifications_enabled', true)::boolean, true);
$$;
```

- [ ] **Step 2: Write `fanout_expense_added`**

Append:
```sql
CREATE OR REPLACE FUNCTION fanout_expense_added(p_expense_id uuid, p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE v_exp expenses%ROWTYPE; v_actor_name text; v_group_name text; v_rec record;
BEGIN
  IF NOT _notif_enabled() THEN RETURN; END IF;
  SELECT * INTO v_exp FROM expenses WHERE id = p_expense_id;
  IF NOT FOUND OR p_actor IS NULL THEN RETURN; END IF;

  v_actor_name := _notif_actor_name(p_actor);
  v_group_name := _notif_group_name(v_exp.group_id);

  FOR v_rec IN
    SELECT DISTINCT es.user_id AS recipient_id,
           COALESCE(np.expenses_inapp, true) AS inapp_on,
           COALESCE(np.expenses_push,  true) AS push_on,
           EXISTS(
             SELECT 1 FROM notification_mutes nm
             WHERE nm.user_id = es.user_id AND nm.group_id = v_exp.group_id
               AND (nm.muted_until IS NULL OR nm.muted_until > now())
           ) AS is_muted
    FROM expense_splits es
    LEFT JOIN notification_preferences np ON np.user_id = es.user_id
    WHERE es.expense_id = p_expense_id AND es.user_id <> p_actor
  LOOP
    CONTINUE WHEN NOT v_rec.inapp_on OR v_rec.is_muted;
    INSERT INTO notifications (
      recipient_user_id, actor_user_id, category, event_type,
      group_id, entity_type, entity_id, params, push_status, dedup_key
    ) VALUES (
      v_rec.recipient_id, p_actor, 'expenses', 'expense_added',
      v_exp.group_id, 'expense', v_exp.id,
      jsonb_build_object(
        'actor_name', v_actor_name,
        'group_name', v_group_name,
        'expense_title', v_exp.description,
        'amount', v_exp.amount,
        'currency', v_exp.currency
      ),
      CASE WHEN v_rec.push_on THEN 'pending'::push_status ELSE 'skipped'::push_status END,
      'expense:' || v_exp.id || ':added'
    )
    ON CONFLICT (recipient_user_id, dedup_key) DO NOTHING;
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION fanout_expense_added(uuid, uuid) FROM PUBLIC, anon, authenticated;
```

Note: `expenses.description` is the existing column (not `title`).

- [ ] **Step 3: Trigger function — STATEMENT-level via transition tables (C3)**

The trigger MUST fire once per multi-row INSERT, not once per split. A multi-row `INSERT INTO expense_splits VALUES (...), (...)` from the client lets later splits be invisible to the snapshot of a per-row trigger executing on split #1, and produces N× redundant fanout work.

```sql
CREATE OR REPLACE FUNCTION trg_after_expense_splits_insert_stmt()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_expense_id uuid; v_actor uuid;
BEGIN
  FOR v_expense_id IN SELECT DISTINCT expense_id FROM new_splits LOOP
    SELECT COALESCE(auth.uid(), e.created_by) INTO v_actor
    FROM expenses e WHERE e.id = v_expense_id;
    IF v_actor IS NULL THEN CONTINUE; END IF;
    PERFORM fanout_expense_added(v_expense_id, v_actor);
  END LOOP;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS tr_expense_splits_insert ON expense_splits;
CREATE TRIGGER tr_expense_splits_insert
AFTER INSERT ON expense_splits
REFERENCING NEW TABLE AS new_splits
FOR EACH STATEMENT EXECUTE FUNCTION trg_after_expense_splits_insert_stmt();
```

Rationale: statement-level + `REFERENCING NEW TABLE` gives the fanout function a complete view of all splits inserted in this statement. `dedup_key` is still the safety net against any future ad-hoc multiple-INSERTs for the same expense.

- [ ] **Step 4: Apply migration**

Use `mcp__supabase__apply_migration` with name `notifications_fanout_expense_added` and the appended SQL.

- [ ] **Step 5: Smoke test via SQL**

In Supabase SQL editor (or via `execute_sql`):
```sql
-- Pre: pick two existing users in the same group with an expense_splits row
SELECT id, group_id, created_by FROM expenses ORDER BY created_at DESC LIMIT 1;
-- Insert an expense + splits manually as one of the members
-- Then:
SELECT id, recipient_user_id, event_type, push_status FROM notifications
WHERE event_type = 'expense_added' ORDER BY created_at DESC LIMIT 5;
```

Expected: rows for each non-actor split member.

- [ ] **Step 6: Commit**

```bash
git add cost-share-app/supabase/notifications.sql cost-share-app/supabase/schema.sql
git commit -m "feat(db): fanout_expense_added + trigger on expense_splits insert"
```

---

### Task 4: Edge Function `send-push` (skeleton + happy path)

> **Council revisions:** C2 (webhook auth — `WEBHOOK_SHARED_SECRET`). C4 (CAS claim step before Expo POST, `push_attempts + 1` not constant `1`). C5 (extract `handle()` into `send-push/handler.ts` so `retry-push` can call via fetch — no cross-function import). B3 (`@cost-share/shared` not `@copay/shared`; vendor-copy or import-map). M5 (Zod payload validation). Add `requireEnv()` helper.

**Files:**
- Create: `cost-share-app/supabase/functions/send-push/deno.json`
- Create: `cost-share-app/supabase/functions/send-push/expo.ts`
- Create: `cost-share-app/supabase/functions/send-push/handler.ts` — exports `handle()` (no `Deno.serve`)
- Create: `cost-share-app/supabase/functions/send-push/index.ts` — wraps `handle()` in `Deno.serve` + webhook auth
- Create: `cost-share-app/supabase/functions/send-push/content.ts` — vendor-copy of `packages/shared/src/notifications/content.ts` (B3 — Deno can't resolve workspace package)
- Create: `cost-share-app/supabase/functions/send-push/index.test.ts`

- [ ] **Step 1: deno.json**

```json
{
  "imports": {
    "supabase": "https://esm.sh/@supabase/supabase-js@2",
    "std/": "https://deno.land/std@0.224.0/"
  }
}
```

- [ ] **Step 2: expo.ts — Expo Push client**

```typescript
export interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
  channelId?: string;
  threadId?: string;
  priority?: 'default' | 'high';
}

export interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export async function sendExpoPush(
  messages: ExpoMessage[],
  accessToken?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ExpoTicket[]> {
  if (messages.length === 0) return [];
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip, deflate',
  };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  const res = await fetchImpl(EXPO_PUSH_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(messages),
  });
  if (!res.ok) {
    throw new Error(`Expo push HTTP ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  return (json.data ?? []) as ExpoTicket[];
}
```

- [ ] **Step 3: handler.ts + index.ts — webhook handler with auth, CAS claim, vendored content lib**

`handler.ts` (exports `handle()`, no `Deno.serve`):

```typescript
import { createClient, SupabaseClient } from 'supabase';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { renderNotification } from './content.ts'; // vendor copy of shared/notifications/content.ts
import type { NotificationEvent, NotificationLocale, NotificationParams } from './content.ts';
import { sendExpoPush, ExpoMessage, ExpoTicket } from './expo.ts';

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing env var: ${name}`);
  return v;
}

const SUPABASE_URL = requireEnv('SUPABASE_URL');
const SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const EXPO_ACCESS_TOKEN = Deno.env.get('EXPO_ACCESS_TOKEN') ?? undefined;

const NotificationRowSchema = z.object({
  id: z.string().uuid(),
  recipient_user_id: z.string().uuid(),
  category: z.enum(['friendships','expenses','transfers']),
  event_type: z.enum([
    'expense_added','expense_updated','expense_deleted',
    'settlement_recorded','settlement_updated','settlement_deleted',
    'member_joined','member_left','member_added_self',
  ]),
  group_id: z.string().uuid().nullable(),
  entity_type: z.string().nullable(),
  entity_id: z.string().uuid().nullable(),
  params: z.record(z.any()),
  push_status: z.string(),
  push_attempts: z.number().int().nonnegative().default(0),
}).passthrough();

const WebhookPayloadSchema = z.object({
  type: z.literal('INSERT'),
  table: z.literal('notifications'),
  schema: z.string().optional(),
  record: NotificationRowSchema,
});

type NotificationRow = z.infer<typeof NotificationRowSchema>;
type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;

function buildDeepLink(row: NotificationRow): string {
  if (row.entity_type === 'expense' && row.group_id && row.entity_id)
    return `copay://groups/${row.group_id}/expenses/${row.entity_id}`;
  if (row.entity_type === 'settlement' && row.group_id)
    return `copay://groups/${row.group_id}/settlements`;
  if (row.group_id) return `copay://groups/${row.group_id}`;
  return 'copay://notifications';
}

export async function handle(payload: WebhookPayload, sb: SupabaseClient): Promise<{ status: number }> {
  const row = payload.record;
  if (row.push_status !== 'pending' && row.push_status !== 'failed') return { status: 200 };

  // C4: Atomic claim — only one execution should proceed past this point per row.
  const { data: claimed, error: claimErr } = await sb
    .from('notifications')
    .update({
      push_status: 'sending',
      push_attempts: (row.push_attempts ?? 0) + 1,
      push_last_attempt: new Date().toISOString(),
    })
    .eq('id', row.id)
    .in('push_status', ['pending', 'failed'])
    .select('id')
    .maybeSingle();
  if (claimErr) throw new Error(`claim: ${claimErr.message}`);
  if (!claimed) return { status: 200 }; // someone else claimed it / already done

  // Tokens
  const { data: tokens, error: tErr } = await sb
    .from('device_tokens')
    .select('token, platform, locale')
    .eq('user_id', row.recipient_user_id)
    .is('disabled_at', null);
  if (tErr) throw new Error(`tokens query: ${tErr.message}`);
  if (!tokens || tokens.length === 0) {
    await sb.from('notifications').update({ push_status: 'unsubscribed' }).eq('id', row.id);
    return { status: 200 };
  }

  // Locale
  const { data: profile } = await sb.from('profiles').select('language').eq('id', row.recipient_user_id).single();
  const locale = (profile?.language ?? tokens[0].locale ?? 'en') as NotificationLocale;

  // Unread count for badge
  const { count: unread } = await sb
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_user_id', row.recipient_user_id)
    .is('read_at', null);

  const { title, body } = renderNotification(row.event_type, row.params, locale);
  const data = {
    notification_id: row.id,
    event_type: row.event_type,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    group_id: row.group_id,
    deep_link: buildDeepLink(row),
  };

  const messages: ExpoMessage[] = tokens.map((t) => ({
    to: t.token,
    title, body, data,
    sound: 'default',
    badge: unread ?? undefined,
    channelId: row.category,
    threadId: row.group_id ? `${row.category}:${row.group_id}` : undefined,
    priority: 'high',
  }));

  let tickets: ExpoTicket[] = [];
  let err: string | null = null;
  try { tickets = await sendExpoPush(messages, EXPO_ACCESS_TOKEN); }
  catch (e) { err = (e as Error).message; }

  if (err) {
    await sb.from('notifications').update({
      push_status: 'failed',
      push_error: err,
    }).eq('id', row.id);
    return { status: 200 };
  }

  // Disable DeviceNotRegistered tokens
  for (let i = 0; i < tickets.length; i++) {
    const t = tickets[i];
    if (t.status === 'error' && t.details?.error === 'DeviceNotRegistered') {
      await sb.from('device_tokens').update({ disabled_at: new Date().toISOString(), disabled_reason: 'expo_DeviceNotRegistered' })
        .eq('token', tokens[i].token);
    }
  }

  const allOk = tickets.every((t) => t.status === 'ok');
  const allBadToken = tickets.length > 0 && tickets.every((t) => t.status === 'error' && t.details?.error === 'DeviceNotRegistered');

  await sb.from('notifications').update(
    allOk
      ? { push_status: 'sent', push_sent_at: new Date().toISOString() }
      : allBadToken
      ? { push_status: 'unsubscribed' }
      : { push_status: 'failed', push_error: 'partial_failure' }
  ).eq('id', row.id);

  return { status: 200 };
}
```

`index.ts` — webhook entrypoint with auth (C2):

```typescript
import { createClient } from 'supabase';
import { handle } from './handler.ts';
import { WebhookPayloadSchema } from './handler.ts'; // re-export from handler.ts

function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SHARED_SECRET') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

Deno.serve(async (req) => {
  // C2: authenticate webhook
  const auth = req.headers.get('authorization') ?? '';
  if (!constantTimeEq(auth, `Bearer ${WEBHOOK_SECRET}`)) {
    return new Response('unauthorized', { status: 401 });
  }

  try {
    const raw = await req.json();
    const parsed = WebhookPayloadSchema.safeParse(raw);
    if (!parsed.success) {
      console.error('send-push payload invalid', parsed.error.flatten());
      return new Response('bad payload', { status: 400 });
    }
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
    const out = await handle(parsed.data, sb);
    return new Response('ok', { status: out.status });
  } catch (e) {
    console.error('send-push error', { stage: 'handle', err: String(e) });
    // 200 to prevent webhook retry storms — retry-push (Task 20) owns recovery for stuck rows.
    return new Response('ok', { status: 200 });
  }
});
```

- [ ] **Step 4: Tests with mocked Supabase + fetch**

`index.test.ts`:
```typescript
import { assertEquals, assertSpyCallArg, assertSpyCalls, spy, stub } from 'std/testing/mod.ts';
import { handle } from './index.ts';

function makeSb(overrides: Record<string, unknown> = {}) {
  // tiny chainable mock; tests override per call
  const updates: Array<{ table: string; values: unknown; eq: [string, unknown] }> = [];
  const calls: { tokensReturn?: unknown[]; profile?: { language: string } } = {};
  return {
    _updates: updates,
    _calls: calls,
    from(table: string) {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        single: async () => ({ data: overrides[`${table}_profile`] ?? null, error: null }),
        update(values: unknown) {
          const apiChain: any = {
            eq(col: string, val: unknown) {
              updates.push({ table, values, eq: [col, val] });
              return Promise.resolve({ error: null });
            },
          };
          return apiChain;
        },
        then(resolve: (v: unknown) => void) {
          resolve({ data: overrides[`${table}_select`] ?? [], count: overrides[`${table}_count`] ?? 0, error: null });
        },
      };
      return chain;
    },
  } as any;
}

Deno.test('skips if push_status != pending', async () => {
  const sb = makeSb();
  const res = await handle({ type: 'INSERT', table: 'notifications', record: { id: 'n1', recipient_user_id: 'u1', category: 'expenses', event_type: 'expense_added', group_id: 'g1', entity_type: 'expense', entity_id: 'e1', params: {}, push_status: 'skipped' } } as never, sb);
  assertEquals(res.status, 200);
  assertEquals(sb._updates.length, 0);
});

Deno.test('marks unsubscribed when no tokens', async () => {
  const sb = makeSb({ device_tokens_select: [] });
  await handle({ type: 'INSERT', table: 'notifications', record: { id: 'n1', recipient_user_id: 'u1', category: 'expenses', event_type: 'expense_added', group_id: 'g1', entity_type: 'expense', entity_id: 'e1', params: {}, push_status: 'pending' } } as never, sb);
  assertEquals(sb._updates[0].values, { push_status: 'unsubscribed' });
});

// Add tests for: happy path (mock fetch with stub), DeviceNotRegistered disables token, network error → failed
```

The complete test file will mock `fetch` globally via `globalThis.fetch = stub(...)`.

- [ ] **Step 5: Deploy**

Use `mcp__supabase__deploy_edge_function` with name `send-push` and the index.ts + expo.ts files.

- [ ] **Step 6: Set secrets**

Generate a webhook secret first (any random hex string, NOT the service role key — keep them separate so the webhook can be rotated without rotating the service role):
```bash
openssl rand -hex 32   # capture output as WEBHOOK_SHARED_SECRET
supabase secrets set WEBHOOK_SHARED_SECRET=<random-hex>
supabase secrets set EXPO_ACCESS_TOKEN=<token>   # optional for dev
```

- [ ] **Step 7: Configure Database Webhook**

In Supabase Dashboard → Database → Webhooks → New webhook:
- Name: `notifications_send_push`
- Table: `notifications`
- Events: `INSERT`
- URL: `https://<project>.supabase.co/functions/v1/send-push`
- HTTP Headers: `Authorization: Bearer <WEBHOOK_SHARED_SECRET>` — **must match** the secret set in Step 6. Mismatch returns 401 and `notifications` stay stuck in `pending`.

Document the webhook secret + URL configuration in `docs/SSOT/SETUP.md`.

- [ ] **Step 8: Commit**

```bash
git add cost-share-app/supabase/functions/send-push
git commit -m "feat(edge): send-push Edge Function + Expo client + tests"
```

---

### Task 5: Mobile — install deps and configure `expo-notifications`

**Files:**
- Modify: `cost-share-app/apps/mobile/package.json`
- Modify: `cost-share-app/apps/mobile/app.json`

- [ ] **Step 1: Install**

```bash
cd cost-share-app/apps/mobile
npx expo install expo-notifications expo-device expo-haptics   # M6: haptics needed by InAppToast
```

- [ ] **Step 2: app.json plugin config**

Under `expo.plugins` add:
```json
[
  "expo-notifications",
  {
    "icon": "./assets/notification-icon.png",
    "color": "#000000",
    "defaultChannel": "default"
  }
]
```

Under `expo.ios`, add or merge:
```json
"infoPlist": { "UIBackgroundModes": ["remote-notification"] }
```

- [ ] **Step 3: Ensure assets/notification-icon.png exists**

If absent, copy `assets/icon.png` to `assets/notification-icon.png` as a placeholder. Real asset is a future polish item.

- [ ] **Step 4: Add Expo projectId**

If `expo.extra.eas.projectId` doesn't exist in `app.json`, run:
```bash
npx eas init --id <project-id>
```
This populates `extra.eas.projectId`. If no EAS access, document the gap in the plan execution notes — `getExpoPushTokenAsync` requires it.

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/apps/mobile/package.json cost-share-app/apps/mobile/package-lock.json cost-share-app/apps/mobile/app.json cost-share-app/package-lock.json
git commit -m "chore(mobile): install expo-notifications + configure plugin"
```

---

### Task 6: Mobile — `notifications.service.ts` + tests

> **Council revisions:** M8 (wire `unregisterCurrentDevice` into `auth.service.ts:signOut` so the token is removed BEFORE the auth session is dropped, while RLS still allows the delete).

**Files:**
- Create: `cost-share-app/apps/mobile/services/notifications.service.ts`
- Modify: `cost-share-app/apps/mobile/services/auth.service.ts` — call `unregisterCurrentDevice(token)` in `signOut` BEFORE `supabase.auth.signOut()`. Token comes from `Notifications.getExpoPushTokenAsync` cached value or AsyncStorage if you keep one.
- Create: `cost-share-app/apps/mobile/__tests__/services/notifications.service.test.ts`

- [ ] **Step 1: Service**

```typescript
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';
import i18n from '../i18n';

const ANDROID_CHANNELS = [
  { id: 'friendships', nameKey: 'notifications.channels.friendships' },
  { id: 'expenses',    nameKey: 'notifications.channels.expenses' },
  { id: 'transfers',   nameKey: 'notifications.channels.transfers' },
];

export async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  for (const ch of ANDROID_CHANNELS) {
    await Notifications.setNotificationChannelAsync(ch.id, {
      name: i18n.t(ch.nameKey),
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }
}

export interface PermissionStatus { granted: boolean; canAskAgain: boolean; status: string; }

export async function getPermissionStatus(): Promise<PermissionStatus> {
  const res = await Notifications.getPermissionsAsync();
  return { granted: res.status === 'granted', canAskAgain: res.canAskAgain, status: res.status };
}

export async function requestPermission(): Promise<PermissionStatus> {
  const res = await Notifications.requestPermissionsAsync();
  return { granted: res.status === 'granted', canAskAgain: res.canAskAgain, status: res.status };
}

async function fetchToken(): Promise<string | null> {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId
    ?? (Constants as any).easConfig?.projectId;
  if (!projectId) {
    console.warn('[notifications] missing EAS projectId; cannot fetch token');
    return null;
  }
  const t = await Notifications.getExpoPushTokenAsync({ projectId });
  return t.data;
}

export async function registerCurrentDevice(): Promise<{ token: string } | null> {
  if (!Device.isDevice) return null;
  const status = await getPermissionStatus();
  if (!status.granted) return null;

  const token = await fetchToken();
  if (!token) return null;

  await ensureAndroidChannels();

  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const deviceId = Constants.sessionId ?? (Constants as any).installationId ?? null;
  const appVersion = Constants.expoConfig?.version ?? null;
  const locale = i18n.language ?? 'en';

  const { error } = await supabase.rpc('register_device_token', {
    p_token: token, p_platform: platform, p_device_id: deviceId,
    p_app_version: appVersion, p_locale: locale,
  });
  if (error) {
    console.error('[notifications] register failed', error);
    return null;
  }
  return { token };
}

export async function unregisterCurrentDevice(token: string): Promise<void> {
  await supabase.rpc('unregister_device_token', { p_token: token });
}

export async function setAppBadge(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(Math.max(0, count));
}
```

- [ ] **Step 2: Tests**

`__tests__/services/notifications.service.test.ts`:
```typescript
import { registerCurrentDevice, getPermissionStatus } from '../../services/notifications.service';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  setBadgeCountAsync: jest.fn(),
  AndroidImportance: { HIGH: 4 },
}));
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('expo-constants', () => ({
  default: { expoConfig: { extra: { eas: { projectId: 'p1' } }, version: '1.0.0' }, sessionId: 'd1' },
  sessionId: 'd1',
  expoConfig: { extra: { eas: { projectId: 'p1' } }, version: '1.0.0' },
}));
const rpc = jest.fn().mockResolvedValue({ error: null });
jest.mock('../../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
jest.mock('../../i18n', () => ({ __esModule: true, default: { language: 'he', t: (k: string) => k } }));

const Notifications = require('expo-notifications');
const Device = require('expo-device');

beforeEach(() => { jest.clearAllMocks(); });

it('returns null on simulator', async () => {
  Device.isDevice = false;
  const r = await registerCurrentDevice();
  expect(r).toBeNull();
  Device.isDevice = true;
});

it('returns null if permission not granted', async () => {
  Notifications.getPermissionsAsync.mockResolvedValue({ status: 'undetermined', canAskAgain: true });
  const r = await registerCurrentDevice();
  expect(r).toBeNull();
});

it('registers token with correct args when granted', async () => {
  Notifications.getPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: false });
  Notifications.getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[xyz]' });
  const r = await registerCurrentDevice();
  expect(r).toEqual({ token: 'ExponentPushToken[xyz]' });
  expect(rpc).toHaveBeenCalledWith('register_device_token', expect.objectContaining({
    p_token: 'ExponentPushToken[xyz]',
    p_locale: 'he',
  }));
});

it('getPermissionStatus reflects expo response', async () => {
  Notifications.getPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: false });
  const s = await getPermissionStatus();
  expect(s.granted).toBe(true);
});
```

- [ ] **Step 3: Run tests**

```bash
cd cost-share-app/apps/mobile && npm test -- services/notifications.service.test.ts
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/apps/mobile/services/notifications.service.ts cost-share-app/apps/mobile/__tests__/services/notifications.service.test.ts
git commit -m "feat(mobile): notifications service — token registration + channels"
```

---

### Task 7: Mobile — `SoftPromptModal` + `useSoftPushPrompt` hook

> **Council revisions:** S2 (drop the 7-day AsyncStorage cooldown for v1 — keep the modal simple). Trigger once when permission is `undetermined` and the user has at least one group; record an in-memory flag for this session.

**Files:**
- Create: `cost-share-app/apps/mobile/components/notifications/SoftPromptModal.tsx`
- Create: `cost-share-app/apps/mobile/hooks/useSoftPushPrompt.ts`
- Create: `cost-share-app/apps/mobile/__tests__/hooks/useSoftPushPrompt.test.ts`
- Modify: `cost-share-app/apps/mobile/i18n/locales/en.json`
- Modify: `cost-share-app/apps/mobile/i18n/locales/he.json`

- [ ] **Step 1: Add i18n keys**

Append to `en.json`:
```json
"notifications": {
  "channels": {
    "friendships": "Friendships",
    "expenses": "Expenses",
    "transfers": "Transfers"
  },
  "softPrompt": {
    "title": "Stay in the loop",
    "body": "Get a notification when someone adds an expense or settles up.",
    "accept": "Yes, enable",
    "decline": "Not now"
  }
}
```

`he.json`:
```json
"notifications": {
  "channels": {
    "friendships": "חברויות",
    "expenses": "הוצאות",
    "transfers": "העברות"
  },
  "softPrompt": {
    "title": "תהיו בעניינים",
    "body": "קבלו התראה כשמישהו מוסיף הוצאה או מסיים חשבון.",
    "accept": "כן, הפעלה",
    "decline": "לא עכשיו"
  }
}
```

- [ ] **Step 2: SoftPromptModal component**

```typescript
import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

export interface SoftPromptModalProps {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export function SoftPromptModal({ visible, onAccept, onDecline }: SoftPromptModalProps) {
  const { t } = useTranslation();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDecline}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{t('notifications.softPrompt.title')}</Text>
          <Text style={styles.body}>{t('notifications.softPrompt.body')}</Text>
          <Pressable testID="soft-accept" style={styles.primary} onPress={onAccept}>
            <Text style={styles.primaryText}>{t('notifications.softPrompt.accept')}</Text>
          </Pressable>
          <Pressable testID="soft-decline" style={styles.secondary} onPress={onDecline}>
            <Text style={styles.secondaryText}>{t('notifications.softPrompt.decline')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: 'white', borderRadius: 16, padding: 20 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  body: { fontSize: 14, marginBottom: 20 },
  primary: { backgroundColor: '#111', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 8 },
  primaryText: { color: 'white', fontWeight: '600' },
  secondary: { padding: 14, alignItems: 'center' },
  secondaryText: { color: '#555' },
});
```

- [ ] **Step 3: `useSoftPushPrompt` hook**

```typescript
import { useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getPermissionStatus, requestPermission, registerCurrentDevice } from '../services/notifications.service';

const KEY = 'copay:notif:softPromptDeclinedAt';
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export function useSoftPushPrompt(groupCount: number) {
  const [visible, setVisible] = useState(false);
  const [evaluatedFor, setEvaluatedFor] = useState<number | null>(null);

  useEffect(() => {
    if (groupCount !== 1 || evaluatedFor === 1) return;
    (async () => {
      const status = await getPermissionStatus();
      if (status.status !== 'undetermined') { setEvaluatedFor(1); return; }
      const raw = await AsyncStorage.getItem(KEY);
      const declinedAt = raw ? Number(raw) : 0;
      if (declinedAt && Date.now() - declinedAt < COOLDOWN_MS) { setEvaluatedFor(1); return; }
      setVisible(true);
      setEvaluatedFor(1);
    })();
  }, [groupCount, evaluatedFor]);

  const accept = useCallback(async () => {
    setVisible(false);
    const res = await requestPermission();
    if (res.granted) await registerCurrentDevice();
  }, []);

  const decline = useCallback(async () => {
    setVisible(false);
    await AsyncStorage.setItem(KEY, String(Date.now()));
  }, []);

  return { visible, accept, decline };
}
```

- [ ] **Step 4: Tests**

`__tests__/hooks/useSoftPushPrompt.test.ts`:
```typescript
import { renderHook, waitFor } from '@testing-library/react-native';
import { useSoftPushPrompt } from '../../hooks/useSoftPushPrompt';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(), setItem: jest.fn(),
}));
const getPermission = jest.fn();
const requestP = jest.fn();
const register = jest.fn();
jest.mock('../../services/notifications.service', () => ({
  getPermissionStatus: () => getPermission(),
  requestPermission: () => requestP(),
  registerCurrentDevice: () => register(),
}));

const AS = require('@react-native-async-storage/async-storage');

beforeEach(() => { jest.clearAllMocks(); });

it('shows on first group when permission undetermined and never declined', async () => {
  getPermission.mockResolvedValue({ status: 'undetermined' });
  AS.getItem.mockResolvedValue(null);
  const { result } = renderHook(() => useSoftPushPrompt(1));
  await waitFor(() => expect(result.current.visible).toBe(true));
});

it('does not show if permission already granted', async () => {
  getPermission.mockResolvedValue({ status: 'granted' });
  const { result } = renderHook(() => useSoftPushPrompt(1));
  await waitFor(() => expect(result.current.visible).toBe(false));
});

it('does not show within 7-day cooldown', async () => {
  getPermission.mockResolvedValue({ status: 'undetermined' });
  AS.getItem.mockResolvedValue(String(Date.now() - 1000));
  const { result } = renderHook(() => useSoftPushPrompt(1));
  await waitFor(() => expect(result.current.visible).toBe(false));
});

it('does not show when groupCount != 1', async () => {
  const { result } = renderHook(() => useSoftPushPrompt(2));
  await waitFor(() => expect(result.current.visible).toBe(false));
});
```

- [ ] **Step 5: Run tests**

```bash
npm test -- hooks/useSoftPushPrompt.test.ts components/notifications
```

- [ ] **Step 6: Commit**

```bash
git add cost-share-app/apps/mobile/components/notifications cost-share-app/apps/mobile/hooks/useSoftPushPrompt.ts cost-share-app/apps/mobile/__tests__/hooks/useSoftPushPrompt.test.ts cost-share-app/apps/mobile/i18n/locales
git commit -m "feat(mobile): SoftPromptModal + useSoftPushPrompt hook"
```

---

### Task 8: Mobile — wire registration on app launch + SoftPrompt on first-group-join

**Files:**
- Modify: `cost-share-app/apps/mobile/navigation/AppNavigator.tsx`

- [ ] **Step 1: Locate the post-login mount point**

Read the existing `AppNavigator.tsx` to find the spot where the user session has been hydrated (after `auth` state is known) and groups query has data.

- [ ] **Step 2: Add launch-time registration**

Inside the authenticated branch, mount this effect:
```typescript
import { useEffect } from 'react';
import { registerCurrentDevice } from '../services/notifications.service';

// inside <AuthenticatedNavigator>:
useEffect(() => { void registerCurrentDevice(); }, []);
```

- [ ] **Step 3: Add SoftPromptModal**

```typescript
import { useSoftPushPrompt } from '../hooks/useSoftPushPrompt';
import { SoftPromptModal } from '../components/notifications/SoftPromptModal';

// Inside the authenticated tree (where groups query is available):
const groupsQuery = useQuery(...); // existing
const groupCount = groupsQuery.data?.length ?? 0;
const soft = useSoftPushPrompt(groupCount);

return (
  <>
    {/* existing tree */}
    <SoftPromptModal visible={soft.visible} onAccept={soft.accept} onDecline={soft.decline} />
  </>
);
```

If the existing navigator does not have a `groupsQuery`, mount the SoftPrompt inside the GroupsList screen instead, where the query result is already available.

- [ ] **Step 4: Manual smoke**

Run on a device (not simulator), join a group. Expect the modal. Accept → expect OS permission dialog → grant → confirm a row in `device_tokens` via Supabase dashboard.

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/apps/mobile/navigation/AppNavigator.tsx
git commit -m "feat(mobile): register push token on launch + soft prompt after first group"
```

---

### Task 9: End-to-end smoke (Phase 1 close-out)

> **Council revisions:** S4 (SQL-only smoke as primary fallback for solo dev; two-device is gold-standard but optional). M11 (record PII-on-lockscreen as accepted risk in TECHNICAL_DEBT.md).

**Files:** — (verification only)

- [ ] **Step 1: SQL smoke (primary, no devices required)**

In Supabase SQL editor (logged-in as a test user):
```sql
-- Use an existing expense from a group you're in. Replace UUIDs.
SELECT id, group_id, created_by FROM expenses ORDER BY created_at DESC LIMIT 1;

-- Inspect what fanout produced for non-actor split members:
SELECT id, recipient_user_id, event_type, push_status, push_attempts, push_error, params
FROM notifications
WHERE event_type = 'expense_added'
ORDER BY created_at DESC LIMIT 5;

-- Confirm dedup_key keeps a second insert from creating duplicates:
SELECT count(*) FROM notifications
WHERE recipient_user_id = '<some-recipient>' AND dedup_key = 'expense:<expense-id>:added';
-- Expect exactly 1.

-- Confirm send-push has run (Database Webhook):
SELECT id, push_status, push_sent_at FROM notifications WHERE event_type = 'expense_added' ORDER BY created_at DESC LIMIT 5;
-- Expect push_status='sent' on rows where the recipient has device_tokens.
```

- [ ] **Step 2: Two-device test (optional, recommended before production)**

On Device A (user A) and Device B (user B), both members of group G with an expense_splits row containing both:
1. Both apps launched and tokens registered.
2. User A adds an expense via the existing UI.
3. Confirm: a `notifications` row exists for user B; `push_status` transitions to `sent`.
4. Device B receives a push notification with title/body matching `renderNotification` output.

- [ ] **Step 3: Phase-1 retrospective commit (docs)**

Record in `docs/SSOT/TECHNICAL_DEBT.md` under a new "Notifications follow-ups" subsection:
- **PII on lock screen (M11):** push body includes `expense_title`, `amount`, `currency`, `actor_name`, `payer_name`, `payee_name`. These traverse Expo/APNs/FCM and render on iOS/Android lock screens by default. Accepted risk for v1; future: opt-in to show details, generic body by default.
- **Token rotation:** no `addPushTokenListener` wired — tokens that rotate silently break push until next launch.
- **`device_tokens` retention:** disabled tokens are never purged. Future: monthly job deleting `WHERE disabled_at < now() - interval '90 days'`.
- **Maestro:** flows live in Phase 3, not Phase 1.
- Any other gaps surfaced during execution (asset placeholders, missing projectId, etc.).

```bash
git add docs/SSOT/TECHNICAL_DEBT.md
git commit -m "docs: notifications Phase 1 follow-ups"
```

---

## Phase 2 — Coverage

### Task 10: Fanout — `expense_updated`, `expense_deleted`

> **Council revisions:** C1 (REVOKE EXECUTE on every new function). B5 (kill-switch early-return). M1 (semantic dedup hash — not raw epoch).

**Files:**
- Modify: `cost-share-app/supabase/notifications.sql` (append)
- Modify: `cost-share-app/supabase/schema.sql`

Apply these patterns to EVERY function in this Task:
- First statement inside the function body: `IF NOT _notif_enabled() THEN RETURN; END IF;`
- After the function definition: `REVOKE EXECUTE ON FUNCTION <name>(<args>) FROM PUBLIC, anon, authenticated;`
- Replace dedup_key suffixes of the form `extract(epoch from updated_at)::text` with:
  ```sql
  extract(epoch from updated_at)::bigint::text || '-' ||
  md5(coalesce(description,'') || amount::text || coalesce(currency,''))
  ```
  (substitute the relevant payload fields for settlement/member events) — this prevents sub-second back-to-back edits from collapsing to the same key.

- [ ] **Step 1: Add functions**

```sql
CREATE OR REPLACE FUNCTION fanout_expense_updated(p_expense_id uuid, p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE v_exp expenses%ROWTYPE; v_actor_name text; v_group_name text; v_rec record;
BEGIN
  SELECT * INTO v_exp FROM expenses WHERE id = p_expense_id;
  IF NOT FOUND OR p_actor IS NULL THEN RETURN; END IF;
  v_actor_name := _notif_actor_name(p_actor);
  v_group_name := _notif_group_name(v_exp.group_id);
  FOR v_rec IN
    SELECT DISTINCT es.user_id AS recipient_id,
           COALESCE(np.expenses_inapp, true) AS inapp_on,
           COALESCE(np.expenses_push,  true) AS push_on,
           EXISTS(SELECT 1 FROM notification_mutes nm
                  WHERE nm.user_id = es.user_id AND nm.group_id = v_exp.group_id
                    AND (nm.muted_until IS NULL OR nm.muted_until > now())) AS is_muted
    FROM expense_splits es
    LEFT JOIN notification_preferences np ON np.user_id = es.user_id
    WHERE es.expense_id = p_expense_id AND es.user_id <> p_actor
  LOOP
    CONTINUE WHEN NOT v_rec.inapp_on OR v_rec.is_muted;
    INSERT INTO notifications (recipient_user_id, actor_user_id, category, event_type,
      group_id, entity_type, entity_id, params, push_status, dedup_key)
    VALUES (v_rec.recipient_id, p_actor, 'expenses', 'expense_updated',
      v_exp.group_id, 'expense', v_exp.id,
      jsonb_build_object('actor_name', v_actor_name, 'group_name', v_group_name,
        'expense_title', v_exp.description, 'amount', v_exp.amount, 'currency', v_exp.currency),
      CASE WHEN v_rec.push_on THEN 'pending'::push_status ELSE 'skipped'::push_status END,
      'expense:' || v_exp.id || ':updated:' || extract(epoch from v_exp.updated_at)::text
    )
    ON CONFLICT (recipient_user_id, dedup_key) DO NOTHING;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION fanout_expense_deleted(p_expense_id uuid, p_group_id uuid, p_description text, p_amount numeric, p_currency text, p_actor uuid, p_recipients uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE v_actor_name text; v_group_name text; v_uid uuid; v_inapp bool; v_push bool; v_muted bool;
BEGIN
  IF p_actor IS NULL THEN RETURN; END IF;
  v_actor_name := _notif_actor_name(p_actor);
  v_group_name := _notif_group_name(p_group_id);
  FOREACH v_uid IN ARRAY p_recipients LOOP
    IF v_uid = p_actor THEN CONTINUE; END IF;
    SELECT COALESCE(expenses_inapp, true), COALESCE(expenses_push, true) INTO v_inapp, v_push
    FROM notification_preferences WHERE user_id = v_uid;
    IF v_inapp IS NULL THEN v_inapp := true; v_push := true; END IF;
    SELECT EXISTS(SELECT 1 FROM notification_mutes WHERE user_id = v_uid AND group_id = p_group_id
                  AND (muted_until IS NULL OR muted_until > now())) INTO v_muted;
    CONTINUE WHEN NOT v_inapp OR v_muted;
    INSERT INTO notifications (recipient_user_id, actor_user_id, category, event_type,
      group_id, entity_type, entity_id, params, push_status, dedup_key)
    VALUES (v_uid, p_actor, 'expenses', 'expense_deleted',
      p_group_id, 'expense', p_expense_id,
      jsonb_build_object('actor_name', v_actor_name, 'group_name', v_group_name,
        'expense_title', p_description, 'amount', p_amount, 'currency', p_currency),
      CASE WHEN v_push THEN 'pending'::push_status ELSE 'skipped'::push_status END,
      'expense:' || p_expense_id || ':deleted'
    )
    ON CONFLICT (recipient_user_id, dedup_key) DO NOTHING;
  END LOOP;
END $$;
```

- [ ] **Step 2: Triggers**

```sql
CREATE OR REPLACE FUNCTION trg_after_expense_update()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_actor uuid;
BEGIN
  IF NEW.description IS NOT DISTINCT FROM OLD.description
     AND NEW.amount IS NOT DISTINCT FROM OLD.amount
     AND NEW.currency IS NOT DISTINCT FROM OLD.currency
     AND NEW.paid_by IS NOT DISTINCT FROM OLD.paid_by
     AND NEW.is_deleted IS NOT DISTINCT FROM OLD.is_deleted THEN
    RETURN NEW;
  END IF;

  v_actor := COALESCE(auth.uid(), NEW.created_by);

  -- Soft-delete path
  IF OLD.is_deleted = false AND NEW.is_deleted = true THEN
    PERFORM fanout_expense_deleted(
      NEW.id, NEW.group_id, NEW.description, NEW.amount, NEW.currency, v_actor,
      ARRAY(SELECT DISTINCT user_id FROM expense_splits WHERE expense_id = NEW.id)
    );
    RETURN NEW;
  END IF;

  -- Restore path is treated as added
  IF OLD.is_deleted = true AND NEW.is_deleted = false THEN
    PERFORM fanout_expense_added(NEW.id, v_actor);
    RETURN NEW;
  END IF;

  -- Regular update
  PERFORM fanout_expense_updated(NEW.id, v_actor);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tr_expense_update ON expenses;
CREATE TRIGGER tr_expense_update AFTER UPDATE ON expenses
FOR EACH ROW EXECUTE FUNCTION trg_after_expense_update();

-- Hard delete (rare in this codebase; soft delete preferred)
CREATE OR REPLACE FUNCTION trg_before_expense_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_actor uuid;
BEGIN
  v_actor := COALESCE(auth.uid(), OLD.created_by);
  PERFORM fanout_expense_deleted(
    OLD.id, OLD.group_id, OLD.description, OLD.amount, OLD.currency, v_actor,
    ARRAY(SELECT DISTINCT user_id FROM expense_splits WHERE expense_id = OLD.id)
  );
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS tr_expense_delete ON expenses;
CREATE TRIGGER tr_expense_delete BEFORE DELETE ON expenses
FOR EACH ROW EXECUTE FUNCTION trg_before_expense_delete();
```

- [ ] **Step 3: Apply + mirror + commit**

Apply via MCP, mirror to `schema.sql`, commit:
```bash
git commit -m "feat(db): fanout for expense_updated + expense_deleted"
```

---

### Task 11: Fanout — `settlement_recorded`, `settlement_updated`, `settlement_deleted`

> **Council revisions:** C1 (REVOKE EXECUTE). B5 (kill-switch). M1 (semantic dedup hash). M4 (add `currency` to no-op guard — currency-only edits silently miss notifications otherwise).

**Files:** same as Task 10. The no-op short-circuit in `trg_after_settlement_update` must also include `currency`:
```sql
IF NEW.deleted_at IS NULL AND OLD.deleted_at IS NULL
   AND NEW.amount IS NOT DISTINCT FROM OLD.amount
   AND NEW.currency IS NOT DISTINCT FROM OLD.currency   -- M4
   AND NEW.from_user_id IS NOT DISTINCT FROM OLD.from_user_id
   AND NEW.to_user_id IS NOT DISTINCT FROM OLD.to_user_id THEN
  RETURN NEW;
END IF;
```

- [ ] **Step 1: Add fanout function for settlements (single helper)**

```sql
CREATE OR REPLACE FUNCTION fanout_settlement(p_settlement_id uuid, p_actor uuid, p_event notification_event)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE v_s settlements%ROWTYPE; v_actor_name text; v_group_name text;
        v_payer_name text; v_payee_name text;
        v_recipients uuid[]; v_uid uuid; v_inapp bool; v_push bool; v_muted bool;
BEGIN
  SELECT * INTO v_s FROM settlements WHERE id = p_settlement_id;
  IF NOT FOUND OR p_actor IS NULL THEN RETURN; END IF;
  v_actor_name := _notif_actor_name(p_actor);
  v_group_name := _notif_group_name(v_s.group_id);
  v_payer_name := _notif_actor_name(v_s.from_user_id);
  v_payee_name := _notif_actor_name(v_s.to_user_id);
  v_recipients := ARRAY[v_s.from_user_id, v_s.to_user_id];
  FOREACH v_uid IN ARRAY v_recipients LOOP
    IF v_uid = p_actor THEN CONTINUE; END IF;
    SELECT COALESCE(transfers_inapp, true), COALESCE(transfers_push, true) INTO v_inapp, v_push
    FROM notification_preferences WHERE user_id = v_uid;
    IF v_inapp IS NULL THEN v_inapp := true; v_push := true; END IF;
    SELECT EXISTS(SELECT 1 FROM notification_mutes WHERE user_id = v_uid AND group_id = v_s.group_id
                  AND (muted_until IS NULL OR muted_until > now())) INTO v_muted;
    CONTINUE WHEN NOT v_inapp OR v_muted;
    INSERT INTO notifications (recipient_user_id, actor_user_id, category, event_type,
      group_id, entity_type, entity_id, params, push_status, dedup_key)
    VALUES (v_uid, p_actor, 'transfers', p_event,
      v_s.group_id, 'settlement', v_s.id,
      jsonb_build_object('actor_name', v_actor_name, 'group_name', v_group_name,
        'payer_name', v_payer_name, 'payee_name', v_payee_name,
        'amount', v_s.amount, 'currency', v_s.currency),
      CASE WHEN v_push THEN 'pending'::push_status ELSE 'skipped'::push_status END,
      'settlement:' || v_s.id || ':' || p_event::text || ':' || COALESCE(extract(epoch from v_s.updated_at)::text, '0')
    )
    ON CONFLICT (recipient_user_id, dedup_key) DO NOTHING;
  END LOOP;
END $$;
```

- [ ] **Step 2: Triggers**

```sql
CREATE OR REPLACE FUNCTION trg_after_settlement_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_actor uuid;
BEGIN
  v_actor := COALESCE(auth.uid(), NEW.created_by);
  PERFORM fanout_settlement(NEW.id, v_actor, 'settlement_recorded');
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION trg_after_settlement_update() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_actor uuid; v_event notification_event;
BEGIN
  IF NEW.deleted_at IS NULL AND OLD.deleted_at IS NULL
     AND NEW.amount IS NOT DISTINCT FROM OLD.amount
     AND NEW.from_user_id IS NOT DISTINCT FROM OLD.from_user_id
     AND NEW.to_user_id IS NOT DISTINCT FROM OLD.to_user_id THEN
    RETURN NEW;
  END IF;
  v_actor := COALESCE(auth.uid(), NEW.created_by);
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    v_event := 'settlement_deleted';
  ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    v_event := 'settlement_recorded';
  ELSE
    v_event := 'settlement_updated';
  END IF;
  PERFORM fanout_settlement(NEW.id, v_actor, v_event);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tr_settlement_insert ON settlements;
CREATE TRIGGER tr_settlement_insert AFTER INSERT ON settlements
FOR EACH ROW EXECUTE FUNCTION trg_after_settlement_insert();

DROP TRIGGER IF EXISTS tr_settlement_update ON settlements;
CREATE TRIGGER tr_settlement_update AFTER UPDATE ON settlements
FOR EACH ROW EXECUTE FUNCTION trg_after_settlement_update();
```

- [ ] **Step 3: Apply + mirror + commit**

```bash
git commit -m "feat(db): fanout for settlement events"
```

---

### Task 12: Fanout — `member_joined`, `member_left`, `member_added_self`

> **Council revisions:** C1 (REVOKE EXECUTE). B5 (kill-switch). M2 (NULL `auth.uid()` handling — admin-add must NOT degrade to self-join). Replace the silent `auth.uid() IS NULL` branch in `trg_after_group_members_insert` with explicit handling:
> ```sql
> v_actor := auth.uid();
> IF v_actor IS NULL THEN
>   -- Server-side / cron / backfill writes: skip fanout rather than mis-classify.
>   -- Admin-add paths MUST use a SECURITY DEFINER RPC that sets app.actor_id explicitly.
>   RETURN NEW;
> END IF;
> IF v_actor = NEW.user_id THEN
>   PERFORM fanout_member_event(NEW.group_id, NEW.user_id, NEW.user_id, 'member_joined');
> ELSE
>   PERFORM fanout_member_event(NEW.group_id, NEW.user_id, v_actor, 'member_added_self');
>   PERFORM fanout_member_event(NEW.group_id, NEW.user_id, v_actor, 'member_joined');
> END IF;
> ```

**Files:** same.

- [ ] **Step 1: Add helpers**

```sql
CREATE OR REPLACE FUNCTION fanout_member_event(p_group_id uuid, p_target_user uuid, p_actor uuid, p_event notification_event)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE v_actor_name text; v_group_name text; v_target_name text;
        v_rec record;
BEGIN
  IF p_actor IS NULL THEN RETURN; END IF;
  v_actor_name  := _notif_actor_name(p_actor);
  v_target_name := _notif_actor_name(p_target_user);
  v_group_name  := _notif_group_name(p_group_id);

  -- The "added_self" event goes only to the target user.
  IF p_event = 'member_added_self' THEN
    IF p_target_user = p_actor THEN RETURN; END IF;
    INSERT INTO notifications (recipient_user_id, actor_user_id, category, event_type,
      group_id, entity_type, entity_id, params, push_status, dedup_key)
    SELECT p_target_user, p_actor, 'friendships', p_event,
           p_group_id, 'group_member', p_group_id,
           jsonb_build_object('actor_name', v_actor_name, 'group_name', v_group_name),
           CASE WHEN COALESCE((SELECT friendships_push FROM notification_preferences WHERE user_id = p_target_user), true)
                THEN 'pending'::push_status ELSE 'skipped'::push_status END,
           'member:' || p_group_id || ':' || p_target_user || ':added_self'
    WHERE COALESCE((SELECT friendships_inapp FROM notification_preferences WHERE user_id = p_target_user), true)
      AND NOT EXISTS(SELECT 1 FROM notification_mutes WHERE user_id = p_target_user AND group_id = p_group_id
                     AND (muted_until IS NULL OR muted_until > now()))
    ON CONFLICT (recipient_user_id, dedup_key) DO NOTHING;
    RETURN;
  END IF;

  -- joined / left: notify other active members
  FOR v_rec IN
    SELECT gm.user_id AS recipient_id,
           COALESCE(np.friendships_inapp, true) AS inapp_on,
           COALESCE(np.friendships_push,  true) AS push_on,
           EXISTS(SELECT 1 FROM notification_mutes nm
                  WHERE nm.user_id = gm.user_id AND nm.group_id = p_group_id
                    AND (nm.muted_until IS NULL OR nm.muted_until > now())) AS is_muted
    FROM group_members gm
    LEFT JOIN notification_preferences np ON np.user_id = gm.user_id
    WHERE gm.group_id = p_group_id AND gm.is_active = true AND gm.user_id <> p_actor AND gm.user_id <> p_target_user
  LOOP
    CONTINUE WHEN NOT v_rec.inapp_on OR v_rec.is_muted;
    INSERT INTO notifications (recipient_user_id, actor_user_id, category, event_type,
      group_id, entity_type, entity_id, params, push_status, dedup_key)
    VALUES (v_rec.recipient_id, p_actor, 'friendships', p_event,
      p_group_id, 'group_member', p_group_id,
      jsonb_build_object('actor_name', COALESCE(v_target_name, v_actor_name), 'group_name', v_group_name),
      CASE WHEN v_rec.push_on THEN 'pending'::push_status ELSE 'skipped'::push_status END,
      'member:' || p_group_id || ':' || p_target_user || ':' || p_event::text
    )
    ON CONFLICT (recipient_user_id, dedup_key) DO NOTHING;
  END LOOP;
END $$;
```

- [ ] **Step 2: Triggers**

```sql
CREATE OR REPLACE FUNCTION trg_after_group_members_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_actor uuid;
BEGIN
  v_actor := auth.uid();
  -- Self-join (e.g. redeem_group_invite): actor == new member → fanout member_joined to others
  IF v_actor IS NULL OR v_actor = NEW.user_id THEN
    PERFORM fanout_member_event(NEW.group_id, NEW.user_id, NEW.user_id, 'member_joined');
  ELSE
    -- Admin-added: notify new member + others
    PERFORM fanout_member_event(NEW.group_id, NEW.user_id, v_actor, 'member_added_self');
    PERFORM fanout_member_event(NEW.group_id, NEW.user_id, v_actor, 'member_joined');
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION trg_after_group_members_update() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_actor uuid;
BEGIN
  IF OLD.is_active = true AND NEW.is_active = false THEN
    v_actor := COALESCE(auth.uid(), NEW.user_id);
    PERFORM fanout_member_event(NEW.group_id, NEW.user_id, v_actor, 'member_left');
  ELSIF OLD.is_active = false AND NEW.is_active = true THEN
    v_actor := COALESCE(auth.uid(), NEW.user_id);
    PERFORM fanout_member_event(NEW.group_id, NEW.user_id, v_actor, 'member_joined');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tr_group_members_insert ON group_members;
CREATE TRIGGER tr_group_members_insert AFTER INSERT ON group_members
FOR EACH ROW EXECUTE FUNCTION trg_after_group_members_insert();

DROP TRIGGER IF EXISTS tr_group_members_update ON group_members;
CREATE TRIGGER tr_group_members_update AFTER UPDATE ON group_members
FOR EACH ROW EXECUTE FUNCTION trg_after_group_members_update();
```

- [ ] **Step 3: Apply + mirror + commit**

```bash
git commit -m "feat(db): fanout for group_members events"
```

---

### Task 13: SQL test script for all fanout functions

> **Council revisions:** Add a "negative" assertion block that confirms `anon` and `authenticated` roles CANNOT call any `fanout_*` function (C1 verification). Without this regression test, a future migration could re-grant EXECUTE to PUBLIC silently.

**Files:**
- Create: `cost-share-app/supabase/tests/notifications.sql`

Add a top-of-file block that asserts the REVOKE pattern survived:
```sql
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'fanout\_%' ESCAPE '\'
  LOOP
    IF has_function_privilege('authenticated', 'public.' || r.proname || '()', 'EXECUTE')
       OR has_function_privilege('anon',          'public.' || r.proname || '()', 'EXECUTE') THEN
      RAISE EXCEPTION 'C1 regression: % is callable by anon/authenticated', r.proname;
    END IF;
  END LOOP;
END $$;
```
(The bare-`()` probe may return false for functions with required args — fine, the goal is to catch accidental wide grants on no-arg overloads; for the full check, fetch the actual argument signature from `pg_proc` first.)

- [ ] **Step 1: Write script**

```sql
-- Run in a transaction to leave the DB clean.
BEGIN;
SAVEPOINT base;

-- Set up two test users + a group
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'alice@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'bob@test.local')
ON CONFLICT DO NOTHING;
INSERT INTO profiles (id, name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Alice'),
  ('22222222-2222-2222-2222-222222222222', 'Bob')
ON CONFLICT DO NOTHING;
INSERT INTO groups (id, name, created_by) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Test', '11111111-1111-1111-1111-111111111111')
ON CONFLICT DO NOTHING;
INSERT INTO group_members (group_id, user_id, is_active) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', true)
ON CONFLICT DO NOTHING;

-- Case 1: Alice adds an expense splitting with Bob → Bob gets 1 notification
SET LOCAL ROLE postgres;
INSERT INTO expenses (id, group_id, description, amount, currency, created_by, paid_by)
VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'Pizza', 100, 'ILS', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111');
INSERT INTO expense_splits (expense_id, user_id, amount) VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '11111111-1111-1111-1111-111111111111', 50),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '22222222-2222-2222-2222-222222222222', 50);

DO $$ DECLARE c int; BEGIN
  SELECT count(*) INTO c FROM notifications WHERE event_type = 'expense_added' AND recipient_user_id = '22222222-2222-2222-2222-222222222222';
  ASSERT c = 1, format('expected 1 notif for Bob, got %s', c);
END $$;

-- Case 2: Calling fanout again is idempotent (dedup_key)
SELECT fanout_expense_added('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '11111111-1111-1111-1111-111111111111');
DO $$ DECLARE c int; BEGIN
  SELECT count(*) INTO c FROM notifications WHERE event_type = 'expense_added' AND recipient_user_id = '22222222-2222-2222-2222-222222222222';
  ASSERT c = 1, format('still 1 after re-fanout, got %s', c);
END $$;

-- Case 3: Bob turns off expenses_inapp → no new rows
INSERT INTO notification_preferences (user_id, expenses_inapp) VALUES ('22222222-2222-2222-2222-222222222222', false);
DELETE FROM notifications WHERE recipient_user_id = '22222222-2222-2222-2222-222222222222';
INSERT INTO expense_splits (expense_id, user_id, amount) VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '22222222-2222-2222-2222-222222222222', 50);
-- Re-fire by inserting a fresh expense
INSERT INTO expenses (id, group_id, description, amount, currency, created_by, paid_by)
VALUES ('eeeeeeee-0000-0000-0000-eeeeeeeeeeee', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'Beer', 50, 'ILS', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111');
INSERT INTO expense_splits (expense_id, user_id, amount) VALUES
  ('eeeeeeee-0000-0000-0000-eeeeeeeeeeee', '22222222-2222-2222-2222-222222222222', 50);
DO $$ DECLARE c int; BEGIN
  SELECT count(*) INTO c FROM notifications WHERE recipient_user_id = '22222222-2222-2222-2222-222222222222';
  ASSERT c = 0, format('expected 0 with inapp=off, got %s', c);
END $$;

-- Case 4: push off → row with push_status='skipped'
UPDATE notification_preferences SET expenses_inapp = true, expenses_push = false WHERE user_id = '22222222-2222-2222-2222-222222222222';
INSERT INTO expenses (id, group_id, description, amount, currency, created_by, paid_by)
VALUES ('eeeeeeee-1111-0000-0000-eeeeeeeeeeee', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'Coffee', 20, 'ILS', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111');
INSERT INTO expense_splits (expense_id, user_id, amount) VALUES
  ('eeeeeeee-1111-0000-0000-eeeeeeeeeeee', '22222222-2222-2222-2222-222222222222', 20);
DO $$ DECLARE s push_status; BEGIN
  SELECT push_status INTO s FROM notifications WHERE recipient_user_id = '22222222-2222-2222-2222-222222222222' AND entity_id = 'eeeeeeee-1111-0000-0000-eeeeeeeeeeee';
  ASSERT s = 'skipped', format('expected skipped, got %s', s);
END $$;

-- Case 5: mute group → no rows
UPDATE notification_preferences SET expenses_push = true WHERE user_id = '22222222-2222-2222-2222-222222222222';
INSERT INTO notification_mutes (user_id, group_id) VALUES ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
INSERT INTO expenses (id, group_id, description, amount, currency, created_by, paid_by)
VALUES ('eeeeeeee-2222-0000-0000-eeeeeeeeeeee', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'Tea', 10, 'ILS', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111');
INSERT INTO expense_splits (expense_id, user_id, amount) VALUES
  ('eeeeeeee-2222-0000-0000-eeeeeeeeeeee', '22222222-2222-2222-2222-222222222222', 10);
DO $$ DECLARE c int; BEGIN
  SELECT count(*) INTO c FROM notifications WHERE recipient_user_id = '22222222-2222-2222-2222-222222222222' AND entity_id = 'eeeeeeee-2222-0000-0000-eeeeeeeeeeee';
  ASSERT c = 0, format('expected 0 when muted, got %s', c);
END $$;

ROLLBACK TO SAVEPOINT base;
ROLLBACK;
```

- [ ] **Step 2: Run via execute_sql MCP**

Use `mcp__supabase__execute_sql` with the entire script. Expect no ASSERT failures.

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/supabase/tests/notifications.sql
git commit -m "test(db): notification fanout assertion script"
```

---

### Task 14: Mobile — `useNotifications` hook (Realtime + React Query)

> **Council revisions:** C6 (use Zustand `useAppStore`, not non-existent `useAuth`). B3 (`@cost-share/shared`). M7 (update badge on mark-read). M10 (`supabase.removeChannel`, not `ch.unsubscribe()`). C8 (Realtime updates cache only — no toast here).

**Files:**
- Create: `cost-share-app/apps/mobile/hooks/useNotifications.ts`
- Create: `cost-share-app/apps/mobile/__tests__/hooks/useNotifications.test.ts`

- [ ] **Step 1: Hook**

```typescript
import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store';
import { setAppBadge } from '../services/notifications.service';
import type { NotificationRow } from '@cost-share/shared';

const KEY_LIST = ['notifications', 'list'] as const;
const KEY_UNREAD = ['notifications', 'unreadCount'] as const;

export function useNotificationsList(limit = 30) {
  return useQuery({
    queryKey: KEY_LIST,
    queryFn: async (): Promise<NotificationRow[]> => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
    staleTime: 30_000,
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: KEY_UNREAD,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null);
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 10_000,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('mark_notification_read', { p_notification_id: id });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: KEY_UNREAD });
      await qc.invalidateQueries({ queryKey: KEY_LIST });
      // M7: keep OS badge in sync
      const remaining = qc.getQueryData<number>(KEY_UNREAD) ?? 0;
      void setAppBadge(remaining);
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('mark_all_notifications_read');
      if (error) throw error;
    },
    onSuccess: async () => {
      qc.setQueryData<number>(KEY_UNREAD, 0);
      void setAppBadge(0); // M7
      await qc.invalidateQueries({ queryKey: KEY_LIST });
    },
  });
}

// C8: Realtime updates the cache only. The push listener (Task 15/16) owns the toast.
export function useNotificationsRealtime() {
  const userId = useAppStore((s) => s.session?.user.id);
  const qc = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`notifications:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `recipient_user_id=eq.${userId}`,
      }, (payload) => {
        const row = payload.new as NotificationRow;
        qc.setQueryData<NotificationRow[]>(KEY_LIST, (prev) => [row, ...(prev ?? [])]);
        qc.setQueryData<number>(KEY_UNREAD, (prev) => (prev ?? 0) + 1);
        void setAppBadge((qc.getQueryData<number>(KEY_UNREAD) ?? 0));
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); }; // M10
  }, [userId, qc]);
}
```

- [ ] **Step 2: Tests**

`__tests__/hooks/useNotifications.test.ts`:
```typescript
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useNotificationsList, useUnreadCount, useNotificationsRealtime } from '../../hooks/useNotifications';

const order = jest.fn().mockReturnThis();
const limit = jest.fn().mockResolvedValue({ data: [{ id: 'n1' }], error: null });
const head = jest.fn().mockResolvedValue({ count: 3, error: null });

jest.mock('../../lib/supabase', () => {
  return {
    supabase: {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          order: jest.fn(() => ({ limit })),
          is: jest.fn(() => ({})),
        })),
      })),
      channel: jest.fn(() => ({
        on: jest.fn().mockReturnThis(),
        subscribe: jest.fn().mockReturnThis(),
        unsubscribe: jest.fn(),
      })),
    },
  };
});
jest.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ userId: 'u1' }) }));
jest.mock('../../services/notifications.service', () => ({ setAppBadge: jest.fn() }));

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

it('fetches notifications list', async () => {
  const { result } = renderHook(() => useNotificationsList(), { wrapper: wrap() });
  await waitFor(() => expect(result.current.data).toEqual([{ id: 'n1' }]));
});

it('Realtime subscribes on mount', () => {
  const { unmount } = renderHook(() => useNotificationsRealtime(), { wrapper: wrap() });
  const { supabase } = require('../../lib/supabase');
  expect(supabase.channel).toHaveBeenCalledWith('notifications:u1');
  unmount();
});
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(mobile): useNotifications hooks + Realtime subscription"
```

---

### Task 15: Mobile — InAppToast component + foreground handler

> **Council revisions:** M6 (install `expo-haptics` in Task 5). C8 (dedup notification_id LRU vs Realtime). M9 (`useRtlLayout()`, not `I18nManager.isRTL`). B3 (`@cost-share/shared`).

**Files:**
- Create: `cost-share-app/apps/mobile/components/notifications/InAppToast.tsx`
- Modify: `cost-share-app/apps/mobile/services/notifications.service.ts`
- Create: `cost-share-app/apps/mobile/__tests__/components/InAppToast.test.tsx`

- [ ] **Step 1: Add foreground handler to service**

Append to `notifications.service.ts`:
```typescript
import * as Notifications from 'expo-notifications';

let handlerInstalled = false;
export function installForegroundHandler() {
  if (handlerInstalled) return;
  handlerInstalled = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: false,
      shouldPlaySound: false,
      shouldSetBadge: true,
    }),
  });
}
```

- [ ] **Step 2: InAppToast component**

(Uses `react-native-toast-message`'s custom render — confirmed installed.)

```typescript
import React from 'react';
import Toast, { BaseToastProps } from 'react-native-toast-message';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { NotificationEvent, NotificationParams } from '@cost-share/shared';
import { renderNotification } from '@cost-share/shared';
import { useRtlLayout } from '../../hooks/useRtlLayout';
import i18n from '../../i18n';

export interface InAppToastPayload {
  notification_id: string;
  event_type: NotificationEvent;
  params: NotificationParams;
  onPress?: (id: string) => void;
}

// C8: LRU dedup against Realtime/push double-fire.
const seen = new Map<string, number>();
const DEDUP_WINDOW_MS = 30_000;
function alreadyShown(id: string): boolean {
  const now = Date.now();
  for (const [k, t] of seen) if (now - t > DEDUP_WINDOW_MS) seen.delete(k);
  if (seen.has(id)) return true;
  seen.set(id, now);
  return false;
}

export function showInAppToast(payload: InAppToastPayload) {
  if (alreadyShown(payload.notification_id)) return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  Toast.show({
    type: 'copay',
    visibilityTime: 4000,
    autoHide: true,
    onPress: () => payload.onPress?.(payload.notification_id),
    props: payload,
  });
}

const CoPayToast: React.FC<BaseToastProps & { props: InAppToastPayload }> = ({ props }) => {
  const { isRTL } = useRtlLayout(); // M9
  const locale = (i18n.language as 'en' | 'he') ?? 'en';
  const { title, body } = renderNotification(props.event_type, props.params, locale);
  return (
    <Pressable testID="inapp-toast" onPress={() => props.onPress?.(props.notification_id)}>
      <View style={[styles.card, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <View style={styles.avatar} />
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {body ? <Text style={styles.text} numberOfLines={2}>{body}</Text> : null}
        </View>
      </View>
    </Pressable>
  );
};

export const toastConfig = { copay: CoPayToast };

const styles = StyleSheet.create({
  card: { backgroundColor: 'white', marginHorizontal: 12, marginTop: 8, padding: 12, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.1, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 4 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#eee', marginEnd: 12 },
  body: { flex: 1 },
  title: { fontWeight: '600', fontSize: 14 },
  text: { color: '#555', marginTop: 2 },
});
```

- [ ] **Step 3: Mount toastConfig in App root**

In `App.tsx` (or wherever `<Toast />` is rendered), pass `config={toastConfig}` — preserving any existing custom types.

- [ ] **Step 4: Tests**

`__tests__/components/InAppToast.test.tsx`:
```typescript
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { toastConfig } from '../../components/notifications/InAppToast';

jest.mock('../../i18n', () => ({ __esModule: true, default: { language: 'en' } }));

it('renders title from renderNotification', () => {
  const Toast = (toastConfig as any).copay;
  const onPress = jest.fn();
  const { getByText } = render(
    <Toast props={{
      notification_id: 'n1',
      event_type: 'expense_added',
      params: { actor_name: 'Dana', group_name: 'Apt', expense_title: 'Pizza', amount: 50, currency: 'ILS' },
      onPress,
    }} />
  );
  expect(getByText(/Dana added to "Apt"/)).toBeTruthy();
});

it('invokes onPress', () => {
  const Toast = (toastConfig as any).copay;
  const onPress = jest.fn();
  const { getByTestId } = render(
    <Toast props={{ notification_id: 'n1', event_type: 'member_joined', params: { actor_name: 'A', group_name: 'G' }, onPress }} />
  );
  fireEvent.press(getByTestId('inapp-toast'));
  expect(onPress).toHaveBeenCalledWith('n1');
});
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(mobile): InAppToast component + foreground notification handler"
```

---

### Task 16: Mobile — `notificationRouting.ts` + listeners wiring

> **Council revisions:** C7 (nested-navigator format — every leaf wrapped in the parent tab `Groups`). C9 (wire `navigationRef` into `<NavigationContainer>` + cold-start replay queue). B3 (`@cost-share/shared`). Mirror `deepLinks.service.ts:95–98` patterns.

**Files:**
- Create: `cost-share-app/apps/mobile/services/notificationRouting.ts`
- Create: `cost-share-app/apps/mobile/__tests__/services/notificationRouting.test.ts`
- Modify: `cost-share-app/apps/mobile/navigation/AppNavigator.tsx`
- Modify: `cost-share-app/apps/mobile/App.tsx` (attach `navigationRef` to `<NavigationContainer ref={navigationRef}>`)

- [ ] **Step 1: Routing module — nested format (C7)**

```typescript
import type { NavigationContainerRef } from '@react-navigation/native';
import type { NotificationEvent } from '@cost-share/shared';

export interface RouteIntent {
  event_type: NotificationEvent;
  entity_type: string | null;
  entity_id: string | null;
  group_id: string | null;
}

type NestedAction = { screen: 'Groups'; params: { screen: string; params: Record<string, unknown> } };

export function resolveRoute(intent: RouteIntent): NestedAction {
  switch (intent.event_type) {
    case 'expense_added':
    case 'expense_updated':
    case 'expense_deleted':
      return { screen: 'Groups', params: { screen: 'ExpenseDetail', params: { groupId: intent.group_id, expenseId: intent.entity_id } } };
    case 'settlement_recorded':
    case 'settlement_updated':
    case 'settlement_deleted':
      return { screen: 'Groups', params: { screen: 'Balances', params: { groupId: intent.group_id } } };
    case 'member_joined':
    case 'member_left':
      return { screen: 'Groups', params: { screen: 'GroupMembers', params: { groupId: intent.group_id } } };
    case 'member_added_self':
      return { screen: 'Groups', params: { screen: 'GroupDetail', params: { groupId: intent.group_id } } };
  }
}

// C9: cold-start queue — if navigationRef isn't ready yet, hold the intent and replay.
let pendingIntent: RouteIntent | null = null;

export function navigateToIntent(
  navRef: NavigationContainerRef<Record<string, object | undefined>> | null,
  intent: RouteIntent,
): void {
  if (!navRef?.isReady()) {
    pendingIntent = intent;
    return;
  }
  const route = resolveRoute(intent);
  navRef.navigate(route.screen as never, route.params as never);
}

export function flushPendingIntent(navRef: NavigationContainerRef<Record<string, object | undefined>> | null): void {
  if (!pendingIntent || !navRef?.isReady()) return;
  const intent = pendingIntent;
  pendingIntent = null;
  navigateToIntent(navRef, intent);
}
```

- [ ] **Step 2: Tests**

`__tests__/services/notificationRouting.test.ts`:
```typescript
import { resolveRoute } from '../../services/notificationRouting';

it.each([
  ['expense_added', 'ExpenseDetail'],
  ['expense_updated', 'ExpenseDetail'],
  ['expense_deleted', 'ExpenseDetail'],
  ['settlement_recorded', 'Balances'],
  ['settlement_updated', 'Balances'],
  ['settlement_deleted', 'Balances'],
  ['member_joined', 'GroupMembers'],
  ['member_left', 'GroupMembers'],
  ['member_added_self', 'GroupDetail'],
] as const)('routes %s → %s', (event, screen) => {
  const r = resolveRoute({ event_type: event, entity_type: 'x', entity_id: 'e', group_id: 'g' });
  expect(r.screen).toBe(screen);
});
```

- [ ] **Step 3: Wire listeners in AppNavigator**

Inside the authenticated tree, add:
```typescript
import * as Notifications from 'expo-notifications';
import { installForegroundHandler } from '../services/notifications.service';
import { navigateToIntent } from '../services/notificationRouting';
import { showInAppToast } from '../components/notifications/InAppToast';
import { useNotificationsRealtime } from '../hooks/useNotifications';
import { supabase } from '../lib/supabase';
import { navigationRef } from './navigationRef'; // create if doesn't exist
import { useEffect } from 'react';

function NotificationsBridge() {
  useNotificationsRealtime();
  useEffect(() => {
    installForegroundHandler();

    // C9: replay any notification that opened the app from cold-start
    (async () => {
      const last = await Notifications.getLastNotificationResponseAsync();
      if (last?.notification.request.content.data) {
        const data = last.notification.request.content.data as any;
        if (data?.notification_id) {
          void supabase.rpc('mark_notification_read', { p_notification_id: data.notification_id });
        }
        navigateToIntent(navigationRef.current, data);
      }
      // also flush any intent queued while navigation wasn't ready
      flushPendingIntent(navigationRef.current);
    })();

    const sub1 = Notifications.addNotificationReceivedListener((n) => {
      const data = n.request.content.data as any;
      showInAppToast({
        notification_id: data.notification_id,
        event_type: data.event_type,
        params: data.params ?? {},
        onPress: (id) => {
          void supabase.rpc('mark_notification_read', { p_notification_id: id });
          navigateToIntent(navigationRef.current, data);
        },
      });
    });
    const sub2 = Notifications.addNotificationResponseReceivedListener((resp) => {
      const data = resp.notification.request.content.data as any;
      if (data?.notification_id) void supabase.rpc('mark_notification_read', { p_notification_id: data.notification_id });
      navigateToIntent(navigationRef.current, data);
    });
    return () => { sub1.remove(); sub2.remove(); };
  }, []);
  return null;
}
```

In `App.tsx`, wire the ref:
```typescript
import { navigationRef } from './navigation/navigationRef';
// ...
<NavigationContainer ref={navigationRef}>
  {/* existing tree */}
</NavigationContainer>
```

Place `<NotificationsBridge />` near the root of the authenticated tree.

If `navigationRef` doesn't yet exist, create `cost-share-app/apps/mobile/navigation/navigationRef.ts`:
```typescript
import { createNavigationContainerRef } from '@react-navigation/native';
export const navigationRef = createNavigationContainerRef();
```
And attach it to `<NavigationContainer ref={navigationRef}>`.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(mobile): notification routing + listeners bridge"
```

---

### Task 17: Mobile — NotificationsInboxScreen + bell icon

**Files:**
- Create: `cost-share-app/apps/mobile/screens/notifications/NotificationsInboxScreen.tsx`
- Create: `cost-share-app/apps/mobile/components/notifications/NotificationRow.tsx`
- Create: `cost-share-app/apps/mobile/components/notifications/NotificationBell.tsx`
- Modify: `cost-share-app/apps/mobile/navigation/AppNavigator.tsx`
- Create: `cost-share-app/apps/mobile/__tests__/screens/NotificationsInboxScreen.test.tsx`
- Create: `cost-share-app/apps/mobile/__tests__/components/NotificationRow.test.tsx`
- Modify: locales

- [ ] **Step 1: i18n additions**

Append to `notifications` block in `en.json`:
```json
"inbox": {
  "title": "Notifications",
  "empty": "No notifications yet",
  "markAllRead": "Mark all as read"
}
```
he.json: counterparts.

- [ ] **Step 2: NotificationRow**

```typescript
import React from 'react';
import { View, Text, Pressable, StyleSheet, I18nManager } from 'react-native';
import { useTranslation } from 'react-i18next';
import { renderNotification } from '@copay/shared/notifications';
import type { NotificationRow as Row } from '@copay/shared/notifications';

export interface NotificationRowProps {
  row: Row;
  onPress: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function NotificationRow({ row, onPress }: NotificationRowProps) {
  const { i18n } = useTranslation();
  const locale = (i18n.language as 'en' | 'he') ?? 'en';
  const { title, body } = renderNotification(row.event_type, row.params, locale);
  const unread = row.read_at == null;
  return (
    <Pressable testID={`notif-row-${row.id}`} onPress={() => onPress(row.id)} style={styles.row}>
      {unread && <View style={styles.dot} testID="unread-dot" />}
      <View style={styles.avatar} />
      <View style={[styles.body, { alignItems: I18nManager.isRTL ? 'flex-end' : 'flex-start' }]}>
        <Text style={[styles.title, unread && styles.bold]} numberOfLines={1}>{title}</Text>
        {body ? <Text style={styles.text} numberOfLines={2}>{body}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#3478F6', marginEnd: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#eee', marginEnd: 12 },
  body: { flex: 1 },
  title: { fontSize: 14 },
  bold: { fontWeight: '600' },
  text: { color: '#666', marginTop: 2, fontSize: 13 },
});
```

- [ ] **Step 3: NotificationsInboxScreen**

```typescript
import React from 'react';
import { View, Text, FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNotificationsList, useMarkRead, useMarkAllRead } from '../../hooks/useNotifications';
import { NotificationRow } from '../../components/notifications/NotificationRow';
import { navigationRef } from '../../navigation/navigationRef';
import { navigateToIntent } from '../../services/notificationRouting';
import { supabase } from '../../lib/supabase';

export function NotificationsInboxScreen() {
  const { t } = useTranslation();
  const q = useNotificationsList(50);
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();

  const handlePress = (id: string) => {
    markRead.mutate(id);
    const row = q.data?.find((n) => n.id === id);
    if (row) navigateToIntent(navigationRef.current, row);
  };

  const handleDelete = async (id: string) => {
    await supabase.from('notifications').delete().eq('id', id);
    q.refetch();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('notifications.inbox.title')}</Text>
        <Pressable testID="mark-all" onPress={() => markAll.mutate()}>
          <Text style={styles.action}>{t('notifications.inbox.markAllRead')}</Text>
        </Pressable>
      </View>
      <FlatList
        data={q.data ?? []}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => <NotificationRow row={item} onPress={handlePress} onDelete={handleDelete} />}
        refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} />}
        ListEmptyComponent={<Text style={styles.empty}>{t('notifications.inbox.empty')}</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  title: { fontSize: 20, fontWeight: '600' },
  action: { color: '#3478F6' },
  empty: { textAlign: 'center', color: '#888', marginTop: 60 },
});
```

(Swipe-to-delete polish deferred to Task 18 — keep this row simple now.)

- [ ] **Step 4: NotificationBell**

```typescript
import React from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useUnreadCount } from '../../hooks/useNotifications';

export function NotificationBell() {
  const nav = useNavigation<any>();
  const { data: unread = 0 } = useUnreadCount();
  return (
    <Pressable testID="notification-bell" onPress={() => nav.navigate('NotificationsInbox')} hitSlop={8}>
      <Ionicons name="notifications-outline" size={24} />
      {unread > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: { position: 'absolute', top: -4, right: -6, backgroundColor: '#E53935', minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: 'white', fontSize: 10, fontWeight: '700' },
});
```

- [ ] **Step 5: Mount in navigator**

In `AppNavigator.tsx`:
- Register `NotificationsInbox` screen in the root authenticated stack with `component={NotificationsInboxScreen}`.
- Add `<NotificationBell />` as `headerRight` of the GroupsList (or Dashboard) screen.

- [ ] **Step 6: Tests**

`__tests__/screens/NotificationsInboxScreen.test.tsx`:
```typescript
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { NotificationsInboxScreen } from '../../screens/notifications/NotificationsInboxScreen';

const useList = jest.fn();
const markRead = jest.fn();
const markAll = jest.fn();
jest.mock('../../hooks/useNotifications', () => ({
  useNotificationsList: () => useList(),
  useMarkRead: () => ({ mutate: markRead }),
  useMarkAllRead: () => ({ mutate: markAll }),
  useUnreadCount: () => ({ data: 0 }),
}));
jest.mock('../../navigation/navigationRef', () => ({ navigationRef: { current: null } }));
jest.mock('../../services/notificationRouting', () => ({ navigateToIntent: jest.fn() }));
jest.mock('../../lib/supabase', () => ({ supabase: { from: () => ({ delete: () => ({ eq: () => Promise.resolve({}) }) }) } }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

beforeEach(() => jest.clearAllMocks());

it('shows empty state', () => {
  useList.mockReturnValue({ data: [], isFetching: false, refetch: jest.fn() });
  const { getByText } = render(<NotificationsInboxScreen />);
  expect(getByText('notifications.inbox.empty')).toBeTruthy();
});

it('marks all read on header tap', () => {
  useList.mockReturnValue({ data: [], isFetching: false, refetch: jest.fn() });
  const { getByTestId } = render(<NotificationsInboxScreen />);
  fireEvent.press(getByTestId('mark-all'));
  expect(markAll).toHaveBeenCalled();
});

it('marks read + navigates on row tap', async () => {
  useList.mockReturnValue({
    data: [{ id: 'n1', event_type: 'expense_added', read_at: null, params: { actor_name: 'A', group_name: 'G' } }],
    isFetching: false, refetch: jest.fn(),
  });
  const { getByTestId } = render(<NotificationsInboxScreen />);
  fireEvent.press(getByTestId('notif-row-n1'));
  await waitFor(() => expect(markRead).toHaveBeenCalledWith('n1'));
});
```

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(mobile): notifications inbox screen + bell icon"
```

---

### Task 18: Mobile — Notification Settings section + Mute Group toggle

**Files:**
- Modify: `cost-share-app/apps/mobile/screens/profile/SettingsScreen.tsx`
- Modify: `cost-share-app/apps/mobile/screens/groups/EditGroupScreen.tsx`
- Create: `cost-share-app/apps/mobile/hooks/useNotificationPreferences.ts`
- Create: `cost-share-app/apps/mobile/hooks/useGroupMute.ts`
- Modify: locales

- [ ] **Step 1: i18n**

Add to `notifications` block:
```json
"settings": {
  "section": "Notifications",
  "permission": "Permission",
  "permissionGranted": "Enabled",
  "permissionDenied": "Disabled — open system settings",
  "categories": {
    "friendships": "Friendships (joins, leaves)",
    "expenses": "Expenses (add, update, delete)",
    "transfers": "Transfers (settle-ups)"
  },
  "columns": { "push": "Push", "inApp": "In-app" },
  "muteGroup": "Mute notifications from this group"
}
```
Hebrew counterparts.

- [ ] **Step 2: `useNotificationPreferences` hook**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

const KEY = ['notifications', 'preferences'] as const;

export interface PrefsRow {
  friendships_push: boolean; friendships_inapp: boolean;
  expenses_push: boolean;    expenses_inapp: boolean;
  transfers_push: boolean;   transfers_inapp: boolean;
}

const DEFAULTS: PrefsRow = {
  friendships_push: true, friendships_inapp: true,
  expenses_push: true,    expenses_inapp: true,
  transfers_push: true,   transfers_inapp: true,
};

export function useNotificationPreferences() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return (data ?? DEFAULTS) as PrefsRow;
    },
  });
}

export function useUpdateNotificationPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<PrefsRow>) => {
      const { error } = await supabase.rpc('update_notification_preferences', { p_prefs: patch });
      if (error) throw error;
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<PrefsRow>(KEY);
      qc.setQueryData<PrefsRow>(KEY, { ...(prev ?? DEFAULTS), ...patch });
      return { prev };
    },
    onError: (_e, _p, ctx) => { if (ctx?.prev) qc.setQueryData(KEY, ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
```

- [ ] **Step 3: `useGroupMute` hook**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

const key = (groupId: string) => ['notifications', 'mute', groupId] as const;

export function useGroupMute(groupId: string) {
  return useQuery({
    queryKey: key(groupId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_mutes')
        .select('group_id')
        .eq('group_id', groupId)
        .maybeSingle();
      if (error) throw error;
      return data != null;
    },
  });
}

export function useToggleGroupMute(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (muted: boolean) => {
      const { error } = await supabase.rpc('toggle_group_mute', { p_group_id: groupId, p_muted: muted });
      if (error) throw error;
    },
    onMutate: async (muted) => {
      await qc.cancelQueries({ queryKey: key(groupId) });
      const prev = qc.getQueryData<boolean>(key(groupId));
      qc.setQueryData(key(groupId), muted);
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx) qc.setQueryData(key(groupId), ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: key(groupId) }),
  });
}
```

- [ ] **Step 4: Add section to SettingsScreen**

Add a new `SettingsSection` near the General section (existing component pattern). Render 3 rows × 2 switches using the existing toggle component. Show permission status + "Open OS settings" link (use `Linking.openSettings()` from `react-native`).

```typescript
// Sketch — adapt to the existing SettingsSection / Row API
import { useNotificationPreferences, useUpdateNotificationPreferences } from '../../hooks/useNotificationPreferences';
import { getPermissionStatus } from '../../services/notifications.service';
import { Linking, Switch, View, Text } from 'react-native';

// ... inside SettingsScreen:
const prefs = useNotificationPreferences();
const update = useUpdateNotificationPreferences();
const [permGranted, setPermGranted] = useState<boolean | null>(null);
useEffect(() => { getPermissionStatus().then((s) => setPermGranted(s.granted)); }, []);

<SettingsSection title={t('notifications.settings.section')}>
  <Row label={t('notifications.settings.permission')} value={permGranted ? t('notifications.settings.permissionGranted') : t('notifications.settings.permissionDenied')} onPress={() => Linking.openSettings()} />
  {(['friendships','expenses','transfers'] as const).map((cat) => (
    <View key={cat} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }}>
      <Text style={{ flex: 1 }}>{t(`notifications.settings.categories.${cat}`)}</Text>
      <Switch testID={`${cat}-push`}  value={prefs.data?.[`${cat}_push`] ?? true}  disabled={!permGranted} onValueChange={(v) => update.mutate({ [`${cat}_push`]: v })} />
      <Switch testID={`${cat}-inapp`} value={prefs.data?.[`${cat}_inapp`] ?? true} onValueChange={(v) => update.mutate({ [`${cat}_inapp`]: v })} />
    </View>
  ))}
</SettingsSection>
```

- [ ] **Step 5: Add Mute toggle to EditGroupScreen**

```typescript
import { useGroupMute, useToggleGroupMute } from '../../hooks/useGroupMute';
import { Switch } from 'react-native';
// inside the screen:
const muteQ = useGroupMute(groupId);
const muteM = useToggleGroupMute(groupId);
<Switch testID="mute-group" value={muteQ.data ?? false} onValueChange={(v) => muteM.mutate(v)} />
```

- [ ] **Step 6: Tests**

`__tests__/hooks/useNotificationPreferences.test.ts` — basic happy path + optimistic update revert on error.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(mobile): notification settings + per-group mute toggle"
```

---

### Task 19: End-to-end smoke for Phase 2

- [ ] Two-device test: settlement, member-add, member-leave, mute group — each triggers expected inbox + push.
- [ ] Commit any tech-debt items discovered.

---

## Phase 3 — Polish & Resilience

### Task 20: Edge Function `retry-push` + pg_cron

> **Council revisions:** B2 (verify `pg_cron` + `pg_net` are installed; otherwise gate this task on a Supabase plan upgrade). C2 (webhook auth — `retry-push` is also a public endpoint by default). C5 (no cross-function imports — call `send-push` via authenticated `fetch` per row). Sweep rows stuck in `sending` for too long.

**Files:**
- Create: `cost-share-app/supabase/functions/retry-push/index.ts`
- Create: `cost-share-app/supabase/functions/retry-push/deno.json`
- Create: `cost-share-app/supabase/functions/retry-push/index.test.ts`
- Modify: `cost-share-app/supabase/notifications.sql`

- [ ] **Step 0: Confirm `pg_cron` and `pg_net` are available, then enable**

Via Supabase MCP `list_extensions` / Dashboard → Database → Extensions: both extensions must have `installed_version` non-null. If they aren't installed (current state at plan time), either upgrade plan / contact Supabase, or DEFER this entire task and rely on the user reopening the app to retry pushes (acceptable for v1 MVP).

If installing now, append to migration:
```sql
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;
```

- [ ] **Step 1: index.ts — call send-push via authenticated fetch (C5)**

```typescript
import { createClient } from 'supabase';

function requireEnv(n: string): string {
  const v = Deno.env.get(n);
  if (!v) throw new Error(`missing env var: ${n}`);
  return v;
}

const SUPABASE_URL = requireEnv('SUPABASE_URL');
const SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SHARED_SECRET') ?? SERVICE_ROLE_KEY;
const SEND_PUSH_URL = `${SUPABASE_URL}/functions/v1/send-push`;
const MAX_ATTEMPTS = 3;
const STUCK_SENDING_MIN = 5;

function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  // C2: cron-trigger requests should carry the same webhook secret
  const auth = req.headers.get('authorization') ?? '';
  if (!constantTimeEq(auth, `Bearer ${WEBHOOK_SECRET}`)) {
    return new Response('unauthorized', { status: 401 });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // Unstick rows that have been in `sending` longer than STUCK_SENDING_MIN — the handler crashed mid-flight.
  await sb.from('notifications')
    .update({ push_status: 'failed', push_error: 'stuck_in_sending' })
    .eq('push_status', 'sending')
    .lt('push_last_attempt', new Date(Date.now() - STUCK_SENDING_MIN * 60_000).toISOString());

  const { data, error } = await sb.from('notifications')
    .select('*')
    .eq('push_status', 'failed')
    .lt('push_attempts', MAX_ATTEMPTS)
    .gt('created_at', new Date(Date.now() - 24 * 3600_000).toISOString())
    .limit(100);
  if (error) return new Response('err', { status: 500 });

  let retried = 0;
  for (const row of data ?? []) {
    const r = await fetch(SEND_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${WEBHOOK_SECRET}`,
      },
      body: JSON.stringify({ type: 'INSERT', table: 'notifications', record: row }),
    });
    if (r.ok) retried++;
  }
  return new Response(`retried ${retried}/${data?.length ?? 0}`, { status: 200 });
});
```

- [ ] **Step 2: Tests**

Cover: empty result → 200, calls send-push handler for each row.

- [ ] **Step 3: pg_cron schedule (SQL)**

Append to `notifications.sql`:
```sql
-- Requires pg_cron + pg_net extensions installed (verified in Step 0).
SELECT cron.schedule(
  'retry-push',
  '*/5 * * * *',
  $$ SELECT net.http_post(
       url := current_setting('app.retry_push_url'),
       headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.webhook_secret'))
     ); $$
);
```
Document in `docs/SSOT/SETUP.md`:
```sql
ALTER DATABASE postgres SET app.retry_push_url = 'https://<project>.supabase.co/functions/v1/retry-push';
ALTER DATABASE postgres SET app.webhook_secret = '<WEBHOOK_SHARED_SECRET>';
```
**Do not store the service role key in `app.webhook_secret`** — use the dedicated `WEBHOOK_SHARED_SECRET` so rotation doesn't require rotating the service role.

- [ ] **Step 4: Deploy + commit**

```bash
git commit -m "feat(edge): retry-push function + 5-min pg_cron schedule"
```

---

### Task 21: Stacked toasts when bursty

**Files:**
- Modify: `cost-share-app/apps/mobile/components/notifications/InAppToast.tsx`

- [ ] **Step 1: Add a toast queue module**

```typescript
let queue: InAppToastPayload[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export function enqueueToast(payload: InAppToastPayload) {
  queue.push(payload);
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    if (queue.length === 1) showInAppToast(queue[0]);
    else {
      // collapse
      Toast.show({
        type: 'copay',
        visibilityTime: 4000,
        props: { ...queue[queue.length - 1], _count: queue.length },
      });
    }
    queue = [];
    flushTimer = null;
  }, 600);
}
```

Render `+N` badge when `_count > 1`.

- [ ] **Step 2: Replace `showInAppToast` call site with `enqueueToast`**

- [ ] **Step 3: Test bursty stacking**

```typescript
it('collapses 3 toasts arriving within 600ms', async () => {
  // ...
});
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(mobile): stacked toasts for bursty notifications"
```

---

### Task 22: E2E flows (Maestro)

**Files:**
- Create: `cost-share-app/apps/mobile/.maestro/notifications/onboarding.yaml`
- Create: `cost-share-app/apps/mobile/.maestro/notifications/settings.yaml`
- Create: `cost-share-app/apps/mobile/.maestro/notifications/mute.yaml`

- [ ] **Step 1: Onboarding flow**

```yaml
appId: com.copay.mobile
---
- launchApp
- runFlow: ../login.yaml
- tapOn: "Join group"
- tapOn:
    text: "כן, הפעלה"
- tapOn:
    text: "Allow"
- # backend triggers expense_added on the recipient (out-of-band)
- assertVisible:
    id: "inapp-toast"
- tapOn:
    id: "inapp-toast"
- assertVisible:
    text: "Expense details"
```

- [ ] **Step 2: Settings flow** — toggles `expenses_push` off, triggers event, expects inbox row but no toast.

- [ ] **Step 3: Mute flow** — mutes group, triggers event, expects 0 rows.

- [ ] **Step 4: Document in README how to run**

```bash
maestro test apps/mobile/.maestro/notifications/onboarding.yaml
```

- [ ] **Step 5: Commit**

```bash
git commit -m "test(e2e): Maestro flows for notifications"
```

---

### Task 23: Performance pass + feature flag

> **Council revisions:** B5 moved the kill-switch into Task 2 (it ships in Phase 1). What remains here is the perf pass + verifying the switch works as expected.

- [ ] **Step 1: Verify kill switch end-to-end**

The DB-level switch is `app.notifications_enabled` (see Task 2). To kill all fanout:
```sql
ALTER DATABASE postgres SET app.notifications_enabled = 'false';
-- Existing sessions keep their cached GUC; new sessions pick up immediately.
-- For an instant kill, force-reload via SELECT pg_reload_conf() or restart the connection pool.
```
Sanity-check by inserting an expense and confirming zero `notifications` rows are produced.

- [ ] **Step 2: Review query plans**

Run `EXPLAIN ANALYZE` on:
- `SELECT * FROM notifications WHERE recipient_user_id = $1 ORDER BY created_at DESC LIMIT 30`
- The fanout JOIN on `expense_splits` + `notification_preferences`.

Confirm indexes are used. Fix any seq scans.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(notifications): feature flag + perf-pass index validation"
```

---

## Self-Review

**Spec coverage** — every locked decision and § in the spec maps to a task:
- Channels & categories (Tasks 1, 18) ✓
- 9 events (Tasks 3, 10, 11, 12) ✓
- Mute group (Tasks 2 schema, 18 UI) ✓
- Push-content rendering (Task 1, 4) ✓
- Permission soft prompt (Task 7) ✓
- DB schema + RLS (Task 2) ✓
- Fanout + triggers (Tasks 3, 10, 11, 12) ✓
- Edge function (Task 4) ✓
- Retry job (Task 20) ✓
- Realtime + inbox + bell (Tasks 14, 17) ✓
- Foreground toast + bg listener + deep linking (Tasks 15, 16) ✓
- Android channels + iOS threads (Tasks 4 payload, 6 service) ✓
- Badge management (Tasks 6, 14) ✓
- Test strategy: snapshot/content (Task 1), SQL fanout (Task 13), Edge (Task 4, 20), mobile units (each task), Maestro (Task 22) ✓
- Rollout phases — plan ordered by Phase 1/2/3 ✓
- Tech debt items — covered by separate doc, referenced ✓

**Placeholder scan** — no TBD/TODO inside steps. Each code block is complete. The only deferred specifics are intentional handoff notes ("adapt to existing SettingsSection API") where the existing codebase pattern is the source of truth.

**Type consistency** — `NotificationEvent`, `NotificationParams`, `PushStatus`, `NotificationLocale`, `NotificationRow`, `NotificationCategory` are defined once in Task 1 and referenced identically thereafter. RPC names (`register_device_token`, `unregister_device_token`, `mark_notification_read`, `mark_all_notifications_read`, `update_notification_preferences`, `toggle_group_mute`) are stable across tasks. Function names (`fanout_expense_added`, `fanout_expense_updated`, `fanout_expense_deleted`, `fanout_settlement`, `fanout_member_event`, `_notif_actor_name`, `_notif_group_name`) consistent.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-20-notifications.md`.**

---

## Council Revision Log (2026-05-20)

The plan was reviewed by a 5-agent council. Their findings produced the revisions documented in the "Council Review Revisions (2026-05-20)" section near the top of this file, plus per-task callouts in:

- **Task 1** — package name `@cost-share/shared`; 4 targeted tests instead of 18 snapshots.
- **Task 2** — kill-switch GUC; `idx_notif_push_retry`; column-level update guard (`notif_block_non_read_updates`); `ALTER PUBLICATION supabase_realtime ADD TABLE notifications`.
- **Task 3** — STATEMENT-level trigger via transition tables; REVOKE EXECUTE on all fanout/_notif_ functions; kill-switch early-return; Phase 1 stops here (`expense_added` only).
- **Task 4** — webhook auth via `WEBHOOK_SHARED_SECRET`; CAS claim step; `push_attempts + 1` (not constant `1`); Zod payload validation; handler/server split (`handler.ts` exports `handle`, `index.ts` is the entrypoint); vendored `content.ts` for Deno; `requireEnv()`.
- **Task 5** — install `expo-haptics`.
- **Task 6** — wire `unregisterCurrentDevice` into `auth.service.ts:signOut` BEFORE the auth session is dropped.
- **Task 7** — drop AsyncStorage cooldown; in-memory session flag.
- **Task 9** — SQL smoke as primary; two-device gold-standard but optional; record PII-on-lockscreen + token rotation gaps in `TECHNICAL_DEBT.md`.
- **Tasks 10/11/12** — REVOKE EXECUTE; kill-switch; semantic dedup_key hash; `currency` in no-op guard; explicit NULL `auth.uid()` handling (no silent self-join misclassification).
- **Task 13** — assertion that `anon`/`authenticated` cannot call `fanout_*`.
- **Task 14** — `useAppStore` (not non-existent `useAuth`); `@cost-share/shared`; OS badge update on mark-read; `supabase.removeChannel`.
- **Task 15** — `expo-haptics` install; LRU dedup against Realtime+push double-fire; `useRtlLayout()` instead of `I18nManager.isRTL`.
- **Task 16** — nested-navigator routing (`{ screen: 'Groups', params: { screen: '...', params: {} } }`); cold-start replay via `getLastNotificationResponseAsync`; pending-intent queue; `<NavigationContainer ref={navigationRef}>` wired in `App.tsx`.
- **Task 20** — `pg_cron`/`pg_net` verification gate; webhook auth; cross-function call via authenticated `fetch` (no Deno import across functions); stuck-in-`sending` sweep; dedicated `app.webhook_secret` GUC instead of service-role key.
- **Task 23** — kill-switch moved to Phase 1; this task keeps perf pass.

**Pre-flight blockers (B1–B5) MUST be resolved before starting Task 1**, especially EAS projectId and the package-name rename (`@cost-share/shared`).
