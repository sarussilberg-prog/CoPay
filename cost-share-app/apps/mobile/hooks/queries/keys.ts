export const queryKeys = {
    dashboard: ['dashboard'] as const,
    groups: ['groups'] as const,
    activity: ['activity'] as const,
    activityFeed: () => ['activity', 'feed'] as const,
    activityUnreadCount: ['activity', 'unread-count'] as const,
    groupUsers: (groupId: string) => ['groupUsers', groupId] as const,
    groupMembers: (groupId: string) => ['groupMembers', groupId] as const,
    groupExpenses: (groupId: string) => ['groupExpenses', groupId] as const,
    groupMessages: (groupId: string) => ['groupMessages', groupId] as const,
    balanceSummary: ['balanceSummary'] as const,
    friends: ['friends'] as const,
    friendRequestsIncoming: ['friend-requests', 'incoming'] as const,
    friendRequestsOutgoing: ['friend-requests', 'outgoing'] as const,
    userSearch: (query: string) => ['user-search', query] as const,
    inviteLink: (kind: 'friend' | 'group', id?: string) =>
        id ? (['invite-link', kind, id] as const) : (['invite-link', kind] as const),
    groupPairwiseDebts: (groupId: string) => ['groupPairwiseDebts', groupId] as const,
    groupSettlements: (groupId: string) => ['groupSettlements', groupId] as const,
    groupContributions: (groupId: string) => ['group-contributions', groupId] as const,
    groupSimplifiedDebtsByCurrency: (groupId: string) =>
        ['group-simplified-debts-by-currency', groupId] as const,
    legalDocument: (slug: 'terms' | 'privacy', locale: 'en' | 'he') =>
        ['legal-document', slug, locale] as const,
    adminPlatformMetrics: ['admin', 'platform-metrics'] as const,
    adminSentryIssues: (params: {
        environment: 'dev' | 'prod';
        status: 'unresolved' | 'all';
        timeRange: '24h' | '7d' | '30d';
    }) =>
        ['adminSentryIssues', params.environment, params.status, params.timeRange] as const,
    adminSentryIssueDetail: (issueId: string) =>
        ['adminSentryIssueDetail', issueId] as const,
    adminSentryIssueEvents: (issueId: string) =>
        ['adminSentryIssueEvents', issueId] as const,
    exchangeRates: (base: string, symbolsKey: string) =>
        ['exchangeRates', base, symbolsKey] as const,
};
