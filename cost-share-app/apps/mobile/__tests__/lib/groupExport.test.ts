import { buildGroupExportHtml } from '../../lib/groupExport';
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

describe('buildGroupExportHtml', () => {
    it('includes simplified debt rows sorted by currency and amount', () => {
        const debts: PairwiseDebt[] = [
            { fromUserId: 'u2', toUserId: 'u1', currency: 'ILS', amount: 50 },
            { fromUserId: 'u1', toUserId: 'u2', currency: 'USD', amount: 10 },
        ];
        const html = buildGroupExportHtml({
            group,
            feed: [],
            debts,
            members,
            exportedAt: new Date('2026-05-20T12:00:00'),
            language: 'en',
            t,
        });
        expect(html).toContain('groups.share.sectionBalances');
        expect(html).toContain('Alice');
        expect(html).toContain('Bob');
        expect(html).toContain('50.00');
        expect(html).toContain('10.00');
        expect(html).toContain('ILS');
        expect(html).toContain('USD');
    });

    it('shows all-settled row when there are no debts', () => {
        const html = buildGroupExportHtml({
            group,
            feed: [],
            debts: [],
            members,
            exportedAt: new Date(),
            language: 'he',
            t,
        });
        expect(html).toContain('dir="rtl"');
        expect(html).toContain('groups.share.allSettled');
    });

    it('renders expense, message, and settlement feed rows', () => {
        const feed: FeedItem[] = [
            {
                kind: 'message',
                sortAt: new Date('2026-05-19T10:00:00'),
                message: {
                    id: 'm1',
                    groupId: 'g1',
                    userId: 'u1',
                    body: 'Hello group',
                    editedAt: null,
                    isDeleted: false,
                    createdAt: new Date('2026-05-19T10:00:00'),
                    updatedAt: new Date('2026-05-19T10:00:00'),
                },
            },
            {
                kind: 'expense',
                sortAt: new Date('2026-05-18T09:00:00'),
                expense: {
                    id: 'e1',
                    groupId: 'g1',
                    description: 'Dinner',
                    amount: 100,
                    currency: 'ILS',
                    category: 'food',
                    expenseDate: new Date('2026-05-18'),
                    paidBy: 'u1',
                    createdBy: 'u1',
                    isDeleted: false,
                    createdAt: new Date('2026-05-18T09:00:00'),
                    updatedAt: new Date('2026-05-18T09:00:00'),
                    splits: [
                        { id: 's1', expenseId: 'e1', userId: 'u1', amount: 50, createdAt: new Date() },
                        { id: 's2', expenseId: 'e1', userId: 'u2', amount: 50, createdAt: new Date() },
                    ],
                    myDelta: 50,
                    myDeltaState: 'lent',
                },
            },
            {
                kind: 'settlement',
                sortAt: new Date('2026-05-17T08:00:00'),
                settlement: {
                    id: 'st1',
                    groupId: 'g1',
                    fromUserId: 'u2',
                    toUserId: 'u1',
                    amount: 25,
                    currency: 'ILS',
                    settlementDate: new Date('2026-05-17'),
                    paymentMethod: 'cash',
                    createdBy: 'u2',
                    createdAt: new Date('2026-05-17T08:00:00'),
                    updatedAt: new Date('2026-05-17T08:00:00'),
                    deletedAt: null,
                },
            },
        ];
        const html = buildGroupExportHtml({
            group,
            feed,
            debts: [],
            members,
            exportedAt: new Date(),
            language: 'en',
            t,
        });
        expect(html).toContain('Hello group');
        expect(html).toContain('Dinner');
        expect(html).toContain('row-expense');
        expect(html).toContain('row-message');
        expect(html).toContain('row-settlement');
        expect(html).toContain('Alice: ILS 50.00');
    });
});
