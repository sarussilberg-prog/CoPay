// Deno tests for admin-sentry-proxy. Run locally with:
//   deno test --allow-net --allow-env index.test.ts
// CI is currently Node-only and does NOT run these tests.

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

// Wraps a test body with a patched globalThis.fetch that answers Supabase's
// is_app_admin RPC with the supplied verdict, and forwards everything else
// to the original fetch.
function withSupabaseAdmin(isAdmin: boolean, fn: () => Promise<void>): () => Promise<void> {
    return async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
            const url = typeof input === 'string' ? input : input.toString();
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

Deno.test('missing authorization returns 401', async () => {
    const req = new Request('https://x/admin-sentry-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list_issues', environment: 'dev' }),
    });
    const res = await handleRequest(req, baseEnv);
    assertEquals(res.status, 401);
});

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
            const auth =
                (init?.headers as Record<string, string> | undefined)?.['Authorization'] ?? null;
            calls.push({ url, auth });
            return Promise.resolve(
                new Response(
                    JSON.stringify([
                        {
                            id: '99',
                            shortId: 'COPAY-1',
                            title: 'Boom',
                            level: 'error',
                            status: 'unresolved',
                            count: '7',
                            userCount: 3,
                            firstSeen: '2026-06-01',
                            lastSeen: '2026-06-02',
                            culprit: 'foo.ts:42',
                            metadata: {},
                        },
                    ]),
                    { status: 200, headers: { 'Content-Type': 'application/json' } },
                ),
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
        assertStringIncludes(
            calls[0].url,
            'sentry.io/api/0/projects/copay-hb/copay-mobile-dev/issues/',
        );
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
            return Promise.resolve(
                new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
            );
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
            Promise.resolve(
                new Response(
                    JSON.stringify([
                        {
                            id: 'evt-1',
                            dateCreated: '2026-06-02T00:00:00Z',
                            tags: [
                                { key: 'device.model', value: 'iPhone15,3' },
                                { key: 'os.version', value: '17.4' },
                                { key: 'browser', value: 'irrelevant' },
                            ],
                            user: { id: 'u1', email: 'a@b', username: 'a' },
                            entries: [
                                {
                                    type: 'exception',
                                    data: {
                                        values: [
                                            {
                                                type: 'TypeError',
                                                value: 'x is undefined',
                                                stacktrace: {
                                                    frames: [
                                                        { filename: 'foo.ts', lineno: 12, function: 'doStuff' },
                                                    ],
                                                },
                                            },
                                        ],
                                    },
                                },
                            ],
                        },
                    ]),
                    { status: 200, headers: { 'Content-Type': 'application/json' } },
                ),
            );
        const req = new Request('https://x/admin-sentry-proxy', {
            method: 'POST',
            headers: { Authorization: 'Bearer jwt', 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'issue_events', issueId: 'abc' }),
        });
        const res = await handleRequest(req, baseEnv, sentryFetch);
        assertEquals(res.status, 200);
        const json = await res.json();
        // URL is now org-scoped: /api/0/organizations/{org}/issues/{id}/events/.
        // (bare /api/0/issues/{id}/ returns 404 on modern Sentry orgs.)
        assertEquals(json.data[0].id, 'evt-1');
        assertEquals(json.data[0].tags['device.model'], 'iPhone15,3');
        assertEquals(json.data[0].tags.browser, undefined);
        assertEquals(json.data[0].exception?.type, 'TypeError');
        assertStringIncludes(json.data[0].exception?.topFrame ?? '', 'doStuff (foo.ts:12)');
    }),
);
