/**
 * MemberStack — first four members as overlapping 32-px avatars,
 * with a "+N" tile for the rest.
 */

import React from 'react';
import { View } from 'react-native';
import { Text } from '../AppText';
import { MemberAvatar } from '../MemberAvatar';
import { GroupMemberLite } from '@cost-share/shared';
import { colors } from '../../theme/colors';

interface MemberStackProps {
    members: GroupMemberLite[];
    testID?: string;
}

const MAX_VISIBLE = 4;

export function MemberStack({ members, testID }: MemberStackProps) {
    const shown = members.slice(0, MAX_VISIBLE);
    const extra = Math.max(0, members.length - shown.length);
    return (
        <View
            style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 0 }}
            testID={testID}
        >
            {shown.map((m, i) => (
                <View
                    key={m.userId}
                    style={{
                        marginLeft: i === 0 ? 0 : -8,
                        borderRadius: 9999,
                        borderWidth: 2,
                        borderColor: '#fff',
                    }}
                >
                    <MemberAvatar
                        name={m.displayName}
                        avatarUrl={m.avatarUrl}
                        size="xs"
                    />
                </View>
            ))}
            {extra > 0 && (
                <View
                    style={{
                        marginLeft: -8,
                        width: 32,
                        height: 32,
                        borderRadius: 9999,
                        backgroundColor: colors.gray100,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 2,
                        borderColor: '#fff',
                    }}
                    testID={testID ? `${testID}-overflow` : undefined}
                >
                    <Text
                        className="text-[11px] font-semibold"
                        style={{ color: colors.gray700 }}
                    >
                        +{extra}
                    </Text>
                </View>
            )}
        </View>
    );
}
