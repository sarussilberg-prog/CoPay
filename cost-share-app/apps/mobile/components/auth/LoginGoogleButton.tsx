import React from 'react';
import {
    TouchableOpacity,
    ActivityIndicator,
    StyleSheet,
    View,
} from 'react-native';
import { Text } from '../AppText';
import { colors } from '../../theme';
import { GoogleGLogo } from './GoogleGLogo';

type Props = {
    title: string;
    onPress: () => void;
    loading?: boolean;
    disabled?: boolean;
    testID?: string;
};

export function LoginGoogleButton({
    title,
    onPress,
    loading = false,
    disabled = false,
    testID = 'login-google-button',
}: Props) {
    const isDisabled = disabled || loading;

    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.82}
            disabled={isDisabled}
            testID={testID}
            accessibilityRole="button"
            accessibilityState={{ disabled: isDisabled, busy: loading }}
            style={[styles.button, isDisabled && styles.buttonDisabled]}
        >
            {loading ? (
                <ActivityIndicator color={colors.primaryDark} />
            ) : (
                <View style={styles.content}>
                    <GoogleGLogo size={26} />
                    <View style={styles.titleSlot}>
                        <Text className="text-base font-bold text-gray-900">
                            {title}
                        </Text>
                    </View>
                </View>
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    button: {
        height: 54,
        borderRadius: 999,
        backgroundColor: colors.white,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.border.card,
        shadowColor: '#3B82F6',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 20,
        elevation: 4,
    },
    buttonDisabled: {
        opacity: 0.7,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    titleSlot: {
        width: 180,
        alignItems: 'flex-start',
    },
});
