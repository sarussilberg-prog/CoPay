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
