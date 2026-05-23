import {
    getAvatarUrl,
    getAvatarUrlForFriend,
    getAvatarUrlForMember,
    getDisplayEmail,
    getDisplayPhone,
    getDisplayName,
    getDisplayNameForFriend,
    getDisplayNameForMember,
    isDeleted,
} from '../../lib/userDisplay';

const t = (key: string) => key;

const active = {
    id: 'a',
    name: 'Alice',
    avatarUrl: 'https://x/a.png',
    email: 'alice@example.com',
    phone: '+972501234567',
    isActive: true,
};
const deleted = { id: 'd', name: null, avatarUrl: null, isActive: false, email: 'ghost@example.com' };
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

    describe('getDisplayEmail', () => {
        it('returns email for active users', () => {
            expect(getDisplayEmail(active)).toBe('alice@example.com');
        });
        it('returns undefined for deleted users even when email is present on the row', () => {
            expect(getDisplayEmail(deleted)).toBeUndefined();
        });
        it('returns undefined for null user', () => {
            expect(getDisplayEmail(null)).toBeUndefined();
        });
    });

    describe('getDisplayPhone', () => {
        it('returns phone for active users', () => {
            expect(getDisplayPhone(active)).toBe('+972501234567');
        });
        it('returns undefined for deleted users', () => {
            expect(getDisplayPhone({ ...active, isActive: false })).toBeUndefined();
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

    describe('Member helpers', () => {
        const member = { userId: 'u1', displayName: 'Alice', avatarUrl: 'x', isActive: true };
        const deletedMember = { ...member, isActive: false };

        it('getDisplayNameForMember returns name for active member', () =>
            expect(getDisplayNameForMember(member, t as any)).toBe('Alice'));
        it('getDisplayNameForMember returns deletedUser for inactive', () =>
            expect(getDisplayNameForMember(deletedMember, t as any)).toBe('common.deletedUser'));
        it('getDisplayNameForMember returns deletedUser for null', () =>
            expect(getDisplayNameForMember(null, t as any)).toBe('common.deletedUser'));
        it('getDisplayNameForMember returns deletedUser for undefined', () =>
            expect(getDisplayNameForMember(undefined, t as any)).toBe('common.deletedUser'));
        it('getAvatarUrlForMember returns avatar for active member', () =>
            expect(getAvatarUrlForMember(member)).toBe('x'));
        it('getAvatarUrlForMember returns undefined for inactive', () =>
            expect(getAvatarUrlForMember(deletedMember)).toBeUndefined());
        it('getAvatarUrlForMember returns undefined for null', () =>
            expect(getAvatarUrlForMember(null)).toBeUndefined());
    });

    describe('Friend helpers', () => {
        const friend = { userId: 'u1', name: 'Bob', avatarUrl: 'y', isActive: true };
        const deletedFriend = { ...friend, isActive: false };

        it('getDisplayNameForFriend returns name for active friend', () =>
            expect(getDisplayNameForFriend(friend, t as any)).toBe('Bob'));
        it('getDisplayNameForFriend returns deletedUser for inactive', () =>
            expect(getDisplayNameForFriend(deletedFriend, t as any)).toBe('common.deletedUser'));
        it('getDisplayNameForFriend returns deletedUser for null', () =>
            expect(getDisplayNameForFriend(null, t as any)).toBe('common.deletedUser'));
        it('getDisplayNameForFriend tolerates missing name/avatar fields', () =>
            expect(getDisplayNameForFriend({ userId: 'u', isActive: true }, t as any))
                .toBe('common.unknownUser'));
        it('getAvatarUrlForFriend returns avatar for active friend', () =>
            expect(getAvatarUrlForFriend(friend)).toBe('y'));
        it('getAvatarUrlForFriend returns undefined for inactive', () =>
            expect(getAvatarUrlForFriend(deletedFriend)).toBeUndefined());
        it('getAvatarUrlForFriend returns undefined for null', () =>
            expect(getAvatarUrlForFriend(null)).toBeUndefined());
    });
});
