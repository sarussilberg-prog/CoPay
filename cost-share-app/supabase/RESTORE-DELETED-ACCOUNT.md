# Restore a deleted account (support runbook)

When a user deleted their account and contacts support to come back, restore the **same** `user_id` so friendships, groups, expenses, and balances stay linked.

## Prerequisites

- Run `account-deletion-v3-fixes.sql` on the project (includes `restore_deleted_account()`).
- Confirm the requester owns the email (they must write from the same address that was deleted).
- Use Supabase **SQL Editor** (service role) — this RPC is not exposed to the mobile app.

## Steps

1. **Look up the user** by email:

```sql
SELECT p.id, p.is_active, p.deleted_at, u.email, u.banned_until
FROM auth.users u
JOIN profiles p ON p.id = u.id
WHERE lower(trim(u.email)) = lower(trim('user@example.com'));
```

2. **Verify** `is_active = false` and `deleted_at IS NOT NULL`.

3. **Restore** (optional display name + audit note):

```sql
SELECT restore_deleted_account(
    'USER_UUID_HERE'::uuid,
    'Display Name',           -- optional; falls back to Google name or email local-part
    'Restored per support ticket #123'
);
```

4. **Ask the user** to sign in again with Google (same email). They should land in the app with their history intact.

## What restoration does

| Action | Why |
|--------|-----|
| `profiles.is_active = true`, PII restored from `auth.users` | User visible again with same id |
| `deleted_account_emails` row removed | Re-login / OAuth allowed |
| `auth.users.banned_until = null` | Supabase issues tokens again |
| `account_deletions_audit.restored_at` set | GDPR Art. 30 trail |

## What restoration does **not** do

- Does not recreate friendships or group memberships (they were never removed).
- Does not restore avatar (user can upload again); old avatar may have been queued for storage cleanup.
- Does not merge into a **new** account if they signed up with a different email — always restore the original `user_id`.

## Safety

- Same UUID → no broken FKs on expenses/settlements.
- Re-signup block is lifted only for that email hash.
- RPC rejects if profile is already active (`profile_not_deleted`).
