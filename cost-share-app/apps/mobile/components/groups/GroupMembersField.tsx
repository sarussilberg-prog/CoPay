/**
 * GroupMembersField — member avatars + add button (shared members row).
 */

import React from 'react';
import { View, ScrollView, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { User } from '@cost-share/shared';
import { MemberAvatar } from '../MemberAvatar';
import { AppIcon } from '../AppIcon';
import { Text } from '../AppText';
import { colors } from '../../theme';
import { getAvatarUrl, getDisplayName } from '../../lib/userDisplay';

type Props = {
    displayMembers: User[];
    currentUserId: string | null;
    currentUser: User | null | undefined;
    onAddMembers: () => void;
    onRemoveMember: (member: User) => void;
    testID?: string;
};

export function GroupMembersField({
    displayMembers,
    currentUserId,
    currentUser,
    onAddMembers,
    onRemoveMember,
    testID,
}: Props) {
    const { t } = useTranslation();

    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingVertical: 4, gap: 12 }}
            testID={testID}
        >
            {displayMembers.map((m) => {
                const isSelf = m.id === currentUserId || m.id === currentUser?.id;
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
                                    style={{ width: 22, height: 22, borderRadius: 11 }}
                                >
                                    <AppIcon name="close" size={12} color={colors.gray600} />
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
    );
}
