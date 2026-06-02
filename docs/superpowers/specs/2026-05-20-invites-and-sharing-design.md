# Invitations & Sharing Mechanism — Design Spec

Date: 2026-05-20
Branch: dev
Status: **approved by user, not yet implemented**

## Goal

Add a link-based invitation layer on top of the existing friends system so users can:

1. **Invite anyone to Kupay as a friend** via a shareable link (WhatsApp/SMS/Telegram/etc.) — even people who don't have the app yet. Sign-up through the link auto-creates the friendship.
2. **Invite anyone to a specific group** via a shareable link. Sign-up or sign-in through the link auto-adds the user to `group_members` (and the existing auto-friend trigger handles friendships).
3. **Surface the "send link" affordance everywhere people search for or pick friends**, so the product feels social-app smooth.

This is a new layer over the existing system; it does **not** replace existing friend-request flows.

---

## Locked decisions (from brainstorming)

| # | Topic | Decision |
|---|---|---|
| 1 | Link types | Two separate kinds — friend (`/i/<token>`) and group (`/g/<token>`). Shared token infrastructure. |
| 2 | Link lifetime | **Always multi-use.** Single-use / expiry deferred to technical debt for security review. |
| 3 | Landing UX | Universal Links + Web landing page (Edge Function). Deferred deep linking is technical debt. |
| 4 | Entry points | Friend link: Settings, EditProfile, FriendsScreen, FindFriendsScreen empty state. Group link: EditGroup, GroupDetail overflow menu. Shared in AddMembersSheet. |
| 5 | Join confirmation | **None.** Auto-join in both cases. Security comes from rotation, not confirmation. |
| 6 | Rotation entry points | Friend link rotated from Settings and EditProfile. Group link rotated from EditGroup. |
| 7 | Group link permissions | **Any active member** can share and rotate the group link. |
| 8 | Domain | `kupa.pro` (real, registered). Used throughout this spec. |
| 9 | Web landing architecture | Supabase Edge Function serves dynamic HTML and `.well-known/*`. Supabase-only stack. |

---

## Architecture

Three layers:

```
┌──────────────────────────────────────────────────────────────┐
│ Mobile App (React Native, Expo v55)                          │
│  • Entry points: Settings, FriendsScreen, FindFriends,       │
│    AddMembersSheet, EditGroup, GroupDetail overflow          │
│  • invite.service.ts — gets URL + opens OS share sheet       │
│  • deepLinks.service.ts — intercepts Universal Link → joins  │
└──────────────────────────────────────────────────────────────┘
                       │  ▲
                       ▼  │  shares URL / opens app on Universal Link
┌──────────────────────────────────────────────────────────────┐
│ Web Landing (kupa.pro/i/<token>, kupa.pro/g/<token>)         │
│  Supabase Edge Function: invite-landing                      │
│  • Resolves token → preview metadata (inviter / group)       │
│  • Renders HTML with OG tags + platform-aware fallback       │
│  • Serves .well-known/{apple-app-site-association,           │
│    assetlinks.json}                                          │
└──────────────────────────────────────────────────────────────┘
                       │  reads/writes
                       ▼
┌──────────────────────────────────────────────────────────────┐
│ Postgres (Supabase)                                          │
│  profiles.invite_token   (added; UNIQUE NOT NULL)            │
│  groups.invite_token     (added; UNIQUE NOT NULL)            │
│  RPCs:                                                       │
│   - get_invite_preview(token)    [public, anon read]         │
│   - redeem_friend_invite(token)  [auth required]             │
│   - redeem_group_invite(token)   [auth required]             │
│   - rotate_friend_invite()       [auth required]             │
│   - rotate_group_invite(group_id)[auth, active member only]  │
└──────────────────────────────────────────────────────────────┘
```

### Click-flow (Universal Link)

```
User taps https://kupa.pro/g/A7XzB2K9 in WhatsApp
   │
   ├─ App installed + iOS/Android recognize domain as Universal Link
   │     → Kupay opens; token passed to deepLinks handler
   │       → calls RPC redeem_group_invite(token)
   │       → navigates to GroupDetailScreen for joined group
   │
   └─ App not installed
         → Browser opens; Edge Function renders landing page:
            • "Naveh invited you to 'Greece Trip' (4 members)"
            • "Open in app" button (deep link try)
            • "Download from App Store / Play"
         → After install, user taps the link again
            → Universal Link fires → same in-app flow as above
```

### Principles

- **Supabase-only**, no external service. Landing page and APIs both live on Supabase.
- **Link = role name, not value**: rotation changes only the `invite_token` column. "Naveh's invite link" and "Group X's invite link" are stable concepts whose value rotates.
- **Public read, authenticated write**: `get_invite_preview` is callable anonymously by the Edge Function; redeem RPCs require a session.
- **Two URL paths**: `/i/<token>` for friend, `/g/<token>` for group — lets the Edge Function know which preview to load without a discriminator query.
- **Token format**: 10-character URL-safe slug (nanoid-style, alphabet `[A-Za-z0-9_-]`).

---

## Database design

### Why columns, not a separate `invite_tokens` table

- Per locked decision #2, every profile and every group has exactly one current link.
- No history needed; rotation replaces the value.
- Single `WHERE invite_token = ?` query instead of a join.
- No risk of orphaned token rows.

### Schema changes

**`profiles` — new column:**

| Column | Type | Notes |
|---|---|---|
| `invite_token` | `TEXT` UNIQUE NOT NULL | nanoid 10-char, alphabet `[A-Za-z0-9_-]` |

**`groups` — new column:**

| Column | Type | Notes |
|---|---|---|
| `invite_token` | `TEXT` UNIQUE NOT NULL | Same format |

**Indexes:** the UNIQUE constraint creates the lookup index automatically. No additional indexes needed.

### Helper function

```sql
CREATE OR REPLACE FUNCTION generate_invite_token()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
AS $$
  -- Returns 10 URL-safe chars [A-Za-z0-9_-] using pgcrypto gen_random_bytes
  -- + base64url encode, trimmed to 10
$$;
```

### RPC functions — all `SECURITY DEFINER`

#### `get_invite_preview(p_token TEXT) RETURNS JSON`

- Callable anonymously (used by Edge Function with anon key).
- Tries `profiles.invite_token` first → returns `{ kind: 'friend', inviter: { id, name, avatar_url } }`.
- Else tries `groups.invite_token` → returns `{ kind: 'group', group: { id, name, currency, member_count, members: [{ id, name, avatar_url } × max 6] } }`.
- Else returns `{ kind: 'invalid' }`.
- Never returns the token itself in the payload — defense against OG-tag leakage.

#### `redeem_friend_invite(p_token TEXT) RETURNS JSON`

- Requires `auth.uid()`.
- Locates profile by token. If not found → raises `invite_not_found`.
- If `target_user_id = auth.uid()` → raises `cannot_self_invite`.
- INSERT into `friendships` (canonical pair, `source = 'request'`, `ON CONFLICT DO NOTHING`).
- DELETE matching `friend_blocks` rows in either direction (mirrors existing accept flow).
- Returns `{ friend_id, friend_name }`.

#### `redeem_group_invite(p_token TEXT) RETURNS JSON`

- Requires `auth.uid()`.
- Locates group by token. If not found → raises `invite_not_found`.
- If user is already an active member → returns `{ group_id, group_name, already_member: true }` (idempotent).
- INSERT into `group_members` (active). Existing `on_group_member_insert_auto_friend` trigger handles auto-friendships with other members.
- Returns `{ group_id, group_name }`.

#### `rotate_friend_invite() RETURNS TEXT`

- Requires `auth.uid()`.
- Updates `profiles.invite_token` for `auth.uid()` to a new token.
- Returns the new token.

#### `rotate_group_invite(p_group_id UUID) RETURNS TEXT`

- Requires `auth.uid()`.
- Verifies caller is an active member of the group.
- Updates `groups.invite_token` to a new token.
- Returns the new token.

### RLS

- `profiles.invite_token`: visible via SELECT only to `auth.uid() = profiles.id` (existing profile RLS already restricts SELECT; extending if needed).
- `groups.invite_token`: visible only to active members of the group (existing group RLS path).
- `get_invite_preview` bypasses RLS via `SECURITY DEFINER`, but only returns metadata that's already implicitly authorized to anyone holding the token (since they can see it in their URL).

### Migration

Single migration file: `cost-share-app/supabase/invite-links.sql`

1. Add `invite_token` column to `profiles` (nullable initially).
2. Backfill: update every row with `generate_invite_token()`.
3. Add `NOT NULL` and `UNIQUE` constraints.
4. Repeat 1–3 for `groups`.
5. Add `BEFORE INSERT` trigger on both tables to default `invite_token` to `generate_invite_token()` when NULL.
6. Create the five RPC functions.
7. Grant `EXECUTE` on `get_invite_preview` to `anon` and `authenticated`; the others only to `authenticated`.

---

## Mobile design — friend invite link

### Service: `apps/mobile/services/invite.service.ts`

```ts
async function shareFriendInvite(): Promise<void>;
async function shareGroupInvite(groupId: string): Promise<void>;
async function rotateFriendInvite(): Promise<string>;
async function rotateGroupInvite(groupId: string): Promise<string>;

function buildFriendInviteMessage(inviterName: string, url: string): string;
function buildGroupInviteMessage(inviterName: string, groupName: string, url: string): string;
function buildInviteUrl(kind: 'friend' | 'group', token: string): string; // → https://kupa.pro/i/<token> | /g/<token>
```

Uses `expo-sharing` (already a project dependency).

Pre-filled share-sheet copy (from i18n; placeholders):

- Friend: `"היי! בוא נחלק הוצאות יחד דרך Kupay. אם תרשם דרך הקישור הזה — נהיה אוטומטית חברים: {url}"`
- Group: `"הוספתי אותך לקבוצת '{groupName}' ב-Kupay. הצטרף דרך הקישור: {url}"`

### Hook: `useInviteLink`

```ts
function useInviteLink(groupId?: string): {
  url: string;
  isReady: boolean;
  share: () => Promise<void>;
  rotate: () => Promise<void>;  // shows Alert.alert confirm first
};
```

### Shared component: `<InviteLinkBlock />`

```ts
type Props = {
  mode: 'expanded' | 'compact'; // expanded = both buttons + URL; compact = share-only (v1.x)
  kind: 'friend' | 'group';
  groupId?: string;             // required when kind = 'group'
};
```

Renders:
- URL (shortened display: `kupa.pro/i/A7XzB2K9`) + "Copy" button.
- "Share link" button → calls `useInviteLink().share()`.
- "Rotate link" button → calls `useInviteLink().rotate()` (which shows Alert.alert first).
- Follows existing RTL conventions (`useRtlLayout`, `rtlRowStyle`).

### Profile state plumbing

- `invite_token` joins `currentUser` in the Zustand store.
- `hydrateCurrentUserProfile` (called in `App.tsx` init) selects it.
- Rotation mutation updates the store's `currentUser.inviteToken` and any React Query caches keyed `['invite-link', 'friend', userId]`.

### Screen changes (friend link)

#### `SettingsScreen`

New "Invite a friend" block at the top of the screen:

- Row "👥 Invite a friend to Kupay" → directly opens the share sheet.
- `<InviteLinkBlock mode="expanded" kind="friend" />` underneath — shows the URL, Copy, Share, Rotate.

#### `EditProfileScreen`

Same `<InviteLinkBlock mode="expanded" kind="friend" />` at the bottom of the form (below name/email/avatar/etc.), before any save button.

#### `FriendsScreen`

Prominent CTA card at the top of the screen, above incoming requests:

```
👤+  Invite a new friend
     Send a link via WhatsApp and more
```

Tap → directly opens share sheet (no intermediate screen).

#### `FindFriendsScreen`

Two affordances:

- **Empty results state** (no matches after search): show a prominent "Invite {query} to Kupay" button. If the query parses as a name, embed the name; otherwise generic "Invite a new friend".
- **Persistent footer** (any search state): subtle bottom-of-list row "Didn't find who you're looking for? — Invite a new friend by link".

Both call `shareFriendInvite()`.

---

## Mobile design — group invite link

### Screen changes (group link)

#### `EditGroupScreen`

Insert a new "Invite link" block between the existing Members section and the Danger Zone:

```
─────────────────────────────
Invite link
kupa.pro/g/B8YcK3M2     Copy
🔗  Share link
🔄  Rotate link
─────────────────────────────
```

Same `<InviteLinkBlock mode="expanded" kind="group" groupId={groupId} />`. Rotate shows Alert.alert with copy explaining current-link consumers will lose access; existing members are unaffected.

#### `GroupDetailScreen`

Add an overflow menu (three-dot icon) in the header. Items:

- 📤 Share invite link → directly opens share sheet via `shareGroupInvite(groupId)`.
- ✏️ Edit group (if not already a separate header button).
- 📊 Export CSV (if not already).

#### `GroupDetailScreen` empty state

Below the existing "Add expense" + "Add Members" CTAs, add a subtle text-link "or share group link" that calls `shareGroupInvite(groupId)`.

#### `AddMembersSheet`

Unified structure (replaces single-purpose picker):

```
Choose from your friends:
[ ] Dana Cohen
[ ] Yossi Levy
[ ] Rachel Avraham
...
─────────────────────────────
🔍  Search other users     ›    → FindFriendsScreen
📤  Share group link        ›    → share sheet via shareGroupInvite()
       [ Add (2) ]
```

Empty state (no friends not already in the group):

```
No friends are available to add.
🔍  Search users           ›
📤  Share group link        ›    [emphasized]
```

The "Add" confirm button only renders when ≥1 friend is selected from the list.

### Toast feedback (both link kinds)

- Share success → no Toast (OS share sheet is its own UX).
- Copy → `Toast` success "Link copied".
- Rotate success → Toast "Link updated".
- Rotate network error → Toast error using `common.networkError`.

---

## Web landing page + Supabase Edge Function

### File layout

```
cost-share-app/supabase/functions/invite-landing/
├── index.ts          # Entry: routes incoming requests
├── render.ts         # HTML template + escape helpers
├── well-known.ts     # apple-app-site-association + assetlinks.json
└── deno.json         # Edge Function config
```

### Routes

| Path | Handler |
|---|---|
| `GET /i/<token>` | Friend invite landing |
| `GET /g/<token>` | Group invite landing |
| `GET /.well-known/apple-app-site-association` | iOS Universal Link association JSON |
| `GET /.well-known/assetlinks.json` | Android App Links association JSON |
| `GET /` | Minimal HTML placeholder (full marketing landing page is out of scope for v1) |
| `*` | 404 |

### Server-side flow per invite

```
GET /g/B8YcK3M2
  │
  ├─ rpc('get_invite_preview', { p_token: 'B8YcK3M2' })
  │
  ├─ if kind === 'invalid' → 404 + "Invalid link" HTML
  │
  ├─ User-Agent sniffing → platform = iOS | Android | Desktop | Other
  │
  └─ Return HTML with:
       • OG tags (rich preview in WhatsApp)
       • Body content (inviter / group preview)
       • JS that attempts `com.kupay.mobile://invite/g/<token>` as fallback
       • Platform-specific CTA (App Store / Play / "mobile only")
```

### HTML content — friend invite

- Inviter's avatar (if available).
- Heading: "{inviterName} wants to share expenses with you on Kupay".
- Short subheading explaining what Kupay is.
- Primary CTA: "Open Kupay" (deep-link try).
- Platform CTA: "Download from App Store" or "Download from Google Play".
- Footer: "After installing, return to this link".

### HTML content — group invite

- Group icon/avatar.
- Heading: "{inviterName} invited you to a group".
- Group name (large, prominent).
- Member preview: up to 6 avatars + count + currency.
- Same primary CTA + platform CTA + footer as above.

### Open Graph tags

```html
<meta property="og:title" content="{escaped title}" />
<meta property="og:description" content="{escaped description}" />
<meta property="og:image" content="https://kupa.pro/og/group-default.png" />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://kupa.pro/{i|g}/{token}" />
```

Static images only in v1 (dynamic OG image generation is technical debt).

### `apple-app-site-association`

```json
{
  "applinks": {
    "apps": [],
    "details": [{
      "appID": "<TEAM_ID>.com.kupay.mobile",
      "paths": ["/i/*", "/g/*"]
    }]
  }
}
```

Served with `Content-Type: application/json`, no file extension.

### `assetlinks.json`

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.kupay.mobile",
    "sha256_cert_fingerprints": ["<SHA256_OF_RELEASE_KEY>"]
  }
}]
```

Both debug and release fingerprints are listed (so Universal Links work during development).

### HTML safety

```ts
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]!));
}
```

All user-provided values (inviter name, group name) are escaped before insertion into HTML.

### Locale + direction

HTML served with `<html lang="he" dir="rtl">`. Web copy lives in the Edge Function source (mirrors the mobile i18n keys; not loaded via i18next).

### Caching

- HTML responses: `Cache-Control: public, max-age=60` (short — rotation should propagate fast).
- `.well-known/*`: `Cache-Control: public, max-age=3600`.

### Supabase client setup

Edge Function uses `createClient` with the anon key. The preview RPC is `SECURITY DEFINER` so the anon caller can still read.

---

## Mobile deep-linking handler

### `app.json` updates

```json
{
  "expo": {
    "scheme": "com.kupay.mobile",
    "ios": {
      "bundleIdentifier": "com.kupay.mobile",
      "associatedDomains": ["applinks:kupa.pro"]
    },
    "android": {
      "package": "com.kupay.mobile",
      "intentFilters": [{
        "action": "VIEW",
        "autoVerify": true,
        "data": [
          { "scheme": "https", "host": "kupa.pro", "pathPattern": "/i/.*" },
          { "scheme": "https", "host": "kupa.pro", "pathPattern": "/g/.*" }
        ],
        "category": ["BROWSABLE", "DEFAULT"]
      }]
    }
  }
}
```

Requires a fresh EAS build (cannot be OTA).

### Service: `apps/mobile/services/deepLinks.service.ts`

```ts
type InviteLink =
  | { kind: 'friend'; token: string }
  | { kind: 'group'; token: string }
  | { kind: 'auth' }
  | { kind: 'unknown' };

function parseIncomingUrl(url: string): InviteLink;

async function handleInviteLink(
  link: InviteLink,
  navigation: NavigationProp,
): Promise<void>;
```

`parseIncomingUrl` matches:
- `https://kupa.pro/i/<token>` → `friend`
- `https://kupa.pro/g/<token>` → `group`
- `com.kupay.mobile://invite/i/<token>` → `friend` (custom-scheme fallback)
- `com.kupay.mobile://invite/g/<token>` → `group`
- Matches `isAuthCallbackUrl` → `auth`
- Otherwise → `unknown`

### Hook: `useInviteRedemption`

Wired into `AppNavigator` after the auth handler in `App.tsx`.

```ts
function useInviteRedemption(): void {
  const incomingUrl = Linking.useURL();
  const navigation = useNavigation();
  const session = useAppStore(s => s.session);
  const pendingInvite = useAppStore(s => s.pendingInvite);
  const setPendingInvite = useAppStore(s => s.setPendingInvite);

  // On URL arrival
  useEffect(() => {
    if (!incomingUrl) return;
    const link = parseIncomingUrl(incomingUrl);
    if (link.kind !== 'friend' && link.kind !== 'group') return;

    if (!session) {
      setPendingInvite(link);
      return;
    }
    void handleInviteLink(link, navigation);
  }, [incomingUrl, session]);

  // On signin with pending invite
  useEffect(() => {
    if (!session || !pendingInvite) return;
    void handleInviteLink(pendingInvite, navigation).finally(() => {
      setPendingInvite(null);
    });
  }, [session, pendingInvite]);
}
```

### Store changes (`useAppStore`)

```ts
type PendingInvite =
  | { kind: 'friend'; token: string }
  | { kind: 'group'; token: string };

interface AppStore {
  // ... existing
  pendingInvite: PendingInvite | null;
  setPendingInvite: (i: PendingInvite | null) => void;
}
```

No persistence layer needed in v1: the pending invite only matters for the lifecycle of a single app launch with the URL in hand. Persisting it is part of the deferred-deep-linking technical debt.

### `handleInviteLink` behaviour

**Group:**
- RPC `redeem_group_invite(token)`.
- Success: Toast "Joined group '{groupName}'"; invalidate `['groups']`, `['group', groupId]`; navigate `Groups → GroupDetail → { groupId }`.
- `already_member: true`: Toast "You're already a member of this group"; navigate to the group anyway.
- `invite_not_found`: Toast error "Invite link is no longer valid".
- Network error: Toast common-network-error; keep the link in `pendingInvite` for a retry.

**Friend:**
- RPC `redeem_friend_invite(token)`.
- Success: Toast "Added {friendName} as a friend"; invalidate `['friends']`, `['dashboard']`; navigate to `Profile → Friends`.
- `cannot_self_invite`: Toast "This is your own invite link"; navigate to Profile.
- `invite_not_found`: same as group.
- Network error: same as group.

### Edge cases

| Case | Behaviour |
|---|---|
| User taps their own invite link | RPC returns `cannot_self_invite` → Toast + nav to Profile |
| User joins a group they already belong to | Idempotent: `already_member: true`, nav to group |
| User taps an old (rotated) link | `invite_not_found` → Toast "Invite link was updated by group members" |
| Deactivated profile, session still active | RPC raises auth/RLS failure → Toast error |
| Rapid double-tap on same link | Idempotent (`already_member` for group; `ON CONFLICT DO NOTHING` for friendship) |
| User on a modal screen when link fires | Navigation proceeds without confirmation (locked decision #5) |

---

## i18n keys (illustrative)

All copy goes through `i18n/locales/{en,he}.json`. Sample keys:

```
invite.friend.title
invite.friend.subtitle
invite.friend.cta
invite.friend.shareMessage
invite.friend.linkLabel
invite.friend.copyButton
invite.friend.copied
invite.friend.rotate
invite.friend.rotateConfirmTitle
invite.friend.rotateConfirmBody
invite.friend.rotated
invite.friend.findEmpty
invite.friend.findEmptyCta
invite.friend.findInviteName

invite.group.title
invite.group.shareMessage
invite.group.linkLabel
invite.group.rotate
invite.group.rotateConfirmTitle
invite.group.rotateConfirmBody
invite.group.rotated
invite.group.emptyStateLink

invite.addMembers.searchOthers
invite.addMembers.sendLink

invite.redemption.friendSuccess
invite.redemption.groupSuccess
invite.redemption.alreadyMember
invite.redemption.selfInvite
invite.redemption.invalid

invite.web.friendHeading
invite.web.friendSubheading
invite.web.groupHeading
invite.web.groupMemberCount
invite.web.openApp
invite.web.downloadIOS
invite.web.downloadAndroid
invite.web.afterInstall
invite.web.invalid
```

Web copy lives in the Edge Function source directly (kept in sync manually with the mobile keys — there is no shared i18n layer between mobile and the Edge Function in v1).

---

## Build order

| # | Step | Deliverable | Depends on |
|---|---|---|---|
| 1 | DB migration | `cost-share-app/supabase/invite-links.sql` — columns, backfill, trigger, RPCs, RLS, grants | — |
| 2 | Edge Function skeleton | `cost-share-app/supabase/functions/invite-landing/` — routing, RPC call, minimal HTML | 1 |
| 3 | DNS + `.well-known` | `kupa.pro` DNS pointing at the Edge Function; AASA + assetlinks served; verify with Apple/Google validators | 2 |
| 4 | Mobile data layer | `invite.service.ts`, `useInviteLink`, `deepLinks.service.ts`, `useInviteRedemption`, store changes | 1 |
| 5 | Mobile deep-link wiring | `app.json` updates, fresh EAS build, `useInviteRedemption` mounted in `AppNavigator` | 3 + 4 |
| 6 | Friend-link UI | `InviteLinkBlock`, Settings/EditProfile/Friends/FindFriends changes | 4 |
| 7 | Group-link UI | EditGroup, GroupDetail overflow menu, empty-state link, AddMembersSheet rework | 4 |
| 8 | Edge Function polish | Final design of HTML, RTL, OG image static assets, copy review | 2 |

End-to-end functional after steps 1–7. Step 8 is a polish pass.

---

## Testing

Unit tests:
- `parseIncomingUrl` — all URL kinds + malformed inputs.
- `buildFriendInviteMessage` / `buildGroupInviteMessage` — escapes and placeholders.
- `useInviteRedemption` — three branches (signed in, pending, network error) with mocked `Linking` + `supabase.rpc`.
- Edge Function `render.ts` — HTML escaping fuzz.

Integration / DB tests:
- All five RPCs against a test schema (idempotency, self-invite, invalid token, rotated token).

E2E (manual):
- Tap link on desktop → browser → App Store flow → install → relaunch link → join.
- Tap link on iOS/Android with app installed → confirm immediate in-app join.
- Rotation: user A rotates, user B taps old link → "invalid" Toast.

---

## Technical debt — revisit later

1. **Placeholder domain** (`kupa.pro`) — if rebrand happens, update `app.json` `associatedDomains`, `.well-known` files, Edge Function host config, i18n share messages, this spec, and `docs/SSOT/SRS.md`.
2. **Multi-use links only** (locked decision #2). Future work: TTL, max-redemptions, single-use sub-mode for personal friend invites.
3. **Deferred deep linking** (locked decision #3). Integrate Branch.io / Firebase Dynamic Links / a custom matchback so first launches don't require a second tap.
4. **Dynamic OG image** — generate per-invite previews on the fly (server-rendered PNG/SVG with inviter / group name / avatars).
5. **Push notification for pending invite** — if invitee's email/phone is captured pre-install, push them after sign-up to land on the group.
6. **Audit log of redemptions** — `invite_redemptions(token_owner, redeemed_by, kind, redeemed_at)` to power "9 joins this week" insight and justify rotations.
7. **Reconsider group-rotation permissions** (locked decision #7 — "any member"). Consider restricting to the creator, or introducing a role model for groups.

---

## Out of scope (v1)

- Invitation via phone contacts (`expo-contacts`) — already tracked in the friends-and-add-members plan.
- Single-use / TTL'd links — technical debt #2.
- Deferred deep linking — technical debt #3.
- Push notifications — separate feature.
- QR code generation for invite links — easy follow-up in `<InviteLinkBlock />` later (`react-native-qrcode-svg`).
- Analytics on click-through / channel / conversion.
- Marketing landing at `kupa.pro/` root (root returns a minimal HTML placeholder in v1).
- Dynamic OG image generation — static image in v1.
- iPad / macOS Catalyst Universal Link handling — native iOS phone build only.
