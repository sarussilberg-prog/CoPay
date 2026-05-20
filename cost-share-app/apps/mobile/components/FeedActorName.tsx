/**
 * Feed actor label — aligned to the app edge (right in Hebrew, left in English).
 */

import React from 'react';
import { Text } from './AppText';
import { feedActorNameStyle, useRtlLayout } from '../hooks/useRtlLayout';

interface FeedActorNameProps {
    name: string;
    className?: string;
}

export function FeedActorName({
    name,
    className = 'text-xs font-semibold text-gray-600 mb-1.5',
}: FeedActorNameProps) {
    const isRtl = useRtlLayout();

    return (
        <Text className={className} style={feedActorNameStyle(isRtl)}>
            {name}
        </Text>
    );
}
