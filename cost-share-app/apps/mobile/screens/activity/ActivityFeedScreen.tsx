/**
 * ActivityFeedScreen
 * Cross-group activity feed (Supabase)
 */

import { Text } from '../../components/AppText';
import React, { useCallback, useMemo, useState } from 'react';
import { View, FlatList, RefreshControl, TextInput, TouchableOpacity, Modal, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { RecentActivity } from '@cost-share/shared';
import { useActivityQuery } from '../../hooks/queries/useActivityQuery';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { EmptyState } from '../../components/EmptyState';
import { ActivityItem } from '../../components/ActivityItem';
import { AppIcon, AppIconName } from '../../components/AppIcon';
import { APP_BRAND_TITLE, colors } from '../../theme';
import { resolveAutoTextInputStyle, useRtlLayout } from '../../hooks/useRtlLayout';

type ActivityFilter = 'all' | 'expense' | 'settlement';
type SortOption = 'dateDesc' | 'dateAsc' | 'amountDesc' | 'amountAsc';

export function ActivityFeedScreen() {
    const { t } = useTranslation();
    const navigation = useNavigation<any>();
    const isRtl = useRtlLayout();

    const {
        data,
        isLoading,
        isRefetching,
        isFetchingNextPage,
        fetchNextPage,
        hasNextPage,
        refetch,
    } = useActivityQuery();

    const [searchQuery, setSearchQuery] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [filter, setFilter] = useState<ActivityFilter>('all');
    const [sortBy, setSortBy] = useState<SortOption>('dateDesc');
    const [filterModalVisible, setFilterModalVisible] = useState(false);
    const [sortModalVisible, setSortModalVisible] = useState(false);

    const activities = useMemo(
        () => data?.pages.flatMap((page) => page.items) ?? [],
        [data],
    );

    const handleRefresh = useCallback(async () => {
        await refetch();
    }, [refetch]);

    const handleLoadMore = useCallback(() => {
        if (hasNextPage && !isFetchingNextPage) {
            void fetchNextPage();
        }
    }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

    const displayedActivities = useMemo(() => {
        let list = [...activities];

        if (filter !== 'all') {
            list = list.filter((item) => item.activityType === filter);
        }

        const query = searchQuery.trim().toLowerCase();
        if (query) {
            list = list.filter(
                (item) =>
                    item.description.toLowerCase().includes(query) ||
                    item.userName.toLowerCase().includes(query) ||
                    item.currency.toLowerCase().includes(query) ||
                    String(item.amount).includes(query),
            );
        }

        list.sort((a, b) => {
            switch (sortBy) {
                case 'dateAsc':
                    return (
                        new Date(a.activityDate).getTime() -
                        new Date(b.activityDate).getTime()
                    );
                case 'amountDesc':
                    return b.amount - a.amount;
                case 'amountAsc':
                    return a.amount - b.amount;
                case 'dateDesc':
                default:
                    return (
                        new Date(b.activityDate).getTime() -
                        new Date(a.activityDate).getTime()
                    );
            }
        });

        return list;
    }, [activities, filter, searchQuery, sortBy]);

    const handleActivityPress = useCallback(
        (activity: RecentActivity) => {
            if (activity.activityType === 'expense') {
                navigation.navigate('Groups', {
                    screen: 'ExpenseDetail',
                    params: { expenseId: activity.id, groupId: activity.groupId },
                });
                return;
            }
            if (activity.activityType === 'settlement') {
                navigation.navigate('Groups', {
                    screen: 'GroupDetail',
                    params: { groupId: activity.groupId },
                });
            }
        },
        [navigation],
    );

    const renderActivity = ({ item }: { item: RecentActivity }) => (
        <ActivityItem activity={item} onPress={handleActivityPress} />
    );

    const filterOptions: { key: ActivityFilter; label: string }[] = [
        { key: 'all', label: t('activity.filterAll') },
        { key: 'expense', label: t('activity.expense') },
        { key: 'settlement', label: t('activity.settlement') },
    ];

    const sortOptions: { key: SortOption; label: string }[] = [
        { key: 'dateDesc', label: t('activity.sortDateDesc') },
        { key: 'dateAsc', label: t('activity.sortDateAsc') },
        { key: 'amountDesc', label: t('activity.sortAmountDesc') },
        { key: 'amountAsc', label: t('activity.sortAmountAsc') },
    ];

    if (isLoading && activities.length === 0) {
        return <LoadingIndicator />;
    }

    return (
        <SafeAreaView className="flex-1 bg-slate-50" edges={['top']}>
            <View className="px-4 pt-2 pb-3">
                <Text
                    className="text-2xl font-bold text-gray-900 text-center"
                    accessibilityRole="header"
                >
                    {APP_BRAND_TITLE}
                </Text>
            </View>

            <View className="flex-row items-center gap-2 px-4 pb-3">
                <ToolbarButton
                    icon="search-outline"
                    label={t('activity.search')}
                    active={showSearch}
                    onPress={() => setShowSearch((prev) => !prev)}
                />
                <ToolbarButton
                    icon="funnel-outline"
                    label={t('activity.filter')}
                    active={filter !== 'all'}
                    onPress={() => setFilterModalVisible(true)}
                />
                <ToolbarButton
                    icon="swap-vertical-outline"
                    label={t('activity.sort')}
                    active={sortBy !== 'dateDesc'}
                    onPress={() => setSortModalVisible(true)}
                />
            </View>

            {showSearch && (
                <View className="px-4 pb-3">
                    <TextInput
                        className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900"
                        style={resolveAutoTextInputStyle(isRtl)}
                        placeholder={t('activity.searchPlaceholder')}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        autoCapitalize="none"
                        autoCorrect={false}
                        testID="activity-search-input"
                    />
                </View>
            )}

            <FlatList
                data={displayedActivities}
                keyExtractor={(item) => `${item.activityType}-${item.id}`}
                renderItem={renderActivity}
                contentContainerClassName="px-4 pb-4"
                refreshControl={
                    <RefreshControl
                        refreshing={isRefetching}
                        onRefresh={handleRefresh}
                        tintColor={colors.primary}
                    />
                }
                onEndReached={handleLoadMore}
                onEndReachedThreshold={0.3}
                ListFooterComponent={
                    isFetchingNextPage ? (
                        <ActivityIndicator className="py-4" color={colors.primary} />
                    ) : null
                }
                ListEmptyComponent={
                    <EmptyState
                        iconName="list-outline"
                        title={t('activity.noActivity')}
                        message={t('activity.noActivityMessage')}
                    />
                }
            />

            <OptionModal
                visible={filterModalVisible}
                title={t('activity.filter')}
                options={filterOptions}
                selectedKey={filter}
                onSelect={(key) => setFilter(key as ActivityFilter)}
                onClose={() => setFilterModalVisible(false)}
            />

            <OptionModal
                visible={sortModalVisible}
                title={t('activity.sort')}
                options={sortOptions}
                selectedKey={sortBy}
                onSelect={(key) => setSortBy(key as SortOption)}
                onClose={() => setSortModalVisible(false)}
            />
        </SafeAreaView>
    );
}

function ToolbarButton({
    icon,
    label,
    active,
    onPress,
}: {
    icon: AppIconName;
    label: string;
    active: boolean;
    onPress: () => void;
}) {
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.7}
            className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2.5 border ${
                active
                    ? 'bg-primary/10 border-primary'
                    : 'bg-white border-gray-200'
            }`}
        >
            <AppIcon
                name={icon}
                size={18}
                color={active ? colors.primary : colors.gray600}
            />
            <Text
                className={`text-sm font-medium ${
                    active ? 'text-primary' : 'text-gray-700'
                }`}
            >
                {label}
            </Text>
        </TouchableOpacity>
    );
}

function OptionModal<T extends string>({
    visible,
    title,
    options,
    selectedKey,
    onSelect,
    onClose,
}: {
    visible: boolean;
    title: string;
    options: { key: T; label: string }[];
    selectedKey: T;
    onSelect: (key: T) => void;
    onClose: () => void;
}) {
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable className="flex-1 bg-black/40 justify-end" onPress={onClose}>
                <Pressable className="bg-white rounded-t-2xl px-4 pt-4 pb-8" onPress={() => {}}>
                    <Text className="text-lg font-semibold text-gray-900 mb-3">{title}</Text>
                    {options.map((option) => {
                        const selected = option.key === selectedKey;
                        return (
                            <TouchableOpacity
                                key={option.key}
                                onPress={() => {
                                    onSelect(option.key);
                                    onClose();
                                }}
                                className="py-3 flex-row items-center justify-between border-b border-gray-100"
                            >
                                <Text
                                    className={`text-base ${
                                        selected ? 'text-primary font-semibold' : 'text-gray-800'
                                    }`}
                                >
                                    {option.label}
                                </Text>
                                {selected && (
                                    <AppIcon name="checkmark" size={20} color={colors.primary} />
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </Pressable>
            </Pressable>
        </Modal>
    );
}
