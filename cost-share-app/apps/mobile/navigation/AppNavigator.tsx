/**
 * App Navigator
 * Stack and tab navigation structure
 */

import React from 'react';
import { TouchableOpacity } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
    createNativeStackNavigator,
    type NativeStackNavigationOptions,
} from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useRtlLayout } from '../hooks/useRtlLayout';
import { AppIcon, AppIconName } from '../components/AppIcon';
import { colors } from '../theme';
import { useInviteRedemption } from '../hooks/useInviteRedemption';

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
import { EditGroupScreen } from '../screens/groups/EditGroupScreen';
import { GroupMembersScreen } from '../screens/groups/GroupMembersScreen';
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

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

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
                name="CreateGroup"
                component={CreateGroupScreen}
                options={{ title: t('groups.createGroup') }}
            />
            <Stack.Screen
                name="EditGroup"
                component={EditGroupScreen}
                options={{ title: t('groups.editGroup') }}
            />
            <Stack.Screen
                name="GroupMembers"
                component={GroupMembersScreen}
                options={{ title: t('groups.members.title') }}
            />
            <Stack.Screen
                name="ExpenseList"
                component={ExpenseListScreen}
                options={{ title: t('expenses.title') }}
            />
            <Stack.Screen
                name="AddExpense"
                component={AddExpenseScreen}
                options={{ title: t('expenses.addExpense') }}
            />
            <Stack.Screen
                name="EditExpense"
                component={AddExpenseScreen}
                options={{ title: t('expenses.editExpense') }}
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
            <Stack.Screen
                name="AddExpense"
                component={AddExpenseScreen}
                options={{ title: t('expenses.addExpense') }}
            />
            <Stack.Screen
                name="EditExpense"
                component={AddExpenseScreen}
                options={{ title: t('expenses.editExpense') }}
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
                name="Settings"
                component={SettingsScreen}
                options={{ title: t('settings.title') }}
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

export function AppNavigator() {
    const { t } = useTranslation();
    useInviteRedemption();

    return (
        <Tab.Navigator
            screenOptions={{
                tabBarActiveTintColor: colors.primary,
                tabBarInactiveTintColor: colors.gray400,
                headerShown: false,
            }}
        >
            <Tab.Screen
                name="Groups"
                component={GroupsStack}
                options={{
                    tabBarLabel: t('tabs.groups'),
                    tabBarIcon: tabBarIcon('people', 'people-outline'),
                }}
            />
            <Tab.Screen
                name="Activity"
                component={ActivityStack}
                options={{
                    tabBarLabel: t('tabs.activity'),
                    tabBarIcon: tabBarIcon('time', 'time-outline'),
                }}
            />
            <Tab.Screen
                name="Profile"
                component={ProfileStack}
                options={{
                    tabBarLabel: t('tabs.profile'),
                    tabBarIcon: tabBarIcon('person', 'person-outline'),
                }}
            />
        </Tab.Navigator>
    );
}
