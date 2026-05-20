// HTML rendering for invite-landing.
// All user-supplied strings are passed through escapeHtml.

// App Store URL is read from an env var because Apple assigns the numeric ID at
// publication time; before publication, the env var falls back to the marketing
// site itself. Set KUPA_APP_STORE_URL once the app is published.
const APP_STORE_URL = Deno.env.get('KUPA_APP_STORE_URL') ?? 'https://kupa.pro/';
const PLAY_STORE_URL = Deno.env.get('KUPA_PLAY_STORE_URL') ?? 'https://play.google.com/store/apps/details?id=com.kupa.mobile';

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
    if (m) location.href = 'com.kupa.mobile://invite/' + m[1] + '/' + m[2];
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
        <h1>${inviterName} רוצה לחלוק איתך הוצאות דרך Kupa</h1>
        <p>חלקו את חשבון המסעדה, הטיול, והדירה — בלי לעשות חשבונות.</p>
        <a class="btn primary" href="com.kupa.mobile://invite/i/${escapeHtml(token)}">פתח את Kupa</a>
        ${platformButtons()}
        <p class="footnote">אחרי ההורדה — חזור לקישור הזה.</p>
    `;
    return shell({
        title: `${preview.inviter.name} הזמין אותך ל-Kupa`,
        description: 'הצטרף ל-Kupa וחלוק הוצאות בקלות.',
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
        <h1>הוזמנת לקופה ב-Kupa</h1>
        <h2>${name}</h2>
        <div class="members">${memberAvatars}</div>
        <div class="meta">${g.member_count} חברים · ${escapeHtml(g.currency)}</div>
        <a class="btn primary" href="com.kupa.mobile://invite/g/${escapeHtml(token)}">הצטרף לקופה ב-Kupa</a>
        ${platformButtons()}
        <p class="footnote">אחרי ההורדה — חזור לקישור הזה.</p>
    `;
    return shell({
        title: `הוזמנת לקופת '${g.name}' ב-Kupa`,
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
        title: 'Kupa',
        description: 'חלקו הוצאות בקלות.',
        canonical: 'https://kupa.pro/',
        body: `
            <h1>Kupa</h1>
            <p>חלקו את חשבון המסעדה, הטיול, והדירה — בלי לעשות חשבונות.</p>
            ${platformButtons()}
        `,
    });
}
