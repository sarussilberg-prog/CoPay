/**
 * Users Service — Supabase direct (profiles table)
 */

import { User, UpdateProfileDto, BalanceSummaryResponse } from '@cost-share/shared';
import { profileFromRow } from '@cost-share/shared';
import { supabase } from '../lib/supabase';
import { getCurrentUserId } from '../lib/auth';
import { clearLocalAuthSession } from './auth.service';
import { queryClient } from '../lib/queryClient';
import { queryKeys } from '../hooks/queries/keys';
import { useAppStore } from '../store';

export type ProfileHydrationResult = 'active' | 'deactivated' | 'unknown';

/**
 * Load profiles.default_currency (and other fields) after auth.
 * - 'active'     : profile loaded into the store.
 * - 'deactivated': server reported is_active=false; local session has been cleared.
 * - 'unknown'    : fetch errored (e.g. offline) or row not yet present. Caller must NOT
 *                  treat as deactivated — leave the session intact and try again later.
 */
export async function hydrateCurrentUserProfile(userId: string): Promise<ProfileHydrationResult> {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

    if (error || !data) return 'unknown';

    const profile = profileFromRow(data);
    if (profile.isActive === false) {
        await clearLocalAuthSession();
        return 'deactivated';
    }

    // Resolve the caller's admin status via the SECURITY DEFINER RPC.
    // app_admins is RLS-locked; this RPC is the only client-facing read path.
    const { data: isAdminFlag } = await supabase.rpc('is_app_admin');
    const user = { ...profile, isAdmin: isAdminFlag === true };

    useAppStore.getState().setCurrentUser(user);
    return 'active';
}

export async function fetchUsers(): Promise<User[]> {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: true });
    if (error) {
        console.error('Failed to fetch users:', error);
        return [];
    }
    return (data ?? []).map(profileFromRow);
}

/** Fetch profiles for active members of a specific group only. */
export async function fetchGroupUsers(groupId: string): Promise<User[]> {
    const { data: members, error: membersError } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId)
        .eq('is_active', true);
    if (membersError) {
        console.error('Failed to fetch group member ids:', membersError);
        return [];
    }

    const userIds = (members ?? []).map((row) => row.user_id as string);
    if (userIds.length === 0) return [];

    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .in('id', userIds)
        .order('created_at', { ascending: true });
    if (error) {
        console.error('Failed to fetch group users:', error);
        return [];
    }
    return (data ?? []).map(profileFromRow);
}

const EMPTY_SUMMARY: BalanceSummaryResponse = { summary: [], byGroup: [] };

export async function fetchBalanceSummary(): Promise<BalanceSummaryResponse> {
    const userId = await getCurrentUserId();
    if (!userId) {
        useAppStore.getState().setBalanceSummary(EMPTY_SUMMARY);
        return EMPTY_SUMMARY;
    }
    const { data, error } = await supabase.rpc('get_user_balance_summary', {
        p_user_id: userId,
    });
    if (error) {
        console.error('fetchBalanceSummary failed:', error);
        useAppStore.getState().setBalanceSummary(EMPTY_SUMMARY);
        return EMPTY_SUMMARY;
    }
    const payload = (data as BalanceSummaryResponse | null) ?? EMPTY_SUMMARY;
    useAppStore.getState().setBalanceSummary(payload);
    return payload;
}

export async function updateUser(id: string, dto: UpdateProfileDto): Promise<User | null> {
    const patch: Record<string, unknown> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.email !== undefined) patch.email = dto.email;
    if (dto.phone !== undefined) patch.phone = dto.phone;
    if (dto.avatarUrl !== undefined) patch.avatar_url = dto.avatarUrl;
    if (dto.defaultCurrency !== undefined) patch.default_currency = dto.defaultCurrency;
    if (dto.language !== undefined) patch.language = dto.language;

    const { data, error } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', id)
        .select()
        .maybeSingle();

    if (error || !data) return null;

    const user = profileFromRow(data);
    const currentUser = useAppStore.getState().currentUser;
    if (currentUser && currentUser.id === id) {
        useAppStore.getState().setCurrentUser(user);
        void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
        void queryClient.invalidateQueries({ queryKey: ['exchangeRates'] });
    }
    return user;
}
