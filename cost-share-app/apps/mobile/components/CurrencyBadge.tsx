import { Text } from './AppText';
import React from 'react';
import { View } from 'react-native';
import currencyCodes from 'currency-codes';
import { getCurrencyDisplayName } from '../lib/currencyDisplay';
import { useAppLanguage } from '../hooks/useRtlLayout';

interface Props {
    currency: string;
}

export function CurrencyBadge({ currency }: Props) {
    const language = useAppLanguage();
    const entry = currencyCodes.code(currency);
    const displayName = getCurrencyDisplayName(
        currency,
        entry?.currency ?? currency,
        language,
    );

    return (
        <View
            className="min-w-[80px] max-w-[128px] px-2.5 py-2 rounded-lg bg-slate-100 border border-slate-200"
            testID={`currency-badge-${currency}`}
        >
            <Text
                testID={`currency-badge-name-${currency}`}
                className="text-xs font-semibold text-slate-700 text-center leading-4"
                numberOfLines={2}
            >
                {displayName}
            </Text>
        </View>
    );
}
