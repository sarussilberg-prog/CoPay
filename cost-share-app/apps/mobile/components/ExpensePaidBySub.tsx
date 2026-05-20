/**
 * Expense subtitle — amount · paid by name, with stable order when names are Latin in Hebrew UI.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { rtlRowStyle, useRtlLayout } from '../hooks/useRtlLayout';

const LTR_TEXT: { writingDirection: 'ltr' } = { writingDirection: 'ltr' };

interface ExpensePaidBySubProps {
    amount: string;
    payerName: string;
}

export function ExpensePaidBySub({ amount, payerName }: ExpensePaidBySubProps) {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();
    const label = t('expenses.paidBy');
    const sep = ' · ';

    const parts = isRtl ? (
        <>
            <Text style={styles.sub}>{label} </Text>
            <Text style={[styles.sub, LTR_TEXT]}>{payerName}</Text>
            <Text style={styles.sub}>{sep}</Text>
            <Text style={[styles.sub, LTR_TEXT]}>{amount}</Text>
        </>
    ) : (
        <>
            <Text style={[styles.sub, LTR_TEXT]}>{amount}</Text>
            <Text style={styles.sub}>{sep}</Text>
            <Text style={styles.sub}>{label} </Text>
            <Text style={styles.sub}>{payerName}</Text>
        </>
    );

    return (
        <View style={[rtlRowStyle(isRtl), styles.row]}>
            {parts}
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexWrap: 'wrap',
        alignItems: 'center',
        marginTop: 2,
    },
    sub: {
        fontSize: 12,
        color: '#6b7280',
    },
});
