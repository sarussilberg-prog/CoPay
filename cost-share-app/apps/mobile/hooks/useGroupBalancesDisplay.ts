import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    collectGroupFxCurrencies,
    GroupBalance,
    GroupBalanceDisplay,
    resolveGroupBalanceDisplay,
} from '@cost-share/shared';
import { fetchExchangeRates } from '../services/exchangeRates.service';

const CACHE_STALE_MS = 24 * 60 * 60 * 1000;

/**
 * Maps each group's raw `GroupBalance` to a `GroupBalanceDisplay` in the user's
 * default currency. Fetches FX rates once for the union of foreign currencies
 * across all groups; falls back to the group's own currency on miss/failure.
 */
export function useGroupBalancesDisplay(
    balances: Record<string, GroupBalance>,
    defaultCurrency: string | undefined,
): Map<string, GroupBalanceDisplay> {
    const base = defaultCurrency ?? 'ILS';

    const balanceList = useMemo(() => Object.values(balances), [balances]);

    const foreignCurrencies = useMemo(
        () => collectGroupFxCurrencies(balanceList, base),
        [balanceList, base],
    );

    const needsFx = foreignCurrencies.length > 0;

    const ratesQuery = useQuery({
        queryKey: ['exchangeRates', 'groups', base, foreignCurrencies.join(',')],
        queryFn: () => fetchExchangeRates(base, foreignCurrencies),
        enabled: needsFx,
        staleTime: CACHE_STALE_MS,
        gcTime: CACHE_STALE_MS,
        retry: 2,
    });

    return useMemo(() => {
        const map = new Map<string, GroupBalanceDisplay>();
        const rates = needsFx && ratesQuery.data?.rates ? ratesQuery.data.rates : undefined;
        for (const balance of balanceList) {
            const display = resolveGroupBalanceDisplay(balance, base, rates);
            if (display) map.set(balance.groupId, display);
        }
        return map;
    }, [balanceList, base, needsFx, ratesQuery.data?.rates]);
}
