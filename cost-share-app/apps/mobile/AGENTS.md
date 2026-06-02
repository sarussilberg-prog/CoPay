# Mobile app — agent instructions

## Supabase (mandatory)

Read [docs/SSOT/SUPABASE_ENVIRONMENTS.md](../../../docs/SSOT/SUPABASE_ENVIRONMENTS.md).

| Branch | `EXPO_PUBLIC_SUPABASE_URL` must contain |
|--------|----------------------------------------|
| `dev` | `drxfbicunusmipdgbgdk` |
| `main` | `jfqxjjjbpxbwwvoygahu` |

Local dev: copy `.env.example` → `.env`.  
EAS production: `bash scripts/eas-sync-secrets.sh .env.production`

**Android Google sign-in:** Requires `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (Web OAuth client). Uses native Google Sign-In inside an 80% bottom sheet — **do not** load Google OAuth in a WebView (Google returns `403 disallowed_useragent`). Fallback without the env var: Chrome Custom Tab via `expo-web-browser`. See `docs/PLAY_STORE_ANDROID.md` §3.4.

## Expo

Read the exact versioned docs at https://docs.expo.dev/versions/v55.0.0/ before writing any code.
