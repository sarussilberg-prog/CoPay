/**
 * Friends Service — Supabase direct.
 * Reads go through tables (RLS-restricted to caller's rows).
 * Writes go through SECURITY DEFINER RPCs.
 */

import { User, profileFromRow } from '@cost-share/shared';
import { supabase } from '../lib/supabase';
import { getCurrentUserId } from '../lib/auth';

export type FriendRequestStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

export interface FriendRequest {
    id: string;
    fromUserId: string;
    toUserId: string;
    status: FriendRequestStatus;
    createdAt: Date;
    respondedAt?: Date;
    profile?: User;
}

export type SearchRelationship =
    | 'self'
    | 'friends'
    | 'request_sent'
    | 'request_received'
    | 'none';

export interface SearchUserResult {
    user: User;
    relationship: SearchRelationship;
    requestId?: string;
}

function friendRequestFromRow(row: Record<string, unknown>, profile?: User): FriendRequest {
    return {
        id: row.id as string,
        fromUserId: row.from_user_id as string,
        toUserId: row.to_user_id as string,
        status: row.status as FriendRequestStatus,
        createdAt: new Date(row.created_at as string),
        respondedAt: row.responded_at ? new Date(row.responded_at as string) : undefined,
        profile,
    };
}

export async function fetchFriends(): Promise<User[]> {
    const me = await getCurrentUserId();
    if (!me) return [];

    const { data: pairs, error } = await supabase
        .from('friendships')
        .select('user_a_id, user_b_id');
    if (error) {
        console.error('fetchFriends failed:', error);
        return [];
    }

    const friendIds = (pairs ?? [])
        .map(p => ((p.user_a_id as string) === me ? (p.user_b_id as string) : (p.user_a_id as string)));
    const uniqueIds = Array.from(new Set(friendIds));
    if (uniqueIds.length === 0) return [];

    const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('*')
        .in('id', uniqueIds);
    if (pErr) {
        console.error('fetchFriends profile lookup failed:', pErr);
        return [];
    }
    return (profiles ?? [])
        .map(profileFromRow)
        .filter(u => u.isActive !== false)
        .sort((a, b) => {
            const aKey = a.isActive === false ? '' : (a.name?.trim() ?? '');
            const bKey = b.isActive === false ? '' : (b.name?.trim() ?? '');
            return aKey.localeCompare(bKey);
        });
}

async function fetchProfilesByIds(ids: string[]): Promise<Map<string, User>> {
    if (ids.length === 0) return new Map();
    const { data, error } = await supabase.from('profiles').select('*').in('id', ids);
    if (error) {
        console.error('fetchProfilesByIds failed:', error);
        return new Map();
    }
    const map = new Map<string, User>();
    (data ?? []).forEach(row => {
        const u = profileFromRow(row);
        map.set(u.id, u);
    });
    return map;
}

export async function fetchIncomingRequests(): Promise<FriendRequest[]> {
    const me = await getCurrentUserId();
    if (!me) return [];

    const { data, error } = await supabase
        .from('friend_requests')
        .select('*')
        .eq('to_user_id', me)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
    if (error) {
        console.error('fetchIncomingRequests failed:', error);
        return [];
    }
    const rows = data ?? [];
    const profileMap = await fetchProfilesByIds(rows.map(r => r.from_user_id as string));
    return rows
        .map(r => friendRequestFromRow(r, profileMap.get(r.from_user_id as string)))
        .filter(req => req.profile?.isActive !== false);
}

export async function fetchOutgoingRequests(): Promise<FriendRequest[]> {
    const me = await getCurrentUserId();
    if (!me) return [];

    const { data, error } = await supabase
        .from('friend_requests')
        .select('*')
        .eq('from_user_id', me)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
    if (error) {
        console.error('fetchOutgoingRequests failed:', error);
        return [];
    }
    const rows = data ?? [];
    const profileMap = await fetchProfilesByIds(rows.map(r => r.to_user_id as string));
    return rows
        .map(r => friendRequestFromRow(r, profileMap.get(r.to_user_id as string)))
        .filter(req => req.profile?.isActive !== false);
}

export async function searchUsers(query: string): Promise<SearchUserResult[]> {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];

    const { data, error } = await supabase.rpc('search_users', { p_query: trimmed });
    if (error) {
        console.error('searchUsers failed:', error);
        return [];
    }
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    return rows.map(row => ({
        user: {
            id: row.id as string,
            name: (row.name as string) ?? '',
            email: (row.email as string) ?? undefined,
            phone: (row.phone as string) ?? undefined,
            avatarUrl: (row.avatar_url as string) ?? undefined,
            defaultCurrency: 'ILS',
            language: 'en',
            createdAt: new Date(0),
            updatedAt: new Date(0),
        } as User,
        relationship: row.relationship as SearchRelationship,
        requestId: (row.request_id as string) ?? undefined,
    }));
}

export async function sendFriendRequest(toUserId: string): Promise<FriendRequest | null> {
    const { data, error } = await supabase.rpc('send_friend_request', { p_to_user_id: toUserId });
    if (error) {
        console.error('sendFriendRequest failed:', error);
        throw error;
    }
    if (!data) return null;
    return friendRequestFromRow(data as Record<string, unknown>);
}

export async function acceptFriendRequest(requestId: string): Promise<boolean> {
    const { error } = await supabase.rpc('accept_friend_request', { p_request_id: requestId });
    if (error) {
        console.error('acceptFriendRequest failed:', error);
        throw error;
    }
    return true;
}

export async function rejectFriendRequest(requestId: string): Promise<boolean> {
    const { error } = await supabase.rpc('reject_friend_request', { p_request_id: requestId });
    if (error) {
        console.error('rejectFriendRequest failed:', error);
        throw error;
    }
    return true;
}

export async function removeFriend(otherUserId: string): Promise<boolean> {
    const { error } = await supabase.rpc('remove_friend', { p_other_user_id: otherUserId });
    if (error) {
        console.error('removeFriend failed:', error);
        throw error;
    }
    return true;
}
