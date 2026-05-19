import React, { createContext, useContext } from 'react';
import { I18nManager, Platform, StyleProp, TextStyle, View, ViewStyle, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

const RtlLayoutContext = createContext<boolean | null>(null);

/** True when UI should mirror for Hebrew — works even if I18nManager.forceRTL needs a restart. */
export function useRtlLayout(): boolean {
    const fromContext = useContext(RtlLayoutContext);
    if (fromContext !== null) return fromContext;

    const { i18n } = useTranslation();
    return I18nManager.isRTL || i18n.language === 'he';
}

export function rtlRowStyle(isRtl: boolean): ViewStyle {
    return {
        flexDirection: 'row',
        direction: isRtl ? 'rtl' : 'ltr',
    };
}

export function rtlRootStyle(isRtl: boolean): ViewStyle {
    return {
        flex: 1,
        direction: isRtl ? 'rtl' : 'ltr',
    };
}

export function rtlTextAlign(isRtl: boolean): 'left' | 'right' {
    return isRtl ? 'right' : 'left';
}

export function rtlWritingDirection(isRtl: boolean): 'rtl' | 'ltr' {
    return isRtl ? 'rtl' : 'ltr';
}

export function rtlTrailingAlign(isRtl: boolean): 'flex-start' | 'flex-end' {
    return isRtl ? 'flex-start' : 'flex-end';
}

/** Applies language-aware text alignment unless the caller set textAlign explicitly or used text-center. */
export function resolveAutoTextStyle(
    isRtl: boolean,
    className?: string,
    style?: StyleProp<TextStyle>,
): TextStyle | undefined {
    const flat = StyleSheet.flatten(style);
    if (flat?.textAlign) return undefined;

    const writingDirection = rtlWritingDirection(isRtl);
    if (className?.includes('text-center')) {
        return { textAlign: 'center', writingDirection };
    }

    return {
        textAlign: rtlTextAlign(isRtl),
        writingDirection,
    };
}

export function resolveAutoTextInputStyle(
    isRtl: boolean,
    style?: StyleProp<TextStyle>,
): TextStyle | undefined {
    const flat = StyleSheet.flatten(style);
    if (flat?.textAlign) return undefined;

    return {
        textAlign: rtlTextAlign(isRtl),
        writingDirection: rtlWritingDirection(isRtl),
    };
}

type RtlLayoutProviderProps = {
    children: React.ReactNode;
};

export function RtlLayoutProvider({ children }: RtlLayoutProviderProps) {
    const isRtl = useRtlLayout();
    const webDir = Platform.OS === 'web' ? ({ dir: isRtl ? 'rtl' : 'ltr' } as const) : null;

    return (
        <RtlLayoutContext.Provider value={isRtl}>
            <View style={rtlRootStyle(isRtl)} {...(webDir ?? {})}>
                {children}
            </View>
        </RtlLayoutContext.Provider>
    );
}
