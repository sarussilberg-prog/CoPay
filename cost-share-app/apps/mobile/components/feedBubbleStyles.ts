/**
 * Shared feed bubble card — light blue background for visual separation between items.
 */

import { StyleSheet } from 'react-native';
import { colors } from '../theme';

export const feedBubbleStyles = StyleSheet.create({
    bubble: {
        borderRadius: 18,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderWidth: 1,
        width: '100%',
        backgroundColor: colors.primaryExtraLight,
        borderColor: 'rgba(37, 99, 235, 0.12)',
    },
});
