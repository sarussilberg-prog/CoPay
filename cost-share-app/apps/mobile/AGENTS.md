# Mobile app — agent instructions

## Supabase (mandatory)

Read [docs/SSOT/SUPABASE_ENVIRONMENTS.md](../../../docs/SSOT/SUPABASE_ENVIRONMENTS.md).

| Branch | `EXPO_PUBLIC_SUPABASE_URL` must contain |
|--------|----------------------------------------|
| `dev` | `drxfbicunusmipdgbgdk` |
| `main` | `jfqxjjjbpxbwwvoygahu` |

Local dev: copy `.env.example` → `.env`.  
EAS production: `bash scripts/eas-sync-secrets.sh .env.production`

**Android Google (native):** set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` to a **Web application** OAuth client ID; register Android OAuth client with package `com.kupay.mobile` + debug/release SHA-1. Rebuild dev client after native dep changes (`expo prebuild --clean`). See `docs/PLAY_STORE_ANDROID.md` §3.4.

## Expo

Read the exact versioned docs at https://docs.expo.dev/versions/v55.0.0/ before writing any code.
