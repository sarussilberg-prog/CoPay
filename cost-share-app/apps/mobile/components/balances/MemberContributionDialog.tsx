/**
 * MemberContributionDialog — centered modal dialog showing a member's
 * gross contribution breakdown. Roughly 3/5 of the screen height,
 * dismissible by backdrop tap or hardware back. Content scrolls inside
 * when the breakdown is taller than the available area.
 */

import React from 'react';
import {
    Dimensions,
    Modal,
    Pressable,
    ScrollView,
    View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import {
    CurrencyAmount,
    GroupMemberLite,
    PaidByMatrixRow,
} from '@cost-share/shared';
import { Text } from '../AppText';
import { Button } from '../Button';
import { MemberContributionBreakdown } from './MemberContributionBreakdown';
import type { BalanceMode } from './BalanceModeToggle';

interface MemberContributionDialogProps {
    open: boolean;
    member: GroupMemberLite | null;
    allMembers: GroupMemberLite[];
    matrix: PaidByMatrixRow[];
    /** Per-currency totals for `member` shown at the top of the dialog. */
    selfTotals: CurrencyAmount[];
    mode: BalanceMode;
    currentUserId: string;
    onClose: () => void;
}

export function MemberContributionDialog({
    open,
    member,
    allMembers,
    matrix,
    selfTotals,
    mode,
    currentUserId,
    onClose,
}: MemberContributionDialogProps) {
    const { t } = useTranslation();
    const screenHeight = Dimensions.get('window').height;

    if (!member) return null;

    return (
        <Modal
            visible={open}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <Pressable
                onPress={onClose}
                className="flex-1 bg-black/40 items-center justify-center px-6"
                testID="contribution-dialog-backdrop"
            >
                <Pressable
                    onPress={() => {}}
                    className="w-full bg-white rounded-2xl"
                    style={{ maxHeight: screenHeight * 0.6 }}
                >
                    <View className="px-5 pt-5 pb-3 border-b border-gray-100">
                        <Text className="text-base font-semibold text-gray-900">
                            {t('balances.memberContributionTitle')}
                        </Text>
                    </View>
                    <ScrollView
                        contentContainerStyle={{ padding: 20 }}
                        showsVerticalScrollIndicator
                    >
                        <MemberContributionBreakdown
                            member={member}
                            allMembers={allMembers}
                            matrix={matrix}
                            selfTotals={selfTotals}
                            mode={mode}
                            currentUserId={currentUserId}
                        />
                    </ScrollView>
                    <View className="px-5 pb-5 pt-2">
                        <Button
                            title={t('common.close')}
                            onPress={onClose}
                            variant="outline"
                        />
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}
