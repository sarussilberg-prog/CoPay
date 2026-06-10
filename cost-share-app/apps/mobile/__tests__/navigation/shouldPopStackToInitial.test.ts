import { shouldPopStackToInitial } from '../../navigation/shouldPopStackToInitial';

type State = Parameters<typeof shouldPopStackToInitial>[0];

const stack = (names: string[], index?: number): State =>
    ({
        index,
        routes: names.map((name) => ({ key: `${name}-1`, name })),
    }) as State;

describe('shouldPopStackToInitial', () => {
    it('does not pop when there is no committed nested state yet', () => {
        // The bug case: with no committed state we must NOT fall back to a stale
        // params.screen — staying put is correct.
        expect(shouldPopStackToInitial(undefined, 'GroupsList')).toBe(false);
    });

    it('does not pop when already at the initial screen', () => {
        expect(shouldPopStackToInitial(stack(['GroupsList'], 0), 'GroupsList')).toBe(false);
    });

    it('pops when a deeper screen is focused', () => {
        expect(
            shouldPopStackToInitial(stack(['GroupsList', 'GroupDetail'], 1), 'GroupsList'),
        ).toBe(true);
    });

    it('treats the last route as focused when index is absent', () => {
        expect(
            shouldPopStackToInitial(stack(['GroupsList', 'GroupDetail']), 'GroupsList'),
        ).toBe(true);
        expect(shouldPopStackToInitial(stack(['GroupsList']), 'GroupsList')).toBe(false);
    });

    it('does not pop for an empty route list', () => {
        expect(shouldPopStackToInitial(stack([], 0), 'GroupsList')).toBe(false);
    });
});
