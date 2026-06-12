import { assertEquals } from '@std/assert';
import { renderNotification, formatMoney } from './render.ts';

Deno.test('formatMoney uses symbol for known currency, code otherwise', () => {
    assertEquals(formatMoney(240, 'ILS'), '₪240');
    assertEquals(formatMoney('150.5', 'USD'), '$150.50');
    assertEquals(formatMoney(10, 'CHF'), '10 CHF');
});

Deno.test('expense_added renders he with group in title, no brackets', () => {
    const r = renderNotification('expense_added', 'he', {
        actorName: 'דנה', groupName: 'סופר וחברים', description: 'קניות', amount: 240, currency: 'ILS',
    });
    assertEquals(r.title, 'סופר וחברים');
    assertEquals(r.body, 'הוצאה חדשה מאת דנה · קניות · ₪240');
});

Deno.test('friend_request renders en', () => {
    const r = renderNotification('friend_request_received', 'en', { actorName: 'Dana', groupName: '' });
    assertEquals(r.title, 'New friend request');
    assertEquals(r.body, 'Dana wants to connect');
});

Deno.test('group_member_joined uses new member name', () => {
    const r = renderNotification('group_member_joined', 'he', {
        actorName: 'דנה', groupName: 'טיול', newMemberName: 'יוסי',
    });
    assertEquals(r.title, 'טיול');
    assertEquals(r.body, 'יוסי הצטרף לקבוצה');
});
