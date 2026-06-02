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

jest.mock('../../../hooks/queries/useSettlementQueries', () => ({
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

const mockSimplifiedQuery = jest.fn();
jest.mock('../../../hooks/queries/useGroupBalancesQueries', () => ({
    useGroupSimplifiedDebtsByCurrencyQuery: (...args: any[]) =>
        mockSimplifiedQuery(...args),
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

type FlatDebt = {
    fromUserId: string;
    toUserId: string;
    currency: string;
    amount: number;
};

function setSimplifiedQueryResult(partial: {
    data?: FlatDebt[];
    isLoading?: boolean;
    isFetching?: boolean;
    isRefetching?: boolean;
}) {
    const grouped = new Map<string, FlatDebt[]>();
    for (const d of partial.data ?? []) {
        const bucket = grouped.get(d.currency) ?? [];
        bucket.push(d);
        grouped.set(d.currency, bucket);
    }
    const data = Array.from(grouped.entries()).map(([currency, debts]) => ({
        currency,
        result: {
            debts: debts.map(d => ({
                fromUserId: d.fromUserId,
                fromUserName: d.fromUserId,
                toUserId: d.toUserId,
                toUserName: d.toUserId,
                amount: d.amount,
                currency: d.currency,
            })),
            transactionCount: debts.length,
            algorithm: 'exact' as const,
        },
    }));
    mockSimplifiedQuery.mockReturnValue({
        data,
        isLoading: partial.isLoading ?? false,
        isFetching: partial.isFetching ?? false,
        isRefetching: partial.isRefetching ?? false,
        refetch: jest.fn(),
    });
}

beforeEach(() => {
    mockSimplifiedQuery.mockReset();
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
            isAdmin: false,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });
});

describe('SettleUpListScreen', () => {
    it('shows the loading indicator while the initial fetch is in flight', () => {
        setSimplifiedQueryResult({ isLoading: true, isFetching: true, data: [] });
        const { getByText } = renderWithQuery(<SettleUpListScreen />);
        expect(getByText('common.loading')).toBeTruthy();
    });

    it('keeps the loading indicator visible during a background refetch over empty cache', () => {
        // Regression: stale empty cache + background refetch must NOT flash "everyone is settled".
        setSimplifiedQueryResult({ isLoading: false, isFetching: true, data: [] });
        const { queryByText, getByText } = renderWithQuery(<SettleUpListScreen />);
        expect(getByText('common.loading')).toBeTruthy();
        expect(queryByText('settleUp.empty')).toBeNull();
    });

    it('shows the "everyone is settled" empty state when fetching settles with no debts', () => {
        setSimplifiedQueryResult({ isLoading: false, isFetching: false, data: [] });
        const { getByText } = renderWithQuery(<SettleUpListScreen />);
        expect(getByText('settleUp.empty')).toBeTruthy();
    });

    it('renders one row per debt that involves the current user, including multiple currencies for the same pair', () => {
        setSimplifiedQueryResult({
            data: [
                { fromUserId: 'me', toUserId: 'bob', currency: 'USD', amount: 10 },
                { fromUserId: 'me', toUserId: 'bob', currency: 'EUR', amount: 7 },
                { fromUserId: 'carol', toUserId: 'dan', currency: 'USD', amount: 25 },
            ],
        });
        const { getByTestId, queryByTestId } = renderWithQuery(<SettleUpListScreen />);
        expect(getByTestId('settle-debt-me-bob-USD')).toBeTruthy();
        expect(getByTestId('settle-debt-me-bob-EUR')).toBeTruthy();
        // Debts that don't involve the current user are hidden behind the toggle.
        expect(queryByTestId('settle-debt-carol-dan-USD')).toBeNull();
        expect(getByTestId('settle-others-toggle')).toBeTruthy();
    });

    it('reveals debts that do not involve the current user only after tapping the toggle', () => {
        setSimplifiedQueryResult({
            data: [
                { fromUserId: 'carol', toUserId: 'dan', currency: 'USD', amount: 30 },
                { fromUserId: 'me', toUserId: 'bob', currency: 'USD', amount: 5 },
            ],
        });
        const { getByTestId, queryByTestId } = renderWithQuery(<SettleUpListScreen />);
        // Involved row visible up-front; uninvolved row collapsed.
        expect(getByTestId('settle-debt-me-bob-USD')).toBeTruthy();
        expect(queryByTestId('settle-debt-carol-dan-USD')).toBeNull();

        fireEvent.press(getByTestId('settle-others-toggle'));

        expect(getByTestId('settle-debt-carol-dan-USD')).toBeTruthy();
    });

    it('does not show the others toggle when every debt involves the current user', () => {
        setSimplifiedQueryResult({
            data: [
                { fromUserId: 'me', toUserId: 'bob', currency: 'USD', amount: 5 },
            ],
        });
        const { queryByTestId } = renderWithQuery(<SettleUpListScreen />);
        expect(queryByTestId('settle-others-toggle')).toBeNull();
    });

    it('still shows the others toggle when the current user has no open debts', () => {
        setSimplifiedQueryResult({
            data: [
                { fromUserId: 'carol', toUserId: 'dan', currency: 'USD', amount: 30 },
            ],
        });
        const { getByTestId, queryByTestId, getByText } = renderWithQuery(<SettleUpListScreen />);
        // Empty state shown for the current user's own debts.
        expect(getByText('settleUp.empty')).toBeTruthy();
        // Others toggle still available; uninvolved row collapsed until pressed.
        expect(getByTestId('settle-others-toggle')).toBeTruthy();
        expect(queryByTestId('settle-debt-carol-dan-USD')).toBeNull();

        fireEvent.press(getByTestId('settle-others-toggle'));
        expect(getByTestId('settle-debt-carol-dan-USD')).toBeTruthy();
    });

    it('opens the settle-up sheet pre-filled with the tapped debt', () => {
        setSimplifiedQueryResult({
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
