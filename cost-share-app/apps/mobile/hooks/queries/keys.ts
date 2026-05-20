export const queryKeys = {
    dashboard: ['dashboard'] as const,
    activity: ['activity'] as const,
    activityFeed: (groupIds: string[]) => ['activity', groupIds.join(',')] as const,
    groupUsers: (groupId: string) => ['groupUsers', groupId] as const,
    groupMembers: (groupId: string) => ['groupMembers', groupId] as const,
    friends: ['friends'] as const,
    friendRequestsIncoming: ['friend-requests', 'incoming'] as const,
    friendRequestsOutgoing: ['friend-requests', 'outgoing'] as const,
    userSearch: (query: string) => ['user-search', query] as const,
    inviteLink: (kind: 'friend' | 'group', id?: string) =>
        id ? (['invite-link', kind, id] as const) : (['invite-link', kind] as const),
    groupPairwiseDebts: (groupId: string) => ['groupPairwiseDebts', groupId] as const,
    groupSettlements: (groupId: string) => ['groupSettlements', groupId] as const,
};
