import React from 'react';
import { fireEvent } from '@testing-library/react-native';
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

// Stub the SettleUpSheet so we can detect when it opens without depending on its inner DOM.
jest.mock('../../../components/SettleUpSheet', () => {
    const React = require('react');
    const { Text, View } = require('react-native');
    return {
        SettleUpSheet: ({ visible, initial }: any) =>
            visible ? (
                <View testID="settle-sheet-open">
                    <Text testID="settle-sheet-currency">{initial?.currency ?? ''}</Text>
                    <Text testID="settle-sheet-amount">{initial?.amount ?? ''}</Text>
                </View>
            ) : null,
    };
});

const mockPairwiseQuery = jest.fn();
jest.mock('../../../hooks/queries/useSettlementQueries', () => ({
    useGroupPairwiseDebtsQuery: (...args: any[]) => mockPairwiseQuery(...args),
    useGroupSettlementsQuery: () => ({ data: [], refetch: jest.fn() }),
    useCreateSettlementMutation: () => ({
        mutateAsync: jest.fn().mockResolvedValue(undefined),
        isPending: false,
    }),
    useUpdateSettlementMutation: () => ({
        mutateAsync: jest.fn().mockResolvedValue(undefined),
        isPending: false,
    }),
    useDeleteSettlementMutation: () => ({
        mutateAsync: jest.fn().mockResolvedValue(undefined),
        isPending: false,
    }),
}));

jest.mock('../../../hooks/useGroupSettlementsRealtime', () => ({
    useGroupSettlementsRealtime: jest.fn(),
}));

const mockGroupUsers = jest.fn();
jest.mock('../../../hooks/queries/useGroupUsersQuery', () => ({
    useGroupUsersQuery: (...args: any[]) => mockGroupUsers(...args),
}));

import { SettleUpListScreen } from '../../../screens/balances/SettleUpListScreen';
import { useAppStore } from '../../../store';

const members = [
    { id: 'me', name: 'Me', email: 'me@x.com', defaultCurrency: 'USD', language: 'en', createdAt: new Date(), updatedAt: new Date() },
    { id: 'bob', name: 'Bob', email: 'bob@x.com', defaultCurrency: 'USD', language: 'en', createdAt: new Date(), updatedAt: new Date() },
    { id: 'carol', name: 'Carol', email: 'carol@x.com', defaultCurrency: 'USD', language: 'en', createdAt: new Date(), updatedAt: new Date() },
    { id: 'dan', name: 'Dan', email: 'dan@x.com', defaultCurrency: 'USD', language: 'en', createdAt: new Date(), updatedAt: new Date() },
];

function setPairwiseQueryResult(partial: {
    data?: any[];
    isLoading?: boolean;
    isFetching?: boolean;
    isRefetching?: boolean;
}) {
    mockPairwiseQuery.mockReturnValue({
        data: partial.data ?? [],
        isLoading: partial.isLoading ?? false,
        isFetching: partial.isFetching ?? false,
        isRefetching: partial.isRefetching ?? false,
        refetch: jest.fn(),
    });
}

beforeEach(() => {
    mockPairwiseQuery.mockReset();
    mockGroupUsers.mockReset();
    mockGroupUsers.mockReturnValue({ data: members });
    useAppStore.setState({
        currentUser: {
            id: 'me',
            email: 'me@x.com',
            name: 'Me',
            inviteToken: 'me123456789',
            defaultCurrency: 'USD',
            language: 'en',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });
});

describe('SettleUpListScreen', () => {
    it('shows the loading indicator while the initial fetch is in flight', () => {
        setPairwiseQueryResult({ isLoading: true, isFetching: true, data: [] });
        const { getByText } = renderWithQuery(<SettleUpListScreen />);
        expect(getByText('common.loading')).toBeTruthy();
    });

    it('keeps the loading indicator visible during a background refetch over empty cache', () => {
        // Regression: stale empty cache + background refetch must NOT flash "everyone is settled".
        setPairwiseQueryResult({ isLoading: false, isFetching: true, data: [] });
        const { queryByText, getByText } = renderWithQuery(<SettleUpListScreen />);
        expect(getByText('common.loading')).toBeTruthy();
        expect(queryByText('settleUp.empty')).toBeNull();
    });

    it('shows the "everyone is settled" empty state when fetching settles with no debts', () => {
        setPairwiseQueryResult({ isLoading: false, isFetching: false, data: [] });
        const { getByText } = renderWithQuery(<SettleUpListScreen />);
        expect(getByText('settleUp.empty')).toBeTruthy();
    });

    it('renders one row per pairwise debt, including multiple rows for the same pair with different currencies', () => {
        setPairwiseQueryResult({
            data: [
                { fromUserId: 'me', toUserId: 'bob', currency: 'USD', amount: 10 },
                { fromUserId: 'me', toUserId: 'bob', currency: 'EUR', amount: 7 },
                { fromUserId: 'carol', toUserId: 'dan', currency: 'USD', amount: 25 },
            ],
        });
        const { getByTestId } = renderWithQuery(<SettleUpListScreen />);
        expect(getByTestId('settle-debt-me-bob-USD')).toBeTruthy();
        expect(getByTestId('settle-debt-me-bob-EUR')).toBeTruthy();
        expect(getByTestId('settle-debt-carol-dan-USD')).toBeTruthy();
    });

    it('pins debts the current user is involved in before unrelated debts', () => {
        setPairwiseQueryResult({
            data: [
                { fromUserId: 'carol', toUserId: 'dan', currency: 'USD', amount: 30 },
                { fromUserId: 'me', toUserId: 'bob', currency: 'USD', amount: 5 },
            ],
        });
        const { getAllByTestId } = renderWithQuery(<SettleUpListScreen />);
        const rows = getAllByTestId(/^settle-debt-/);
        // First row must be the one where current user is involved.
        expect(rows[0].props.testID).toBe('settle-debt-me-bob-USD');
        expect(rows[1].props.testID).toBe('settle-debt-carol-dan-USD');
    });

    it('opens the settle-up sheet pre-filled with the tapped debt', () => {
        setPairwiseQueryResult({
            data: [
                { fromUserId: 'me', toUserId: 'bob', currency: 'EUR', amount: 7 },
            ],
        });
        const { getByTestId, queryByTestId } = renderWithQuery(<SettleUpListScreen />);
        expect(queryByTestId('settle-sheet-open')).toBeNull();

        fireEvent.press(getByTestId('settle-debt-me-bob-EUR'));

        expect(getByTestId('settle-sheet-open')).toBeTruthy();
        expect(getByTestId('settle-sheet-currency').props.children).toBe('EUR');
        expect(getByTestId('settle-sheet-amount').props.children).toBe(7);
    });
});
