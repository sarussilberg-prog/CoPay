# Animated logo loading screen

**Date:** 2026-06-09
**Branch:** `refactor-onboarding`

## Problem

After the native splash screen hides, `AuthenticatedAppGate` shows a `loading` state while it resolves whether to route the user to onboarding or the main app. That state currently renders `AppGateSkeleton` — a gray title bar, five gray placeholder rows, and a gray bottom tab placeholder. It looks like generic skeleton content for content that never arrives, and it's a hard visual break from the splash screen the user just saw.

## Goal

Replace the placeholder skeleton with the brand logo, centered on a white background, animated with a gentle "breathing" pulse, so the user perceives the splash → app boot as one continuous moment.

## Scope

In scope:
- Rewrite the body of `components/skeletons/AppGateSkeleton.tsx`.

Out of scope:
- Renaming the file/export (still consumed as `AppGateSkeleton` in `AuthenticatedAppGate.tsx` and the corresponding test; rename is unrelated cleanup).
- Any change to `AuthenticatedAppGate.tsx` logic or gate timing.
- Changing the native splash image or `app.json` splash config.
- Other loading skeletons (`GroupDetailSkeleton`, `GroupsListSkeleton`).

## Design

### Asset & layout

- **Image:** `assets/splash-icon.png` — the same asset the native splash uses, so the JS-side loading screen visually equals the splash.
- **Background:** `#ffffff` — matches `expo-splash-screen` config in `app.json`.
- **Size:** width `200` on Android, `216` on iOS — matches `expo-splash-screen` `imageWidth` per platform exactly. `resizeMode: 'contain'`, square aspect ratio.
- **Position:** centered horizontally and vertically (flex centering).

Because the asset, background, and size all match the native splash, when the native splash hides there should be no visible jump — the logo appears to keep sitting in place and just begins breathing.

### Animation

- **Library:** React Native built-in `Animated` API — matches existing usage in `components/Toast.tsx`, `components/onboarding/OnboardingFloatingCard.tsx`, etc. Reanimated is also installed but `Animated` is the established pattern for one-off micro-animations.
- **Driver:** `useNativeDriver: true` (scale is supported).
- **Pulse:** `Animated.Value` initialized to `1`, animated via `Animated.loop` of a sequence:
  - `Animated.timing(scale, { toValue: 1.06, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true })`
  - `Animated.timing(scale, { toValue: 1.0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true })`
  - Result: ~1.4s per breath, scales between 1.0 and 1.06 (subtle, calm).
- **Lifecycle:** start the loop in `useEffect` on mount; call `loop.stop()` in the cleanup. When `AuthenticatedAppGate` swaps the gate from `loading` to `create`/`main`, `AppGateSkeleton` unmounts and the animation stops naturally.

### Component structure

Single file, single function component:

```
AppGateSkeleton.tsx
  - imports: React (useEffect, useRef), View, Image, Animated, Easing, Platform
  - LOGO_WIDTH: Platform.OS === 'ios' ? 216 : 200
  - Component:
    - scale = useRef(new Animated.Value(1)).current
    - useEffect: start Animated.loop on mount, stop on unmount
    - return: <View flex 1, bg white, center>
              <Animated.Image source={require('../../assets/splash-icon.png')}
                              style={{ width, height, transform: [{ scale }] }}
                              resizeMode="contain" />
             </View>
```

## Testing

Existing test surface for this component is minimal (it currently has no dedicated tests; tests reference it via `AuthenticatedAppGate` flows). No new tests are warranted — the behavior is a visual animation with no branching or external state. Manual verification:

1. Cold-start the app (kill, reopen). The native splash should transition into the same logo doing a gentle pulse, no visible jump.
2. Once gate resolves (cached groups present), the pulsing logo should be replaced by the main app.
3. On a slow/offline cold start, the pulse should continue smoothly until the 4s `GATE_FETCH_TIMEOUT_MS` falls through.

## Risks

- **Asset size on iOS vs Android:** `app.json` uses 216 for iOS, 200 for Android. If we hardcode 200 everywhere, the iOS size will jump down by 16px at the splash→JS transition. Mitigation: branch on `Platform.OS` to match `app.json` exactly.
- **Animation jank during heavy boot work:** Native driver scale should remain smooth even while JS is busy resolving the gate. If jank appears, the fallback is to lower the loop duration's interpolation precision or accept it.
