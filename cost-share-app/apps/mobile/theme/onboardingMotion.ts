import {
    Easing,
    FadeIn,
    FadeInDown,
    FadeInUp,
    FadeOut,
    SlideInLeft,
    SlideInRight,
    SlideOutLeft,
    SlideOutRight,
} from 'react-native-reanimated';

/** iOS-like deceleration — snappy without feeling abrupt. */
const easeOut = Easing.bezier(0.25, 0.1, 0.25, 1);
const easeIn = Easing.bezier(0.4, 0, 1, 1);
const easeInOut = Easing.inOut(Easing.quad);

export const onboardingMotion = {
    fade: FadeIn.duration(260).easing(easeOut),
    fadeOut: FadeOut.duration(180).easing(easeIn),
    fadeDown: (delayMs = 0) => FadeInDown.delay(delayMs).duration(300).easing(easeOut),
    fadeUp: (delayMs = 0) => FadeInUp.delay(delayMs).duration(300).easing(easeOut),
    screenEnter: (isRtl: boolean) =>
        (isRtl ? SlideInLeft : SlideInRight).duration(260).easing(easeOut),
    screenExit: (isRtl: boolean) =>
        (isRtl ? SlideOutRight : SlideOutLeft).duration(200).easing(easeIn),
    dotTiming: { duration: 200, easing: easeInOut },
} as const;
