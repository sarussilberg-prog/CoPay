/**
 * Shared fields for create / edit group (used by CreateGroupScreen and onboarding).
 */

import React, { useCallback } from 'react';
import { View, ScrollView, TouchableOpacity } from 'react-native';
import { platformAlert } from '../../lib/platformAlert';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { GroupType, User } from '@cost-share/shared';
import { Input } from '../Input';
import { GroupTypeSelector } from '../GroupTypeSelector';
import { CurrencyPicker } from '../CurrencyPicker';
import { MemberAvatar } from '../MemberAvatar';
import { AppIcon } from '../AppIcon';
import { Text } from '../AppText';
import { colors } from '../../theme';
import { getAvatarUrl, getDisplayName } from '../../lib/userDisplay';
import { CreateGroupCoverPreview } from './CreateGroupCoverPreview';
import { GroupFormSection } from './CreateGroupFormShell';

export type CreateGroupFormFieldsProps = {
    isEdit: boolean;
    name: string;
    nameError?: string;
    onNameChange: (text: string) => void;
    groupType: GroupType;
    onGroupTypeChange: (type: GroupType) => void;
    currency: string;
    onCurrencyChange: (code: string) => void;
    imageUrl?: string | null;
    localImageUri?: string | null;
    onImageChange: (uri: string | null) => void;
    displayMembers: User[];
    currentUserId: string | null;
    currentUser: User | null | undefined;
    onAddMembers: () => void;
    onRemoveMember: (member: User) => void;
};

export function CreateGroupFormFields({
    isEdit,
    name,
    nameError,
    onNameChange,
    groupType,
    onGroupTypeChange,
    currency,
    onCurrencyChange,
    imageUrl,
    localImageUri,
    onImageChange,
    displayMembers,
    currentUserId,
    currentUser,
    onAddMembers,
    onRemoveMember,
}: CreateGroupFormFieldsProps) {
    const { t } = useTranslation();

    const pickImage = useCallback(async () => {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
            platformAlert(t('groups.imagePermissionTitle'), t('groups.imagePermissionMessage'));
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [16, 9],
            quality: 0.85,
        });
        if (!result.canceled && result.assets[0]?.uri) {
            onImageChange(result.assets[0].uri);
        }
    }, [onImageChange, t]);

    const displayUri = localImageUri ?? imageUrl ?? null;

    return (
        <>
            <CreateGroupCoverPreview
                name={name}
                groupType={groupType}
                imageUrl={imageUrl}
                localUri={localImageUri}
                onPress={() => void pickImage()}
                testID="group-form-cover"
            />

            {displayUri ? (
                <TouchableOpacity
                    onPress={() => onImageChange(null)}
                    className="mb-4 self-start"
                    testID="group-form-cover-remove"
                >
                    <Text className="text-sm font-medium text-red-500">
                        {t('groups.removeImage')}
                    </Text>
                </TouchableOpacity>
            ) : null}

            <GroupFormSection title={t('groups.createForm.sectionIdentity')}>
                <Input
                    label={t('groups.groupName')}
                    placeholder={t('groups.createForm.namePlaceholder')}
                    value={name}
                    onChangeText={onNameChange}
                    error={nameError}
                    containerClassName="mb-0"
                />
            </GroupFormSection>

            <GroupTypeSelector value={groupType} onChange={onGroupTypeChange} />

            <GroupFormSection title={t('groups.createForm.sectionSettings')}>
                <CurrencyPicker
                    value={currency}
                    onChange={onCurrencyChange}
                    label={t('groups.currency')}
                />
            </GroupFormSection>

            <GroupFormSection
                title={t('groups.members.title')}
                testID="group-form-members-section"
            >
                <Text className="text-sm text-gray-500 mb-3 leading-relaxed">
                    {t('groups.createForm.membersHint')}
                </Text>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingVertical: 4, gap: 12 }}
                >
                    {displayMembers.map((m) => {
                        const isSelf =
                            m.id === currentUserId || m.id === currentUser?.id;
                        return (
                            <View
                                key={m.id}
                                className="items-center"
                                style={{ width: 56 }}
                                testID={`group-form-member-${m.id}`}
                            >
                                <View>
                                    <MemberAvatar
                                        name={getDisplayName(m, t)}
                                        avatarUrl={getAvatarUrl(m) ?? undefined}
                                        size="md"
                                    />
                                    {!isSelf && (
                                        <TouchableOpacity
                                            onPress={() => onRemoveMember(m)}
                                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                            accessibilityRole="button"
                                            accessibilityLabel={t('groups.removeMember')}
                                            testID={`group-form-member-remove-${m.id}`}
                                            className="absolute -top-1 -end-1 bg-white border border-gray-200 items-center justify-center"
                                            style={{
                                                width: 22,
                                                height: 22,
                                                borderRadius: 11,
                                            }}
                                        >
                                            <AppIcon
                                                name="close"
                                                size={12}
                                                color={colors.gray600}
                                            />
                                        </TouchableOpacity>
                                    )}
                                </View>
                                <Text
                                    numberOfLines={1}
                                    className="text-xs text-gray-600 mt-1 w-14 text-center"
                                >
                                    {getDisplayName(m, t)}
                                </Text>
                            </View>
                        );
                    })}
                    <TouchableOpacity
                        onPress={onAddMembers}
                        activeOpacity={0.7}
                        className="items-center"
                        style={{ width: 56 }}
                        testID="group-form-add-member"
                    >
                        <View
                            className="bg-primary-extra-light border-2 border-dashed border-primary/40 items-center justify-center"
                            style={{ width: 44, height: 44, borderRadius: 22 }}
                        >
                            <AppIcon name="add" size={22} color={colors.primary} />
                        </View>
                        <Text className="text-xs text-primary font-semibold mt-1 w-14 text-center">
                            {t('groups.members.add')}
                        </Text>
                    </TouchableOpacity>
                </ScrollView>
            </GroupFormSection>
        </>
    );
}
