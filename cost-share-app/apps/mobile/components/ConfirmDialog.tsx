/**
 * ConfirmDialog Component
 * Reusable confirmation dialog for destructive actions
 */

import { Text } from './AppText';
import React from 'react';
import { View, TouchableOpacity, Modal } from 'react-native';

interface ConfirmDialogProps {
    visible: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel: () => void;
    destructive?: boolean;
}

export function ConfirmDialog({
    visible,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    onConfirm,
    onCancel,
    destructive = false,
}: ConfirmDialogProps) {
    return (
        <Modal
            visible={visible}
            animationType="fade"
            transparent={true}
            onRequestClose={onCancel}
        >
            <View className="flex-1 bg-black/50 justify-center items-center p-4">
                <View className="bg-white rounded-2xl p-6 w-full max-w-sm">
                    {/* Title */}
                    <Text className="text-xl font-bold text-gray-900 mb-2">{title}</Text>

                    {/* Message */}
                    <Text className="text-base text-gray-600 mb-6">{message}</Text>

                    {/* Buttons */}
                    <View className="flex-row gap-3">
                        {/* Cancel Button */}
                        <TouchableOpacity
                            onPress={onCancel}
                            className="flex-1 bg-gray-100 rounded-lg p-4"
                        >
                            <Text className="text-center font-semibold text-gray-700">
                                {cancelText}
                            </Text>
                        </TouchableOpacity>

                        {/* Confirm Button */}
                        <TouchableOpacity
                            onPress={onConfirm}
                            className={`flex-1 rounded-lg p-4 ${destructive ? 'bg-red-500' : 'bg-blue-500'
                                }`}
                        >
                            <Text className="text-center font-semibold text-white">
                                {confirmText}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}
