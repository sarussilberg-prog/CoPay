import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Text } from '../AppText';
import { AppIcon } from '../AppIcon';
import { colors } from '../../theme';

interface CurrencyPillProps {
    currency: string;
    onPress: () => void;
    testID?: string;
}

export function CurrencyPill({ currency, onPress, testID = 'currency-pill' }: CurrencyPillProps) {
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.7}
            testID={testID}
            className="self-center flex-row items-center bg-primary-extra-light rounded-full px-4 py-1.5"
            style={{ gap: 5 }}
        >
            <Text
                className="text-primary-dark"
                style={{ fontSize: 14, fontWeight: '700', letterSpacing: 0.48 }}
            >
                {currency}
            </Text>
            <AppIcon name="chevron-down" size={14} color={colors.primaryDark} />
        </TouchableOpacity>
    );
}
