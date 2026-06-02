import { buildGroupExportFilename } from '../../services/group-share.service';
import type { Group } from '@cost-share/shared';

const baseGroup: Group = {
    id: 'g1',
    name: 'Trip to Paris',
    groupType: 'trip',
    defaultCurrency: 'EUR',
    inviteToken: 'abc1234567',
    createdBy: 'u1',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
};

describe('buildGroupExportFilename', () => {
    it('includes the group name and export date', () => {
        const filename = buildGroupExportFilename(baseGroup, new Date('2026-05-20T12:00:00Z'));
        expect(filename).toBe('Trip to Paris-2026-05-20.csv');
    });

    it('preserves Hebrew group names', () => {
        const filename = buildGroupExportFilename(
            { ...baseGroup, name: 'טיול ליוון' },
            new Date('2026-05-20T12:00:00Z'),
        );
        expect(filename).toBe('טיול ליוון-2026-05-20.csv');
    });

    it('replaces filesystem-unsafe characters', () => {
        const filename = buildGroupExportFilename(
            { ...baseGroup, name: 'Trip: Paris/2026' },
            new Date('2026-05-20T12:00:00Z'),
        );
        expect(filename).toBe('Trip_ Paris_2026-2026-05-20.csv');
    });
});
