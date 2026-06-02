/**
 * Pure gate resolution after post-login onboarding flag + groups fetch.
 * See AuthenticatedAppGate (KI-002: fetch errors → create, not main).
 */

export type GroupsGateInput = {
    postOnboardingComplete: boolean;
    groupsCount: number;
    fetchFailed: boolean;
};

export type AuthenticatedGateTarget = 'main' | 'create';

export function resolveAuthenticatedGateTarget(input: GroupsGateInput): AuthenticatedGateTarget {
    if (input.postOnboardingComplete) return 'main';
    if (input.fetchFailed) return 'create';
    return input.groupsCount > 0 ? 'main' : 'create';
}

export function shouldMarkPostOnboardingAfterGroups(input: GroupsGateInput): boolean {
    return !input.postOnboardingComplete && !input.fetchFailed && input.groupsCount > 0;
}
