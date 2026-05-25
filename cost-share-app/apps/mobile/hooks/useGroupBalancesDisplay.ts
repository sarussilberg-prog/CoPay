import { useMemo } from 'react';
import {
    GroupBalance,
    GroupBalanceDisplay,
    resolveGroupBalanceDisplay,
} from '@cost-share/shared';

/**
 * Maps each group's raw `GroupBalance` to a `GroupBalanceDisplay` expressed in
 * that group's own default currency. No FX conversion — the per-group chip on
 * GroupsListScreen stays in the group's currency rather than the user's profile
 * default, so amounts aren't silently translated.
 */
export function useGroupBalancesDisplay(
    balances: Record<string, GroupBalance>,
): Map<string, GroupBalanceDisplay> {
    return useMemo(() => {
        const map = new Map<string, GroupBalanceDisplay>();
        for (const balance of Object.values(balances)) {
            const display = resolveGroupBalanceDisplay(balance, balance.currency);
            if (display) map.set(balance.groupId, display);
        }
        return map;
    }, [balances]);
}
