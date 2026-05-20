/**
 * Settlements Service — Supabase direct
 */

import {
    Settlement,
    CreateSettlementDto,
    UpdateSettlementDto,
    PairwiseDebt,
} from '@cost-share/shared';
import { settlementFromRow } from '@cost-share/shared';
import { supabase } from '../lib/supabase';
import { getCurrentUserId } from '../lib/auth';
import Toast from 'react-native-toast-message';
import i18n from '../i18n';

export async function fetchSettlements(groupId?: string): Promise<Settlement[]> {
    try {
        let query = supabase
            .from('settlements')
            .select('*')
            .is('deleted_at', null)
            .order('settlement_date', { ascending: false });
        if (groupId) {
            query = query.eq('group_id', groupId);
        }
        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []).map(settlementFromRow);
    } catch (error) {
        console.error('Failed to fetch settlements:', error);
        Toast.show({
            type: 'error',
            text1: 'Failed to load settlements',
            text2: i18n.t('common.networkError'),
        });
        return [];
    }
}

export async function getSettlementById(id: string): Promise<Settlement | null> {
    const { data, error } = await supabase
        .from('settlements')
        .select('*')
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle();
    if (error || !data) return null;
    return settlementFromRow(data);
}

export async function createSettlement(dto: CreateSettlementDto): Promise<Settlement | null> {
    const createdBy = await getCurrentUserId();
    if (!createdBy) return null;

    if (!Number.isFinite(dto.amount) || dto.amount <= 0) {
        Toast.show({
            type: 'error',
            text1: 'Failed to record payment',
            text2: i18n.t('expenses.invalidAmount'),
        });
        return null;
    }

    const settlementDate = (dto.settlementDate ?? new Date()).toISOString().slice(0, 10);

    try {
        const { data, error } = await supabase
            .from('settlements')
            .insert({
                group_id: dto.groupId,
                from_user_id: dto.fromUserId,
                to_user_id: dto.toUserId,
                amount: dto.amount,
                currency: dto.currency,
                settlement_date: settlementDate,
                payment_method: dto.paymentMethod,
                created_by: createdBy,
            })
            .select()
            .single();
        if (error) throw error;

        Toast.show({
            type: 'success',
            text1: i18n.t('common.success'),
            text2: i18n.t('settleUp.toastRecorded'),
        });
        return settlementFromRow(data);
    } catch (error) {
        console.error('Failed to create settlement:', error);
        Toast.show({
            type: 'error',
            text1: 'Failed to record payment',
            text2: i18n.t('common.networkError'),
        });
        return null;
    }
}

export async function updateSettlement(
    id: string,
    dto: UpdateSettlementDto,
): Promise<Settlement | null> {
    if (dto.amount !== undefined && (!Number.isFinite(dto.amount) || dto.amount <= 0)) {
        Toast.show({
            type: 'error',
            text1: 'Failed to update payment',
            text2: i18n.t('expenses.invalidAmount'),
        });
        return null;
    }

    const patch: Record<string, unknown> = {};
    if (dto.fromUserId !== undefined) patch.from_user_id = dto.fromUserId;
    if (dto.toUserId !== undefined) patch.to_user_id = dto.toUserId;
    if (dto.amount !== undefined) patch.amount = dto.amount;
    if (dto.currency !== undefined) patch.currency = dto.currency;

    try {
        const { data, error } = await supabase
            .from('settlements')
            .update(patch)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        Toast.show({
            type: 'success',
            text1: i18n.t('common.success'),
            text2: i18n.t('settleUp.toastUpdated'),
        });
        return settlementFromRow(data);
    } catch (error) {
        console.error('Failed to update settlement:', error);
        Toast.show({
            type: 'error',
            text1: 'Failed to update payment',
            text2: i18n.t('common.networkError'),
        });
        return null;
    }
}

export async function deleteSettlement(id: string): Promise<boolean> {
    try {
        const { error } = await supabase
            .from('settlements')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id);
        if (error) throw error;
        Toast.show({
            type: 'success',
            text1: i18n.t('common.success'),
            text2: i18n.t('settleUp.toastDeleted'),
        });
        return true;
    } catch (error) {
        console.error('Failed to delete settlement:', error);
        Toast.show({
            type: 'error',
            text1: 'Failed to delete payment',
            text2: i18n.t('common.networkError'),
        });
        return false;
    }
}

export async function fetchGroupPairwiseDebts(groupId: string): Promise<PairwiseDebt[]> {
    try {
        const { data, error } = await supabase.rpc('get_group_pairwise_debts', {
            p_group_id: groupId,
        });
        if (error) throw error;
        return (data ?? []).map((row: Record<string, unknown>) => ({
            fromUserId: row.from_user_id as string,
            toUserId: row.to_user_id as string,
            currency: row.currency as string,
            amount: Number(row.amount),
        }));
    } catch (error) {
        console.error('Failed to fetch pairwise debts:', error);
        return [];
    }
}

export async function getUserSettlements(userId: string): Promise<Settlement[]> {
    const { data, error } = await supabase
        .from('settlements')
        .select('*')
        .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
        .is('deleted_at', null)
        .order('settlement_date', { ascending: false });
    if (error) {
        console.error('Failed to fetch user settlements:', error);
        return [];
    }
    return (data ?? []).map(settlementFromRow);
}

export async function getSettlementHistory(
    groupId: string,
    userId1: string,
    userId2: string,
): Promise<Settlement[]> {
    const { data, error } = await supabase
        .from('settlements')
        .select('*')
        .eq('group_id', groupId)
        .is('deleted_at', null)
        .or(
            `and(from_user_id.eq.${userId1},to_user_id.eq.${userId2}),and(from_user_id.eq.${userId2},to_user_id.eq.${userId1})`,
        )
        .order('settlement_date', { ascending: false });
    if (error) {
        console.error('Failed to fetch settlement history:', error);
        return [];
    }
    return (data ?? []).map(settlementFromRow);
}
