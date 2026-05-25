import React from 'react';
import { View } from 'react-native';
import { MemberAvatar } from '../MemberAvatar';

export interface StackedMember {
    id: string;
    name: string;
    avatarUrl?: string;
}

interface StackedAvatarGroupProps {
    members: StackedMember[];
    max?: number;
    testID?: string;
}

export function StackedAvatarGroup({ members, max = 4, testID = 'stacked-avatar-group' }: StackedAvatarGroupProps) {
    const visible = members.slice(0, max);
    return (
        <View style={{ flexDirection: 'row' }} testID={testID}>
            {visible.map((m, i) => (
                <View
                    key={m.id}
                    style={{
                        marginLeft: i === 0 ? -6 : -10,
                        borderWidth: 2,
                        borderColor: '#FFFFFF',
                        borderRadius: 13,
                        overflow: 'hidden',
                    }}
                >
                    <MemberAvatar name={m.name} avatarUrl={m.avatarUrl} pixelSize={22} testID={`${testID}-avatar-${m.id}`} />
                </View>
            ))}
        </View>
    );
}
