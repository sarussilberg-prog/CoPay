/**
 * Activity feed — Supabase direct (expenses + settlements + messages for user's groups)
 */

import { RecentActivity } from '@cost-share/shared';
import { supabase } from '../lib/supabase';
import { getCurrentUserId } from '../lib/auth';
import i18n from '../i18n';

export const ACTIVITY_INITIAL_PAGE_SIZE = 15;
export const ACTIVITY_PAGE_SIZE = 20;
export const ACTIVITY_INITIAL_SKELETON_COUNT = 6;

export interface ActivityPage {
    items: RecentActivity[];
    nextCursor?: string;
}

export interface FetchRecentActivityOptions {
    limit?: number;
    before?: string;
    userId?: string;
    groupIds?: string[];
    groupNamesById?: Record<string, string>;
}

interface ProfileSummary {
    name: string;
    avatarUrl?: string;
}

type ProfileEmbedRow = { name?: string; avatar_url?: string | null };
type ProfileEmbed = ProfileEmbedRow | ProfileEmbedRow[] | null;

async function getUserGroupIds(userId: string): Promise<string[]> {
    const { data, error } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', userId)
        .eq('is_active', true);
    if (error) throw error;
    return (data ?? []).map(row => row.group_id as string);
}

function profileFromEmbed(embed: ProfileEmbed): ProfileSummary | undefined {
    const row: ProfileEmbedRow | null | undefined = Array.isArray(embed) ? embed[0] : embed;
    if (!row?.name) return undefined;
    return {
        name: row.name,
        avatarUrl: row.avatar_url ?? undefined,
    };
}

function buildExpenseQuery(groupIds: string[], limit: number, before?: string) {
    let query = supabase
        .from('expenses')
        .select(
            'id, group_id, description, amount, currency, expense_date, created_at, created_by, creator:profiles!created_by(name, avatar_url)',
        )
        .in('group_id', groupIds)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (before) {
        query = query.lt('created_at', before);
    }
    return query;
}

function buildMessageQuery(groupIds: string[], limit: number, before?: string) {
    let query = supabase
        .from('group_messages')
        .select('id, group_id, body, created_at, user_id')
        .in('group_id', groupIds)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (before) {
        query = query.lt('created_at', before);
    }
    return query;
}

async function fetchProfiles(userIds: string[]): Promise<Map<string, ProfileSummary>> {
    const profiles = new Map<string, ProfileSummary>();
    if (userIds.length === 0) return profiles;

    const { data, error } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .in('id', userIds);
    if (error) throw error;

    for (const row of data ?? []) {
        profiles.set(row.id as string, {
            name: row.name as string,
            avatarUrl: (row.avatar_url as string | null) ?? undefined,
        });
    }
    return profiles;
}

function buildSettlementQuery(groupIds: string[], limit: number, before?: string) {
    let query = supabase
        .from('settlements')
        .select(
            'id, group_id, amount, currency, settlement_date, created_at, from_user_id, to_user_id, from_user:profiles!from_user_id(name, avatar_url), to_user:profiles!to_user_id(name, avatar_url)',
        )
        .in('group_id', groupIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (before) {
        query = query.lt('created_at', before);
    }
    return query;
}

async function fetchGroupNames(groupIds: string[]): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    if (groupIds.length === 0) return names;

    const { data, error } = await supabase
        .from('groups')
        .select('id, name')
        .in('id', groupIds);
    if (error) throw error;
    for (const row of data ?? []) {
        names.set(row.id as string, row.name as string);
    }
    return names;
}

function mapToActivities(
    expenses: Record<string, unknown>[],
    settlements: Record<string, unknown>[],
    messages: Record<string, unknown>[],
    groupNamesById: Map<string, string>,
    messageProfilesById: Map<string, ProfileSummary>,
    currentUserId: string,
): RecentActivity[] {
    const activities: RecentActivity[] = [];

    for (const row of expenses) {
        const createdBy = row.created_by as string;
        const creator = profileFromEmbed(row.creator as ProfileEmbed);
        activities.push({
            id: row.id as string,
            activityType: 'expense',
            groupId: row.group_id as string,
            description: row.description as string,
            amount: Number(row.amount),
            currency: row.currency as string,
            userId: createdBy,
            userName: creator?.name ?? 'Unknown',
            userAvatarUrl: creator?.avatarUrl,
            activityDate: new Date(row.expense_date as string),
            createdAt: new Date(row.created_at as string),
        });
    }

    for (const row of settlements) {
        const fromUserId = row.from_user_id as string;
        const toUserId = row.to_user_id as string;
        const groupId = row.group_id as string;
        const amountStr = `${row.currency as string} ${Number(row.amount).toFixed(2)}`;
        const fromProfile = profileFromEmbed(row.from_user as ProfileEmbed);
        const toProfile = profileFromEmbed(row.to_user as ProfileEmbed);
        const fromName = fromProfile?.name ?? 'Unknown';
        const toName = toProfile?.name ?? 'Unknown';
        const groupName = groupNamesById.get(groupId) ?? '';

        let description: string;
        if (fromUserId === currentUserId) {
            description = i18n.t('activity.youPaid', { name: toName, amount: amountStr });
        } else if (toUserId === currentUserId) {
            description = i18n.t('activity.paidYou', { name: fromName, amount: amountStr });
        } else {
            description = i18n.t('feed.settlement', {
                from: fromName,
                to: toName,
                amount: amountStr,
            });
        }
        if (groupName) {
            description = `${description} ${i18n.t('activity.inGroup', { group: groupName })}`;
        }

        activities.push({
            id: row.id as string,
            activityType: 'settlement',
            groupId,
            description,
            amount: Number(row.amount),
            currency: row.currency as string,
            userId: fromUserId,
            userName: fromName,
            userAvatarUrl: fromProfile?.avatarUrl,
            activityDate: new Date(row.settlement_date as string),
            createdAt: new Date(row.created_at as string),
        });
    }

    for (const row of messages) {
        const userId = row.user_id as string;
        const sender = messageProfilesById.get(userId);
        const createdAt = new Date(row.created_at as string);
        activities.push({
            id: row.id as string,
            activityType: 'message',
            groupId: row.group_id as string,
            description: row.body as string,
            amount: 0,
            currency: '',
            userId,
            userName: sender?.name ?? 'Unknown',
            userAvatarUrl: sender?.avatarUrl,
            activityDate: createdAt,
            createdAt,
        });
    }

    return activities.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function fetchRecentActivity(
    options: FetchRecentActivityOptions = {},
): Promise<ActivityPage> {
    const userId = options.userId ?? (await getCurrentUserId());
    if (!userId) return { items: [] };

    const limit = options.limit ?? ACTIVITY_PAGE_SIZE;
    const fetchLimit = limit + 1;

    try {
        const groupIds =
            options.groupIds && options.groupIds.length > 0
                ? options.groupIds
                : await getUserGroupIds(userId);
        if (groupIds.length === 0) return { items: [] };

        const [expensesResult, settlementsResult, messagesResult] = await Promise.all([
            buildExpenseQuery(groupIds, fetchLimit, options.before),
            buildSettlementQuery(groupIds, fetchLimit, options.before),
            buildMessageQuery(groupIds, fetchLimit, options.before),
        ]);

        if (expensesResult.error) throw expensesResult.error;
        if (settlementsResult.error) throw settlementsResult.error;
        if (messagesResult.error) throw messagesResult.error;

        const settlementGroupIds = new Set<string>();
        for (const row of settlementsResult.data ?? []) {
            settlementGroupIds.add(row.group_id as string);
        }

        const messageUserIds = [
            ...new Set(
                (messagesResult.data ?? []).map((row) => row.user_id as string),
            ),
        ];

        const [groupNamesById, messageProfilesById] = await Promise.all([
            options.groupNamesById
                ? Promise.resolve(new Map(Object.entries(options.groupNamesById)))
                : fetchGroupNames([...settlementGroupIds]),
            fetchProfiles(messageUserIds),
        ]);

        const merged = mapToActivities(
            (expensesResult.data ?? []) as Record<string, unknown>[],
            (settlementsResult.data ?? []) as Record<string, unknown>[],
            (messagesResult.data ?? []) as Record<string, unknown>[],
            groupNamesById,
            messageProfilesById,
            userId,
        );

        const hasMore =
            merged.length > limit ||
            (expensesResult.data?.length ?? 0) === fetchLimit ||
            (settlementsResult.data?.length ?? 0) === fetchLimit ||
            (messagesResult.data?.length ?? 0) === fetchLimit;
        const items = merged.slice(0, limit);
        const nextCursor =
            hasMore && items.length > 0
                ? items.at(-1)!.createdAt.toISOString()
                : undefined;

        return { items, nextCursor };
    } catch (error) {
        console.error('Failed to fetch activity:', error);
        return { items: [] };
    }
}
