/**
 * CurrencyPicker Component
 * Reusable currency selector with search
 */

import { Text } from './AppText';
import React, { useState, useMemo } from 'react';
import { View, TouchableOpacity, Modal, FlatList, TextInput } from 'react-native';
import currencyCodes from 'currency-codes';
import { resolveAutoTextInputStyle, useRtlLayout } from '../hooks/useRtlLayout';

interface CurrencyPickerProps {
    value: string;
    onChange: (currency: string) => void;
    label?: string;
}

export function CurrencyPicker({ value, onChange, label = 'Currency' }: CurrencyPickerProps) {
    const isRtl = useRtlLayout();
    const [modalVisible, setModalVisible] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Get all currencies
    const allCurrencies = currencyCodes.data;

    // Filter currencies based on search
    const filteredCurrencies = useMemo(() => {
        if (!searchQuery) return allCurrencies;

        const query = searchQuery.toLowerCase();
        return allCurrencies.filter(
            (c) =>
                c.code.toLowerCase().includes(query) ||
                c.currency.toLowerCase().includes(query)
        );
    }, [searchQuery, allCurrencies]);

    // Get selected currency details
    const selectedCurrency = currencyCodes.code(value);

    const handleSelect = (code: string) => {
        onChange(code);
        setModalVisible(false);
        setSearchQuery('');
    };

    return (
        <View className="mb-4">
            {label && <Text className="text-sm font-medium text-gray-700 mb-2">{label}</Text>}

            <TouchableOpacity
                onPress={() => setModalVisible(true)}
                className="bg-white border border-gray-300 rounded-lg p-4 flex-row justify-between items-center"
            >
                <Text className="text-base">
                    {selectedCurrency ? `${selectedCurrency.code} - ${selectedCurrency.currency}` : 'Select currency'}
                </Text>
                <Text className="text-gray-400">▼</Text>
            </TouchableOpacity>

            <Modal
                visible={modalVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setModalVisible(false)}
            >
                <View className="flex-1 bg-black/50 justify-end">
                    <View className="bg-white rounded-t-3xl h-3/4">
                        {/* Header */}
                        <View className="p-4 border-b border-gray-200">
                            <View className="flex-row justify-between items-center mb-4">
                                <Text className="text-xl font-bold">Select Currency</Text>
                                <TouchableOpacity onPress={() => setModalVisible(false)}>
                                    <Text className="text-blue-500 text-lg">Done</Text>
                                </TouchableOpacity>
                            </View>

                            {/* Search */}
                            <TextInput
                                className="bg-gray-100 rounded-lg p-3"
                                style={resolveAutoTextInputStyle(isRtl)}
                                placeholder="Search currencies..."
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                autoCapitalize="none"
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
                                    <Text className="text-sm text-gray-600">{item.currency}</Text>
                                </TouchableOpacity>
                            )}
                            ListEmptyComponent={
                                <View className="p-8 items-center">
                                    <Text className="text-gray-500">No currencies found</Text>
                                </View>
                            }
                        />
                    </View>
                </View>
            </Modal>
        </View>
    );
}
