import {
    resolveAuthenticatedGateTarget,
    shouldMarkPostOnboardingAfterGroups,
} from '../../lib/authenticatedGateResolve';

describe('authenticatedGateResolve', () => {
    describe('resolveAuthenticatedGateTarget', () => {
        it('goes to main when post onboarding already complete', () => {
            expect(
                resolveAuthenticatedGateTarget({
                    postOnboardingComplete: true,
                    groupsCount: 0,
                    fetchFailed: false,
                }),
            ).toBe('main');
        });

        it('goes to main when user has groups', () => {
            expect(
                resolveAuthenticatedGateTarget({
                    postOnboardingComplete: false,
                    groupsCount: 2,
                    fetchFailed: false,
                }),
            ).toBe('main');
        });

        it('goes to create when user has no groups', () => {
            expect(
                resolveAuthenticatedGateTarget({
                    postOnboardingComplete: false,
                    groupsCount: 0,
                    fetchFailed: false,
                }),
            ).toBe('create');
        });

        it('goes to create on fetch failure (KI-002)', () => {
            expect(
                resolveAuthenticatedGateTarget({
                    postOnboardingComplete: false,
                    groupsCount: 0,
                    fetchFailed: true,
                }),
            ).toBe('create');
        });

        it('goes to create on fetch failure even if stale groupsCount were passed', () => {
            expect(
                resolveAuthenticatedGateTarget({
                    postOnboardingComplete: false,
                    groupsCount: 5,
                    fetchFailed: true,
                }),
            ).toBe('create');
        });
    });

    describe('shouldMarkPostOnboardingAfterGroups', () => {
        it('marks when first groups fetch returns rows', () => {
            expect(
                shouldMarkPostOnboardingAfterGroups({
                    postOnboardingComplete: false,
                    groupsCount: 1,
                    fetchFailed: false,
                }),
            ).toBe(true);
        });

        it('does not mark on fetch failure', () => {
            expect(
                shouldMarkPostOnboardingAfterGroups({
                    postOnboardingComplete: false,
                    groupsCount: 0,
                    fetchFailed: true,
                }),
            ).toBe(false);
        });
    });
});
