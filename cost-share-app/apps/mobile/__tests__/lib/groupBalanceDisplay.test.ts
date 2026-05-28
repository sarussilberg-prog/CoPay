import {
    collectGroupListFxBases,
    resolveGroupBalanceDisplay,
    type GroupBalance,
} from '@cost-share/shared';

describe('groupBalanceDisplay', () => {
    const rates = { USD: 0.27 };

    it('resolveGroupBalanceDisplay converts net into group default currency', () => {
        const balance: GroupBalance = { groupId: 'g1', currency: 'USD', net: -27 };
        const display = resolveGroupBalanceDisplay(balance, 'ILS', rates);
        expect(display).toEqual({
            net: -100,
            currency: 'ILS',
            isConverted: true,
        });
    });

    it('resolveGroupBalanceDisplay leaves net unchanged when currencies match', () => {
        const balance: GroupBalance = { groupId: 'g1', currency: 'ILS', net: 50 };
        const display = resolveGroupBalanceDisplay(balance, 'ILS', rates);
        expect(display).toEqual({
            net: 50,
            currency: 'ILS',
            isConverted: false,
        });
    });

    it('collectGroupListFxBases groups foreign currencies by group default', () => {
        const balances: GroupBalance[] = [
            { groupId: 'g1', currency: 'USD', net: 10 },
            { groupId: 'g2', currency: 'EUR', net: -5 },
            { groupId: 'g3', currency: 'ILS', net: 3 },
        ];
        const bases = collectGroupListFxBases(balances, {
            g1: 'ILS',
            g2: 'ILS',
            g3: 'ILS',
        });
        expect(bases.get('ILS')?.sort()).toEqual(['EUR', 'USD']);
        expect(bases.has('USD')).toBe(false);
    });
});
