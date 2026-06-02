# Technical Debt

Items deferred from active development, with rationale and trigger conditions for revisiting.

This file is the single source of truth for "we chose not to build X now". When a spec defers something, it should be logged here.

**Bugs and active gaps** (things that should work but don't) belong in [KNOWN_ISSUES.md](./KNOWN_ISSUES.md), not here.

---

## Notifications (deferred from 2026-05-20 spec)

Source spec: `docs/superpowers/specs/2026-05-20-notifications-design.md`

### 1. Proactive debt reminders (`debt.reminder`)
- **What:** Scheduled push when a debt remains open for N days.
- **Why deferred:** Requires `pg_cron` job + debt aging logic + per-pair cooldowns. Builds on stable reactive notifications; better to ship the core first and validate.
- **Revisit when:** Phase 4 GA stable for 4 weeks AND user research confirms unpaid debts as a top-3 friction.

### 2. Quiet hours (e.g., 22:00–08:00)
- **What:** User-configurable time window where push is muted (in-app still arrives).
- **Why deferred:** iOS Focus modes cover most users; adding this requires timezone storage + per-user schedule UI.
- **Revisit when:** ≥5 user-reported requests OR Android-heavy region expansion (Android Focus is weaker).

### 3. Gender-aware Hebrew translations
- **What:** "הוסיף" vs "הוסיפה" based on actor's gender.
- **Why deferred:** No `gender` field on profiles yet. Current fallback "הוסיף/ה" is acceptable but not polished.
- **Revisit when:** `profiles` gain a `gender` field for other reasons, OR user feedback flags this.

### 4. Expo Push Receipts polling
- **What:** Async confirmation that push reached APNs/FCM (15-min delay job).
- **Why deferred:** `DeviceNotRegistered` is handled in the immediate response already; receipts add ~10% delivery confidence at the cost of another scheduled job.
- **Revisit when:** Observed silent-failure rate > 2%.

### 5. "Hide content on lock screen" user toggle
- **What:** Replace push body with generic text for privacy-conscious users.
- **Why deferred:** OS-level setting exists; only worth building if users complain.
- **Revisit when:** Privacy-related support tickets > 3 in a month.

### 6. Temporary mute (`muted_until` UI)
- **What:** "Mute for 1 hour / 1 day / 1 week" — schema supports it (`notification_mutes.muted_until`), UI doesn't expose it.
- **Why deferred:** Schema-ready, UI work small but not v1-critical.
- **Revisit when:** Phase 4 stable.

### 7. Web push notifications
- **What:** Browser push for the web app.
- **Why deferred:** Web is auth + landing surface, not primary engagement.
- **Revisit when:** Web becomes a primary surface (dashboards, etc.).

---

## Invitations & Sharing (deferred from 2026-05-20 spec)

Source spec: `docs/superpowers/specs/2026-05-20-invites-and-sharing-design.md`

### 1. Single-use / expiring invite tokens
- **What:** Tokens that auto-invalidate after one use or after N hours.
- **Why deferred:** Multi-use is simpler and matches the WhatsApp share use-case. Adds value mostly under security review.
- **Revisit when:** Security review flags rotation alone as insufficient, OR user request volume justifies it.

### 2. Deferred / hybrid deep linking on iOS install
- **What:** When user installs the app via a link, the link target is remembered post-install (no manual click needed).
- **Why deferred:** Universal Links handle the "already installed" case. Install-then-link requires either Branch.io or custom server-side device fingerprinting.
- **Revisit when:** App Store install conversion is < 30% from invite links.

### 3. Push notification for pending invites
- **What:** Push to inviter when their invite is redeemed.
- **Why deferred:** Folded into the notifications spec — implemented there as `member_joined`.
- **Status:** Resolved by notifications spec (Phase 2).

---

## How to use this file

- **When deferring something:** add an entry with What / Why / Revisit-when triplet.
- **When picking up something:** move the item out (delete from this file, mention in the spec/PR that picks it up).
- **Triggers, not deadlines:** items live here until a real condition (user feedback, metric threshold, complementary feature) makes it worth the cost. Time-based "we'll get to it" entries rot.
