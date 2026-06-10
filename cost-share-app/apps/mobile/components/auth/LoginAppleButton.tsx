import React from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../AppText';
import { AppIcon } from '../AppIcon';
import { colors } from '../../theme';

type Props = {
    onPress: () => void;
    title?: string;
    loading?: boolean;
    disabled?: boolean;
    testID?: string;
};

export function LoginAppleButton({
    onPress,
    title = '',
    loading = false,
    disabled = false,
    testID = 'login-apple-button',
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
            style={[styles.button, isDisabled && styles.disabled]}
        >
            {loading ? (
                <ActivityIndicator color={colors.primaryDark} />
            ) : (
                <View style={styles.content}>
                    <AppIcon name="logo-apple" size={26} color="#000000" />
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
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    titleSlot: {
        width: 180,
        alignItems: 'flex-start',
    },
    disabled: {
        opacity: 0.7,
    },
});
