/**
 * Users Service — Supabase direct (profiles table)
 */

import { User, UpdateProfileDto } from '@cost-share/shared';
import { profileFromRow } from '@cost-share/shared';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store';

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

export async function getUserById(id: string): Promise<User | null> {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .maybeSingle();
    if (error || !data) return null;
    return profileFromRow(data);
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
    }
    return user;
}
