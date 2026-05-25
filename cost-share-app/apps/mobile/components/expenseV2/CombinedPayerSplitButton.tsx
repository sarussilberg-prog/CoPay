import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Text } from '../AppText';
import { MemberAvatar } from '../MemberAvatar';
import { AppIcon } from '../AppIcon';
import { colors } from '../../theme';
import { StackedAvatarGroup, StackedMember } from './StackedAvatarGroup';

interface CombinedPayerSplitButtonProps {
    payer: { id: string; name: string; avatarUrl?: string } | null;
    splitMembers: StackedMember[];
    splitModeLabel: string;
    onPress: () => void;
    payerEyebrow: string;
    testID?: string;
}

export function CombinedPayerSplitButton({
    payer,
    splitMembers,
    splitModeLabel,
    onPress,
    payerEyebrow,
    testID = 'combined-payer-split',
}: CombinedPayerSplitButtonProps) {
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.85}
            testID={testID}
            style={{
                width: '100%',
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: '#E2E8F0',
                backgroundColor: '#FFFFFF',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05,
                shadowRadius: 2,
                elevation: 1,
                flexDirection: 'row',
                alignItems: 'center',
            }}
        >
            {/* Left: Payer avatar + name */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
                {payer ? (
                    <MemberAvatar name={payer.name} avatarUrl={payer.avatarUrl} size="sm" />
                ) : (
                    <View style={{ width: 36, height: 36 }} />
                )}
                <View style={{ flexShrink: 1 }}>
                    <Text
                        style={{
                            fontSize: 12,
                            fontWeight: '600',
                            letterSpacing: 0.72,
                            color: '#94A3B8',
                            textTransform: 'uppercase',
                        }}
                    >
                        {payerEyebrow}
                    </Text>
                    <Text
                        numberOfLines={1}
                        style={{ fontSize: 14, fontWeight: '700', color: colors.text.primary }}
                    >
                        {payer?.name ?? '—'}
                    </Text>
                </View>
            </View>

            {/* Middle: split-mode label */}
            <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 8 }}>
                <Text
                    numberOfLines={1}
                    style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color: colors.text.secondary,
                        textAlign: 'center',
                    }}
                >
                    {splitModeLabel}
                </Text>
            </View>

            {/* Right: stacked avatars + chevron */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <StackedAvatarGroup members={splitMembers} max={4} />
                <AppIcon name="chevron-forward" size={14} color={colors.gray400} />
            </View>
        </TouchableOpacity>
    );
}
