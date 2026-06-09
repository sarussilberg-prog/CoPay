/**
 * App Navigator
 * Root Stack wraps the bottom Tab navigator. Screens that should not show
 * the tab bar (Settings + admin sub-screens, Create/Edit group, Add/Edit
 * expense) live on the Root Stack so they push above the tab navigator and
 * cover the tab bar naturally — no `tabBarStyle: 'none'` toggling, no
 * transition flash.
 */

import React, { useEffect } from 'react';
import { TouchableOpacity, View, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute, type ParamListBase, type RouteProp } from '@react-navigation/native';
import {
    createNativeStackNavigator,
    type NativeStackNavigationOptions,
} from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useRtlLayout } from '../hooks/useRtlLayout';
import { AppIcon, AppIconName } from '../components/AppIcon';
import { colors } from '../theme';
import { useInviteRedemption } from '../hooks/useInviteRedemption';
import { usePendingNavigationFlush } from '../hooks/usePendingNavigationFlush';
import { prefetchGroupsList } from '../hooks/queries/prefetchGroupsList';
import { prefetchProfileWarmup } from '../hooks/queries/prefetchProfileWarmup';
import { prefetchAddExpensePrerequisitesForAllGroups } from '../hooks/queries/prefetchAddExpenseForAllGroups';
import { useActivityUnreadCount } from '../hooks/queries/useActivityUnreadCount';

function HeaderBackButton({ onPress }: { onPress: () => void }) {
    const isRtl = useRtlLayout();
    return (
        <TouchableOpacity
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{ paddingHorizontal: 4, paddingVertical: 4 }}
        >
            <AppIcon
                name={isRtl ? 'chevron-forward' : 'chevron-back'}
                size={26}
                color={colors.primary}
            />
        </TouchableOpacity>
    );
}

function tabBarIcon(
    focusedName: AppIconName,
    outlineName: AppIconName
): (props: { color: string; size: number; focused: boolean }) => React.ReactElement {
    return ({ color, size, focused }) => (
        <AppIcon name={focused ? focusedName : outlineName} size={size} color={color} />
    );
}
import { GroupsListScreen } from '../screens/groups/GroupsListScreen';
import { GroupDetailScreen } from '../screens/groups/GroupDetailScreen';
import { CreateGroupScreen } from '../screens/groups/CreateGroupScreen';
import { GroupMembersScreen } from '../screens/groups/GroupMembersScreen';
import { GroupNoteScreen } from '../screens/groups/GroupNoteScreen';
import { ExpenseListScreen } from '../screens/expenses/ExpenseListScreen';
import { AddExpenseScreen } from '../screens/expenses/AddExpenseScreen';
import { ExpenseDetailScreen } from '../screens/expenses/ExpenseDetailScreen';
import { BalancesScreen } from '../screens/balances/BalancesScreen';
import { SettleUpListScreen } from '../screens/balances/SettleUpListScreen';
import { SettlementHistoryScreen } from '../screens/balances/SettlementHistoryScreen';
import { ActivityFeedScreen } from '../screens/activity/ActivityFeedScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { EditProfileScreen } from '../screens/profile/EditProfileScreen';
import { SettingsScreen } from '../screens/profile/SettingsScreen';
import { FriendsScreen } from '../screens/profile/FriendsScreen';
import { FindFriendsScreen } from '../screens/profile/FindFriendsScreen';
import { AdminPortalScreen } from '../screens/admin/AdminPortalScreen';
import { AdminOnboardingPreviewScreen } from '../screens/admin/AdminOnboardingPreviewScreen';
import { AdminDeletedUsersScreen } from '../screens/admin/AdminDeletedUsersScreen';
import { AdminErrorsScreen } from '../screens/admin/AdminErrorsScreen';
import { AdminErrorDetailScreen } from '../screens/admin/AdminErrorDetailScreen';
import { AdminErrorEventScreen } from '../screens/admin/AdminErrorEventScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const RootStack = createNativeStackNavigator();

function stackScreenOptions(isRtl: boolean): NativeStackNavigationOptions {
    return {
        animation: isRtl ? 'slide_from_left' : 'slide_from_right',
        animationDuration: 250,
        headerTintColor: colors.primary,
        headerBackTitle: '',
    };
}

function buildStackScreenOptions(isRtl: boolean) {
    const base = stackScreenOptions(isRtl);
    return ({ navigation }: { navigation: { canGoBack: () => boolean; goBack: () => void } }) => ({
        ...base,
        headerLeft: navigation.canGoBack()
            ? () => <HeaderBackButton onPress={() => navigation.goBack()} />
            : undefined,
    });
}

/** Pop nested stack to its root when the already-focused tab is pressed again. */
function tabPopToTopOnPress(initialScreen: string) {
    return ({
        navigation,
        route,
    }: {
        navigation: BottomTabNavigationProp<ParamListBase>;
        route: RouteProp<ParamListBase>;
    }) => ({
        tabPress: (e: { preventDefault: () => void }) => {
            if (!navigation.isFocused()) return;

            const focusedRouteName = getFocusedRouteNameFromRoute(route) ?? initialScreen;
            if (focusedRouteName !== initialScreen) {
                e.preventDefault();
                navigation.navigate(route.name, { screen: initialScreen });
            }
        },
    });
}

function GroupsStack() {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();

    return (
        <Stack.Navigator screenOptions={buildStackScreenOptions(isRtl)}>
            <Stack.Screen
                name="GroupsList"
                component={GroupsListScreen}
                options={{ title: t('tabs.groups'), headerShown: false }}
            />
            <Stack.Screen
                name="GroupDetail"
                component={GroupDetailScreen}
                options={{ headerShown: false }}
            />
            <Stack.Screen
                name="GroupMembers"
                component={GroupMembersScreen}
                options={{ title: t('groups.members.title') }}
            />
            <Stack.Screen
                name="GroupNote"
                component={GroupNoteScreen}
                options={{ title: t('groups.note.title') }}
            />
            <Stack.Screen
                name="ExpenseList"
                component={ExpenseListScreen}
                options={{ title: t('expenses.title') }}
            />
            <Stack.Screen
                name="ExpenseDetail"
                component={ExpenseDetailScreen}
                options={{ title: t('expenses.expenseDetail') }}
            />
            <Stack.Screen
                name="Balances"
                component={BalancesScreen}
                options={{ title: t('balances.title') }}
            />
            <Stack.Screen
                name="SettleUpList"
                component={SettleUpListScreen}
                options={{ title: t('settleUp.title') }}
            />
            <Stack.Screen
                name="SettlementHistory"
                component={SettlementHistoryScreen}
                options={{ title: t('balances.settlementHistory') }}
            />
        </Stack.Navigator>
    );
}

function ActivityStack() {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();

    return (
        <Stack.Navigator screenOptions={buildStackScreenOptions(isRtl)}>
            <Stack.Screen
                name="ActivityFeed"
                component={ActivityFeedScreen}
                options={{ headerShown: false }}
            />
            <Stack.Screen
                name="ExpenseDetail"
                component={ExpenseDetailScreen}
                options={{ title: t('expenses.expenseDetail') }}
            />
        </Stack.Navigator>
    );
}

function ProfileStack() {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();

    return (
        <Stack.Navigator screenOptions={buildStackScreenOptions(isRtl)}>
            <Stack.Screen
                name="ProfileMain"
                component={ProfileScreen}
                options={{ headerShown: false }}
            />
            <Stack.Screen
                name="EditProfile"
                component={EditProfileScreen}
                options={{ title: t('profile.editProfile') }}
            />
            <Stack.Screen
                name="Friends"
                component={FriendsScreen}
                options={{ title: t('friends.title') }}
            />
            <Stack.Screen
                name="FindFriends"
                component={FindFriendsScreen}
                options={{ title: t('friends.find.title') }}
            />
        </Stack.Navigator>
    );
}

function MainTabs() {
    const { t } = useTranslation();
    const { data: unreadCount = 0 } = useActivityUnreadCount();

    return (
        <Tab.Navigator
            initialRouteName="Groups"
            screenOptions={{
                tabBarActiveTintColor: colors.primary,
                tabBarInactiveTintColor: colors.gray400,
                headerShown: false,
            }}
        >
            <Tab.Screen
                name="Profile"
                component={ProfileStack}
                listeners={tabPopToTopOnPress('ProfileMain')}
                options={{
                    tabBarLabel: t('tabs.profile'),
                    tabBarIcon: tabBarIcon('person', 'person-outline'),
                }}
            />
            <Tab.Screen
                name="Activity"
                component={ActivityStack}
                listeners={tabPopToTopOnPress('ActivityFeed')}
                options={{
                    tabBarLabel: t('tabs.activity'),
                    tabBarIcon: ({ color, size, focused }) => (
                        <View>
                            <AppIcon
                                name={focused ? 'time' : 'time-outline'}
                                size={size}
                                color={color}
                            />
                            {unreadCount > 0 && (
                                <View
                                    style={{
                                        position: 'absolute',
                                        top: -6,
                                        right: -10,
                                        minWidth: 16,
                                        height: 16,
                                        paddingHorizontal: 4,
                                        borderRadius: 8,
                                        backgroundColor: colors.primaryExtraLight,
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                    }}
                                >
                                    <Text
                                        style={{
                                            color: colors.primaryDark,
                                            fontSize: 10,
                                            fontWeight: '600',
                                            lineHeight: 12,
                                        }}
                                    >
                                        {unreadCount > 99 ? '99+' : unreadCount}
                                    </Text>
                                </View>
                            )}
                        </View>
                    ),
                }}
            />
            <Tab.Screen
                name="Groups"
                component={GroupsStack}
                listeners={tabPopToTopOnPress('GroupsList')}
                options={{
                    tabBarLabel: t('tabs.groups'),
                    tabBarIcon: tabBarIcon('people', 'people-outline'),
                }}
            />
        </Tab.Navigator>
    );
}

export function AppNavigator() {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();
    useInviteRedemption();
    usePendingNavigationFlush();

    useEffect(() => {
        prefetchGroupsList();
        prefetchProfileWarmup();
        // Fire-and-forget warm-up: any group that's already in the cache
        // gets its members + profiles fetched so AddExpense works offline
        // without ever opening the screen online first. prefetchGroupsList
        // populates the groups cache asynchronously, so we also retry after
        // a short delay to catch the post-fetch state.
        prefetchAddExpensePrerequisitesForAllGroups();
        const retry = setTimeout(
            () => prefetchAddExpensePrerequisitesForAllGroups(),
            1000,
        );
        return () => clearTimeout(retry);
    }, []);

    return (
        <RootStack.Navigator screenOptions={buildStackScreenOptions(isRtl)}>
            <RootStack.Screen
                name="Main"
                component={MainTabs}
                options={{ headerShown: false }}
            />

            <RootStack.Screen
                name="Settings"
                component={SettingsScreen}
                options={{ title: t('settings.title') }}
            />
            <RootStack.Screen
                name="AdminPortal"
                component={AdminPortalScreen}
                options={{ title: t('admin.portal.title') }}
            />
            <RootStack.Screen
                name="AdminDeletedUsers"
                component={AdminDeletedUsersScreen}
                options={{ title: t('admin.deletedUsers.title') }}
            />
            <RootStack.Screen
                name="AdminOnboardingPreview"
                component={AdminOnboardingPreviewScreen}
                options={{ headerShown: false }}
            />
            <RootStack.Screen
                name="AdminErrors"
                component={AdminErrorsScreen}
                options={{ title: t('admin.errors.screenTitle') }}
            />
            <RootStack.Screen
                name="AdminErrorDetail"
                component={AdminErrorDetailScreen}
                options={({ route }) => ({
                    title:
                        (route.params as { title?: string } | undefined)?.title ??
                        t('admin.errors.detailTitle'),
                })}
            />
            <RootStack.Screen
                name="AdminErrorEvent"
                component={AdminErrorEventScreen}
                options={{ title: t('admin.errors.eventTitle') }}
            />

            <RootStack.Screen
                name="CreateGroup"
                component={CreateGroupScreen}
                options={{ headerShown: false }}
            />
            <RootStack.Screen
                name="EditGroup"
                component={CreateGroupScreen}
                options={{ headerShown: false }}
            />

            <RootStack.Screen
                name="AddExpense"
                component={AddExpenseScreen}
                options={{ headerShown: false }}
            />
            <RootStack.Screen
                name="EditExpense"
                component={AddExpenseScreen}
                options={{ headerShown: false }}
            />
        </RootStack.Navigator>
    );
}
