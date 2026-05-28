import { Image, ImageSourcePropType, View } from 'react-native';
import type { IsraeliPaymentApp } from '../../lib/israeliPaymentLinks';
import { Text } from '../AppText';

const BIT_LOGO: ImageSourcePropType = require('../../assets/payment-apps/bit-logo.png');

/** PayBox brand sky — official app icon background. */
const PAYBOX_BRAND_BG = '#5BC8F5';

interface PaymentAppLogoProps {
    app: IsraeliPaymentApp;
    size?: number;
}

export function PaymentAppLogo({ app, size = 52 }: PaymentAppLogoProps) {
    if (app === 'paybox') {
        return (
            <View
                style={{
                    flex: 1,
                    alignSelf: 'stretch',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: PAYBOX_BRAND_BG,
                    paddingHorizontal: 6,
                }}
            >
                <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                    style={{
                        color: '#FFFFFF',
                        fontSize: 15,
                        fontWeight: '800',
                        textAlign: 'center',
                        writingDirection: 'ltr',
                        alignSelf: 'stretch',
                    }}
                >
                    PayBox
                </Text>
            </View>
        );
    }

    return (
        <View
            style={{
                width: size,
                height: size,
                borderRadius: 12,
                overflow: 'hidden',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <Image
                source={BIT_LOGO}
                accessibilityIgnoresInvertColors
                style={{ width: size, height: size }}
                resizeMode="cover"
            />
        </View>
    );
}
