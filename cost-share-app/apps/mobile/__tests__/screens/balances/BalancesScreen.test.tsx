import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithQuery } from '../../helpers/renderWithQuery';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => {
    const actual = jest.requireActual('@react-navigation/native');
    return {
        ...actual,
        useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
        useRoute: () => ({ params: { groupId: 'g1' } }),
        useFocusEffect: (cb: () => void) => cb(),
        useIsFocused: () => true,
    };
});

jest.mock('../../../services/groups.service', () => ({
    getGroupBalances: jest.fn(),
    getGroupDebts: jest.fn(),
}));

jest.mock('../../../services/users.service', () => ({
    fetchGroupUsers: jest.fn().mockResolvedValue([]),
}));

import { BalancesScreen } from '../../../screens/balances/BalancesScreen';
import {
    getGroupBalances,
    getGroupDebts,
} from '../../../services/groups.service';

const mockBalances = getGroupBalances as jest.MockedFunction<typeof getGroupBalances>;
const mockDebts = getGroupDebts as jest.MockedFunction<typeof getGroupDebts>;

beforeEach(() => {
    mockNavigate.mockClear();
    mockBalances.mockReset();
    mockDebts.mockReset();
});

describe('BalancesScreen', () => {
    it('shows "all settled" message when there are no debts', async () => {
        mockBalances.mockResolvedValueOnce([]);
        mockDebts.mockResolvedValueOnce([]);
        const { findByText } = renderWithQuery(<BalancesScreen />);
        expect(await findByText('balances.allSettled')).toBeTruthy();
    });

    it('renders debts with simplified summary', async () => {
        mockBalances.mockResolvedValueOnce([]);
        mockDebts.mockResolvedValueOnce([
            {
                fromUserId: 'u1',
                fromUserName: 'Alice',
                toUserId: 'u2',
                toUserName: 'Bob',
                amount: 25,
                currency: 'USD',
            } as any,
        ]);
        const { findByText } = renderWithQuery(<BalancesScreen />);
        expect(await findByText('Alice')).toBeTruthy();
        expect(await findByText(/USD 25\.00/)).toBeTruthy();
    });

    it('navigates to SettlementHistory when the history button is pressed', async () => {
        mockBalances.mockResolvedValueOnce([]);
        mockDebts.mockResolvedValueOnce([]);
        const { findByText } = renderWithQuery(<BalancesScreen />);
        fireEvent.press(await findByText('balances.settlementHistory'));
        expect(mockNavigate).toHaveBeenCalledWith('SettlementHistory', {
            groupId: 'g1',
        });
    });
});
