# Profile Dashboard & Settings Redesign — Design Spec

**Date:** 2026-05-19  
**Status:** Approved (brainstorming)  
**Mapped SRS:** REQ-PROF-01 (extend), REQ-PROF-04, REQ-PROF-05, REQ-NOTIF-01–03, REQ-ACT-02, REQ-NFR-06

---

## 1. Overview

Redesign the Profile tab into a personal dashboard with balance summary, group stats, friends list, and unread activity count. Upgrade Settings into a professional grouped settings screen with full notification controls, legal documents, app rating, and WhatsApp contact.

**Architecture approach:** Hybrid — `GET /users/me/dashboard` for stats + separate notification preferences endpoints. All aggregation on server; mobile follows `UI → services/ → API`.

---

## 2. User Decisions (confirmed)

| Topic | Decision |
|-------|----------|
| Closed groups | All members have `netBalance === 0` |
| Money display | Two headline numbers (converted) + per-currency breakdown |
| Currency conversion | Exchange rate API (exchangerate-api.com), server-cached 24h |
| Friends list | Inline on dashboard — avatar, name, net balance; no full-screen friends view |
| Notifications | Master on/off + per-type toggles + push + in-app badge |
| Contact | WhatsApp → +972528616878 |
| Terms & Privacy | In-app scrollable bottom sheet (i18n text) |
| Rate app | Deep link to App Store / Play Store by platform |
| Header | Center title "Kupa" (not "Profile"); settings icon in header |
| Profile row | Single row: avatar + name + email + small edit icon button |

---

## 3. Profile Dashboard Screen

### 3.1 Layout (top to bottom)

1. **Header** — "Kupa" centered; ⚙️ settings icon (RTL-aware trailing side)
2. **Profile row card** — Avatar, name, email (subtitle), small edit icon → `EditProfile`
3. **Hero Balance Card** — Gradient (`primaryExtraLight` → white)
   - Two headline numbers: "You owe" / "You're owed" in user's `defaultCurrency`
   - Expandable/collapsible per-currency breakdown below
4. **Stat tiles row** (3 tiles, tappable)
   - Closed groups count → filter/navigate to settled groups
   - Active groups count → Groups tab
   - Unread activity count (badge style) → Activity tab
5. **Friends section** — Vertical list of `FriendBalanceRow`
   - Avatar, name, colored balance (green = owed to you, red = you owe, gray = settled)
   - Tap → navigate to first shared group (or small bottom sheet listing shared groups — not a dedicated friends screen)
   - Hidden when friends list is empty
6. **Pull-to-refresh** on entire screen

### 3.2 Visual tokens (align with existing theme)

- Primary: `#60A5FA`, background: `slate-50`, cards: white `rounded-2xl`, subtle border
- Icons: `AppIcon` (Ionicons) only — no emoji as UI icons
- Motion: 200ms color transitions; respect `prefers-reduced-motion`
- Touch targets ≥ 44×44 px

### 3.3 New mobile components

| Component | Purpose |
|-----------|---------|
| `BalanceHeroCard` | Headline totals + currency breakdown |
| `StatTile` | Single stat with label, tappable |
| `FriendBalanceRow` | Friend list item |
| `ProfileHeaderRow` | Avatar + name + edit button |

---

## 4. Settings Screen

### 4.1 Grouped list structure

**GENERAL**
- Language → bottom sheet (English / עברית)

**NOTIFICATIONS**
- Enable notifications (master toggle)
- When ON, show sub-toggles:
  - New expense
  - Payment / settlement
  - Added to group
  - Debt reminders
- Channels:
  - Push notifications (requests OS permission on first enable)
  - In-app badge

**SUPPORT**
- Rate us on App Store / Google Play → `Linking.openURL`
- Contact us via WhatsApp → `+972528616878`

**LEGAL**
- Terms of Service → `LegalSheet` bottom sheet
- Privacy Policy → `LegalSheet` bottom sheet

**ACCOUNT**
- Log out (danger row) → existing `ConfirmDialog`

**Footer:** App version (muted text)

### 4.2 New mobile components

| Component | Purpose |
|-----------|---------|
| `SettingsSection` | Section title + grouped rows |
| `SettingsRow` | Icon + label + chevron / toggle / value |
| `LegalSheet` | Scrollable bottom sheet for legal text |
| `LanguageSheet` | Language picker bottom sheet |

### 4.3 Anti-patterns

- No emoji icons
- No oversized logout button mid-screen
- No hardcoded UI strings — all via `t('key')` in `en.json` / `he.json`

---

## 5. Backend & API

### 5.1 New SRS requirements (to add to SRS.md)

| ID | Requirement | Acceptance criteria |
|----|-------------|---------------------|
| REQ-PROF-04 | Profile dashboard | Shows balance summary, stats, friends; data from `/users/me/dashboard` |
| REQ-PROF-05 | Enhanced settings | Legal sheets, rate app, WhatsApp contact, version footer |
| REQ-NOTIF-01 | Notification preferences | Master + per-type + channel toggles persist via API |
| REQ-NOTIF-02 | Push notifications | Expo push token registered; server sends on events when enabled |
| REQ-NOTIF-03 | In-app unread badge | Badge on Activity tab; cleared via mark-read |
| REQ-ACT-02 | Activity API | `GET /activity` returns cross-group feed (mobile already calls this) |

### 5.2 Endpoints

#### `GET /users/me/dashboard`

Returns full profile dashboard payload.

```typescript
interface UserDashboard {
  balanceSummary: {
    totalOwed: number;
    totalOwedToUser: number;
    defaultCurrency: string;
    byCurrency: {
      currency: string;
      owed: number;
      owedToUser: number;
    }[];
    exchangeRatesUsed: Record<string, number>;
  };
  stats: {
    closedGroupsCount: number;
    activeGroupsCount: number;
    unreadActivityCount: number;
  };
  friends: FriendBalance[];
}

interface FriendBalance {
  userId: string;
  name: string;
  avatarUrl?: string;
  netBalance: number; // positive = they owe you
  currency: string;
  sharedGroupIds: string[];
}
```

#### `GET /users/me/notification-preferences`
#### `PUT /users/me/notification-preferences`

```typescript
interface NotificationPreferences {
  enabled: boolean;
  newExpense: boolean;
  paymentSettlement: boolean;
  addedToGroup: boolean;
  debtReminders: boolean;
  pushEnabled: boolean;
  inAppBadgeEnabled: boolean;
}
```

#### `POST /users/me/activity/mark-read`

Updates `last_activity_read_at` on profile; resets unread badge.

#### `GET /activity`

Cross-group activity feed (expenses + settlements). Required because mobile `ActivityFeedScreen` already calls this endpoint but server does not implement it yet.

### 5.3 Database changes

Add columns to `profiles`:

```sql
ALTER TABLE profiles ADD COLUMN notification_preferences JSONB DEFAULT '{
  "enabled": true,
  "newExpense": true,
  "paymentSettlement": true,
  "addedToGroup": true,
  "debtReminders": true,
  "pushEnabled": true,
  "inAppBadgeEnabled": true
}'::jsonb;

ALTER TABLE profiles ADD COLUMN last_activity_read_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE profiles ADD COLUMN push_token TEXT;
```

### 5.4 Server services

**`DashboardService`** (new)
1. Fetch user's active groups via `group_members`
2. For each group, reuse `CalculationsService.calculateUserBalances`
3. **Closed group:** every member has `netBalance === 0`
4. **Friends:** distinct co-members across groups (exclude self); aggregate pairwise net balance across shared groups
5. **Unread:** count activities with `created_at > last_activity_read_at`

**`ExchangeRateService`** (new)
- Provider: exchangerate-api.com (free tier)
- In-memory cache, TTL 24 hours
- Base currency = user's `defaultCurrency`
- On API failure: dashboard returns breakdown only; headline shows "—"

**Push (REQ-NOTIF-02)**
- Mobile: `expo-notifications` registers token on login → saved to `profiles.push_token`
- Server: on expense/settlement create, check recipient prefs → Expo Push API
- **Phased delivery:** Phase 1 = preferences + token infrastructure; Phase 2 = event-triggered push sending

### 5.5 Balance formula (unchanged)

```text
netBalance = totalPaid - totalOwed + totalSettledReceived - totalSettledPaid
```

Positive = user is owed money; negative = user owes money.

---

## 6. Error Handling

| Scenario | UI behavior |
|----------|-------------|
| Dashboard load fails | EmptyState + retry button |
| Exchange rate API down | Show breakdown only; headline "—" |
| Push permission denied | Push toggle stays OFF; explanatory toast |
| WhatsApp not installed | Fallback to web WhatsApp URL |
| No friends | Friends section hidden |
| Notification prefs save fails | Toast error; revert toggle |

---

## 7. Testing

| Layer | Coverage |
|-------|----------|
| Server unit | `DashboardService` — closed groups, friend aggregation, currency conversion |
| Server unit | `ExchangeRateService` — cache hit/miss, fallback on failure |
| Mobile component | `ProfileScreen`, `SettingsScreen`, `SettingsRow`, `LegalSheet`, `BalanceHeroCard` |
| Mobile integration | Dashboard fetch → render stats and friends |

---

## 8. Implementation phases (recommended)

| Phase | Scope |
|-------|-------|
| **1** | `GET /activity`, `GET /users/me/dashboard`, profile UI redesign |
| **2** | Settings redesign, legal sheets, WhatsApp, rate app |
| **3** | Notification preferences API + settings toggles |
| **4** | Push notifications (Expo token + server sending) |
| **5** | In-app badge + mark-read on Activity tab focus |

---

## 9. Out of scope (v1)

- Dedicated friends screen
- Manual exchange rate override
- Offline dashboard cache
- Web app settings parity

---

## 10. Environment variables (new)

| Variable | App | Purpose |
|----------|-----|---------|
| `EXCHANGE_RATE_API_KEY` | server | exchangerate-api.com key |
| `APP_STORE_URL` | mobile | iOS rating link |
| `PLAY_STORE_URL` | mobile | Android rating link |
| `SUPPORT_WHATSAPP_NUMBER` | mobile | Default: +972528616878 |

---

*Spec self-reviewed: no placeholders, consistent with CODE QUALITY layer rules and existing theme.*
