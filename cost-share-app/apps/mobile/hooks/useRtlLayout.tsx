import React, { createContext, useContext } from 'react';
import { Platform, StyleProp, TextStyle, View, ViewStyle, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';

const RtlLayoutContext = createContext<boolean | null>(null);

/** App UI language — prefers Zustand store over i18n (kept in sync on language change). */
export function useAppLanguage(): 'en' | 'he' {
    const language = useAppStore((s) => s.language);
    if (language === 'he' || language === 'en') return language;

    const { i18n } = useTranslation();
    return i18n.language.startsWith('he') ? 'he' : 'en';
}

/** True when UI should mirror for Hebrew — driven by app language, not device locale. */
export function useRtlLayout(): boolean {
    const fromContext = useContext(RtlLayoutContext);
    if (fromContext !== null) return fromContext;

    const language = useAppStore((s) => s.language);
    if (language === 'he') return true;
    if (language === 'en') return false;

    const { i18n } = useTranslation();
    return i18n.language.startsWith('he');
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

/** Feed actor label — edge-aligned by app language, not by name script. */
export function feedActorNameStyle(isRtl: boolean): TextStyle {
    return {
        textAlign: rtlTextAlign(isRtl),
        alignSelf: 'stretch',
    };
}

function hasExplicitTextAlign(className?: string, style?: StyleProp<TextStyle>): boolean {
    if (
        className?.includes('text-center') ||
        className?.includes('text-left') ||
        className?.includes('text-right')
    ) {
        return true;
    }

    return Boolean(StyleSheet.flatten(style)?.textAlign);
}

/** NativeWind className wins over the style prop — keep alignment in className on native. */
export function rtlTextClassName(isRtl: boolean, className?: string, style?: StyleProp<TextStyle>): string {
    if (hasExplicitTextAlign(className, style)) return '';

    const align = isRtl ? 'text-right' : 'text-left';
    return Platform.OS === 'web' ? align : `${align} self-stretch`;
}

/** Applies bidi direction unless the caller set textAlign explicitly in style. */
export function resolveAutoTextStyle(
    isRtl: boolean,
    className?: string,
    style?: StyleProp<TextStyle>,
): TextStyle | undefined {
    if (StyleSheet.flatten(style)?.textAlign) return undefined;

    return {
        writingDirection: rtlWritingDirection(isRtl),
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
