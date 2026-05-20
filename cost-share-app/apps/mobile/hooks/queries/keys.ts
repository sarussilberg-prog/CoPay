export const queryKeys = {
    dashboard: ['dashboard'] as const,
    activity: ['activity'] as const,
    groupUsers: (groupId: string) => ['groupUsers', groupId] as const,
    friends: ['friends'] as const,
    friendRequestsIncoming: ['friend-requests', 'incoming'] as const,
    friendRequestsOutgoing: ['friend-requests', 'outgoing'] as const,
    userSearch: (query: string) => ['user-search', query] as const,
    groupPairwiseDebts: (groupId: string) => ['groupPairwiseDebts', groupId] as const,
    groupSettlements: (groupId: string) => ['groupSettlements', groupId] as const,
};
