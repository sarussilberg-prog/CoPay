/**
 * MemberPickerPopup — centered modal listing group members. Tapping a row
 * confirms and closes. Used by SettleUpSheet to pick the payer / receiver
 * when recording an arbitrary payment.
 */

import React from 'react';
import { Modal, Pressable, StyleSheet, View, ScrollView } from 'react-native';
import type { GroupMemberLite } from '@cost-share/shared';
import { Text } from '../AppText';
import { AppIcon } from '../AppIcon';
import { MemberAvatar } from '../MemberAvatar';
import { colors } from '../../theme';
import { getAvatarUrlForMember } from '../../lib/userDisplay';

export interface MemberPickerPopupProps {
    visible: boolean;
    title: string;
    members: ReadonlyArray<GroupMemberLite>;
    selectedUserId: string;
    disabledUserId?: string;
    onCancel: () => void;
    onConfirm: (member: GroupMemberLite) => void;
}

export function MemberPickerPopup({
    visible,
    title,
    members,
    selectedUserId,
    disabledUserId,
    onCancel,
    onConfirm,
}: MemberPickerPopupProps) {
    if (!visible) return null;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onCancel}
        >
            <Pressable
                style={styles.backdrop}
                onPress={onCancel}
                testID="member-picker-popup"
            >
                <Pressable
                    style={styles.card}
                    onPress={e => e.stopPropagation()}
                >
                    <View style={styles.header}>
                        <Pressable
                            onPress={onCancel}
                            style={styles.headerSide}
                            testID="member-picker-cancel"
                        >
                            <Text style={styles.cancelText}>{'×'}</Text>
                        </Pressable>
                        <Text style={styles.title}>{title}</Text>
                        <View style={styles.headerSide} />
                    </View>

                    <ScrollView style={styles.list}>
                        {members.map(member => {
                            const isSelected = member.userId === selectedUserId;
                            const isDisabled = member.userId === disabledUserId;
                            return (
                                <Pressable
                                    key={member.userId}
                                    onPress={() => {
                                        if (isDisabled) return;
                                        onConfirm(member);
                                    }}
                                    style={[
                                        styles.row,
                                        isSelected && styles.rowSelected,
                                        isDisabled && styles.rowDisabled,
                                    ]}
                                    testID={`member-picker-row-${member.userId}`}
                                    accessibilityRole="button"
                                    accessibilityState={{
                                        selected: isSelected,
                                        disabled: isDisabled,
                                    }}
                                >
                                    <MemberAvatar
                                        name={member.displayName}
                                        avatarUrl={getAvatarUrlForMember(member)}
                                        size="sm"
                                    />
                                    <Text style={styles.rowName} numberOfLines={1}>
                                        {member.displayName}
                                    </Text>
                                    {isSelected ? (
                                        <AppIcon
                                            name="checkmark"
                                            size={18}
                                            color={colors.primaryDark}
                                        />
                                    ) : null}
                                </Pressable>
                            );
                        })}
                    </ScrollView>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
    },
    card: {
        width: '100%',
        maxWidth: 340,
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        paddingVertical: 8,
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 8 },
        elevation: 8,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 8,
        paddingVertical: 8,
    },
    headerSide: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        minWidth: 64,
    },
    title: {
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 0.72,
        textTransform: 'uppercase',
        color: colors.text.secondary,
    },
    cancelText: {
        fontSize: 20,
        fontWeight: '500',
        color: colors.gray600,
        textAlign: 'left',
    },
    list: {
        maxHeight: 360,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        gap: 12,
    },
    rowSelected: {
        backgroundColor: 'rgba(59,130,246,0.06)',
    },
    rowDisabled: {
        opacity: 0.4,
    },
    rowName: {
        flex: 1,
        fontSize: 15,
        fontWeight: '600',
        color: colors.text.primary,
    },
});
