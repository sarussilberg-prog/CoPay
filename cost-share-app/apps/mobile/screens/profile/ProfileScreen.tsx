import { Text } from '../../components/AppText';
import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { FriendBalance } from '@cost-share/shared';
import { useAppStore } from '../../store';
import { useDashboardQuery } from '../../hooks/queries/useDashboardQuery';
import { useProfileBalanceSummary } from '../../hooks/useProfileBalanceSummary';
import { useFriendBalancesDisplay } from '../../hooks/useFriendBalancesDisplay';
import { AppIcon } from '../../components/AppIcon';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { EmptyState } from '../../components/EmptyState';
import { ProfileHeaderRow } from '../../components/dashboard/ProfileHeaderRow';
import { BalanceHeroCard } from '../../components/dashboard/BalanceHeroCard';
import { StatTile, StatGroup, StatDivider } from '../../components/dashboard/StatTile';
import { FriendBalanceRow } from '../../components/dashboard/FriendBalanceRow';
import { FriendGroupBalancesSheet } from '../../components/dashboard/FriendGroupBalancesSheet';
import { colors, shadows } from '../../theme';
import { useRtlLayout, rtlRowStyle } from '../../hooks/useRtlLayout';
import { useIncomingFriendRequestsQuery } from '../../hooks/queries/useFriendsQueries';
import { getCurrentUserId } from '../../lib/auth';

export function ProfileScreen() {
    const { t } = useTranslation();
    const navigation = useNavigation<any>();
    const currentUser = useAppStore((s) => s.currentUser);

    const { data: dashboard, isLoading, isRefetching, refetch, isError } = useDashboardQuery();
    const { summary: balanceSummary, conversion } = useProfileBalanceSummary(dashboard?.balanceSummary);
    const friendDisplays = useFriendBalancesDisplay(
        dashboard?.friends,
        balanceSummary?.defaultCurrency ?? dashboard?.balanceSummary.defaultCurrency,
    );
    const incomingQ = useIncomingFriendRequestsQuery();
    const pendingCount = incomingQ.data?.length ?? 0;

    const handleRefresh = useCallback(() => {
        void refetch();
    }, [refetch]);
    const handleOpenSettings = useCallback(() => navigation.navigate('Settings'), [navigation]);
    const handleEditProfile = useCallback(() => navigation.navigate('EditProfile'), [navigation]);

    const [selectedFriend, setSelectedFriend] = useState<FriendBalance | null>(null);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    useEffect(() => {
        void getCurrentUserId().then(setCurrentUserId);
    }, []);

    const handleFriendPress = useCallback((friend: FriendBalance) => {
        setSelectedFriend(friend);
    }, []);

    const handleCloseFriendSheet = useCallback(() => setSelectedFriend(null), []);

    const handleSelectGroup = useCallback((groupId: string) => {
        setSelectedFriend(null);
        navigation.navigate('Groups', { screen: 'GroupDetail', params: { groupId } });
    }, [navigation]);

    const isRtl = useRtlLayout();

    if (isLoading && !dashboard) return <LoadingIndicator />;

    return (
        <SafeAreaView className="flex-1 bg-slate-100" edges={['top']}>
            <View
                style={rtlRowStyle(isRtl)}
                className="px-4 pt-1 pb-0 items-center justify-end"
            >
                <TouchableOpacity
                    onPress={handleOpenSettings}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    testID="profile-settings-button"
                    accessibilityLabel={t('settings.title')}
                    className="w-10 h-10 items-center justify-center rounded-full bg-white border border-slate-200/80"
                    style={shadows.sm}
                >
                    <AppIcon name="settings-outline" size={22} color={colors.gray600} />
                </TouchableOpacity>
            </View>
            <ScrollView
                className="flex-1"
                contentContainerClassName="pb-10"
                refreshControl={
                    <RefreshControl
                        refreshing={isRefetching}
                        onRefresh={handleRefresh}
                        tintColor={colors.primary}
                    />
                }
            >
            <ProfileHeaderRow
                name={currentUser?.name || t('common.unknown')}
                avatarUrl={currentUser?.avatarUrl}
                onEditPress={handleEditProfile}
            />

            {isError || !dashboard ? (
                <EmptyState
                    iconName="alert-circle-outline"
                    title={t('dashboard.loadError')}
                    message={t('common.networkError')}
                    actionTitle={t('common.retry')}
                    onAction={handleRefresh}
                />
            ) : (
                <>
                    <BalanceHeroCard
                        summary={balanceSummary ?? dashboard.balanceSummary}
                        conversion={conversion}
                    />

                    <StatGroup>
                        <StatTile
                            label={t('dashboard.activeGroups')}
                            value={dashboard.stats.activeGroupsCount}
                            onPress={() =>
                                navigation.navigate('Groups', {
                                    screen: 'GroupsList',
                                    params: { balanceState: 'unsettled', showArchived: true },
                                })
                            }
                            testID="stat-active"
                        />
                        <StatDivider />
                        <StatTile
                            label={t('dashboard.closedGroups')}
                            value={dashboard.stats.closedGroupsCount}
                            onPress={() =>
                                navigation.navigate('Groups', {
                                    screen: 'GroupsList',
                                    params: { balanceState: 'settled', showArchived: true },
                                })
                            }
                            testID="stat-closed"
                        />
                    </StatGroup>

                    <TouchableOpacity
                        onPress={() => navigation.navigate('Friends')}
                        activeOpacity={0.7}
                        className="mx-4 mb-4 px-4 py-3 bg-white rounded-xl border border-slate-200/80 flex-row items-center"
                        style={shadows.sm}
                        testID="profile-friends-row"
                    >
                        <AppIcon name="people-outline" size={22} color={colors.primary} />
                        <Text className="flex-1 ml-3 text-sm font-semibold text-gray-800">
                            {t('friends.title')}
                        </Text>
                        {pendingCount > 0 && (
                            <View
                                className="bg-primary rounded-full px-2 mr-2"
                                style={{ minWidth: 22, height: 22, justifyContent: 'center', alignItems: 'center' }}
                            >
                                <Text className="text-xs font-bold text-white">{pendingCount}</Text>
                            </View>
                        )}
                        <AppIcon
                            name={isRtl ? 'chevron-back' : 'chevron-forward'}
                            size={18}
                            color={colors.gray400}
                        />
                    </TouchableOpacity>


                    {dashboard.friends.length > 0 ? (
                        <View className="mx-4 mb-8">
                            <View className="items-center mb-2">
                                <Text className="text-xs text-slate-400">{dashboard.friends.length}</Text>
                                <Text className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                                    {t('dashboard.friends')}
                                </Text>
                            </View>
                            <View
                                className="rounded-xl bg-white border border-slate-200/80 overflow-hidden"
                                style={shadows.sm}
                            >
                                {dashboard.friends.map((f, index) => {
                                    const display = friendDisplays.get(f.userId);
                                    if (!display) return null;
                                    return (
                                        <FriendBalanceRow
                                            key={f.userId}
                                            friend={f}
                                            display={display}
                                            onPress={handleFriendPress}
                                            testID={`friend-${f.userId}`}
                                            isLast={index === dashboard.friends.length - 1}
                                        />
                                    );
                                })}
                            </View>
                        </View>
                    ) : null}
                </>
            )}
            </ScrollView>
            <FriendGroupBalancesSheet
                visible={selectedFriend !== null}
                friend={selectedFriend}
                currentUserId={currentUserId}
                onClose={handleCloseFriendSheet}
                onSelectGroup={handleSelectGroup}
            />
        </SafeAreaView>
    );
}
