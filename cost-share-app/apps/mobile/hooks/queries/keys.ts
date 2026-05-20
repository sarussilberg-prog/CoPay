export const queryKeys = {
    dashboard: ['dashboard'] as const,
    activity: ['activity'] as const,
    groupUsers: (groupId: string) => ['groupUsers', groupId] as const,
};
