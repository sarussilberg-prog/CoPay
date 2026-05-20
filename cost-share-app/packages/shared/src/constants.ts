import type { GroupType } from './types';

/** ISO 4217 default currency for new users, groups, and expenses. */
export const DEFAULT_CURRENCY = 'ILS';

/** All group types shown in create/edit group forms (order preserved for UI). */
export const GROUP_TYPES: readonly GroupType[] = [
    'general',
    'trip',
    'home',
    'couple',
    'work',
    'event',
    'friends',
    'other',
] as const;
