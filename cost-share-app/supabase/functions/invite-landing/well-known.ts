// Serves the Universal Links / App Links association files under /.well-known/*.
// Env vars (set on the Supabase project secrets — see Task 24):
//   KUPAY_IOS_TEAM_ID (or legacy KUPA_IOS_TEAM_ID) — Apple Developer Team ID
//   KUPAY_ANDROID_DEBUG_SHA256 / KUPAY_ANDROID_RELEASE_SHA256 — Android keystore SHA-256

function env(name: string, legacy?: string): string {
    return Deno.env.get(name) ?? (legacy ? Deno.env.get(legacy) : '') ?? '';
}

const TEAM_ID = env('KUPAY_IOS_TEAM_ID', 'KUPA_IOS_TEAM_ID');
const ANDROID_DEBUG_SHA = env('KUPAY_ANDROID_DEBUG_SHA256', 'KUPA_ANDROID_DEBUG_SHA256');
const ANDROID_RELEASE_SHA = env('KUPAY_ANDROID_RELEASE_SHA256', 'KUPA_ANDROID_RELEASE_SHA256');

const AASA_JSON = JSON.stringify({
    applinks: {
        apps: [],
        details: [{
            appID: `${TEAM_ID}.com.kupay.mobile`,
            paths: ['/i/*', '/g/*'],
        }],
    },
});

const ANDROID_LINKS_JSON = JSON.stringify([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
        namespace: 'android_app',
        package_name: 'com.kupay.mobile',
        sha256_cert_fingerprints: [ANDROID_RELEASE_SHA, ANDROID_DEBUG_SHA].filter(Boolean),
    },
}]);

export function handleWellKnown(path: string): Response | null {
    if (path === '/.well-known/apple-app-site-association') {
        return new Response(AASA_JSON, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=3600',
            },
        });
    }
    if (path === '/.well-known/assetlinks.json') {
        return new Response(ANDROID_LINKS_JSON, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=3600',
            },
        });
    }
    return null;
}
