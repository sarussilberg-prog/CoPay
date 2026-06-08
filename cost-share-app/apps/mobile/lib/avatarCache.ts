/**
 * Disk-backed avatar cache.
 *
 * Keyed by `(kind, id)` — `kind` is `'user'` or `'group'`, `id` is the
 * userId / groupId. Each identity owns exactly one file on disk; if the
 * avatar URL changes (the user uploads a new picture, the URL token rotates,
 * etc.) we overwrite that one file. No orphans, no duplicates across the 8
 * places the same person's face shows up.
 *
 * Render-side lookups are by remote URL (since `MemberAvatar` only gets a
 * URL prop, no userId). We keep a `reverseLookup: Map<url, localUri>` in
 * memory that's rebuilt from the manifest at init and kept in sync as
 * prefetches land.
 *
 * Files live in `Paths.document/avatars/` so iOS doesn't evict them under
 * storage pressure (defeats the offline guarantee). The manifest itself
 * lives in AsyncStorage as JSON; small (<100 KB even with hundreds of users).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

const MANIFEST_STORAGE_KEY = 'avatar-cache.manifest.v1';
const CACHE_SUBDIR = 'avatars';

function getCacheDirectory(): Directory {
    return new Directory(Paths.document, CACHE_SUBDIR);
}

export type AvatarKind = 'user' | 'group';

interface ManifestEntry {
    url: string;
    localUri: string;
}

interface Manifest {
    users: Record<string, ManifestEntry>;
    groups: Record<string, ManifestEntry>;
}

const EMPTY_MANIFEST = (): Manifest => ({ users: {}, groups: {} });

let manifest: Manifest = EMPTY_MANIFEST();
const reverseLookup = new Map<string, string>(); // remoteUrl → localUri
const inFlight = new Map<string, Promise<string | null>>(); // `${kind}:${id}` → promise

type Subscriber = (localUri: string | undefined) => void;
const subscribers = new Map<string, Set<Subscriber>>(); // remoteUrl → set of callbacks

let initialized = false;
let initPromise: Promise<void> | null = null;

function bucketFor(kind: AvatarKind): Record<string, ManifestEntry> {
    return kind === 'user' ? manifest.users : manifest.groups;
}

function rebuildReverseLookup(): void {
    reverseLookup.clear();
    for (const entry of Object.values(manifest.users)) {
        reverseLookup.set(entry.url, entry.localUri);
    }
    for (const entry of Object.values(manifest.groups)) {
        reverseLookup.set(entry.url, entry.localUri);
    }
}

async function ensureDir(): Promise<void> {
    try {
        const dir = getCacheDirectory();
        // `create()` is a no-op if the directory already exists when called
        // with `intermediates: true`. The new SDK throws on collision otherwise,
        // so we swallow.
        dir.create({ intermediates: true });
    } catch {
        // Already exists or filesystem unavailable in this env.
    }
}

async function loadManifest(): Promise<void> {
    try {
        const raw = await AsyncStorage.getItem(MANIFEST_STORAGE_KEY);
        if (!raw) {
            manifest = EMPTY_MANIFEST();
            return;
        }
        const parsed = JSON.parse(raw) as Partial<Manifest>;
        manifest = {
            users: parsed.users ?? {},
            groups: parsed.groups ?? {},
        };
    } catch {
        manifest = EMPTY_MANIFEST();
    }
}

let savePending: ReturnType<typeof setTimeout> | null = null;
function scheduleManifestSave(): void {
    if (savePending) return;
    // Batch nearby writes so a burst of prefetches lands in one AsyncStorage
    // round-trip. 250ms is short enough that a sign-out (which clears) wins.
    savePending = setTimeout(() => {
        savePending = null;
        void AsyncStorage.setItem(
            MANIFEST_STORAGE_KEY,
            JSON.stringify(manifest),
        ).catch(() => {
            // No retry — next prefetch will reschedule.
        });
    }, 250);
}

export async function initAvatarCache(): Promise<void> {
    if (initialized) return;
    if (initPromise) return initPromise;
    initPromise = (async () => {
        await Promise.all([loadManifest(), ensureDir()]);
        rebuildReverseLookup();
        initialized = true;
    })();
    return initPromise;
}

/**
 * Sync render-time lookup. Returns the cached local URI for a remote URL if
 * one exists, otherwise `undefined`. Components fall back to the remote URL
 * when this returns undefined.
 */
export function getLocalAvatarUri(
    remoteUrl: string | null | undefined,
): string | undefined {
    if (!remoteUrl) return undefined;
    return reverseLookup.get(remoteUrl);
}

function fileNameFor(kind: AvatarKind, id: string): string {
    // Sanitize the id so it can't escape the cache dir or break the path.
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${kind}_${safeId}`;
}

function notify(url: string, localUri: string | undefined): void {
    const set = subscribers.get(url);
    if (!set) return;
    for (const cb of set) cb(localUri);
}

function tryDeleteFile(localUri: string | undefined): void {
    if (!localUri) return;
    try {
        new File(localUri).delete();
    } catch {
        // already gone or filesystem refused; not worth retrying
    }
}

export interface PrefetchAvatarInput {
    kind: AvatarKind;
    id: string;
    url: string | null | undefined;
}

/**
 * Download an avatar to local disk for the given identity, overwriting any
 * previous cached file for that identity if the URL has changed. Dedupes
 * in-flight downloads per `(kind, id)` so a thundering scan doesn't fire the
 * same download twice. Returns the local URI on success, `null` on failure
 * (typically offline).
 */
export async function prefetchAvatar(
    input: PrefetchAvatarInput,
): Promise<string | null> {
    if (!initialized) await initAvatarCache();
    const { kind, id, url } = input;
    if (!url || !id) return null;

    const bucket = bucketFor(kind);
    const existing = bucket[id];
    if (existing && existing.url === url && reverseLookup.has(url)) {
        // Cached and current. No work.
        return existing.localUri;
    }

    const flightKey = `${kind}:${id}`;
    const inFlightPromise = inFlight.get(flightKey);
    if (inFlightPromise) return inFlightPromise;

    const promise = (async (): Promise<string | null> => {
        try {
            // Drop any prior file for this identity before downloading to
            // make sure downloadFileAsync (which creates a new file in the
            // directory) doesn't collide with the old one. The old entry's
            // URL may differ, but the on-disk file path may be reused by
            // some platforms based on identity.
            const prior = bucket[id];
            if (prior?.localUri) {
                tryDeleteFile(prior.localUri);
            }

            const destFile = new File(
                getCacheDirectory(),
                fileNameFor(kind, id),
            );
            // expo-file-system v19 picks the destination filename from the
            // URL by default if you pass a Directory; we pass a File so it
            // writes to the exact path we control.
            const downloaded = await File.downloadFileAsync(url, destFile);
            const localUri = downloaded.uri;
            if (!localUri) return null;

            // Atomic-ish manifest update.
            if (prior && prior.url !== url) {
                reverseLookup.delete(prior.url);
                notify(prior.url, undefined);
            }
            bucket[id] = { url, localUri };
            reverseLookup.set(url, localUri);
            scheduleManifestSave();
            notify(url, localUri);
            return localUri;
        } catch {
            return null;
        } finally {
            inFlight.delete(flightKey);
        }
    })();
    inFlight.set(flightKey, promise);
    return promise;
}

/**
 * Subscribe to local-URI changes for a specific remote URL. Used by
 * `useLocalAvatar` so a component re-renders when its avatar's prefetch
 * finishes (or when the URL gets invalidated by a re-upload).
 */
export function subscribeAvatarLocalUri(
    remoteUrl: string,
    cb: Subscriber,
): () => void {
    let set = subscribers.get(remoteUrl);
    if (!set) {
        set = new Set();
        subscribers.set(remoteUrl, set);
    }
    set.add(cb);
    return () => {
        const s = subscribers.get(remoteUrl);
        if (!s) return;
        s.delete(cb);
        if (s.size === 0) subscribers.delete(remoteUrl);
    };
}

/**
 * Wipe everything — files, manifest, in-memory state, in-flight downloads.
 * Called from `wipePersistedCache()` on sign-out so user A's friends' faces
 * don't appear when user B signs in on the same device.
 */
export async function clearAvatarCache(): Promise<void> {
    if (savePending) {
        clearTimeout(savePending);
        savePending = null;
    }
    manifest = EMPTY_MANIFEST();
    reverseLookup.clear();
    inFlight.clear();
    // Notify any active subscribers so they re-render to the remote URL (or
    // initials, if signed out).
    for (const [url, set] of subscribers) {
        for (const cb of set) cb(undefined);
        void url;
    }
    subscribers.clear();
    try {
        await AsyncStorage.removeItem(MANIFEST_STORAGE_KEY);
    } catch {
        // swallow
    }
    try {
        const dir = getCacheDirectory();
        dir.delete();
    } catch {
        // swallow — dir may not exist
    }
}

// ---- test hooks ----
export function __resetAvatarCacheForTests(): void {
    if (savePending) {
        clearTimeout(savePending);
        savePending = null;
    }
    manifest = EMPTY_MANIFEST();
    reverseLookup.clear();
    inFlight.clear();
    subscribers.clear();
    initialized = false;
    initPromise = null;
}
