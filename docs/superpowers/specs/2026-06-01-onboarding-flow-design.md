# Onboarding flow — design spec

**Status:** Implemented (mobile)  
**Date:** 2026-06-01

## Flow (option C — two phases)

| Phase | When | Screens |
|-------|------|---------|
| Pre-login | First launch, no session | Welcome → 3 feature slides → Login |
| Post-login | Session + zero groups + flag not set | Create first group (simplified) → main app |

Skip paths:

- Welcome: "כבר יש לי חשבון" → login
- Features: "דלג" → login
- Create: back → confirm skip → main app (flag set)

Persistence: `AsyncStorage` keys `@onboarding_pre_v1_complete`, `@onboarding_post_v1_complete`.

## SRS mapping

- **REQ-PROF-03** — Hebrew copy + RTL via `useRtlLayout` / logical styles
- **REQ-GRP-02** — Post-login create group screen calls `createGroup`
- **REQ-AUTH-01** — Pre-login ends at existing `LoginScreen`

## Visual

Onboarding uses a dedicated palette (`theme/onboardingColors.ts`) matching the "פשוט" canvas; main app theme unchanged.

Animations: `react-native-reanimated` (staggered cards, slide transitions, pager dots, mockup zoom).

## Not in v1

- Hero variant persisted to DB (preview only)
- Custom photo from onboarding hero "+" (placeholder affordance)
- Re-show onboarding from settings
