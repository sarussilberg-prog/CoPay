/**
 * AddMembersSheet — centered modal for adding friends to a group.
 * Friends ∖ current group members. Multi-select; sequential addGroupMember calls.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Modal,
    Pressable,
    View,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    TextInput,
    Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { User } from '@cost-share/shared';
import { Text } from './AppText';
import { MemberSelector } from './MemberSelector';
import { AppIcon } from './AppIcon';
import { colors } from '../theme';
import { useFriendsQuery } from '../hooks/queries/useFriendsQueries';
import { addGroupMember } from '../services/groups.service';
import { shareGroupInvite } from '../services/invite.service';
import { getDisplayEmail, getDisplayName, isDeleted } from '../lib/userDisplay';

interface AddMembersSheetProps {
    visible: boolean;
    groupId?: string;
    currentMemberIds: string[];
    onClose: () => void;
    onAdded?: () => void;
    // When provided, the sheet operates in selection-only mode (no groupId required):
    // selected users are returned to the caller instead of being persisted via addGroupMember.
    onConfirmSelection?: (users: User[]) => void;
    /** Override "find friends" — required when rendered outside NavigationContainer. */
    onFindFriends?: () => void;
}

type AddMembersSheetViewProps = AddMembersSheetProps & {
    onFindFriends: () => void;
};

function AddMembersSheetView({
    visible,
    groupId,
    currentMemberIds,
    onClose,
    onAdded,
    onConfirmSelection,
    onFindFriends,
}: AddMembersSheetViewProps) {
    const { t } = useTranslation();
    const { data: friends, isLoading, refetch } = useFriendsQuery();
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [query, setQuery] = useState('');

    useEffect(() => {
        if (visible) {
            setSelectedIds([]);
            setQuery('');
            void refetch();
        }
    }, [visible, refetch]);

    const memberSet = useMemo(() => new Set(currentMemberIds), [currentMemberIds]);
    const eligible = useMemo<User[]>(
        () => (friends ?? []).filter(f => f.isActive !== false && !memberSet.has(f.id)),
        [friends, memberSet],
    );
    const filtered = useMemo<User[]>(() => {
        const q = query.trim().toLowerCase();
        if (!q) return eligible;
        return eligible.filter(u => {
            const name = getDisplayName(u, t).toLowerCase();
            const email = getDisplayEmail(u)?.toLowerCase() ?? '';
            return name.includes(q) || email.includes(q);
        });
    }, [eligible, query, t]);

    const toggle = useCallback((userId: string) => {
        setSelectedIds(prev =>
            prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId],
        );
    }, []);

    const handleAdd = useCallback(async () => {
        if (selectedIds.length === 0 || submitting) return;
        setSubmitting(true);
        try {
            if (onConfirmSelection) {
                const selectedUsers = (friends ?? []).filter(f => selectedIds.includes(f.id));
                onConfirmSelection(selectedUsers);
                onClose();
                return;
            }
            if (!groupId) return;
            for (const userId of selectedIds) {
                await addGroupMember(groupId, userId);
            }
            onAdded?.();
            onClose();
        } finally {
            setSubmitting(false);
        }
    }, [selectedIds, submitting, groupId, onAdded, onClose, onConfirmSelection, friends]);

    const handleFindFriends = useCallback(() => {
        onFindFriends();
    }, [onFindFriends]);

    const addDisabled = selectedIds.length === 0 || submitting;

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable onPress={onClose} className="flex-1 bg-black/40 justify-center px-4">
                <Pressable onPress={() => { }} className="bg-white rounded-2xl h-3/4">
                    <View className="px-4 pt-4 pb-2 flex-row items-center justify-between">
                        <Text className="text-base font-semibold text-gray-900">
                            {t('groups.members.addMembers')}
                        </Text>
                        <TouchableOpacity
                            onPress={onClose}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            accessibilityLabel={t('common.cancel')}
                        >
                            <AppIcon name="close" size={22} color={colors.gray500} />
                        </TouchableOpacity>
                    </View>

                    {eligible.length > 0 && (
                        <View className="px-4 pb-2">
                            <View className="flex-row items-center bg-white rounded-xl border border-slate-200/80 px-3 h-11">
                                <AppIcon name="search" size={18} color={colors.gray500} />
                                <TextInput
                                    value={query}
                                    onChangeText={setQuery}
                                    placeholder={t('groups.members.searchPlaceholder')}
                                    placeholderTextColor={colors.gray400}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    className="flex-1 ml-2 text-sm text-gray-900"
                                    testID="add-members-search"
                                />
                                {query.length > 0 && (
                                    <TouchableOpacity
                                        onPress={() => setQuery('')}
                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                        accessibilityLabel={t('common.cancel')}
                                    >
                                        <AppIcon name="close" size={18} color={colors.gray500} />
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                    )}

                    <ScrollView
                        className="flex-1 px-4"
                        contentContainerStyle={{ alignItems: 'center', paddingBottom: 8 }}
                    >
                        {isLoading ? (
                            <View className="py-8 items-center">
                                <ActivityIndicator color={colors.primary} />
                            </View>
                        ) : eligible.length === 0 ? (
                            <View className="py-6 items-center">
                                <Text className="text-sm text-gray-500 text-center mb-4">
                                    {friends && friends.length === 0
                                        ? t('friends.empty')
                                        : t('groups.members.allFriendsAdded')}
                                </Text>
                                <TouchableOpacity
                                    onPress={handleFindFriends}
                                    className="h-11 rounded-xl bg-primary px-5 items-center justify-center"
                                    testID="add-members-find-friends"
                                >
                                    <Text className="text-sm font-semibold text-white">
                                        {t('friends.find.title')}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        ) : filtered.length === 0 ? (
                            <View className="py-6 items-center">
                                <Text className="text-sm text-gray-500 text-center">
                                    {t('groups.members.noSearchResults')}
                                </Text>
                            </View>
                        ) : (
                            <View style={{ width: '85%' }}>
                                <MemberSelector
                                    members={filtered}
                                    selectedIds={selectedIds}
                                    onToggle={toggle}
                                />
                            </View>
                        )}

                        <View
                            style={{ width: '85%' }}
                            className="mt-4 rounded-xl bg-primary-extra-light border border-primary/30 px-3 py-2.5"
                        >
                            <View className="flex-row items-start">
                                <AppIcon name="information-circle" size={18} color={colors.primary} />
                                <View className="flex-1 ml-2">
                                    <Text className="text-sm text-primary-dark font-medium">
                                        {t('groups.members.mutualHint')}
                                    </Text>
                                    <TouchableOpacity
                                        onPress={handleFindFriends}
                                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                        testID="add-members-find-friends-link"
                                    >
                                        <Text className="text-sm font-semibold text-primary mt-1 underline">
                                            {t('groups.members.missingSomeoneCta')}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </ScrollView>

                    <View className="px-4 pb-4">
                        {groupId && (
                            <TouchableOpacity
                                onPress={() => { void shareGroupInvite(groupId); }}
                                className="flex-row items-center py-3 px-2"
                                testID="add-members-share-link"
                            >
                                <AppIcon name="share-outline" size={20} color={colors.primary} />
                                <Text className="flex-1 ml-3 text-sm font-medium text-gray-800">
                                    {t('invite.addMembers.sendLink')}
                                </Text>
                                <AppIcon name="chevron-forward" size={18} color={colors.gray400} />
                            </TouchableOpacity>
                        )}

                        {eligible.length > 0 && (
                            <View className="mt-2">
                                <TouchableOpacity
                                    onPress={handleAdd}
                                    disabled={addDisabled}
                                    style={{ opacity: addDisabled ? 0.4 : 1 }}
                                    className="h-12 rounded-xl bg-primary items-center justify-center flex-row"
                                    testID="add-members-confirm"
                                >
                                    {submitting && (
                                        <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />
                                    )}
                                    <Text
                                        className="text-base font-semibold text-white"
                                        style={Platform.select({
                                            ios: { transform: [{ translateY: 1.5 }] },
                                            android: {
                                                includeFontPadding: false,
                                                textAlignVertical: 'center',
                                            },
                                        })}
                                    >
                                        {selectedIds.length > 0
                                            ? `${t('common.confirm')} (${selectedIds.length})`
                                            : t('common.confirm')}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

function AddMembersSheetWithNavigation(
    props: Omit<AddMembersSheetProps, 'onFindFriends'>,
) {
    const navigation = useNavigation<any>();
    const onFindFriends = useCallback(() => {
        props.onClose();
        navigation.navigate('Profile', { screen: 'FindFriends' });
    }, [navigation, props.onClose]);

    return <AddMembersSheetView {...props} onFindFriends={onFindFriends} />;
}

export function AddMembersSheet(props: AddMembersSheetProps) {
    if (props.onFindFriends) {
        return <AddMembersSheetView {...props} onFindFriends={props.onFindFriends} />;
    }
    return <AddMembersSheetWithNavigation {...props} />;
}
