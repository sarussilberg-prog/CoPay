import type { NavigationState, PartialState } from '@react-navigation/native';

/**
 * Whether pressing the already-focused tab should pop its nested stack back to
 * the initial screen. Derived solely from the tab's COMMITTED nested state — the
 * tab route's `params.screen` is deliberately ignored because deep navigations
 * (e.g. navigate('Groups', { screen: 'GroupDetail' })) leave it stale, which
 * otherwise makes a press at the initial screen look "deep".
 */
export function shouldPopStackToInitial(
    nestedState: NavigationState | PartialState<NavigationState> | undefined,
    initialScreen: string,
): boolean {
    if (!nestedState || nestedState.routes.length === 0) return false;
    const index = nestedState.index ?? nestedState.routes.length - 1;
    const focusedRouteName = nestedState.routes[index]?.name;
    return Boolean(focusedRouteName) && focusedRouteName !== initialScreen;
}
