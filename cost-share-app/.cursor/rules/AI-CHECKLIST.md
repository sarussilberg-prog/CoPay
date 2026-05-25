# AI Development Checklist

**Purpose:** Pre-completion verification checklist for AI agents  
**Last Updated:** May 18, 2026

---

## 📋 BEFORE COMPLETING ANY TASK

Use this checklist to verify your work before marking a task as complete.

---

## 🎨 STYLING VERIFICATION

- [ ] **No inline styles** used (except RTL icon transforms)
- [ ] **No hardcoded hex colors** in style props
- [ ] **Only NativeWind className** used for styling
- [ ] **Theme colors imported** for component props (ActivityIndicator, etc.)
- [ ] **No directional properties** in styles (marginLeft, paddingRight, left, right)
- [ ] **Tailwind color classes** used (bg-blue-500, text-gray-600)

---

## 🌍 INTERNATIONALIZATION (i18n) VERIFICATION

- [ ] **No hardcoded strings** anywhere in the code
- [ ] **All text uses t()** function
- [ ] **useTranslation imported** from 'react-i18next'
- [ ] **Translations added to en.json**
- [ ] **Translations added to he.json** (same keys as en.json)
- [ ] **Translation keys use camelCase** (noGroups, not no_groups)
- [ ] **Translation keys max 2 levels deep** (groups.noGroups ✓, groups.list.empty.state ✗)
- [ ] **Descriptive key names** used (groups.createGroup, not groups.btn1)

---

## 🗄️ SUPABASE ENVIRONMENT (mandatory)

- [ ] Read [docs/SSOT/SUPABASE_ENVIRONMENTS.md](../../../docs/SSOT/SUPABASE_ENVIRONMENTS.md)
- [ ] **`git branch --show-current`** — `main` → production (`jfqxjjjbpxbwwvoygahu`), else → dev (`drxfbicunusmipdgbgdk`)
- [ ] **Env URL** matches branch before any DB/MCP/seed/`supabase:fix`
- [ ] **No seed / destructive SQL** on production without explicit user approval

---

## 🏗️ ARCHITECTURE VERIFICATION

- [ ] **No `supabase.from()`** in screens/components
- [ ] **No `fetch()` used** in screens (there is no backend API)
- [ ] **All Supabase reads/writes** live in `apps/mobile/services/*.service.ts`
- [ ] **Service functions imported** and used correctly
- [ ] **Screens are thin** (UI composition only, no business logic)
- [ ] **Business logic in services** (mobile) or `packages/shared/src/calculations/` (pure math)
- [ ] **Data flow followed:** UI → services/ → Supabase (anon key + user JWT, RLS)
- [ ] **RLS changes re-applied** to Supabase (`schema.sql` or targeted patch in SQL Editor)

---

## 🔤 TYPESCRIPT VERIFICATION

- [ ] **No "any" types** used
- [ ] **Explicit return types** defined for functions
- [ ] **Types imported from @cost-share/shared** when available
- [ ] **Interfaces defined** for complex objects
- [ ] **All imports resolve** correctly
- [ ] **TypeScript compiles** without errors

---

## 📂 FILE STRUCTURE VERIFICATION

- [ ] **Correct file naming:**
  - Screens: `PascalCase.tsx` (GroupsScreen.tsx)
  - Components: `PascalCase.tsx` (Button.tsx, LoadingIndicator.tsx)
  - Services: `kebab-case.service.ts` (groups.service.ts)
  - Hooks: `camelCase.ts` (useLoading.ts)
  - Utils: `kebab-case.ts` (date-utils.ts)
- [ ] **Files in correct directories:**
  - Screens → `apps/mobile/screens/[feature]/`
  - Components → `apps/mobile/components/`
  - Services → `apps/mobile/services/`
  - Hooks → `apps/mobile/hooks/`
  - Types → `packages/shared/src/types/`

---

## 🔄 STATE MANAGEMENT VERIFICATION

- [ ] **useLoading() hook** used for loading states (not global)
- [ ] **LoadingIndicator component** used for loading UI
- [ ] **Global state only for:** user data, groups list, expenses list, language
- [ ] **Local useState** for screen-specific state (forms, modals, flags)
- [ ] **No global loading state** used from store

---

## 🚨 ERROR HANDLING VERIFICATION

- [ ] **Toast.show() used** for error notifications
- [ ] **No Alert.alert()** used for errors
- [ ] **Errors logged** to console (console.error)
- [ ] **Translated error messages** used (t('groups.loadError'))
- [ ] **Services return null/empty** on failure
- [ ] **Success toasts shown** for create/update operations

---

## 🎯 LOADING PATTERN VERIFICATION

- [ ] **useLoading() hook imported** from '../../hooks/useLoading'
- [ ] **LoadingIndicator component imported** from '../../components/LoadingIndicator'
- [ ] **startLoading() called** before async operations
- [ ] **stopLoading() called** after async operations
- [ ] **LoadingIndicator used** for UI: `if (isLoading) return <LoadingIndicator />;`

---

## 🌐 RTL (Right-to-Left) VERIFICATION

- [ ] **No left/right properties** in styles
- [ ] **NativeWind classes used** (ml-4, pr-2, text-left)
- [ ] **Flexbox used** for layouts (auto-adapts to RTL)
- [ ] **Tested in English** (LTR)
- [ ] **Tested in Hebrew** (RTL)
- [ ] **Text flows correctly** in both directions
- [ ] **Navigation works** in both directions

---

## 📝 CODE QUALITY VERIFICATION

- [ ] **File header comment** added explaining purpose
- [ ] **Complex functions documented** with comments
- [ ] **Meaningful variable names** used
- [ ] **Functions under 50 lines** (or split into smaller functions)
- [ ] **Code nesting max 3 levels** deep
- [ ] **Early returns used** to reduce nesting
- [ ] **Imports grouped logically** (external, internal, types)
- [ ] **No console.logs** left (except error logging)

---

## 🔧 COMPONENT-SPECIFIC CHECKS

### For Screens:
- [ ] **useTranslation() hook** used
- [ ] **useLoading() hook** used (if loading data)
- [ ] **LoadingIndicator** shown while loading
- [ ] **Service functions** imported and called
- [ ] **No business logic** in screen
- [ ] **No API calls** in screen

### For Components:
- [ ] **Reusable** (not one-time use)
- [ ] **Props interface defined** with TypeScript
- [ ] **No business logic** in component
- [ ] **No API calls** in component
- [ ] **Accepts props** for customization
- [ ] **File in components/** directory

### For Services:
- [ ] **Toast imported** from 'react-native-toast-message'
- [ ] **i18n imported** from '../i18n'
- [ ] **Error toasts shown** on failure
- [ ] **Success toasts shown** on success
- [ ] **Errors logged** to console
- [ ] **Store updated** on success
- [ ] **Returns null/empty** on failure

---

## 🧪 TESTING CHECKLIST

### Manual Testing:
- [ ] **Code runs** without errors
- [ ] **Feature works** as expected
- [ ] **Loading states** display correctly
- [ ] **Error states** display correctly
- [ ] **Success messages** show correctly
- [ ] **Tested in English** (LTR)
- [ ] **Tested in Hebrew** (RTL)
- [ ] **All text translated** (no hardcoded strings visible)

### Visual Testing:
- [ ] **Layout correct** in LTR
- [ ] **Layout correct** in RTL
- [ ] **Colors consistent** with theme
- [ ] **Spacing consistent** (no hardcoded values)
- [ ] **Loading indicator** shows correctly
- [ ] **Toast notifications** appear correctly

---

## 📚 DOCUMENTATION CHECKS (SSOT VERIFICATION — MANDATORY)

Per project rule (2026-05-19): **every task must reconcile against the truth docs.**

- [ ] **`docs/SSOT/SRS.md`** mapped — change tied to a `REQ-*` ID (or new `REQ-*` added)
- [ ] **`docs/SSOT/CODE QUALITY.md`** matches the change (architecture / data flow unchanged or updated)
- [ ] **`cost-share-app/supabase/schema.sql`** matches deployed DB (re-applied in SQL Editor if RLS/tables changed)
- [ ] **`DATABASE_ARCHITECTURE.md`** updated if data model changed
- [ ] **README** updated if new feature / new structure
- [ ] **`MASTER-RULES.mdc`** updated if new pattern added
- [ ] **`.cursor/rules/*.mdc`** swept for stale references (e.g., "API", "backend", "NestJS", deleted files)
- [ ] **Translation keys** added to both `en.json` and `he.json`

---

## ⚠️ COMMON MISTAKES TO AVOID

### ❌ DON'T:
- Use inline styles: `style={{...}}`
- Use hardcoded strings: `<Text>Loading...</Text>`
- Use "any" types
- Make API calls from screens
- Use Alert.alert() for errors
- Use global loading state
- Use left/right properties in styles
- Hardcode colors: `color="#000"`
- Leave console.logs in code
- Create one-time use components

### ✅ DO:
- Use NativeWind: `className="flex-1 bg-white"`
- Use t(): `<Text>{t('common.loading')}</Text>`
- Use strict TypeScript
- Use service functions
- Use Toast.show() for errors
- Use useLoading() hook
- Use ml-4, pr-2 classes
- Use theme colors: `colors.primary`
- Remove debug logs
- Make components reusable

---

## 🎯 FINAL VERIFICATION

Before marking task as complete:

- [ ] **All checklist items above** verified
- [ ] **Code follows MASTER-RULES.mdc** patterns
- [ ] **No errors in console**
- [ ] **TypeScript compiles** successfully
- [ ] **Tested in both languages** (EN + HE)
- [ ] **Loading and error states** work correctly
- [ ] **Ready for code review**

---

## 📞 WHEN IN DOUBT

If unsure about any pattern or rule:

1. **Check docs/SSOT/** ([README](../../../docs/SSOT/README.md)) for product + architecture truth
2. **Check MASTER-RULES.mdc** for mobile implementation patterns
3. **Check existing code** for similar patterns
4. **Check .cursor/rules/** for detailed documentation
5. **Ask for clarification** before proceeding

---

**Remember:** Following this checklist ensures consistency, maintainability, and RTL support across the entire codebase! 🚀
