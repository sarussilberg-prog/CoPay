import React, { useMemo } from 'react';
import { View, Modal, ScrollView, TouchableOpacity, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import Markdown from 'react-native-markdown-display';
import { Text } from '../AppText';
import { AppIcon } from '../AppIcon';
import { useLegalDocument } from '../../hooks/queries/useLegalDocument';
import type { LegalSlug } from '@cost-share/shared';

interface Props {
    visible: boolean;
    slug: LegalSlug;
    onClose: () => void;
}

export function LegalDocumentSheet({ visible, slug, onClose }: Props) {
    const { t, i18n } = useTranslation();
    const query = useLegalDocument(slug);

    const docLocale = query.data?.locale ?? (i18n.language === 'he' ? 'he' : 'en');
    const isRtl = docLocale === 'he';
    const styles = useMemo(() => buildMarkdownStyles(isRtl), [isRtl]);

    if (!visible) return null;

    const formattedDate = query.data
        ? new Intl.DateTimeFormat(isRtl ? 'he-IL' : 'en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
          }).format(new Date(query.data.effectiveDate))
        : '';

    const titleAlign = isRtl ? 'right' : 'left';

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                <Pressable
                    style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.4)' }}
                    onPress={onClose}
                />
                <View
                    testID="legal-sheet"
                    className="bg-white rounded-t-2xl"
                    style={{ height: '92%', flexDirection: 'column' }}
                >
                    <View className="items-center pt-2 pb-1">
                        <View className="w-10 h-1 bg-gray-300 rounded-full" />
                    </View>

                    <View
                        className="px-5 pt-2 pb-3 border-b border-gray-100 items-start justify-between"
                        style={{ flexDirection: isRtl ? 'row-reverse' : 'row' }}
                    >
                        <View style={{ flex: 1, paddingEnd: 12 }}>
                            <Text
                                className="text-xl font-bold text-gray-900"
                                style={{ textAlign: titleAlign, writingDirection: isRtl ? 'rtl' : 'ltr' }}
                            >
                                {query.data?.title ?? t(slug === 'terms' ? 'legal.termsTitle' : 'legal.privacyTitle')}
                            </Text>
                            {query.data && (
                                <Text
                                    className="text-xs text-gray-500 mt-1"
                                    style={{ textAlign: titleAlign, writingDirection: isRtl ? 'rtl' : 'ltr' }}
                                >
                                    {t('legal.lastUpdated', { date: formattedDate })} · {t('legal.versionLabel', { version: query.data.version })}
                                </Text>
                            )}
                        </View>
                        <TouchableOpacity onPress={onClose} accessibilityLabel={t('legal.close')}>
                            <AppIcon name="close" size={24} color="#1f2937" />
                        </TouchableOpacity>
                    </View>

                    <View style={{ flex: 1 }}>
                        {query.isLoading && <SkeletonBody />}
                        {query.isError && !query.data && (
                            <ErrorBody onRetry={() => void query.refetch()} />
                        )}
                        {query.data && (
                            <ScrollView
                                style={{ flex: 1 }}
                                contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 }}
                                showsVerticalScrollIndicator={true}
                                nestedScrollEnabled={true}
                            >
                                <Markdown style={styles}>{query.data.contentMd}</Markdown>
                            </ScrollView>
                        )}
                    </View>

                    <View className="px-5 pb-5 pt-3 border-t border-gray-100">
                        <TouchableOpacity onPress={onClose} className="bg-primary py-4 rounded-xl">
                            <Text className="text-white text-center font-semibold">{t('legal.understood')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

function SkeletonBody() {
    return (
        <View testID="legal-sheet-skeleton" className="px-5 pt-4 pb-6">
            <View className="h-5 bg-gray-200 rounded mb-3 w-3/4" />
            <View className="h-4 bg-gray-200 rounded mb-2" />
            <View className="h-4 bg-gray-200 rounded mb-2" />
            <View className="h-4 bg-gray-200 rounded w-5/6" />
        </View>
    );
}

function ErrorBody({ onRetry }: { onRetry: () => void }) {
    const { t } = useTranslation();
    return (
        <View testID="legal-sheet-error" className="px-5 pt-6 pb-2 items-center">
            <AppIcon name="cloud-offline-outline" size={48} color="#9ca3af" />
            <Text className="text-base font-semibold text-gray-900 mt-3">{t('legal.errorTitle')}</Text>
            <Text className="text-sm text-gray-500 mt-1 text-center">{t('legal.errorBody')}</Text>
            <TouchableOpacity onPress={onRetry} className="mt-4 px-5 py-2 bg-gray-100 rounded-full">
                <Text className="text-gray-700 font-medium">{t('legal.retry')}</Text>
            </TouchableOpacity>
        </View>
    );
}

function buildMarkdownStyles(isRtl: boolean) {
    const textAlign = isRtl ? ('right' as const) : ('left' as const);
    const writingDirection = isRtl ? ('rtl' as const) : ('ltr' as const);
    return {
        body: { color: '#374151', fontSize: 16, lineHeight: 24, textAlign, writingDirection },
        paragraph: { textAlign, writingDirection, marginTop: 0, marginBottom: 10 },
        heading1: { fontSize: 22, fontWeight: '700' as const, color: '#111827', marginTop: 16, marginBottom: 8, textAlign, writingDirection },
        heading2: { fontSize: 18, fontWeight: '700' as const, color: '#111827', marginTop: 14, marginBottom: 6, textAlign, writingDirection },
        heading3: { fontSize: 16, fontWeight: '700' as const, color: '#111827', marginTop: 12, marginBottom: 4, textAlign, writingDirection },
        strong: { fontWeight: '700' as const, color: '#111827' },
        em: { fontStyle: 'italic' as const },
        link: { color: '#2563eb', textDecorationLine: 'underline' as const },
        bullet_list: { marginBottom: 8 },
        ordered_list: { marginBottom: 8 },
        list_item: { marginBottom: 4, flexDirection: isRtl ? ('row-reverse' as const) : ('row' as const) },
        bullet_list_icon: { marginStart: isRtl ? 0 : 8, marginEnd: isRtl ? 8 : 8 },
        ordered_list_icon: { marginStart: isRtl ? 0 : 8, marginEnd: isRtl ? 8 : 8 },
        blockquote: {
            backgroundColor: '#f9fafb',
            ...(isRtl
                ? { borderRightWidth: 4, borderRightColor: '#d1d5db' }
                : { borderLeftWidth: 4, borderLeftColor: '#d1d5db' }),
            paddingHorizontal: 12,
            paddingVertical: 6,
            marginVertical: 8,
        },
        table: { borderWidth: 1, borderColor: '#e5e7eb', marginVertical: 8 },
        th: { padding: 6, fontWeight: '700' as const, backgroundColor: '#f9fafb', textAlign },
        td: { padding: 6, borderTopWidth: 1, borderTopColor: '#e5e7eb', textAlign },
    };
}
