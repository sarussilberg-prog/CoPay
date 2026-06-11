# Onboarding feature-screen redesign

**Date:** 2026-06-09
**Scope:** Pre-auth onboarding flow, feature screens only (screens 2–5). The welcome screen (screen 1) is untouched.

## Goal

Make the four feature screens feel cleaner and more app-focused: let the phone mockup dominate the screen, drastically reduce the marketing copy, and let users move backward through the flow.

## Changes

### 1. Drop the paragraph body

Each feature screen currently shows three text elements stacked in the bottom card:

- Blue caption (`text-xs font-bold tracking-wider`, blue)
- Big bold title (`text-[26px] font-extrabold`)
- Paragraph body (`text-[15px] leading-relaxed`)

The paragraph body is removed. Only the blue caption and the big bold title remain. Their styles are unchanged.

### 2. Enlarge the phone mockup

Today the mockup uses a fixed `transform: [{ scale: 0.62 }, { translateY: -30 }]`, which makes the mockup occupy roughly 40% of screen height with a lot of empty cream space around it.

New behavior: compute the scale dynamically so the mockup fills the available area between the top bar and the (now shorter) bottom card:

```
const availableHeight = SCREEN_H - insets.top - TOP_BAR_HEIGHT - BOTTOM_CARD_HEIGHT
const scale = Math.min(availableHeight / 520, SCREEN_W / 320, 1.0)
```

The 1.0 cap prevents the mockup from looking blurry on large phones. The `-30` translateY is removed; the mockup is centered in its container. Result: the mockup occupies roughly 75% of screen height.

### 3. Bottom card stays visually identical

Same white sheet, same rounded top corners, same shadow, same horizontal/vertical paddings. The card just becomes shorter because the body paragraph is gone.

### 4. Add a back button

A back button is added to the footer row of each feature screen.

**Layout:** the footer becomes a three-column row — `back · pager-dots · next`. Pager dots are centered (today they sit on the start side); back button on the start side; next button on the end side (unchanged).

**Style:**

- 56×56 circle (matches the next button geometry)
- Transparent fill (no background color)
- 1px border using `onboardingColors.hairline` (#E2E8F0)
- Chevron icon using `onboardingColors.muted` (#64748B)
- Chevron direction respects RTL (mirrors with `isRtl`, opposite of the next button)

**Behavior:**

- On feature1 (screen 2 overall), back returns to the welcome screen.
- On feature2/3/4, back returns to the previous feature step.

## Files changed

| File | Change |
|------|--------|
| `cost-share-app/apps/mobile/screens/onboarding/OnboardingFeatureScreen.tsx` | Remove `bodyKey` prop and the body `<Text>`. Replace `mockupScale` static transform with dynamic scale calculation. Add `onBack` prop and back-button UI. Restructure footer into 3-column layout. |
| `cost-share-app/apps/mobile/screens/onboarding/OnboardingPreAuthFlow.tsx` | Add a `goBack` callback that maps each feature step to its predecessor (feature1 → welcome, featureN → featureN-1). Pass `onBack={goBack}` to every `OnboardingFeatureScreen`. Stop passing `bodyKey`. |
| `cost-share-app/apps/mobile/i18n/locales/en.json` | Delete `onboarding.feature1.body` through `feature4.body`. Add `onboarding.back` for the back-button accessibility label (e.g. "Back"). |
| `cost-share-app/apps/mobile/i18n/locales/he.json` | Same: delete the four body keys, add the Hebrew `onboarding.back` string. |
| `cost-share-app/apps/mobile/screens/admin/AdminOnboardingPreviewScreen.tsx` | If it passes `bodyKey` to `OnboardingFeatureScreen`, drop that prop. Verify during implementation. |
| `cost-share-app/apps/mobile/__tests__/components/onboarding/*` | Update any test that asserts on body text. Add a test for the back-button navigation behavior. |

## What stays untouched

- `OnboardingWelcomeScreen.tsx` (screen 1)
- `OnboardingAppMockup.tsx` — internal layout unchanged; just rendered at a larger scale by its parent
- All colors (`onboardingColors`), all motion (`onboardingMotion`), all RTL handling
- Top bar (language toggle, skip button)
- Pager dots component
- Next button styling

## Testing

- Visual smoke test on iOS (one large phone, one small phone like iPhone SE) and Android. Confirm the mockup scales correctly without clipping on small devices and without blurring on large ones.
- Verify back-button navigation walks the user back through feature4 → feature3 → feature2 → feature1 → welcome.
- Verify RTL: chevron icons flip correctly on both back and next buttons.
- Update or add unit tests under `__tests__/components/onboarding/` for the new back-button behavior.
