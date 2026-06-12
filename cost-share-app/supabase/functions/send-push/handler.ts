import { renderNotification, type ActivityKind, type Lang } from './render.ts';
import type { ExpoMessage, ExpoSendResult } from './expo.ts';

export interface ActivityRecord {
    id: string;
    user_id: string;
    kind: ActivityKind;
    group_id: string | null;
    ref_id: string;
    actor_user_id: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
}

export interface PrefsRow {
    push_enabled: boolean;
    expenses_push: boolean;
    settlements_push: boolean;
    messages_push: boolean;
    friends_push: boolean;
    groups_push: boolean;
}

export interface ResolvedNames {
    actorName: string;
    groupName: string;
    newMemberName?: string;
}

export interface SendPushDeps {
    recordPending(eventId: string, recipientId: string): Promise<'new' | 'duplicate'>;
    markSkipped(eventId: string, reason: string): Promise<void>;
    markSent(eventId: string, ticketIds: string[]): Promise<void>;
    markFailed(eventId: string, error: string): Promise<void>;
    loadPreferences(userId: string): Promise<PrefsRow | null>;
    loadActiveTokens(userId: string): Promise<Array<{ token: string }>>;
    resolveNames(record: ActivityRecord): Promise<ResolvedNames>;
    recipientLanguage(userId: string): Promise<Lang>;
    unreadCount(userId: string): Promise<number>;
    disableToken(token: string, reason: string): Promise<void>;
    sendExpo(messages: ExpoMessage[]): Promise<ExpoSendResult>;
}

export type PushOutcome =
    | 'sent' | 'skipped_self' | 'skipped_prefs' | 'skipped_no_tokens' | 'duplicate' | 'failed';

const KIND_TO_PREF: Record<ActivityKind, keyof PrefsRow> = {
    expense_added: 'expenses_push',
    settlement_added: 'settlements_push',
    message_posted: 'messages_push',
    friend_request_received: 'friends_push',
    group_added: 'groups_push',
    group_member_joined: 'groups_push',
    group_removed: 'groups_push',
};

const DEFAULT_PREFS: PrefsRow = {
    push_enabled: true, expenses_push: true, settlements_push: true,
    messages_push: true, friends_push: true, groups_push: true,
};

export async function processActivityEvent(record: ActivityRecord, deps: SendPushDeps): Promise<PushOutcome> {
    // Defensive: the DB trigger filters these, but never notify on a user's own / actor-less event.
    if (!record.actor_user_id || record.actor_user_id === record.user_id) {
        await deps.markSkipped(record.id, 'self');
        return 'skipped_self';
    }

    if ((await deps.recordPending(record.id, record.user_id)) === 'duplicate') {
        return 'duplicate';
    }

    const prefs = (await deps.loadPreferences(record.user_id)) ?? DEFAULT_PREFS;
    if (!prefs.push_enabled || !prefs[KIND_TO_PREF[record.kind]]) {
        await deps.markSkipped(record.id, 'prefs');
        return 'skipped_prefs';
    }

    const tokens = await deps.loadActiveTokens(record.user_id);
    if (tokens.length === 0) {
        await deps.markSkipped(record.id, 'no_tokens');
        return 'skipped_no_tokens';
    }

    const [names, lang, badge] = await Promise.all([
        deps.resolveNames(record),
        deps.recipientLanguage(record.user_id),
        deps.unreadCount(record.user_id),
    ]);

    const md = record.metadata ?? {};
    const rendered = renderNotification(record.kind, lang, {
        actorName: names.actorName,
        groupName: names.groupName,
        newMemberName: names.newMemberName,
        description: (md.description as string | undefined) ?? null,
        amount: (md.amount as number | string | undefined) ?? null,
        currency: (md.currency as string | undefined) ?? null,
        body: (md.body as string | undefined) ?? null,
    });

    const messages: ExpoMessage[] = tokens.map((t) => ({
        to: t.token,
        title: rendered.title,
        body: rendered.body,
        sound: 'default',
        badge,
        data: {
            kind: record.kind,
            groupId: record.group_id,
            refId: record.ref_id,
            activityEventId: record.id,
        },
    }));

    try {
        const result = await deps.sendExpo(messages);
        for (const bad of result.invalidTokens) {
            await deps.disableToken(bad, 'expo_invalid');
        }
        await deps.markSent(record.id, result.ticketIds);
        return 'sent';
    } catch (e) {
        await deps.markFailed(record.id, e instanceof Error ? e.message : String(e));
        return 'failed';
    }
}
