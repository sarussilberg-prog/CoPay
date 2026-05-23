import {
    clearDeactivationNoticePending,
    consumeDeactivationNoticePending,
    markDeactivationNoticePending,
} from '../../lib/deactivationNoticeStorage';

const mockStore = new Map<string, string>();

jest.mock('../../lib/authStorage', () => ({
    authStorage: {
        getItem: (key: string) => Promise.resolve(mockStore.get(key) ?? null),
        setItem: (key: string, value: string) => {
            mockStore.set(key, value);
            return Promise.resolve();
        },
        removeItem: (key: string) => {
            mockStore.delete(key);
            return Promise.resolve();
        },
    },
}));

describe('deactivationNoticeStorage', () => {
    beforeEach(() => {
        mockStore.clear();
    });

    it('marks and consumes the pending notice once', async () => {
        await markDeactivationNoticePending();
        await expect(consumeDeactivationNoticePending()).resolves.toBe(true);
        await expect(consumeDeactivationNoticePending()).resolves.toBe(false);
    });

    it('clear removes a pending notice without consuming', async () => {
        await markDeactivationNoticePending();
        await clearDeactivationNoticePending();
        await expect(consumeDeactivationNoticePending()).resolves.toBe(false);
    });
});
