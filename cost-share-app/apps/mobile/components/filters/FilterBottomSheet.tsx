/**
 * Shared bottom-sheet shell for filter & sort modals.
 * Changes apply immediately; no Apply button.
 */

import React, { type ReactNode } from 'react';
import {
    View,
    Modal,
    Pressable,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Text } from '../AppText';
import { AppIcon } from '../AppIcon';
import { colors } from '../../theme';
import { shadows } from '../../theme/shadows';

export interface FilterBottomSheetProps<T> {
    visible: boolean;
    filters: T;
    title: string;
    subtitle: string;
    onChange: (next: T) => void;
    onClose: () => void;
    onClear: () => T;
    children: (ctx: {
        filters: T;
        patch: (patch: Partial<T>) => void;
        replace: (next: T) => void;
    }) => ReactNode;
}

export function FilterBottomSheet<T>({
    visible,
    filters,
    title,
    subtitle,
    onChange,
    onClose,
    onClear,
    children,
}: FilterBottomSheetProps<T>) {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();

    const patch = (partial: Partial<T>) => {
        onChange({ ...filters, ...partial });
    };

    const replace = (next: T) => {
        onChange(next);
    };

    const handleClear = () => {
        onChange(onClear());
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.backdrop}>
                <Pressable
                    onPress={onClose}
                    style={StyleSheet.absoluteFillObject}
                    accessibilityRole="button"
                    accessibilityLabel={t('groups.filters.close')}
                />
                <View style={[styles.sheet, shadows.lg]}>
                    <View className="px-5 pt-4 pb-3">
                        <View className="self-center w-12 h-1 rounded-full bg-gray-200 mb-3" />

                        <View style={styles.headerTop}>
                            <TouchableOpacity
                                onPress={handleClear}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                accessibilityRole="button"
                                accessibilityLabel={t('groups.filters.clearAll')}
                                style={styles.clearBtn}
                            >
                                <Text className="text-xs font-medium text-primary">
                                    {t('groups.filters.clearAll')}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={onClose}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                accessibilityRole="button"
                                accessibilityLabel={t('groups.filters.close')}
                                style={styles.closeBtn}
                            >
                                <AppIcon
                                    name="close"
                                    size={20}
                                    color={colors.gray600}
                                />
                            </TouchableOpacity>
                        </View>

                        <Text className="text-xl font-bold text-gray-900">
                            {title}
                        </Text>
                        <Text className="text-sm text-gray-500 mt-1">{subtitle}</Text>
                    </View>

                    <ScrollView
                        style={styles.scroll}
                        className="px-5"
                        contentContainerStyle={[
                            styles.scrollContent,
                            { paddingBottom: insets.bottom + 20 },
                        ]}
                        showsVerticalScrollIndicator
                        nestedScrollEnabled
                        keyboardShouldPersistTaps="handled"
                    >
                        {children({ filters, patch, replace })}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: colors.white,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '88%',
        overflow: 'hidden',
    },
    scroll: {
        flexGrow: 0,
        flexShrink: 1,
    },
    headerTop: {
        position: 'relative',
        minHeight: 32,
        marginBottom: 6,
    },
    clearBtn: {
        position: 'absolute',
        left: 0,
        top: 4,
    },
    closeBtn: {
        position: 'absolute',
        right: 0,
        top: 0,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: colors.gray100,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scrollContent: {
        paddingBottom: 8,
    },
});
