import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import {
    GroupBalance,
    GroupBalanceDisplay,
    collectGroupListFxBases,
    resolveGroupBalanceDisplay,
} from '@cost-share/shared';
import { fetchExchangeRates } from '../services/exchangeRates.service';

const CACHE_STALE_MS = 24 * 60 * 60 * 1000;

type GroupCurrencyRef = { id: string; defaultCurrency: string };

/**
 * Maps each group's raw `GroupBalance` to a `GroupBalanceDisplay` in that
 * group's `defaultCurrency`. Converts via FX when the RPC net is in another
 * currency (e.g. expenses still in USD after the group default was changed to ILS).
 */
export function useGroupBalancesDisplay(
    balances: Record<string, GroupBalance>,
    groups: GroupCurrencyRef[],
): Map<string, GroupBalanceDisplay> {
    const defaultCurrencyByGroupId = useMemo(() => {
        const map: Record<string, string> = {};
        for (const g of groups) map[g.id] = g.defaultCurrency;
        return map;
    }, [groups]);

    const balanceList = useMemo(() => Object.values(balances), [balances]);

    const fxBases = useMemo(
        () => collectGroupListFxBases(balanceList, defaultCurrencyByGroupId),
        [balanceList, defaultCurrencyByGroupId],
    );

    const baseEntries = useMemo(() => [...fxBases.entries()], [fxBases]);

    const ratesQueries = useQueries({
        queries: baseEntries.map(([base, symbols]) => ({
            queryKey: ['exchangeRates', 'groups', base, symbols.join(',')],
            queryFn: () => fetchExchangeRates(base, symbols),
            enabled: symbols.length > 0,
            staleTime: CACHE_STALE_MS,
            gcTime: CACHE_STALE_MS,
            retry: 2,
        })),
    });

    const ratesByBase = useMemo(() => {
        const map = new Map<string, Record<string, number>>();
        baseEntries.forEach(([base], index) => {
            const rates = ratesQueries[index]?.data?.rates;
            if (rates) map.set(base, rates);
        });
        return map;
    }, [baseEntries, ratesQueries]);

    return useMemo(() => {
        const map = new Map<string, GroupBalanceDisplay>();
        for (const balance of balanceList) {
            const defaultCurrency = defaultCurrencyByGroupId[balance.groupId];
            if (!defaultCurrency) continue;
            const rates = ratesByBase.get(defaultCurrency);
            const display = resolveGroupBalanceDisplay(balance, defaultCurrency, rates);
            if (display) map.set(balance.groupId, display);
        }
        return map;
    }, [balanceList, defaultCurrencyByGroupId, ratesByBase]);
}

/** Single-group balance strip / hero — same rules as the groups list chip. */
export function useGroupBalanceDisplay(
    balance: GroupBalance | undefined,
    defaultCurrency: string | undefined,
): GroupBalanceDisplay | undefined {
    const needsFx =
        balance &&
        defaultCurrency &&
        balance.currency !== defaultCurrency &&
        Math.abs(balance.net) >= 0.01;

    const ratesQuery = useQuery({
        queryKey: ['exchangeRates', 'group', defaultCurrency, balance?.currency],
        queryFn: () => fetchExchangeRates(defaultCurrency!, [balance!.currency]),
        enabled: Boolean(needsFx),
        staleTime: CACHE_STALE_MS,
        gcTime: CACHE_STALE_MS,
        retry: 2,
    });

    return useMemo(() => {
        if (!balance || !defaultCurrency) return undefined;
        const rates = needsFx && ratesQuery.data?.rates ? ratesQuery.data.rates : undefined;
        return resolveGroupBalanceDisplay(balance, defaultCurrency, rates);
    }, [balance, defaultCurrency, needsFx, ratesQuery.data?.rates]);
}
