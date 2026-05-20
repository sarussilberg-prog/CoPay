/**
 * EditGroupScreen
 * Form to edit an existing group
 * Uses NativeWind styling only, full i18n support
 */

import { Text } from '../../components/AppText';
import React, { useCallback, useState, useEffect } from 'react';
import { View, ScrollView, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
import { GroupType, DEFAULT_CURRENCY, User } from '@cost-share/shared';
import { useLoading } from '../../hooks/useLoading';
import {
    getGroupById,
    updateGroup,
    deleteGroup,
    removeGroupMember,
} from '../../services/groups.service';
import { fetchGroupUsers } from '../../services/users.service';
import { uploadGroupImage } from '../../services/storage.service';
import { getCurrentUserId } from '../../lib/auth';
import { GroupImagePicker } from '../../components/GroupImagePicker';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { CurrencyPicker } from '../../components/CurrencyPicker';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { MemberAvatar } from '../../components/MemberAvatar';
import { AddMembersSheet } from '../../components/AddMembersSheet';
import { AppIcon } from '../../components/AppIcon';
import { colors } from '../../theme';

const groupTypes: { key: GroupType; emoji: string }[] = [
    { key: 'trip', emoji: '✈️' },
    { key: 'home', emoji: '🏠' },
    { key: 'couple', emoji: '💑' },
    { key: 'general', emoji: '👥' },
];

export function EditGroupScreen() {
    const { t } = useTranslation();
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const { groupId } = route.params;
    const { isLoading, startLoading, stopLoading } = useLoading();

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [groupType, setGroupType] = useState<GroupType>('general');
    const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
    const [nameError, setNameError] = useState('');
    const [loading, setLoading] = useState(true);
    const [imageUrl, setImageUrl] = useState<string | undefined>();
    const [localImageUri, setLocalImageUri] = useState<string | null>(null);
    const [imageRemoved, setImageRemoved] = useState(false);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [showLeaveDialog, setShowLeaveDialog] = useState(false);
    const [members, setMembers] = useState<User[]>([]);
    const [addMembersOpen, setAddMembersOpen] = useState(false);

    const loadMembers = useCallback(async () => {
        const users = await fetchGroupUsers(groupId);
        setMembers(users);
    }, [groupId]);

    useEffect(() => {
        const loadGroup = async () => {
            const group = await getGroupById(groupId);
            if (group) {
                setName(group.name);
                setDescription(group.description || '');
                setGroupType(group.groupType);
                setCurrency(group.defaultCurrency);
                setImageUrl(group.imageUrl);
            }
            await loadMembers();
            setLoading(false);
        };
        void loadGroup();
    }, [groupId, loadMembers]);

    const validateForm = (): boolean => {
        if (!name.trim()) {
            setNameError(t('groups.nameRequired'));
            return false;
        }
        setNameError('');
        return true;
    };

    const handleUpdate = async () => {
        if (!validateForm()) return;

        startLoading();
        let nextImageUrl: string | undefined = imageRemoved ? undefined : imageUrl;

        if (localImageUri) {
            const uploadedUrl = await uploadGroupImage(groupId, localImageUri);
            if (uploadedUrl) {
                nextImageUrl = uploadedUrl;
            }
        }

        const result = await updateGroup(groupId, {
            name: name.trim(),
            description: description.trim() || undefined,
            groupType,
            defaultCurrency: currency,
            imageUrl: imageRemoved ? '' : nextImageUrl,
        });
        stopLoading();

        if (result) {
            navigation.goBack();
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

    const handleDelete = async () => {
        setShowDeleteDialog(false);
        const ok = await deleteGroup(groupId);
        if (ok) navigation.popToTop?.() ?? navigation.goBack();
    };

    const handleLeave = async () => {
        setShowLeaveDialog(false);
        const userId = await getCurrentUserId();
        if (!userId) return;
        const ok = await removeGroupMember(groupId, userId);
        if (ok) navigation.popToTop?.() ?? navigation.goBack();
    };

    if (loading) {
        return <LoadingIndicator />;
    }

    return (
        <ScrollView className="flex-1 bg-slate-50">
            <View className="p-4">
                <GroupImagePicker
                    imageUrl={imageRemoved ? null : imageUrl}
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

                {/* Description */}
                <Input
                    label={t('groups.description')}
                    placeholder={t('groups.enterDescription')}
                    value={description}
                    onChangeText={setDescription}
                    multiline
                    numberOfLines={3}
                />

                {/* Group Type */}
                <View className="mb-4">
                    <Text className="text-sm font-medium text-gray-700 mb-2">
                        {t('groups.groupType')}
                    </Text>
                    <View className="flex-row gap-2">
                        {groupTypes.map((gt) => (
                            <TouchableOpacity
                                key={gt.key}
                                onPress={() => setGroupType(gt.key)}
                                activeOpacity={0.7}
                                className={`flex-1 py-3 rounded-xl items-center ${groupType === gt.key
                                    ? 'bg-primary-extra-light border border-primary'
                                    : 'bg-white border border-gray-200'
                                    }`}
                            >
                                <Text className="text-xl mb-1">{gt.emoji}</Text>
                                <Text
                                    className={`text-xs font-medium ${groupType === gt.key ? 'text-primary-dark' : 'text-gray-600'
                                        }`}
                                >
                                    {t(`groups.types.${gt.key}`)}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Currency */}
                <CurrencyPicker
                    value={currency}
                    onChange={setCurrency}
                    label={t('groups.currency')}
                />

                {/* Members */}
                <View className="mb-4">
                    <View className="flex-row items-center justify-between mb-2">
                        <Text className="text-sm font-medium text-gray-700">
                            {t('groups.members.title')}
                        </Text>
                        <TouchableOpacity
                            onPress={() => navigation.navigate('GroupMembers', { groupId })}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                            <Text className="text-xs font-semibold text-primary">
                                {t('groups.members.seeAll')}
                            </Text>
                        </TouchableOpacity>
                    </View>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ paddingVertical: 4, gap: 12 }}
                    >
                        {members.map(m => (
                            <View key={m.id} className="items-center" style={{ width: 56 }}>
                                <MemberAvatar name={m.name} avatarUrl={m.avatarUrl} size="md" />
                                <Text
                                    numberOfLines={1}
                                    className="text-xs text-gray-600 mt-1 w-14 text-center"
                                >
                                    {m.name}
                                </Text>
                            </View>
                        ))}
                        <TouchableOpacity
                            onPress={() => setAddMembersOpen(true)}
                            activeOpacity={0.7}
                            className="items-center"
                            style={{ width: 56 }}
                            testID="edit-group-add-member"
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
                    <View className="mt-3">
                        <Button
                            title={t('groups.members.addMembers')}
                            onPress={() => setAddMembersOpen(true)}
                            variant="outline"
                            testID="edit-group-add-members-button"
                        />
                    </View>
                </View>

                {/* Action Buttons */}
                <View className="mt-4 gap-2">
                    <Button
                        title={t('common.save')}
                        onPress={handleUpdate}
                        loading={isLoading}
                        disabled={isLoading}
                    />
                    <Button
                        title={t('common.cancel')}
                        onPress={() => navigation.goBack()}
                        variant="outline"
                    />
                </View>

                {/* Danger zone */}
                <View className="mt-8 mb-4">
                    <Text className="text-xs font-semibold uppercase text-gray-500 mb-2">
                        {t('groups.dangerZone')}
                    </Text>
                    <View className="gap-2">
                        <Button
                            title={t('groups.leaveGroup')}
                            onPress={() => setShowLeaveDialog(true)}
                            variant="outline"
                        />
                        <Button
                            title={t('groups.deleteGroup')}
                            onPress={() => setShowDeleteDialog(true)}
                            variant="danger"
                        />
                    </View>
                </View>
            </View>

            <ConfirmDialog
                visible={showDeleteDialog}
                title={t('groups.deleteGroup')}
                message={t('groups.deleteGroupConfirm')}
                confirmText={t('common.delete')}
                cancelText={t('common.cancel')}
                onConfirm={handleDelete}
                onCancel={() => setShowDeleteDialog(false)}
                destructive
            />
            <ConfirmDialog
                visible={showLeaveDialog}
                title={t('groups.leaveGroup')}
                message={t('groups.leaveGroupConfirm')}
                confirmText={t('groups.leaveGroup')}
                cancelText={t('common.cancel')}
                onConfirm={handleLeave}
                onCancel={() => setShowLeaveDialog(false)}
                destructive
            />

            <AddMembersSheet
                visible={addMembersOpen}
                groupId={groupId}
                currentMemberIds={members.map(m => m.id)}
                onClose={() => setAddMembersOpen(false)}
                onAdded={loadMembers}
            />
        </ScrollView>
    );
}
