# Server-Driven Legal Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hard-coded i18n Terms of Service and Privacy Policy strings with professional, legally-compliant Markdown documents served from Supabase, rendered in a modern bottom-sheet UI with offline cache.

**Architecture:** New `legal_documents` table in Supabase holds Markdown content keyed by `(slug, locale)`. Mobile service fetches via React Query + AsyncStorage cache. New `LegalDocumentSheet` component renders Markdown with skeleton/error states and RTL support.

**Tech Stack:** Postgres (Supabase), TypeScript, React Native (Expo SDK 54), @tanstack/react-query, AsyncStorage, react-native-markdown-display, NativeWind, Jest + @testing-library/react-native.

**Reference spec:** `docs/superpowers/specs/2026-05-23-legal-documents-design.md`

---

## File Map

### Create
- `cost-share-app/supabase/legal-documents.sql` — table, RLS, indexes
- `cost-share-app/supabase/seed-legal-documents.sql` — initial seed of 4 rows (terms/en, terms/he, privacy/en, privacy/he)
- `cost-share-app/apps/mobile/services/legal.service.ts` — fetch + AsyncStorage cache fallback
- `cost-share-app/apps/mobile/hooks/queries/useLegalDocument.ts` — React Query hook
- `cost-share-app/apps/mobile/components/settings/LegalDocumentSheet.tsx` — bottom-sheet UI with Markdown rendering
- `cost-share-app/apps/mobile/__tests__/services/legal.service.test.ts`
- `cost-share-app/apps/mobile/__tests__/components/settings/LegalDocumentSheet.test.tsx`

### Modify
- `cost-share-app/packages/shared/src/types/index.ts` — add `LegalSlug`, `LegalDocument` types
- `cost-share-app/apps/mobile/hooks/queries/keys.ts` — add `legalDocument` query key
- `cost-share-app/apps/mobile/screens/profile/SettingsScreen.tsx` — swap `LegalSheet` → `LegalDocumentSheet`
- `cost-share-app/apps/mobile/i18n/locales/en.json` — remove `legal.termsBody`/`privacyBody`; add new UI keys
- `cost-share-app/apps/mobile/i18n/locales/he.json` — remove `legal.termsBody`/`privacyBody`; add new UI keys
- `cost-share-app/apps/mobile/package.json` — add `react-native-markdown-display` dependency
- `cost-share-app/apps/mobile/__tests__/screens/profile/SettingsScreen.test.tsx` — update assertions if they hit the removed body strings

### Delete
- `cost-share-app/apps/mobile/components/settings/LegalSheet.tsx`

---

## Task 1: Create `legal_documents` table with RLS

**Files:**
- Create: `cost-share-app/supabase/legal-documents.sql`

- [ ] **Step 1: Write the SQL migration**

Create `cost-share-app/supabase/legal-documents.sql`:

```sql
-- ============================================================================
-- Legal Documents table — server-driven Terms of Service & Privacy Policy.
--
-- Content is Markdown stored per (slug, locale). Public anon read is allowed
-- ONLY for is_published = true. All writes are blocked via RLS; edits are
-- performed by an admin using the service-role key (Supabase Studio).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.legal_documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            TEXT NOT NULL CHECK (slug IN ('terms', 'privacy')),
    locale          TEXT NOT NULL CHECK (locale IN ('en', 'he')),
    version         TEXT NOT NULL,
    title           TEXT NOT NULL,
    content_md      TEXT NOT NULL,
    effective_date  DATE NOT NULL,
    is_published    BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Exactly one published row per (slug, locale).
CREATE UNIQUE INDEX IF NOT EXISTS legal_documents_published_unique
    ON public.legal_documents (slug, locale)
    WHERE is_published = true;

-- Lookup index for the standard fetch query.
CREATE INDEX IF NOT EXISTS legal_documents_lookup
    ON public.legal_documents (slug, locale, is_published);

-- Reuse the existing updated_at trigger from schema.sql.
DROP TRIGGER IF EXISTS update_legal_documents_updated_at ON public.legal_documents;
CREATE TRIGGER update_legal_documents_updated_at
    BEFORE UPDATE ON public.legal_documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row-Level Security: public read of published rows, all writes blocked.
ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read published legal documents" ON public.legal_documents;
CREATE POLICY "Public can read published legal documents"
    ON public.legal_documents
    FOR SELECT
    TO anon, authenticated
    USING (is_published = true);

-- No INSERT/UPDATE/DELETE policies → all writes blocked for anon/authenticated.
-- Admin edits go through Supabase Studio (service-role key bypasses RLS).

GRANT SELECT ON public.legal_documents TO anon, authenticated;
```

- [ ] **Step 2: Apply migration to Supabase**

Run the file against the connected Supabase project using the MCP tool (the migration is idempotent thanks to `IF NOT EXISTS` / `DROP ... IF EXISTS`). Use `mcp__supabase__apply_migration` with name `legal_documents` and the SQL above.

Expected: Migration succeeds. Tool returns success.

- [ ] **Step 3: Verify table & RLS via SQL**

Run via `mcp__supabase__execute_sql`:

```sql
SELECT
    table_name,
    (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'legal_documents') AS policy_count,
    (SELECT relrowsecurity FROM pg_class WHERE relname = 'legal_documents') AS rls_enabled
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'legal_documents';
```

Expected: 1 row, `policy_count = 1`, `rls_enabled = true`.

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/supabase/legal-documents.sql
git commit -m "feat(db): add legal_documents table with RLS"
```

---

## Task 2: Write Terms of Service — English content

**Files:**
- Create: `cost-share-app/supabase/seed-legal-documents.sql` (will be extended in later tasks; create now with header + ToS-EN only)

- [ ] **Step 1: Create the seed file with ToS-EN content**

Create `cost-share-app/supabase/seed-legal-documents.sql`:

```sql
-- ============================================================================
-- Seed: initial published versions of Terms of Service & Privacy Policy.
-- One row per (slug, locale). Uses INSERT ... ON CONFLICT to allow re-running.
--
-- NOTE: text values are wrapped in dollar-quoting ($content$...$content$) so
-- Markdown body doesn't need apostrophe-escaping.
-- ============================================================================

-- Use a placeholder for the partnership name until the legal entity is
-- registered; update this row via Supabase Studio post-registration.
-- effective_date should be set to the v1.0 store-submission date before launch.

INSERT INTO public.legal_documents
    (slug, locale, version, title, content_md, effective_date, is_published)
VALUES (
    'terms',
    'en',
    '1.0.0',
    'Terms of Service',
    $content$
# Terms of Service

**Effective date:** {{EFFECTIVE_DATE}}
**Version:** 1.0.0

Welcome to Kupa. These Terms of Service ("Terms") are a binding agreement between you and **[Partnership Name]**, a partnership organized under the laws of the State of Israel ("Kupa", "we", "us"). They govern your use of the Kupa mobile application and any related services (collectively, the "Service").

**Please read these Terms carefully. If you do not agree, do not use the Service.**

## 1. Acceptance of Terms

By creating an account or using the Service, you confirm that you have read, understood, and agreed to be bound by these Terms and by our Privacy Policy. You must be at least **16 years old** to use Kupa. If you are between 16 and 18, you confirm that you have the consent of a parent or legal guardian to use the Service.

## 2. Description of the Service

Kupa is a tool that helps friends and groups **track shared expenses and calculate balances** between members. Kupa **does not process, hold, transfer, or guarantee any money**. We are not a bank, payment processor, money transmitter, or financial institution. All actual payments between users occur outside of the Service.

Kupa makes no representation that calculated balances are free of errors. You are solely responsible for verifying any amount before paying or accepting payment from another user.

## 3. Your Account

You sign in to Kupa using Google. By doing so, you authorize Google to share certain profile information (name, email, profile image) with us, as described in our Privacy Policy.

You agree to: (a) provide accurate, current, and complete information; (b) keep your account secure; (c) not share, transfer, or sell your account; and (d) notify us at sarussilberg@gmail.com of any unauthorized use. You are responsible for all activity that occurs under your account.

## 4. User Content

You may create groups, add expenses, upload receipt images, record settlements, and post other content (collectively, "User Content"). You retain all rights you have in your User Content. By submitting User Content, you grant Kupa a worldwide, non-exclusive, royalty-free license to host, store, reproduce, modify (for technical purposes), and display your User Content **solely for the purpose of operating and providing the Service to you and the other group members you choose to share it with**.

You represent that you have all rights necessary to submit your User Content and that it does not violate any law or third-party right.

## 5. Acceptable Use

You agree **not** to:

- Use the Service for any unlawful, fraudulent, or deceptive purpose.
- Harass, threaten, or impersonate any person.
- Upload content that is illegal, infringing, defamatory, obscene, or hateful.
- Attempt to gain unauthorized access to the Service, other accounts, or our infrastructure.
- Reverse engineer, decompile, or attempt to extract source code, except as permitted by law.
- Scrape, crawl, or use automated means to access the Service without our written consent.
- Use the Service to send spam, advertising, or unsolicited messages.
- Interfere with or disrupt the Service or its security features.

We may suspend or terminate your account if you violate these rules.

## 6. Invite Links & Groups

The Service generates invite links for friends and groups. Anyone with a valid link can preview limited public information (your name, profile image, group name) and may join. **You are responsible for whom you share invite links with.** You can rotate (invalidate and regenerate) an invite link at any time from within the Service.

Joining a group means your name, profile image, and the expenses and settlements you create are visible to all current and future members of that group.

## 7. Third-Party Services

The Service integrates with third-party services, including Google (sign-in), Apple App Store, Google Play, and our infrastructure provider (Supabase). Your use of those services is governed by their own terms and privacy policies. We are not responsible for third-party services.

## 8. Intellectual Property

The Service, including its software, design, trademarks, and branding, is owned by Kupa and its licensors and is protected by intellectual-property laws. Subject to your compliance with these Terms, we grant you a limited, non-exclusive, non-transferable, revocable license to use the Service for your personal, non-commercial use.

## 9. Paid Features (Future)

The Service is currently free. We may introduce optional paid features or subscription plans in the future. Any paid features will be purchased through Apple's or Google's in-app purchase systems and are subject to their billing rules, including auto-renewal, cancellation, and refund policies. We will disclose any pricing and renewal details before you confirm a purchase.

## 10. Advertising (Future)

The Service does not currently display third-party advertising. We may introduce advertising in the future. If we do, we will update our Privacy Policy with details about ad partners, identifiers, and applicable consent mechanisms before advertising is enabled.

## 11. Termination and Account Closure

You may close your account at any time from the Settings screen. Upon closure, your account is marked inactive and your personal profile information is hidden. **However, the expense records, settlements, and group activity you created remain visible to other group members as "Deleted user"**, to preserve the integrity of historical balance calculations. See the Privacy Policy for details.

We may suspend or terminate your access to the Service if you breach these Terms or if we are required to do so by law.

## 12. Disclaimer of Warranties

THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE", WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, OR ACCURACY OF BALANCES OR CALCULATIONS. WE ARE NOT A PARTY TO ANY ACTUAL PAYMENT OR TRANSACTION BETWEEN USERS, AND WE DISCLAIM ALL RESPONSIBILITY FOR SUCH PAYMENTS.

## 13. Limitation of Liability

TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, KUPA, ITS PARTNERS, AND AGENTS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, OR GOODWILL, ARISING OUT OF OR IN CONNECTION WITH THE SERVICE. OUR AGGREGATE LIABILITY FOR ANY CLAIM RELATED TO THE SERVICE IS LIMITED TO THE GREATER OF (A) THE AMOUNTS YOU PAID US IN THE TWELVE MONTHS PRECEDING THE CLAIM, OR (B) ONE HUNDRED ISRAELI SHEKELS (₪100).

Nothing in these Terms limits liability that cannot be limited by applicable law (for example, liability for gross negligence, willful misconduct, or personal injury).

## 14. Indemnification

You agree to indemnify and hold Kupa harmless from any claim, loss, or expense (including reasonable legal fees) arising from your User Content, your use of the Service, or your violation of these Terms or any law.

## 15. Changes to the Terms

We may update these Terms from time to time. For material changes, we will notify you in the Service before the changes take effect. Your continued use of the Service after the effective date of the updated Terms constitutes acceptance of the new Terms.

## 16. Governing Law and Venue

These Terms are governed by the laws of the **State of Israel**, without regard to its conflict-of-law principles. The competent courts located in the **Tel Aviv district** have exclusive jurisdiction over any dispute arising out of or in connection with these Terms or the Service.

## 17. Miscellaneous

- **Severability.** If any provision of these Terms is held unenforceable, the remaining provisions will continue in full force.
- **No waiver.** Our failure to enforce any right is not a waiver of that right.
- **Entire agreement.** These Terms, together with the Privacy Policy, constitute the entire agreement between you and Kupa regarding the Service.
- **Assignment.** You may not assign these Terms; we may assign them in connection with a merger, acquisition, or sale of assets.

## 18. Contact

Questions about these Terms can be sent to **sarussilberg@gmail.com**.
$content$,
    DATE '2026-01-01',
    true
)
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Verify the SQL parses by applying it (idempotent)**

Apply via `mcp__supabase__apply_migration` with name `seed_legal_documents` and the SQL above.

Expected: Success.

- [ ] **Step 3: Verify the row was inserted**

Run via `mcp__supabase__execute_sql`:

```sql
SELECT slug, locale, version, title, LENGTH(content_md) AS body_chars, is_published
FROM public.legal_documents
WHERE slug = 'terms' AND locale = 'en';
```

Expected: 1 row, `body_chars > 3000`, `is_published = true`.

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/supabase/seed-legal-documents.sql
git commit -m "feat(db): seed Terms of Service (English)"
```

---

## Task 3: Write Terms of Service — Hebrew content

**Files:**
- Modify: `cost-share-app/supabase/seed-legal-documents.sql`

- [ ] **Step 1: Append Hebrew ToS to seed file**

Append a second `INSERT` block to `cost-share-app/supabase/seed-legal-documents.sql`:

```sql
INSERT INTO public.legal_documents
    (slug, locale, version, title, content_md, effective_date, is_published)
VALUES (
    'terms',
    'he',
    '1.0.0',
    'תנאי שירות',
    $content$
# תנאי שירות

**תאריך כניסה לתוקף:** {{EFFECTIVE_DATE}}
**גרסה:** 1.0.0

ברוכים הבאים ל-Kupa. תנאי שירות אלה ("התנאים") הם הסכם מחייב בינך לבין **[Partnership Name]**, שותפות הפועלת לפי חוקי מדינת ישראל ("Kupa", "אנחנו", "אנו"), ומסדירים את השימוש שלך באפליקציית המובייל של Kupa ובכל השירותים הקשורים אליה (להלן יחד: "השירות").

**אנא קרא את התנאים בעיון. אם אינך מסכים להם — אל תשתמש בשירות.**

## 1. קבלת התנאים

יצירת חשבון או שימוש בשירות מהווים אישור שקראת, הבנת והסכמת להיות מחויב בתנאים אלה ובמדיניות הפרטיות שלנו. הגיל המינימלי לשימוש ב-Kupa הוא **16**. אם אתה בין הגילאים 16 ו-18, אתה מאשר שקיבלת את הסכמת הורה או אפוטרופוס לשימוש בשירות.

## 2. תיאור השירות

Kupa הוא כלי שעוזר לחברים ולקבוצות **לעקוב אחר הוצאות משותפות ולחשב יתרות** בין חברים. **Kupa אינה מעבדת, מחזיקה, מעבירה או מבטיחה כסף.** איננו בנק, ספק שירותי תשלום, מעביר כספים או מוסד פיננסי. כל ההעברות הכספיות בפועל בין משתמשים מתבצעות מחוץ לשירות.

Kupa אינה מתחייבת שהיתרות המחושבות נטולות שגיאות. האחריות לאמת כל סכום לפני תשלום או קבלת תשלום ממשתמש אחר היא עליך.

## 3. החשבון שלך

ההתחברות ל-Kupa מתבצעת באמצעות Google. בכך אתה מסמיך את Google לשתף איתנו מידע מסוים מהפרופיל שלך (שם, אימייל, תמונת פרופיל), כמתואר במדיניות הפרטיות שלנו.

אתה מסכים: (א) לספק מידע מדויק, עדכני ושלם; (ב) לשמור על אבטחת החשבון שלך; (ג) לא לשתף, להעביר או למכור את החשבון; ו-(ד) להודיע לנו בכתובת sarussilberg@gmail.com על כל שימוש לא מורשה. אתה אחראי לכל פעילות שמתרחשת תחת חשבונך.

## 4. תוכן משתמש

אתה רשאי ליצור קבוצות, להוסיף הוצאות, להעלות תמונות קבלות, לתעד התחשבנויות ולפרסם תוכן נוסף (להלן יחד: "תוכן משתמש"). כל הזכויות בתוכן המשתמש שלך נשארות שלך. בשליחת תוכן משתמש אתה מעניק ל-Kupa רישיון עולמי, לא בלעדי וללא תמלוגים לארח, לאחסן, לשכפל, לבצע התאמות טכניות ולהציג את תוכן המשתמש שלך **אך ורק לצורך הפעלת השירות ומתן השירות לך ולחברי הקבוצות שבחרת לשתף איתם**.

אתה מצהיר שיש לך את כל הזכויות הנדרשות להגשת תוכן המשתמש ושהוא אינו מפר חוק או זכות של צד שלישי.

## 5. שימוש מקובל

אתה מסכים **שלא**:

- להשתמש בשירות לכל מטרה לא חוקית, מטעה או הונאתית.
- להטריד, לאיים, להתחזות, או לפגוע באדם אחר.
- להעלות תוכן בלתי-חוקי, מפר זכויות, משמיץ, מגונה או שונא.
- לנסות להשיג גישה לא מורשית לשירות, לחשבונות אחרים או לתשתית שלנו.
- לבצע הנדסה לאחור, פירוק או כל ניסיון להפיק את קוד המקור, אלא אם הדבר מותר בחוק.
- לבצע scraping/crawling או לעשות שימוש באמצעים אוטומטיים כדי לגשת לשירות ללא הסכמתנו בכתב.
- להשתמש בשירות כדי לשלוח דואר זבל, פרסומת או הודעות שאינן מבוקשות.
- להפריע לשירות או לעקוף את אמצעי האבטחה שלו.

אנו רשאים להשעות או לבטל את חשבונך אם תפר כללים אלה.

## 6. קישורי הזמנה וקבוצות

השירות מייצר קישורי הזמנה לחברים ולקבוצות. כל מי שמחזיק בקישור תקף יכול לצפות במידע ציבורי מוגבל (שמך, תמונת הפרופיל שלך, שם הקבוצה) ולהצטרף. **האחריות על מי שאתה שולח אליו את הקישור — היא עליך.** ניתן לרענן (לבטל וליצור מחדש) קישור הזמנה בכל עת מתוך השירות.

הצטרפות לקבוצה משמעותה ששמך, תמונת הפרופיל שלך, וההוצאות וההתחשבנויות שאתה יוצר חשופים לכל החברים הקיימים והעתידיים באותה קבוצה.

## 7. שירותי צד שלישי

השירות משתלב עם שירותי צד שלישי, כולל Google (התחברות), Apple App Store, Google Play, וספק התשתית שלנו (Supabase). השימוש שלך בשירותים אלה כפוף לתנאים ולמדיניויות הפרטיות שלהם. איננו אחראים לשירותי צד שלישי.

## 8. קניין רוחני

השירות, לרבות התוכנה, העיצוב, סימני המסחר והמיתוג, הוא בבעלות Kupa והמעניקים שלה ומוגן בחוקי קניין רוחני. בכפוף לעמידתך בתנאים אלה, אנו מעניקים לך רישיון מוגבל, לא בלעדי, לא ניתן להעברה וניתן לביטול לשימוש בשירות לצרכים אישיים ולא-מסחריים.

## 9. תכונות בתשלום (עתידיות)

השירות חינמי כיום. ייתכן ונציע בעתיד תכונות בתשלום או תוכניות מנוי. תכונות בתשלום יירכשו דרך מערכות הרכישה הפנים-אפליקציה של Apple ו-Google ויהיו כפופות לכללי החיוב שלהן, לרבות חידוש אוטומטי, ביטול, ומדיניות החזרים. נציג את פרטי המחיר והחידוש לפני אישור הרכישה.

## 10. פרסום (עתידי)

השירות אינו מציג כיום פרסומות מצד שלישי. ייתכן ונציג פרסומות בעתיד. במקרה זה, נעדכן את מדיניות הפרטיות בפרטים על שותפי פרסום, מזהים פרסומיים ומנגנוני הסכמה רלוונטיים — לפני הפעלת התכונה.

## 11. סיום ומחיקת חשבון

אתה רשאי לסגור את חשבונך בכל עת ממסך ההגדרות. עם סגירת החשבון, החשבון מסומן כלא-פעיל ופרטי הפרופיל האישי שלך מוסתרים. **עם זאת, רישומי ההוצאות, ההתחשבנויות והפעילות בקבוצות שיצרת נשארים גלויים לחברי הקבוצה כ"משתמש מחוק"** — כדי לשמר את תקינות חישובי היתרות ההיסטוריים. ראה פירוט במדיניות הפרטיות.

אנו רשאים להשעות או לבטל את גישתך לשירות אם הפרת תנאים אלה או אם נדרש על ידי דין.

## 12. כתב ויתור על אחריות

השירות ניתן "כפי שהוא" ("AS IS") ו"כפי שזמין", ללא אחריות מכל סוג, מפורשת או משתמעת, לרבות אחריות לסחירות, התאמה למטרה מסוימת, אי-הפרה או דיוק היתרות והחישובים. איננו צד לכל תשלום בפועל או עסקה בין משתמשים, ואנו מסירים כל אחריות לתשלומים כאלה.

## 13. הגבלת אחריות

ככל המותר על פי הדין החל, Kupa, שותפיה ושלוחיה לא יישאו באחריות לכל נזק עקיף, מקרי, מיוחד, תוצאתי או עונשי, או לאובדן רווחים, נתונים או מוניטין, הנובע או קשור לשירות. סך האחריות המצטברת שלנו לכל תביעה הקשורה לשירות מוגבל לגדול מבין (א) הסכומים ששילמת לנו ב-12 החודשים שקדמו לתביעה, או (ב) **מאה שקלים חדשים (₪100)**.

שום דבר בתנאים אלה אינו מגביל אחריות שלא ניתן להגביל לפי דין (לדוגמה, רשלנות חמורה, התנהגות פסולה במזיד, או נזק גוף).

## 14. שיפוי

אתה מסכים לשפות את Kupa ולפטור אותה מכל תביעה, אובדן או הוצאה (לרבות שכר טרחת עורכי דין סביר) הנובעים מתוכן המשתמש שלך, מהשימוש שלך בשירות, או מהפרה של תנאים אלה או של כל דין.

## 15. שינויים בתנאים

אנו רשאים לעדכן את התנאים מעת לעת. בשינויים מהותיים, נודיע לך בשירות לפני כניסת השינויים לתוקף. המשך השימוש בשירות לאחר תאריך התוקף של התנאים המעודכנים מהווה הסכמה לתנאים החדשים.

## 16. דין חל וסמכות שיפוט

תנאים אלה כפופים לדיני **מדינת ישראל**, ללא התחשבות בכללי ברירת הדין. **סמכות השיפוט הייחודית** לכל מחלוקת הנובעת מתנאים אלה או מהשירות נתונה לבתי המשפט המוסמכים **במחוז תל אביב**.

## 17. הוראות שונות

- **בטלות חלקית.** אם הוראה כלשהי בתנאים אלה תיקבע כלא-תקפה, יתר ההוראות יעמדו בתוקף מלא.
- **אי-ויתור.** אי-אכיפת זכות אינה מהווה ויתור עליה.
- **הסכם כולל.** התנאים, יחד עם מדיניות הפרטיות, מהווים את ההסכם המלא בינך לבין Kupa בכל הנוגע לשירות.
- **המחאה.** אינך רשאי להמחות את התנאים; אנו רשאים להמחותם בקשר למיזוג, רכישה או מכירת נכסים.

## 18. יצירת קשר

שאלות לגבי התנאים ניתן לשלוח לכתובת **sarussilberg@gmail.com**.
$content$,
    DATE '2026-01-01',
    true
)
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Re-apply the seed file**

Apply via `mcp__supabase__apply_migration` with name `seed_legal_documents_terms_he` and the appended SQL (just the new INSERT, idempotent).

Expected: Success.

- [ ] **Step 3: Verify the new row**

```sql
SELECT slug, locale, version, LENGTH(content_md) AS body_chars
FROM public.legal_documents
WHERE slug = 'terms';
```

Expected: 2 rows (en + he), both with `body_chars > 3000`.

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/supabase/seed-legal-documents.sql
git commit -m "feat(db): seed Terms of Service (Hebrew)"
```

---

## Task 4: Write Privacy Policy — English content

**Files:**
- Modify: `cost-share-app/supabase/seed-legal-documents.sql`

- [ ] **Step 1: Append Privacy-EN to seed file**

Append to `cost-share-app/supabase/seed-legal-documents.sql`:

```sql
INSERT INTO public.legal_documents
    (slug, locale, version, title, content_md, effective_date, is_published)
VALUES (
    'privacy',
    'en',
    '1.0.0',
    'Privacy Policy',
    $content$
# Privacy Policy

**Effective date:** {{EFFECTIVE_DATE}}
**Version:** 1.0.0

This Privacy Policy explains how **[Partnership Name]** ("Kupa", "we", "us"), a partnership organized under the laws of the State of Israel, collects, uses, and discloses information when you use the Kupa mobile application and related services (the "Service"). For questions, contact **sarussilberg@gmail.com**.

## 1. Who We Are (Data Controller)

Kupa is the controller of your personal data under the EU General Data Protection Regulation (GDPR), the UK GDPR, the California Consumer Privacy Act (CCPA/CPRA), and the Israeli Privacy Protection Law, 5741-1981, where applicable.

## 2. Information We Collect

### 2.1 Information you provide

When you create an account or use the Service, you provide:

- **Profile data** received from Google sign-in: your name, email address, and profile image.
- **Optional profile data** you may add later: phone number, default currency, language preference.
- **Content you create**: groups (name, description, image), expenses (description, amount, category, date, receipt image), settlements, friendships, and group memberships.

### 2.2 Information generated by your use of the Service

- **Activity data**: the groups you belong to, the expenses and settlements you create, your friendships and blocks.
- **Invite tokens**: short URL slugs we generate so you can share invites to friends and groups.

### 2.3 Information collected automatically

- **Technical logs** from our infrastructure provider (Supabase): IP address, timestamps of requests, error logs. These are retained for a limited operational period (see Section 7).

### 2.4 What we do NOT collect

We do **not** collect: precise location, device advertising identifiers (IDFA / Android Ad ID), push-notification tokens, third-party analytics events, microphone or contact data. If we add any of these in the future, we will update this Policy and, where required, request your consent in advance.

## 3. How We Use Information

We process your information for the following purposes, on the legal bases listed:

| Purpose | Legal basis (GDPR Art. 6) |
|---|---|
| Providing the Service (account, groups, balances, settlements) | Contract performance (1)(b) |
| Authenticating you via Google | Contract performance (1)(b) |
| Securing the Service and preventing fraud or abuse | Legitimate interest (1)(f) |
| Communicating about your account (e.g., security alerts) | Contract performance (1)(b) |
| Improving the Service | Legitimate interest (1)(f) |
| Complying with legal obligations | Legal obligation (1)(c) |

## 4. How We Share Information

### 4.1 With other users

By design, when you join a group, the following becomes visible to all current and future members of that group:

- Your name and profile image.
- The expenses, settlements, and group activity you create or participate in.

When you generate an invite link, anyone with the link can see limited public information (your name and profile image, or the group name) **before** they join. You can rotate the link at any time to invalidate it.

### 4.2 With service providers (processors)

We use the following service providers to operate the Service:

- **Supabase** (Postgres database, authentication, file storage) — our infrastructure provider.
- **Google** — only for authenticating you via Google Sign-In. We do not receive your Google password, contacts, or any data beyond your basic profile.
- **Apple App Store / Google Play** — for delivering the app and handling any future in-app purchases.

These providers act on our behalf under written data-processing agreements and are not permitted to use your data for their own purposes.

### 4.3 For legal reasons

We may disclose information when we are required to do so by a valid legal process (subpoena, court order), or when necessary to protect the rights, safety, or property of Kupa, our users, or the public.

### 4.4 We do **not** sell your personal information

We do not sell your personal information and have no plans to do so.

## 5. Cookies and Tracking

The Kupa mobile app does not use cookies and does not engage in cross-site or cross-app tracking. The Google Sign-In flow may involve Google's own cookies/policies; please review Google's privacy notices.

## 6. International Data Transfers

Your information is processed and stored by Supabase, which hosts data in regions outside Israel. If you are located in the European Economic Area, the United Kingdom, or Switzerland, we rely on the **Standard Contractual Clauses (SCCs)** to lawfully transfer your data outside the EEA. You can request a copy of the SCCs from us.

## 7. Data Retention

We retain your information only as long as necessary for the purposes described in this Policy:

- **Active account**: as long as your account exists.
- **After account deletion**: when you delete your account, we mark your profile inactive and **hide your name, email, and profile image** from group members (you appear as "Deleted user"). The expense records, settlements, and group activity you created **remain visible to other group members** so that historical balance calculations remain accurate. This is based on our **legitimate interest** (GDPR Art. 6(1)(f)) in preserving the integrity of shared expense history for the benefit of the other group members. You can request full erasure by contacting us; we will assess each request and inform you which data we are legally able to delete.
- **Technical logs**: typically 30–90 days, depending on the log type.
- **Database backups** (Supabase Point-in-Time Recovery): up to 7 days.

## 8. Your Rights

Depending on your jurisdiction, you may have the following rights regarding your personal data:

- **Access** — request a copy of the personal data we hold about you.
- **Correction** — ask us to correct inaccurate or incomplete data.
- **Deletion** — ask us to delete your data, subject to the retention exceptions in Section 7.
- **Portability** — request a machine-readable export of your data (JSON).
- **Objection / restriction** — object to certain processing or ask us to restrict it.
- **Withdraw consent** — where processing is based on consent, you may withdraw it at any time.
- **Lodge a complaint** with a supervisory authority:
  - **Israel:** Privacy Protection Authority (Rashut Le-Haganat Ha-Pratiut).
  - **EU/EEA:** your local Data Protection Authority.
  - **UK:** the Information Commissioner's Office (ICO).

If you are a **California resident**, you also have rights under the CCPA/CPRA: the right to know what we collect, the right to delete, the right to correct, the right to opt out of "sale" or "sharing" (we do neither), and the right to non-discrimination for exercising these rights.

To exercise any of these rights, contact **sarussilberg@gmail.com**. We will respond within 30 days (or sooner where required by law).

## 9. Security

We protect your data with appropriate technical and organizational measures, including:

- TLS encryption for data in transit.
- Supabase Row-Level Security policies that restrict who can read which rows.
- Authentication via Google (we do not store your password).
- Limited internal access on a need-to-know basis.

No security measure is perfect. If you suspect unauthorized access to your account, contact us immediately.

## 10. Minors

The Service is intended for users aged **16 and older**. We do not knowingly collect personal data from anyone under 16. If you believe that a person under 16 has provided us with personal data, contact us and we will take steps to delete it.

## 11. Future Features That May Affect Your Privacy

We are transparent about features that are not yet active but may be introduced in the future:

- **Advertising.** We may display third-party ads in the future. Before doing so, we will update this Policy to disclose ad partners, identifiers used (such as IDFA / Android Ad ID), and we will request your consent where required by law.
- **Paid subscriptions.** If we introduce paid features, payment is handled by Apple or Google. We do not see your full payment-card details — we only receive your subscription status.
- **Analytics.** We do not use any third-party analytics today. If we add an analytics provider, we will update this Policy beforehand.

## 12. Changes to This Policy

We may update this Policy from time to time. For material changes, we will provide notice in the Service at least **14 days** before the changes take effect. The "Effective date" at the top reflects the current version.

## 13. Contact

To contact us about this Policy or to exercise your rights, write to:

**sarussilberg@gmail.com**
[Partnership Name], Israel
$content$,
    DATE '2026-01-01',
    true
)
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Apply and verify**

Apply via `mcp__supabase__apply_migration` with name `seed_legal_documents_privacy_en`.

```sql
SELECT slug, locale, version, LENGTH(content_md) AS body_chars
FROM public.legal_documents
ORDER BY slug, locale;
```

Expected: 3 rows so far (terms/en, terms/he, privacy/en).

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/supabase/seed-legal-documents.sql
git commit -m "feat(db): seed Privacy Policy (English)"
```

---

## Task 5: Write Privacy Policy — Hebrew content

**Files:**
- Modify: `cost-share-app/supabase/seed-legal-documents.sql`

- [ ] **Step 1: Append Privacy-HE to seed file**

Append to `cost-share-app/supabase/seed-legal-documents.sql`:

```sql
INSERT INTO public.legal_documents
    (slug, locale, version, title, content_md, effective_date, is_published)
VALUES (
    'privacy',
    'he',
    '1.0.0',
    'מדיניות פרטיות',
    $content$
# מדיניות פרטיות

**תאריך כניסה לתוקף:** {{EFFECTIVE_DATE}}
**גרסה:** 1.0.0

מדיניות פרטיות זו מסבירה כיצד **[Partnership Name]** ("Kupa", "אנחנו", "אנו"), שותפות הפועלת לפי חוקי מדינת ישראל, אוספת, משתמשת וחושפת מידע במסגרת השימוש שלך באפליקציית המובייל של Kupa ובשירותים הקשורים אליה ("השירות"). לשאלות: **sarussilberg@gmail.com**.

## 1. מי אנחנו (בעל השליטה במידע)

Kupa הוא בעל השליטה במידע האישי שלך לפי תקנת ה-GDPR האירופית, ה-UK GDPR, חוק הפרטיות של קליפורניה (CCPA/CPRA), וחוק הגנת הפרטיות הישראלי, התשמ"א-1981, ככל שאלה חלים.

## 2. איזה מידע אנו אוספים

### 2.1 מידע שאתה מספק

ביצירת חשבון או שימוש בשירות, אתה מספק:

- **פרטי פרופיל** המתקבלים מהתחברות Google: שמך, כתובת האימייל ותמונת הפרופיל שלך.
- **פרטי פרופיל אופציונליים** שאתה רשאי להוסיף בהמשך: מספר טלפון, מטבע ברירת מחדל, העדפת שפה.
- **תוכן שאתה יוצר**: קבוצות (שם, תיאור, תמונה), הוצאות (תיאור, סכום, קטגוריה, תאריך, תמונת קבלה), התחשבנויות, קשרי חברות וחברות בקבוצות.

### 2.2 מידע שנוצר במהלך השימוש שלך בשירות

- **נתוני פעילות**: הקבוצות שאתה משתייך אליהן, ההוצאות וההתחשבנויות שיצרת, חברויות וחסימות.
- **טוקנים של הזמנות**: מחרוזות URL קצרות שאנו יוצרים כדי שתוכל לשתף הזמנות לחברים ולקבוצות.

### 2.3 מידע שנאסף אוטומטית

- **לוגים טכניים** מספק התשתית שלנו (Supabase): כתובת IP, חותמות זמן של בקשות ולוגי שגיאות. אלה נשמרים לתקופת תפעול מוגבלת (ראה סעיף 7).

### 2.4 מה אנחנו **לא** אוספים

איננו אוספים: מיקום מדויק, מזהי פרסום של מכשירים (IDFA / Android Ad ID), טוקני הודעות push, אירועי אנליטיקה של צד שלישי, מיקרופון, או אנשי קשר. אם נוסיף כל אחד מאלה בעתיד, נעדכן מדיניות זו ונבקש את הסכמתך מראש, היכן שנדרש בדין.

## 3. כיצד אנו משתמשים במידע

אנו מעבדים את המידע שלך למטרות הבאות, על בסיסי המשפט המפורטים:

| מטרה | בסיס משפטי (GDPR Art. 6) |
|---|---|
| מתן השירות (חשבון, קבוצות, יתרות, התחשבנויות) | ביצוע חוזה (1)(b) |
| אימותך מול Google | ביצוע חוזה (1)(b) |
| אבטחת השירות ומניעת הונאה/ניצול לרעה | אינטרס לגיטימי (1)(f) |
| תקשורת לגבי החשבון (לדוגמה, התרעות אבטחה) | ביצוע חוזה (1)(b) |
| שיפור השירות | אינטרס לגיטימי (1)(f) |
| עמידה בחובות חוקיות | חובה חוקית (1)(c) |

## 4. כיצד אנו משתפים מידע

### 4.1 עם משתמשים אחרים

מטבע השירות, כשאתה מצטרף לקבוצה, הפרטים הבאים נחשפים בפני כל החברים הקיימים והעתידיים באותה קבוצה:

- שמך ותמונת הפרופיל שלך.
- ההוצאות, ההתחשבנויות והפעילות בקבוצה שיצרת או שהשתתפת בהן.

ביצירת קישור הזמנה, כל מי שמחזיק בקישור יכול לראות מידע ציבורי מוגבל (שמך ותמונת הפרופיל שלך, או שם הקבוצה) **לפני** ההצטרפות. ניתן לרענן את הקישור בכל עת כדי לבטל אותו.

### 4.2 עם ספקי שירות (Processors)

אנו משתמשים בספקים הבאים להפעלת השירות:

- **Supabase** (מסד נתונים Postgres, אימות, אחסון קבצים) — ספק התשתית שלנו.
- **Google** — אך ורק לאימות באמצעות Google Sign-In. איננו מקבלים את סיסמת Google שלך, אנשי קשר, או כל מידע מעבר לפרופיל הבסיסי שלך.
- **Apple App Store / Google Play** — לאספקת האפליקציה ולטיפול ברכישות פנים-אפליקציה עתידיות אם יוצעו.

ספקים אלה פועלים מטעמנו במסגרת הסכמי עיבוד נתונים בכתב, ואינם רשאים להשתמש בנתונים שלך למטרות שלהם.

### 4.3 מסיבות משפטיות

ייתכן ונחשוף מידע כשנידרש לכך בהליך משפטי תקף (הזמנה, צו בית משפט), או כשהדבר נחוץ להגנה על זכויות, בטיחות או רכוש של Kupa, המשתמשים שלנו או הציבור.

### 4.4 איננו **מוכרים** את המידע האישי שלך

איננו מוכרים את המידע האישי שלך ואין לנו כוונה לעשות זאת.

## 5. עוגיות ומעקב

אפליקציית המובייל של Kupa אינה משתמשת בעוגיות ואינה מבצעת מעקב חוצה-אתרים או חוצה-אפליקציות. תהליך ה-Google Sign-In עשוי לכלול עוגיות/מדיניות של Google; אנא עיין בהודעות הפרטיות של Google.

## 6. העברות בינלאומיות של נתונים

המידע שלך מעובד ונשמר אצל Supabase, המארחת נתונים באזורים מחוץ לישראל. אם אתה ממוקם באזור הכלכלי האירופי, בבריטניה או בשוויץ, אנו מסתמכים על **הסעיפים החוזיים הסטנדרטיים (SCCs)** של נציבות האיחוד האירופי להעברת מידע מחוץ ל-EEA. ניתן לקבל עותק של ה-SCCs לפי דרישה.

## 7. שמירת נתונים

אנו שומרים את המידע שלך רק כל זמן שהוא נחוץ למטרות המתוארות במדיניות זו:

- **חשבון פעיל**: כל זמן קיום החשבון.
- **לאחר מחיקת חשבון**: בעת מחיקת החשבון, אנו מסמנים את הפרופיל כלא-פעיל **ומסתירים את שמך, האימייל ותמונת הפרופיל שלך** מחברי הקבוצה (אתה מופיע כ"משתמש מחוק"). רישומי ההוצאות, ההתחשבנויות והפעילות בקבוצות שיצרת **נשארים גלויים לחברי הקבוצה** — כדי שחישובי היתרות ההיסטוריים יישארו מדויקים. הדבר מבוסס על **האינטרס הלגיטימי שלנו** (GDPR Art. 6(1)(f)) בשימור תקינות ההיסטוריה המשותפת לטובת חברי הקבוצה האחרים. ניתן לבקש מחיקה מלאה ע"י פנייה אלינו; נשקול כל בקשה בנפרד ונודיע לך אילו נתונים אנו יכולים למחוק על פי דין.
- **לוגים טכניים**: בדרך כלל 30–90 ימים, בהתאם לסוג הלוג.
- **גיבויי מסד נתונים** (Supabase Point-in-Time Recovery): עד 7 ימים.

## 8. הזכויות שלך

בהתאם למקום מגוריך, ייתכן ויהיו לך הזכויות הבאות לגבי המידע האישי שלך:

- **גישה** — לבקש עותק של המידע האישי שאנו מחזיקים עליך.
- **תיקון** — לבקש מאיתנו לתקן מידע לא מדויק או חלקי.
- **מחיקה** — לבקש מחיקת המידע שלך, בכפוף לחריגי השמירה בסעיף 7.
- **ניידות** — לבקש ייצוא של המידע שלך בפורמט קריא-מכונה (JSON).
- **התנגדות / הגבלה** — להתנגד לעיבודים מסוימים או לבקש להגביל אותם.
- **משיכת הסכמה** — היכן שהעיבוד מבוסס על הסכמה, ניתן למשוך אותה בכל עת.
- **תלונה לרשות פיקוח**:
  - **ישראל:** הרשות להגנת הפרטיות.
  - **EU/EEA:** רשות הגנת הנתונים במדינתך.
  - **בריטניה:** ה-Information Commissioner's Office (ICO).

אם אתה **תושב קליפורניה**, יש לך גם זכויות לפי ה-CCPA/CPRA: הזכות לדעת איזה מידע אנו אוספים, הזכות למחיקה, הזכות לתיקון, הזכות לסרב ל"מכירה" או "שיתוף" של מידע (איננו עושים זאת), והזכות לאי-אפליה עקב מימוש הזכויות.

למימוש כל אחת מהזכויות הללו: **sarussilberg@gmail.com**. נשיב תוך 30 ימים (או מוקדם יותר היכן שהדין דורש).

## 9. אבטחה

אנו מגנים על המידע שלך באמצעים טכניים וארגוניים מתאימים, לרבות:

- הצפנת TLS לנתונים בהעברה.
- מדיניות אבטחה ברמת שורה (Row-Level Security) של Supabase שמגבילה מי יכול לקרוא אילו שורות.
- אימות באמצעות Google (איננו מאחסנים את הסיסמה שלך).
- גישה פנימית מוגבלת לפי הצורך.

אין אמצעי אבטחה מושלם. אם אתה חושד בגישה לא מורשית לחשבונך, פנה אלינו מיד.

## 10. קטינים

השירות מיועד למשתמשים בגיל **16 ומעלה**. איננו אוספים ביודעין מידע אישי ממי שמתחת לגיל 16. אם אתה סבור שאדם מתחת לגיל 16 מסר לנו מידע אישי, אנא פנה אלינו ונפעל למחיקתו.

## 11. תכונות עתידיות העלולות להשפיע על פרטיותך

אנו שקופים לגבי תכונות שאינן פעילות כיום אך ייתכן ויוצגו בעתיד:

- **פרסום.** ייתכן ונציג מודעות צד שלישי בעתיד. לפני כן, נעדכן מדיניות זו כדי לחשוף שותפי פרסום, מזהים שבשימוש (לדוגמה IDFA / Android Ad ID), ונבקש את הסכמתך היכן שנדרש בדין.
- **מנויים בתשלום.** אם נציע תכונות בתשלום, התשלום יטופל ע"י Apple או Google. איננו רואים את פרטי כרטיס האשראי המלאים שלך — רק את סטטוס המנוי.
- **אנליטיקה.** איננו משתמשים באנליטיקה של צד שלישי כיום. אם נוסיף ספק אנליטיקה, נעדכן מדיניות זו לפני כן.

## 12. שינויים במדיניות זו

ייתכן ונעדכן מדיניות זו מעת לעת. בשינויים מהותיים, נספק הודעה בשירות לפחות **14 ימים** לפני כניסת השינויים לתוקף. "תאריך כניסה לתוקף" בראש המסמך משקף את הגרסה הנוכחית.

## 13. יצירת קשר

ליצירת קשר לגבי מדיניות זו או למימוש זכויותיך, פנה אל:

**sarussilberg@gmail.com**
[Partnership Name], ישראל
$content$,
    DATE '2026-01-01',
    true
)
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Apply and verify**

Apply via `mcp__supabase__apply_migration` with name `seed_legal_documents_privacy_he`.

```sql
SELECT slug, locale, version, LENGTH(content_md) AS body_chars
FROM public.legal_documents
ORDER BY slug, locale;
```

Expected: 4 rows total, all with `body_chars > 3000`.

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/supabase/seed-legal-documents.sql
git commit -m "feat(db): seed Privacy Policy (Hebrew)"
```

---

## Task 6: Add `LegalDocument` types to shared package

**Files:**
- Modify: `cost-share-app/packages/shared/src/types/index.ts`

- [ ] **Step 1: Add types to shared package**

Open `cost-share-app/packages/shared/src/types/index.ts`. Locate the "ENUMS & CONSTANTS" section (line ~236) — find the existing `Language` type around line 273. After the `Currency` type (around line 278), insert:

```ts
// ============================================
// LEGAL DOCUMENTS
// ============================================

/**
 * Legal document kind.
 * Maps to: legal_documents.slug
 */
export type LegalSlug = 'terms' | 'privacy';

/**
 * Legal document fetched from server.
 * Maps to: legal_documents table
 */
export interface LegalDocument {
    id: string;
    slug: LegalSlug;
    locale: Language;
    version: string;
    title: string;
    contentMd: string;
    effectiveDate: string;  // ISO date YYYY-MM-DD
    updatedAt: string;      // ISO timestamp
}
```

- [ ] **Step 2: Build shared package to verify types compile**

Run from repo root:

```bash
cd cost-share-app && npx tsc -p packages/shared/tsconfig.json --noEmit
```

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/packages/shared/src/types/index.ts
git commit -m "feat(shared): add LegalDocument types"
```

---

## Task 7: Install `react-native-markdown-display`

**Files:**
- Modify: `cost-share-app/apps/mobile/package.json`
- Modify: repo `package-lock.json` (auto)

- [ ] **Step 1: Add dependency**

From repo root:

```bash
cd cost-share-app/apps/mobile && npx expo install react-native-markdown-display
```

Note: `expo install` chooses an Expo-SDK-54-compatible version. Verify the resulting version in `package.json` is `^7.0.0` or later (the package is mature and rarely changes).

- [ ] **Step 2: Verify installation**

```bash
cd cost-share-app/apps/mobile && cat package.json | grep markdown
```

Expected: A line `"react-native-markdown-display": "..."` in dependencies.

- [ ] **Step 3: Type-check that the import resolves**

Create a temporary file (don't commit it) to verify:

```bash
cd cost-share-app/apps/mobile && node -e "console.log(Object.keys(require('react-native-markdown-display')))" 2>&1 | head -5
```

Expected: Output includes `'default'` and other named exports (or no error).

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/apps/mobile/package.json cost-share-app/package-lock.json
git commit -m "build(mobile): add react-native-markdown-display"
```

---

## Task 8: Write `legal.service.ts` with tests

**Files:**
- Test: `cost-share-app/apps/mobile/__tests__/services/legal.service.test.ts`
- Create: `cost-share-app/apps/mobile/services/legal.service.ts`

- [ ] **Step 1: Write the failing tests**

Create `cost-share-app/apps/mobile/__tests__/services/legal.service.test.ts`:

```ts
const mockSelect = jest.fn();
const mockEq1 = jest.fn();
const mockEq2 = jest.fn();
const mockEq3 = jest.fn();
const mockMaybeSingle = jest.fn();

const mockGetItem = jest.fn();
const mockSetItem = jest.fn();

jest.mock('../../lib/supabase', () => ({
    supabase: {
        from: jest.fn(() => ({ select: mockSelect })),
    },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
        getItem: (...args: unknown[]) => mockGetItem(...args),
        setItem: (...args: unknown[]) => mockSetItem(...args),
    },
}));

import { fetchLegalDocument } from '../../services/legal.service';
import type { LegalDocument } from '@cost-share/shared';

const ROW = {
    id: 'uuid-1',
    slug: 'terms' as const,
    locale: 'en' as const,
    version: '1.0.0',
    title: 'Terms of Service',
    content_md: '# Hello',
    effective_date: '2026-01-01',
    updated_at: '2026-05-23T10:00:00Z',
};

function buildChain(rowOrError: { data?: typeof ROW | null; error?: unknown }) {
    mockMaybeSingle.mockResolvedValue(rowOrError);
    mockEq3.mockReturnValue({ maybeSingle: mockMaybeSingle });
    mockEq2.mockReturnValue({ eq: mockEq3 });
    mockEq1.mockReturnValue({ eq: mockEq2 });
    mockSelect.mockReturnValue({ eq: mockEq1 });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
});

describe('fetchLegalDocument', () => {
    it('returns mapped doc from Supabase on success and writes cache', async () => {
        buildChain({ data: ROW, error: null });
        const doc = await fetchLegalDocument('terms', 'en');

        expect(doc).toEqual<LegalDocument>({
            id: 'uuid-1',
            slug: 'terms',
            locale: 'en',
            version: '1.0.0',
            title: 'Terms of Service',
            contentMd: '# Hello',
            effectiveDate: '2026-01-01',
            updatedAt: '2026-05-23T10:00:00Z',
        });
        expect(mockSetItem).toHaveBeenCalledWith(
            'legal:terms:en',
            JSON.stringify(doc),
        );
    });

    it('queries by slug + locale + is_published = true', async () => {
        buildChain({ data: ROW, error: null });
        await fetchLegalDocument('privacy', 'he');

        expect(mockEq1).toHaveBeenCalledWith('slug', 'privacy');
        expect(mockEq2).toHaveBeenCalledWith('locale', 'he');
        expect(mockEq3).toHaveBeenCalledWith('is_published', true);
    });

    it('falls back to cached doc when network errors and cache exists', async () => {
        const cached: LegalDocument = {
            id: 'uuid-cached',
            slug: 'terms',
            locale: 'en',
            version: '1.0.0',
            title: 'Cached Terms',
            contentMd: '# Cached',
            effectiveDate: '2026-01-01',
            updatedAt: '2026-05-20T10:00:00Z',
        };
        mockGetItem.mockResolvedValue(JSON.stringify(cached));
        buildChain({ data: null, error: new Error('network down') });

        const doc = await fetchLegalDocument('terms', 'en');
        expect(doc).toEqual(cached);
        expect(mockGetItem).toHaveBeenCalledWith('legal:terms:en');
    });

    it('throws when network fails and no cache exists', async () => {
        mockGetItem.mockResolvedValue(null);
        buildChain({ data: null, error: new Error('network down') });

        await expect(fetchLegalDocument('terms', 'en')).rejects.toThrow();
    });

    it('throws when document is missing in DB and no cache', async () => {
        buildChain({ data: null, error: null });
        mockGetItem.mockResolvedValue(null);

        await expect(fetchLegalDocument('terms', 'en')).rejects.toThrow(/not found/i);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

From `cost-share-app/apps/mobile`:

```bash
npx jest __tests__/services/legal.service.test.ts
```

Expected: FAIL with "Cannot find module '../../services/legal.service'".

- [ ] **Step 3: Implement the service**

Create `cost-share-app/apps/mobile/services/legal.service.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import type { LegalDocument, LegalSlug, Language } from '@cost-share/shared';

const TABLE = 'legal_documents';

const cacheKey = (slug: LegalSlug, locale: Language) => `legal:${slug}:${locale}`;

type Row = {
    id: string;
    slug: LegalSlug;
    locale: Language;
    version: string;
    title: string;
    content_md: string;
    effective_date: string;
    updated_at: string;
};

function mapRow(row: Row): LegalDocument {
    return {
        id: row.id,
        slug: row.slug,
        locale: row.locale,
        version: row.version,
        title: row.title,
        contentMd: row.content_md,
        effectiveDate: row.effective_date,
        updatedAt: row.updated_at,
    };
}

async function readCache(slug: LegalSlug, locale: Language): Promise<LegalDocument | null> {
    try {
        const raw = await AsyncStorage.getItem(cacheKey(slug, locale));
        return raw ? (JSON.parse(raw) as LegalDocument) : null;
    } catch {
        return null;
    }
}

async function writeCache(doc: LegalDocument): Promise<void> {
    try {
        await AsyncStorage.setItem(cacheKey(doc.slug, doc.locale), JSON.stringify(doc));
    } catch {
        // Cache write failures are non-fatal.
    }
}

export async function fetchLegalDocument(
    slug: LegalSlug,
    locale: Language,
): Promise<LegalDocument> {
    const { data, error } = await supabase
        .from(TABLE)
        .select('id, slug, locale, version, title, content_md, effective_date, updated_at')
        .eq('slug', slug)
        .eq('locale', locale)
        .eq('is_published', true)
        .maybeSingle();

    if (error) {
        const cached = await readCache(slug, locale);
        if (cached) return cached;
        throw new Error(`legal.fetch failed: ${error.message ?? 'unknown'}`);
    }

    if (!data) {
        const cached = await readCache(slug, locale);
        if (cached) return cached;
        throw new Error(`legal.fetch: document not found (${slug}/${locale})`);
    }

    const doc = mapRow(data as Row);
    await writeCache(doc);
    return doc;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/services/legal.service.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/apps/mobile/services/legal.service.ts cost-share-app/apps/mobile/__tests__/services/legal.service.test.ts
git commit -m "feat(mobile): add legal.service with offline cache fallback"
```

---

## Task 9: Add React Query hook for legal documents

**Files:**
- Modify: `cost-share-app/apps/mobile/hooks/queries/keys.ts`
- Create: `cost-share-app/apps/mobile/hooks/queries/useLegalDocument.ts`

- [ ] **Step 1: Add query key**

Open `cost-share-app/apps/mobile/hooks/queries/keys.ts`. Add inside the `queryKeys` object before the closing brace:

```ts
legalDocument: (slug: 'terms' | 'privacy', locale: 'en' | 'he') =>
    ['legal-document', slug, locale] as const,
```

- [ ] **Step 2: Create the hook**

Create `cost-share-app/apps/mobile/hooks/queries/useLegalDocument.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { LegalSlug, Language } from '@cost-share/shared';
import { fetchLegalDocument } from '../../services/legal.service';
import { queryKeys } from './keys';

export function useLegalDocument(slug: LegalSlug) {
    const { i18n } = useTranslation();
    const locale: Language = i18n.language === 'he' ? 'he' : 'en';

    return useQuery({
        queryKey: queryKeys.legalDocument(slug, locale),
        queryFn: () => fetchLegalDocument(slug, locale),
        staleTime: 5 * 60 * 1000,         // 5 minutes
        gcTime: 24 * 60 * 60 * 1000,      // 24 hours
        retry: 1,
    });
}
```

- [ ] **Step 3: Type-check**

```bash
cd cost-share-app && npx tsc -p apps/mobile/tsconfig.json --noEmit
```

Expected: No type errors related to the new files.

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/apps/mobile/hooks/queries/keys.ts cost-share-app/apps/mobile/hooks/queries/useLegalDocument.ts
git commit -m "feat(mobile): add useLegalDocument query hook"
```

---

## Task 10: Add i18n strings for the new sheet UI

**Files:**
- Modify: `cost-share-app/apps/mobile/i18n/locales/en.json`
- Modify: `cost-share-app/apps/mobile/i18n/locales/he.json`

- [ ] **Step 1: Update `en.json` legal block**

Open `cost-share-app/apps/mobile/i18n/locales/en.json`. Locate the `"legal": { ... }` block (around line 583). Replace it with:

```json
    "legal": {
        "termsTitle": "Terms of Service",
        "privacyTitle": "Privacy Policy",
        "close": "Close",
        "loading": "Loading…",
        "errorTitle": "Couldn't load document",
        "errorBody": "Check your connection and try again.",
        "retry": "Try again",
        "cachedNotice": "Showing saved version",
        "lastUpdated": "Updated: {{date}}",
        "versionLabel": "v{{version}}",
        "understood": "I understand"
    },
```

(Removed: `termsBody`, `privacyBody`. Added: `loading`, `errorTitle`, `errorBody`, `retry`, `cachedNotice`, `lastUpdated`, `versionLabel`, `understood`.)

- [ ] **Step 2: Update `he.json` legal block**

Open `cost-share-app/apps/mobile/i18n/locales/he.json`. Locate the `"legal": { ... }` block (around line 585). Replace it with:

```json
    "legal": {
        "termsTitle": "תנאי שירות",
        "privacyTitle": "מדיניות פרטיות",
        "close": "סגור",
        "loading": "טוען…",
        "errorTitle": "לא הצלחנו לטעון את המסמך",
        "errorBody": "בדוק את החיבור ונסה שוב.",
        "retry": "נסה שוב",
        "cachedNotice": "מציג גרסה שמורה",
        "lastUpdated": "עודכן: {{date}}",
        "versionLabel": "גרסה {{version}}",
        "understood": "הבנתי"
    },
```

- [ ] **Step 3: Verify JSON is valid**

```bash
cd cost-share-app/apps/mobile && node -e "JSON.parse(require('fs').readFileSync('i18n/locales/en.json','utf8'))" && node -e "JSON.parse(require('fs').readFileSync('i18n/locales/he.json','utf8'))"
```

Expected: No output (silent success means valid JSON).

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/apps/mobile/i18n/locales/en.json cost-share-app/apps/mobile/i18n/locales/he.json
git commit -m "feat(mobile): update legal i18n strings for server-driven docs"
```

---

## Task 11: Build `LegalDocumentSheet` with tests

**Files:**
- Test: `cost-share-app/apps/mobile/__tests__/components/settings/LegalDocumentSheet.test.tsx`
- Create: `cost-share-app/apps/mobile/components/settings/LegalDocumentSheet.tsx`

- [ ] **Step 1: Write the failing tests**

Create `cost-share-app/apps/mobile/__tests__/components/settings/LegalDocumentSheet.test.tsx`:

```tsx
import React from 'react';
import { render } from '@testing-library/react-native';

const mockUseLegalDocument = jest.fn();

jest.mock('../../../hooks/queries/useLegalDocument', () => ({
    useLegalDocument: (...args: unknown[]) => mockUseLegalDocument(...args),
}));

jest.mock('react-native-markdown-display', () => {
    const React = require('react');
    const { Text } = require('react-native');
    return {
        __esModule: true,
        default: ({ children }: { children: string }) =>
            React.createElement(Text, { testID: 'markdown-body' }, children),
    };
});

import { LegalDocumentSheet } from '../../../components/settings/LegalDocumentSheet';

const baseDoc = {
    id: 'uuid-1',
    slug: 'terms' as const,
    locale: 'en' as const,
    version: '1.0.0',
    title: 'Terms of Service',
    contentMd: '# Welcome\n\nBody text.',
    effectiveDate: '2026-01-01',
    updatedAt: '2026-05-23T10:00:00Z',
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('LegalDocumentSheet', () => {
    it('does not render when visible is false', () => {
        mockUseLegalDocument.mockReturnValue({ data: baseDoc, isLoading: false, isError: false, refetch: jest.fn() });
        const { queryByTestId } = render(
            <LegalDocumentSheet visible={false} slug="terms" onClose={() => {}} />,
        );
        expect(queryByTestId('legal-sheet')).toBeNull();
    });

    it('renders loading state when isLoading is true', () => {
        mockUseLegalDocument.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: jest.fn() });
        const { getByTestId } = render(
            <LegalDocumentSheet visible={true} slug="terms" onClose={() => {}} />,
        );
        expect(getByTestId('legal-sheet-skeleton')).toBeTruthy();
    });

    it('renders error state with retry when isError is true', () => {
        const refetch = jest.fn();
        mockUseLegalDocument.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
        const { getByTestId, getByText } = render(
            <LegalDocumentSheet visible={true} slug="terms" onClose={() => {}} />,
        );
        expect(getByTestId('legal-sheet-error')).toBeTruthy();
        expect(getByText('Try again')).toBeTruthy();
    });

    it('renders title, version, effective date, and markdown body on success', () => {
        mockUseLegalDocument.mockReturnValue({ data: baseDoc, isLoading: false, isError: false, refetch: jest.fn() });
        const { getByText, getByTestId } = render(
            <LegalDocumentSheet visible={true} slug="terms" onClose={() => {}} />,
        );
        expect(getByText('Terms of Service')).toBeTruthy();
        expect(getByTestId('markdown-body').props.children).toBe('# Welcome\n\nBody text.');
        expect(getByText(/v1\.0\.0/)).toBeTruthy();
    });

    it('passes slug to useLegalDocument', () => {
        mockUseLegalDocument.mockReturnValue({ data: baseDoc, isLoading: false, isError: false, refetch: jest.fn() });
        render(<LegalDocumentSheet visible={true} slug="privacy" onClose={() => {}} />);
        expect(mockUseLegalDocument).toHaveBeenCalledWith('privacy');
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd cost-share-app/apps/mobile && npx jest __tests__/components/settings/LegalDocumentSheet.test.tsx
```

Expected: FAIL with "Cannot find module '../../../components/settings/LegalDocumentSheet'".

- [ ] **Step 3: Implement the component**

Create `cost-share-app/apps/mobile/components/settings/LegalDocumentSheet.tsx`:

```tsx
import React from 'react';
import { View, Modal, ScrollView, TouchableOpacity, Pressable, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import Markdown from 'react-native-markdown-display';
import { Text } from '../AppText';
import { AppIcon } from '../AppIcon';
import { useLegalDocument } from '../../hooks/queries/useLegalDocument';
import { colors } from '../../theme';
import type { LegalSlug } from '@cost-share/shared';

interface Props {
    visible: boolean;
    slug: LegalSlug;
    onClose: () => void;
}

export function LegalDocumentSheet({ visible, slug, onClose }: Props) {
    const { t, i18n } = useTranslation();
    const query = useLegalDocument(slug);

    if (!visible) return null;

    const formattedDate = query.data
        ? new Intl.DateTimeFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
          }).format(new Date(query.data.effectiveDate))
        : '';

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <Pressable className="flex-1 bg-black/40" onPress={onClose}>
                <Pressable
                    onPress={(e) => e.stopPropagation()}
                    testID="legal-sheet"
                    className="bg-white rounded-t-2xl absolute bottom-0 inset-x-0"
                    style={{ maxHeight: '92%' }}
                >
                    <View className="items-center pt-2 pb-1">
                        <View className="w-10 h-1 bg-gray-300 rounded-full" />
                    </View>

                    <View className="px-5 pt-2 pb-3 border-b border-gray-100 flex-row items-start justify-between">
                        <View className="flex-1 pe-3">
                            <Text className="text-xl font-bold text-gray-900">
                                {query.data?.title ?? t(slug === 'terms' ? 'legal.termsTitle' : 'legal.privacyTitle')}
                            </Text>
                            {query.data && (
                                <Text className="text-xs text-gray-500 mt-1">
                                    {t('legal.lastUpdated', { date: formattedDate })} · {t('legal.versionLabel', { version: query.data.version })}
                                </Text>
                            )}
                        </View>
                        <TouchableOpacity onPress={onClose} accessibilityLabel={t('legal.close')}>
                            <AppIcon name="close" size={24} color={colors.text ?? '#1f2937'} />
                        </TouchableOpacity>
                    </View>

                    {query.isLoading && <SkeletonBody />}
                    {query.isError && !query.data && (
                        <ErrorBody onRetry={() => void query.refetch()} />
                    )}
                    {query.data && (
                        <ScrollView className="px-5 pt-3" showsVerticalScrollIndicator={true}>
                            <Markdown style={markdownStyles}>{query.data.contentMd}</Markdown>
                            <View className="h-6" />
                        </ScrollView>
                    )}

                    <View className="px-5 pb-5 pt-3 border-t border-gray-100">
                        <TouchableOpacity onPress={onClose} className="bg-primary py-4 rounded-xl">
                            <Text className="text-white text-center font-semibold">{t('legal.understood')}</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

function SkeletonBody() {
    return (
        <View testID="legal-sheet-skeleton" className="px-5 pt-4 pb-6">
            <View className="h-5 bg-gray-200 rounded mb-3 w-3/4" />
            <View className="h-4 bg-gray-200 rounded mb-2" />
            <View className="h-4 bg-gray-200 rounded mb-2" />
            <View className="h-4 bg-gray-200 rounded w-5/6" />
        </View>
    );
}

function ErrorBody({ onRetry }: { onRetry: () => void }) {
    const { t } = useTranslation();
    return (
        <View testID="legal-sheet-error" className="px-5 pt-6 pb-2 items-center">
            <AppIcon name="cloud-offline-outline" size={48} color={colors.muted ?? '#9ca3af'} />
            <Text className="text-base font-semibold text-gray-900 mt-3">{t('legal.errorTitle')}</Text>
            <Text className="text-sm text-gray-500 mt-1 text-center">{t('legal.errorBody')}</Text>
            <TouchableOpacity onPress={onRetry} className="mt-4 px-5 py-2 bg-gray-100 rounded-full">
                <Text className="text-gray-700 font-medium">{t('legal.retry')}</Text>
            </TouchableOpacity>
        </View>
    );
}

const markdownStyles = {
    body: { color: '#374151', fontSize: 16, lineHeight: 24 },
    heading1: { fontSize: 22, fontWeight: '700' as const, color: '#111827', marginTop: 16, marginBottom: 8 },
    heading2: { fontSize: 18, fontWeight: '700' as const, color: '#111827', marginTop: 14, marginBottom: 6 },
    heading3: { fontSize: 16, fontWeight: '700' as const, color: '#111827', marginTop: 12, marginBottom: 4 },
    strong: { fontWeight: '700' as const, color: '#111827' },
    em: { fontStyle: 'italic' as const },
    link: { color: '#2563eb', textDecorationLine: 'underline' as const },
    bullet_list: { marginBottom: 8 },
    ordered_list: { marginBottom: 8 },
    list_item: { marginBottom: 4 },
    blockquote: { backgroundColor: '#f9fafb', borderLeftWidth: 4, borderLeftColor: '#d1d5db', paddingHorizontal: 12, paddingVertical: 6, marginVertical: 8 },
    table: { borderWidth: 1, borderColor: '#e5e7eb', marginVertical: 8 },
    th: { padding: 6, fontWeight: '700' as const, backgroundColor: '#f9fafb' },
    td: { padding: 6, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
};
```

Note: This component imports `Text` from `../AppText` (already used elsewhere) and `AppIcon` from `../AppIcon`. If `colors.muted` or `colors.text` are not defined in `theme.ts`, they will be undefined — the fallback string is used (`?? '#9ca3af'` etc.). Adjust to actual color names in the existing `theme.ts` only if Step 4 fails with type errors.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd cost-share-app/apps/mobile && npx jest __tests__/components/settings/LegalDocumentSheet.test.tsx
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/apps/mobile/components/settings/LegalDocumentSheet.tsx cost-share-app/apps/mobile/__tests__/components/settings/LegalDocumentSheet.test.tsx
git commit -m "feat(mobile): add LegalDocumentSheet with Markdown renderer"
```

---

## Task 12: Wire `SettingsScreen` to the new sheet and delete the old one

**Files:**
- Modify: `cost-share-app/apps/mobile/screens/profile/SettingsScreen.tsx`
- Delete: `cost-share-app/apps/mobile/components/settings/LegalSheet.tsx`

- [ ] **Step 1: Update SettingsScreen import and JSX**

Open `cost-share-app/apps/mobile/screens/profile/SettingsScreen.tsx`.

**Replace** the import on line 16:

```ts
import { LegalSheet } from '../../components/settings/LegalSheet';
```

with:

```ts
import { LegalDocumentSheet } from '../../components/settings/LegalDocumentSheet';
```

**Replace** the two LegalSheet usages on lines 212–213:

```tsx
<LegalSheet visible={showTerms} title={t('legal.termsTitle')} body={t('legal.termsBody')} onClose={() => setShowTerms(false)} />
<LegalSheet visible={showPrivacy} title={t('legal.privacyTitle')} body={t('legal.privacyBody')} onClose={() => setShowPrivacy(false)} />
```

with:

```tsx
<LegalDocumentSheet visible={showTerms} slug="terms" onClose={() => setShowTerms(false)} />
<LegalDocumentSheet visible={showPrivacy} slug="privacy" onClose={() => setShowPrivacy(false)} />
```

- [ ] **Step 2: Delete the old `LegalSheet.tsx`**

```bash
git rm cost-share-app/apps/mobile/components/settings/LegalSheet.tsx
```

- [ ] **Step 3: Check that no other file references the removed module or i18n keys**

```bash
cd cost-share-app && grep -rn "LegalSheet\|legal\.termsBody\|legal\.privacyBody" apps/mobile --include="*.ts" --include="*.tsx" --include="*.json" || echo "no references remain"
```

Expected: Output is `no references remain` (i.e., grep finds nothing).

- [ ] **Step 4: Run the SettingsScreen test to ensure nothing regressed**

```bash
cd cost-share-app/apps/mobile && npx jest __tests__/screens/profile/SettingsScreen.test.tsx
```

If the test was asserting on the now-removed `termsBody`/`privacyBody` strings, update those assertions to check that `LegalDocumentSheet` is rendered with the correct `slug` prop instead. Show the exact change here if needed and re-run.

Expected: PASS.

- [ ] **Step 5: Full type-check**

```bash
cd cost-share-app && npx tsc -p apps/mobile/tsconfig.json --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add cost-share-app/apps/mobile/screens/profile/SettingsScreen.tsx cost-share-app/apps/mobile/__tests__/screens/profile/SettingsScreen.test.tsx
git commit -m "feat(mobile): switch Settings to LegalDocumentSheet and remove old LegalSheet"
```

---

## Task 13: Manual verification

**Files:** none — manual QA only.

- [ ] **Step 1: Start the app on a device or simulator**

```bash
cd cost-share-app/apps/mobile && npm start
```

Open on an iOS simulator or Android emulator (or a physical device via Expo Go / dev client).

- [ ] **Step 2: Verify English ToS loads**

1. Set app language to English.
2. Open Settings → Legal → Terms of Service.
3. **Expected:** the sheet opens, shows the title "Terms of Service", "Updated: January 1, 2026 · v1.0.0", and the full Markdown body renders with headings, bold text, lists, and the table in Section 3 readable.

- [ ] **Step 3: Verify Hebrew ToS loads with RTL**

1. Switch language to Hebrew.
2. Open Settings → Legal → תנאי שירות.
3. **Expected:** layout is RTL — headings and body align right; the close (X) button is on the left side; the "הבנתי" button at the bottom is centered and visible.

- [ ] **Step 4: Verify Privacy Policy in both languages**

Repeat steps 2–3 for the Privacy Policy entry.

- [ ] **Step 5: Verify offline cache fallback**

1. With the app open, view a document once so it caches.
2. Close the sheet, enable airplane mode.
3. Re-open the same document.
4. **Expected:** content still appears (loaded from AsyncStorage).
5. Open a document you have *not* viewed before.
6. **Expected:** error state appears with "Try again" button.

- [ ] **Step 6: Verify server-side update flow**

1. In Supabase Studio, edit the `terms`/`en` row's `content_md` (e.g., append a sentence to Section 1).
2. In the app, force-refresh (close the sheet, wait, re-open — or relaunch the app to bypass the 5-minute staleTime).
3. **Expected:** the new sentence appears.

- [ ] **Step 7: Verify RLS blocks writes**

Run via `mcp__supabase__execute_sql` (uses anon key):

```sql
SET ROLE anon;
INSERT INTO public.legal_documents (slug, locale, version, title, content_md, effective_date, is_published)
VALUES ('terms','en','9.9.9','hack','# hack', DATE '2026-01-01', true);
```

Expected: ERROR: `new row violates row-level security policy` (or similar). Reset role afterwards with `RESET ROLE;`.

- [ ] **Step 8: Final type-check + full test run**

```bash
cd cost-share-app/apps/mobile && npx tsc --noEmit && npm test -- --silent
```

Expected: No TypeScript errors. All tests pass.

- [ ] **Step 9: Final commit if anything was fixed during QA**

```bash
git status
# if needed:
# git add <files>
# git commit -m "fix(mobile): <whatever was fixed during QA>"
```

---

## Out of Scope (Tracked Separately)

- True hard-delete of personal data on account deletion (current is soft-delete; covered in spec section 9).
- Re-acceptance modal when `version` changes.
- Public `kupa.pro/legal/*` web pages (needed for App Store Connect Privacy URL — separate web task).
- Self-service JSON export endpoint for GDPR data portability.

---

## Post-Implementation: Pre-Release Checklist

Before submitting the app to Apple App Store and Google Play:

1. Israeli attorney has reviewed and signed off on the final Markdown of both documents (in both languages).
2. The partnership is registered; placeholder `[Partnership Name]` is replaced in all 4 rows via Supabase Studio.
3. `effective_date` in all 4 rows is updated to the actual store-submission date.
4. The Privacy Policy URL field in App Store Connect and Google Play Console points to the public-web version of the policy (separate task).
