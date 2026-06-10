// Legal pages (/legal/privacy, /legal/terms) and /account-deletion.
// Content comes from the `legal_documents` table (anon-readable when is_published = true).
// See cost-share-app/supabase/legal-documents.sql and docs/PLAY_STORE_ANDROID.md.

import { marked } from 'https://esm.sh/marked@12.0.2';

type Locale = 'he' | 'en';
type Slug = 'privacy' | 'terms';

const SUPPORT_EMAIL =
    Deno.env.get('COPAY_SUPPORT_EMAIL') ?? Deno.env.get('KUPAY_SUPPORT_EMAIL') ?? Deno.env.get('KUPA_SUPPORT_EMAIL') ?? 'sarussilberg@gmail.com';

interface LegalRow {
    slug: Slug;
    locale: Locale;
    version: string;
    title: string;
    content_md: string;
    effective_date: string;
}

function pickLocale(req: Request): Locale {
    const accept = (req.headers.get('accept-language') ?? '').toLowerCase();
    return accept.startsWith('he') || accept.includes(',he') ? 'he' : 'en';
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[c]!));
}

function legalShell({ title, locale, body }: { title: string; locale: Locale; body: string }): string {
    const dir = locale === 'he' ? 'rtl' : 'ltr';
    const t = escapeHtml(title);
    return `<!doctype html>
<html lang="${locale}" dir="${dir}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${t} · CoPay</title>
<meta name="robots" content="index,follow" />
<style>
  :root{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;}
  body{margin:0;background:#f8fafc;color:#0f172a;}
  .wrap{max-width:760px;margin:0 auto;padding:48px 24px 64px;}
  header{display:flex;align-items:center;gap:12px;margin-bottom:32px;}
  header a{color:#3B82F6;font-weight:700;text-decoration:none;font-size:22px;}
  h1{font-size:28px;margin:0 0 8px;}
  .meta{color:#64748b;font-size:14px;margin-bottom:32px;}
  article{background:#fff;border-radius:16px;padding:32px;box-shadow:0 1px 3px rgba(15,23,42,0.06);line-height:1.7;}
  article h1,article h2,article h3{margin-top:24px;line-height:1.3;}
  article h1{font-size:22px;}
  article h2{font-size:18px;}
  article h3{font-size:16px;}
  article p{margin:0 0 16px;}
  article ul,article ol{margin:0 0 16px;padding-${dir === 'rtl' ? 'right' : 'left'}:24px;}
  article li{margin-bottom:6px;}
  article a{color:#0ea5e9;}
  article code{background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:90%;}
  footer{margin-top:32px;text-align:center;color:#94a3b8;font-size:13px;}
  footer a{color:#64748b;}
</style>
</head>
<body>
<div class="wrap">
  <header><a href="https://kupa.pro/">CoPay</a></header>
  ${body}
  <footer>
    <a href="https://kupa.pro/legal/privacy">${locale === 'he' ? 'מדיניות פרטיות' : 'Privacy'}</a>
    &nbsp;·&nbsp;
    <a href="https://kupa.pro/legal/terms">${locale === 'he' ? 'תנאי שימוש' : 'Terms'}</a>
    &nbsp;·&nbsp;
    <a href="https://kupa.pro/account-deletion">${locale === 'he' ? 'מחיקת חשבון' : 'Account deletion'}</a>
  </footer>
</div>
</body></html>`;
}

async function fetchLegal(
    client: { from: (t: string) => any },
    slug: Slug,
    locale: Locale,
): Promise<LegalRow | null> {
    const { data } = await client
        .from('legal_documents')
        .select('slug, locale, version, title, content_md, effective_date')
        .eq('slug', slug)
        .eq('locale', locale)
        .eq('is_published', true)
        .maybeSingle();
    return (data as LegalRow | null) ?? null;
}

export async function handleLegal(
    req: Request,
    path: string,
    client: { from: (t: string) => any },
): Promise<Response | null> {
    const m = path.match(/^\/legal\/(privacy|terms)\/?$/);
    if (!m) return null;
    const slug = m[1] as Slug;
    const preferred = pickLocale(req);

    let row = await fetchLegal(client, slug, preferred);
    if (!row) row = await fetchLegal(client, slug, preferred === 'he' ? 'en' : 'he');

    if (!row) {
        const title = preferred === 'he' ? 'המסמך לא זמין כעת' : 'Document not available';
        const note = preferred === 'he'
            ? 'המסמך עדיין לא פורסם. נא לפנות לתמיכה.'
            : 'This document has not been published yet. Please contact support.';
        return new Response(
            legalShell({
                title,
                locale: preferred,
                body: `
                    <article>
                        <h1>${escapeHtml(title)}</h1>
                        <p>${escapeHtml(note)}</p>
                        <p>${preferred === 'he' ? 'תמיכה' : 'Support'}:
                            <a href="mailto:${escapeHtml(SUPPORT_EMAIL)}">${escapeHtml(SUPPORT_EMAIL)}</a></p>
                    </article>
                `,
            }),
            { status: 404, headers: htmlHeaders() },
        );
    }

    const rendered = marked.parse(row.content_md, { async: false }) as string;
    const effective = new Date(row.effective_date).toLocaleDateString(
        row.locale === 'he' ? 'he-IL' : 'en-US',
        { year: 'numeric', month: 'long', day: 'numeric' },
    );
    const metaLabel = row.locale === 'he'
        ? `גרסה ${row.version} · בתוקף מ-${effective}`
        : `Version ${row.version} · Effective ${effective}`;

    return new Response(
        legalShell({
            title: row.title,
            locale: row.locale,
            body: `
                <h1>${escapeHtml(row.title)}</h1>
                <div class="meta">${escapeHtml(metaLabel)}</div>
                <article>${rendered}</article>
            `,
        }),
        { status: 200, headers: htmlHeaders() },
    );
}

export function handleAccountDeletion(req: Request, path: string): Response | null {
    if (path !== '/account-deletion' && path !== '/account-deletion/') return null;
    const locale = pickLocale(req);
    const he = locale === 'he';
    const title = he ? 'מחיקת חשבון CoPay' : 'Delete your CoPay account';
    const body = he
        ? `
            <h1>${escapeHtml(title)}</h1>
            <article>
                <p>אפשר למחוק את חשבון CoPay שלך ישירות מתוך האפליקציה. המחיקה היא קבועה ומוחקת את הנתונים האישיים שלך מהמערכת.</p>
                <h2>איך מוחקים</h2>
                <ol>
                    <li>פתח את אפליקציית CoPay והתחבר לחשבונך.</li>
                    <li>עבור ל-<strong>הגדרות</strong> (אייקון גלגל שיניים).</li>
                    <li>גלול אל החלק <strong>פרטיות וחשבון</strong>.</li>
                    <li>בחר <strong>מחק חשבון</strong> ואשר את הפעולה.</li>
                </ol>
                <h2>מה נמחק</h2>
                <ul>
                    <li>הפרופיל האישי שלך (שם, אימייל, תמונה).</li>
                    <li>החברויות שלך בקבוצות; הוצאות שיצרת מנותקות מהפרופיל שלך.</li>
                    <li>הגדרות וחיבורי כניסה (Google).</li>
                </ul>
                <h2>מה נשמר</h2>
                <p>נתונים מסכמים על קבוצות וחישובים בקבוצה משותפים לשאר החברים בה ולכן נשמרים בלי קישור אליך, כך שהיתרות של חברי הקבוצה לא יישברו. אנו שומרים גם מינימום נתונים שנדרשים על פי חוק (חשבוניות, יומני אבטחה) לתקופה מוגבלת.</p>
                <h2>זמני ביצוע</h2>
                <p>המחיקה היא מיידית. גיבויים אוטומטיים נמחקים בתוך 30 יום לכל היותר.</p>
                <h2>בעיה במחיקה?</h2>
                <p>אם אינך מצליח/ה להיכנס לאפליקציה, נא לפנות אלינו ל-<a href="mailto:${escapeHtml(SUPPORT_EMAIL)}">${escapeHtml(SUPPORT_EMAIL)}</a> מאותו האימייל שאיתו נרשמת, ונבצע את המחיקה ידנית בתוך 14 ימי עסקים.</p>
            </article>
        `
        : `
            <h1>${escapeHtml(title)}</h1>
            <article>
                <p>You can delete your CoPay account directly from the app. Deletion is permanent and removes your personal data from our systems.</p>
                <h2>How to delete</h2>
                <ol>
                    <li>Open the CoPay app and sign in.</li>
                    <li>Go to <strong>Settings</strong> (gear icon).</li>
                    <li>Scroll to <strong>Privacy &amp; Account</strong>.</li>
                    <li>Tap <strong>Delete account</strong> and confirm.</li>
                </ol>
                <h2>What is deleted</h2>
                <ul>
                    <li>Your personal profile (name, email, avatar).</li>
                    <li>Your group memberships; expenses you created are detached from your profile.</li>
                    <li>Settings and sign-in links (Google).</li>
                </ul>
                <h2>What is retained</h2>
                <p>Aggregate group data and balances are shared with other members and are kept without a link to you so balances remain consistent. We also keep the minimum data required by law (receipts, security logs) for a limited period.</p>
                <h2>Timing</h2>
                <p>Deletion is immediate. Automated backups are purged within 30 days.</p>
                <h2>Trouble deleting?</h2>
                <p>If you cannot sign in, email us at <a href="mailto:${escapeHtml(SUPPORT_EMAIL)}">${escapeHtml(SUPPORT_EMAIL)}</a> from the address you registered with, and we will delete your account manually within 14 business days.</p>
            </article>
        `;
    return new Response(
        legalShell({ title, locale, body }),
        { status: 200, headers: htmlHeaders() },
    );
}

function htmlHeaders(): HeadersInit {
    return {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
    };
}
