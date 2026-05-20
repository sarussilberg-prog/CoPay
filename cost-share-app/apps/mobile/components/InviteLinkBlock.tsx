import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from './AppText';
import { AppIcon } from './AppIcon';
import { useInviteLink } from '../hooks/useInviteLink';
import { useRtlLayout, rtlRowStyle } from '../hooks/useRtlLayout';
import { colors } from '../theme';

interface Props {
    kind: 'friend' | 'group';
    mode: 'expanded' | 'compact';
    groupId?: string;
}

export function InviteLinkBlock({ kind, mode, groupId }: Props) {
    const { t } = useTranslation();
    const { isReady, share, rotate } = useInviteLink(groupId);
    const isRtl = useRtlLayout();

    const rotateKey = kind === 'friend' ? 'invite.friend.rotate' : 'invite.group.rotate';
    const shareKey = kind === 'friend' ? 'invite.friend.cta' : 'invite.group.title';

    if (!isReady) return null;

    return (
        <View className="bg-white rounded-xl border border-slate-200/80 overflow-hidden">
            <TouchableOpacity
                onPress={share}
                style={rtlRowStyle(isRtl)}
                className="items-center px-4 py-3"
                testID="invite-link-share"
            >
                <AppIcon name="share-outline" size={20} color={colors.primary} />
                <Text className="flex-1 ml-3 text-sm font-semibold text-gray-800">
                    {t(shareKey)}
                </Text>
            </TouchableOpacity>

            {mode === 'expanded' && (
                <TouchableOpacity
                    onPress={rotate}
                    style={rtlRowStyle(isRtl)}
                    className="items-center px-4 py-3 border-t border-slate-100"
                    testID="invite-link-rotate"
                >
                    <AppIcon name="refresh-outline" size={20} color={colors.gray600} />
                    <Text className="flex-1 ml-3 text-sm font-medium text-gray-700">
                        {t(rotateKey)}
                    </Text>
                </TouchableOpacity>
            )}
        </View>
    );
}
