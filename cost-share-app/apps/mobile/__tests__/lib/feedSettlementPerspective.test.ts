import {
    resolveSettlementFeedPerspective,
    settlementFeedTitleKey,
    buildSettlementFeedCopy,
} from '../../lib/feedSettlementPerspective';
import type { Settlement } from '@cost-share/shared';

const settlement: Settlement = {
    id: 'st1',
    groupId: 'g1',
    fromUserId: 'alice',
    toUserId: 'bob',
    amount: 50,
    currency: 'ILS',
    createdBy: 'alice',
    settlementDate: new Date(),
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
};

describe('feedSettlementPerspective', () => {
    it('maps payer, recipient, and third-party perspectives', () => {
        expect(resolveSettlementFeedPerspective(settlement, 'alice')).toBe(
            'youPaid',
        );
        expect(settlementFeedTitleKey('youPaid')).toBe(
            'feed.settlementYouClosedAndPaid',
        );

        expect(resolveSettlementFeedPerspective(settlement, 'bob')).toBe(
            'paidYou',
        );
        expect(settlementFeedTitleKey('paidYou')).toBe(
            'feed.settlementClosedAndPaidYou',
        );

        expect(resolveSettlementFeedPerspective(settlement, 'me')).toBe(
            'thirdParty',
        );
        expect(settlementFeedTitleKey('thirdParty')).toBe(
            'feed.settlementClosedAndPaidOther',
        );
    });

    it('builds copy key for the viewing user as payer', () => {
        const copy = buildSettlementFeedCopy(settlement, 'alice');
        expect(copy.key).toBe('feed.settlementYouClosedAndPaid');
    });

    it('builds copy key for the viewing user as recipient', () => {
        const copy = buildSettlementFeedCopy(settlement, 'bob');
        expect(copy.key).toBe('feed.settlementClosedAndPaidYou');
    });
});
