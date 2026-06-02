import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AdminPlatformMetrics } from '@cost-share/shared';
import { Text } from '../AppText';
import { StatGroup, StatTile, StatDivider } from '../dashboard/StatTile';

type Props = {
    metrics: AdminPlatformMetrics | null | undefined;
    isLoading?: boolean;
    isError?: boolean;
};

export function AdminMetricsPanel({ metrics, isLoading, isError }: Props) {
    const { t } = useTranslation();
    if (isLoading) {
        return (
            <View className="py-8 items-center" testID="admin-metrics-loading">
                <ActivityIndicator />
            </View>
        );
    }
    if (isError || !metrics) {
        return (
            <View className="mx-4 mb-4 p-4 rounded-xl bg-white border border-slate-200/80">
                <Text className="text-sm text-slate-500 text-center" testID="admin-metrics-error">
                    {t('admin.metrics.loadError')}
                </Text>
            </View>
        );
    }
    return (
        <View className="mb-2" testID="admin-metrics-panel">
            <Text className="text-xs font-semibold text-slate-500 uppercase tracking-wide mx-4 mb-2">
                {t('admin.metrics.sectionLabel')}
            </Text>
            <StatGroup>
                <StatTile
                    label={t('admin.metrics.registeredUsers')}
                    value={metrics.users.registered}
                    onPress={() => {}}
                    testID="admin-metric-users"
                />
                <StatDivider />
                <StatTile
                    label={t('admin.metrics.activeGroups')}
                    value={metrics.groups.active}
                    onPress={() => {}}
                    testID="admin-metric-groups-active"
                />
                <StatDivider />
                <StatTile
                    label={t('admin.metrics.archivedGroups')}
                    value={metrics.groups.archived}
                    onPress={() => {}}
                    testID="admin-metric-groups-archived"
                />
            </StatGroup>
            <Text className="text-xs text-slate-400 mx-4 mt-2 text-center">
                {t('admin.metrics.archiveFootnote')}
            </Text>
        </View>
    );
}
