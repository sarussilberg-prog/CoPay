import * as Sentry from '@sentry/react-native';
import { applySentryUser, applySentryLanguage } from '../../lib/sentryIdentity';
import { captureError } from '../../lib/captureError';

const outerSentry = Sentry as unknown as {
    setUser: jest.Mock;
    setTag: jest.Mock;
    captureException: jest.Mock;
};

describe('Sentry init module', () => {
    it('initialises with enabled=false when DSN env var is missing', () => {
        delete process.env.EXPO_PUBLIC_SENTRY_DSN;
        let cfg: { enabled?: boolean; dsn?: string } | undefined;
        jest.isolateModules(() => {
            const innerSentry = require('@sentry/react-native') as { init: jest.Mock };
            innerSentry.init.mockClear();
            require('../../lib/sentry');
            cfg = innerSentry.init.mock.calls[0]?.[0];
        });
        expect(cfg).toBeDefined();
        expect(cfg?.enabled).toBe(false);
        expect(cfg?.dsn).toBeUndefined();
    });

    it('initialises with enabled=true when DSN env var is set', () => {
        process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://abc@example.ingest.de.sentry.io/1';
        let cfg: { enabled?: boolean; dsn?: string } | undefined;
        jest.isolateModules(() => {
            const innerSentry = require('@sentry/react-native') as { init: jest.Mock };
            innerSentry.init.mockClear();
            require('../../lib/sentry');
            cfg = innerSentry.init.mock.calls[0]?.[0];
        });
        expect(cfg).toBeDefined();
        expect(cfg?.enabled).toBe(true);
        expect(cfg?.dsn).toContain('sentry.io');
        delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    });
});

describe('Sentry identity helpers', () => {
    beforeEach(() => {
        outerSentry.setUser.mockClear();
        outerSentry.setTag.mockClear();
    });

    it('applySentryUser sets id/email/username on login and stamps the currency tag', () => {
        applySentryUser({
            id: 'u1',
            email: 'a@b.com',
            name: 'Alice',
            defaultCurrency: 'ILS',
        });
        expect(outerSentry.setUser).toHaveBeenCalledWith({
            id: 'u1',
            email: 'a@b.com',
            username: 'Alice',
        });
        expect(outerSentry.setTag).toHaveBeenCalledWith('default_currency', 'ILS');
    });

    it('applySentryUser clears user + currency tag on sign-out', () => {
        applySentryUser(null);
        expect(outerSentry.setUser).toHaveBeenCalledWith(null);
        expect(outerSentry.setTag).toHaveBeenCalledWith('default_currency', undefined);
    });

    it('applySentryLanguage sets the app_language tag', () => {
        applySentryLanguage('he');
        expect(outerSentry.setTag).toHaveBeenCalledWith('app_language', 'he');
    });
});

describe('captureError helper', () => {
    beforeEach(() => {
        outerSentry.captureException.mockClear();
    });

    it('passes a real Error through unchanged (no originalError in extra)', () => {
        const real = new Error('boom');
        captureError(real, { tags: { service: 'x' } });
        expect(outerSentry.captureException).toHaveBeenCalledTimes(1);
        const [thrown, ctx] = outerSentry.captureException.mock.calls[0];
        expect(thrown).toBe(real);
        expect(ctx.tags).toEqual({ service: 'x' });
        expect(ctx.extra?.originalError).toBeUndefined();
    });

    it('wraps a Supabase-shaped object in a real Error using its message + preserves the original', () => {
        const supaErr = {
            code: '23505',
            details: 'Key (id)=(1) already exists.',
            hint: null,
            message: 'duplicate key value violates unique constraint',
        };
        captureError(supaErr, { tags: { service: 'expenses', op: 'create' }, extra: { groupId: 'g1' } });
        expect(outerSentry.captureException).toHaveBeenCalledTimes(1);
        const [thrown, ctx] = outerSentry.captureException.mock.calls[0];
        expect(thrown).toBeInstanceOf(Error);
        expect((thrown as Error).message).toBe('duplicate key value violates unique constraint');
        expect(ctx.tags).toEqual({ service: 'expenses', op: 'create' });
        expect(ctx.extra).toMatchObject({ groupId: 'g1', originalError: supaErr });
    });

    it('falls back to a key listing when the object has no message', () => {
        captureError({ foo: 1, bar: 2 });
        const [thrown] = outerSentry.captureException.mock.calls[0];
        expect(thrown).toBeInstanceOf(Error);
        expect((thrown as Error).message).toContain('foo');
        expect((thrown as Error).message).toContain('bar');
    });

    it('wraps a thrown string', () => {
        captureError('network down');
        const [thrown] = outerSentry.captureException.mock.calls[0];
        expect(thrown).toBeInstanceOf(Error);
        expect((thrown as Error).message).toBe('network down');
    });
});

describe('Service-layer createExpense', () => {
    it('throws on Supabase failure so the mutation hook can surface the error', async () => {
        jest.resetModules();

        const singleMock = jest.fn().mockResolvedValue({
            data: null,
            error: { message: 'db-down' },
        });
        const selectMock = jest.fn(() => ({ single: singleMock }));
        const insertMock = jest.fn(() => ({ select: selectMock }));
        const fromMock = jest.fn(() => ({ insert: insertMock }));

        jest.doMock('../../lib/supabase', () => ({
            supabase: {
                from: fromMock,
                rpc: jest.fn(),
                auth: { getUser: jest.fn() },
            },
        }));
        jest.doMock('../../lib/auth', () => ({
            getCurrentUserId: jest.fn().mockResolvedValue('u1'),
        }));
        jest.doMock('../../lib/appToast', () => ({
            showErrorToast: jest.fn(),
            showSuccessToast: jest.fn(),
            showSuccessMessage: jest.fn(),
            expenseSplitValidationMessage: jest.fn(() => ''),
        }));
        jest.doMock('../../i18n', () => ({
            __esModule: true,
            default: { t: (k: string) => k },
        }));

        const { createExpense } = require('../../services/expenses.service');
        await expect(
            createExpense({
                groupId: 'g1',
                description: 'lunch',
                amount: 100,
                currency: 'ILS',
                paidBy: 'u1',
                splits: [{ userId: 'u1', amount: 100 }],
            }),
        ).rejects.toMatchObject({ message: 'db-down' });
    });
});
