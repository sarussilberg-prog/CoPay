import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    aggregateBalanceInBaseCurrency,
    aggregateBalanceWithoutFx,
    BalanceSummary,
} from '@cost-share/shared';
import { fetchExchangeRates, ExchangeRatesPayload } from '../services/exchangeRates.service';

const CACHE_STALE_MS = 24 * 60 * 60 * 1000;

export type ProfileBalanceConversion = {
    isConverted: boolean;
    ratesDate: string | null;
    isLoading: boolean;
    failed: boolean;
};

export type DerivedProfileBalance = {
    summary: BalanceSummary | undefined;
    /** True when at least one foreign-currency row was converted via FX. */
    fxApplied: boolean;
    /** True when foreign rows are present but FX rates haven't (yet) been provided. */
    needsRates: boolean;
};

/**
 * Pure aggregation step extracted from the hook so it can be unit-tested
 * without react-query plumbing. Always renders headline totals in
 * `defaultCurrency`, ignoring anything the server may have placed in
 * `totalOwed`/`totalOwedToUser`. That coupling is what makes the displayed
 * number and the displayed currency tag impossible to mismatch.
 */
export function deriveProfileBalanceSummary(
    raw: BalanceSummary | undefined,
    rates: Record<string, number> | undefined,
): DerivedProfileBalance {
    if (!raw) return { summary: undefined, fxApplied: false, needsRates: false };

    const local = aggregateBalanceWithoutFx(raw.byCurrency, raw.defaultCurrency);
    if (local) {
        return {
            summary: { ...raw, totalOwed: local.totalOwed, totalOwedToUser: local.totalOwedToUser },
            fxApplied: false,
            needsRates: false,
        };
    }

    if (!rates) {
        return {
            summary: { ...raw, totalOwed: null, totalOwedToUser: null },
            fxApplied: false,
            needsRates: true,
        };
    }

    const aggregated = aggregateBalanceInBaseCurrency(raw.byCurrency, raw.defaultCurrency, rates);
    if (!aggregated) {
        return {
            summary: { ...raw, totalOwed: null, totalOwedToUser: null },
            fxApplied: false,
            needsRates: true,
        };
    }

    return {
        summary: {
            ...raw,
            totalOwed: aggregated.totalOwed,
            totalOwedToUser: aggregated.totalOwedToUser,
        },
        fxApplied: true,
        needsRates: false,
    };
}

/**
 * Owns headline aggregation for the profile screen. Fetches FX rates only when
 * the user has at least one foreign-currency balance, then delegates to
 * `deriveProfileBalanceSummary` to compute totals in `defaultCurrency`.
 */
export function useProfileBalanceSummary(
    raw: BalanceSummary | undefined,
): { summary: BalanceSummary | undefined; conversion: ProfileBalanceConversion } {
    const foreignCurrencies = useMemo(() => {
        if (!raw) return [];
        return raw.byCurrency
            .map((r) => r.currency)
            .filter((c) => c !== raw.defaultCurrency);
    }, [raw]);

    const sortedForeign = useMemo(
        () => [...foreignCurrencies].sort((a, b) => a.localeCompare(b)),
        [foreignCurrencies],
    );

    const preview = useMemo(() => deriveProfileBalanceSummary(raw, undefined), [raw]);
    const fxEnabled = preview.needsRates;

    const ratesQuery = useQuery<ExchangeRatesPayload>({
        queryKey: ['exchangeRates', raw?.defaultCurrency, sortedForeign.join(',')],
        queryFn: () => fetchExchangeRates(raw!.defaultCurrency, sortedForeign),
        enabled: fxEnabled,
        staleTime: CACHE_STALE_MS,
        gcTime: CACHE_STALE_MS,
        retry: 2,
    });

    const derived = useMemo(
        () => deriveProfileBalanceSummary(raw, ratesQuery.data?.rates),
        [raw, ratesQuery.data],
    );

    const conversion: ProfileBalanceConversion = {
        isConverted: derived.fxApplied,
        ratesDate: derived.fxApplied ? ratesQuery.data?.date ?? null : null,
        isLoading: fxEnabled && ratesQuery.isLoading,
        failed:
            fxEnabled &&
            !ratesQuery.isLoading &&
            (ratesQuery.isError || !ratesQuery.data || derived.needsRates),
    };

    return { summary: derived.summary, conversion };
}
