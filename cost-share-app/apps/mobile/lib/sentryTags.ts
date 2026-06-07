export const SENTRY_TAGS = {
    CACHE_PERSIST: 'cache.persist',
    CACHE_REHYDRATE: 'cache.rehydrate',
    MUTATION_OFFLINE_ADD: 'mutation.offline_add',
    REALTIME_ECHO: 'realtime.echo',
    SWEEP_ZOMBIE: 'sweep.zombie',
    NETWORK_TRANSITION: 'network.transition',
} as const;

export type SentryTag = (typeof SENTRY_TAGS)[keyof typeof SENTRY_TAGS];
