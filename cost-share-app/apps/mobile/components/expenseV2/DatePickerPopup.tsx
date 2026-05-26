/**
 * DatePickerPopup — centered modal calendar for picking an expense date.
 * Internal draft state lets the user change selection before confirming.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { useTranslation } from 'react-i18next';
import { Text } from '../AppText';

import { useAppLanguage } from '../../hooks/useRtlLayout';
import { colors } from '../../theme';

LocaleConfig.locales['he'] = {
    monthNames: [
        'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
        'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
    ],
    monthNamesShort: [
        'ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני',
        'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳',
    ],
    dayNames: ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'],
    dayNamesShort: ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'],
};

function toIsoDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function fromIsoDate(iso: string): Date {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
}

export interface DatePickerPopupProps {
    visible: boolean;
    initialDate: Date;
    onCancel: () => void;
    onConfirm: (date: Date) => void;
}

export function DatePickerPopup({
    visible,
    initialDate,
    onCancel,
    onConfirm,
}: DatePickerPopupProps) {
    const { t } = useTranslation();
    const language = useAppLanguage();
    const [draft, setDraft] = useState<string>(toIsoDate(initialDate));

    useEffect(() => {
        if (visible) setDraft(toIsoDate(initialDate));
    }, [visible, initialDate]);

    useEffect(() => {
        LocaleConfig.defaultLocale = language === 'he' ? 'he' : '';
    }, [language]);

    const markedDates = useMemo(
        () => ({
            [draft]: {
                selected: true,
                selectedColor: colors.primaryDark,
            },
        }),
        [draft],
    );

    if (!visible) return null;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onCancel}
        >
            <Pressable
                style={styles.backdrop}
                onPress={onCancel}
                testID="date-picker-popup"
            >
                <Pressable
                    style={styles.card}
                    onPress={e => e.stopPropagation()}
                >
                    <View style={styles.header}>
                        <Pressable
                            onPress={onCancel}
                            style={styles.headerSide}
                            testID="date-picker-cancel"
                        >
                            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
                        </Pressable>
                        <Text style={styles.title}>{t('expenses.v2.datePickerTitle')}</Text>
                        <Pressable
                            onPress={() => onConfirm(fromIsoDate(draft))}
                            style={styles.headerSide}
                            testID="date-picker-done"
                        >
                            <Text style={styles.doneText}>{t('common.done')}</Text>
                        </Pressable>
                    </View>
                    <Calendar
                        current={draft}
                        markedDates={markedDates}
                        onDayPress={day => setDraft(day.dateString)}
                        theme={{
                            selectedDayBackgroundColor: colors.primaryDark,
                            selectedDayTextColor: '#FFFFFF',
                            todayTextColor: colors.primaryDark,
                            arrowColor: colors.primaryDark,
                            monthTextColor: colors.text.primary,
                            textMonthFontWeight: '600',
                        }}
                    />
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
    },
    card: {
        width: '100%',
        maxWidth: 340,
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        paddingVertical: 8,
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 8 },
        elevation: 8,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 8,
        paddingVertical: 8,
    },
    headerSide: {
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    title: {
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 0.72,
        textTransform: 'uppercase',
        color: colors.text.secondary,
    },
    cancelText: {
        fontSize: 15,
        fontWeight: '500',
        color: colors.gray600,
    },
    doneText: {
        fontSize: 15,
        fontWeight: '700',
        color: colors.primaryDark,
    },
});
