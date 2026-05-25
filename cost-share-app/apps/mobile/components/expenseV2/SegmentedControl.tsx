import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Text } from '../AppText';
import { colors } from '../../theme';

export interface SegmentedControlOption<V extends string> {
    value: V;
    label: string;
}

interface SegmentedControlProps<V extends string> {
    value: V;
    options: SegmentedControlOption<V>[];
    onChange: (value: V) => void;
    testIDPrefix?: string;
}

export function SegmentedControl<V extends string>({
    value,
    options,
    onChange,
    testIDPrefix = 'segment',
}: SegmentedControlProps<V>) {
    return (
        <View
            className="bg-gray-100 rounded-[10px] flex-row"
            style={{ padding: 3, gap: 2 }}
        >
            {options.map(opt => {
                const selected = opt.value === value;
                return (
                    <TouchableOpacity
                        key={opt.value}
                        onPress={() => onChange(opt.value)}
                        activeOpacity={0.7}
                        testID={`${testIDPrefix}-${opt.value}`}
                        style={{
                            flex: 1,
                            paddingVertical: 7,
                            borderRadius: 8,
                            backgroundColor: selected ? '#FFFFFF' : 'transparent',
                            alignItems: 'center',
                            justifyContent: 'center',
                            ...(selected
                                ? {
                                      shadowColor: '#000',
                                      shadowOffset: { width: 0, height: 1 },
                                      shadowOpacity: 0.06,
                                      shadowRadius: 2,
                                      elevation: 1,
                                  }
                                : {}),
                        }}
                    >
                        <Text
                            style={{
                                fontSize: 12,
                                fontWeight: selected ? '700' : '500',
                                color: selected ? colors.text.primary : colors.text.secondary,
                                textAlign: 'center',
                            }}
                        >
                            {opt.label}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}
