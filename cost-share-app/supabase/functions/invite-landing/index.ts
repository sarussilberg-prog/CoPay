// Edge Function: invite-landing
// Serves https://kupa.pro/i/<token>, /g/<token>, /.well-known/*, and a minimal root page.
// See docs/superpowers/specs/2026-05-20-invites-and-sharing-design.md

import { createClient } from 'supabase';
import { renderFriendInvite, renderGroupInvite, renderInvalid, renderRoot } from './render.ts';
import { handleWellKnown } from './well-known.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TOKEN_RE = /^[A-Za-z0-9_-]{10}$/;

interface PreviewFriend {
    kind: 'friend';
    inviter: { id: string; name: string; avatar_url: string | null };
}
interface PreviewGroup {
    kind: 'group';
    group: {
        id: string;
        name: string;
        currency: string;
        member_count: number;
        members: Array<{ id: string; name: string; avatar_url: string | null }>;
    };
}
interface PreviewInvalid { kind: 'invalid'; }
type Preview = PreviewFriend | PreviewGroup | PreviewInvalid;

async function fetchPreview(token: string): Promise<Preview> {
    const { data, error } = await client.rpc('get_invite_preview', { p_token: token });
    if (error || !data) return { kind: 'invalid' };
    return data as Preview;
}

Deno.serve(async (req: Request) => {
    const url = new URL(req.url);
    const path = url.pathname;

    // well-known files
    const wk = handleWellKnown(path);
    if (wk) return wk;

    // friend invite
    const friend = path.match(/^\/i\/([^/?#]+)\/?$/);
    if (friend && TOKEN_RE.test(friend[1])) {
        const preview = await fetchPreview(friend[1]);
        if (preview.kind !== 'friend') {
            return new Response(renderInvalid(), { status: 404, headers: htmlHeaders() });
        }
        return new Response(renderFriendInvite(preview, friend[1]), { status: 200, headers: htmlHeaders() });
    }

    // group invite
    const group = path.match(/^\/g\/([^/?#]+)\/?$/);
    if (group && TOKEN_RE.test(group[1])) {
        const preview = await fetchPreview(group[1]);
        if (preview.kind !== 'group') {
            return new Response(renderInvalid(), { status: 404, headers: htmlHeaders() });
        }
        return new Response(renderGroupInvite(preview, group[1]), { status: 200, headers: htmlHeaders() });
    }

    // root
    if (path === '/' || path === '') {
        return new Response(renderRoot(), { status: 200, headers: htmlHeaders() });
    }

    return new Response('Not found', { status: 404 });
});

function htmlHeaders(): HeadersInit {
    return {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=60',
    };
}
