# Sentry Admin Error Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the in-app admin error dashboard that surfaces Sentry issues to admins via a Supabase Edge Function proxy + three React Native screens, plus the missing test coverage for the already-merged Sentry wiring.

**Architecture:** New Supabase Edge Function `admin-sentry-proxy` re-verifies `is_app_admin()` on every call and proxies three Sentry REST endpoints (`list_issues`, `issue_events`, `issue_detail`). Mobile app gets a typed service wrapper, React Query hooks, three new admin screens with RTL-aware NativeWind styling, and a new row on `AdminPortalScreen`. The existing Sentry init/capture wiring on `dev` gets its missing test coverage.

**Tech Stack:** Deno (Edge Function), TypeScript, React Native (Expo SDK 55), `@sentry/react-native`, `@supabase/supabase-js`, `@tanstack/react-query`, NativeWind, `react-i18next`, Jest + Testing Library, `superpowers:test-driven-development` discipline.

**Branching note:** PR #33 already merged to `dev`. Start from `dev` (NOT `feature/sentry-error-tracking`). New branch: `feature/sentry-admin-dashboard`. PR targets `dev`.

**Hard constraints (do not violate):**
- **No `git commit` without an explicit current-turn user OK.** This project's memory (`feedback_git_commits.md`) requires it.
- Do NOT run `eas build` or `supabase secrets set` from this session. Document them for the user.
- Mobile workspace must remain green: `npm test --workspace=@cost-share/mobile` and `npm run lint` (run from `cost-share-app`).
- Edge Function tests are Deno-based and NOT run in CI today. Document the run command in the PR.

---

## File Structure

### New files

- `cost-share-app/supabase/functions/admin-sentry-proxy/index.ts` — `Deno.serve` entry; delegates to handler.
- `cost-share-app/supabase/functions/admin-sentry-proxy/handler.ts` — pure handler `handleRequest(req, env, fetchFn)`; testable without `Deno.serve`.
- `cost-share-app/supabase/functions/admin-sentry-proxy/cors.ts` — CORS headers + preflight helper.
- `cost-share-app/supabase/functions/admin-sentry-proxy/deno.json` — Deno import map.
- `cost-share-app/supabase/functions/admin-sentry-proxy/index.test.ts` — Deno tests for `handleRequest`.
- `cost-share-app/apps/mobile/services/adminSentry.service.ts` — typed client over `supabase.functions.invoke('admin-sentry-proxy', ...)`.
- `cost-share-app/apps/mobile/hooks/queries/useAdminSentryQueries.ts` — `useSentryIssuesQuery`, `useSentryIssueDetailQuery`, `useSentryIssueEventsQuery`.
- `cost-share-app/apps/mobile/screens/admin/AdminErrorsScreen.tsx` — issue list with filter row.
- `cost-share-app/apps/mobile/screens/admin/AdminErrorDetailScreen.tsx` — issue header + events list.
- `cost-share-app/apps/mobile/screens/admin/AdminErrorEventScreen.tsx` — event detail (stack, tags, user).
- `cost-share-app/apps/mobile/lib/sentryIdentity.ts` — pure helpers `applySentryUser`, `applySentryLanguage` (extracted from App.tsx for testability).
- `cost-share-app/apps/mobile/__tests__/lib/sentry.test.ts` — covers init/identity/capture.
- `cost-share-app/apps/mobile/__tests__/screens/admin/AdminErrorsScreen.test.tsx` — list + filter + nav + error-state tests.

### Modified files

- `cost-share-app/apps/mobile/App.tsx:74-90` — Replace the two `useEffect`s that touch Sentry directly with calls to `applySentryUser` / `applySentryLanguage` from `lib/sentryIdentity.ts`.
- `cost-share-app/apps/mobile/screens/admin/AdminPortalScreen.tsx` — Add an "Errors" row.
- `cost-share-app/apps/mobile/navigation/AppNavigator.tsx` — Import three new screens, add three new `Stack.Screen`s to `ProfileStack`.
- `cost-share-app/apps/mobile/i18n/locales/en.json` — Add `admin.errors.*` namespace (next to the existing `admin.errors.notAuthorized` key — KEEP THAT KEY).
- `cost-share-app/apps/mobile/i18n/locales/he.json` — Same as en.json with Hebrew translations.
- `cost-share-app/apps/mobile/jest-setup.ts` — Extend the supabase mock with `functions.invoke`.

---

## Task 0: Branch + worktree setup

**Files:** None (git only).

- [ ] **Step 1: Confirm starting state**

```bash
git fetch origin
git branch --show-current
git log --oneline origin/dev -5
```

Expected: PR #33 merge commit ("Wire Sentry error tracking…") visible in `origin/dev` log.

- [ ] **Step 2: Create the feature branch from `origin/dev`**

```bash
git switch -c feature/sentry-admin-dashboard origin/dev
```

Expected: switched to a new branch tracking the latest `dev`.

- [ ] **Step 3: Sanity-check the workspace**

```bash
cd cost-share-app && npm ci && cd ..
```

Expected: clean install, no failures.

---

## Task 1: Edge Function — directory skeleton + CORS + deno.json

**Files:**
- Create: `cost-share-app/supabase/functions/admin-sentry-proxy/deno.json`
- Create: `cost-share-app/supabase/functions/admin-sentry-proxy/cors.ts`

- [ ] **Step 1: Write `deno.json`**

```json
{
    "imports": {
        "supabase": "https://esm.sh/@supabase/supabase-js@2",
        "@std/assert": "jsr:@std/assert@1"
    }
}
```

- [ ] **Step 2: Write `cors.ts`**

```ts
// Mirrors the cross-origin posture of `invite-landing`. The mobile app uses
// supabase.functions.invoke which doesn't enforce CORS, but keeping consistent
// headers means this function also works from any web debug surface (e.g. a
// quick fetch from claude.ai/code).

export const CORS_HEADERS: HeadersInit = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
    'Access-Control-Max-Age': '86400',
};

export function preflight(req: Request): Response | null {
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    return null;
}

export function jsonResponse(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/json; charset=utf-8',
        },
    });
}
```

---

## Task 2: Edge Function — handler shell + admin gate

**Files:**
- Create: `cost-share-app/supabase/functions/admin-sentry-proxy/handler.ts`

- [ ] **Step 1: Write the handler shell with admin gate**

```ts
// admin-sentry-proxy handler.
// Re-verifies is_app_admin() on every call and proxies a fixed allowlist of
// Sentry REST endpoints. Exported as a pure function so it is testable without
// Deno.serve.

import { createClient, type SupabaseClient } from 'supabase';
import { CORS_HEADERS, jsonResponse, preflight } from './cors.ts';

export interface ProxyEnv {
    SUPABASE_URL: string;
    SUPABASE_ANON_KEY: string;
    SENTRY_API_TOKEN: string;
    SENTRY_ORG: string;
    SENTRY_PROJECT_DEV: string;
    SENTRY_PROJECT_PROD: string;
}

export type FetchFn = typeof fetch;

interface IssueSummary {
    id: string;
    shortId: string;
    title: string;
    level: string;
    status: string;
    count: string;
    userCount: number;
    firstSeen: string;
    lastSeen: string;
    culprit: string | null;
    metadata: Record<string, unknown>;
}

interface ActionListIssues {
    action: 'list_issues';
    environment: 'dev' | 'prod';
    status?: 'unresolved' | 'all';
    timeRange?: '24h' | '7d' | '30d';
    limit?: number;
}
interface ActionIssueEvents {
    action: 'issue_events';
    issueId: string;
}
interface ActionIssueDetail {
    action: 'issue_detail';
    issueId: string;
}
type ProxyAction = ActionListIssues | ActionIssueEvents | ActionIssueDetail;

async function isCallerAdmin(client: SupabaseClient): Promise<boolean> {
    const { data, error } = await client.rpc('is_app_admin');
    if (error) return false;
    return data === true;
}

function makeAuthedClient(env: ProxyEnv, jwt: string): SupabaseClient {
    return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
        auth: { persistSession: false, autoRefreshToken: false },
    });
}

export async function handleRequest(
    req: Request,
    env: ProxyEnv,
    fetchFn: FetchFn = fetch,
): Promise<Response> {
    const pre = preflight(req);
    if (pre) return pre;

    if (req.method !== 'POST') {
        return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);
    }

    const auth = req.headers.get('authorization') ?? '';
    const jwt = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
    if (!jwt) {
        return jsonResponse({ ok: false, error: 'missing_authorization' }, 401);
    }

    const client = makeAuthedClient(env, jwt);
    if (!(await isCallerAdmin(client))) {
        return jsonResponse({ ok: false, error: 'forbidden' }, 403);
    }

    let body: ProxyAction;
    try {
        body = (await req.json()) as ProxyAction;
    } catch {
        return jsonResponse({ ok: false, error: 'invalid_json' }, 400);
    }

    switch (body.action) {
        case 'list_issues':
            return await proxyListIssues(body, env, fetchFn);
        case 'issue_events':
            return await proxyIssueEvents(body, env, fetchFn);
        case 'issue_detail':
            return await proxyIssueDetail(body, env, fetchFn);
        default:
            return jsonResponse({ ok: false, error: 'invalid_action' }, 400);
    }
}

// Stubs filled in by Tasks 3-5.
async function proxyListIssues(
    _body: ActionListIssues, _env: ProxyEnv, _fetchFn: FetchFn,
): Promise<Response> {
    return jsonResponse({ ok: false, error: 'not_implemented' }, 501);
}
async function proxyIssueEvents(
    _body: ActionIssueEvents, _env: ProxyEnv, _fetchFn: FetchFn,
): Promise<Response> {
    return jsonResponse({ ok: false, error: 'not_implemented' }, 501);
}
async function proxyIssueDetail(
    _body: ActionIssueDetail, _env: ProxyEnv, _fetchFn: FetchFn,
): Promise<Response> {
    return jsonResponse({ ok: false, error: 'not_implemented' }, 501);
}

export type { IssueSummary, ProxyAction };
```

- [ ] **Step 2: Create the `index.ts` entrypoint**

`cost-share-app/supabase/functions/admin-sentry-proxy/index.ts`:

```ts
// admin-sentry-proxy: admin-gated proxy over the Sentry REST API.
// See docs/superpowers/specs/2026-06-02-error-tracking-with-sentry-design.md §3.

import { handleRequest, type ProxyEnv } from './handler.ts';

const env: ProxyEnv = {
    SUPABASE_URL: Deno.env.get('SUPABASE_URL') ?? '',
    SUPABASE_ANON_KEY: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    SENTRY_API_TOKEN: Deno.env.get('SENTRY_API_TOKEN') ?? '',
    SENTRY_ORG: Deno.env.get('SENTRY_ORG') ?? '',
    SENTRY_PROJECT_DEV: Deno.env.get('SENTRY_PROJECT_DEV') ?? '',
    SENTRY_PROJECT_PROD: Deno.env.get('SENTRY_PROJECT_PROD') ?? '',
};

Deno.serve((req) => handleRequest(req, env));
```

---

## Task 3: Edge Function — `list_issues` action

**Files:**
- Modify: `cost-share-app/supabase/functions/admin-sentry-proxy/handler.ts` (replace `proxyListIssues` stub)

- [ ] **Step 1: Replace `proxyListIssues` with the real implementation**

Replace the entire `async function proxyListIssues(...)` stub with:

```ts
function projectSlug(env: ProxyEnv, environment: 'dev' | 'prod'): string {
    return environment === 'prod' ? env.SENTRY_PROJECT_PROD : env.SENTRY_PROJECT_DEV;
}

function statsPeriod(range: '24h' | '7d' | '30d'): string {
    return range;
}

async function callSentry(
    url: string,
    env: ProxyEnv,
    fetchFn: FetchFn,
): Promise<Response> {
    let upstream: Response;
    try {
        upstream = await fetchFn(url, {
            headers: {
                Authorization: `Bearer ${env.SENTRY_API_TOKEN}`,
                Accept: 'application/json',
            },
        });
    } catch (err) {
        return jsonResponse({
            ok: false,
            status: 502,
            error: 'sentry_unreachable',
            detail: (err as Error).message,
        }, 502);
    }

    if (upstream.status >= 500) {
        const text = await upstream.text().catch(() => '');
        return jsonResponse({
            ok: false,
            status: 502,
            error: 'sentry_server_error',
            upstreamStatus: upstream.status,
            detail: text.slice(0, 500),
        }, 502);
    }

    if (!upstream.ok) {
        const text = await upstream.text().catch(() => '');
        return jsonResponse({
            ok: false,
            status: upstream.status,
            error: 'sentry_client_error',
            detail: text.slice(0, 500),
        }, upstream.status);
    }

    const data = await upstream.json();
    return { ok: true, data, response: upstream } as unknown as Response;
}

interface SentryListIssueRaw {
    id?: string;
    shortId?: string;
    title?: string;
    level?: string;
    status?: string;
    count?: string;
    userCount?: number;
    firstSeen?: string;
    lastSeen?: string;
    culprit?: string | null;
    metadata?: Record<string, unknown>;
}

function trimIssue(raw: SentryListIssueRaw): IssueSummary {
    return {
        id: raw.id ?? '',
        shortId: raw.shortId ?? '',
        title: raw.title ?? '',
        level: raw.level ?? 'error',
        status: raw.status ?? 'unresolved',
        count: raw.count ?? '0',
        userCount: raw.userCount ?? 0,
        firstSeen: raw.firstSeen ?? '',
        lastSeen: raw.lastSeen ?? '',
        culprit: raw.culprit ?? null,
        metadata: raw.metadata ?? {},
    };
}

async function proxyListIssues(
    body: ActionListIssues,
    env: ProxyEnv,
    fetchFn: FetchFn,
): Promise<Response> {
    if (body.environment !== 'dev' && body.environment !== 'prod') {
        return jsonResponse({ ok: false, error: 'invalid_environment' }, 400);
    }
    const project = projectSlug(env, body.environment);
    const status = body.status === 'all' ? '' : 'is:unresolved';
    const range = body.timeRange ?? '24h';
    const limit = Math.min(Math.max(body.limit ?? 25, 1), 100);
    const params = new URLSearchParams({
        environment: body.environment === 'prod' ? 'production' : 'development',
        statsPeriod: statsPeriod(range),
        query: status,
        limit: String(limit),
        sort: 'date',
    });
    const url = `https://sentry.io/api/0/projects/${env.SENTRY_ORG}/${project}/issues/?${params.toString()}`;

    const result = await callSentry(url, env, fetchFn);
    // callSentry returns either a Response (error) or a sentinel object.
    if (result instanceof Response) return result;
    const { data } = result as unknown as { data: SentryListIssueRaw[] };
    const issues = Array.isArray(data) ? data.map(trimIssue) : [];
    return jsonResponse({ ok: true, data: issues }, 200);
}
```

Note: The `result instanceof Response` check is intentional — `callSentry` returns a `Response` on error, otherwise a `{ ok, data }` sentinel. Confirm by inspecting the runtime type before using.

- [ ] **Step 2: Quick smoke type-check**

```bash
cd cost-share-app/supabase/functions/admin-sentry-proxy
deno check handler.ts 2>&1 | head -40
```

Expected: clean (or only warnings about unused stubs in `proxyIssueEvents`/`proxyIssueDetail`).

---

## Task 4: Edge Function — `issue_events` action

**Files:**
- Modify: `cost-share-app/supabase/functions/admin-sentry-proxy/handler.ts` (replace `proxyIssueEvents` stub)

- [ ] **Step 1: Replace `proxyIssueEvents`**

Replace the stub with:

```ts
interface EventTagRaw { key?: string; value?: string }
interface SentryEventRaw {
    id?: string;
    eventID?: string;
    dateCreated?: string;
    tags?: EventTagRaw[];
    user?: { id?: string; email?: string; username?: string } | null;
    entries?: Array<{ type?: string; data?: unknown }>;
}

interface SlimEvent {
    id: string;
    dateCreated: string;
    tags: Record<string, string>;
    user: { id: string | null; email: string | null; username: string | null } | null;
    exception: { type: string | null; value: string | null; topFrame: string | null } | null;
}

const KEEP_TAGS = new Set([
    'device.model',
    'device',
    'os.version',
    'os',
    'app.version',
    'release',
    'environment',
    'routing.route.name',
    'app_language',
    'default_currency',
]);

function trimTags(tags?: EventTagRaw[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const t of tags ?? []) {
        if (!t.key || t.value == null) continue;
        if (!KEEP_TAGS.has(t.key)) continue;
        out[t.key] = String(t.value);
    }
    return out;
}

function trimExceptionEntry(
    entries?: Array<{ type?: string; data?: unknown }>,
): SlimEvent['exception'] {
    const ex = entries?.find((e) => e.type === 'exception');
    if (!ex || typeof ex.data !== 'object' || ex.data == null) return null;
    const data = ex.data as { values?: Array<{ type?: string; value?: string; stacktrace?: { frames?: Array<{ filename?: string; lineno?: number; function?: string }> } }> };
    const first = data.values?.[0];
    if (!first) return null;
    const frames = first.stacktrace?.frames ?? [];
    const top = frames[frames.length - 1];
    const topFrame = top
        ? `${top.function ?? '<anon>'} (${top.filename ?? '?'}:${top.lineno ?? 0})`
        : null;
    return {
        type: first.type ?? null,
        value: first.value ?? null,
        topFrame,
    };
}

function trimEvent(raw: SentryEventRaw): SlimEvent {
    return {
        id: raw.id ?? raw.eventID ?? '',
        dateCreated: raw.dateCreated ?? '',
        tags: trimTags(raw.tags),
        user: raw.user
            ? {
                id: raw.user.id ?? null,
                email: raw.user.email ?? null,
                username: raw.user.username ?? null,
            }
            : null,
        exception: trimExceptionEntry(raw.entries),
    };
}

async function proxyIssueEvents(
    body: ActionIssueEvents,
    env: ProxyEnv,
    fetchFn: FetchFn,
): Promise<Response> {
    if (!body.issueId || typeof body.issueId !== 'string') {
        return jsonResponse({ ok: false, error: 'invalid_issue_id' }, 400);
    }
    const url = `https://sentry.io/api/0/issues/${encodeURIComponent(body.issueId)}/events/?limit=20`;
    const result = await callSentry(url, env, fetchFn);
    if (result instanceof Response) return result;
    const { data } = result as unknown as { data: SentryEventRaw[] };
    const events = Array.isArray(data) ? data.map(trimEvent) : [];
    return jsonResponse({ ok: true, data: events }, 200);
}

export type { SlimEvent };
```

---

## Task 5: Edge Function — `issue_detail` action

**Files:**
- Modify: `cost-share-app/supabase/functions/admin-sentry-proxy/handler.ts` (replace `proxyIssueDetail` stub)

- [ ] **Step 1: Replace `proxyIssueDetail`**

Replace the stub with:

```ts
interface SentryIssueDetailRaw {
    id?: string;
    shortId?: string;
    title?: string;
    culprit?: string | null;
    level?: string;
    status?: string;
    count?: string;
    userCount?: number;
    firstSeen?: string;
    lastSeen?: string;
    metadata?: Record<string, unknown>;
    project?: { id?: string; name?: string; slug?: string };
}

interface IssueDetail {
    id: string;
    shortId: string;
    title: string;
    culprit: string | null;
    level: string;
    status: string;
    count: string;
    userCount: number;
    firstSeen: string;
    lastSeen: string;
    metadata: Record<string, unknown>;
    project: { id: string | null; name: string | null; slug: string | null };
}

function trimDetail(raw: SentryIssueDetailRaw): IssueDetail {
    return {
        id: raw.id ?? '',
        shortId: raw.shortId ?? '',
        title: raw.title ?? '',
        culprit: raw.culprit ?? null,
        level: raw.level ?? 'error',
        status: raw.status ?? 'unresolved',
        count: raw.count ?? '0',
        userCount: raw.userCount ?? 0,
        firstSeen: raw.firstSeen ?? '',
        lastSeen: raw.lastSeen ?? '',
        metadata: raw.metadata ?? {},
        project: {
            id: raw.project?.id ?? null,
            name: raw.project?.name ?? null,
            slug: raw.project?.slug ?? null,
        },
    };
}

async function proxyIssueDetail(
    body: ActionIssueDetail,
    env: ProxyEnv,
    fetchFn: FetchFn,
): Promise<Response> {
    if (!body.issueId || typeof body.issueId !== 'string') {
        return jsonResponse({ ok: false, error: 'invalid_issue_id' }, 400);
    }
    const url = `https://sentry.io/api/0/issues/${encodeURIComponent(body.issueId)}/`;
    const result = await callSentry(url, env, fetchFn);
    if (result instanceof Response) return result;
    const { data } = result as unknown as { data: SentryIssueDetailRaw };
    return jsonResponse({ ok: true, data: trimDetail(data) }, 200);
}

export type { IssueDetail };
```

- [ ] **Step 2: Type-check the complete handler**

```bash
cd cost-share-app/supabase/functions/admin-sentry-proxy
deno check handler.ts index.ts
```

Expected: no errors. Warnings about unused export are acceptable.

---

## Task 6: Edge Function — Deno tests

**Files:**
- Create: `cost-share-app/supabase/functions/admin-sentry-proxy/index.test.ts`

- [ ] **Step 1: Write the Deno test file**

```ts
import { assertEquals, assertStringIncludes } from '@std/assert';
import { handleRequest, type ProxyEnv } from './handler.ts';

const baseEnv: ProxyEnv = {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'anon-key',
    SENTRY_API_TOKEN: 'sentry-token',
    SENTRY_ORG: 'copay-hb',
    SENTRY_PROJECT_DEV: 'copay-mobile-dev',
    SENTRY_PROJECT_PROD: 'copay-mobile-prod',
};

// Patches the global `fetch` Supabase RPC call uses, scoped to the test body.
function withSupabaseAdmin(isAdmin: boolean, fn: () => Promise<void>): () => Promise<void> {
    return async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
            const url = typeof input === 'string' ? input : input.toString();
            // Supabase REST RPC POST to /rest/v1/rpc/is_app_admin.
            if (url.includes('/rest/v1/rpc/is_app_admin')) {
                return Promise.resolve(
                    new Response(JSON.stringify(isAdmin), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    }),
                );
            }
            return originalFetch(input as RequestInfo, init);
        }) as typeof fetch;
        try {
            await fn();
        } finally {
            globalThis.fetch = originalFetch;
        }
    };
}

Deno.test(
    'non-admin JWT returns 403',
    withSupabaseAdmin(false, async () => {
        const req = new Request('https://x/admin-sentry-proxy', {
            method: 'POST',
            headers: { Authorization: 'Bearer fake-jwt', 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'list_issues', environment: 'dev' }),
        });
        const res = await handleRequest(req, baseEnv);
        assertEquals(res.status, 403);
        const json = await res.json();
        assertEquals(json.ok, false);
        assertEquals(json.error, 'forbidden');
    }),
);

Deno.test(
    'missing authorization returns 401',
    async () => {
        const req = new Request('https://x/admin-sentry-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'list_issues', environment: 'dev' }),
        });
        const res = await handleRequest(req, baseEnv);
        assertEquals(res.status, 401);
    },
);

Deno.test(
    'invalid action returns 400',
    withSupabaseAdmin(true, async () => {
        const req = new Request('https://x/admin-sentry-proxy', {
            method: 'POST',
            headers: { Authorization: 'Bearer jwt', 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'bogus' }),
        });
        const res = await handleRequest(req, baseEnv);
        assertEquals(res.status, 400);
        const json = await res.json();
        assertEquals(json.error, 'invalid_action');
    }),
);

Deno.test(
    'list_issues hits the correct Sentry URL with bearer token',
    withSupabaseAdmin(true, async () => {
        const calls: { url: string; auth: string | null }[] = [];
        const sentryFetch: typeof fetch = (input, init) => {
            const url = typeof input === 'string' ? input : input.toString();
            const auth = (init?.headers as Record<string, string> | undefined)?.['Authorization'] ?? null;
            calls.push({ url, auth });
            return Promise.resolve(
                new Response(JSON.stringify([
                    { id: '99', shortId: 'COPAY-1', title: 'Boom', level: 'error', status: 'unresolved', count: '7', userCount: 3, firstSeen: '2026-06-01', lastSeen: '2026-06-02', culprit: 'foo.ts:42', metadata: {} },
                ]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
            );
        };
        const req = new Request('https://x/admin-sentry-proxy', {
            method: 'POST',
            headers: { Authorization: 'Bearer jwt', 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'list_issues', environment: 'dev', limit: 10 }),
        });
        const res = await handleRequest(req, baseEnv, sentryFetch);
        assertEquals(res.status, 200);
        assertEquals(calls.length, 1);
        assertStringIncludes(calls[0].url, 'sentry.io/api/0/projects/copay-hb/copay-mobile-dev/issues/');
        assertStringIncludes(calls[0].url, 'environment=development');
        assertStringIncludes(calls[0].url, 'limit=10');
        assertEquals(calls[0].auth, 'Bearer sentry-token');
        const json = await res.json();
        assertEquals(json.ok, true);
        assertEquals(json.data[0].shortId, 'COPAY-1');
    }),
);

Deno.test(
    'list_issues for prod uses prod project + environment=production',
    withSupabaseAdmin(true, async () => {
        const captured: string[] = [];
        const sentryFetch: typeof fetch = (input) => {
            captured.push(typeof input === 'string' ? input : input.toString());
            return Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
        };
        const req = new Request('https://x/admin-sentry-proxy', {
            method: 'POST',
            headers: { Authorization: 'Bearer jwt', 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'list_issues', environment: 'prod' }),
        });
        await handleRequest(req, baseEnv, sentryFetch);
        assertStringIncludes(captured[0], '/projects/copay-hb/copay-mobile-prod/issues/');
        assertStringIncludes(captured[0], 'environment=production');
    }),
);

Deno.test(
    'Sentry 5xx is translated to 502 with structured error',
    withSupabaseAdmin(true, async () => {
        const sentryFetch: typeof fetch = () =>
            Promise.resolve(new Response('upstream boom', { status: 503 }));
        const req = new Request('https://x/admin-sentry-proxy', {
            method: 'POST',
            headers: { Authorization: 'Bearer jwt', 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'list_issues', environment: 'dev' }),
        });
        const res = await handleRequest(req, baseEnv, sentryFetch);
        assertEquals(res.status, 502);
        const json = await res.json();
        assertEquals(json.ok, false);
        assertEquals(json.error, 'sentry_server_error');
        assertEquals(json.upstreamStatus, 503);
    }),
);

Deno.test(
    'Sentry 401 token problem passes through to caller',
    withSupabaseAdmin(true, async () => {
        const sentryFetch: typeof fetch = () =>
            Promise.resolve(new Response('bad token', { status: 401 }));
        const req = new Request('https://x/admin-sentry-proxy', {
            method: 'POST',
            headers: { Authorization: 'Bearer jwt', 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'list_issues', environment: 'dev' }),
        });
        const res = await handleRequest(req, baseEnv, sentryFetch);
        assertEquals(res.status, 401);
        const json = await res.json();
        assertEquals(json.error, 'sentry_client_error');
    }),
);

Deno.test(
    'issue_events trims tags and exception',
    withSupabaseAdmin(true, async () => {
        const sentryFetch: typeof fetch = () =>
            Promise.resolve(new Response(JSON.stringify([
                {
                    id: 'evt-1',
                    dateCreated: '2026-06-02T00:00:00Z',
                    tags: [
                        { key: 'device.model', value: 'iPhone15,3' },
                        { key: 'os.version', value: '17.4' },
                        { key: 'browser', value: 'irrelevant' },
                    ],
                    user: { id: 'u1', email: 'a@b', username: 'a' },
                    entries: [{
                        type: 'exception',
                        data: {
                            values: [{
                                type: 'TypeError',
                                value: 'x is undefined',
                                stacktrace: { frames: [{ filename: 'foo.ts', lineno: 12, function: 'doStuff' }] },
                            }],
                        },
                    }],
                },
            ]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        const req = new Request('https://x/admin-sentry-proxy', {
            method: 'POST',
            headers: { Authorization: 'Bearer jwt', 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'issue_events', issueId: 'abc' }),
        });
        const res = await handleRequest(req, baseEnv, sentryFetch);
        assertEquals(res.status, 200);
        const json = await res.json();
        assertEquals(json.data[0].id, 'evt-1');
        assertEquals(json.data[0].tags['device.model'], 'iPhone15,3');
        assertEquals(json.data[0].tags.browser, undefined);
        assertEquals(json.data[0].exception?.type, 'TypeError');
        assertStringIncludes(json.data[0].exception?.topFrame ?? '', 'doStuff (foo.ts:12)');
    }),
);
```

- [ ] **Step 2: Run the Deno tests locally**

```bash
cd cost-share-app/supabase/functions/admin-sentry-proxy
deno test --allow-net --allow-env index.test.ts
```

Expected: 8 passing tests.

If `deno` is not installed locally, document this as a manual step in the PR description and skip running the tests in CI.

---

## Task 7: Mobile service layer — `adminSentry.service.ts`

**Files:**
- Create: `cost-share-app/apps/mobile/services/adminSentry.service.ts`

- [ ] **Step 1: Write the service wrapper**

```ts
/**
 * Admin Sentry Service — typed wrappers over the admin-sentry-proxy Edge Function.
 *
 * The Edge Function re-verifies is_app_admin() per call, so failures here can
 * mean (1) the caller is not actually admin, (2) the Sentry token is misconfigured,
 * or (3) Sentry is down. UI surfaces these as a generic retry-able empty state.
 */
import { supabase } from '../lib/supabase';

export type SentryEnvironment = 'dev' | 'prod';
export type SentryStatusFilter = 'unresolved' | 'all';
export type SentryTimeRange = '24h' | '7d' | '30d';
export type SentryLevel = 'fatal' | 'error' | 'warning' | 'info' | 'debug';

export interface SentryIssueSummary {
    id: string;
    shortId: string;
    title: string;
    level: SentryLevel | string;
    status: string;
    count: string;
    userCount: number;
    firstSeen: string;
    lastSeen: string;
    culprit: string | null;
    metadata: Record<string, unknown>;
}

export interface SentryIssueDetail extends SentryIssueSummary {
    project: { id: string | null; name: string | null; slug: string | null };
}

export interface SentryEventSummary {
    id: string;
    dateCreated: string;
    tags: Record<string, string>;
    user: { id: string | null; email: string | null; username: string | null } | null;
    exception: { type: string | null; value: string | null; topFrame: string | null } | null;
}

export interface ListIssuesParams {
    environment: SentryEnvironment;
    status?: SentryStatusFilter;
    timeRange?: SentryTimeRange;
    limit?: number;
}

interface ProxyResponse<T> {
    ok: boolean;
    data?: T;
    error?: string;
    status?: number;
}

async function invokeProxy<T>(body: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.functions.invoke<ProxyResponse<T>>(
        'admin-sentry-proxy',
        { body },
    );
    if (error) throw error;
    if (!data || data.ok === false) {
        throw new Error(data?.error ?? 'admin_sentry_proxy_failed');
    }
    return data.data as T;
}

export function fetchSentryIssues(params: ListIssuesParams): Promise<SentryIssueSummary[]> {
    return invokeProxy<SentryIssueSummary[]>({
        action: 'list_issues',
        environment: params.environment,
        status: params.status ?? 'unresolved',
        timeRange: params.timeRange ?? '24h',
        limit: params.limit ?? 25,
    });
}

export function fetchSentryIssueDetail(issueId: string): Promise<SentryIssueDetail> {
    return invokeProxy<SentryIssueDetail>({ action: 'issue_detail', issueId });
}

export function fetchSentryIssueEvents(issueId: string): Promise<SentryEventSummary[]> {
    return invokeProxy<SentryEventSummary[]>({ action: 'issue_events', issueId });
}
```

- [ ] **Step 2: Verify TS compiles**

```bash
cd cost-share-app && npx tsc --noEmit -p apps/mobile/tsconfig.json 2>&1 | head -30
```

Expected: no errors related to `adminSentry.service.ts`.

---

## Task 8: Mobile query hooks

**Files:**
- Modify: `cost-share-app/apps/mobile/hooks/queries/keys.ts` (add admin-sentry keys)
- Create: `cost-share-app/apps/mobile/hooks/queries/useAdminSentryQueries.ts`

- [ ] **Step 1: Extend `keys.ts`**

Read the file, then append the new key family. The append goes immediately before the closing `}` of `queryKeys`:

```ts
    adminSentryIssues: (params: { environment: 'dev' | 'prod'; status: 'unresolved' | 'all'; timeRange: '24h' | '7d' | '30d' }) =>
        ['adminSentryIssues', params.environment, params.status, params.timeRange] as const,
    adminSentryIssueDetail: (issueId: string) =>
        ['adminSentryIssueDetail', issueId] as const,
    adminSentryIssueEvents: (issueId: string) =>
        ['adminSentryIssueEvents', issueId] as const,
```

If `queryKeys` is structured as a const-object literal (read `keys.ts` first), insert by adding lines before the trailing `}` brace. Do not change the formatting of existing keys.

- [ ] **Step 2: Write `useAdminSentryQueries.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import {
    fetchSentryIssues,
    fetchSentryIssueDetail,
    fetchSentryIssueEvents,
    type ListIssuesParams,
} from '../../services/adminSentry.service';
import { queryKeys } from './keys';

const STALE_MS = 30_000;

export function useSentryIssuesQuery(params: ListIssuesParams) {
    return useQuery({
        queryKey: queryKeys.adminSentryIssues({
            environment: params.environment,
            status: params.status ?? 'unresolved',
            timeRange: params.timeRange ?? '24h',
        }),
        queryFn: () => fetchSentryIssues(params),
        staleTime: STALE_MS,
        retry: 1,
    });
}

export function useSentryIssueDetailQuery(issueId: string) {
    return useQuery({
        queryKey: queryKeys.adminSentryIssueDetail(issueId),
        queryFn: () => fetchSentryIssueDetail(issueId),
        staleTime: STALE_MS,
        retry: 1,
        enabled: !!issueId,
    });
}

export function useSentryIssueEventsQuery(issueId: string) {
    return useQuery({
        queryKey: queryKeys.adminSentryIssueEvents(issueId),
        queryFn: () => fetchSentryIssueEvents(issueId),
        staleTime: STALE_MS,
        retry: 1,
        enabled: !!issueId,
    });
}
```

---

## Task 9: i18n strings (en + he)

**Files:**
- Modify: `cost-share-app/apps/mobile/i18n/locales/en.json`
- Modify: `cost-share-app/apps/mobile/i18n/locales/he.json`

- [ ] **Step 1: Add `admin.errors.*` to en.json**

Read the file, then locate the existing `admin.errors` object (currently just `{ "notAuthorized": "..." }`) and replace it with:

```json
"errors": {
    "notAuthorized": "You don't have permission for this action",
    "portalRow": "Errors",
    "screenTitle": "Errors",
    "detailTitle": "Issue",
    "eventTitle": "Event",
    "filters": {
        "environment": "Environment",
        "envDev": "Dev",
        "envProd": "Prod",
        "status": "Status",
        "statusUnresolved": "Unresolved",
        "statusAll": "All",
        "timeRange": "Time",
        "range24h": "24h",
        "range7d": "7d",
        "range30d": "30d"
    },
    "loading": "Loading errors…",
    "empty": "No errors in this window",
    "failed": "Failed to load. Pull to retry.",
    "occurrences": "{{count}} occurrences",
    "occurrences_one": "{{count}} occurrence",
    "affectedUsers": "{{count}} users affected",
    "affectedUsers_one": "{{count}} user affected",
    "lastSeen": "Last seen {{when}}",
    "firstSeen": "First seen {{when}}",
    "level": "Level",
    "status_label": "Status",
    "eventTimestamp": "Timestamp",
    "device": "Device",
    "os": "OS",
    "screen": "Screen",
    "stackTrace": "Stack trace",
    "tags": "Tags",
    "user": "User",
    "noEvents": "No events captured for this issue",
    "noStack": "No stack trace available"
}
```

- [ ] **Step 2: Add the matching Hebrew translations to he.json**

```json
"errors": {
    "notAuthorized": "אין לך הרשאה לפעולה הזו",
    "portalRow": "שגיאות",
    "screenTitle": "שגיאות",
    "detailTitle": "תקלה",
    "eventTitle": "אירוע",
    "filters": {
        "environment": "סביבה",
        "envDev": "פיתוח",
        "envProd": "ייצור",
        "status": "סטטוס",
        "statusUnresolved": "פתוחות",
        "statusAll": "הכל",
        "timeRange": "טווח זמן",
        "range24h": "24ש׳",
        "range7d": "7 ימים",
        "range30d": "30 יום"
    },
    "loading": "טוען שגיאות…",
    "empty": "אין שגיאות בטווח הזה",
    "failed": "טעינה נכשלה. משוך לרענון.",
    "occurrences": "{{count}} מקרים",
    "occurrences_one": "מקרה אחד",
    "affectedUsers": "{{count}} משתמשים נפגעו",
    "affectedUsers_one": "משתמש אחד נפגע",
    "lastSeen": "נראתה לאחרונה {{when}}",
    "firstSeen": "נראתה לראשונה {{when}}",
    "level": "חומרה",
    "status_label": "סטטוס",
    "eventTimestamp": "זמן",
    "device": "מכשיר",
    "os": "מערכת הפעלה",
    "screen": "מסך",
    "stackTrace": "מחסנית הקריאה",
    "tags": "תגיות",
    "user": "משתמש",
    "noEvents": "לא נתפסו אירועים עבור התקלה הזו",
    "noStack": "אין מחסנית קריאה"
}
```

- [ ] **Step 3: Verify JSON parses**

```bash
node -e "JSON.parse(require('fs').readFileSync('cost-share-app/apps/mobile/i18n/locales/en.json', 'utf8'))"
node -e "JSON.parse(require('fs').readFileSync('cost-share-app/apps/mobile/i18n/locales/he.json', 'utf8'))"
```

Expected: no output (parse succeeds).

---

## Task 10: `AdminErrorsScreen` — list + filters

**Files:**
- Create: `cost-share-app/apps/mobile/screens/admin/AdminErrorsScreen.tsx`

- [ ] **Step 1: Write the screen**

```tsx
import React, { useState, useCallback } from 'react';
import { View, FlatList, RefreshControl, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Text } from '../../components/AppText';
import { AppIcon, type AppIconName } from '../../components/AppIcon';
import { colors } from '../../theme';
import { useSentryIssuesQuery } from '../../hooks/queries/useAdminSentryQueries';
import type {
    SentryEnvironment,
    SentryStatusFilter,
    SentryTimeRange,
    SentryIssueSummary,
} from '../../services/adminSentry.service';

function levelIcon(level: string): { name: AppIconName; color: string } {
    switch (level) {
        case 'fatal':
            return { name: 'skull-outline', color: '#7c1d1d' };
        case 'error':
            return { name: 'alert-circle', color: '#dc2626' };
        case 'warning':
            return { name: 'warning-outline', color: '#d97706' };
        case 'info':
            return { name: 'information-circle-outline', color: '#2563eb' };
        default:
            return { name: 'bug-outline', color: colors.gray500 };
    }
}

function formatRelative(iso: string, locale: string): string {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const diff = Date.now() - then;
    const m = Math.round(diff / 60_000);
    if (m < 1) return locale === 'he' ? 'כעת' : 'just now';
    if (m < 60) return `${m}m`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.round(h / 24);
    return `${d}d`;
}

interface FilterChipProps {
    label: string;
    active: boolean;
    onPress: () => void;
    testID?: string;
}

function FilterChip({ label, active, onPress, testID }: FilterChipProps) {
    return (
        <TouchableOpacity
            onPress={onPress}
            testID={testID}
            className={`px-3 py-1 mr-2 rounded-full ${active ? 'bg-primary' : 'bg-white border border-gray-200'}`}
        >
            <Text className={active ? 'text-white text-xs' : 'text-gray-700 text-xs'}>{label}</Text>
        </TouchableOpacity>
    );
}

export function AdminErrorsScreen() {
    const { t, i18n } = useTranslation();
    const navigation = useNavigation<any>();
    const [environment, setEnvironment] = useState<SentryEnvironment>('dev');
    const [status, setStatus] = useState<SentryStatusFilter>('unresolved');
    const [timeRange, setTimeRange] = useState<SentryTimeRange>('24h');

    const query = useSentryIssuesQuery({ environment, status, timeRange });
    const issues: SentryIssueSummary[] = query.data ?? [];

    const onRefresh = useCallback(() => {
        void query.refetch();
    }, [query]);

    const renderRow = useCallback(
        ({ item }: { item: SentryIssueSummary }) => {
            const icon = levelIcon(item.level);
            return (
                <TouchableOpacity
                    testID={`admin-error-row-${item.id}`}
                    onPress={() => navigation.navigate('AdminErrorDetail', { issueId: item.id, title: item.shortId })}
                    className="flex-row items-center bg-white px-4 py-3 mx-3 mb-2 rounded-xl"
                >
                    <AppIcon name={icon.name} size={22} color={icon.color} />
                    <View className="flex-1 ml-3">
                        <Text className="text-sm text-gray-900" numberOfLines={2}>{item.title}</Text>
                        {item.culprit ? (
                            <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={1}>{item.culprit}</Text>
                        ) : null}
                        <View className="flex-row mt-1">
                            <Text className="text-[11px] text-gray-500 mr-3">
                                {t('admin.errors.occurrences', { count: Number(item.count) })}
                            </Text>
                            <Text className="text-[11px] text-gray-500 mr-3">
                                {t('admin.errors.affectedUsers', { count: item.userCount })}
                            </Text>
                            <Text className="text-[11px] text-gray-500">
                                {t('admin.errors.lastSeen', { when: formatRelative(item.lastSeen, i18n.language) })}
                            </Text>
                        </View>
                    </View>
                </TouchableOpacity>
            );
        },
        [navigation, t, i18n.language],
    );

    return (
        <View className="flex-1 bg-slate-50">
            <View className="bg-white px-4 py-3 border-b border-gray-100">
                <Text className="text-[11px] uppercase text-gray-500 mb-1">{t('admin.errors.filters.environment')}</Text>
                <View className="flex-row mb-3">
                    <FilterChip label={t('admin.errors.filters.envDev')} active={environment === 'dev'} onPress={() => setEnvironment('dev')} testID="filter-env-dev" />
                    <FilterChip label={t('admin.errors.filters.envProd')} active={environment === 'prod'} onPress={() => setEnvironment('prod')} testID="filter-env-prod" />
                </View>
                <Text className="text-[11px] uppercase text-gray-500 mb-1">{t('admin.errors.filters.status')}</Text>
                <View className="flex-row mb-3">
                    <FilterChip label={t('admin.errors.filters.statusUnresolved')} active={status === 'unresolved'} onPress={() => setStatus('unresolved')} testID="filter-status-unresolved" />
                    <FilterChip label={t('admin.errors.filters.statusAll')} active={status === 'all'} onPress={() => setStatus('all')} testID="filter-status-all" />
                </View>
                <Text className="text-[11px] uppercase text-gray-500 mb-1">{t('admin.errors.filters.timeRange')}</Text>
                <View className="flex-row">
                    <FilterChip label={t('admin.errors.filters.range24h')} active={timeRange === '24h'} onPress={() => setTimeRange('24h')} testID="filter-range-24h" />
                    <FilterChip label={t('admin.errors.filters.range7d')} active={timeRange === '7d'} onPress={() => setTimeRange('7d')} testID="filter-range-7d" />
                    <FilterChip label={t('admin.errors.filters.range30d')} active={timeRange === '30d'} onPress={() => setTimeRange('30d')} testID="filter-range-30d" />
                </View>
            </View>

            {query.isLoading ? (
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text className="text-xs text-gray-500 mt-2">{t('admin.errors.loading')}</Text>
                </View>
            ) : query.isError ? (
                <View className="flex-1 items-center justify-center px-8">
                    <Text testID="admin-errors-failed" className="text-gray-500 text-center">{t('admin.errors.failed')}</Text>
                </View>
            ) : issues.length === 0 ? (
                <View className="flex-1 items-center justify-center px-8">
                    <Text testID="admin-errors-empty" className="text-gray-500 text-center">{t('admin.errors.empty')}</Text>
                </View>
            ) : (
                <FlatList
                    data={issues}
                    keyExtractor={(i) => i.id}
                    refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={onRefresh} />}
                    renderItem={renderRow}
                    contentContainerStyle={{ paddingVertical: 12 }}
                />
            )}
        </View>
    );
}
```

- [ ] **Step 2: Type-check**

```bash
cd cost-share-app && npx tsc --noEmit -p apps/mobile/tsconfig.json 2>&1 | head -30
```

Expected: no errors related to `AdminErrorsScreen.tsx`.

---

## Task 11: `AdminErrorDetailScreen`

**Files:**
- Create: `cost-share-app/apps/mobile/screens/admin/AdminErrorDetailScreen.tsx`

- [ ] **Step 1: Write the screen**

```tsx
import React, { useCallback } from 'react';
import { View, FlatList, RefreshControl, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Text } from '../../components/AppText';
import { colors } from '../../theme';
import {
    useSentryIssueDetailQuery,
    useSentryIssueEventsQuery,
} from '../../hooks/queries/useAdminSentryQueries';
import type { SentryEventSummary } from '../../services/adminSentry.service';

export function AdminErrorDetailScreen() {
    const { t, i18n } = useTranslation();
    const route = useRoute<any>();
    const navigation = useNavigation<any>();
    const issueId: string = route.params?.issueId ?? '';

    const detail = useSentryIssueDetailQuery(issueId);
    const events = useSentryIssueEventsQuery(issueId);

    const onRefresh = useCallback(() => {
        void detail.refetch();
        void events.refetch();
    }, [detail, events]);

    const renderEvent = useCallback(
        ({ item }: { item: SentryEventSummary }) => {
            const device = item.tags['device.model'] ?? item.tags['device'] ?? '';
            const os = item.tags['os.version'] ?? item.tags['os'] ?? '';
            const screen = item.tags['routing.route.name'] ?? '';
            const when = item.dateCreated
                ? new Date(item.dateCreated).toLocaleString(i18n.language)
                : '';
            return (
                <TouchableOpacity
                    testID={`admin-error-event-${item.id}`}
                    onPress={() => navigation.navigate('AdminErrorEvent', { event: item })}
                    className="bg-white px-4 py-3 mx-3 mb-2 rounded-xl"
                >
                    <Text className="text-xs text-gray-500">{when}</Text>
                    <Text className="text-sm text-gray-900 mt-0.5">{device}{device && os ? ' · ' : ''}{os}</Text>
                    {screen ? <Text className="text-xs text-gray-500 mt-0.5">{t('admin.errors.screen')}: {screen}</Text> : null}
                </TouchableOpacity>
            );
        },
        [navigation, t, i18n.language],
    );

    const header = detail.data ? (
        <View className="bg-white px-4 py-4 border-b border-gray-100">
            <Text className="text-base font-semibold text-gray-900">{detail.data.title}</Text>
            {detail.data.culprit ? (
                <Text className="text-xs text-gray-500 mt-1">{detail.data.culprit}</Text>
            ) : null}
            <View className="flex-row mt-2 flex-wrap">
                <Text className="text-[11px] text-gray-500 mr-3">{t('admin.errors.level')}: {detail.data.level}</Text>
                <Text className="text-[11px] text-gray-500 mr-3">{t('admin.errors.status_label')}: {detail.data.status}</Text>
                <Text className="text-[11px] text-gray-500 mr-3">{t('admin.errors.occurrences', { count: Number(detail.data.count) })}</Text>
                <Text className="text-[11px] text-gray-500">{t('admin.errors.affectedUsers', { count: detail.data.userCount })}</Text>
            </View>
            {detail.data.firstSeen ? (
                <Text className="text-[11px] text-gray-500 mt-1">
                    {t('admin.errors.firstSeen', { when: new Date(detail.data.firstSeen).toLocaleString(i18n.language) })}
                </Text>
            ) : null}
            {detail.data.lastSeen ? (
                <Text className="text-[11px] text-gray-500">
                    {t('admin.errors.lastSeen', { when: new Date(detail.data.lastSeen).toLocaleString(i18n.language) })}
                </Text>
            ) : null}
        </View>
    ) : null;

    if (detail.isLoading) {
        return (
            <View className="flex-1 items-center justify-center bg-slate-50">
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    return (
        <View className="flex-1 bg-slate-50">
            <FlatList
                data={events.data ?? []}
                keyExtractor={(e) => e.id}
                ListHeaderComponent={header}
                ListEmptyComponent={
                    <View className="px-4 py-6">
                        <Text className="text-xs text-gray-500 text-center">{t('admin.errors.noEvents')}</Text>
                    </View>
                }
                renderItem={renderEvent}
                refreshControl={<RefreshControl refreshing={detail.isRefetching || events.isRefetching} onRefresh={onRefresh} />}
                contentContainerStyle={{ paddingVertical: 12 }}
            />
        </View>
    );
}
```

---

## Task 12: `AdminErrorEventScreen`

**Files:**
- Create: `cost-share-app/apps/mobile/screens/admin/AdminErrorEventScreen.tsx`

- [ ] **Step 1: Write the screen**

```tsx
import React from 'react';
import { View, ScrollView } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Text } from '../../components/AppText';
import type { SentryEventSummary } from '../../services/adminSentry.service';

export function AdminErrorEventScreen() {
    const { t, i18n } = useTranslation();
    const route = useRoute<any>();
    const event: SentryEventSummary | null = route.params?.event ?? null;

    if (!event) {
        return (
            <View className="flex-1 items-center justify-center bg-slate-50 px-8">
                <Text className="text-gray-500 text-center">{t('admin.errors.noEvents')}</Text>
            </View>
        );
    }

    const tagEntries = Object.entries(event.tags);
    const stackLine = event.exception?.topFrame ?? null;

    return (
        <ScrollView className="flex-1 bg-slate-50">
            <View className="bg-white px-4 py-4 mx-3 mt-3 rounded-xl">
                <Text className="text-[11px] text-gray-500">{t('admin.errors.eventTimestamp')}</Text>
                <Text className="text-sm text-gray-900 mt-0.5">
                    {event.dateCreated ? new Date(event.dateCreated).toLocaleString(i18n.language) : '—'}
                </Text>
            </View>

            <View className="bg-white px-4 py-4 mx-3 mt-3 rounded-xl">
                <Text className="text-[11px] text-gray-500 mb-2">{t('admin.errors.stackTrace')}</Text>
                {event.exception ? (
                    <>
                        <Text className="text-sm text-gray-900">
                            {event.exception.type ?? ''}{event.exception.type && event.exception.value ? ': ' : ''}{event.exception.value ?? ''}
                        </Text>
                        {stackLine ? (
                            <Text className="text-xs text-gray-700 mt-2" style={{ fontFamily: 'Courier' }}>
                                {stackLine}
                            </Text>
                        ) : (
                            <Text className="text-xs text-gray-500 mt-2">{t('admin.errors.noStack')}</Text>
                        )}
                    </>
                ) : (
                    <Text className="text-xs text-gray-500">{t('admin.errors.noStack')}</Text>
                )}
            </View>

            <View className="bg-white px-4 py-4 mx-3 mt-3 rounded-xl">
                <Text className="text-[11px] text-gray-500 mb-2">{t('admin.errors.tags')}</Text>
                {tagEntries.length === 0 ? (
                    <Text className="text-xs text-gray-500">—</Text>
                ) : (
                    tagEntries.map(([k, v]) => (
                        <View key={k} className="flex-row mb-1">
                            <Text className="text-xs text-gray-600 mr-2" style={{ minWidth: 120 }}>{k}</Text>
                            <Text className="text-xs text-gray-900 flex-1">{v}</Text>
                        </View>
                    ))
                )}
            </View>

            <View className="bg-white px-4 py-4 mx-3 mt-3 mb-6 rounded-xl">
                <Text className="text-[11px] text-gray-500 mb-2">{t('admin.errors.user')}</Text>
                {event.user ? (
                    <>
                        {event.user.id ? <Text className="text-xs text-gray-900">id: {event.user.id}</Text> : null}
                        {event.user.email ? <Text className="text-xs text-gray-900">email: {event.user.email}</Text> : null}
                        {event.user.username ? <Text className="text-xs text-gray-900">username: {event.user.username}</Text> : null}
                    </>
                ) : (
                    <Text className="text-xs text-gray-500">—</Text>
                )}
            </View>
        </ScrollView>
    );
}
```

---

## Task 13: Wire navigation routes

**Files:**
- Modify: `cost-share-app/apps/mobile/navigation/AppNavigator.tsx`

- [ ] **Step 1: Add the three imports**

Add these three import lines next to the other admin imports near the top of the file:

```tsx
import { AdminErrorsScreen } from '../screens/admin/AdminErrorsScreen';
import { AdminErrorDetailScreen } from '../screens/admin/AdminErrorDetailScreen';
import { AdminErrorEventScreen } from '../screens/admin/AdminErrorEventScreen';
```

- [ ] **Step 2: Register the three stack routes inside `ProfileStack`**

Inside `ProfileStack()`, immediately after the existing `<Stack.Screen name="AdminOnboardingPreview" ... />` entry, add:

```tsx
<Stack.Screen
    name="AdminErrors"
    component={AdminErrorsScreen}
    options={{ title: t('admin.errors.screenTitle') }}
/>
<Stack.Screen
    name="AdminErrorDetail"
    component={AdminErrorDetailScreen}
    options={({ route }) => ({ title: (route.params as { title?: string } | undefined)?.title ?? t('admin.errors.detailTitle') })}
/>
<Stack.Screen
    name="AdminErrorEvent"
    component={AdminErrorEventScreen}
    options={{ title: t('admin.errors.eventTitle') }}
/>
```

---

## Task 14: Add "Errors" row on `AdminPortalScreen`

**Files:**
- Modify: `cost-share-app/apps/mobile/screens/admin/AdminPortalScreen.tsx`

- [ ] **Step 1: Add the row inside the `SettingsSection`**

Add this `SettingsRow` immediately after the existing `deleted-users` row:

```tsx
<SettingsRow
    iconName="bug-outline"
    label={t('admin.errors.portalRow')}
    variant="chevron"
    onPress={() => navigation.navigate('AdminErrors')}
    testID="admin-portal-errors"
/>
```

---

## Task 15: Extract `sentryIdentity.ts` helpers + refactor `App.tsx`

**Files:**
- Create: `cost-share-app/apps/mobile/lib/sentryIdentity.ts`
- Modify: `cost-share-app/apps/mobile/App.tsx:74-90`

- [ ] **Step 1: Write `sentryIdentity.ts`**

```ts
import * as Sentry from '@sentry/react-native';

export interface IdentityUser {
    id: string;
    email: string;
    name: string;
    defaultCurrency?: string;
}

/** Apply (or clear) the Sentry user identity. Called from App.tsx on auth changes. */
export function applySentryUser(user: IdentityUser | null): void {
    if (user) {
        Sentry.setUser({ id: user.id, email: user.email, username: user.name });
        Sentry.setTag('default_currency', user.defaultCurrency);
    } else {
        Sentry.setUser(null);
        Sentry.setTag('default_currency', undefined);
    }
}

/** Apply the app's UI language as a Sentry tag. */
export function applySentryLanguage(language: string): void {
    Sentry.setTag('app_language', language);
}
```

- [ ] **Step 2: Refactor App.tsx to use the helpers**

In `cost-share-app/apps/mobile/App.tsx`, replace the two existing `useEffect`s that currently call Sentry directly with:

```tsx
useEffect(() => {
    applySentryUser(currentUser ?? null);
}, [currentUser]);

useEffect(() => {
    applySentryLanguage(language);
}, [language]);
```

And add the import alongside the existing `import * as Sentry from '@sentry/react-native';` line:

```tsx
import { applySentryUser, applySentryLanguage } from './lib/sentryIdentity';
```

Leave the existing `import * as Sentry from '@sentry/react-native';` import as-is — `Sentry.wrap(App)` at the bottom still uses it.

- [ ] **Step 3: Type-check**

```bash
cd cost-share-app && npx tsc --noEmit -p apps/mobile/tsconfig.json 2>&1 | head -30
```

Expected: no errors.

---

## Task 16: Test — `lib/sentry.test.ts`

**Files:**
- Create: `cost-share-app/apps/mobile/__tests__/lib/sentry.test.ts`

- [ ] **Step 1: Write the test file**

```ts
import * as Sentry from '@sentry/react-native';
import { applySentryUser, applySentryLanguage } from '../../lib/sentryIdentity';

const sentry = Sentry as unknown as {
    init: jest.Mock;
    setUser: jest.Mock;
    setTag: jest.Mock;
    captureException: jest.Mock;
};

describe('Sentry init module', () => {
    afterEach(() => {
        jest.resetModules();
    });

    it('initialises with enabled=false when DSN env var is missing', () => {
        delete process.env.EXPO_PUBLIC_SENTRY_DSN;
        sentry.init.mockClear();
        jest.isolateModules(() => {
            require('../../lib/sentry');
        });
        expect(sentry.init).toHaveBeenCalledTimes(1);
        const cfg = sentry.init.mock.calls[0][0];
        expect(cfg.enabled).toBe(false);
        expect(cfg.dsn).toBeUndefined();
    });

    it('initialises with enabled=true when DSN env var is set', () => {
        process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://abc@example.ingest.de.sentry.io/1';
        sentry.init.mockClear();
        jest.isolateModules(() => {
            require('../../lib/sentry');
        });
        const cfg = sentry.init.mock.calls[0][0];
        expect(cfg.enabled).toBe(true);
        expect(cfg.dsn).toContain('sentry.io');
        delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    });
});

describe('Sentry identity helpers', () => {
    beforeEach(() => {
        sentry.setUser.mockClear();
        sentry.setTag.mockClear();
    });

    it('applySentryUser sets id/email/username on login', () => {
        applySentryUser({
            id: 'u1',
            email: 'a@b.com',
            name: 'Alice',
            defaultCurrency: 'ILS',
        });
        expect(sentry.setUser).toHaveBeenCalledWith({
            id: 'u1',
            email: 'a@b.com',
            username: 'Alice',
        });
        expect(sentry.setTag).toHaveBeenCalledWith('default_currency', 'ILS');
    });

    it('applySentryUser clears user + currency tag on sign-out', () => {
        applySentryUser(null);
        expect(sentry.setUser).toHaveBeenCalledWith(null);
        expect(sentry.setTag).toHaveBeenCalledWith('default_currency', undefined);
    });

    it('applySentryLanguage sets the app_language tag', () => {
        applySentryLanguage('he');
        expect(sentry.setTag).toHaveBeenCalledWith('app_language', 'he');
    });
});

describe('Service-layer captureException', () => {
    let mockChain: {
        select: jest.Mock;
        insert: jest.Mock;
        single: jest.Mock;
    };

    beforeEach(() => {
        jest.resetModules();
        sentry.captureException.mockClear();
    });

    it('createExpense reports tags.service=expenses, op=create on failure', async () => {
        mockChain = {
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
                data: null,
                error: { message: 'db-down' },
            }),
            insert: jest.fn().mockReturnThis(),
        };

        jest.doMock('../../lib/supabase', () => ({
            supabase: {
                from: jest.fn(() => mockChain),
                rpc: jest.fn(),
                auth: { getUser: jest.fn() },
            },
        }));
        jest.doMock('../../services/auth.service', () => ({
            getCurrentUserId: jest.fn().mockResolvedValue('u1'),
        }));
        jest.doMock('../../lib/toast', () => ({
            showErrorToast: jest.fn(),
            showSuccessToast: jest.fn(),
        }));
        jest.doMock('../../store', () => ({
            useAppStore: {
                getState: () => ({
                    addExpense: jest.fn(),
                    setExpenses: jest.fn(),
                    expenses: [],
                }),
            },
        }));

        const { createExpense } = require('../../services/expenses.service');
        await createExpense({
            groupId: 'g1',
            description: 'lunch',
            amount: 100,
            currency: 'ILS',
            paidBy: 'u1',
            splits: [{ userId: 'u1', amount: 100 }],
        });

        expect(sentry.captureException).toHaveBeenCalledTimes(1);
        const [, ctx] = sentry.captureException.mock.calls[0];
        expect(ctx.tags).toEqual({ service: 'expenses', op: 'create' });
        expect(ctx.extra).toMatchObject({ groupId: 'g1', amount: 100, currency: 'ILS' });
    });
});
```

Notes for the engineer:
- The third describe block uses `jest.doMock` + `require` so the module graph is freshly built per test. Mock identifiers used in `jest.doMock` factories must not capture outer variables (Jest enforces this).
- If `createExpense` calls a helper from a path not in the mocked set (e.g., `validateExpenseSplits`, `i18n`), Jest will complain at import time. Add the missing mock(s) using the actual path strings as Jest reports them — but do not change real behaviour.
- The factory for `lib/toast` matches the actual export shape — verify by skimming `cost-share-app/apps/mobile/lib/toast.ts` before running the test.

- [ ] **Step 2: Run the test**

```bash
cd cost-share-app && npm test --workspace=@cost-share/mobile -- --testPathPattern=lib/sentry.test
```

Expected: all 6 tests pass. If the service test fails because of a missing module mock, follow the error trace, mock the cited module identically to how `ActivityFeedScreen.test.tsx` mocks its dependencies, and re-run. Do not weaken the assertion.

---

## Task 17: Extend `jest-setup.ts` with `functions.invoke`

**Files:**
- Modify: `cost-share-app/apps/mobile/jest-setup.ts`

- [ ] **Step 1: Extend the supabase mock**

Locate the existing `jest.mock('./lib/supabase', () => ({ supabase: { … } }))` block and add a `functions` key to the inner `supabase` object:

```ts
functions: {
    invoke: jest.fn().mockResolvedValue({ data: null, error: null }),
},
```

Place it right after the existing `auth: { … }` block.

- [ ] **Step 2: Verify existing tests still pass**

```bash
cd cost-share-app && npm test --workspace=@cost-share/mobile -- --passWithNoTests
```

Expected: green. If anything broke, the mock addition is the only suspect — investigate before continuing.

---

## Task 18: Test — `AdminErrorsScreen.test.tsx`

**Files:**
- Create: `cost-share-app/apps/mobile/__tests__/screens/admin/AdminErrorsScreen.test.tsx`

- [ ] **Step 1: Write the test**

```tsx
const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
    useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
    useRoute: () => ({ params: {} }),
    useFocusEffect: jest.fn(),
    useIsFocused: () => true,
}));

const mockInvoke = jest.fn();
jest.mock('../../../lib/supabase', () => ({
    supabase: {
        functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
    },
}));

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminErrorsScreen } from '../../../screens/admin/AdminErrorsScreen';

function renderWithQuery(ui: React.ReactElement) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const sampleIssue = {
    id: 'iss-1',
    shortId: 'COPAY-1',
    title: 'TypeError: x is undefined',
    level: 'error',
    status: 'unresolved',
    count: '12',
    userCount: 4,
    firstSeen: '2026-06-01T00:00:00Z',
    lastSeen: '2026-06-02T00:00:00Z',
    culprit: 'expenses.service.ts:120',
    metadata: {},
};

beforeEach(() => {
    mockInvoke.mockReset();
    mockNavigate.mockReset();
});

describe('AdminErrorsScreen', () => {
    it('renders the issue list from the stubbed response', async () => {
        mockInvoke.mockResolvedValue({ data: { ok: true, data: [sampleIssue] }, error: null });
        const { getByTestId } = renderWithQuery(<AdminErrorsScreen />);
        await waitFor(() => expect(getByTestId('admin-error-row-iss-1')).toBeTruthy());
    });

    it('navigates to AdminErrorDetail with the issue id on row press', async () => {
        mockInvoke.mockResolvedValue({ data: { ok: true, data: [sampleIssue] }, error: null });
        const { getByTestId } = renderWithQuery(<AdminErrorsScreen />);
        await waitFor(() => getByTestId('admin-error-row-iss-1'));
        fireEvent.press(getByTestId('admin-error-row-iss-1'));
        expect(mockNavigate).toHaveBeenCalledWith(
            'AdminErrorDetail',
            expect.objectContaining({ issueId: 'iss-1' }),
        );
    });

    it('re-invokes the proxy when the environment filter changes', async () => {
        mockInvoke.mockResolvedValue({ data: { ok: true, data: [] }, error: null });
        const { getByTestId } = renderWithQuery(<AdminErrorsScreen />);
        await waitFor(() => expect(mockInvoke).toHaveBeenCalled());
        const firstCount = mockInvoke.mock.calls.length;

        await act(async () => {
            fireEvent.press(getByTestId('filter-env-prod'));
        });

        await waitFor(() => expect(mockInvoke.mock.calls.length).toBeGreaterThan(firstCount));
        const lastCall = mockInvoke.mock.calls[mockInvoke.mock.calls.length - 1];
        expect(lastCall[0]).toBe('admin-sentry-proxy');
        expect(lastCall[1].body.environment).toBe('prod');
    });

    it('shows the failed state when the proxy rejects', async () => {
        mockInvoke.mockResolvedValue({ data: null, error: new Error('proxy boom') });
        const { findByTestId } = renderWithQuery(<AdminErrorsScreen />);
        await findByTestId('admin-errors-failed');
    });
});
```

- [ ] **Step 2: Run the test**

```bash
cd cost-share-app && npm test --workspace=@cost-share/mobile -- --testPathPattern=AdminErrorsScreen.test
```

Expected: 4 tests pass.

---

## Task 19: Full verification

**Files:** None.

- [ ] **Step 1: Run lint**

```bash
cd cost-share-app && npm run lint
```

Expected: clean. Fix any reported issues before continuing.

- [ ] **Step 2: Run the full mobile test suite**

```bash
cd cost-share-app && npm test --workspace=@cost-share/mobile -- --ci
```

Expected: all suites pass, including the new ones (`lib/sentry.test.ts` and `screens/admin/AdminErrorsScreen.test.tsx`).

- [ ] **Step 3: Run Deno tests (if `deno` is available locally)**

```bash
cd cost-share-app/supabase/functions/admin-sentry-proxy
deno test --allow-net --allow-env index.test.ts
```

Expected: 8 tests pass. If `deno` is not installed, skip and document.

- [ ] **Step 4: Type-check**

```bash
cd cost-share-app && npx tsc --noEmit -p apps/mobile/tsconfig.json
```

Expected: clean.

- [ ] **Step 5: Snapshot what changed**

```bash
git status
git diff --stat
```

Manually review: no unintended changes to unrelated files, no `.env` / secret leakage.

---

## Task 20: Commit + push + PR — REQUIRES EXPLICIT USER OK

**Files:** None.

> **STOP.** Do NOT run any of the steps below until the user has explicitly approved the commit in this very turn. The user's memory `feedback_git_commits.md` is non-negotiable. Show the diff summary, list the proposed commit message, then ask: "OK to commit and open the PR?"

- [ ] **Step 1: Stage only the new/modified files (no `git add -A`)**

```bash
git add \
    cost-share-app/supabase/functions/admin-sentry-proxy \
    cost-share-app/apps/mobile/services/adminSentry.service.ts \
    cost-share-app/apps/mobile/hooks/queries/keys.ts \
    cost-share-app/apps/mobile/hooks/queries/useAdminSentryQueries.ts \
    cost-share-app/apps/mobile/screens/admin/AdminErrorsScreen.tsx \
    cost-share-app/apps/mobile/screens/admin/AdminErrorDetailScreen.tsx \
    cost-share-app/apps/mobile/screens/admin/AdminErrorEventScreen.tsx \
    cost-share-app/apps/mobile/screens/admin/AdminPortalScreen.tsx \
    cost-share-app/apps/mobile/navigation/AppNavigator.tsx \
    cost-share-app/apps/mobile/lib/sentryIdentity.ts \
    cost-share-app/apps/mobile/App.tsx \
    cost-share-app/apps/mobile/i18n/locales/en.json \
    cost-share-app/apps/mobile/i18n/locales/he.json \
    cost-share-app/apps/mobile/jest-setup.ts \
    cost-share-app/apps/mobile/__tests__/lib/sentry.test.ts \
    cost-share-app/apps/mobile/__tests__/screens/admin/AdminErrorsScreen.test.tsx \
    docs/superpowers/plans/2026-06-02-sentry-admin-dashboard.md
```

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(admin): add in-app Sentry error dashboard + missing Sentry tests

Adds the admin-sentry-proxy Edge Function (admin-gated proxy over
three Sentry REST endpoints), three new admin screens (errors list,
issue detail, event detail) wired into ProfileStack, and the
sentry/identity test coverage the original wiring PR deferred.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Push the branch**

```bash
git push -u origin feature/sentry-admin-dashboard
```

- [ ] **Step 4: Open the PR to `dev`**

```bash
gh pr create --base dev --title "Admin Sentry error dashboard + Sentry test coverage" --body "$(cat <<'EOF'
## Summary

- New Supabase Edge Function `admin-sentry-proxy` re-verifies `is_app_admin()` per call and proxies three Sentry REST endpoints. Trims responses to the fields the mobile UI needs.
- Three new admin screens: `AdminErrorsScreen` (filterable issue list), `AdminErrorDetailScreen` (issue header + last 20 events), `AdminErrorEventScreen` (event detail with stack, tags, user).
- New "Errors" row on `AdminPortalScreen` + three new routes in `ProfileStack`.
- Extracted `applySentryUser` / `applySentryLanguage` helpers from `App.tsx` so the identity wiring is testable.
- New test files: `__tests__/lib/sentry.test.ts` (init / identity / capture) and `__tests__/screens/admin/AdminErrorsScreen.test.tsx` (list / nav / filter / error state). Edge Function has `index.test.ts` (Deno tests, not run in CI).

## Required user actions before merge

1. **Set Supabase secrets for the Edge Function:**

   \`\`\`bash
   supabase secrets set \\
     SENTRY_API_TOKEN=<the same token from PR #33> \\
     SENTRY_ORG=<your org slug> \\
     SENTRY_PROJECT_DEV=copay-mobile-dev \\
     SENTRY_PROJECT_PROD=copay-mobile-prod
   \`\`\`

2. **Deploy the function:**

   \`\`\`bash
   supabase functions deploy admin-sentry-proxy
   \`\`\`

3. **(Optional) Run the Deno tests locally:**

   \`\`\`bash
   cd cost-share-app/supabase/functions/admin-sentry-proxy
   deno test --allow-net --allow-env index.test.ts
   \`\`\`

CI doesn't currently run Deno tests, so the Edge Function test file is for local verification only.

## Test plan

- [ ] CI: Lint + Mobile tests green
- [ ] On dev after merge + Supabase secret set: open the admin portal → Errors → list loads (or shows empty state if no events in the window)
- [ ] Filter changes (env / status / time range) re-invoke the proxy
- [ ] Tap an issue → detail loads with events
- [ ] Tap an event → event detail shows stack frame + tags + user
- [ ] Sign out + sign back in with a non-admin account → portal row hidden / proxy returns 403

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Report the PR URL back to the user**

---

## Self-Review (post-write)

**1. Spec coverage** (against `docs/superpowers/specs/2026-06-02-error-tracking-with-sentry-design.md`):

- §3 Edge Function (admin gate, three actions, CORS, trim, env-based project pick): Tasks 1–6 ✓
- §3 AdminErrorsScreen with severity icon, title, file:line, counts, "last seen", filter row, refresh, empty state: Task 10 ✓
- §3 AdminErrorDetailScreen with header + last 20 events: Task 11 ✓
- §3 AdminErrorEventScreen with stack + tags + user: Task 12 ✓
- §3 AdminPortalScreen row, navigation wiring, i18n: Tasks 13, 14, 9 ✓
- "Testing" section — `lib/sentry.test.ts` (a/b/c), `admin-sentry-proxy/index.test.ts`, `AdminErrorsScreen.test.tsx`: Tasks 6, 16, 18 ✓
- Out of scope (session replay, profiling, push, source maps, `.env.production`, payment links): not touched ✓

**2. Placeholder scan:** All code blocks contain complete code; all bash commands use literal paths/flags. No TBD/TODO markers.

**3. Type / name consistency:**
- Service types `SentryIssueSummary`, `SentryIssueDetail`, `SentryEventSummary` are defined in Task 7 and re-used in Tasks 8, 10, 11, 12, 18 — names match.
- `useSentryIssuesQuery` / `useSentryIssueDetailQuery` / `useSentryIssueEventsQuery` consistent across Tasks 8, 10, 11.
- Edge Function action discriminator strings `list_issues` / `issue_events` / `issue_detail` match handler dispatch (Task 2), service call sites (Task 7), and tests (Tasks 6, 18).
- Route names `AdminErrors` / `AdminErrorDetail` / `AdminErrorEvent` match between navigator (Task 13), portal row (Task 14), and the test (Task 18).
- i18n keys (`admin.errors.*`) defined in Task 9, consumed in Tasks 10, 11, 12, 13.

No drift detected.
