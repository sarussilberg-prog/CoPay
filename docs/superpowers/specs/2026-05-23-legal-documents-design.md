# Server-Driven Legal Documents (Terms of Service & Privacy Policy)

**Date:** 2026-05-23
**Author:** Naveh Sarussi (with Claude)
**Status:** Draft — pending implementation

---

## 1. Goal & Motivation

Replace the current minimal, hard-coded Terms of Service and Privacy Policy strings in `i18n/locales/{en,he}.json` with **professional, legally-defensible documents** that are:

- **Compliant** with GDPR, UK GDPR, CCPA/CPRA, the Israeli Privacy Protection Law, and Apple/Google store requirements.
- **Server-driven** — content lives in Supabase, so the partnership can update legal language without shipping a new mobile release.
- **Presented natively** inside the app with a modern bottom-sheet UI, Markdown rendering, offline cache, and full RTL support.

This is required before Kupa's first public release.

### Legal Disclaimer

The documents drafted as part of this work are professional templates based on common practice for similar apps (Splitwise, Tricount) and the privacy/contract regulations cited above. **They are not a substitute for review by a licensed Israeli attorney.** Before going to production, an attorney must review and sign off on the final text — especially around jurisdiction, liability, and GDPR data-subject rights.

---

## 2. Context

- **App:** Kupa — mobile expense-sharing app (React Native + Expo SDK 54). The app **tracks balances** between users; it does **not** process real payments.
- **Backend:** Supabase only (Postgres + Auth + Storage + RLS).
- **Authentication:** Google OAuth via Supabase. No email/password, no magic link.
- **Audience:** Global, all locales. UI strings localized in English + Hebrew. Minimum user age: **16**.
- **Legal entity:** A new partnership ("the Partnership") will be registered in Israel before launch. Placeholder `[Partnership Name]` will be used until the registration completes.
- **Contact email:** `sarussilberg@gmail.com`.
- **Jurisdiction:** Israel; exclusive venue in the courts of the Tel Aviv district.
- **Monetization (current):** None. The app is free.
- **Monetization (planned):** Optional paid premium tier (Apple/Google IAP) and ads — both flagged as "future features" in the documents so a future launch does not require a new ToS/Privacy version.
- **Third-party services in production:** Supabase (data + storage), Google (OAuth only), Apple/Google (stores). No analytics, no Sentry, no push notifications today.
- **Account deletion (current):** Soft-delete only — `profiles.is_active=false`, `profiles.deleted_at=NOW()`. Historical expenses and settlements remain visible to other group members. This is disclosed in the Privacy Policy under "Data Retention" and justified under GDPR Art. 6(1)(f) legitimate interest (preserving the integrity of debt calculations for other group members). A future hard-delete enhancement is tracked separately.

---

## 3. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                       Mobile App (Expo)                          │
│                                                                  │
│  SettingsScreen.tsx                                              │
│    ├─ "Terms of Service" row    ──┐                              │
│    └─ "Privacy Policy"  row    ──┴──> LegalDocumentSheet         │
│                                       (slug, locale)             │
│                                              │                   │
│                                              ▼                   │
│                                    legal.service.ts              │
│                                       fetchLegalDocument()       │
│                                              │                   │
│                                              ▼                   │
│                            ┌─────────────────┴─────────────┐     │
│                            │                               │     │
│                       React Query                    AsyncStorage│
│                       (in-memory cache)           (offline cache)│
│                            │                               │     │
│                            └─────────────────┬─────────────┘     │
│                                              │                   │
└──────────────────────────────────────────────┼───────────────────┘
                                               │ HTTPS
                                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                       Supabase (Postgres)                        │
│                                                                  │
│   public.legal_documents                                         │
│     id | slug | locale | version | title | content_md            │
│     effective_date | is_published | created_at | updated_at      │
│                                                                  │
│   RLS: SELECT to anon WHERE is_published = true                  │
│        INSERT/UPDATE/DELETE blocked for all roles                │
│        (admin edits via Studio with service-role key)            │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. Database Schema

### 4.1 New table: `public.legal_documents`

| Column          | Type          | Constraints                                | Notes                                  |
|-----------------|---------------|--------------------------------------------|----------------------------------------|
| `id`            | UUID          | PK, default `gen_random_uuid()`            |                                        |
| `slug`          | TEXT          | NOT NULL, CHECK in (`'terms'`,`'privacy'`) | Document kind                          |
| `locale`        | TEXT          | NOT NULL, CHECK in (`'en'`,`'he'`)         | Translation                            |
| `version`       | TEXT          | NOT NULL                                   | Semver-like, e.g. `1.0.0`              |
| `title`         | TEXT          | NOT NULL                                   | Localized title shown in sheet header  |
| `content_md`    | TEXT          | NOT NULL                                   | Markdown body                          |
| `effective_date`| DATE          | NOT NULL                                   | Date displayed to user                 |
| `is_published`  | BOOLEAN       | NOT NULL, default `false`                  | Draft flag                             |
| `created_at`    | TIMESTAMPTZ   | NOT NULL, default `now()`                  |                                        |
| `updated_at`    | TIMESTAMPTZ   | NOT NULL, default `now()`                  | Trigger keeps in sync                  |

**Indexes:**
- Partial unique index on `(slug, locale) WHERE is_published = true` — guarantees exactly one published version per (slug, locale).
- Index on `(slug, locale, is_published)` to accelerate the standard fetch query.

**Triggers:**
- `set_updated_at()` BEFORE UPDATE — touches `updated_at` on any change.

### 4.2 Row-Level Security

```sql
ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read of published docs"
  ON public.legal_documents
  FOR SELECT
  TO anon, authenticated
  USING (is_published = true);

-- No INSERT/UPDATE/DELETE policies → blocked for anon and authenticated.
-- Edits performed by admin via Supabase Studio (service-role key bypasses RLS).
```

### 4.3 Migrations

Two separate migration files for clean separation of schema and content:

1. `cost-share-app/supabase/migrations/<timestamp>_legal_documents.sql` — table, indexes, RLS, trigger.
2. `cost-share-app/supabase/migrations/<timestamp>_seed_legal_documents.sql` — INSERT statements for the four initial rows (terms/en, terms/he, privacy/en, privacy/he), each with `is_published=true` and the full Markdown body delimited with PostgreSQL dollar-quoting (`$content$ ... $content$`) to avoid escaping headaches.

---

## 5. Mobile Service Layer

### 5.1 Types (shared package)

Add to `packages/shared` types:

```ts
export type LegalSlug = 'terms' | 'privacy';

export interface LegalDocument {
  id: string;
  slug: LegalSlug;
  locale: 'en' | 'he';
  version: string;
  title: string;
  contentMd: string;
  effectiveDate: string; // ISO date YYYY-MM-DD
  updatedAt: string;     // ISO timestamp
}
```

### 5.2 `services/legal.service.ts` (new)

Responsibilities:

1. **Fetch** the published document for the given `slug` + `locale` from `legal_documents`.
2. **Fallback** to `en` when the requested locale is missing (defensive — seed will always provide both).
3. **Cache** the result in `AsyncStorage` under key `legal:<slug>:<locale>` with the full `LegalDocument` JSON.
4. **Stale-while-revalidate** behaviour: when called, return cache immediately (if any) and refresh in the background via React Query.

**Public API:**

```ts
async function fetchLegalDocument(
  slug: LegalSlug,
  locale: 'en' | 'he'
): Promise<LegalDocument>
```

Throws if both network and cache fail.

### 5.3 React Query integration

- Use `@tanstack/react-query` (already installed).
- `useLegalDocument(slug)` hook reads current locale from i18n, calls `fetchLegalDocument`, returns `{ data, isLoading, isError, refetch }`.
- `staleTime: 5 * 60 * 1000` (5 minutes), `gcTime: 24 * 60 * 60 * 1000` (24h).
- AsyncStorage hydration on mount via React Query's `persistQueryClient` (only the `legal:*` keys).

---

## 6. UI Component

### 6.1 New component: `components/settings/LegalDocumentSheet.tsx`

Replaces the existing `LegalSheet.tsx` (which will be deleted).

**Props:**

```ts
interface Props {
  visible: boolean;
  slug: LegalSlug;
  onClose: () => void;
}
```

The component fetches the document itself via `useLegalDocument(slug)` — no need for the parent to pre-load.

### 6.2 Visual structure (top → bottom)

```
┌─────────────────────────────────┐
│         ━━ (drag handle)        │
│                                 │
│  ←   Terms of Service       ✕   │  ← Sticky header
│  Updated: May 23, 2026 · v1.0   │  ← Meta line
├─────────────────────────────────┤
│                                 │
│  # Section heading              │
│  ────────────────────────       │
│                                 │
│  Body text in Markdown.         │  ← Scrollable Markdown
│  ## Subsection                  │
│  ...                            │
│                                 │
├─────────────────────────────────┤
│  ●●●●○○○○○○ (progress)         │  ← Read-progress bar
│       [I understand]            │  ← Sticky CTA
└─────────────────────────────────┘
```

### 6.3 Specifications

- **Sheet container:** matches the existing `DeleteAccountWarningSheet` pattern for visual consistency. Height: 92% of screen, rounded-top, slide-up animation with spring.
- **Header (sticky):** title from doc, meta line `Updated: {effectiveDate} · v{version}`, close (X) button.
- **Body:** `ScrollView` rendering Markdown via `react-native-markdown-display` (new dependency). Custom styles wired to the Kupa palette (NativeWind tokens).
- **Read progress:** thin bar above CTA that fills with scroll position.
- **CTA (sticky bottom):** primary button "I understand" / "הבנתי" that calls `onClose`.
- **Loading state:** three skeleton shimmer rows (no spinner).
- **Error state:** illustration + message + "Try again" button that calls `refetch()`. If cached version exists, show it with a small toast "Showing saved version".
- **Markdown styling:**
  - `#` / `##` / `###`: bold, 22/18/16 px, generous top margin
  - Body: 16 px, line-height 1.6
  - `**bold**`, `*italic*`, lists, links (open via `expo-web-browser`), block-quotes
- **RTL:** all padding, alignment, and the progress bar respect `I18nManager.isRTL`.
- **Animations:** entrance slide-up with spring; CTA scale-on-press.

### 6.4 SettingsScreen wiring

`screens/profile/SettingsScreen.tsx`:

- Replace the two `<LegalSheet ... body={t('legal.termsBody')} />` and `body={t('legal.privacyBody')}` usages with:

  ```tsx
  <LegalDocumentSheet visible={showTerms}   slug="terms"   onClose={...} />
  <LegalDocumentSheet visible={showPrivacy} slug="privacy" onClose={...} />
  ```

- No other changes to settings logic.

### 6.5 i18n updates

In `i18n/locales/{en,he}.json`:

- **Remove:** `legal.termsBody`, `legal.privacyBody` (no longer needed — content lives in DB).
- **Keep:** `legal.termsTitle`, `legal.privacyTitle`, `legal.close`.
- **Add UI strings:**
  - `legal.loading` — "Loading…" / "טוען…"
  - `legal.errorTitle` — "Couldn't load document" / "לא הצלחנו לטעון את המסמך"
  - `legal.errorBody` — "Check your connection and try again." / "בדוק את החיבור ונסה שוב."
  - `legal.retry` — "Try again" / "נסה שוב"
  - `legal.cachedNotice` — "Showing saved version" / "מציג גרסה שמורה"
  - `legal.lastUpdated` — "Updated: {{date}}" / "עודכן: {{date}}"
  - `legal.versionLabel` — "v{{version}}" / "גרסה {{version}}"
  - `legal.understood` — "I understand" / "הבנתי"

---

## 7. Document Content

### 7.1 Terms of Service — section outline

1. Acceptance of Terms (incl. minimum age 16)
2. Description of the Service (balance tracking only; not a financial institution; does not process payments)
3. Your Account (Google OAuth; accuracy of info; account responsibility; no transfer)
4. User-Generated Content (groups, expenses, receipts; limited license to Kupa to operate the service)
5. Acceptable Use (no fraud, scraping, harassment, spam, reverse engineering, etc.)
6. Invite Links & Groups (sharing implications; rotating invites; user responsibility)
7. Third-Party Services (Google Sign-In, app stores, Supabase — subject to their terms)
8. Intellectual Property (all rights reserved by the Partnership; limited revocable license to users)
9. Future Paid Features (premium subscriptions via Apple/Google IAP; auto-renewal disclosures; cancellation per store rules)
10. Future Advertising (placeholder; details added in Privacy Policy when launched)
11. Termination & Account Closure (user-initiated and Kupa-initiated; consequences; soft-delete behaviour cross-referenced)
12. Disclaimers (AS-IS; no warranty of calculation accuracy; not a party to monetary transactions between users)
13. Limitation of Liability (capped at the minimum allowed by law)
14. Indemnification
15. Changes to the Terms (notice in-app for material changes; continued use = acceptance)
16. Governing Law & Venue (Israel; Tel Aviv courts)
17. Miscellaneous (severability, waiver, entire agreement)
18. Contact: `sarussilberg@gmail.com`

### 7.2 Privacy Policy — section outline

1. Introduction & Controller (Partnership identity; contact)
2. Information We Collect
   - Provided by you: name, email, avatar, phone (optional), currency, language
   - Generated by use: groups, expenses, receipt images, settlements, friendships, blocks
   - Automatic technical: Supabase logs (IP, timestamps), error logs
   - Explicitly **not** collected today: location, device IDs, push tokens, analytics
3. How We Use Information (each purpose mapped to a GDPR Art. 6 legal basis: contract performance, legitimate interest, consent)
4. Sharing & Disclosure
   - Group members (your name, avatar, expenses you create are visible inside groups)
   - Invitees (preview includes sender's name and group name)
   - Service providers / processors: Supabase, Google (OAuth), Apple/Google (stores)
   - Law enforcement: only when compelled by valid legal process
5. Third-Party Services & Cookies (no cookies in the mobile app; Google's policy applies to OAuth)
6. International Data Transfers (where Supabase hosts; SCCs for EU users)
7. Data Retention
   - Active account: as long as you use the service
   - After deletion: soft-delete — name/email/avatar are hidden or replaced with "Deleted user"; expense records remain visible to other group members to preserve calculation integrity (legitimate interest)
   - Logs: 30–90 days
   - Backups: up to 7 days (Supabase PITR)
8. Your Rights (GDPR + CCPA + Israeli law)
   - Access, correction, deletion (subject to retention exceptions)
   - Portability (JSON export — flag as available on request)
   - Object to processing; withdraw consent
   - Lodge complaint: Israeli Privacy Protection Authority / EU DPA / UK ICO
   - CCPA: right to know, right to delete, right to non-sale (no sale ever occurs)
   - How to exercise: `sarussilberg@gmail.com` — response within 30 days
9. Security (TLS in transit; Supabase RLS; passwords not stored — OAuth only; no absolute guarantee)
10. Minors (16+ only; deletion on discovery)
11. Future features that may affect privacy:
    - Ads (will disclose IDFA / Android Ad ID handling and request consent before launch)
    - Paid subscriptions (Apple/Google handle billing; we see subscription status only)
    - Analytics (will update this Policy before enabling)
12. Changes to this Policy (≥14 days in-app notice for material changes)
13. Contact: `sarussilberg@gmail.com`

### 7.3 Versioning

- Initial publish: `version = "1.0.0"`, `effective_date` = day of v1.0 store submission (TBD at implementation time).
- Minor edits (typo fix, rephrasing): update in place via Supabase Studio; `updated_at` ticks; `version` stays.
- Material changes: insert new row with bumped `version` (1.0.0 → 1.1.0), set previous row `is_published=false`. History preserved in-table.

---

## 8. Testing

### 8.1 Unit / integration tests

- `__tests__/services/legal.service.test.ts`
  - Mocks Supabase client; verifies the SELECT query shape (`eq` on slug, locale, is_published).
  - Verifies AsyncStorage cache write on success, read on subsequent calls.
  - Verifies network-failure fallback to cache.
  - Verifies cache-miss + network-failure throws.

- `__tests__/components/settings/LegalDocumentSheet.test.tsx`
  - Renders skeleton while loading.
  - Renders title, meta line, and Markdown body on success.
  - Renders error UI with retry button on failure.
  - Renders cached banner when network fails but cache exists.
  - Calls `onClose` on CTA press.

### 8.2 Manual verification (per `superpowers:verification-before-completion`)

- Open Terms in English — content loads, renders Markdown, RTL false.
- Open Privacy in Hebrew — RTL true, headings/lists align right.
- Disable Wi-Fi → re-open — cached version appears, "Showing saved version" toast.
- Edit a document in Supabase Studio → re-open — new version appears within 5 minutes (or on pull-to-refresh).
- Confirm RLS: from `anon` connection, INSERT/UPDATE/DELETE fails; SELECT of `is_published=false` returns no rows.

---

## 9. Out of Scope (Tracked Separately)

- **Hard-delete of personal data** on account deletion (current behaviour is soft-delete; new task to be created after this work merges).
- **Re-acceptance flow** when `version` bumps (modal that forces re-acknowledgement on next launch).
- **Public `kupa.pro/legal/*` web pages** mirroring the same content (needed for App Store Connect Privacy Policy URL — to be addressed in a separate web task; ToS/Privacy URL fields can point to the same Markdown rendered as web pages on launch).
- **JSON data export endpoint** for GDPR portability (Policy mentions it is available on request; implementing self-service export is a follow-up).
- **In-app cookie/IDFA consent prompt** — not needed today (no ads, no analytics); to be added when those features launch.

---

## 10. Risks & Open Items

| Risk / item                                                                 | Mitigation                                                                                   |
|------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------|
| Legal text not reviewed by an Israeli attorney before launch                 | Block v1.0 submission until attorney sign-off on the final Markdown.                         |
| Partnership name not yet registered                                          | Use `[Partnership Name]` placeholder; replace in DB via UPDATE once registered.              |
| `effective_date` for v1.0 unknown                                            | Set placeholder at seed time; UPDATE row before store submission.                            |
| Soft-delete may attract EU complaints                                        | Disclose explicitly under legitimate interest; track hard-delete enhancement separately.     |
| `react-native-markdown-display` maintenance / RTL bugs                       | Pinned version; basic Markdown features used; fallback to plain `<Text>` rendering if issue surfaces in QA. |
| App Store reviewers expect a Privacy Policy URL                              | Create `kupa.pro/legal/privacy` page in the web app (out of scope here, but flagged).        |

---

## 11. Acceptance Criteria

- New table `legal_documents` exists with the schema above, RLS enabled, four published rows seeded (terms/en, terms/he, privacy/en, privacy/he).
- Tapping "Terms of Service" or "Privacy Policy" in Settings opens the new `LegalDocumentSheet` showing the live document from Supabase, with title, effective date, version, and Markdown body.
- Closing the sheet and re-opening offline still works (cache hit).
- Updating a row via Supabase Studio is reflected in the app within 5 minutes (or immediately on app relaunch).
- All UI strings localized in both English and Hebrew; RTL layout correct in Hebrew.
- Unit and component tests pass; manual verification checklist completed.
- Old `LegalSheet.tsx`, `legal.termsBody`, `legal.privacyBody` removed.
