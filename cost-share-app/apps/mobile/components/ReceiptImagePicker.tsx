/**
 * ReceiptImagePicker
 * Tap to attach a receipt photo to an expense (camera or library).
 */

import { Text } from './AppText';
import React, { useCallback } from 'react';
import { View, TouchableOpacity, Image, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { AppIcon } from './AppIcon';
import { colors } from '../theme';

interface ReceiptImagePickerProps {
    imageUrl?: string | null;
    localUri?: string | null;
    onChange: (uri: string | null) => void;
}

export function ReceiptImagePicker({
    imageUrl,
    localUri,
    onChange,
}: ReceiptImagePickerProps) {
    const { t } = useTranslation();
    const displayUri = localUri ?? imageUrl ?? null;

    const pickFromLibrary = useCallback(async () => {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
            Alert.alert(
                t('expenses.receiptPermissionTitle'),
                t('expenses.receiptLibraryPermissionMessage'),
            );
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            quality: 0.4,
        });

        if (!result.canceled && result.assets[0]?.uri) {
            onChange(result.assets[0].uri);
        }
    }, [onChange, t]);

    const takePhoto = useCallback(async () => {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
            Alert.alert(
                t('expenses.receiptPermissionTitle'),
                t('expenses.receiptCameraPermissionMessage'),
            );
            return;
        }

        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            quality: 0.4,
        });

        if (!result.canceled && result.assets[0]?.uri) {
            onChange(result.assets[0].uri);
        }
    }, [onChange, t]);

    const openPicker = useCallback(() => {
        Alert.alert(
            t('expenses.receipt'),
            undefined,
            [
                { text: t('expenses.takePhoto'), onPress: takePhoto },
                { text: t('expenses.chooseFromLibrary'), onPress: pickFromLibrary },
                { text: t('common.cancel'), style: 'cancel' },
            ],
            { cancelable: true },
        );
    }, [t, takePhoto, pickFromLibrary]);

    const removeImage = useCallback(() => {
        onChange(null);
    }, [onChange]);

    return (
        <View className="mb-4">
            <Text className="text-sm font-medium text-gray-700 mb-2">
                {t('expenses.receipt')}
            </Text>

            {displayUri ? (
                <View>
                    <TouchableOpacity
                        onPress={openPicker}
                        activeOpacity={0.8}
                        testID="receipt-image-picker"
                    >
                        <Image
                            source={{ uri: displayUri }}
                            className="w-full h-56 rounded-xl bg-gray-100"
                            resizeMode="cover"
                        />
                    </TouchableOpacity>
                    <View
                        className="mt-2 flex-row items-center"
                        style={{ gap: 12 }}
                    >
                        <TouchableOpacity
                            onPress={openPicker}
                            testID="receipt-image-replace"
                        >
                            <Text className="text-sm text-primary-dark font-medium">
                                {t('expenses.replaceReceipt')}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={removeImage}
                            testID="receipt-image-remove"
                        >
                            <Text className="text-sm text-red-500 font-medium">
                                {t('expenses.removeReceipt')}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            ) : (
                <TouchableOpacity
                    onPress={openPicker}
                    activeOpacity={0.7}
                    testID="receipt-image-picker"
                    className="border-2 border-dashed border-gray-300 rounded-xl px-4 py-6 items-center bg-white"
                >
                    <AppIcon name="camera" size={28} color={colors.gray500} />
                    <Text className="text-sm text-gray-600 mt-2">
                        {t('expenses.addReceipt')}
                    </Text>
                </TouchableOpacity>
            )}
        </View>
    );
}
