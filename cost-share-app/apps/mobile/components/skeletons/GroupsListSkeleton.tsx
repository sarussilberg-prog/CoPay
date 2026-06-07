import React from 'react';
import { View } from 'react-native';

const SKELETON_BG = '#E5E7EB';

function Row() {
    return (
        <View
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 16,
                paddingHorizontal: 16,
            }}
        >
            <View
                style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: SKELETON_BG,
                }}
            />
            <View style={{ flex: 1, marginLeft: 12 }}>
                <View
                    style={{
                        height: 14,
                        width: '60%',
                        borderRadius: 4,
                        backgroundColor: SKELETON_BG,
                    }}
                />
                <View
                    style={{
                        height: 10,
                        width: '40%',
                        borderRadius: 4,
                        backgroundColor: SKELETON_BG,
                        marginTop: 8,
                    }}
                />
            </View>
            <View
                style={{
                    width: 64,
                    height: 14,
                    borderRadius: 4,
                    backgroundColor: SKELETON_BG,
                }}
            />
        </View>
    );
}

export function GroupsListSkeleton() {
    return (
        <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
            <View style={{ paddingHorizontal: 16, paddingTop: 20 }}>
                <View
                    style={{
                        height: 24,
                        width: 140,
                        borderRadius: 6,
                        backgroundColor: SKELETON_BG,
                    }}
                />
            </View>
            {Array.from({ length: 6 }).map((_, idx) => (
                <Row key={idx} />
            ))}
        </View>
    );
}
