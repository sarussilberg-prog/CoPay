import { parseIncomingUrl } from '../../services/deepLinks.service';

describe('parseIncomingUrl', () => {
    it('parses https friend link', () => {
        expect(parseIncomingUrl('https://kupa.pro/i/AbC123def_')).toEqual({
            kind: 'friend',
            token: 'AbC123def_',
        });
    });
    it('parses https group link', () => {
        expect(parseIncomingUrl('https://kupa.pro/g/XYZ9876543')).toEqual({
            kind: 'group',
            token: 'XYZ9876543',
        });
    });
    it('parses custom-scheme friend link', () => {
        expect(parseIncomingUrl('com.kupay.mobile://invite/i/ZZZ0000111')).toEqual({
            kind: 'friend',
            token: 'ZZZ0000111',
        });
    });
    it('parses custom-scheme group link', () => {
        expect(parseIncomingUrl('com.kupay.mobile://invite/g/AAA1112223')).toEqual({
            kind: 'group',
            token: 'AAA1112223',
        });
    });
    it('returns unknown for unrelated URL', () => {
        expect(parseIncomingUrl('https://example.com/foo')).toEqual({ kind: 'unknown' });
    });
    it('returns unknown for malformed kupa URL', () => {
        expect(parseIncomingUrl('https://kupa.pro/x/abc')).toEqual({ kind: 'unknown' });
    });
    it('handles trailing slash + query string', () => {
        expect(parseIncomingUrl('https://kupa.pro/g/AbCdEfGhIj?utm=foo')).toEqual({
            kind: 'group',
            token: 'AbCdEfGhIj',
        });
    });
});
