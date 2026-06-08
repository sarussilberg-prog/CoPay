/**
 * Render-time selector: returns the disk-cached file URI for a given remote
 * avatar URL if one exists, otherwise returns the remote URL so the OS can
 * fetch it normally (and `useAvatarPrefetcher` populates the disk cache for
 * next time).
 *
 * Subscribes to the avatar cache so components automatically re-render when
 * the prefetch lands or when the cached file is invalidated (e.g. on sign-out).
 */

import { useEffect, useState } from 'react';
import {
    getLocalAvatarUri,
    subscribeAvatarLocalUri,
} from '../lib/avatarCache';

export function useLocalAvatar(
    remoteUrl: string | null | undefined,
): string | undefined {
    const [localUri, setLocalUri] = useState<string | undefined>(() =>
        remoteUrl ? getLocalAvatarUri(remoteUrl) : undefined,
    );

    useEffect(() => {
        if (!remoteUrl) {
            setLocalUri(undefined);
            return;
        }
        // Sync to current state (manifest may have loaded after first render).
        setLocalUri(getLocalAvatarUri(remoteUrl));
        // Re-render when the prefetch lands or the entry gets invalidated.
        return subscribeAvatarLocalUri(remoteUrl, (next) => setLocalUri(next));
    }, [remoteUrl]);

    return localUri ?? remoteUrl ?? undefined;
}
