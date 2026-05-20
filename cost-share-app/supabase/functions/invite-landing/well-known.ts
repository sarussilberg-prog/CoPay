// Serves the Universal Links / App Links association files under /.well-known/*.
// Env vars (set on the Supabase project secrets — see Task 24):
//   KUPA_IOS_TEAM_ID          — 10-char Apple Developer Team ID
//   KUPA_ANDROID_DEBUG_SHA256 — SHA-256 fingerprint of the Android debug keystore
//   KUPA_ANDROID_RELEASE_SHA256 — SHA-256 fingerprint of the Android release keystore

const TEAM_ID = Deno.env.get('KUPA_IOS_TEAM_ID') ?? '';
const ANDROID_DEBUG_SHA = Deno.env.get('KUPA_ANDROID_DEBUG_SHA256') ?? '';
const ANDROID_RELEASE_SHA = Deno.env.get('KUPA_ANDROID_RELEASE_SHA256') ?? '';

const AASA_JSON = JSON.stringify({
    applinks: {
        apps: [],
        details: [{
            appID: `${TEAM_ID}.com.kupa.mobile`,
            paths: ['/i/*', '/g/*'],
        }],
    },
});

const ANDROID_LINKS_JSON = JSON.stringify([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
        namespace: 'android_app',
        package_name: 'com.kupa.mobile',
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
