// Edge Function: send-push
// Invoked by the activity_events pg_net trigger. Validates a shared secret, then
// renders + sends an Expo push for the inserted activity_events row.
// See docs/superpowers/specs/2026-06-11-push-notifications-design.md

import { processActivityEvent, type ActivityRecord } from './handler.ts';
import { makeSupabaseDeps } from './deps.ts';
import { jsonResponse, preflight } from './cors.ts';

const PUSH_WEBHOOK_SECRET = Deno.env.get('PUSH_WEBHOOK_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

Deno.serve(async (req) => {
    const pre = preflight(req);
    if (pre) return pre;

    if (req.method !== 'POST') {
        return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);
    }
    if (!PUSH_WEBHOOK_SECRET || req.headers.get('x-webhook-secret') !== PUSH_WEBHOOK_SECRET) {
        return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
    }

    let record: ActivityRecord;
    try {
        const body = await req.json();
        record = body.record as ActivityRecord;
        if (!record?.id || !record.user_id || !record.kind) throw new Error('missing record');
    } catch {
        return jsonResponse({ ok: false, error: 'bad_request' }, 400);
    }

    try {
        const deps = makeSupabaseDeps({ url: SUPABASE_URL, serviceRole: SERVICE_ROLE });
        const outcome = await processActivityEvent(record, deps);
        return jsonResponse({ ok: true, outcome }, 200);
    } catch (e) {
        console.error('send-push failed', e);
        return jsonResponse({ ok: false, error: 'internal' }, 500);
    }
});
