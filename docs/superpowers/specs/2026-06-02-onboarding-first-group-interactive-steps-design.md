# First-group onboarding — interactive steps — design spec

**Status:** Approved (design) — pending implementation
**Date:** 2026-06-02
**Supersedes:** the "Create first group (simplified)" screen from
[2026-06-01-onboarding-flow-design.md](2026-06-01-onboarding-flow-design.md) (post-login phase). That flow is unchanged; only the create-group screen's layout is reworked.

**Revision (2026-06-09):** The hero that shipped grew past the "slim one-line intro" below — it gained a 3-row checklist (name / defaults / members) plus three "quick-win" tiles, which **duplicated** the accordion steps and buried the task. Reworked so steps live in **one** place: the hero (`OnboardingCreateGroupHero`) is now a compact progress header — eyebrow + dynamic headline/subline + a single progress bar (copy + bar flip on `ready` once the name is filled) — and the accordion is the sole step list. The one required step still to do (name) is highlighted via a new `active` prop on `OnboardingStepCard` (blue ring + filled blue badge); completed and optional steps are quieted (green check / muted badge). i18n: removed `onboarding.create.hero.{title,subtitle,checkName,checkDefaults,checkMembers,optional,win1,win2,win3}`; added `hero.{titleTodo,subtitleTodo,titleReady,subtitleReady}`.

## Problem

Today `OnboardingCreateGroupScreen` shows two disconnected blocks:

1. `CreateGroupGuidancePanel` — a static card with 3 numbered tips (1·2·3), text only.
2. `CreateGroupFormFields` — a flat form with all inputs at once (cover, name, type, currency, members).

The numbered "steps" and the actual inputs are separate, so the guidance does not feel actionable.

## Goal

Turn the first-group screen into an **interactive accordion stepper**: each step is a tappable card whose input is revealed inline beneath it. Merge each guidance tip into its matching step. Onboarding screen only — the regular `CreateGroupScreen` is untouched.

## Approved approach — accordion stepper

One step open at a time; tapping a step header expands it and collapses the others. Step 1 (name) open by default. Rejected alternatives: all-steps-always-open (cluttered, long scroll) and full-screen wizard (too heavy for 5 short fields).

### Layout (top → bottom)

```
‹  הקופה הראשונה                    דלג     ← header (back / skip); title "הקופה הראשונה"
בואו נפתח את הקופה הראשונה                  ← slim one-line intro (replaces tips panel)

① שם הקופה                       [open] ▲
   ┌─────────────────────────────┐
   │  name input                 │        ← input inline, inside the step
   └─────────────────────────────┘
   תנו שם שכולם מזהים…                      ← former tip1, now step helper

② קטגוריה                      טיול   ▼   ← collapsed: shows current value + chevron
③ מטבע                          ILS   ▼
④ תמונת כריכה              אופציונלי   ▼
⑤ הזמנת חברים              אופציונלי   ▼

            [ צרו את הקופה ]               ← disabled until name is non-empty
```

### Steps, order, and content

| # | Step | Input (reused component) | Required | Collapsed summary | Helper (from old copy) |
|---|------|--------------------------|----------|-------------------|------------------------|
| 1 | שם הקופה | `Input` | **Yes** | entered name | tip1 |
| 2 | קטגוריה (group type) | `GroupTypeSelector` | No (default `trip`) | selected type label | tip2 |
| 3 | מטבע | `CurrencyPicker` | No (default `ILS`) | currency code | — |
| 4 | תמונת כריכה | `CreateGroupCoverPreview` + remove | No (optional) | thumbnail / "ברירת מחדל" | — |
| 5 | הזמנת חברים | member avatars + add (opens `AddMembersSheet`) | No (optional) | "{n} חברים" | tip3 / membersHint |

Order is name → category → currency → image → members. Only **name** gates the submit button (unchanged from today). Image and members carry an "אופציונלי" tag.

### Step states

- Numbered badge ① shows the index; once the step holds a meaningful value it flips to a ✓ check.
  - name: complete when non-empty. category/currency: have defaults → shown complete. image/members: complete only when provided (otherwise plain, no number-vs-check pressure since optional).
- Collapsed header shows the current value on the trailing side so progress is visible at a glance.
- Image-as-step: opening step 4 reveals the existing live cover hero (`CreateGroupCoverPreview`, gradient + camera badge) as the picker. This satisfies "image is a step" while keeping the signature hero visual. The hero updates live from name/type even while collapsed.

### Animation

Expand/collapse uses React Native `LayoutAnimation` (configured on each toggle); chevron rotation uses RN core `Animated` (0→180° interpolate). Chosen for unit-test safety — the repo has **no** `react-native-reanimated` jest mock, so the step card avoids reanimated at runtime. The rest of onboarding keeps reanimated.

## Visual style (matches current app)

- Step cards mirror `GroupFormSection`: white, `rounded-2xl`, `border-slate-200/80`, soft shadow, on `#F8FAFC`.
- Accent `primary` `#60A5FA`; active/selected use `primary-extra-light` bg + `primary-dark` text/number; completed check uses `success`.
- Numbered badge mirrors the guidance panel badge (`rounded-full bg-primary`, white bold numeral); check swaps the numeral for a check icon.
- Chevron via `AppIcon`; RTL-aware via `useRtlLayout` / logical styles.

## Architecture

- **New** `components/groups/OnboardingStepCard.tsx` — presentational: header (badge/check, title, optional tag, trailing summary, chevron) + animated collapsible body (`children`). Props: `index`, `title`, `helper?`, `summary?`, `optionalLabel?`, `complete`, `expanded`, `onToggle`, `children`, `testID`.
- **New** `components/groups/GroupMembersField.tsx` — the member-avatars + add row, extracted so the onboarding members step stays focused. Used by **both** the onboarding members step and `CreateGroupFormFields` (behavior-preserving dedupe, guarded by the existing `CreateGroupScreen.test.tsx`).
- `OnboardingCreateGroupScreen` owns `openStep` state (which step is expanded) and composes the **existing** inputs (`Input`, `GroupTypeSelector`, `CurrencyPicker`, `CreateGroupCoverPreview`, members block) as `children` of each `OnboardingStepCard`. It stops rendering `CreateGroupFormFields` and `CreateGroupGuidancePanel`.
- Inputs themselves are **not modified**. Submit/skip/create logic (`handleCreate`, gating on `name`, image upload, `AddMembersSheet`) is preserved as-is.
- `CreateGroupFormShell` is reused for header/scroll/footer.
- `CreateGroupGuidancePanel` is used only here → becomes dead code; remove it.

## i18n

- `onboarding.create.header` copy changes from "קופה חדשה" to **"הקופה הראשונה"** (en equivalent, e.g. "Your first kupa"). Scoped to onboarding; the standard `CreateGroupScreen` uses its own title.
- New keys under `onboarding.create.steps.*` (titles, helpers, "אופציונלי", "{n} חברים" summary) in both `i18n/locales/he.json` and `en.json`. Reuse existing copy where possible (tip1/tip2/tip3, `membersHint`, type labels, currency code).
- The now-orphaned `groups.createForm.guidance` keys (`title`, `subtitle`, `tip1`–`tip3`) are removed once the panel is deleted — their tip copy moves into the step helpers.
- All Hebrew; RTL preserved (REQ-PROF-03).

## Testing

- Unit test `OnboardingStepCard`: renders title/summary, toggles expanded, shows ✓ when `complete`, shows "אופציונלי" when `optional`.
- Extend the onboarding create-group screen test: name still gates submit; steps render; tapping a header expands it / collapses others; create still calls `createGroup` with name/type/currency/members.

## SRS / SSOT reconciliation

- **REQ-GRP-02** — still calls `createGroup`; field set and submit behavior unchanged.
- **REQ-PROF-03** — Hebrew + RTL preserved.
- Post-login onboarding flow (2026-06-01 spec) unchanged except this screen's internal layout.

## Not in scope (YAGNI)

- No hard step gating / forced sequential completion (free to open any step).
- No behavioral or visual change to the standard `CreateGroupScreen` (its `CreateGroupFormFields` gets only a behavior-preserving internal swap to `GroupMembersField`, verified by `CreateGroupScreen.test.tsx`).
- No new persisted fields; no DB/schema change.
- No re-show-onboarding-from-settings (still out, per 2026-06-01 spec).

---

## Revision 2026-06-09 — rebased on current `dev`

The design above was written against a **stale** `dev` (the branch was 36 commits behind). After merging current `origin/dev`, the onboarding screen had already been reworked, so the integration is re-scoped (the core idea — interactive accordion steps — is unchanged).

**What `dev` already provides (MUST be preserved):** `OnboardingCreateGroupScreen` wraps `CreateGroupFormShell` with a live `OnboardingCreateGroupHero` (the `guidance` slot), `OnboardingLanguageToggle` (header), a `CreateGroupFloatingButton` footer (with a `submitReady` title once a name is typed), `previewMode` (admin preview — must NOT persist onboarding completion), `initialCreateGroupCurrency` (locale-aware), `useSafeAreaInsets` → `extraBottomInset`, `showAppToast`/`showInfoToast`, and `OnboardingNameSuggestions` (passed as `nameAccessory`). The header is **already** "הקופה הראשונה". `CreateGroupGuidancePanel` was **already removed** by `dev`.

**Approved approach (option 1 — keep hero + stepper below):** keep the entire screen scaffolding; replace ONLY the flat `<CreateGroupFormFields>` body with the 5 `OnboardingStepCard`s. The hero stays on top; the steps become the interactive body.

| Step | Input (current components) |
|------|----------------------------|
| ① name | `OnboardingNameSuggestions` (visible while empty) + `Input` |
| ② category | `GroupTypeSelector` |
| ③ currency | `CurrencyPicker` |
| ④ cover image | `CreateGroupCoverPreview` + remove |
| ⑤ members | `GroupMembersField` |

**Already landed (merged, green on current `dev`):** `OnboardingStepCard` and `GroupMembersField` (+ unit tests).

**No longer in scope (superseded by `dev`):** header rename (done), `CreateGroupGuidancePanel` deletion (done), and the `CreateGroupFormFields`→`GroupMembersField` dedupe (onboarding no longer uses `CreateGroupFormFields`; the standard `CreateGroupScreen` keeps it).

**Animation note (from on-device run):** the app runs the **New Architecture**, where `LayoutAnimation` is a no-op; the chevron rotation + body fade (core `Animated`) still work, so expand/collapse is acceptable (height just isn't animated). Revisit with an `Animated` height only if it feels janky.

**i18n:** add `onboarding.create.steps.*` (optional label, per-step titles/helpers, image + members summaries) to `he.json` + `en.json`. Reuse `onboarding.create.membersHint` for the members helper; no `intro` line (the hero covers it).
