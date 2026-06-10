// Serves the Universal Links / App Links association files under /.well-known/*.
// Env vars (set on the Supabase project secrets — see Task 24):
//   COPAY_IOS_TEAM_ID (legacy: KUPAY_IOS_TEAM_ID, KUPA_IOS_TEAM_ID) — Apple Developer Team ID
//   COPAY_ANDROID_DEBUG_SHA256 / COPAY_ANDROID_RELEASE_SHA256 — Android keystore SHA-256

function env(...names: string[]): string {
    for (const n of names) {
        const v = Deno.env.get(n);
        if (v) return v;
    }
    return '';
}

const TEAM_ID = env('COPAY_IOS_TEAM_ID', 'KUPAY_IOS_TEAM_ID', 'KUPA_IOS_TEAM_ID');
const ANDROID_DEBUG_SHA = env('COPAY_ANDROID_DEBUG_SHA256', 'KUPAY_ANDROID_DEBUG_SHA256', 'KUPA_ANDROID_DEBUG_SHA256');
const ANDROID_RELEASE_SHA = env('COPAY_ANDROID_RELEASE_SHA256', 'KUPAY_ANDROID_RELEASE_SHA256', 'KUPA_ANDROID_RELEASE_SHA256');

const AASA_JSON = JSON.stringify({
    applinks: {
        apps: [],
        details: [{
            appID: `${TEAM_ID}.com.copay.mobile`,
            paths: ['/i/*', '/g/*'],
        }],
    },
});

const ANDROID_LINKS_JSON = JSON.stringify([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
        namespace: 'android_app',
        package_name: 'com.copay.mobile',
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
