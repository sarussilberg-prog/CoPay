/**
 * EditProfileScreen
 * Form to edit user profile
 * Uses NativeWind styling only, full i18n support
 */

import React, { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useAppStore } from '../../store';
import { useLoading } from '../../hooks/useLoading';
import { updateUser } from '../../services/users.service';
import { uploadProfileImage } from '../../services/storage.service';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { CurrencyPicker } from '../../components/CurrencyPicker';
import { ProfileImagePicker } from '../../components/ProfileImagePicker';
import { InviteLinkBlock } from '../../components/InviteLinkBlock';
import { useAppLanguage } from '../../hooks/useRtlLayout';
import { defaultCurrencyForAppLanguage } from '../../lib/appDefaultCurrency';
import Toast from 'react-native-toast-message';
import { getAvatarUrl, getDisplayName } from '../../lib/userDisplay';

export function EditProfileScreen() {
    const { t } = useTranslation();
    const navigation = useNavigation<any>();
    const { isLoading, startLoading, stopLoading } = useLoading();
    const currentUser = useAppStore((state) => state.currentUser);
    const appLanguage = useAppLanguage();

    // TODO(account-deletion): self-edit form initial value uses raw name on purpose so empty names stay empty (not the unknown-user fallback). Keep raw read.
    const [name, setName] = useState(currentUser?.name || '');
    const [phone, setPhone] = useState(currentUser?.phone || '');
    const [currency, setCurrency] = useState(
        () =>
            currentUser?.defaultCurrency ?? defaultCurrencyForAppLanguage(appLanguage),
    );
    const [localAvatarUri, setLocalAvatarUri] = useState<string | null>(null);
    const [avatarRemoved, setAvatarRemoved] = useState(false);
    const [nameError, setNameError] = useState('');

    const handleAvatarChange = (uri: string | null) => {
        setLocalAvatarUri(uri);
        setAvatarRemoved(uri === null);
    };

    const validateForm = (): boolean => {
        if (!name.trim()) {
            setNameError(t('profile.nameRequired'));
            return false;
        }
        setNameError('');
        return true;
    };

    const handleSave = async () => {
        if (!validateForm()) return;
        if (!currentUser) return;

        startLoading();
        let nextAvatarUrl: string | undefined = avatarRemoved ? undefined : (getAvatarUrl(currentUser) ?? undefined);

        if (localAvatarUri) {
            const uploadedUrl = await uploadProfileImage(currentUser.id, localAvatarUri);
            if (!uploadedUrl) {
                stopLoading();
                Toast.show({
                    type: 'error',
                    text1: t('common.error'),
                    text2: t('profile.imageUploadError'),
                });
                return;
            }
            nextAvatarUrl = uploadedUrl;
        }

        const result = await updateUser(currentUser.id, {
            name: name.trim(),
            phone: phone.trim() || undefined,
            defaultCurrency: currency,
            avatarUrl: avatarRemoved ? '' : nextAvatarUrl,
        });
        stopLoading();

        if (result) {
            Toast.show({
                type: 'success',
                text1: t('common.success'),
                text2: t('profile.profileUpdated'),
            });
            navigation.goBack();
        } else {
            Toast.show({
                type: 'error',
                text1: t('common.error'),
                text2: t('profile.updateError'),
            });
        }
    };

    return (
        <ScrollView className="flex-1 bg-slate-50">
            <View className="p-4">
                <ProfileImagePicker
                    name={name.trim() || getDisplayName(currentUser, t)}
                    avatarUrl={avatarRemoved ? null : getAvatarUrl(currentUser)}
                    localUri={localAvatarUri}
                    onChange={handleAvatarChange}
                />

                {/* Name */}
                <Input
                    label={t('profile.name')}
                    placeholder={t('profile.enterName')}
                    value={name}
                    onChangeText={(text) => {
                        setName(text);
                        if (nameError) setNameError('');
                    }}
                    error={nameError}
                />

                {/* Email (read-only) */}
                <Input
                    label={t('profile.email')}
                    value={currentUser?.email || ''}
                    editable={false}
                />

                {/* Phone */}
                <Input
                    label={t('profile.phone')}
                    placeholder={t('profile.enterPhone')}
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                />

                {/* Default Currency */}
                <CurrencyPicker
                    value={currency}
                    onChange={setCurrency}
                    label={t('profile.defaultCurrency')}
                />

                {/* Invite Link Block */}
                <View className="pt-4">
                    <InviteLinkBlock kind="friend" mode="expanded" />
                </View>

                {/* Actions */}
                <View className="mt-4 gap-2">
                    <Button
                        title={t('common.save')}
                        onPress={handleSave}
                        loading={isLoading}
                        disabled={isLoading}
                    />
                    <Button
                        title={t('common.cancel')}
                        onPress={() => navigation.goBack()}
                        variant="outline"
                    />
                </View>
            </View>
        </ScrollView>
    );
}
