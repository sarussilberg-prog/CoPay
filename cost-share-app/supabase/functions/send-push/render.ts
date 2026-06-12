export type Lang = 'he' | 'en';

export type ActivityKind =
    | 'expense_added' | 'settlement_added' | 'message_posted'
    | 'friend_request_received' | 'group_added' | 'group_member_joined' | 'group_removed';

export interface RenderParams {
    actorName: string;
    groupName: string;
    newMemberName?: string;
    description?: string | null;
    amount?: number | string | null;
    currency?: string | null;
    body?: string | null;
}

export interface Rendered { title: string; body: string; }

const SYMBOLS: Record<string, string> = { ILS: '₪', USD: '$', EUR: '€', GBP: '£' };

export function formatMoney(amount: number | string | null | undefined, currency: string | null | undefined): string {
    const n = typeof amount === 'string' ? Number(amount) : (amount ?? 0);
    const value = Number.isFinite(n) ? (Number.isInteger(n) ? String(n) : n.toFixed(2)) : '0';
    const code = (currency ?? '').toUpperCase();
    const sym = SYMBOLS[code];
    return sym ? `${sym}${value}` : `${value} ${code}`.trim();
}

function joinDot(parts: Array<string | null | undefined>): string {
    return parts.map((p) => (p ?? '').trim()).filter((p) => p.length > 0).join(' · ');
}

export function renderNotification(kind: ActivityKind, lang: Lang, p: RenderParams): Rendered {
    const money = formatMoney(p.amount, p.currency);
    const he = lang === 'he';
    switch (kind) {
        case 'expense_added':
            return {
                title: p.groupName,
                body: he
                    ? joinDot([`הוצאה חדשה מאת ${p.actorName}`, p.description, money])
                    : joinDot([`New expense from ${p.actorName}`, p.description, money]),
            };
        case 'settlement_added':
            return {
                title: p.groupName,
                body: he
                    ? joinDot([`תשלום חדש מאת ${p.actorName}`, money])
                    : joinDot([`New payment from ${p.actorName}`, money]),
            };
        case 'message_posted':
            return { title: joinDot([p.actorName, p.groupName]), body: (p.body ?? '').trim() };
        case 'friend_request_received':
            return he
                ? { title: 'בקשת חברות חדשה', body: `${p.actorName} רוצה להתחבר איתך` }
                : { title: 'New friend request', body: `${p.actorName} wants to connect` };
        case 'group_added':
            return he
                ? { title: 'צורפת לקבוצה', body: joinDot([`${p.actorName} צירף אותך`, p.groupName]) }
                : { title: 'You were added to a group', body: joinDot([`${p.actorName} added you`, p.groupName]) };
        case 'group_member_joined':
            return {
                title: p.groupName,
                body: he ? `${p.newMemberName ?? ''} הצטרף לקבוצה` : `${p.newMemberName ?? ''} joined the group`,
            };
        case 'group_removed':
            return he
                ? { title: p.groupName, body: 'הוסרת מהקבוצה' }
                : { title: p.groupName, body: 'You were removed from the group' };
    }
}
