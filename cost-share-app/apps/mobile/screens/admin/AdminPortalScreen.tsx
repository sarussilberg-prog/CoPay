import React from 'react';
import { ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { SettingsSection } from '../../components/settings/SettingsSection';
import { SettingsRow } from '../../components/settings/SettingsRow';

export function AdminPortalScreen() {
    const { t } = useTranslation();
    const navigation = useNavigation<any>();

    return (
        <ScrollView className="flex-1 bg-slate-50">
            <SettingsSection title={t('admin.portal.sectionLabel')}>
                <SettingsRow
                    iconName="trash-outline"
                    label={t('admin.portal.deletedUsersRow')}
                    variant="chevron"
                    onPress={() => navigation.navigate('AdminDeletedUsers')}
                    testID="admin-portal-deleted-users"
                />
            </SettingsSection>
        </ScrollView>
    );
}
