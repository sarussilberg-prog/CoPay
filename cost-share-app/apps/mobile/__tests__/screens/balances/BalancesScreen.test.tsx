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
        mockDebts.mockResolvedValueOnce({
            debts: [],
            transactionCount: 0,
            algorithm: 'exact',
        });
        const { findByText, queryByTestId } = renderWithQuery(<BalancesScreen />);
        expect(await findByText('balances.allSettled')).toBeTruthy();
        // Summary line is hidden when there are no debts.
        expect(queryByTestId('debts-summary')).toBeNull();
    });

    it('renders debts with the simplified summary line and a Minimum badge for exact results', async () => {
        mockBalances.mockResolvedValueOnce([]);
        mockDebts.mockResolvedValueOnce({
            debts: [
                {
                    fromUserId: 'u1',
                    fromUserName: 'Alice',
                    toUserId: 'u2',
                    toUserName: 'Bob',
                    amount: 25,
                    currency: 'USD',
                },
            ],
            transactionCount: 1,
            algorithm: 'exact',
        });
        const { findByText, findByTestId } = renderWithQuery(<BalancesScreen />);
        expect(await findByText('Alice')).toBeTruthy();
        expect(await findByText(/USD 25\.00/)).toBeTruthy();
        // Summary text is the i18n key — t() returns the key in tests.
        const summary = await findByTestId('debts-summary');
        expect(summary).toBeTruthy();
        expect(await findByTestId('minimum-badge')).toBeTruthy();
    });

    it('hides the Minimum badge for greedy results but keeps the summary', async () => {
        mockBalances.mockResolvedValueOnce([]);
        mockDebts.mockResolvedValueOnce({
            debts: [
                {
                    fromUserId: 'u1',
                    fromUserName: 'Alice',
                    toUserId: 'u2',
                    toUserName: 'Bob',
                    amount: 10,
                    currency: 'USD',
                },
                {
                    fromUserId: 'u3',
                    fromUserName: 'Carol',
                    toUserId: 'u2',
                    toUserName: 'Bob',
                    amount: 5,
                    currency: 'USD',
                },
            ],
            transactionCount: 2,
            algorithm: 'greedy',
        });
        const { findByTestId, queryByTestId } = renderWithQuery(<BalancesScreen />);
        expect(await findByTestId('debts-summary')).toBeTruthy();
        expect(queryByTestId('minimum-badge')).toBeNull();
    });

    it('navigates to SettlementHistory when the history button is pressed', async () => {
        mockBalances.mockResolvedValueOnce([]);
        mockDebts.mockResolvedValueOnce({
            debts: [],
            transactionCount: 0,
            algorithm: 'exact',
        });
        const { findByText } = renderWithQuery(<BalancesScreen />);
        fireEvent.press(await findByText('balances.settlementHistory'));
        expect(mockNavigate).toHaveBeenCalledWith('SettlementHistory', {
            groupId: 'g1',
        });
    });
});
