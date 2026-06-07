/**
 * Native-image-cache prefetcher for avatar URLs.
 *
 * Calling `Image.prefetch(url)` downloads the image into the OS-level cache.
 * Once cached, any subsequent `<Image source={{ uri }}>` mount reads from
 * disk — works offline.
 *
 * Deduped via an in-memory Set so we don't re-prefetch the same URL on every
 * cache change. The native cache itself dedupes across app launches; the Set
 * is just a per-session optimization that avoids hammering `Image.prefetch`.
 */

import { Image } from 'react-native';

const prefetched = new Set<string>();

export function prefetchAvatarUrls(
    urls: Iterable<string | undefined | null>,
): void {
    for (const url of urls) {
        if (!url) continue;
        if (prefetched.has(url)) continue;
        prefetched.add(url);
        // RN's Image.prefetch returns a Promise<boolean>; we don't await — fire
        // and forget. If the prefetch fails (offline, 404, etc.) we drop the
        // URL from the Set so it'll be retried the next time it shows up in
        // a cache scan.
        Image.prefetch(url).catch(() => {
            prefetched.delete(url);
        });
    }
}

export function resetAvatarPrefetchCache(): void {
    prefetched.clear();
}
