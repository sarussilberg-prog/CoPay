jest.mock('../../i18n', () => ({
    __esModule: true,
    default: { t: (key: string) => key },
}));

import * as Sentry from '@sentry/react-native';
import Toast from 'react-native-toast-message';
import { handleError } from '../../lib/handleError';

const sentry = Sentry as unknown as { captureException: jest.Mock };
const toastShow = (Toast as unknown as { show: jest.Mock }).show;

describe('handleError', () => {
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
        sentry.captureException.mockClear();
        toastShow.mockClear();
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });

    it('captures the error to Sentry AND shows the toast with the supplied keys', () => {
        const err = new Error('boom');
        handleError(err, {
            toast: { titleKey: 'history.createError', messageKey: 'common.networkError' },
            tags: { service: 'expenses', op: 'create' },
            extra: { groupId: 'g1', amount: 100 },
        });
        expect(sentry.captureException).toHaveBeenCalledTimes(1);
        const [thrown, ctx] = sentry.captureException.mock.calls[0];
        expect(thrown).toBe(err);
        expect(ctx.tags).toEqual({ service: 'expenses', op: 'create' });
        expect(ctx.extra).toMatchObject({
            groupId: 'g1',
            amount: 100,
            toastTitleKey: 'history.createError',
            toastMessageKey: 'common.networkError',
        });
        expect(toastShow).toHaveBeenCalledTimes(1);
        const toastArg = toastShow.mock.calls[0][0];
        expect(toastArg.type).toBe('error');
        expect(toastArg.text1).toBe('history.createError'); // i18n.t() returns the key in test
    });

    it('normalizes Supabase-shaped errors through captureError', () => {
        const supaErr = {
            code: '23505',
            message: 'duplicate key violates unique constraint',
        };
        handleError(supaErr, {
            toast: { titleKey: 'history.createError' },
            tags: { service: 'expenses' },
        });
        expect(sentry.captureException).toHaveBeenCalledTimes(1);
        const [thrown, ctx] = sentry.captureException.mock.calls[0];
        expect(thrown).toBeInstanceOf(Error);
        expect((thrown as Error).message).toBe('duplicate key violates unique constraint');
        expect(ctx.extra).toMatchObject({
            originalError: supaErr,
            toastTitleKey: 'history.createError',
        });
        expect(toastShow).toHaveBeenCalledTimes(1);
    });

    it('still shows the toast and captures even when extra is omitted', () => {
        handleError(new Error('x'), { toast: { titleKey: 'common.error' } });
        expect(sentry.captureException).toHaveBeenCalledTimes(1);
        expect(toastShow).toHaveBeenCalledTimes(1);
    });

    it('passes a pre-translated secondary message to the toast', () => {
        handleError(new Error('x'), {
            toast: { titleKey: 'auth.signInError', message: 'Token expired' },
        });
        const toastArg = toastShow.mock.calls[0][0];
        expect(toastArg.text2).toBe('Token expired');
    });
});
