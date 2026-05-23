import type { TFunction } from 'i18next';

/**
 * Minimal user shape recognised by the display helpers.
 * Matches mobile's camelCase convention (post-mapper). All fields are tolerant
 * of `undefined` so callers from heterogeneous data sources (full User, lite
 * member rows, friend rows, current-user store) work uniformly.
 */
export type UserLike = {
    id: string;
    name?: string | null;
    avatarUrl?: string | null;
    isActive?: boolean;
} | null | undefined;

export function isDeleted(user: UserLike): boolean {
    return Boolean(user && user.isActive === false);
}

export function getDisplayName(user: UserLike, t: TFunction): string {
    if (!user || user.isActive === false) return t('common.deletedUser');
    return user.name?.trim() || t('common.unknownUser');
}

export function getAvatarUrl(user: UserLike): string | null {
    if (!user || user.isActive === false) return null;
    return user.avatarUrl ?? null;
}
