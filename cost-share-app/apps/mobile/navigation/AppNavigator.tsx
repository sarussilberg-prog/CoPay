/**
 * App Navigator
 * Stack and tab navigation structure
 */

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { AppIcon, AppIconName } from '../components/AppIcon';
import { colors } from '../theme';

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
import { EditExpenseScreen } from '../screens/expenses/EditExpenseScreen';
import { ExpenseDetailScreen } from '../screens/expenses/ExpenseDetailScreen';
import { BalancesScreen } from '../screens/balances/BalancesScreen';
import { SettleUpScreen } from '../screens/balances/SettleUpScreen';
import { SettlementHistoryScreen } from '../screens/balances/SettlementHistoryScreen';
import { ActivityFeedScreen } from '../screens/activity/ActivityFeedScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { EditProfileScreen } from '../screens/profile/EditProfileScreen';
import { SettingsScreen } from '../screens/profile/SettingsScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const stackScreenOptions = {
    animation: 'slide_from_right' as const,
    animationDuration: 250,
    headerTintColor: colors.primary,
};

function GroupsStack() {
    const { t } = useTranslation();

    return (
        <Stack.Navigator screenOptions={stackScreenOptions}>
            <Stack.Screen
                name="GroupsList"
                component={GroupsListScreen}
                options={{ title: t('tabs.groups'), headerShown: false }}
            />
            <Stack.Screen
                name="GroupDetail"
                component={GroupDetailScreen}
                options={{ title: t('groups.title') }}
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
                options={{ title: t('groups.members') }}
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
                component={EditExpenseScreen}
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
                name="SettleUp"
                component={SettleUpScreen}
                options={{ title: t('balances.settleUp') }}
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

    return (
        <Stack.Navigator screenOptions={stackScreenOptions}>
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

    return (
        <Stack.Navigator screenOptions={stackScreenOptions}>
            <Stack.Screen
                name="ProfileMain"
                component={ProfileScreen}
                options={{ title: t('dashboard.appTitle'), headerTitleAlign: 'center' }}
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
        </Stack.Navigator>
    );
}

export function AppNavigator() {
    const { t } = useTranslation();

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
