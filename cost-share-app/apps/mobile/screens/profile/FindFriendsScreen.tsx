/**
 * FindFriendsScreen — search profiles by name/email/phone.
 * Each row shows the relationship state and the right CTA.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
    View,
    ScrollView,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import { Text } from '../../components/AppText';
import { MemberAvatar } from '../../components/MemberAvatar';
import { AppIcon } from '../../components/AppIcon';
import { colors } from '../../theme';
import {
    useAcceptFriendRequestMutation,
    useRejectFriendRequestMutation,
    useSearchUsersQuery,
    useSendFriendRequestMutation,
} from '../../hooks/queries/useFriendsQueries';
import { SearchUserResult } from '../../services/friends.service';
import { shareFriendInvite } from '../../services/invite.service';
import { getAvatarUrl, getDisplayName } from '../../lib/userDisplay';

function useDebouncedValue<T>(value: T, ms: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const id = setTimeout(() => setDebounced(value), ms);
        return () => clearTimeout(id);
    }, [value, ms]);
    return debounced;
}

export function FindFriendsScreen() {
    const { t } = useTranslation();
    const [query, setQuery] = useState('');
    const debounced = useDebouncedValue(query, 250);
    const searchQ = useSearchUsersQuery(debounced);
    const sendM = useSendFriendRequestMutation();
    const acceptM = useAcceptFriendRequestMutation();
    const rejectM = useRejectFriendRequestMutation();

    const handleSend = useCallback(
        async (userId: string) => {
            try {
                await sendM.mutateAsync(userId);
                Toast.show({ type: 'success', text1: t('friends.toasts.requestSent') });
            } catch {
                Toast.show({ type: 'error', text1: t('friends.toasts.requestSentError') });
            }
        },
        [sendM, t],
    );

    const handleAccept = useCallback(
        async (requestId: string) => {
            try {
                await acceptM.mutateAsync(requestId);
                Toast.show({ type: 'success', text1: t('friends.toasts.accepted') });
            } catch {
                Toast.show({ type: 'error', text1: t('friends.toasts.error') });
            }
        },
        [acceptM, t],
    );

    const handleReject = useCallback(
        async (requestId: string) => {
            try {
                await rejectM.mutateAsync(requestId);
                Toast.show({ type: 'success', text1: t('friends.toasts.rejected') });
            } catch {
                Toast.show({ type: 'error', text1: t('friends.toasts.error') });
            }
        },
        [rejectM, t],
    );

    const trimmed = query.trim();
    const tooShort = trimmed.length > 0 && trimmed.length < 2;
    const results = searchQ.data ?? [];

    const renderActions = (r: SearchUserResult) => {
        switch (r.relationship) {
            case 'self':
                return (
                    <Text className="text-xs text-gray-500">{t('friends.find.self')}</Text>
                );
            case 'friends':
                return (
                    <View className="flex-row items-center">
                        <AppIcon name="checkmark-circle" size={16} color={colors.primary} />
                        <Text className="text-xs font-semibold text-primary ml-1">
                            {t('friends.actions.friends')}
                        </Text>
                    </View>
                );
            case 'request_sent':
                return (
                    <Text className="text-xs text-gray-500">
                        {t('friends.actions.pending')}
                    </Text>
                );
            case 'request_received':
                return (
                    <View className="flex-row">
                        {r.requestId && (
                            <>
                                <TouchableOpacity
                                    onPress={() => handleReject(r.requestId as string)}
                                    className="h-8 px-3 rounded-lg border border-gray-200 items-center justify-center mr-2"
                                >
                                    <Text className="text-xs font-semibold text-gray-700">
                                        {t('friends.actions.reject')}
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => handleAccept(r.requestId as string)}
                                    className="h-8 px-3 rounded-lg bg-primary items-center justify-center"
                                >
                                    <Text className="text-xs font-semibold text-white">
                                        {t('friends.actions.accept')}
                                    </Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                );
            default:
                return (
                    <TouchableOpacity
                        onPress={() => handleSend(r.user.id)}
                        className="h-8 px-3 rounded-lg bg-primary items-center justify-center"
                    >
                        <Text className="text-xs font-semibold text-white">
                            {t('friends.actions.sendRequest')}
                        </Text>
                    </TouchableOpacity>
                );
        }
    };

    return (
        <View className="flex-1 bg-slate-50">
            <View className="px-4 pt-3 pb-2">
                <View className="flex-row items-center bg-white rounded-xl border border-slate-200/80 px-3 h-11">
                    <AppIcon name="search" size={18} color={colors.gray500} />
                    <TextInput
                        value={query}
                        onChangeText={setQuery}
                        placeholder={t('friends.find.searchPlaceholder')}
                        placeholderTextColor={colors.gray400}
                        autoCapitalize="none"
                        autoCorrect={false}
                        className="flex-1 ml-2 text-sm text-gray-900"
                        testID="find-friends-input"
                    />
                    {query.length > 0 && (
                        <TouchableOpacity
                            onPress={() => setQuery('')}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <AppIcon name="close-circle" size={18} color={colors.gray400} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            <ScrollView
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
                refreshControl={
                    <RefreshControl
                        refreshing={searchQ.isRefetching}
                        onRefresh={() => searchQ.refetch()}
                        tintColor={colors.primary}
                    />
                }
                keyboardShouldPersistTaps="handled"
            >
                {tooShort && (
                    <Text className="text-sm text-gray-500 py-4 text-center">
                        {t('friends.find.tooShort')}
                    </Text>
                )}

                {!tooShort && searchQ.isFetching && results.length === 0 && (
                    <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
                )}

                {!tooShort && !searchQ.isFetching && trimmed.length >= 2 && results.length === 0 && (
                    <View className="items-center px-6 py-10">
                        <Text className="text-base text-slate-600 mb-4">
                            {t('invite.friend.findEmpty')}
                        </Text>
                        <TouchableOpacity
                            onPress={() => { void shareFriendInvite(); }}
                            className="px-5 py-3 bg-primary rounded-full"
                            testID="findfriends-empty-invite"
                        >
                            <Text className="text-sm font-semibold text-white">
                                {trimmed.length > 0
                                    ? t('invite.friend.findInviteName', { name: trimmed })
                                    : t('invite.friend.findEmptyCta')}
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}

                {results.length > 0 && (
                    <View>
                        <View className="bg-white rounded-xl border border-slate-200/80 overflow-hidden">
                            {results.map((r, idx) => (
                                <View
                                    key={r.user.id}
                                    className={`flex-row items-center px-3 py-3 ${
                                        idx < results.length - 1 ? 'border-b border-slate-100' : ''
                                    }`}
                                >
                                    <MemberAvatar
                                        name={getDisplayName(r.user, t)}
                                        avatarUrl={getAvatarUrl(r.user) ?? undefined}
                                        size="sm"
                                    />
                                    <View className="flex-1 ml-3">
                                        <Text className="text-sm font-medium text-gray-800" numberOfLines={1}>
                                            {getDisplayName(r.user, t)}
                                        </Text>
                                        {(r.user.email || r.user.phone) && (
                                            <Text className="text-xs text-gray-500" numberOfLines={1}>
                                                {r.user.email ?? r.user.phone}
                                            </Text>
                                        )}
                                    </View>
                                    {renderActions(r)}
                                </View>
                            ))}
                        </View>
                        <View className="items-center py-6 border-t border-slate-100 mt-4">
                            <Text className="text-sm text-slate-500 mb-2">
                                {t('invite.friend.findEmpty')}
                            </Text>
                            <TouchableOpacity
                                onPress={() => { void shareFriendInvite(); }}
                                testID="findfriends-footer-invite"
                            >
                                <Text className="text-sm font-semibold text-primary">
                                    {t('invite.friend.findEmptyCta')}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            </ScrollView>
        </View>
    );
}
