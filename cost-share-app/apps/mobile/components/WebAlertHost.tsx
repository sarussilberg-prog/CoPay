/**
 * Renders multi-option alerts on web (Alert.alert ignores extra buttons there).
 */

import React, { useEffect, useState } from 'react';
import { Modal, Pressable, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from './AppText';
import {
    registerWebAlertListener,
    type PlatformAlertButton,
} from '../lib/platformAlert';

type ActiveAlert = {
    title: string;
    message?: string;
    buttons: PlatformAlertButton[];
};

export function WebAlertHost() {
    const { t } = useTranslation();
    const [active, setActive] = useState<ActiveAlert | null>(null);

    useEffect(() => {
        registerWebAlertListener(request => {
            const buttons = request.buttons?.length ? request.buttons : [{ text: t('common.ok') }];
            setActive({
                title: request.title,
                message: request.message,
                buttons,
            });
        });
        return () => registerWebAlertListener(null);
    }, [t]);

    if (!active) return null;

    const dismiss = () => setActive(null);

    const handlePress = (button: PlatformAlertButton) => {
        dismiss();
        button.onPress?.();
    };

    return (
        <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
            <Pressable className="flex-1 bg-black/50 justify-center items-center p-4" onPress={dismiss}>
                <Pressable
                    onPress={e => e.stopPropagation()}
                    className="bg-white rounded-2xl p-6 w-full max-w-sm"
                >
                    <Text className="text-xl font-bold text-gray-900 mb-2">{active.title}</Text>
                    {active.message ? (
                        <Text className="text-base text-gray-600 mb-4">{active.message}</Text>
                    ) : null}
                    <View className="gap-2">
                        {active.buttons.map((button, index) => {
                            const isDestructive = button.style === 'destructive';
                            const isCancel = button.style === 'cancel';
                            let buttonClass = 'bg-blue-500';
                            let labelClass = 'text-white';
                            if (isDestructive) {
                                buttonClass = 'bg-red-500';
                            } else if (isCancel) {
                                buttonClass = 'bg-gray-100';
                                labelClass = 'text-gray-700';
                            }
                            return (
                                <TouchableOpacity
                                    key={`${button.text ?? index}`}
                                    onPress={() => handlePress(button)}
                                    className={`rounded-lg p-4 ${buttonClass}`}
                                    >
                                    <Text className={`text-center font-semibold ${labelClass}`}>
                                        {button.text ?? t('common.ok')}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}
