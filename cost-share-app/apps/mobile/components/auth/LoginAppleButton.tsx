import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';

type Props = {
    onPress: () => void;
    disabled?: boolean;
};

// Apple's HIG requires the official button; it renders and localizes its own label.
export function LoginAppleButton({ onPress, disabled = false }: Props) {
    if (Platform.OS !== 'ios') return null;

    return (
        <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={27}
            style={[styles.button, disabled && styles.disabled]}
            onPress={disabled ? noop : onPress}
        />
    );
}

function noop() {}

const styles = StyleSheet.create({
    button: {
        height: 54,
        width: '100%',
    },
    disabled: {
        opacity: 0.7,
    },
});
