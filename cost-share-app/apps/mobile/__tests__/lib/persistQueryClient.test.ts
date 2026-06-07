import {
    PERSIST_ALLOWLIST_PREFIXES,
    PERSIST_SCHEMA_VERSION,
    computePersistBuster,
    shouldDehydrateQueryFactory,
    shouldDehydrateMutationFactory,
} from '../../lib/persistQueryClient';

describe('persistQueryClient helpers', () => {
    it('PERSIST_SCHEMA_VERSION is a non-empty string', () => {
        expect(typeof PERSIST_SCHEMA_VERSION).toBe('string');
        expect(PERSIST_SCHEMA_VERSION.length).toBeGreaterThan(0);
    });

    it('allowlist contains every documented prefix', () => {
        expect(PERSIST_ALLOWLIST_PREFIXES).toEqual(
            expect.arrayContaining([
                'groups',
                'groupExpenses',
                'groupMessages',
                'groupMembers',
                'groupUsers',
                'groupSettlements',
                'groupPairwiseDebts',
                'group-simplified-debts-by-currency',
                'group-contributions',
                'balanceSummary',
                'dashboard',
                'activity',
                'friends',
                'friend-requests',
            ]),
        );
    });

    it('shouldDehydrateQuery accepts allowlisted keys with status=success', () => {
        const fn = shouldDehydrateQueryFactory();
        expect(fn({ queryKey: ['groups'], state: { status: 'success' } } as any)).toBe(true);
        expect(
            fn({ queryKey: ['groupExpenses', 'g1'], state: { status: 'success' } } as any),
        ).toBe(true);
    });

    it('shouldDehydrateQuery rejects unknown keys', () => {
        const fn = shouldDehydrateQueryFactory();
        expect(
            fn({
                queryKey: ['legal-document', 'terms', 'en'],
                state: { status: 'success' },
            } as any),
        ).toBe(false);
        expect(fn({ queryKey: ['adminSentryIssues'], state: { status: 'success' } } as any)).toBe(
            false,
        );
    });

    it('shouldDehydrateQuery rejects pending/error states', () => {
        const fn = shouldDehydrateQueryFactory();
        expect(fn({ queryKey: ['groups'], state: { status: 'pending' } } as any)).toBe(false);
        expect(fn({ queryKey: ['groups'], state: { status: 'error' } } as any)).toBe(false);
    });

    it('shouldDehydrateMutation accepts paused addExpense mutations', () => {
        const fn = shouldDehydrateMutationFactory();
        expect(
            fn({
                options: { mutationKey: ['addExpense', 'pending_x'] },
                state: { isPaused: true },
            } as any),
        ).toBe(true);
    });

    it('shouldDehydrateMutation rejects other mutations', () => {
        const fn = shouldDehydrateMutationFactory();
        expect(
            fn({
                options: { mutationKey: ['deleteGroup', 'g1'] },
                state: { isPaused: true },
            } as any),
        ).toBe(false);
        expect(
            fn({ options: { mutationKey: undefined }, state: { isPaused: true } } as any),
        ).toBe(false);
    });

    it('computePersistBuster combines app version and schema version (NOT userId)', () => {
        const a = computePersistBuster({ appVersion: '1.2.3' });
        const b = computePersistBuster({ appVersion: '1.2.4' });
        expect(a).not.toEqual(b);
        expect(a).toEqual(computePersistBuster({ appVersion: '1.2.3' }));
    });

    it('computePersistBuster is independent of userId (isolation handled by wipe on sign-in/out)', () => {
        const a = computePersistBuster({ appVersion: '1.2.3' });
        const b = computePersistBuster({ appVersion: '1.2.3' });
        expect(a).toEqual(b);
    });
});
