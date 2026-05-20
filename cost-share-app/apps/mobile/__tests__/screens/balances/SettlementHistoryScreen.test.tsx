import React from 'react';
import { renderWithQuery } from '../../helpers/renderWithQuery';

jest.mock('@react-navigation/native', () => {
    const actual = jest.requireActual('@react-navigation/native');
    return {
        ...actual,
        useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
        useRoute: () => ({ params: { groupId: 'g1' } }),
        useFocusEffect: (cb: () => void) => cb(),
        useIsFocused: () => true,
    };
});

jest.mock('../../../services/settlements.service', () => ({
    fetchSettlements: jest.fn(),
}));

jest.mock('../../../services/users.service', () => ({
    fetchGroupUsers: jest.fn().mockResolvedValue([
        { id: 'u1', email: 'a@x.com', name: 'Alice', defaultCurrency: 'USD', language: 'en', createdAt: new Date(), updatedAt: new Date() },
        { id: 'u2', email: 'b@x.com', name: 'Bob', defaultCurrency: 'USD', language: 'en', createdAt: new Date(), updatedAt: new Date() },
    ]),
}));

import { SettlementHistoryScreen } from '../../../screens/balances/SettlementHistoryScreen';
import { fetchSettlements } from '../../../services/settlements.service';

const mockFetch = fetchSettlements as jest.MockedFunction<typeof fetchSettlements>;

beforeEach(() => {
    mockFetch.mockReset();
});

describe('SettlementHistoryScreen', () => {
    it('shows empty state when there are no settlements', async () => {
        mockFetch.mockResolvedValueOnce([]);
        const { findByText } = renderWithQuery(<SettlementHistoryScreen />);
        expect(await findByText('balances.noSettlements')).toBeTruthy();
    });

    it('renders settlements with from/to user names and amount', async () => {
        mockFetch.mockResolvedValueOnce([
            {
                id: 's1',
                groupId: 'g1',
                fromUserId: 'u1',
                toUserId: 'u2',
                amount: 100,
                currency: 'USD',
                settlementDate: new Date('2026-05-01'),
                paymentMethod: 'cash',
                createdBy: 'u1',
                createdAt: new Date(),
            } as any,
        ]);
        const { findByText } = renderWithQuery(<SettlementHistoryScreen />);
        expect(await findByText(/Alice/)).toBeTruthy();
        expect(await findByText(/USD 100\.00/)).toBeTruthy();
    });
});
