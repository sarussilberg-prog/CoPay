/**
 * Activity feed — Supabase direct (expenses + settlements for user's groups)
 */

import { RecentActivity } from '@cost-share/shared';
import { supabase } from '../lib/supabase';
import { getCurrentUserId } from '../lib/auth';
import i18n from '../i18n';

export const ACTIVITY_PAGE_SIZE = 50;

export interface ActivityPage {
    items: RecentActivity[];
    nextCursor?: string;
}

async function getUserGroupIds(userId: string): Promise<string[]> {
    const { data, error } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', userId)
        .eq('is_active', true);
    if (error) throw error;
    return (data ?? []).map(row => row.group_id as string);
}

async function fetchProfileNames(userIds: string[]): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    if (userIds.length === 0) return names;

    const { data, error } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', userIds);
    if (error) throw error;

    for (const row of data ?? []) {
        names.set(row.id as string, row.name as string);
    }
    return names;
}

function buildExpenseQuery(groupIds: string[], limit: number, before?: string) {
    let query = supabase
        .from('expenses')
        .select(
            'id, group_id, description, amount, currency, expense_date, created_at, created_by',
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

function buildSettlementQuery(groupIds: string[], limit: number, before?: string) {
    let query = supabase
        .from('settlements')
        .select(
            'id, group_id, amount, currency, settlement_date, created_at, from_user_id, to_user_id',
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
    namesById: Map<string, string>,
    groupNamesById: Map<string, string>,
    currentUserId: string,
): RecentActivity[] {
    const activities: RecentActivity[] = [];

    for (const row of expenses) {
        const createdBy = row.created_by as string;
        activities.push({
            id: row.id as string,
            activityType: 'expense',
            groupId: row.group_id as string,
            description: row.description as string,
            amount: Number(row.amount),
            currency: row.currency as string,
            userId: createdBy,
            userName: namesById.get(createdBy) ?? 'Unknown',
            activityDate: new Date(row.expense_date as string),
            createdAt: new Date(row.created_at as string),
        });
    }

    for (const row of settlements) {
        const fromUserId = row.from_user_id as string;
        const toUserId = row.to_user_id as string;
        const groupId = row.group_id as string;
        const amountStr = `${row.currency as string} ${Number(row.amount).toFixed(2)}`;
        const fromName = namesById.get(fromUserId) ?? 'Unknown';
        const toName = namesById.get(toUserId) ?? 'Unknown';
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
            activityDate: new Date(row.settlement_date as string),
            createdAt: new Date(row.created_at as string),
        });
    }

    return activities.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function fetchRecentActivity(
    options: { limit?: number; before?: string } = {},
): Promise<ActivityPage> {
    const userId = await getCurrentUserId();
    if (!userId) return { items: [] };

    const limit = options.limit ?? ACTIVITY_PAGE_SIZE;
    const fetchLimit = limit + 1;

    try {
        const groupIds = await getUserGroupIds(userId);
        if (groupIds.length === 0) return { items: [] };

        const [expensesResult, settlementsResult] = await Promise.all([
            buildExpenseQuery(groupIds, fetchLimit, options.before),
            buildSettlementQuery(groupIds, fetchLimit, options.before),
        ]);

        if (expensesResult.error) throw expensesResult.error;
        if (settlementsResult.error) throw settlementsResult.error;

        const userIds = new Set<string>();
        for (const row of expensesResult.data ?? []) {
            userIds.add(row.created_by as string);
        }
        for (const row of settlementsResult.data ?? []) {
            userIds.add(row.from_user_id as string);
            userIds.add(row.to_user_id as string);
        }

        const settlementGroupIds = new Set<string>();
        for (const row of settlementsResult.data ?? []) {
            settlementGroupIds.add(row.group_id as string);
        }

        const [namesById, groupNamesById] = await Promise.all([
            fetchProfileNames([...userIds]),
            fetchGroupNames([...settlementGroupIds]),
        ]);

        const merged = mapToActivities(
            (expensesResult.data ?? []) as Record<string, unknown>[],
            (settlementsResult.data ?? []) as Record<string, unknown>[],
            namesById,
            groupNamesById,
            userId,
        );

        const hasMore =
            merged.length > limit ||
            (expensesResult.data?.length ?? 0) === fetchLimit ||
            (settlementsResult.data?.length ?? 0) === fetchLimit;
        const items = merged.slice(0, limit);
        const nextCursor =
            hasMore && items.length > 0
                ? items[items.length - 1].createdAt.toISOString()
                : undefined;

        return { items, nextCursor };
    } catch (error) {
        console.error('Failed to fetch activity:', error);
        return { items: [] };
    }
}
