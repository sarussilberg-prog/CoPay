import React from 'react';
import { View } from 'react-native';

const SKELETON_BG = '#E5E7EB';

function ExpenseRow() {
    return (
        <View
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 12,
                paddingHorizontal: 16,
            }}
        >
            <View
                style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: SKELETON_BG,
                }}
            />
            <View style={{ flex: 1, marginLeft: 12 }}>
                <View
                    style={{
                        height: 12,
                        width: '50%',
                        borderRadius: 4,
                        backgroundColor: SKELETON_BG,
                    }}
                />
                <View
                    style={{
                        height: 10,
                        width: '30%',
                        borderRadius: 4,
                        backgroundColor: SKELETON_BG,
                        marginTop: 6,
                    }}
                />
            </View>
            <View
                style={{
                    width: 56,
                    height: 14,
                    borderRadius: 4,
                    backgroundColor: SKELETON_BG,
                }}
            />
        </View>
    );
}

export function GroupDetailSkeleton() {
    return (
        <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
            <View style={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: 12 }}>
                <View
                    style={{
                        height: 22,
                        width: '60%',
                        borderRadius: 6,
                        backgroundColor: SKELETON_BG,
                    }}
                />
                <View
                    style={{
                        height: 14,
                        width: '40%',
                        borderRadius: 4,
                        backgroundColor: SKELETON_BG,
                        marginTop: 8,
                    }}
                />
            </View>
            {Array.from({ length: 7 }).map((_, idx) => (
                <ExpenseRow key={idx} />
            ))}
        </View>
    );
}
