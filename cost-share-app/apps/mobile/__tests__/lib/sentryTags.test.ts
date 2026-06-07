import { SENTRY_TAGS } from '../../lib/sentryTags';

describe('SENTRY_TAGS', () => {
    it('exposes the documented tag set', () => {
        expect(SENTRY_TAGS).toEqual({
            CACHE_PERSIST: 'cache.persist',
            CACHE_REHYDRATE: 'cache.rehydrate',
            MUTATION_OFFLINE_ADD: 'mutation.offline_add',
            REALTIME_ECHO: 'realtime.echo',
            SWEEP_ZOMBIE: 'sweep.zombie',
            NETWORK_TRANSITION: 'network.transition',
        });
    });
});
