# Mobile DB E2E (Approach A + B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the Expo mobile app end-to-end to Supabase Postgres via NestJS — bootstrap the database, fix dev connectivity, then require and use Supabase JWT on every API call with `createdBy` derived from the authenticated user.

**Architecture:** Mobile authenticates with Supabase Google OAuth; `api.ts` sends `Authorization: Bearer <access_token>` to NestJS. Nest validates JWT via `supabase.auth.getUser(token)`, attaches `{ id }` to the request, uses it for mutations and scoped reads. Nest continues using the service-role client for DB access (bypasses RLS); authorization is enforced in controllers/services.

**Tech Stack:** Supabase (Postgres + Auth), NestJS 10, `@supabase/supabase-js`, Expo / React Native, Jest (mobile + server)

---

## File map

| File | Responsibility |
|------|----------------|
| `apps/server/db/schema.sql` | Source of truth for tables, triggers, RLS (manual apply) |
| `apps/server/src/scripts/seed.ts` | Dev sample data after schema |
| `scripts/verify-supabase-schema.sh` | Preflight: confirms `profiles` table exists |
| `apps/server/src/auth/auth.service.ts` | Validates Supabase access JWT |
| `apps/server/src/auth/supabase-auth.guard.ts` | Global guard; rejects missing/invalid Bearer |
| `apps/server/src/auth/current-user.decorator.ts` | `@CurrentUser()` param decorator |
| `apps/server/src/auth/auth.module.ts` | Wires auth providers + global guard |
| `apps/server/src/controllers/*.controller.ts` | Use `@CurrentUser()` for `createdBy`; pass `userId` to scoped reads |
| `apps/server/src/services/groups.service.ts` | Add `findAllForUser(userId)` |
| `apps/mobile/services/api.ts` | Env-based API URL + attach Bearer token |
| `apps/mobile/.env.example` | Document `EXPO_PUBLIC_API_URL` |
| `scripts/dev-start.sh` | Schema verify + print LAN API URL for mobile |
| `apps/server/src/auth/__tests__/supabase-auth.guard.spec.ts` | Guard unit tests |
| `apps/mobile/__tests__/services/api.test.ts` | Mobile API header tests |

---

## Task 1: Supabase database bootstrap (manual + verify script)

**Files:**
- Use: `apps/server/db/schema.sql`
- Use: `apps/server/src/scripts/seed.ts`
- Create: `scripts/verify-supabase-schema.sh`
- Modify: `scripts/dev-start.sh` (call verify after env check)

- [ ] **Step 1: Apply schema in Supabase Dashboard**

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project (`drxfbicunusmipdgbgdk`)
2. **SQL Editor** → **New query**
3. Paste full contents of `cost-share-app/apps/server/db/schema.sql`
4. Click **Run**
5. Confirm success (no errors; tables `profiles`, `groups`, `expenses`, etc. created)

- [ ] **Step 2: Configure Google OAuth redirect URLs**

Supabase → **Authentication** → **URL Configuration** → **Redirect URLs** — add:

```
com.copay.mobile://auth/callback
exp://YOUR_LAN_IP:8081/--/auth/callback
```

Replace `YOUR_LAN_IP` with your Mac's LAN IP (run `ipconfig getifaddr en0` on macOS). Also add the URI printed in Metro as `[Auth] redirectTo = ...` when Expo starts.

Supabase → **Authentication** → **Providers** → enable **Google** with OAuth client ID/secret.

- [ ] **Step 3: Seed dev data (optional but recommended for member picker)**

```bash
cd cost-share-app/apps/server
npm run seed
```

Expected: console logs `Wiping existing data...`, creates 3 users, groups, expenses. Ends with UUID summary.

- [ ] **Step 4: Create schema verify script**

Create `cost-share-app/scripts/verify-supabase-schema.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/apps/server/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "✗ Missing apps/server/.env"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ -z "${SUPABASE_URL:-}" || -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "✗ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required in apps/server/.env"
  exit 1
fi

HTTP_CODE="$(curl -s -o /tmp/kupa-schema-probe.json -w "%{http_code}" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$SUPABASE_URL/rest/v1/profiles?select=id&limit=1")"

if [[ "$HTTP_CODE" == "200" ]]; then
  echo "✓ Supabase schema OK (profiles table reachable)"
  exit 0
fi

echo "✗ Supabase schema not ready (HTTP $HTTP_CODE)"
cat /tmp/kupa-schema-probe.json 2>/dev/null || true
echo ""
echo "  → Run apps/server/db/schema.sql in Supabase SQL Editor"
exit 1
```

```bash
chmod +x cost-share-app/scripts/verify-supabase-schema.sh
```

- [ ] **Step 5: Wire verify into dev-start preflight**

In `cost-share-app/scripts/dev-start.sh`, inside `run_checks()` after `check_env` and before `check_typescript`, add:

```bash
  log "Checking Supabase schema..."
  bash "$ROOT_DIR/scripts/verify-supabase-schema.sh"
  ok "Supabase schema"
```

- [ ] **Step 6: Run verify**

```bash
cd cost-share-app
bash scripts/verify-supabase-schema.sh
```

Expected: `✓ Supabase schema OK (profiles table reachable)`

- [ ] **Step 7: Commit**

```bash
git add cost-share-app/scripts/verify-supabase-schema.sh cost-share-app/scripts/dev-start.sh
git commit -m "chore: verify Supabase schema during dev preflight"
```

---

## Task 2: Mobile API base URL via environment

**Files:**
- Modify: `apps/mobile/services/api.ts`
- Modify: `apps/mobile/.env.example`
- Modify: `apps/mobile/.env` (local only — do not commit)
- Test: `apps/mobile/__tests__/services/api.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/__tests__/services/api.test.ts`:

```typescript
describe('api base URL', () => {
    const originalDev = (global as any).__DEV__;
    const originalEnv = process.env.EXPO_PUBLIC_API_URL;

    afterEach(() => {
        (global as any).__DEV__ = originalDev;
        if (originalEnv === undefined) {
            delete process.env.EXPO_PUBLIC_API_URL;
        } else {
            process.env.EXPO_PUBLIC_API_URL = originalEnv;
        }
        jest.resetModules();
    });

    it('uses EXPO_PUBLIC_API_URL when set', () => {
        process.env.EXPO_PUBLIC_API_URL = 'http://192.168.1.10:3000/api';
        jest.resetModules();
        const { getApiBaseUrl } = require('../../services/api');
        expect(getApiBaseUrl()).toBe('http://192.168.1.10:3000/api');
    });

    it('falls back to localhost in __DEV__ when env unset', () => {
        delete process.env.EXPO_PUBLIC_API_URL;
        (global as any).__DEV__ = true;
        jest.resetModules();
        const { getApiBaseUrl } = require('../../services/api');
        expect(getApiBaseUrl()).toBe('http://localhost:3000/api');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd cost-share-app
npm test -w @cost-share/mobile -- __tests__/services/api.test.ts --no-cache
```

Expected: FAIL — `getApiBaseUrl is not a function` or similar.

- [ ] **Step 3: Implement env-based URL**

Replace `apps/mobile/services/api.ts` top section with:

```typescript
import { ApiResponse } from '@cost-share/shared';

export function getApiBaseUrl(): string {
    if (process.env.EXPO_PUBLIC_API_URL) {
        return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, '');
    }
    if (__DEV__) {
        return 'http://localhost:3000/api';
    }
    return 'http://localhost:3000/api';
}

const API_BASE_URL = getApiBaseUrl();
```

Remove the hardcoded `172.20.10.2` block entirely.

Update `apps/mobile/.env.example`:

```bash
# LAN URL for physical device / Expo Go (Mac IP + API port)
# Example: http://192.168.1.10:3000/api
EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:3000/api
```

Set local `apps/mobile/.env` to your Mac LAN IP:

```bash
EXPO_PUBLIC_API_URL=http://$(ipconfig getifaddr en0):3000/api
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -w @cost-share/mobile -- __tests__/services/api.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/services/api.ts apps/mobile/.env.example apps/mobile/__tests__/services/api.test.ts
git commit -m "fix(mobile): read API base URL from EXPO_PUBLIC_API_URL"
```

---

## Task 3: Mobile attach Supabase Bearer token on every API call

**Files:**
- Modify: `apps/mobile/services/api.ts`
- Test: `apps/mobile/__tests__/services/api.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `apps/mobile/__tests__/services/api.test.ts`:

```typescript
jest.mock('../../lib/supabase', () => ({
    supabase: {
        auth: {
            getSession: jest.fn(),
        },
    },
}));

import { supabase } from '../../lib/supabase';

describe('api auth headers', () => {
    beforeEach(() => {
        jest.resetModules();
        global.fetch = jest.fn().mockResolvedValue({
            json: async () => ({ success: true, data: [] }),
        }) as any;
    });

    it('sends Authorization Bearer when session exists', async () => {
        (supabase.auth.getSession as jest.Mock).mockResolvedValue({
            data: { session: { access_token: 'test-jwt-token' } },
        });

        const { apiGet } = require('../../services/api');
        await apiGet('/groups');

        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/groups'),
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: 'Bearer test-jwt-token',
                }),
            }),
        );
    });

    it('omits Authorization when no session', async () => {
        (supabase.auth.getSession as jest.Mock).mockResolvedValue({
            data: { session: null },
        });

        const { apiGet } = require('../../services/api');
        await apiGet('/groups');

        const [, options] = (global.fetch as jest.Mock).mock.calls[0];
        expect(options.headers.Authorization).toBeUndefined();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -w @cost-share/mobile -- __tests__/services/api.test.ts
```

Expected: FAIL — no `Authorization` header sent.

- [ ] **Step 3: Implement auth headers in apiRequest**

Update `apps/mobile/services/api.ts`:

```typescript
import { ApiResponse } from '@cost-share/shared';
import { supabase } from '../lib/supabase';

export function getApiBaseUrl(): string {
    // ... unchanged from Task 2
}

async function getAuthHeaders(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return {};
    return { Authorization: `Bearer ${session.access_token}` };
}

async function apiRequest<T>(
    endpoint: string,
    options?: RequestInit,
): Promise<ApiResponse<T>> {
    try {
        const authHeaders = await getAuthHeaders();
        const response = await fetch(`${getApiBaseUrl()}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...authHeaders,
                ...options?.headers,
            },
        });

        const data = await response.json();

        if (response.status === 401) {
            return { success: false, error: 'Unauthorized' };
        }

        return data;
    } catch (error) {
        console.error('API Error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
```

Remove the old `const API_BASE_URL = ...` if still present; use `getApiBaseUrl()` in `fetch`.

- [ ] **Step 4: Run tests**

```bash
npm test -w @cost-share/mobile -- __tests__/services/api.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/services/api.ts apps/mobile/__tests__/services/api.test.ts
git commit -m "feat(mobile): attach Supabase JWT to API requests"
```

---

## Task 4: NestJS auth module (JWT validation guard)

**Files:**
- Create: `apps/server/src/auth/auth.types.ts`
- Create: `apps/server/src/auth/auth.service.ts`
- Create: `apps/server/src/auth/supabase-auth.guard.ts`
- Create: `apps/server/src/auth/current-user.decorator.ts`
- Create: `apps/server/src/auth/auth.module.ts`
- Modify: `apps/server/src/app.module.ts`
- Modify: `apps/server/package.json` (add jest + test script)
- Test: `apps/server/src/auth/__tests__/supabase-auth.guard.spec.ts`

- [ ] **Step 1: Add Jest to server**

In `apps/server/package.json`, add scripts and devDependencies:

```json
"scripts": {
  "test": "jest",
  "test:watch": "jest --watch"
},
"devDependencies": {
  "@nestjs/testing": "^10.3.0",
  "@types/jest": "^29.5.14",
  "jest": "^29.7.0",
  "ts-jest": "^29.2.5"
}
```

Create `apps/server/jest.config.js`:

```javascript
/** @type {import('jest').Config} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['**/__tests__/**/*.spec.ts'],
};
```

Run from repo root:

```bash
npm install
```

- [ ] **Step 2: Write the failing guard test**

Create `apps/server/src/auth/__tests__/supabase-auth.guard.spec.ts`:

```typescript
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { SupabaseAuthGuard } from '../supabase-auth.guard';
import { AuthService } from '../auth.service';

describe('SupabaseAuthGuard', () => {
    const authService = {
        verifyAccessToken: jest.fn(),
    } as unknown as AuthService;

    const guard = new SupabaseAuthGuard(authService);

    const buildContext = (authorization?: string): ExecutionContext => {
        const request: { headers: Record<string, string>; user?: unknown } = {
            headers: authorization ? { authorization } : {},
        };
        return {
            switchToHttp: () => ({
                getRequest: () => request,
            }),
        } as ExecutionContext;
    };

    it('rejects requests without Bearer token', async () => {
        await expect(guard.canActivate(buildContext())).rejects.toBeInstanceOf(
            UnauthorizedException,
        );
    });

    it('accepts valid token and sets request.user', async () => {
        (authService.verifyAccessToken as jest.Mock).mockResolvedValue({
            id: 'user-uuid-1',
            email: 'a@example.com',
        });

        const ctx = buildContext('Bearer valid-token');
        const req = ctx.switchToHttp().getRequest();

        await expect(guard.canActivate(ctx)).resolves.toBe(true);
        expect(req.user).toEqual({ id: 'user-uuid-1', email: 'a@example.com' });
        expect(authService.verifyAccessToken).toHaveBeenCalledWith('valid-token');
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd cost-share-app
npm test -w @cost-share/server
```

Expected: FAIL — cannot find module `../supabase-auth.guard`.

- [ ] **Step 4: Implement auth module**

Create `apps/server/src/auth/auth.types.ts`:

```typescript
export interface AuthUser {
    id: string;
    email?: string;
}
```

Create `apps/server/src/auth/auth.service.ts`:

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { SupabaseService } from '../database/supabase.service';
import { AuthUser } from './auth.types';

@Injectable()
export class AuthService {
    constructor(private readonly supabase: SupabaseService) {}

    async verifyAccessToken(token: string): Promise<AuthUser> {
        const { data, error } = await this.supabase.client.auth.getUser(token);
        if (error || !data.user) {
            throw new UnauthorizedException('Invalid or expired token');
        }
        return {
            id: data.user.id,
            email: data.user.email ?? undefined,
        };
    }
}
```

Create `apps/server/src/auth/supabase-auth.guard.ts`:

```typescript
import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthUser } from './auth.types';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
    constructor(private readonly authService: AuthService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<{ headers: Record<string, string>; user?: AuthUser }>();
        const header = request.headers?.authorization ?? request.headers?.Authorization;

        if (!header?.startsWith('Bearer ')) {
            throw new UnauthorizedException('Missing Bearer token');
        }

        const token = header.slice('Bearer '.length).trim();
        request.user = await this.authService.verifyAccessToken(token);
        return true;
    }
}
```

Create `apps/server/src/auth/current-user.decorator.ts`:

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from './auth.types';

export const CurrentUser = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): AuthUser => {
        const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
        return request.user;
    },
);
```

Create `apps/server/src/auth/auth.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { SupabaseModule } from '../database/supabase.module';
import { AuthService } from './auth.service';
import { SupabaseAuthGuard } from './supabase-auth.guard';

@Module({
    imports: [SupabaseModule],
    providers: [
        AuthService,
        { provide: APP_GUARD, useClass: SupabaseAuthGuard },
    ],
    exports: [AuthService],
})
export class AuthModule {}
```

Update `apps/server/src/app.module.ts` — add `AuthModule` to imports:

```typescript
import { AuthModule } from './auth/auth.module';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        SupabaseModule,
        AuthModule,
    ],
    // ... rest unchanged
})
```

- [ ] **Step 5: Run tests**

```bash
npm test -w @cost-share/server
```

Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/auth apps/server/jest.config.js apps/server/package.json apps/server/src/app.module.ts package-lock.json
git commit -m "feat(server): add Supabase JWT auth guard"
```

---

## Task 5: Wire controllers to authenticated user

**Files:**
- Modify: `apps/server/src/controllers/groups.controller.ts`
- Modify: `apps/server/src/controllers/expenses.controller.ts`
- Modify: `apps/server/src/controllers/settlements.controller.ts`
- Modify: `apps/server/src/controllers/users.controller.ts`
- Modify: `apps/server/src/services/groups.service.ts`

- [ ] **Step 1: Add scoped group listing**

In `apps/server/src/services/groups.service.ts`, add method after `findAll`:

```typescript
    async findAllForUser(userId: string): Promise<Group[]> {
        const { data: memberships, error: memberErr } = await this.supabase.client
            .from('group_members')
            .select('group_id')
            .eq('user_id', userId)
            .eq('is_active', true);
        if (memberErr) throw memberErr;

        const groupIds = (memberships ?? []).map((m) => m.group_id as string);
        if (groupIds.length === 0) return [];

        const { data, error } = await this.supabase.client
            .from('groups')
            .select('*')
            .in('id', groupIds)
            .eq('is_active', true)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(groupFromRow);
    }
```

- [ ] **Step 2: Update groups controller**

Replace `apps/server/src/controllers/groups.controller.ts` imports and methods:

```typescript
import { Controller, Get, Post, Put, Delete, Body, Param, Query, ForbiddenException } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth.types';

// in findAll:
    @Get()
    async findAll(@CurrentUser() user: AuthUser): Promise<ApiResponse<Group[]>> {
        const groups = await this.groupsService.findAllForUser(user.id);
        return { success: true, data: groups };
    }

// in create:
    @Post()
    async create(
        @Body() dto: CreateGroupDto,
        @CurrentUser() user: AuthUser,
    ): Promise<ApiResponse<Group>> {
        const group = await this.groupsService.create(dto, user.id);
        return { success: true, data: group, message: 'Group created successfully' };
    }
```

- [ ] **Step 3: Update expenses controller create**

In `apps/server/src/controllers/expenses.controller.ts`:

```typescript
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth.types';

    @Post()
    async create(
        @Body() dto: CreateExpenseDto,
        @CurrentUser() user: AuthUser,
    ): Promise<ApiResponse<Expense> | ApiResponse<never>> {
        const createdBy = user.id;
        const result = await this.expensesService.create(dto, createdBy);
        if ('error' in result) return { success: false, error: result.error };
        return { success: true, data: result, message: 'Expense created successfully' };
    }
```

- [ ] **Step 4: Update settlements controller create**

In `apps/server/src/controllers/settlements.controller.ts`:

```typescript
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth.types';

    @Post()
    async createSettlement(
        @Body() dto: CreateSettlementDto,
        @CurrentUser() user: AuthUser,
    ) {
        return this.settlementsService.create(dto, user.id);
    }
```

- [ ] **Step 5: Restrict profile updates to self**

In `apps/server/src/controllers/users.controller.ts`:

```typescript
import { ForbiddenException } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth.types';

    @Put(':id')
    async update(
        @Param('id') id: string,
        @Body() dto: UpdateProfileDto,
        @CurrentUser() user: AuthUser,
    ): Promise<ApiResponse<User>> {
        if (user.id !== id) {
            throw new ForbiddenException('You can only update your own profile');
        }
        const updated = await this.usersService.update(id, dto);
        if (!updated) return { success: false, error: 'User not found' };
        return { success: true, data: updated };
    }
```

- [ ] **Step 6: Typecheck**

```bash
cd cost-share-app
npm run build -w @cost-share/shared --silent
npx tsc --noEmit -p apps/server
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/controllers apps/server/src/services/groups.service.ts
git commit -m "feat(server): derive createdBy from JWT and scope group listing"
```

---

## Task 6: Dev tooling + documentation

**Files:**
- Modify: `scripts/dev-start.sh`
- Modify: `cost-share-app/README.md`

- [ ] **Step 1: Print LAN API URL in dev-start**

In `start_services()` after the API URL line, add:

```bash
  LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')"
  if [[ -n "$LAN_IP" ]]; then
    echo "  Mobile API (set EXPO_PUBLIC_API_URL): http://${LAN_IP}:${API_PORT}/api"
  fi
```

- [ ] **Step 2: Update README stale sections**

In `cost-share-app/README.md`, replace bullet `- **In-memory mock data**` with:

```markdown
- **Supabase Postgres** via NestJS API (service role + JWT auth on requests)
```

Add subsection under Configure Supabase env:

```markdown
3. **Apply database schema and seed (one-time):**
   - Paste `apps/server/db/schema.sql` into Supabase SQL Editor → Run
   - `cd apps/server && npm run seed` (optional dev data)
   - Verify: `bash scripts/verify-supabase-schema.sh`

4. **Mobile API URL (physical device / Expo Go):**
   - Set `EXPO_PUBLIC_API_URL=http://<YOUR_MAC_LAN_IP>:3000/api` in `apps/mobile/.env`
   - `dev-start.sh` prints the suggested value on boot
```

Update checklist item `- [ ] Migrate to Supabase database` to `- [x] Migrate to Supabase database`.

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/scripts/dev-start.sh cost-share-app/README.md
git commit -m "docs: update DB setup instructions and print mobile API URL"
```

---

## Task 7: End-to-end manual verification

**Files:** none (manual QA)

- [ ] **Step 1: Start dev stack**

```bash
cd cost-share-app
bash scripts/dev-start.sh
```

Expected: preflight passes including `Supabase schema OK`; API on `:3000`, printed mobile API URL.

- [ ] **Step 2: Set mobile env and restart Expo**

Ensure `apps/mobile/.env` has matching `EXPO_PUBLIC_API_URL` and Supabase keys. Restart Expo if env changed.

- [ ] **Step 3: Mobile smoke test checklist**

1. Google sign-in succeeds; profile row exists in Supabase **Authentication → Users**
2. Groups list loads (empty or seeded groups where user is a member)
3. Create group → appears in list
4. Add expense → appears in group
5. Balances screen shows calculated debts
6. Create settlement → appears in history

- [ ] **Step 4: Verify unauthorized API call rejected**

```bash
curl -s http://localhost:3000/api/groups | head -c 200
```

Expected: JSON with 401 / Unauthorized (Nest exception message), not group data.

```bash
# With token from mobile session (copy access_token from Expo debugger logs or Supabase):
curl -s -H "Authorization: Bearer <access_token>" http://localhost:3000/api/groups
```

Expected: `{ "success": true, "data": [...] }`

---

## Spec self-review (plan vs A+B design)

| Requirement | Task |
|-------------|------|
| Apply `schema.sql` | Task 1 |
| Optional seed | Task 1 Step 3 |
| Google OAuth redirect URLs | Task 1 Step 2 |
| Fix API base URL (env) | Task 2 |
| Fix group creator (`createdBy`) | Task 5 |
| Mobile sends Bearer JWT | Task 3 |
| Nest validates JWT | Task 4 |
| `createdBy` from `auth.uid()` | Task 5 |
| Preflight schema check | Task 1 Step 4–5 |
| E2E manual verification | Task 7 |

No TBD/TODO placeholders in implementation steps. Gaps intentionally deferred (YAGNI): membership checks on every write, filtering expenses/settlements by user — follow-up after E2E green.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-19-mobile-db-e2e-ab-plan.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
