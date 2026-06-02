import {
    cancelGoogleSignInSheet,
    completeGoogleSignInSheet,
    getGoogleSignInSheetSession,
    presentGoogleSignInSheet,
} from '../../lib/googleSignInSheet';

describe('googleSignInSheet', () => {
    afterEach(() => {
        cancelGoogleSignInSheet();
    });

    it('runs sign-in inside an active sheet session', async () => {
        const run = jest.fn().mockResolvedValue({ error: null });
        const pending = presentGoogleSignInSheet(run);

        expect(getGoogleSignInSheetSession()).not.toBeNull();
        expect(run).not.toHaveBeenCalled();

        completeGoogleSignInSheet({ error: null });

        await expect(pending).resolves.toEqual({ error: null });
        expect(getGoogleSignInSheetSession()).toBeNull();
    });
});
