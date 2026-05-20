/**
 * ActivityItem Component
 * Activity feed item for expenses and settlements
 * Uses NativeWind styling only, supports i18n
 */

import { Text } from './AppText';
import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { RecentActivity } from '@cost-share/shared';
import { AppIcon, AppIconName } from './AppIcon';
import { colors } from '../theme';

interface ActivityItemProps {
    activity: RecentActivity;
    onPress?: (activity: RecentActivity) => void;
}

export function ActivityItem({ activity, onPress }: ActivityItemProps) {
    const isExpense = activity.activityType === 'expense';
    const formattedDate = new Date(activity.activityDate).toLocaleDateString();
    const iconName: AppIconName = isExpense ? 'cash-outline' : 'swap-horizontal-outline';
    const iconColor = isExpense ? colors.primary : colors.success;

    return (
        <TouchableOpacity
            onPress={() => onPress?.(activity)}
            activeOpacity={onPress ? 0.7 : 1}
            className="bg-white rounded-xl p-4 mb-2 border border-gray-100"
        >
            <View className="flex-row items-center">
                {/* Activity Type Icon */}
                <View
                    className={`w-10 h-10 rounded-lg justify-center items-center mr-3 ${
                        isExpense ? 'bg-blue-50' : 'bg-green-50'
                    }`}
                >
                    <AppIcon
                        name={iconName}
                        size={22}
                        color={iconColor}
                        testID={`activity-icon-${activity.activityType}`}
                    />
                </View>

                {/* Activity Info */}
                <View className="flex-1">
                    <Text className="text-base font-medium text-gray-900">
                        {activity.description}
                    </Text>
                    <Text className="text-xs text-gray-400 mt-0.5">
                        {activity.userName} • {formattedDate}
                    </Text>
                </View>

                {/* Amount */}
                <Text className={`text-base font-semibold ${isExpense ? 'text-gray-900' : 'text-green-600'
                    }`}>
                    {activity.currency} {activity.amount.toFixed(2)}
                </Text>
            </View>
        </TouchableOpacity>
    );
}
