/**
 * DetailSheetHeader — shared top bar for FeedItemDetailSheet (expense + settlement).
 * Layout: close ✕ · centered uppercase label · ⋮ kebab popover (Edit / Delete).
 */

import React, { useState } from 'react';
import {
    View,
    Pressable,
    StyleSheet,
    TouchableOpacity,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from './AppText';
import { AppIcon } from './AppIcon';
import { colors } from '../theme';

export interface DetailSheetHeaderProps {
    /** Label shown centered; rendered uppercase by the component. */
    label: string;
    onClose: () => void;
    onEdit: () => void;
    onDelete: () => void;
}

export function DetailSheetHeader({
    label,
    onClose,
    onEdit,
    onDelete,
}: DetailSheetHeaderProps) {
    const { t } = useTranslation();
    const [menuOpen, setMenuOpen] = useState(false);

    const handleEdit = () => {
        setMenuOpen(false);
        onEdit();
    };
    const handleDelete = () => {
        setMenuOpen(false);
        onDelete();
    };

    return (
        <View
            className="flex-row items-center justify-between px-2 pb-1"
            style={{ position: 'relative', zIndex: 5 }}
        >
            <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t('groups.filters.close')}
                className="w-11 h-11 items-center justify-center"
            >
                <AppIcon name="close" size={22} color={colors.gray600} />
            </TouchableOpacity>

            <Text
                className="text-xs font-semibold uppercase text-gray-500"
                style={{ letterSpacing: 0.7 }}
            >
                {label}
            </Text>

            <View>
                <TouchableOpacity
                    onPress={() => setMenuOpen((o) => !o)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.edit')}
                    className="w-11 h-11 items-center justify-center"
                    testID="detail-kebab-btn"
                >
                    <AppIcon
                        name="ellipsis-vertical"
                        size={20}
                        color={colors.gray600}
                    />
                </TouchableOpacity>

                {menuOpen && (
                    <>
                        <Pressable
                            onPress={() => setMenuOpen(false)}
                            style={styles.menuBackdrop}
                        />
                        <View style={styles.menuCard}>
                            <TouchableOpacity
                                onPress={handleEdit}
                                accessibilityRole="button"
                                accessibilityLabel={t('common.edit')}
                                className="flex-row items-center px-3 py-2.5 rounded-lg"
                                testID="detail-edit-btn"
                            >
                                <AppIcon
                                    name="create-outline"
                                    size={16}
                                    color={colors.gray700}
                                />
                                <Text className="text-sm font-medium text-gray-900 ml-2.5">
                                    {t('common.edit')}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handleDelete}
                                accessibilityRole="button"
                                accessibilityLabel={t('common.delete')}
                                className="flex-row items-center px-3 py-2.5 rounded-lg"
                                testID="detail-delete-btn"
                            >
                                <AppIcon
                                    name="trash-outline"
                                    size={16}
                                    color={colors.error}
                                />
                                <Text
                                    className="text-sm font-medium ml-2.5"
                                    style={{ color: colors.error }}
                                >
                                    {t('common.delete')}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    menuCard: {
        position: 'absolute',
        top: 42,
        right: 4,
        minWidth: 160,
        padding: 4,
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#0F172A',
        shadowOpacity: 0.12,
        shadowOffset: { width: 0, height: 8 },
        shadowRadius: 20,
        elevation: 8,
        zIndex: 10,
    },
    menuBackdrop: {
        position: 'absolute',
        top: -1000,
        left: -1000,
        right: -1000,
        bottom: -1000,
        zIndex: 9,
    },
});
