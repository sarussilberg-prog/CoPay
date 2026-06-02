/**
 * ProfileImagePicker
 * Tap to pick or replace a profile photo from the photo library
 */

import { Text } from './AppText';
import React, { useCallback } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { platformAlert } from '../lib/platformAlert';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { MemberAvatar } from './MemberAvatar';
import { AppIcon } from './AppIcon';
import { colors } from '../theme';

interface ProfileImagePickerProps {
    name: string;
    avatarUrl?: string | null;
    localUri?: string | null;
    onChange: (uri: string | null) => void;
}

export function ProfileImagePicker({
    name,
    avatarUrl,
    localUri,
    onChange,
}: ProfileImagePickerProps) {
    const { t } = useTranslation();
    const displayUri = localUri ?? avatarUrl ?? undefined;

    const pickImage = useCallback(async () => {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
            platformAlert(t('profile.imagePermissionTitle'), t('profile.imagePermissionMessage'));
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
        });

        if (!result.canceled && result.assets[0]?.uri) {
            onChange(result.assets[0].uri);
        }
    }, [onChange, t]);

    const removeImage = useCallback(() => {
        onChange(null);
    }, [onChange]);

    return (
        <View className="mb-4 items-center">
            <Text className="text-sm font-medium text-gray-700 mb-3 self-start">
                {t('profile.profileImage')}
            </Text>

            <TouchableOpacity
                onPress={pickImage}
                activeOpacity={0.7}
                testID="profile-image-picker"
            >
                <View className="relative">
                    <MemberAvatar
                        name={name}
                        avatarUrl={displayUri}
                        size="lg"
                        testID="profile-image-picker-avatar"
                    />
                    <View className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary justify-center items-center border-2 border-white">
                        <AppIcon name="camera" size={16} color={colors.white} />
                    </View>
                </View>
            </TouchableOpacity>

            <Text className="text-xs text-gray-500 mt-2">
                {t('profile.tapToChangeImage')}
            </Text>

            {displayUri && (
                <TouchableOpacity
                    onPress={removeImage}
                    className="mt-2"
                    testID="profile-image-remove"
                >
                    <Text className="text-sm text-red-500">{t('profile.removeImage')}</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}
