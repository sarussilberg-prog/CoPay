/**
 * GroupMembersScreen
 * View and manage group members
 * Uses NativeWind styling only, full i18n support
 */

import { Text } from '../../components/AppText';
import React, { useEffect, useState, useCallback } from 'react';
import { View, FlatList } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRoute } from '@react-navigation/native';
import { GroupMember, User } from '@cost-share/shared';
import { useLoading } from '../../hooks/useLoading';
import { useGroupUsersQuery } from '../../hooks/queries/useGroupUsersQuery';
import {
    getGroupMembers,
    addGroupMember,
    removeGroupMember,
} from '../../services/groups.service';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { MemberAvatar } from '../../components/MemberAvatar';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { getAvatarUrl, getDisplayName } from '../../lib/userDisplay';

export function GroupMembersScreen() {
    const { t } = useTranslation();
    const route = useRoute<any>();
    const { groupId } = route.params;
    const { isLoading, startLoading, stopLoading } = useLoading();

    const [members, setMembers] = useState<GroupMember[]>([]);
    const [removeTarget, setRemoveTarget] = useState<string | null>(null);
    const { data: allUsers = [] } = useGroupUsersQuery(groupId);

    const loadData = useCallback(async () => {
        startLoading();
        const membersData = await getGroupMembers(groupId);
        setMembers(membersData.filter((m) => m.isActive));
        stopLoading();
    }, [groupId, startLoading, stopLoading]);

    useEffect(() => {
        void loadData();
    }, []);

    const getUserForMember = (member: GroupMember): User | undefined => {
        return allUsers.find((u) => u.id === member.userId);
    };

    const handleRemoveMember = useCallback(async () => {
        if (!removeTarget) return;
        await removeGroupMember(groupId, removeTarget);
        setRemoveTarget(null);
        await loadData();
    }, [removeTarget, groupId, loadData]);

    const renderMember = ({ item }: { item: GroupMember }) => {
        const user = getUserForMember(item);
        if (!user) return null;

        return (
            <View className="bg-white rounded-xl p-4 mb-2 flex-row items-center">
                <MemberAvatar name={getDisplayName(user, t)} avatarUrl={getAvatarUrl(user) ?? undefined} size="md" />
                <View className="flex-1 ml-3">
                    <Text className="text-base font-medium text-gray-900">
                        {getDisplayName(user, t)}
                    </Text>
                    {user.email && (
                        <Text className="text-xs text-gray-400 mt-0.5">
                            {user.email}
                        </Text>
                    )}
                </View>
                <Button
                    title={t('groups.removeMember')}
                    onPress={() => setRemoveTarget(item.userId)}
                    variant="danger"
                    fullWidth={false}
                    className="py-2 px-3"
                />
            </View>
        );
    };

    if (isLoading && members.length === 0) {
        return <LoadingIndicator />;
    }

    return (
        <View className="flex-1 bg-slate-50">
            <FlatList
                data={members}
                keyExtractor={(item) => item.id}
                renderItem={renderMember}
                contentContainerClassName="p-4"
                ListEmptyComponent={
                    <EmptyState
                        iconName="person-outline"
                        title={t('groups.noMembers')}
                    />
                }
            />

            {/* Remove Confirmation Dialog */}
            <ConfirmDialog
                visible={removeTarget !== null}
                title={t('groups.removeMember')}
                message={t('groups.removeMemberConfirm')}
                confirmText={t('common.delete')}
                cancelText={t('common.cancel')}
                onConfirm={handleRemoveMember}
                onCancel={() => setRemoveTarget(null)}
                destructive
            />
        </View>
    );
}
