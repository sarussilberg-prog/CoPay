import { buildGroupExportCsv, csvEscape } from '../../lib/groupExportCsv';
import type { FeedItem, Group, GroupMemberLite, PairwiseDebt } from '@cost-share/shared';
import type { TFunction } from 'i18next';

const t = ((key: string, opts?: Record<string, unknown>) => {
    if (opts) {
        let out = key;
        for (const [k, v] of Object.entries(opts)) {
            out = out.replace(`{{${k}}}`, String(v));
        }
        return out;
    }
    return key;
}) as TFunction;

const group: Group = {
    id: 'g1',
    name: 'Trip',
    groupType: 'trip',
    defaultCurrency: 'ILS',
    inviteToken: 'tok',
    createdBy: 'u1',
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
};

const members: GroupMemberLite[] = [
    { userId: 'u1', displayName: 'Alice', isActive: true },
    { userId: 'u2', displayName: 'Bob', isActive: true },
];

describe('csvEscape', () => {
    it('returns plain values unchanged', () => {
        expect(csvEscape('hello')).toBe('hello');
        expect(csvEscape('123.45')).toBe('123.45');
    });

    it('quotes fields containing commas', () => {
        expect(csvEscape('hello, world')).toBe('"hello, world"');
    });

    it('quotes fields containing double quotes and doubles them inside', () => {
        expect(csvEscape('he said "hi"')).toBe('"he said ""hi"""');
    });

    it('quotes fields containing newlines', () => {
        expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
        expect(csvEscape('line1\r\nline2')).toBe('"line1\r\nline2"');
    });

    it('coerces undefined and null to empty string', () => {
        expect(csvEscape(undefined)).toBe('');
        expect(csvEscape(null)).toBe('');
    });

    it('preserves Hebrew characters as-is', () => {
        expect(csvEscape('שלום')).toBe('שלום');
        expect(csvEscape('שלום, עולם')).toBe('"שלום, עולם"');
    });
});

describe('buildGroupExportCsv', () => {
    it('starts with a UTF-8 BOM so Excel detects Hebrew encoding', () => {
        const csv = buildGroupExportCsv({
            group, feed: [], debts: [], members,
            exportedAt: new Date('2026-05-20T12:00:00'),
            language: 'he', t,
        });
        expect(csv.charCodeAt(0)).toBe(0xFEFF);
    });

    it('uses CRLF line terminators (RFC 4180)', () => {
        const csv = buildGroupExportCsv({
            group, feed: [], debts: [], members,
            exportedAt: new Date('2026-05-20T12:00:00'),
            language: 'en', t,
        });
        // CSV should contain CRLF, not bare LF between rows.
        expect(csv).toContain('\r\n');
        // No lone LF outside quoted fields. Strip CRLF first, then any remaining \n is illegal.
        const withoutCrlf = csv.replace(/\r\n/g, '');
        expect(withoutCrlf).not.toContain('\n');
    });

    it('includes group metadata rows', () => {
        const csv = buildGroupExportCsv({
            group, feed: [], debts: [], members,
            exportedAt: new Date('2026-05-20T12:00:00'),
            language: 'en', t,
        });
        expect(csv).toContain('Trip');
        expect(csv).toContain('Alice');
        expect(csv).toContain('Bob');
        expect(csv).toContain('ILS');
        expect(csv).toContain('groups.share.exportedAt');
        expect(csv).toContain('groups.share.defaultCurrency');
    });

    it('includes simplified debt rows sorted by currency then amount desc', () => {
        const debts: PairwiseDebt[] = [
            { fromUserId: 'u1', toUserId: 'u2', currency: 'USD', amount: 10 },
            { fromUserId: 'u2', toUserId: 'u1', currency: 'ILS', amount: 30 },
            { fromUserId: 'u2', toUserId: 'u1', currency: 'ILS', amount: 50 },
        ];
        const csv = buildGroupExportCsv({
            group, feed: [], debts, members,
            exportedAt: new Date('2026-05-20T12:00:00'),
            language: 'en', t,
        });
        expect(csv).toContain('groups.share.sectionBalances');
        // ILS rows appear before USD rows; ILS 50 before ILS 30
        const idxIls50 = csv.indexOf('50.00');
        const idxIls30 = csv.indexOf('30.00');
        const idxUsd = csv.indexOf('10.00');
        expect(idxIls50).toBeGreaterThan(-1);
        expect(idxIls50).toBeLessThan(idxIls30);
        expect(idxIls30).toBeLessThan(idxUsd);
    });

    it('shows all-settled marker when there are no debts', () => {
        const csv = buildGroupExportCsv({
            group, feed: [], debts: [], members,
            exportedAt: new Date(),
            language: 'he', t,
        });
        expect(csv).toContain('groups.share.allSettled');
    });

    it('renders expense, message, and settlement history rows sorted newest first', () => {
        const feed: FeedItem[] = [
            {
                kind: 'message',
                sortAt: new Date('2026-05-19T10:00:00'),
                message: {
                    id: 'm1', groupId: 'g1', userId: 'u1', body: 'Hello group',
                    editedAt: null, isDeleted: false,
                    createdAt: new Date('2026-05-19T10:00:00'),
                    updatedAt: new Date('2026-05-19T10:00:00'),
                },
            },
            {
                kind: 'expense',
                sortAt: new Date('2026-05-18T09:00:00'),
                expense: {
                    id: 'e1', groupId: 'g1', description: 'Dinner',
                    amount: 100, currency: 'ILS', category: 'food',
                    expenseDate: new Date('2026-05-18'),
                    paidBy: 'u1', createdBy: 'u1', isDeleted: false,
                    createdAt: new Date('2026-05-18T09:00:00'),
                    updatedAt: new Date('2026-05-18T09:00:00'),
                    splits: [
                        { id: 's1', expenseId: 'e1', userId: 'u1', amount: 50, createdAt: new Date() },
                        { id: 's2', expenseId: 'e1', userId: 'u2', amount: 50, createdAt: new Date() },
                    ],
                    myDelta: 50, myDeltaState: 'lent',
                },
            },
            {
                kind: 'settlement',
                sortAt: new Date('2026-05-17T08:00:00'),
                settlement: {
                    id: 'st1', groupId: 'g1', fromUserId: 'u2', toUserId: 'u1',
                    amount: 25, currency: 'ILS',
                    settlementDate: new Date('2026-05-17'),
                    paymentMethod: 'cash', createdBy: 'u2',
                    createdAt: new Date('2026-05-17T08:00:00'),
                    updatedAt: new Date('2026-05-17T08:00:00'),
                    deletedAt: null,
                },
            },
        ];
        const csv = buildGroupExportCsv({
            group, feed, debts: [], members,
            exportedAt: new Date(),
            language: 'en', t,
        });

        expect(csv).toContain('Hello group');
        expect(csv).toContain('Dinner');
        expect(csv).toContain('100.00');
        expect(csv).toContain('25.00');

        // Newest first: message (May 19) before expense (May 18) before settlement (May 17)
        const idxMessage = csv.indexOf('Hello group');
        const idxExpense = csv.indexOf('Dinner');
        const idxSettlement = csv.indexOf('25.00');
        expect(idxMessage).toBeLessThan(idxExpense);
        expect(idxExpense).toBeLessThan(idxSettlement);
    });

    it('shows empty-history marker when there is no feed', () => {
        const csv = buildGroupExportCsv({
            group, feed: [], debts: [], members,
            exportedAt: new Date(),
            language: 'en', t,
        });
        expect(csv).toContain('groups.share.emptyHistory');
    });

    it('escapes commas, quotes, and newlines in user-provided fields', () => {
        const feed: FeedItem[] = [
            {
                kind: 'expense',
                sortAt: new Date('2026-05-18T09:00:00'),
                expense: {
                    id: 'e1', groupId: 'g1',
                    description: 'Pizza, "extra cheese"\nlarge',
                    amount: 100, currency: 'ILS', category: 'food',
                    expenseDate: new Date('2026-05-18'),
                    paidBy: 'u1', createdBy: 'u1', isDeleted: false,
                    createdAt: new Date('2026-05-18T09:00:00'),
                    updatedAt: new Date('2026-05-18T09:00:00'),
                    splits: [
                        { id: 's1', expenseId: 'e1', userId: 'u1', amount: 100, createdAt: new Date() },
                    ],
                    myDelta: 0, myDeltaState: 'lent',
                },
            },
        ];
        const csv = buildGroupExportCsv({
            group, feed, debts: [], members,
            exportedAt: new Date(),
            language: 'en', t,
        });
        expect(csv).toContain('"Pizza, ""extra cheese""\nlarge"');
    });

    it('does not include any HTML tags', () => {
        const csv = buildGroupExportCsv({
            group, feed: [], debts: [], members,
            exportedAt: new Date(),
            language: 'he', t,
        });
        expect(csv).not.toMatch(/<[a-zA-Z][^>]*>/);
    });
});
