import { Text } from '../AppText';
import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { MemberAvatar } from '../MemberAvatar';
import { AppIcon } from '../AppIcon';
import { colors, shadows } from '../../theme';
import { useRtlLayout, rtlRowStyle } from '../../hooks/useRtlLayout';

interface Props {
    name: string;
    avatarUrl?: string;
    onEditPress: () => void;
}

export function ProfileHeaderRow({ name, avatarUrl, onEditPress }: Props) {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();

    return (
        <View
            className="mx-4 mt-4 mb-5 rounded-xl bg-white border border-slate-200/80 px-4 py-4"
            style={shadows.sm}
        >
            <View style={rtlRowStyle(isRtl)} className="items-center">
                <MemberAvatar name={name} avatarUrl={avatarUrl} size="lg" testID="profile-header-avatar" />
                <View style={{ flex: 1, marginHorizontal: 16 }}>
                    <Text
                        className="text-xl font-semibold text-slate-900 tracking-tight"
                        numberOfLines={1}
                    >
                        {name}
                    </Text>
                </View>
                <TouchableOpacity
                    onPress={onEditPress}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    testID="profile-header-edit"
                    accessibilityLabel={t('profile.editProfile')}
                    className="w-10 h-10 items-center justify-center rounded-full bg-slate-50 border border-slate-200/80"
                >
                    <AppIcon name="create-outline" size={18} color={colors.gray600} />
                </TouchableOpacity>
            </View>
        </View>
    );
}
