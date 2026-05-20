import React from 'react';
import { Text as RNText, TextProps } from 'react-native';
import { resolveAutoTextStyle, useRtlLayout } from '../hooks/useRtlLayout';

export const Text = React.forwardRef<RNText, TextProps>(function AppText(
    { style, className, ...props },
    ref,
) {
    const isRtl = useRtlLayout();
    const autoStyle = resolveAutoTextStyle(isRtl, className, style);

    return (
        <RNText
            ref={ref}
            className={className}
            style={[autoStyle, style]}
            {...props}
        />
    );
});
