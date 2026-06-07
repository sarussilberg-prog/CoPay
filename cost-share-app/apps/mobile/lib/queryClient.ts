import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // Realtime is the freshness source for the queries we care about
            // (groups, group expenses, group messages). Their hooks set
            // staleTime: Infinity individually. The default below applies to
            // non-realtime queries — a small window so they don't refetch on
            // every screen mount but still revalidate quickly.
            staleTime: 60_000,
            gcTime: 24 * 60 * 60_000,
            refetchOnMount: false,
            refetchOnWindowFocus: false,
            refetchOnReconnect: 'always',
            retry: 1,
        },
        mutations: {
            retry: 0, // useAddExpenseMutation owns its retry policy.
        },
    },
});
