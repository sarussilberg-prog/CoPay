import {
    feedActorNameStyle,
    resolveAutoTextStyle,
    rtlTextAlign,
    rtlTextClassName,
} from '../../hooks/useRtlLayout';

describe('useRtlLayout helpers', () => {
    it('returns right alignment for Hebrew', () => {
        expect(rtlTextAlign(true)).toBe('right');
        expect(rtlTextAlign(false)).toBe('left');
    });

    it('pins feed actor names to the app edge', () => {
        expect(feedActorNameStyle(true)).toEqual({
            textAlign: 'right',
            alignSelf: 'stretch',
        });
        expect(feedActorNameStyle(false)).toEqual({
            textAlign: 'left',
            alignSelf: 'stretch',
        });
    });

    it('adds nativewind alignment classes for Hebrew', () => {
        expect(rtlTextClassName(true, 'text-sm')).toContain('text-right');
        expect(rtlTextClassName(true, 'text-sm')).toContain('self-stretch');
        expect(rtlTextClassName(false, 'text-sm')).toContain('text-left');
    });

    it('applies RTL text styles unless textAlign is explicit', () => {
        expect(resolveAutoTextStyle(true, 'text-sm')).toEqual({
            writingDirection: 'rtl',
        });
        expect(resolveAutoTextStyle(false, 'text-sm')).toEqual({
            writingDirection: 'ltr',
        });
        expect(resolveAutoTextStyle(true, 'text-center')).toEqual({
            writingDirection: 'rtl',
        });
        expect(resolveAutoTextStyle(true, undefined, { textAlign: 'left' })).toBeUndefined();
    });
});
