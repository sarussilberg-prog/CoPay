import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { View, ScrollView, RefreshControl, TouchableOpacity, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { UserDashboard, FriendBalance } from '@cost-share/shared';
import { useAppStore } from '../../store';
import { fetchDashboard } from '../../services/dashboard.service';
import { AppIcon } from '../../components/AppIcon';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { EmptyState } from '../../components/EmptyState';
import { ProfileHeaderRow } from '../../components/dashboard/ProfileHeaderRow';
import { BalanceHeroCard } from '../../components/dashboard/BalanceHeroCard';
import { StatTile } from '../../components/dashboard/StatTile';
import { FriendBalanceRow } from '../../components/dashboard/FriendBalanceRow';
import { colors } from '../../theme';

export function ProfileScreen() {
    const { t } = useTranslation();
    const navigation = useNavigation<any>();
    const currentUser = useAppStore((s) => s.currentUser);

    const [dashboard, setDashboard] = useState<UserDashboard | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const load = useCallback(async () => {
        const data = await fetchDashboard();
        if (data) { setDashboard(data); setError(false); } else { setError(true); }
        setLoading(false);
        setRefreshing(false);
    }, []);

    useEffect(() => { void load(); }, [load]);

    const handleRefresh = useCallback(() => { setRefreshing(true); void load(); }, [load]);
    const handleOpenSettings = useCallback(() => navigation.navigate('Settings'), [navigation]);
    const handleEditProfile = useCallback(() => navigation.navigate('EditProfile'), [navigation]);

    useLayoutEffect(() => {
        navigation.setOptions({
            title: t('dashboard.appTitle'),
            headerTitleAlign: 'center',
            headerRight: () => (
                <TouchableOpacity
                    onPress={handleOpenSettings}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    testID="profile-settings-button"
                    className="mr-2"
                >
                    <AppIcon name="settings-outline" size={24} color={colors.primary} />
                </TouchableOpacity>
            ),
        });
    }, [navigation, handleOpenSettings, t]);

    const handleFriendPress = useCallback((friend: FriendBalance) => {
        const firstGroup = friend.sharedGroupIds[0];
        if (!firstGroup) return;
        navigation.navigate('Groups', { screen: 'GroupDetail', params: { groupId: firstGroup } });
    }, [navigation]);

    if (loading && !dashboard) return <LoadingIndicator />;

    return (
        <ScrollView
            className="flex-1 bg-slate-50"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        >
            <ProfileHeaderRow
                name={currentUser?.name || t('common.unknown')}
                email={currentUser?.email}
                avatarUrl={currentUser?.avatarUrl}
                onEditPress={handleEditProfile}
            />

            {error || !dashboard ? (
                <EmptyState
                    iconName="alert-circle-outline"
                    title={t('dashboard.loadError')}
                    message={t('common.networkError')}
                    actionTitle={t('common.retry')}
                    onAction={handleRefresh}
                />
            ) : (
                <>
                    <BalanceHeroCard summary={dashboard.balanceSummary} />

                    <View className="flex-row gap-3 mx-4 mb-4">
                        <StatTile
                            iconName="checkmark-circle-outline"
                            label={t('dashboard.closedGroups')}
                            value={dashboard.stats.closedGroupsCount}
                            onPress={() => navigation.navigate('Groups', { screen: 'GroupsList' })}
                            testID="stat-closed"
                        />
                        <StatTile
                            iconName="people-outline"
                            label={t('dashboard.activeGroups')}
                            value={dashboard.stats.activeGroupsCount}
                            onPress={() => navigation.navigate('Groups', { screen: 'GroupsList' })}
                            testID="stat-active"
                        />
                    </View>

                    {dashboard.friends.length > 0 ? (
                        <View className="mb-8">
                            <Text className="px-5 mb-2 text-sm font-semibold text-gray-500">{t('dashboard.friends')}</Text>
                            {dashboard.friends.map(f => (
                                <FriendBalanceRow key={f.userId} friend={f} onPress={handleFriendPress} testID={`friend-${f.userId}`} />
                            ))}
                        </View>
                    ) : null}
                </>
            )}
        </ScrollView>
    );
}
