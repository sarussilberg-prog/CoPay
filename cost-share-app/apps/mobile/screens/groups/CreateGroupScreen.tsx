/**
 * CreateGroupScreen
 * Unified form used for both creating a new group and editing an existing one.
 * When the route provides a `groupId`, the screen runs in edit mode (loads data,
 * persists member add/remove in-place); otherwise it runs in create mode (members
 * are selected up-front and saved together with the new group).
 * Uses NativeWind styling only, full i18n support
 */

import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { View, ScrollView, TouchableOpacity, Modal, Pressable, Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
import { GroupType, DEFAULT_CURRENCY, User } from '@cost-share/shared';
import { useLoading } from '../../hooks/useLoading';
import { useAppStore } from '../../store';
import {
    createGroup,
    getGroupById,
    removeGroupMember,
    updateGroup,
} from '../../services/groups.service';
import { fetchGroupPairwiseDebts } from '../../services/settlements.service';
import { fetchGroupUsers } from '../../services/users.service';
import { uploadGroupImage } from '../../services/storage.service';
import { getCurrentUserId } from '../../lib/auth';
import { GroupImagePicker } from '../../components/GroupImagePicker';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { CurrencyPicker } from '../../components/CurrencyPicker';
import { GroupTypeSelector } from '../../components/GroupTypeSelector';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { MemberAvatar } from '../../components/MemberAvatar';
import { AddMembersSheet } from '../../components/AddMembersSheet';
import { AppIcon } from '../../components/AppIcon';
import { Text } from '../../components/AppText';
import { colors } from '../../theme';

export function CreateGroupScreen() {
    const { t } = useTranslation();
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const groupId: string | undefined = route.params?.groupId;
    const initialMembers: User[] | undefined = route.params?.initialMembers;
    const isEdit = Boolean(groupId);
    const { isLoading, startLoading, stopLoading } = useLoading();
    const currentUser = useAppStore((state) => state.currentUser);

    const [name, setName] = useState('');
    const [groupType, setGroupType] = useState<GroupType>('general');
    const [currency, setCurrency] = useState(currentUser?.defaultCurrency || DEFAULT_CURRENCY);
    const [nameError, setNameError] = useState('');
    const [imageUrl, setImageUrl] = useState<string | undefined>();
    const [localImageUri, setLocalImageUri] = useState<string | null>(null);
    const [imageRemoved, setImageRemoved] = useState(false);
    const [members, setMembers] = useState<User[]>(
        !isEdit && initialMembers ? initialMembers : [],
    );
    const [addMembersOpen, setAddMembersOpen] = useState(false);
    const [removeTarget, setRemoveTarget] = useState<User | null>(null);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [unsettledMemberIds, setUnsettledMemberIds] = useState<Set<string>>(new Set());
    const [initialLoading, setInitialLoading] = useState(isEdit);

    useEffect(() => {
        void getCurrentUserId().then(setCurrentUserId);
    }, []);

    const loadMembers = useCallback(async () => {
        if (!groupId) return;
        const [users, debts] = await Promise.all([
            fetchGroupUsers(groupId),
            fetchGroupPairwiseDebts(groupId),
        ]);
        setMembers(users);
        const unsettled = new Set<string>();
        debts.forEach(d => {
            unsettled.add(d.fromUserId);
            unsettled.add(d.toUserId);
        });
        setUnsettledMemberIds(unsettled);
    }, [groupId]);

    useEffect(() => {
        if (!isEdit || !groupId) return;
        const loadGroup = async () => {
            const group = await getGroupById(groupId);
            if (group) {
                setName(group.name);
                setGroupType(group.groupType);
                setCurrency(group.defaultCurrency);
                setImageUrl(group.imageUrl);
            }
            await loadMembers();
            setInitialLoading(false);
        };
        void loadGroup();
    }, [isEdit, groupId, loadMembers]);

    useLayoutEffect(() => {
        if (isEdit) navigation.setOptions({ title: name });
    }, [navigation, name, isEdit]);

    const openRemoveDialog = useCallback(
        (m: User) => {
            if (!groupId) {
                setMembers(prev => prev.filter(x => x.id !== m.id));
                return;
            }
            if (unsettledMemberIds.has(m.id)) {
                setRemoveTarget(m);
                return;
            }
            Alert.alert(t('groups.removeMemberConfirm'), undefined, [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('groups.removeMember'),
                    style: 'destructive',
                    onPress: () => {
                        void (async () => {
                            const ok = await removeGroupMember(groupId, m.id);
                            if (ok) await loadMembers();
                        })();
                    },
                },
            ]);
        },
        [groupId, unsettledMemberIds, t, loadMembers],
    );

    const handleMembersSelected = useCallback((users: User[]) => {
        setMembers(prev => {
            const existing = new Set(prev.map(m => m.id));
            const next = [...prev];
            users.forEach(u => {
                if (!existing.has(u.id)) next.push(u);
            });
            return next;
        });
    }, []);

    const validateForm = (): boolean => {
        if (!name.trim()) {
            setNameError(t('groups.nameRequired'));
            return false;
        }
        setNameError('');
        return true;
    };

    const handleCreate = async () => {
        startLoading();
        try {
            const result = await createGroup({
                name: name.trim(),
                groupType,
                defaultCurrency: currency,
                memberIds: members.map(m => m.id),
            });

            if (!result) return;

            if (localImageUri) {
                const uploadedUrl = await uploadGroupImage(result.id, localImageUri);
                if (!uploadedUrl) {
                    Toast.show({
                        type: 'error',
                        text1: t('common.error'),
                        text2: t('groups.imageUploadError'),
                    });
                } else {
                    await updateGroup(result.id, { imageUrl: uploadedUrl });
                }
            }

            navigation.replace('GroupDetail', { groupId: result.id });
        } finally {
            stopLoading();
        }
    };

    const handleUpdate = async () => {
        if (!groupId) return;
        startLoading();
        try {
            let nextImageUrl: string | undefined = imageRemoved ? undefined : imageUrl;

            if (localImageUri) {
                const uploadedUrl = await uploadGroupImage(groupId, localImageUri);
                if (!uploadedUrl) {
                    Toast.show({
                        type: 'error',
                        text1: t('common.error'),
                        text2: t('groups.imageUploadError'),
                    });
                    return;
                }
                nextImageUrl = uploadedUrl;
            }

            if (localImageUri || imageRemoved) {
                const imageResult = await updateGroup(groupId, {
                    imageUrl: imageRemoved ? '' : nextImageUrl,
                });
                if (!imageResult) return;
            }

            const result = await updateGroup(groupId, {
                name: name.trim(),
                groupType,
                defaultCurrency: currency,
            });

            if (result) {
                navigation.goBack();
            }
        } finally {
            stopLoading();
        }
    };

    const handleSubmit = () => {
        if (!validateForm()) return;
        if (isEdit) {
            void handleUpdate();
        } else {
            void handleCreate();
        }
    };

    const handleImageChange = (uri: string | null) => {
        setLocalImageUri(uri);
        if (uri === null) {
            setImageRemoved(true);
        } else {
            setImageRemoved(false);
        }
    };

    if (initialLoading) {
        return <LoadingIndicator />;
    }

    // In create mode the current user is implicit (not in `members` until
    // createGroup adds them), so we prepend them in the avatar row.
    const displayMembers: User[] = isEdit
        ? members
        : currentUser
            ? [currentUser, ...members]
            : members;

    // IDs already represented in the picker, used to filter the sheet's options.
    const memberIdsForSheet = isEdit
        ? members.map(m => m.id)
        : [
              ...(currentUser ? [currentUser.id] : []),
              ...members.map(m => m.id),
          ];

    return (
        <ScrollView className="flex-1 bg-slate-50">
            <View className="p-4">
                <GroupImagePicker
                    imageUrl={isEdit && !imageRemoved ? imageUrl : undefined}
                    localUri={localImageUri}
                    groupType={groupType}
                    onChange={handleImageChange}
                />

                {/* Group Name */}
                <Input
                    label={t('groups.groupName')}
                    placeholder={t('groups.enterGroupName')}
                    value={name}
                    onChangeText={(text) => {
                        setName(text);
                        if (nameError) setNameError('');
                    }}
                    error={nameError}
                />

                <GroupTypeSelector value={groupType} onChange={setGroupType} />

                {/* Currency */}
                <CurrencyPicker
                    value={currency}
                    onChange={setCurrency}
                    label={t('groups.currency')}
                />

                {/* Members */}
                <View className="mb-4">
                    <Text className="text-sm font-medium text-gray-700 mb-2">
                        {t('groups.members.title')}
                    </Text>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ paddingVertical: 4, gap: 12 }}
                    >
                        {displayMembers.map(m => {
                            const isSelf = m.id === currentUserId || m.id === currentUser?.id;
                            return (
                                <View
                                    key={m.id}
                                    className="items-center"
                                    style={{ width: 56 }}
                                    testID={`group-form-member-${m.id}`}
                                >
                                    <View>
                                        <MemberAvatar name={m.name} avatarUrl={m.avatarUrl} size="md" />
                                        {!isSelf && (
                                            <TouchableOpacity
                                                onPress={() => openRemoveDialog(m)}
                                                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                                accessibilityRole="button"
                                                accessibilityLabel={t('groups.removeMember')}
                                                testID={`group-form-member-remove-${m.id}`}
                                                className="absolute -top-1 -right-1 bg-gray-200 items-center justify-center"
                                                style={{ width: 20, height: 20, borderRadius: 10 }}
                                            >
                                                <AppIcon name="trash-outline" size={12} color={colors.gray600} />
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                    <Text
                                        numberOfLines={1}
                                        className="text-xs text-gray-600 mt-1 w-14 text-center"
                                    >
                                        {m.name}
                                    </Text>
                                </View>
                            );
                        })}
                        <TouchableOpacity
                            onPress={() => setAddMembersOpen(true)}
                            activeOpacity={0.7}
                            className="items-center"
                            style={{ width: 56 }}
                            testID="group-form-add-member"
                        >
                            <View
                                className="bg-primary-extra-light border border-primary items-center justify-center"
                                style={{ width: 44, height: 44, borderRadius: 22 }}
                            >
                                <AppIcon name="add" size={22} color={colors.primary} />
                            </View>
                            <Text className="text-xs text-primary mt-1 w-14 text-center">
                                {t('groups.members.add')}
                            </Text>
                        </TouchableOpacity>
                    </ScrollView>
                </View>

                {/* Action Buttons */}
                {isEdit ? (
                    <View className="mt-4 gap-2">
                        <Button
                            title={t('common.save')}
                            onPress={handleSubmit}
                            loading={isLoading}
                            disabled={isLoading}
                        />
                        <Button
                            title={t('common.cancel')}
                            onPress={() => navigation.goBack()}
                            variant="outline"
                        />
                    </View>
                ) : (
                    <View className="mt-4">
                        <Button
                            title={t('groups.createGroup')}
                            onPress={handleSubmit}
                            loading={isLoading}
                            disabled={isLoading}
                        />
                    </View>
                )}
            </View>

            <AddMembersSheet
                visible={addMembersOpen}
                groupId={groupId}
                currentMemberIds={memberIdsForSheet}
                onClose={() => setAddMembersOpen(false)}
                onAdded={isEdit ? loadMembers : undefined}
                onConfirmSelection={isEdit ? undefined : handleMembersSelected}
            />

            <Modal
                visible={removeTarget !== null}
                transparent
                animationType="fade"
                onRequestClose={() => setRemoveTarget(null)}
            >
                <Pressable
                    className="flex-1 bg-black/50 justify-center items-center p-4"
                    onPress={() => setRemoveTarget(null)}
                >
                    <Pressable onPress={() => { }} className="bg-white rounded-2xl p-6 w-full max-w-sm">
                        <Text className="text-xl font-bold text-gray-900 mb-2">
                            {t('groups.cannotRemoveMember')}
                        </Text>
                        <Text className="text-base text-gray-600">
                            {t('groups.cannotRemoveMemberReason')}
                        </Text>
                    </Pressable>
                </Pressable>
            </Modal>
        </ScrollView>
    );
}
