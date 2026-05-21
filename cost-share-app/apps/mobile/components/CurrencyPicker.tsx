/**
 * CurrencyPicker Component
 * Reusable currency selector with search
 */

import { Text } from './AppText';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, TouchableOpacity, Modal, FlatList, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import currencyCodes from 'currency-codes';
import { resolveAutoTextInputStyle, useAppLanguage, useRtlLayout } from '../hooks/useRtlLayout';
import {
    getCurrencyDisplayName,
    matchesCurrencySearch,
} from '../lib/currencyDisplay';
import { AppIcon } from './AppIcon';
import { colors } from '../theme';

interface CurrencyPickerProps {
    value: string;
    onChange: (currency: string) => void;
    label?: string;
    /** Controlled mode: hide the field trigger and drive the modal externally */
    visible?: boolean;
    onClose?: () => void;
    /** Compact trigger: code-only chip with fixed height, suitable for inline use beside another field */
    compact?: boolean;
}

export function CurrencyPicker({
    value,
    onChange,
    label,
    visible,
    onClose,
    compact = false,
}: CurrencyPickerProps) {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();
    const language = useAppLanguage();
    const [internalVisible, setInternalVisible] = useState(false);
    const isControlled = visible !== undefined;
    const modalVisible = isControlled ? visible : internalVisible;
    const [searchQuery, setSearchQuery] = useState('');
    const searchInputRef = useRef<TextInput | null>(null);
    useEffect(() => {
        if (!modalVisible) return;
        const id = setTimeout(() => searchInputRef.current?.focus(), 80);
        return () => clearTimeout(id);
    }, [modalVisible]);

    const closeModal = () => {
        if (isControlled) {
            onClose?.();
        } else {
            setInternalVisible(false);
        }
        setSearchQuery('');
    };

    const openModal = () => {
        if (!isControlled) setInternalVisible(true);
    };

    const allCurrencies = currencyCodes.data;

    const filteredCurrencies = useMemo(() => {
        if (!searchQuery.trim()) return allCurrencies;

        return allCurrencies.filter((c) =>
            matchesCurrencySearch(searchQuery, c.code, c.currency, language)
        );
    }, [searchQuery, allCurrencies, language]);

    const selectedCurrency = currencyCodes.code(value);
    const selectedLabel = selectedCurrency
        ? `${selectedCurrency.code} - ${getCurrencyDisplayName(
              selectedCurrency.code,
              selectedCurrency.currency,
              language,
          )}`
        : t('currencyPicker.selectCurrency');

    const handleSelect = (code: string) => {
        onChange(code);
        closeModal();
    };

    return (
        <View className={isControlled || compact ? undefined : 'mb-4'}>
            {!isControlled && !compact && label && (
                <Text className="text-sm font-medium text-gray-700 mb-2">{label}</Text>
            )}

            {!isControlled && (
                compact ? (
                    <TouchableOpacity
                        onPress={openModal}
                        activeOpacity={0.7}
                        style={{
                            height: 64,
                            backgroundColor: '#F9FAFB',
                            borderWidth: 1,
                            borderColor: '#D1D5DB',
                            borderRadius: 12,
                            paddingHorizontal: 8,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <Text
                            numberOfLines={1}
                            style={{
                                fontSize: 18,
                                fontWeight: '600',
                                color: '#111827',
                                textAlign: 'center',
                            }}
                        >
                            {selectedCurrency?.code ?? value ?? '—'}
                        </Text>
                        <View style={{ marginLeft: 4 }}>
                            <AppIcon
                                name="chevron-down"
                                size={14}
                                color={colors.gray500}
                            />
                        </View>
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity
                        onPress={openModal}
                        activeOpacity={0.7}
                        className="bg-white border border-gray-300 rounded-lg p-4 flex-row justify-between items-center"
                    >
                        <Text className="text-base">{selectedLabel}</Text>
                        <Text className="text-gray-400">▼</Text>
                    </TouchableOpacity>
                )
            )}

            <Modal
                visible={modalVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={closeModal}
            >
                <View className="flex-1 bg-black/50 justify-end">
                    <View className="bg-white rounded-t-3xl h-3/4">
                        {/* Header */}
                        <View className="p-4 border-b border-gray-200">
                            <View className="flex-row justify-between items-center mb-4">
                                <Text className="text-xl font-bold">{t('currencyPicker.title')}</Text>
                                <TouchableOpacity onPress={closeModal}>
                                    <Text className="text-blue-500 text-lg">{t('common.done')}</Text>
                                </TouchableOpacity>
                            </View>

                            {/* Search */}
                            <TextInput
                                ref={searchInputRef}
                                className="bg-gray-100 rounded-lg p-3"
                                style={resolveAutoTextInputStyle(isRtl)}
                                placeholder={t('currencyPicker.searchPlaceholder')}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                autoCapitalize="none"
                                testID="currency-picker-search"
                            />
                        </View>

                        {/* Currency List */}
                        <FlatList
                            data={filteredCurrencies}
                            keyExtractor={(item) => item.code}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    onPress={() => handleSelect(item.code)}
                                    className={`p-4 border-b border-gray-100 ${item.code === value ? 'bg-blue-50' : ''
                                        }`}
                                >
                                    <Text className="text-base font-medium">{item.code}</Text>
                                    <Text className="text-sm text-gray-600">
                                        {getCurrencyDisplayName(item.code, item.currency, language)}
                                    </Text>
                                </TouchableOpacity>
                            )}
                            ListEmptyComponent={
                                <View className="p-8 items-center">
                                    <Text className="text-gray-500">{t('currencyPicker.empty')}</Text>
                                </View>
                            }
                        />
                    </View>
                </View>
            </Modal>
        </View>
    );
}
