import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../hooks/queries/keys';
import { applyGroupsRealtimeEventToCache } from '../../hooks/useAppRealtime';

describe('applyGroupsRealtimeEventToCache (idempotent upsert)', () => {
    function setup(seed: any[]) {
        const client = new QueryClient();
        client.setQueryData(queryKeys.groups, seed);
        return client;
    }

    it('UPDATE replaces an existing row by id, preserving local-only fields', () => {
        const client = setup([
            {
                id: 'g1',
                name: 'Old',
                members: [{ id: 'u1' }],
                isArchivedByMe: true,
                isAutoArchived: false,
            },
        ]);
        applyGroupsRealtimeEventToCache(client, {
            eventType: 'UPDATE',
            new: {
                id: 'g1',
                name: 'New',
                is_active: true,
                default_currency: 'USD',
                created_by: 'u1',
                created_at: '2026-01-01',
                updated_at: '2026-01-01',
            },
        } as any);
        const next = client.getQueryData<any[]>(queryKeys.groups);
        expect(next?.find((g) => g.id === 'g1').name).toBe('New');
        expect(next?.find((g) => g.id === 'g1').members).toEqual([{ id: 'u1' }]);
        expect(next?.find((g) => g.id === 'g1').isArchivedByMe).toBe(true);
    });

    it('applying the same UPDATE twice produces the same cache (idempotent)', () => {
        const client = setup([{ id: 'g1', name: 'Old', members: [] }]);
        const event = {
            eventType: 'UPDATE' as const,
            new: {
                id: 'g1',
                name: 'New',
                is_active: true,
                default_currency: 'USD',
                created_by: 'u1',
                created_at: '2026-01-01',
                updated_at: '2026-01-01',
            },
        };
        applyGroupsRealtimeEventToCache(client, event as any);
        const after1 = client.getQueryData<any[]>(queryKeys.groups);
        applyGroupsRealtimeEventToCache(client, event as any);
        const after2 = client.getQueryData<any[]>(queryKeys.groups);
        expect(after2).toEqual(after1);
    });

    it('DELETE removes by id and is idempotent', () => {
        const client = setup([{ id: 'g1' }, { id: 'g2' }]);
        applyGroupsRealtimeEventToCache(client, {
            eventType: 'DELETE',
            old: { id: 'g1' },
        } as any);
        expect(client.getQueryData<any[]>(queryKeys.groups)).toEqual([{ id: 'g2' }]);
        applyGroupsRealtimeEventToCache(client, {
            eventType: 'DELETE',
            old: { id: 'g1' },
        } as any);
        expect(client.getQueryData<any[]>(queryKeys.groups)).toEqual([{ id: 'g2' }]);
    });

    it('UPDATE with is_active=false removes the row', () => {
        const client = setup([{ id: 'g1' }]);
        applyGroupsRealtimeEventToCache(client, {
            eventType: 'UPDATE',
            new: { id: 'g1', is_active: false },
        } as any);
        expect(client.getQueryData<any[]>(queryKeys.groups)).toEqual([]);
    });

    it('UPDATE for an unknown id is a no-op (membership listener handles inserts)', () => {
        const client = setup([{ id: 'g1' }]);
        applyGroupsRealtimeEventToCache(client, {
            eventType: 'UPDATE',
            new: { id: 'g-unknown', is_active: true },
        } as any);
        expect(client.getQueryData<any[]>(queryKeys.groups)).toEqual([{ id: 'g1' }]);
    });
});
