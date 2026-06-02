# Cost Share App - Production-Grade Monorepo

A complete mobile + backend cost-sharing application (like Splitwise) built with modern technologies and scalable architecture patterns.

> **SSOT (agents & contributors):** [docs/SSOT/README.md](../docs/SSOT/README.md) → [SRS](../docs/SSOT/SRS.md) · [CODE QUALITY](../docs/SSOT/CODE%20QUALITY.md)

## 🏗️ Architecture

This is a **production-grade monorepo** using Turborepo with strict architectural patterns:

```
cost-share-app/
├── apps/
│   ├── mobile/     # React Native (Expo) → Supabase
│   ├── web/        # Next.js (Supabase auth)
├── packages/
│   └── shared/     # Types, mappers, calculations
├── supabase/
│   └── schema.sql  # Postgres + RLS
└── .cursor/rules/  # AI-friendly patterns
```

## 🚀 Tech Stack

### Frontend (Mobile + Web)
- **React Native** with Expo SDK 54
- **Next.js 15** web client with Supabase SSR auth
- **React Navigation** (bottom tabs, WhatsApp-style)
- **NativeWind** (Tailwind CSS for React Native)
- **Zustand** (state management)
- **i18next** (internationalization: EN/HE with RTL support)

### Backend
- **Supabase** — Postgres, Auth, Storage, Row Level Security
- Mobile/web use the **anon key** + user session (no custom API server)

### Shared
- **TypeScript** types shared between frontend and backend
- **Zod** schemas (placeholder for validation)

## 📱 Features

### Screens
1. **Groups** - List of cost-sharing groups with create button
2. **History** - List of expenses grouped by group
3. **Profile** - User profile with language toggle (EN/HE) and logout

### Core Functionality
- View groups and expenses
- Mock API integration
- English/Hebrew support with RTL
- Clean services layer architecture

## 🧱 Critical Architecture Rule

**ALL DATA ACCESS MUST GO THROUGH THE SERVICES LAYER**

```
UI → services/ → Supabase (anon key + user JWT, RLS enforced)
```

There is no custom API server. Mobile/web talk to Supabase directly via `@supabase/supabase-js`.

### ✅ Correct Pattern
```typescript
import { createGroup } from '../../services/groups.service';

const handleCreate = async () => {
  await createGroup(data);
};
```

### ❌ Wrong Patterns
```typescript
// ❌ fetch to a non-existent backend
await fetch('/api/groups', { method: 'POST', body: data });

// ❌ supabase.from() inside a screen — must live in a service
await supabase.from('groups').insert(data);
```

## 🚦 Getting Started

### Prerequisites
- Node.js >= 18
- npm >= 9

### Installation

1. **Install dependencies:**
```bash
cd cost-share-app
npm install
```

2. **Configure Supabase env** — see [docs/SSOT/SUPABASE_ENVIRONMENTS.md](../docs/SSOT/SUPABASE_ENVIRONMENTS.md):
```bash
# Local dev → development project (drxfbicunusmipdgbgdk)
cp apps/mobile/.env.example apps/mobile/.env
cp apps/web/.env.example apps/web/.env.local
cp supabase/.env.example supabase/.env
# Fill keys from Supabase → Kupay - dev → Project Settings → API
```

3. **Apply database schema:**
   - **Development:** `npm run supabase:fix` or SQL Editor on dev project
   - **Production (one-time, empty project):** see SUPABASE_ENVIRONMENTS.md → `npm run supabase:bootstrap:prod`
   - `npm run seed` — **development only**
   - Verify: `npm run supabase:verify`

### Running the Project

#### Start Mobile App
```bash
npm run mobile
# or
cd apps/mobile && npm start
```

Then:
- Press `i` for iOS simulator
- Press `a` for Android emulator
- Scan QR code with Expo Go app

#### Start Web App
```bash
npm run web
# or
cd apps/web && npm run dev
```

Web runs on: `http://localhost:3000`

### Development

```bash
# Run all apps in dev mode
npm run dev

# Build all apps
npm run build

# Clean all build artifacts
npm run clean
```

## 📂 Project Structure

### Frontend Structure
```
apps/mobile/
├── screens/          # UI screens (thin composition layer)
│   ├── activity/
│   ├── auth/
│   ├── balances/
│   ├── expenses/
│   ├── groups/
│   └── profile/
├── services/         # ALL Supabase reads/writes
│   ├── activity.service.ts
│   ├── auth.service.ts
│   ├── expenses.service.ts
│   ├── groups.service.ts
│   ├── settlements.service.ts
│   ├── storage.service.ts
│   └── users.service.ts
├── lib/              # supabase client + auth helpers
│   ├── auth.ts
│   └── supabase.ts
├── store/            # Zustand global state
├── navigation/       # React Navigation setup
├── i18n/             # Internationalization
│   └── locales/
│       ├── en.json
│       └── he.json
├── components/       # Reusable UI components
└── theme/            # Theme configuration
```

### Shared Package
```
packages/shared/src/
├── types/            # TypeScript interfaces
├── schemas/          # Zod validation schemas
├── utils/            # Shared utilities
└── index.ts
```

## 🌍 Internationalization

Supports English and Hebrew with full RTL support:

```typescript
import { useTranslation } from 'react-i18next';

const { t } = useTranslation();
<Text>{t('groups.title')}</Text>
```

Language change in Profile screen may require app restart for full RTL effect.

## 📋 Architecture Documentation

Authority order (see [docs/SSOT/README.md](../docs/SSOT/README.md)):

1. [SRS.md](../docs/SSOT/SRS.md) — product requirements (`REQ-*`)
2. [CODE QUALITY.md](../docs/SSOT/CODE%20QUALITY.md) — Supabase-only architecture
3. `cost-share-app/supabase/schema.sql` — canonical DB + RLS

Pattern guides in `.cursor/rules/`:

- `ssot.mdc` - Pointer to SSOT (always-on)
- `architecture.mdc` - Core architectural patterns
- `frontend.mdc` - Frontend rules and patterns
- `shared.mdc` - Shared package rules
- `coding-style.mdc` - Code style guidelines
- `i18n.mdc` - Internationalization rules
- `rtl.mdc` - RTL support rules

`backend.mdc` and `api-contract.mdc` are deprecated (NestJS removed 2026-05-19).

## 🎯 Why This Architecture?

This project follows production-grade patterns even though it uses mock data:

✅ **Scalable** - Easy to migrate to real database (Supabase)  
✅ **Maintainable** - Clean separation of concerns  
✅ **AI-Friendly** - Consistent patterns for AI code generation  
✅ **Testable** - Services layer enables easy testing  
✅ **Future-Proof** - Ready for offline support without UI refactoring  

## 🔄 Future Enhancements

- [x] Supabase database + RLS
- [x] Authentication (Google via Supabase — mobile + web)
- [x] Remove NestJS API (direct Supabase from mobile)
- [ ] Implement offline support
- [ ] Add expense splitting logic
- [ ] Add push notifications
- [ ] Add expense categories
- [ ] Add group member management
- [ ] Add expense editing/deletion
- [ ] Add settlement calculations

## 📝 Development Guidelines

### Adding a New Feature

1. **Define types** in `packages/shared/src/types/`
2. **Update RLS** in `supabase/schema.sql` if needed
3. **Create mobile service** in `apps/mobile/services/`
4. **Create UI screen** in `apps/mobile/screens/`
5. **Add translations** in `apps/mobile/i18n/locales/`

### Rules to Follow

- ❌ NO `supabase.from()` / `fetch()` calls from screens or components
- ❌ NO business logic in UI components
- ❌ NO "any" types in TypeScript
- ❌ NO hardcoded strings (use i18n)
- ✅ ALL data access through `apps/mobile/services/*.service.ts`
- ✅ Use NativeWind for styling
- ✅ Pure math goes in `packages/shared/src/calculations/`
- ✅ Document with comments

## 🤝 Contributing

This is a starter template. Feel free to:
- Add new features
- Improve architecture
- Add tests
- Enhance UI/UX
- Add more languages

## 📄 License

MIT

## 🙏 Acknowledgments

Built with modern best practices for scalable mobile + backend applications.

---

**Ready to build amazing cost-sharing features! 🚀**
