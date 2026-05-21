/**
 * Groups Service — Supabase direct (no NestJS API)
 */

import {
    Group,
    GroupMember,
    GroupMemberLite,
    GroupWithMembers,
    UserBalance,
    SimplifiedDebtsResult,
    GroupSummary,
    CreateGroupDto,
    UpdateGroupDto,
    DEFAULT_CURRENCY,
} from '@cost-share/shared';
import type {
    MemberContributionsResult,
    UserBalanceByCurrency,
} from '@cost-share/shared';
import {
    groupFromRow,
    groupWithMembersFromRow,
    groupMemberFromRow,
    calculateMemberContributions,
    calculateUserBalancesByCurrencyFromData,
    simplifyDebts,
    UnbalancedLedgerError,
} from '@cost-share/shared';
import { supabase } from '../lib/supabase';
import { getCurrentUserId } from '../lib/auth';
import { useAppStore } from '../store';
import Toast from 'react-native-toast-message';
import i18n from '../i18n';

async function loadBalanceData(groupId: string, userId?: string) {
    const [groupRes, membersRes, expensesRes, settlementsRes] = await Promise.all([
        supabase.from('groups').select('default_currency').eq('id', groupId).maybeSingle(),
        supabase.from('group_members').select('user_id').eq('group_id', groupId).eq('is_active', true),
        supabase.from('expenses').select('id, paid_by, amount, currency').eq('group_id', groupId).eq('is_deleted', false),
        supabase
            .from('settlements')
            .select('from_user_id, to_user_id, amount, currency')
            .eq('group_id', groupId)
            .is('deleted_at', null),
    ]);

    if (groupRes.error) throw groupRes.error;
    if (membersRes.error) throw membersRes.error;
    if (expensesRes.error) throw expensesRes.error;
    if (settlementsRes.error) throw settlementsRes.error;

    const defaultCurrency = (groupRes.data?.default_currency as string) ?? DEFAULT_CURRENCY;
    const expenses = (expensesRes.data ?? []).map(e => ({
        id: e.id as string,
        paidBy: e.paid_by as string,
        amount: Number(e.amount),
        currency: (e.currency as string) ?? defaultCurrency,
    }));

    const expenseIds = expenses.map(e => e.id);
    let splits: { expenseId: string; userId: string; amount: number }[] = [];
    if (expenseIds.length > 0) {
        const { data: splitsData, error: splitsErr } = await supabase
            .from('expense_splits')
            .select('expense_id, user_id, amount')
            .in('expense_id', expenseIds);
        if (splitsErr) throw splitsErr;
        splits = (splitsData ?? []).map(s => ({
            expenseId: s.expense_id as string,
            userId: s.user_id as string,
            amount: Number(s.amount),
        }));
    }

    const settlements = (settlementsRes.data ?? []).map(s => ({
        fromUserId: s.from_user_id as string,
        toUserId: s.to_user_id as string,
        amount: Number(s.amount),
        currency: (s.currency as string) ?? defaultCurrency,
    }));

    const userIds = userId
        ? [userId]
        : Array.from(new Set((membersRes.data ?? []).map(m => m.user_id as string)));

    return { defaultCurrency, expenses, splits, settlements, userIds };
}

export async function fetchGroups(): Promise<GroupWithMembers[]> {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    try {
        const { data: memberships, error: memberErr } = await supabase
            .from('group_members')
            .select('group_id')
            .eq('user_id', userId)
            .eq('is_active', true);
        if (memberErr) throw memberErr;

        const groupIds = (memberships ?? []).map(m => m.group_id as string);
        if (groupIds.length === 0) {
            useAppStore.getState().setGroups([]);
            return [];
        }

        const [groupsRes, archiveRes] = await Promise.all([
            supabase
                .from('groups')
                .select(
                    '*, group_members!inner(user_id, is_active, profiles(id, name, avatar_url))',
                )
                .in('id', groupIds)
                .eq('is_active', true)
                .eq('group_members.is_active', true)
                .order('created_at', { ascending: false }),
            supabase.rpc('get_user_groups_archive_state'),
        ]);
        if (groupsRes.error) throw groupsRes.error;
        if (archiveRes.error) throw archiveRes.error;

        const archiveByGroup = new Map<string, { mine: boolean; auto: boolean }>();
        for (const row of archiveRes.data ?? []) {
            archiveByGroup.set(row.group_id as string, {
                mine: Boolean(row.is_archived_by_me),
                auto: Boolean(row.is_auto_archived),
            });
        }

        const groups = (groupsRes.data ?? []).map(row => {
            const base = groupWithMembersFromRow(row);
            const state = archiveByGroup.get(base.id);
            return {
                ...base,
                isArchivedByMe: state?.mine ?? false,
                isAutoArchived: state?.auto ?? false,
            };
        });
        useAppStore.getState().setGroups(groups);
        return groups;
    } catch (error) {
        console.error('Failed to fetch groups:', error);
        throw error;
    }
}

export type ArchiveGroupError = 'has_balance' | 'not_a_member' | 'unknown';

export async function archiveGroup(groupId: string): Promise<ArchiveGroupError | null> {
    const { error } = await supabase.rpc('archive_group', { p_group_id: groupId });
    if (error) {
        const code: ArchiveGroupError = error.message?.includes('has_balance')
            ? 'has_balance'
            : error.message?.includes('not_a_member')
                ? 'not_a_member'
                : 'unknown';
        Toast.show({
            type: 'error',
            text1: i18n.t(
                code === 'has_balance'
                    ? 'groups.archive.errorHasBalance'
                    : 'groups.archive.errorGeneric',
            ),
        });
        return code;
    }

    const existing = useAppStore.getState().groups.find(g => g.id === groupId);
    if (existing) {
        useAppStore.getState().updateGroup({ ...existing, isArchivedByMe: true });
    }
    Toast.show({ type: 'success', text1: i18n.t('groups.archive.archivedToast') });
    return null;
}

export async function unarchiveGroup(groupId: string): Promise<boolean> {
    const { error } = await supabase.rpc('unarchive_group', { p_group_id: groupId });
    if (error) {
        Toast.show({
            type: 'error',
            text1: i18n.t('groups.archive.errorGeneric'),
            text2: i18n.t('common.networkError'),
        });
        return false;
    }

    const existing = useAppStore.getState().groups.find(g => g.id === groupId);
    if (existing) {
        useAppStore.getState().updateGroup({ ...existing, isArchivedByMe: false });
    }
    Toast.show({ type: 'success', text1: i18n.t('groups.archive.unarchivedToast') });
    return true;
}

export async function getGroupById(id: string): Promise<Group | null> {
    const { data, error } = await supabase
        .from('groups')
        .select('*')
        .eq('id', id)
        .eq('is_active', true)
        .maybeSingle();
    if (error || !data) return null;
    return groupFromRow(data);
}

export async function createGroup(dto: CreateGroupDto): Promise<Group | null> {
    const createdBy = await getCurrentUserId();
    if (!createdBy) return null;

    try {
        const { data: groupRow, error: groupErr } = await supabase
            .from('groups')
            .insert({
                name: dto.name,
                description: dto.description,
                image_url: dto.imageUrl,
                group_type: dto.groupType ?? 'general',
                default_currency: dto.defaultCurrency ?? DEFAULT_CURRENCY,
                created_by: createdBy,
            })
            .select()
            .single();
        if (groupErr) throw groupErr;

        const memberIds = new Set<string>([createdBy, ...dto.memberIds]);
        const rows = Array.from(memberIds).map(userId => ({
            group_id: groupRow.id,
            user_id: userId,
        }));
        const { error: membersErr } = await supabase.from('group_members').insert(rows);
        if (membersErr) throw membersErr;

        const base = groupFromRow(groupRow);
        const group: GroupWithMembers = {
            ...base,
            members: [],
            isArchivedByMe: false,
            isAutoArchived: false,
        };
        useAppStore.getState().addGroup(group);
        Toast.show({
            type: 'success',
            text1: i18n.t('common.success'),
            text2: i18n.t('groups.createGroup'),
        });
        return group;
    } catch (error) {
        console.error('Failed to create group:', error);
        Toast.show({
            type: 'error',
            text1: i18n.t('groups.createError'),
            text2: i18n.t('common.networkError'),
        });
        return null;
    }
}

export async function updateGroup(id: string, dto: UpdateGroupDto): Promise<Group | null> {
    const patch: Record<string, unknown> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.note !== undefined) patch.note = dto.note;
    if (dto.imageUrl !== undefined) patch.image_url = dto.imageUrl;
    if (dto.groupType !== undefined) patch.group_type = dto.groupType;
    if (dto.defaultCurrency !== undefined) patch.default_currency = dto.defaultCurrency;

    const { data, error } = await supabase
        .from('groups')
        .update(patch)
        .eq('id', id)
        .eq('is_active', true)
        .select()
        .maybeSingle();

    if (error || !data) {
        console.error('Failed to update group:', error?.message ?? 'no rows updated');
        Toast.show({
            type: 'error',
            text1: i18n.t('groups.updateError'),
            text2: error?.message ?? i18n.t('common.networkError'),
        });
        return null;
    }

    const base = groupFromRow(data);
    const existing = useAppStore.getState().groups.find(g => g.id === id);
    const group: GroupWithMembers = {
        ...base,
        members: existing?.members ?? [],
        isArchivedByMe: existing?.isArchivedByMe ?? false,
        isAutoArchived: existing?.isAutoArchived ?? false,
    };
    useAppStore.getState().updateGroup(group);
    Toast.show({ type: 'success', text1: i18n.t('common.success'), text2: 'Group updated' });
    return group;
}

export async function deleteGroup(id: string): Promise<boolean> {
    const { data, error } = await supabase
        .from('groups')
        .update({ is_active: false })
        .eq('id', id)
        .select('id')
        .maybeSingle();

    if (error || !data) {
        Toast.show({
            type: 'error',
            text1: 'Failed to delete group',
            text2: i18n.t('common.networkError'),
        });
        return false;
    }

    useAppStore.getState().removeGroup(id);
    Toast.show({ type: 'success', text1: 'Group deleted' });
    return true;
}

export async function getGroupMembers(groupId: string): Promise<GroupMember[]> {
    const { data, error } = await supabase
        .from('group_members')
        .select('*')
        .eq('group_id', groupId)
        .eq('is_active', true);
    if (error) {
        console.error('Failed to fetch group members:', error);
        return [];
    }
    return (data ?? []).map(groupMemberFromRow);
}

/** Resolve display names and avatars for feed participants (incl. former members). */
export async function fetchProfilesByUserIds(
    userIds: string[],
): Promise<Record<string, GroupMemberLite>> {
    const unique = [...new Set(userIds.filter(Boolean))];
    if (unique.length === 0) return {};

    const { data, error } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .in('id', unique);

    if (error) {
        console.error('Failed to fetch profiles:', error);
        return {};
    }

    const map: Record<string, GroupMemberLite> = {};
    (data ?? []).forEach(p => {
        const id = p.id as string;
        map[id] = {
            userId: id,
            displayName: (p.name as string) ?? '',
            avatarUrl: (p.avatar_url as string | undefined) ?? undefined,
        };
    });
    return map;
}

export async function addGroupMember(groupId: string, userId: string): Promise<GroupMember | null> {
    const { data, error } = await supabase
        .from('group_members')
        .insert({ group_id: groupId, user_id: userId })
        .select()
        .single();

    if (error || !data) {
        Toast.show({
            type: 'error',
            text1: 'Failed to add member',
            text2: i18n.t('common.networkError'),
        });
        return null;
    }

    Toast.show({ type: 'success', text1: 'Member added' });
    return groupMemberFromRow(data);
}

export async function removeGroupMember(groupId: string, userId: string): Promise<boolean> {
    const { data, error } = await supabase
        .from('group_members')
        .update({ is_active: false, left_at: new Date().toISOString() })
        .eq('group_id', groupId)
        .eq('user_id', userId)
        .eq('is_active', true)
        .select('id')
        .maybeSingle();

    if (error || !data) {
        Toast.show({
            type: 'error',
            text1: 'Failed to remove member',
            text2: i18n.t('common.networkError'),
        });
        return false;
    }

    Toast.show({ type: 'success', text1: 'Member removed' });
    return true;
}

export async function getGroupContributions(
    groupId: string,
): Promise<MemberContributionsResult> {
    try {
        const { expenses, splits, userIds } = await loadBalanceData(groupId);
        return calculateMemberContributions({ userIds, expenses, splits });
    } catch (error) {
        console.error('Failed to fetch member contributions:', error);
        return { totals: [], matrix: [] };
    }
}

export async function getGroupBalancesByCurrency(
    groupId: string,
): Promise<UserBalanceByCurrency[]> {
    try {
        const { expenses, splits, settlements, userIds } = await loadBalanceData(groupId);
        return calculateUserBalancesByCurrencyFromData({
            groupId,
            userIds,
            expenses,
            splits,
            settlements,
        });
    } catch (error) {
        console.error('Failed to fetch per-currency balances:', error);
        return [];
    }
}

export interface SimplifiedDebtsByCurrencyEntry {
    currency: string;
    result: SimplifiedDebtsResult;
}

export async function getGroupSimplifiedDebtsByCurrency(
    groupId: string,
): Promise<SimplifiedDebtsByCurrencyEntry[]> {
    try {
        const balancesByCurrency = await getGroupBalancesByCurrency(groupId);
        if (balancesByCurrency.length === 0) return [];

        const userIds = Array.from(new Set(balancesByCurrency.map(b => b.userId)));
        const nameById = new Map<string, string>();
        if (userIds.length > 0) {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, name')
                .in('id', userIds);
            if (error) throw error;
            (data ?? []).forEach(p => nameById.set(p.id as string, p.name as string));
        }

        // Pivot: currency -> [{ userId, currency, netBalance, ... }]
        const byCurrency = new Map<string, UserBalance[]>();
        for (const entry of balancesByCurrency) {
            for (const row of entry.byCurrency) {
                const bucket = byCurrency.get(row.currency) ?? [];
                bucket.push({
                    groupId,
                    userId: entry.userId,
                    currency: row.currency,
                    totalPaid: row.totalPaid,
                    totalOwed: row.totalOwed,
                    totalSettledPaid: row.totalSettledPaid,
                    totalSettledReceived: row.totalSettledReceived,
                    netBalance: row.netBalance,
                });
                byCurrency.set(row.currency, bucket);
            }
        }

        const out: SimplifiedDebtsByCurrencyEntry[] = [];
        for (const [currency, balances] of byCurrency) {
            try {
                out.push({ currency, result: simplifyDebts(balances, nameById) });
            } catch (err) {
                if (err instanceof UnbalancedLedgerError) {
                    console.warn(
                        `Skipping simplification for ${currency}: ${err.message}`,
                    );
                    continue;
                }
                throw err;
            }
        }
        // Sort currencies alphabetically for stable rendering.
        out.sort((a, b) => a.currency.localeCompare(b.currency));
        return out;
    } catch (error) {
        console.error('Failed to fetch simplified debts by currency:', error);
        return [];
    }
}

export async function getGroupSummary(groupId: string): Promise<GroupSummary | null> {
    const { data: group, error: groupErr } = await supabase
        .from('groups')
        .select('*')
        .eq('id', groupId)
        .eq('is_active', true)
        .maybeSingle();
    if (groupErr || !group) return null;

    const [{ count: memberCount, error: mErr }, expensesRes] = await Promise.all([
        supabase
            .from('group_members')
            .select('id', { count: 'exact', head: true })
            .eq('group_id', groupId)
            .eq('is_active', true),
        supabase
            .from('expenses')
            .select('amount, expense_date')
            .eq('group_id', groupId)
            .eq('is_deleted', false),
    ]);
    if (mErr || expensesRes.error) return null;

    const expenses = expensesRes.data ?? [];
    const totalSpent = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const lastExpenseDate =
        expenses.length > 0
            ? new Date(
                  Math.max(...expenses.map(e => new Date(e.expense_date as string).getTime())),
              )
            : undefined;

    return {
        groupId: group.id as string,
        name: group.name as string,
        groupType: group.group_type as GroupSummary['groupType'],
        defaultCurrency: group.default_currency as string,
        memberCount: memberCount ?? 0,
        expenseCount: expenses.length,
        totalSpent: Number(totalSpent.toFixed(2)),
        lastExpenseDate,
        createdAt: new Date(group.created_at as string),
        updatedAt: new Date(group.updated_at as string),
    };
}
