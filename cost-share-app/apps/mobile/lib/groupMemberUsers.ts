/**
 * Build User rows for member pickers from group members + optional profile cache.
 */

import { GroupMember, GroupMemberLite, User, DEFAULT_CURRENCY, Language } from '@cost-share/shared';

export function resolveGroupMemberUsers(
    activeMembers: GroupMember[],
    allUsers: User[],
    memberLites: GroupMemberLite[] = [],
    fallbackCurrency: string = DEFAULT_CURRENCY,
): User[] {
    const userById = new Map(allUsers.map(u => [u.id, u]));
    const liteById = new Map(memberLites.map(m => [m.userId, m]));

    return activeMembers.map(member => {
        const cached = userById.get(member.userId);
        if (cached) return cached;

        const lite = liteById.get(member.userId);
        const now = new Date();
        return {
            id: member.userId,
            name: lite?.displayName?.trim() || member.userId.slice(0, 8),
            avatarUrl: lite?.avatarUrl,
            inviteToken: '',
            defaultCurrency: fallbackCurrency,
            language: 'en' as Language,
            createdAt: now,
            updatedAt: now,
        };
    });
}
