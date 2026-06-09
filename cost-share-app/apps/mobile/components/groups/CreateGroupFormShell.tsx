/**
 * CreateGroupFormShell — shared layout (header, scroll, sticky footer CTA).
 * The footer is rendered in-flow (not absolutely positioned) so it can never
 * overlap form content. ScrollView is strictly above it.
 */

import React from 'react';
import { View, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../AppText';
import { colors } from '../../theme';

type Props = {
    title: string;
    headerStart: React.ReactNode;
    headerEnd?: React.ReactNode;
    guidance?: React.ReactNode;
    children: React.ReactNode;
    footer: React.ReactNode;
    /** Full-screen flows without tab bar — pass safe-area bottom inset. */
    extraBottomInset?: number;
    testID?: string;
};

const FOOTER_GAP_ABOVE = 2;
const FOOTER_PADDING_TOP = 12;

export function CreateGroupFormShell({
    title,
    headerStart,
    headerEnd,
    guidance,
    children,
    footer,
    extraBottomInset = 0,
    testID,
}: Props) {
    return (
        <SafeAreaView edges={['top']} style={styles.root} testID={testID}>
            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <View style={styles.header}>
                    <View style={[styles.headerSide, styles.headerStart]}>
                        {headerStart}
                    </View>
                    <Text style={styles.headerTitle} numberOfLines={1}>
                        {title}
                    </Text>
                    <View style={[styles.headerSide, styles.headerEnd]}>
                        {headerEnd ?? null}
                    </View>
                </View>

                <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    showsVerticalScrollIndicator={false}
                >
                    {guidance}
                    {children}
                </ScrollView>

                <View
                    style={[
                        styles.footerBar,
                        { paddingBottom: extraBottomInset + FOOTER_GAP_ABOVE },
                    ]}
                >
                    {footer}
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

export function GroupFormSection({
    title,
    children,
    testID,
}: {
    title?: string;
    children: React.ReactNode;
    testID?: string;
}) {
    return (
        <View
            testID={testID}
            className="mb-4 rounded-2xl bg-white border border-slate-200/80 px-4 py-4"
            style={styles.sectionShadow}
        >
            {title ? (
                <Text className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
                    {title}
                </Text>
            ) : null}
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    flex: { flex: 1 },
    root: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingBottom: 8,
        minHeight: 44,
    },
    headerSide: {
        minWidth: 72,
        justifyContent: 'center',
    },
    headerStart: {
        alignItems: 'flex-start',
    },
    headerEnd: {
        alignItems: 'flex-end',
    },
    headerTitle: {
        flex: 1,
        textAlign: 'center',
        fontSize: 17,
        fontWeight: '700',
        color: colors.text.primary,
        letterSpacing: -0.2,
    },
    scroll: { flex: 1 },
    scrollContent: {
        paddingHorizontal: 16,
        paddingTop: 4,
        paddingBottom: 16,
    },
    footerBar: {
        paddingTop: FOOTER_PADDING_TOP,
        paddingHorizontal: 16,
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
    },
    sectionShadow: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.04,
        shadowRadius: 12,
        elevation: 2,
    },
});
