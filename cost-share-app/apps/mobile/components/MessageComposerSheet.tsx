/**
 * MessageComposerSheet — bottom modal with multi-line input + send button.
 * Used for both creating and editing messages.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    Modal,
    Pressable,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppIcon } from './AppIcon';
import { useRtlLayout } from '../hooks/useRtlLayout';
import { colors } from '../theme';

interface MessageComposerSheetProps {
    visible: boolean;
    mode: 'create' | 'edit';
    initialBody?: string;
    onSubmit: (body: string) => Promise<void> | void;
    onClose: () => void;
}

export function MessageComposerSheet({
    visible,
    mode,
    initialBody,
    onSubmit,
    onClose,
}: MessageComposerSheetProps) {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();
    const [body, setBody] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const inputRef = useRef<TextInput | null>(null);

    useEffect(() => {
        if (visible) {
            setBody(initialBody ?? '');
            const id = setTimeout(() => inputRef.current?.focus(), 80);
            return () => clearTimeout(id);
        }
    }, [visible, initialBody]);

    const trimmed = body.trim();
    const sendDisabled = submitting || trimmed.length === 0;

    const handleSubmit = async () => {
        if (sendDisabled) return;
        try {
            setSubmitting(true);
            await onSubmit(trimmed);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <Pressable onPress={onClose} className="flex-1 bg-black/40 justify-center px-4">
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                >
                    <Pressable onPress={() => {}} className="bg-white rounded-2xl p-3">
                        {mode === 'edit' && (
                            <Text className="text-sm font-semibold text-gray-700 px-1 pb-2">
                                {t('groups.message.editTitle')}
                            </Text>
                        )}
                        <View className="flex-row items-center">
                            <View className="flex-1 bg-gray-100 rounded-2xl px-3 py-2 mr-2 justify-center">
                                <TextInput
                                    ref={inputRef}
                                    value={body}
                                    onChangeText={setBody}
                                    placeholder={t('groups.message.composerPlaceholder')}
                                    placeholderTextColor={colors.gray400}
                                    multiline
                                    maxLength={2000}
                                    textAlignVertical="center"
                                    className="text-sm text-gray-900"
                                    style={{ minHeight: 32, maxHeight: 120 }}
                                    testID="composer-input"
                                />
                            </View>
                            <TouchableOpacity
                                onPress={handleSubmit}
                                disabled={sendDisabled}
                                accessibilityRole="button"
                                accessibilityLabel={t('groups.message.send')}
                                style={{ opacity: sendDisabled ? 0.4 : 1 }}
                                className="w-11 h-11 rounded-full bg-primary items-center justify-center"
                                testID="composer-send"
                            >
                                <View
                                    style={
                                        mode !== 'edit' && isRtl
                                            ? { transform: [{ scaleX: -1 }] }
                                            : undefined
                                    }
                                >
                                    <AppIcon
                                        name={mode === 'edit' ? 'checkmark' : 'send'}
                                        size={18}
                                        color="#fff"
                                    />
                                </View>
                            </TouchableOpacity>
                        </View>
                    </Pressable>
                </KeyboardAvoidingView>
            </Pressable>
        </Modal>
    );
}
