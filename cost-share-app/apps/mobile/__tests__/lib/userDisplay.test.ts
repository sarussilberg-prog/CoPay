import { getAvatarUrl, getDisplayName, isDeleted } from '../../lib/userDisplay';

const t = (key: string) => key;

const active = { id: 'a', name: 'Alice', avatarUrl: 'https://x/a.png', isActive: true };
const deleted = { id: 'd', name: null, avatarUrl: null, isActive: false };
const nameless = { id: 'n', name: '   ', avatarUrl: null, isActive: true };

describe('userDisplay', () => {
    describe('isDeleted', () => {
        it('returns true for isActive=false', () => expect(isDeleted(deleted)).toBe(true));
        it('returns false for isActive=true', () => expect(isDeleted(active)).toBe(false));
        it('returns false for null/undefined', () => {
            expect(isDeleted(null)).toBe(false);
            expect(isDeleted(undefined)).toBe(false);
        });
        it('treats isActive=undefined as not deleted', () => {
            expect(isDeleted({ id: 'x' })).toBe(false);
        });
    });

    describe('getDisplayName', () => {
        it('returns the name for active users', () => {
            expect(getDisplayName(active, t as any)).toBe('Alice');
        });
        it('returns common.deletedUser for deleted users', () => {
            expect(getDisplayName(deleted, t as any)).toBe('common.deletedUser');
        });
        it('returns common.deletedUser for null user', () => {
            expect(getDisplayName(null, t as any)).toBe('common.deletedUser');
        });
        it('returns common.unknownUser for active user with blank name', () => {
            expect(getDisplayName(nameless, t as any)).toBe('common.unknownUser');
        });
        it('returns common.unknownUser when name is missing entirely', () => {
            expect(getDisplayName({ id: 'x' }, t as any)).toBe('common.unknownUser');
        });
    });

    describe('getAvatarUrl', () => {
        it('returns the avatar URL for active users', () => {
            expect(getAvatarUrl(active)).toBe('https://x/a.png');
        });
        it('returns null for deleted users', () => {
            expect(getAvatarUrl(deleted)).toBeNull();
        });
        it('returns null for null user', () => {
            expect(getAvatarUrl(null)).toBeNull();
        });
        it('returns null when avatarUrl missing', () => {
            expect(getAvatarUrl({ id: 'x' })).toBeNull();
        });
    });
});
