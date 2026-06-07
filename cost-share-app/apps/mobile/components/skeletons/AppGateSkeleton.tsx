import React from 'react';
import { View } from 'react-native';

const SKELETON_BG = '#E5E7EB';

export function AppGateSkeleton() {
    return (
        <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
            <View style={{ flex: 1 }}>
                <View style={{ paddingHorizontal: 16, paddingTop: 64 }}>
                    <View
                        style={{
                            height: 28,
                            width: '50%',
                            borderRadius: 6,
                            backgroundColor: SKELETON_BG,
                        }}
                    />
                </View>
                <View style={{ padding: 16, gap: 12 }}>
                    {Array.from({ length: 5 }).map((_, idx) => (
                        <View
                            key={idx}
                            style={{
                                height: 60,
                                borderRadius: 8,
                                backgroundColor: SKELETON_BG,
                            }}
                        />
                    ))}
                </View>
            </View>
            <View
                style={{
                    height: 64,
                    backgroundColor: SKELETON_BG,
                    borderTopWidth: 1,
                    borderTopColor: '#F3F4F6',
                }}
            />
        </View>
    );
}
