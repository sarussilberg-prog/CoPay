import React, { useCallback, useEffect, useState } from 'react';
import { View, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { showSuccessMessage } from '../../lib/appToast';
import { handleError } from '../../lib/handleError';
import { Text } from '../../components/AppText';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { listDeletedAccounts, restoreDeletedAccount, type DeletedAccount } from '../../services/admin.service';
import { toDate } from '../../lib/dateUtils';

export function AdminDeletedUsersScreen() {
    const { t } = useTranslation();
    const [rows, setRows] = useState<DeletedAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [pending, setPending] = useState<DeletedAccount | null>(null);

    const load = useCallback(async () => {
        const next = await listDeletedAccounts();
        setRows(next);
    }, []);

    useEffect(() => {
        (async () => {
            await load();
            setLoading(false);
        })();
    }, [load]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try { await load(); } finally { setRefreshing(false); }
    }, [load]);

    const onConfirmRestore = useCallback(async () => {
        if (!pending) return;
        const target = pending;
        setPending(null);
        const result = await restoreDeletedAccount(target.userId);
        if (result.ok) {
            showSuccessMessage('admin.deletedUsers.restoreSuccess');
            await load();
        } else {
            handleError(new Error(`restoreDeletedAccount failed: ${result.error ?? 'unknown'}`), {
                toast: { titleKey: result.error ?? 'admin.deletedUsers.restoreError' },
                tags: { service: 'admin', op: 'restoreDeletedAccount' },
                extra: { userId: target.userId, errorKey: result.error },
            });
        }
    }, [pending, t, load]);

    if (!loading && rows.length === 0) {
        return (
            <View className="flex-1 items-center justify-center bg-slate-50 px-8">
                <Text className="text-gray-500 text-center">{t('admin.deletedUsers.empty')}</Text>
            </View>
        );
    }

    return (
        <View className="flex-1 bg-slate-50">
            <FlatList
                data={rows}
                keyExtractor={(r) => r.userId}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                contentContainerStyle={{ paddingVertical: 12 }}
                renderItem={({ item }) => (
                    <View className="flex-row items-center bg-white px-4 py-3 mx-3 mb-2 rounded-xl">
                        <View className="flex-1">
                            <Text className="text-base text-gray-900">{item.email}</Text>
                            <Text className="text-xs text-gray-500 mt-0.5">
                                {t('admin.deletedUsers.deletedAtRelative', {
                                    when: toDate(item.deletedAt).toLocaleDateString(),
                                })}
                            </Text>
                        </View>
                        <TouchableOpacity
                            onPress={() => setPending(item)}
                            testID={`admin-restore-${item.userId}`}
                            className="bg-primary px-4 py-2 rounded-lg"
                        >
                            <Text className="text-white font-medium">{t('admin.deletedUsers.restoreCta')}</Text>
                        </TouchableOpacity>
                    </View>
                )}
            />
            <ConfirmDialog
                visible={pending !== null}
                title={t('admin.deletedUsers.confirmTitle', { email: pending?.email ?? '' })}
                message={t('admin.deletedUsers.confirmMessage')}
                confirmText={t('admin.deletedUsers.restoreCta')}
                cancelText={t('common.cancel')}
                onConfirm={onConfirmRestore}
                onCancel={() => setPending(null)}
                confirmTestID="admin-restore-confirm"
            />
        </View>
    );
}
