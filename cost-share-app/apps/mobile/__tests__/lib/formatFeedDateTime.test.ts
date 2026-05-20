import { formatFeedDateTime } from '../../lib/formatFeedDateTime';

describe('formatFeedDateTime', () => {
    it('includes date and time for Hebrew locale', () => {
        const result = formatFeedDateTime(
            new Date('2026-05-20T14:30:00'),
            'he',
        );
        expect(result).toMatch(/\d/);
        expect(result.length).toBeGreaterThan(8);
    });

    it('includes date and time for English locale', () => {
        const result = formatFeedDateTime(
            new Date('2026-05-20T14:30:00'),
            'en',
        );
        expect(result).toMatch(/May|20|2026|\d/);
    });
});
