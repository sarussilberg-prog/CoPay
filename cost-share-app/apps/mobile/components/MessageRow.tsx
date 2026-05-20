/**
 * MessageRow — WhatsApp-style group message bubble with avatar and full date/time.
 */

import React, { useCallback } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ActionSheetIOS,
    Alert,
    Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { GroupMessage } from '@cost-share/shared';
import { MemberAvatar } from './MemberAvatar';
import { HighlightedText } from './HighlightedText';
import { AppIcon } from './AppIcon';
import { FeedChatRow } from './FeedChatRow';
import { FeedActorName } from './FeedActorName';
import { feedBubbleStyles } from './feedBubbleStyles';
import { formatFeedDateTime } from '../lib/formatFeedDateTime';
import { useAppLanguage } from '../hooks/useRtlLayout';
import { colors } from '../theme';

interface MessageRowProps {
    message: GroupMessage;
    senderName: string;
    senderAvatarUrl?: string;
    isMine: boolean;
    onEdit: (m: GroupMessage) => void;
    onDelete: (m: GroupMessage) => void;
    searchQuery?: string;
}

function MessageRowBase({
    message,
    senderName,
    senderAvatarUrl,
    isMine,
    onEdit,
    onDelete,
    searchQuery,
}: MessageRowProps) {
    const { t } = useTranslation();
    const language = useAppLanguage();
    const timestamp = formatFeedDateTime(message.createdAt, language);

    const handleLongPress = useCallback(() => {
        if (!isMine) return;
        const options = [
            t('groups.message.edit'),
            t('groups.message.delete'),
            t('common.cancel'),
        ];
        if (Platform.OS === 'ios') {
            ActionSheetIOS.showActionSheetWithOptions(
                {
                    options,
                    destructiveButtonIndex: 1,
                    cancelButtonIndex: 2,
                },
                buttonIndex => {
                    if (buttonIndex === 0) onEdit(message);
                    if (buttonIndex === 1) onDelete(message);
                },
            );
        } else {
            Alert.alert(senderName, message.body, [
                { text: t('groups.message.edit'), onPress: () => onEdit(message) },
                {
                    text: t('groups.message.delete'),
                    style: 'destructive',
                    onPress: () => onDelete(message),
                },
                { text: t('common.cancel'), style: 'cancel' },
            ]);
        }
    }, [isMine, message, onEdit, onDelete, senderName, t]);

    const avatar = (
        <MemberAvatar
            name={senderName}
            avatarUrl={senderAvatarUrl}
            size="xs"
            testID="message-avatar"
        />
    );

    return (
        <FeedChatRow avatar={avatar} testID="message-row">
            <TouchableOpacity
                onLongPress={handleLongPress}
                activeOpacity={isMine ? 0.85 : 1}
                disabled={!isMine}
                style={feedBubbleStyles.bubble}
            >
                {!isMine && (
                    <FeedActorName
                        name={senderName}
                        className="text-xs font-semibold text-gray-600 mb-1"
                    />
                )}
                <View className="flex-row items-start">
                    <HighlightedText
                        className="text-sm text-gray-900 flex-1"
                        text={message.body}
                        query={searchQuery}
                    />
                    {isMine && (
                        <TouchableOpacity
                            onPress={() => onDelete(message)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            accessibilityRole="button"
                            accessibilityLabel={t('groups.message.delete')}
                            className="ml-2"
                            testID="message-delete-btn"
                        >
                            <AppIcon
                                name="trash-outline"
                                size={16}
                                color={colors.gray400}
                            />
                        </TouchableOpacity>
                    )}
                </View>
                <View className="flex-row items-center mt-2 flex-wrap">
                    <Text className="text-[11px] text-gray-400" testID="message-timestamp">
                        {timestamp}
                    </Text>
                    {message.editedAt && (
                        <Text
                            className="text-[11px] text-gray-400 ml-1"
                            testID="message-edited-tag"
                        >
                            · {t('groups.message.edited')}
                        </Text>
                    )}
                </View>
            </TouchableOpacity>
        </FeedChatRow>
    );
}

export const MessageRow = React.memo(MessageRowBase);
