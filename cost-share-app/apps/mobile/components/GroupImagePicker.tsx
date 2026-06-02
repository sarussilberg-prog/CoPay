/**
 * GroupImagePicker
 * Tap to pick or replace a group image from the photo library
 */

import { Text } from './AppText';
import React, { useCallback } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { platformAlert } from '../lib/platformAlert';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { GroupType } from '@cost-share/shared';
import { GroupAvatar } from './GroupAvatar';
import { AppIcon } from './AppIcon';
import { colors } from '../theme';

interface GroupImagePickerProps {
    imageUrl?: string | null;
    localUri?: string | null;
    groupType?: GroupType;
    onChange: (uri: string | null) => void;
}

export function GroupImagePicker({
    imageUrl,
    localUri,
    groupType = 'general',
    onChange,
}: GroupImagePickerProps) {
    const { t } = useTranslation();
    const displayUri = localUri ?? imageUrl ?? null;

    const pickImage = useCallback(async () => {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
            platformAlert(t('groups.imagePermissionTitle'), t('groups.imagePermissionMessage'));
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
                {t('groups.groupImage')}
            </Text>

            <TouchableOpacity
                onPress={pickImage}
                activeOpacity={0.7}
                testID="group-image-picker"
            >
                <View className="relative">
                    <GroupAvatar
                        imageUrl={displayUri}
                        groupType={groupType}
                        size="lg"
                        testID="group-image-picker-avatar"
                    />
                    <View className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary justify-center items-center border-2 border-white">
                        <AppIcon name="camera" size={16} color={colors.white} />
                    </View>
                </View>
            </TouchableOpacity>

            <Text className="text-xs text-gray-500 mt-2">
                {t('groups.tapToChangeImage')}
            </Text>

            {displayUri && (
                <TouchableOpacity
                    onPress={removeImage}
                    className="mt-2"
                    testID="group-image-remove"
                >
                    <Text className="text-sm text-red-500">{t('groups.removeImage')}</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}
