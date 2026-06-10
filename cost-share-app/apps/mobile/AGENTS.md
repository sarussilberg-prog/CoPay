# Mobile app — agent instructions

## Supabase (mandatory)

Read [docs/SSOT/SUPABASE_ENVIRONMENTS.md](../../../docs/SSOT/SUPABASE_ENVIRONMENTS.md).

| Branch | `EXPO_PUBLIC_SUPABASE_URL` must contain |
|--------|----------------------------------------|
| `dev` | `drxfbicunusmipdgbgdk` |
| `main` | `jfqxjjjbpxbwwvoygahu` |

Local dev: copy `.env.example` → `.env`.  
EAS production: `bash scripts/eas-sync-secrets.sh .env.production`

**Android Google sign-in:** OAuth in a **partial Chrome Custom Tab** (~80% bottom sheet) via local module `copay-partial-auth-browser`. Google account UI renders inside Chrome (not WebView — `403 disallowed_useragent`). Web client ID in Supabase + `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`; Android OAuth client = package + SHA-1 in Google Cloud only. After native module changes: `npx expo prebuild --clean` && rebuild. See `docs/PLAY_STORE_ANDROID.md` §3.4.

## Expo

Read the exact versioned docs at https://docs.expo.dev/versions/v55.0.0/ before writing any code.

**Native prebuild:** Run only from `apps/mobile` (or `npm run prebuild:clean` from `cost-share-app` root). Do **not** run `npx expo prebuild` from `cost-share-app/` — that creates a stray `cost-share-app/android/` and does not update `apps/mobile/android/`, which `android:run` uses.

**Brand icons & splash:** Source of truth is the **transparent** `assets/brand/logo-master.png` (1024×1024). `npm run generate:brand` regenerates every platform PNG from it with tuned safe-zone scales — mobile (`assets/`), the Expo-web export (`public/` + `assets/favicon.png`), **and** the web app (`../web/public/`). Background rule: launcher/installable icons are flattened **white** (iOS `icon.png`, Android background layer, apple-touch / `icon-180/192/512`); in-app + brand surfaces stay **transparent** (`logo.png`, `splash-icon.png`, Android foreground/monochrome, `favicon.png`, web `icon.png`). Android launcher white also needs `app.json` → `android.adaptiveIcon.backgroundColor: "#ffffff"`. After regenerating, run `npm run prebuild:clean` (native `android/`+`ios/` are gitignored and rebuilt from these). Splash `imageWidth` per platform lives in `app.json` → `expo-splash-screen` plugin.
