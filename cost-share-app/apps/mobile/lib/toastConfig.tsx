import React from 'react';
import { StyleSheet } from 'react-native';
import {
    BaseToast,
    ErrorToast,
    InfoToast,
    type BaseToastProps,
} from 'react-native-toast-message';
import { colors } from '../theme';
import { rtlTextAlign, rtlWritingDirection } from '../hooks/useRtlLayout';
import { useAppStore } from '../store';

function useToastRtl(): boolean {
    const language = useAppStore((s) => s.language);
    return language === 'he';
}

function toastTextStyles(isRtl: boolean) {
    const align = rtlTextAlign(isRtl);
    const writingDirection = rtlWritingDirection(isRtl);
    return {
        text1: {
            fontSize: 15,
            fontWeight: '600' as const,
            color: colors.gray900,
            textAlign: align,
            writingDirection,
        },
        text2: {
            fontSize: 13,
            fontWeight: '400' as const,
            color: colors.gray600,
            textAlign: align,
            writingDirection,
        },
    };
}

function CopayBaseToast(props: BaseToastProps) {
    const isRtl = useToastRtl();
    const textStyles = toastTextStyles(isRtl);
    return (
        <BaseToast
            {...props}
            style={[styles.base, props.style]}
            contentContainerStyle={[styles.content, props.contentContainerStyle]}
            text1Style={[textStyles.text1, props.text1Style]}
            text2Style={[textStyles.text2, props.text2Style]}
            text1NumberOfLines={3}
            text2NumberOfLines={4}
        />
    );
}

function CopayErrorToast(props: BaseToastProps) {
    const isRtl = useToastRtl();
    const textStyles = toastTextStyles(isRtl);
    return (
        <ErrorToast
            {...props}
            style={[styles.base, styles.error, props.style]}
            contentContainerStyle={[styles.content, props.contentContainerStyle]}
            text1Style={[textStyles.text1, props.text1Style]}
            text2Style={[textStyles.text2, props.text2Style]}
            text1NumberOfLines={3}
            text2NumberOfLines={4}
        />
    );
}

function CopayInfoToast(props: BaseToastProps) {
    const isRtl = useToastRtl();
    const textStyles = toastTextStyles(isRtl);
    return (
        <InfoToast
            {...props}
            style={[styles.base, styles.info, props.style]}
            contentContainerStyle={[styles.content, props.contentContainerStyle]}
            text1Style={[textStyles.text1, props.text1Style]}
            text2Style={[textStyles.text2, props.text2Style]}
            text1NumberOfLines={3}
            text2NumberOfLines={4}
        />
    );
}

const styles = StyleSheet.create({
    base: {
        borderStartWidth: 4,
        borderLeftWidth: 0,
        borderRadius: 12,
        minHeight: 56,
        width: '92%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
        elevation: 6,
    },
    content: {
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    error: {
        borderStartColor: colors.error,
        backgroundColor: '#FEF2F2',
    },
    info: {
        borderStartColor: colors.info,
        backgroundColor: colors.primaryExtraLight,
    },
});

export const toastConfig = {
    success: (props: BaseToastProps) => (
        <CopayBaseToast
            {...props}
            style={[
                styles.base,
                {
                    borderStartColor: colors.success.DEFAULT,
                    backgroundColor: '#ECFDF5',
                },
                props.style,
            ]}
        />
    ),
    error: (props: BaseToastProps) => <CopayErrorToast {...props} />,
    info: (props: BaseToastProps) => <CopayInfoToast {...props} />,
    warning: (props: BaseToastProps) => (
        <CopayBaseToast
            {...props}
            style={[
                styles.base,
                {
                    borderStartColor: colors.warning,
                    backgroundColor: '#FFFBEB',
                },
                props.style,
            ]}
        />
    ),
};
