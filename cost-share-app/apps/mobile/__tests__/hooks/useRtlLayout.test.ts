import { resolveAutoTextStyle, rtlTextAlign } from '../../hooks/useRtlLayout';

describe('useRtlLayout helpers', () => {
    it('returns right alignment for Hebrew', () => {
        expect(rtlTextAlign(true)).toBe('right');
        expect(rtlTextAlign(false)).toBe('left');
    });

    it('applies RTL text styles unless textAlign is explicit', () => {
        expect(resolveAutoTextStyle(true, 'text-sm')).toEqual({
            textAlign: 'right',
            writingDirection: 'rtl',
        });
        expect(resolveAutoTextStyle(false, 'text-sm')).toEqual({
            textAlign: 'left',
            writingDirection: 'ltr',
        });
        expect(resolveAutoTextStyle(true, 'text-center')).toEqual({
            textAlign: 'center',
            writingDirection: 'rtl',
        });
        expect(resolveAutoTextStyle(true, undefined, { textAlign: 'left' })).toBeUndefined();
    });
});
