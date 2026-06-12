import { createClient, type SupabaseClient } from 'supabase';
import type { ActivityRecord, ResolvedNames, PrefsRow, SendPushDeps } from './handler.ts';
import { sendExpoPush } from './expo.ts';

export function makeSupabaseDeps(opts: { url: string; serviceRole: string }): SendPushDeps {
    const sb: SupabaseClient = createClient(opts.url, opts.serviceRole, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    return {
        async recordPending(eventId, recipientId) {
            const { error } = await sb.from('push_deliveries').insert({
                activity_event_id: eventId, recipient_user_id: recipientId, status: 'pending', attempts: 0,
            });
            if (!error) return 'new';
            if (error.code !== '23505') throw error; // surface non-conflict failures, don't swallow
            const { data } = await sb.from('push_deliveries')
                .select('status').eq('activity_event_id', eventId).maybeSingle();
            // Once a delivery is in-flight ('pending') or done ('sent'), block a duplicate send.
            return data?.status === 'sent' || data?.status === 'pending' ? 'duplicate' : 'new';
        },
        async markSkipped(eventId, reason) {
            await sb.from('push_deliveries')
                .update({ status: 'skipped', last_error: reason })
                .eq('activity_event_id', eventId);
        },
        async markSent(eventId, ticketIds) {
            await sb.from('push_deliveries')
                .update({ status: 'sent', expo_ticket_ids: ticketIds, sent_at: new Date().toISOString() })
                .eq('activity_event_id', eventId);
        },
        async markFailed(eventId, error) {
            await sb.rpc('increment_push_attempt', { p_event_id: eventId, p_error: error })
                .then(({ error: e }) => { if (e) console.error('markFailed', e); });
        },
        async loadPreferences(userId): Promise<PrefsRow | null> {
            const { data } = await sb.from('notification_preferences')
                .select('push_enabled, expenses_push, settlements_push, messages_push, friends_push, groups_push')
                .eq('user_id', userId).maybeSingle();
            return (data as PrefsRow | null) ?? null;
        },
        async loadActiveTokens(userId) {
            const { data } = await sb.from('device_tokens')
                .select('token').eq('user_id', userId).is('disabled_at', null);
            return (data ?? []) as Array<{ token: string }>;
        },
        async resolveNames(record: ActivityRecord): Promise<ResolvedNames> {
            const ids = new Set<string>();
            if (record.actor_user_id) ids.add(record.actor_user_id);
            const newMemberId = record.metadata?.new_member_user_id as string | undefined;
            if (newMemberId) ids.add(newMemberId);

            const names = new Map<string, string>();
            if (ids.size > 0) {
                const { data } = await sb.from('profiles').select('id, name').in('id', [...ids]);
                for (const row of data ?? []) names.set(row.id as string, (row.name as string) ?? '');
            }
            let groupName = '';
            if (record.group_id) {
                const { data } = await sb.from('groups').select('name').eq('id', record.group_id).maybeSingle();
                groupName = (data?.name as string) ?? '';
            }
            return {
                actorName: record.actor_user_id ? (names.get(record.actor_user_id) ?? '') : '',
                groupName,
                newMemberName: newMemberId ? names.get(newMemberId) : undefined,
            };
        },
        async recipientLanguage(userId) {
            const { data } = await sb.from('profiles').select('language').eq('id', userId).maybeSingle();
            return (data?.language as string) === 'he' ? 'he' : 'en';
        },
        async unreadCount(userId) {
            const { data: p } = await sb.from('profiles')
                .select('activity_last_seen_at').eq('id', userId).maybeSingle();
            const seen = (p?.activity_last_seen_at as string) ?? '1970-01-01T00:00:00Z';
            const { count } = await sb.from('activity_events')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', userId).gt('created_at', seen).neq('actor_user_id', userId);
            return count ?? 0; // null also means query error — degrade to 0 rather than crash
        },
        async disableToken(token, reason) {
            await sb.from('device_tokens')
                .update({ disabled_at: new Date().toISOString(), disabled_reason: reason })
                .eq('token', token);
        },
        sendExpo(messages) {
            return sendExpoPush(messages);
        },
    };
}
