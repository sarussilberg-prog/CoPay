import { Easing, FadeIn, FadeInDown, FadeInUp, FadeOut, SlideInLeft, SlideInRight } from 'react-native-reanimated';

const easeOut = Easing.out(Easing.cubic);
const easeInOut = Easing.inOut(Easing.quad);

export const onboardingMotion = {
    fade: FadeIn.duration(480).easing(easeOut),
    fadeOut: FadeOut.duration(240).easing(easeInOut),
    fadeDown: (delayMs = 0) => FadeInDown.delay(delayMs).duration(560).easing(easeOut),
    fadeUp: (delayMs = 0) => FadeInUp.delay(delayMs).duration(560).easing(easeOut),
    screenSlide: (isRtl: boolean) =>
        (isRtl ? SlideInLeft : SlideInRight).duration(400).easing(easeOut),
    dotTiming: { duration: 360, easing: easeInOut },
} as const;
