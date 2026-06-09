import { Text } from '../../components/AppText';
import React, { useCallback, useMemo, useState } from 'react';
import {
    View,
    FlatList,
    RefreshControl,
    TouchableOpacity,
    type DimensionValue,
    type ListRenderItem,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { FriendBalance } from '@cost-share/shared';
import { useAppStore } from '../../store';
import { useDashboardQuery } from '../../hooks/queries/useDashboardQuery';
import { useExchangeRatesQuery } from '../../hooks/queries/useExchangeRatesQuery';
import { useProfileBalanceSummary } from '../../hooks/useProfileBalanceSummary';
import { useFriendBalancesDisplay } from '../../hooks/useFriendBalancesDisplay';
import { collectProfileFxCurrencies } from '../../lib/collectProfileFxCurrencies';
import { queryKeys } from '../../hooks/queries/keys';
import { AppIcon } from '../../components/AppIcon';
import { EmptyState } from '../../components/EmptyState';
import { ProfileHeaderRow } from '../../components/dashboard/ProfileHeaderRow';
import { BalanceHeroCard } from '../../components/dashboard/BalanceHeroCard';
import { StatTile, StatGroup, StatDivider } from '../../components/dashboard/StatTile';
import { FriendBalanceRow } from '../../components/dashboard/FriendBalanceRow';
import { FriendGroupBalancesSheet } from '../../components/dashboard/FriendGroupBalancesSheet';
import { colors, shadows } from '../../theme';
import { useRtlLayout, rtlRowStyle } from '../../hooks/useRtlLayout';
import { useFriendsQuery, useIncomingFriendRequestsQuery } from '../../hooks/queries/useFriendsQueries';
import { getAvatarUrl, getDisplayName } from '../../lib/userDisplay';
import { shareFriendInvite } from '../../services/invite.service';

function SkeletonBar({ width, height = 12 }: { width: DimensionValue; height?: number }) {
    return <View className="bg-slate-100 rounded" style={{ width, height }} />;
}

function BalanceHeroCardSkeleton() {
    return (
        <View
            className="rounded-xl mx-4 mb-4 bg-white border border-slate-200/80 overflow-hidden"
            style={shadows.sm}
            testID="balance-hero-skeleton"
        >
            <View className="px-4 pt-4 pb-3 border-b border-slate-100 items-center">
                <SkeletonBar width={120} height={10} />
            </View>
            <View className="px-4 py-6 items-center gap-3">
                <SkeletonBar width={100} height={10} />
                <SkeletonBar width={160} height={28} />
            </View>
        </View>
    );
}

function StatGroupSkeleton() {
    const tile = (
        <View className="flex-1 items-center justify-center py-5 gap-2">
            <SkeletonBar width={40} height={22} />
            <SkeletonBar width={80} height={10} />
        </View>
    );
    return (
        <View
            className="flex-row mx-4 mb-5 rounded-xl bg-white border border-slate-200/80 overflow-hidden"
            style={shadows.sm}
            testID="stat-group-skeleton"
        >
            {tile}
            <View className="w-px bg-slate-100 self-stretch my-3" />
            {tile}
        </View>
    );
}

function FriendListSkeleton({ rows = 3 }: { rows?: number }) {
    return (
        <View className="mx-4 mb-8" testID="friend-list-skeleton">
            <View
                className="rounded-xl bg-white border border-slate-200/80 overflow-hidden"
                style={shadows.sm}
            >
                {Array.from({ length: rows }, (_, idx) => (
                    <View
                        key={`friend-skeleton-${idx}`}
                        className={`flex-row items-center px-4 py-3.5 ${idx === rows - 1 ? '' : 'border-b border-slate-100'}`}
                    >
                        <View className="w-10 h-10 rounded-full bg-slate-100" />
                        <View className="flex-1 mx-3">
                            <SkeletonBar width="60%" height={14} />
                        </View>
                        <SkeletonBar width={70} height={14} />
                    </View>
                ))}
            </View>
        </View>
    );
}

type ProfileDashboardBodyProps = {
    balanceSummary: ReturnType<typeof useProfileBalanceSummary>['summary'];
    conversion: ReturnType<typeof useProfileBalanceSummary>['conversion'];
    dashboard: NonNullable<ReturnType<typeof useDashboardQuery>['data']>;
    pendingCount: number;
    isRtl: boolean;
    onNavigateGroups: (params: { balanceState: 'unsettled' | 'settled' }) => void;
    onNavigateFriends: () => void;
    friendsCount: number;
};

const ProfileDashboardBody = React.memo(function ProfileDashboardBody({
    balanceSummary,
    conversion,
    dashboard,
    pendingCount,
    isRtl,
    onNavigateGroups,
    onNavigateFriends,
    friendsCount,
}: ProfileDashboardBodyProps) {
    const { t } = useTranslation();

    return (
        <>
            <TouchableOpacity
                onPress={onNavigateFriends}
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
                {friendsCount > 0 && (
                    <Text
                        className="text-sm text-gray-400 mr-2"
                        testID="profile-friends-count"
                    >
                        {friendsCount}
                    </Text>
                )}
                <AppIcon
                    name={isRtl ? 'chevron-back' : 'chevron-forward'}
                    size={18}
                    color={colors.gray400}
                />
            </TouchableOpacity>

            <BalanceHeroCard
                summary={balanceSummary ?? dashboard.balanceSummary}
                conversion={conversion}
            />

            <StatGroup>
                <StatTile
                    label={t('dashboard.activeGroups')}
                    value={dashboard.stats.activeGroupsCount}
                    onPress={() => onNavigateGroups({ balanceState: 'unsettled' })}
                    testID="stat-active"
                />
                <StatDivider />
                <StatTile
                    label={t('dashboard.closedGroups')}
                    value={dashboard.stats.closedGroupsCount}
                    onPress={() => onNavigateGroups({ balanceState: 'settled' })}
                    testID="stat-closed"
                />
            </StatGroup>
        </>
    );
});

export function ProfileScreen() {
    const { t } = useTranslation();
    const navigation = useNavigation<any>();
    const queryClient = useQueryClient();
    const currentUser = useAppStore((s) => s.currentUser);

    const { data: dashboard, isLoading, refetch, isError } = useDashboardQuery();
    const [isManualRefreshing, setIsManualRefreshing] = useState(false);

    const baseCurrency = useMemo(
        () =>
            dashboard?.balanceSummary.defaultCurrency ??
            currentUser?.defaultCurrency ??
            'ILS',
        [dashboard, currentUser?.defaultCurrency],
    );

    const fxSymbols = useMemo(
        () =>
            collectProfileFxCurrencies(
                dashboard?.balanceSummary,
                dashboard?.friends,
                baseCurrency,
            ),
        [dashboard, baseCurrency],
    );

    const ratesQuery = useExchangeRatesQuery(baseCurrency, fxSymbols);

    const { summary: balanceSummary, conversion } = useProfileBalanceSummary(
        dashboard?.balanceSummary,
        ratesQuery,
    );
    const friendDisplays = useFriendBalancesDisplay(
        dashboard?.friends,
        baseCurrency,
        ratesQuery.data?.rates,
    );
    const incomingQ = useIncomingFriendRequestsQuery();
    const pendingCount = incomingQ.data?.length ?? 0;
    const friendsQ = useFriendsQuery();
    const friendsCount = friendsQ.data?.length ?? 0;

    const handleRefresh = useCallback(async () => {
        setIsManualRefreshing(true);
        try {
            await Promise.all([
                refetch(),
                queryClient.invalidateQueries({ queryKey: queryKeys.friendRequestsIncoming }),
                queryClient.invalidateQueries({ queryKey: queryKeys.friends }),
                fxSymbols.length > 0 ? ratesQuery.refetch() : Promise.resolve(),
            ]);
        } finally {
            setIsManualRefreshing(false);
        }
    }, [refetch, queryClient, fxSymbols.length, ratesQuery]);

    const handleOpenSettings = useCallback(() => navigation.navigate('Settings'), [navigation]);
    const handleEditProfile = useCallback(() => navigation.navigate('EditProfile'), [navigation]);
    const handleShareFriendInvite = useCallback(() => {
        void shareFriendInvite();
    }, []);

    const [selectedFriend, setSelectedFriend] = useState<FriendBalance | null>(null);
    const currentUserId = currentUser?.id ?? null;

    const handleFriendPress = useCallback((friend: FriendBalance) => {
        setSelectedFriend(friend);
    }, []);

    const handleCloseFriendSheet = useCallback(() => setSelectedFriend(null), []);

    const handleSelectGroup = useCallback((groupId: string) => {
        setSelectedFriend(null);
        navigation.navigate('Groups', { screen: 'GroupDetail', params: { groupId } });
    }, [navigation]);

    const handleNavigateGroups = useCallback(
        (params: { balanceState: 'unsettled' | 'settled' }) => {
            navigation.navigate('Groups', {
                screen: 'GroupsList',
                params: { balanceState: params.balanceState, showArchived: true },
            });
        },
        [navigation],
    );

    const handleNavigateFriends = useCallback(() => navigation.navigate('Friends'), [navigation]);

    const isRtl = useRtlLayout();

    const showLoadingSkeletons = isLoading && !dashboard;
    const showError = isError || (!isLoading && !dashboard);

    const friends = dashboard?.friends ?? [];

    const listHeader = useMemo(
        () => (
            <>
                <ProfileHeaderRow
                    name={getDisplayName(currentUser, t)}
                    avatarUrl={getAvatarUrl(currentUser) ?? undefined}
                    onSharePress={handleShareFriendInvite}
                    onEditPress={handleEditProfile}
                />
                {showError ? (
                    <EmptyState
                        iconName="alert-circle-outline"
                        title={t('dashboard.loadError')}
                        message={t('common.networkError')}
                        actionTitle={t('common.retry')}
                        onAction={handleRefresh}
                    />
                ) : null}
                {showLoadingSkeletons ? (
                    <>
                        <BalanceHeroCardSkeleton />
                        <StatGroupSkeleton />
                        <FriendListSkeleton />
                    </>
                ) : null}
                {dashboard && !showError ? (
                    <ProfileDashboardBody
                        balanceSummary={balanceSummary}
                        conversion={conversion}
                        dashboard={dashboard}
                        pendingCount={pendingCount}
                        isRtl={isRtl}
                        onNavigateGroups={handleNavigateGroups}
                        onNavigateFriends={handleNavigateFriends}
                        friendsCount={friendsCount}
                    />
                ) : null}
            </>
        ),
        [
            balanceSummary,
            conversion,
            currentUser,
            dashboard,
            friendsCount,
            handleEditProfile,
            handleNavigateFriends,
            handleNavigateGroups,
            handleRefresh,
            handleShareFriendInvite,
            isRtl,
            pendingCount,
            showError,
            showLoadingSkeletons,
            t,
        ],
    );

    const renderFriendRow: ListRenderItem<FriendBalance> = useCallback(
        ({ item, index }) => {
            const display = friendDisplays.get(item.userId);
            if (!display) return null;
            const isFirst = index === 0;
            const isLast = index === friends.length - 1;
            return (
                <View
                    className="mx-4 bg-white border-x border-slate-200/80"
                    style={[
                        isFirst && {
                            borderTopWidth: 1,
                            borderTopColor: 'rgba(226,232,240,0.8)',
                            borderTopLeftRadius: 12,
                            borderTopRightRadius: 12,
                        },
                        isLast && {
                            borderBottomWidth: 1,
                            borderBottomColor: 'rgba(226,232,240,0.8)',
                            borderBottomLeftRadius: 12,
                            borderBottomRightRadius: 12,
                            marginBottom: 32,
                            ...shadows.sm,
                        },
                    ]}
                >
                    <FriendBalanceRow
                        friend={item}
                        display={display}
                        onPress={handleFriendPress}
                        testID={`friend-${item.userId}`}
                        isLast={isLast}
                    />
                </View>
            );
        },
        [friendDisplays, friends.length, handleFriendPress],
    );

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
            <FlatList
                className="flex-1"
                data={dashboard && !showError ? friends : []}
                keyExtractor={(item) => item.userId}
                renderItem={renderFriendRow}
                ListHeaderComponent={listHeader}
                contentContainerClassName="pb-10"
                initialNumToRender={12}
                maxToRenderPerBatch={8}
                windowSize={7}
                removeClippedSubviews
                refreshControl={
                    <RefreshControl
                        refreshing={isManualRefreshing}
                        onRefresh={handleRefresh}
                        tintColor={colors.primary}
                    />
                }
            />
            {selectedFriend !== null ? (
                <FriendGroupBalancesSheet
                    visible
                    friend={selectedFriend}
                    currentUserId={currentUserId}
                    onClose={handleCloseFriendSheet}
                    onSelectGroup={handleSelectGroup}
                />
            ) : null}
        </SafeAreaView>
    );
}
