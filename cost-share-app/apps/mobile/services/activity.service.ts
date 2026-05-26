/**
 * Activity feed — reads denormalized activity_events rows for the current
 * user. Triggers populate the table; this service only queries.
 */

import { ActivityEvent, ActivityEventKind } from '@cost-share/shared';
import { supabase } from '../lib/supabase';
import { getCurrentUserId } from '../lib/auth';

export const ACTIVITY_INITIAL_PAGE_SIZE = 15;
export const ACTIVITY_PAGE_SIZE = 20;
export const ACTIVITY_INITIAL_SKELETON_COUNT = 6;

export interface ActivityPage {
    items: ActivityEvent[];
    nextCursor?: string;
}

export interface FetchRecentActivityOptions {
    limit?: number;
    before?: string;
}

interface ActivityEventRow {
    id: string;
    user_id: string;
    kind: ActivityEventKind;
    group_id: string | null;
    ref_id: string;
    actor_user_id: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
}

function rowToEvent(row: ActivityEventRow): ActivityEvent {
    return {
        id: row.id,
        userId: row.user_id,
        kind: row.kind,
        groupId: row.group_id,
        refId: row.ref_id,
        actorUserId: row.actor_user_id,
        metadata: row.metadata ?? {},
        createdAt: new Date(row.created_at),
    };
}

/**
 * Returns the caller's `profiles.activity_last_seen_at` value, or `null` if
 * unavailable. Called on focus BEFORE `mark_activity_seen` so the screen can
 * "freeze" the divider position between unseen and seen events.
 */
export async function fetchActivityLastSeenAt(): Promise<Date | null> {
    const userId = await getCurrentUserId();
    if (!userId) return null;
    const { data, error } = await supabase
        .from('profiles')
        .select('activity_last_seen_at')
        .eq('id', userId)
        .maybeSingle();
    if (error || !data?.activity_last_seen_at) return null;
    return new Date(data.activity_last_seen_at as string);
}

export async function fetchRecentActivity(
    options: FetchRecentActivityOptions = {},
): Promise<ActivityPage> {
    const userId = await getCurrentUserId();
    if (!userId) return { items: [] };

    const limit = options.limit ?? ACTIVITY_PAGE_SIZE;
    const fetchLimit = limit + 1;

    let query = supabase
        .from('activity_events')
        .select('id, user_id, kind, group_id, ref_id, actor_user_id, metadata, created_at')
        .order('created_at', { ascending: false })
        .limit(fetchLimit);

    if (options.before) {
        query = query.lt('created_at', options.before);
    }

    const { data, error } = await query;
    if (error) {
        console.error('Failed to fetch activity events:', error);
        return { items: [] };
    }

    const rows = (data ?? []) as ActivityEventRow[];
    const events = rows.map(rowToEvent);
    const hasMore = events.length === fetchLimit;
    const items = hasMore ? events.slice(0, limit) : events;
    const nextCursor = hasMore && items.length > 0
        ? items[items.length - 1].createdAt.toISOString()
        : undefined;

    return { items, nextCursor };
}
