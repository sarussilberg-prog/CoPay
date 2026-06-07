import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithQuery } from '../../helpers/renderWithQuery';

jest.mock('@react-navigation/native', () => {
    const actual = jest.requireActual('@react-navigation/native');
    return {
        ...actual,
        useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn() }),
        useRoute: () => ({ params: { groupId: 'g1' } }),
        useFocusEffect: (cb: () => void) => cb(),
        useIsFocused: () => true,
    };
});

jest.mock('../../../components/SettleUpSheet', () => {
    const React = require('react');
    const { Text, View } = require('react-native');
    return {
        SettleUpSheet: ({ visible, initial }: any) =>
            visible ? (
                <View testID="settle-sheet-open">
                    <Text testID="settle-sheet-from">{initial?.fromUserId ?? ''}</Text>
                    <Text testID="settle-sheet-to">{initial?.toUserId ?? ''}</Text>
                    <Text testID="settle-sheet-currency">{initial?.currency ?? ''}</Text>
                    <Text testID="settle-sheet-amount">{String(initial?.amount ?? '')}</Text>
                </View>
            ) : null,
    };
});

const mockContributionsQuery = jest.fn();
const mockSimplifiedDebtsQuery = jest.fn();
jest.mock('../../../hooks/queries/useGroupBalancesQueries', () => ({
    useGroupContributionsQuery: (...args: any[]) => mockContributionsQuery(...args),
    useGroupSimplifiedDebtsByCurrencyQuery: (...args: any[]) =>
        mockSimplifiedDebtsQuery(...args),
}));

const mockPairwiseQuery = jest.fn();
jest.mock('../../../hooks/queries/useSettlementQueries', () => ({
    useGroupPairwiseDebtsQuery: (...args: any[]) => mockPairwiseQuery(...args),
    useCreateSettlementMutation: () => ({
        mutateAsync: jest.fn().mockResolvedValue(undefined),
        isPending: false,
    }),
}));

const mockGroupUsers = jest.fn();
jest.mock('../../../hooks/queries/useGroupUsersQuery', () => ({
    useGroupUsersQuery: (...args: any[]) => mockGroupUsers(...args),
}));

import { BalancesScreen } from '../../../screens/balances/BalancesScreen';
import { useAppStore } from '../../../store';
import { queryClient } from '../../../lib/queryClient';
import { queryKeys } from '../../../hooks/queries/keys';

const members = [
    { id: 'me', name: 'Me', email: 'me@x.com', defaultCurrency: 'USD', language: 'en', createdAt: new Date(), updatedAt: new Date(), inviteToken: 'me-token' },
    { id: 'alice', name: 'Alice', email: 'a@x.com', defaultCurrency: 'USD', language: 'en', createdAt: new Date(), updatedAt: new Date(), inviteToken: 'a-token' },
    { id: 'bob', name: 'Bob', email: 'b@x.com', defaultCurrency: 'USD', language: 'en', createdAt: new Date(), updatedAt: new Date(), inviteToken: 'b-token' },
];

function setContributions(opts: { totals?: any[]; matrix?: any[]; expenseCount?: number }) {
    mockContributionsQuery.mockReturnValue({
        data: {
            totals: opts.totals ?? [],
            matrix: opts.matrix ?? [],
            expenseCount: opts.expenseCount ?? 0,
        },
        isLoading: false,
        isFetching: false,
        refetch: jest.fn(),
    });
}

function setSimplifiedDebts(entries: any[]) {
    mockSimplifiedDebtsQuery.mockReturnValue({
        data: entries,
        isLoading: false,
        isFetching: false,
        refetch: jest.fn(),
    });
}

beforeEach(() => {
    mockContributionsQuery.mockReset();
    mockSimplifiedDebtsQuery.mockReset();
    mockPairwiseQuery.mockReset();
    mockGroupUsers.mockReset();
    mockGroupUsers.mockReturnValue({ data: members });
    mockPairwiseQuery.mockReturnValue({
        data: [],
        isLoading: false,
        isFetching: false,
        isRefetching: false,
        refetch: jest.fn(),
    });
    useAppStore.setState({
        currentUser: {
            id: 'me',
            email: 'me@x.com',
            name: 'Me',
            defaultCurrency: 'USD',
            language: 'en',
            createdAt: new Date(),
            updatedAt: new Date(),
            inviteToken: 'me-token',
        } as any,
    });
    queryClient.setQueryData(queryKeys.groups, [
        {
            id: 'g1',
            name: 'Trip',
            defaultCurrency: 'USD',
            groupType: 'travel',
            createdAt: new Date(),
            updatedAt: new Date(),
        } as any,
    ]);
});

describe('BalancesScreen', () => {
    it('no longer renders the mode toggle', () => {
        setContributions({});
        setSimplifiedDebts([]);
        const { queryByTestId } = renderWithQuery(<BalancesScreen />);
        expect(queryByTestId('balance-mode-toggle')).toBeNull();
        expect(queryByTestId('balance-mode-toggle-paid')).toBeNull();
        expect(queryByTestId('balance-mode-toggle-spentOn')).toBeNull();
    });

    it('renders the Group Totals card with summed paid amounts and expense count', () => {
        setContributions({
            totals: [
                { userId: 'me', paid: [{ currency: 'USD', amount: 100 }], owed: [] },
                {
                    userId: 'alice',
                    paid: [
                        { currency: 'USD', amount: 50 },
                        { currency: 'ILS', amount: 200 },
                    ],
                    owed: [],
                },
            ],
            expenseCount: 4,
        });
        setSimplifiedDebts([]);
        const { getByTestId, getByText, getAllByText } = renderWithQuery(<BalancesScreen />);
        expect(getByTestId('group-totals-card')).toBeTruthy();
        // USD total is the SUM of paid amounts and appears only in the totals card.
        expect(getByText('USD 150.00')).toBeTruthy();
        // ILS 200 appears both in alice's member row AND the totals card.
        expect(getAllByText('ILS 200.00').length).toBe(2);
        // 4 expenses → uses the plural form key in tests.
        expect(getAllByText(/balances\.expenseCount/i).length).toBeGreaterThan(0);
    });

    it('renders all members with paid amounts (current user first as "You")', () => {
        setContributions({
            totals: [
                { userId: 'alice', paid: [{ currency: 'USD', amount: 50 }], owed: [] },
                { userId: 'bob', paid: [], owed: [] },
                { userId: 'me', paid: [{ currency: 'USD', amount: 100 }], owed: [] },
            ],
            expenseCount: 2,
        });
        setSimplifiedDebts([]);
        const { getByTestId, getAllByText } = renderWithQuery(<BalancesScreen />);
        expect(getByTestId('member-row-me')).toBeTruthy();
        expect(getByTestId('member-row-alice')).toBeTruthy();
        expect(getByTestId('member-row-bob')).toBeTruthy();
        // USD 100 appears in me's row only (USD total = 150, not 100).
        expect(getAllByText('USD 100.00').length).toBe(1);
        // USD 50 appears in alice's row only (USD total = 150).
        expect(getAllByText('USD 50.00').length).toBe(1);
    });

    it('opens MemberContributionDialog when a member row is tapped', () => {
        setContributions({
            totals: [
                {
                    userId: 'me',
                    paid: [{ currency: 'USD', amount: 60 }],
                    owed: [{ currency: 'USD', amount: 20 }],
                },
                { userId: 'alice', paid: [], owed: [{ currency: 'USD', amount: 20 }] },
                { userId: 'bob', paid: [], owed: [{ currency: 'USD', amount: 20 }] },
            ],
            matrix: [
                { payerId: 'me', consumerId: 'me', currency: 'USD', amount: 20 },
                { payerId: 'me', consumerId: 'alice', currency: 'USD', amount: 20 },
                { payerId: 'me', consumerId: 'bob', currency: 'USD', amount: 20 },
            ],
            expenseCount: 1,
        });
        setSimplifiedDebts([]);
        const { getByTestId } = renderWithQuery(<BalancesScreen />);
        fireEvent.press(getByTestId('member-row-me'));
        expect(getByTestId('contribution-section-alice')).toBeTruthy();
        expect(getByTestId('contribution-section-bob')).toBeTruthy();
    });

    it('renders the simplified-debts section with the Minimum badge when all-exact', () => {
        setContributions({});
        setSimplifiedDebts([
            {
                currency: 'USD',
                result: {
                    debts: [
                        {
                            fromUserId: 'alice',
                            fromUserName: 'Alice',
                            toUserId: 'me',
                            toUserName: 'Me',
                            amount: 25,
                            currency: 'USD',
                        },
                    ],
                    transactionCount: 1,
                    algorithm: 'exact',
                },
            },
        ]);
        const { getAllByText, getByTestId } = renderWithQuery(<BalancesScreen />);
        // USD 25.00 appears in both the GroupTotalsCard unsettled row and the DebtRow.
        expect(getAllByText('USD 25.00').length).toBe(2);
        expect(getByTestId('minimum-badge')).toBeTruthy();
    });

    it('collapses non-involved debts behind a toggle and expands on press', () => {
        setContributions({});
        setSimplifiedDebts([
            {
                currency: 'USD',
                result: {
                    debts: [
                        // involved
                        {
                            fromUserId: 'me',
                            fromUserName: 'Me',
                            toUserId: 'alice',
                            toUserName: 'Alice',
                            amount: 30,
                            currency: 'USD',
                        },
                        // not involved
                        {
                            fromUserId: 'alice',
                            fromUserName: 'Alice',
                            toUserId: 'bob',
                            toUserName: 'Bob',
                            amount: 50,
                            currency: 'USD',
                        },
                    ],
                    transactionCount: 2,
                    algorithm: 'exact',
                },
            },
        ]);
        const { getByTestId, queryByTestId } = renderWithQuery(<BalancesScreen />);
        expect(getByTestId('settle-debt-me-alice-USD')).toBeTruthy();
        expect(queryByTestId('settle-debt-alice-bob-USD')).toBeNull();
        fireEvent.press(getByTestId('settle-others-toggle'));
        expect(getByTestId('settle-debt-alice-bob-USD')).toBeTruthy();
    });

    it('shows the "all settled" empty state when no currency has debts', () => {
        setContributions({});
        setSimplifiedDebts([]);
        const { getByText, queryByTestId } = renderWithQuery(<BalancesScreen />);
        expect(getByText('balances.allSettled')).toBeTruthy();
        expect(queryByTestId('debts-summary')).toBeNull();
    });

    it('opens SettleUpSheet pre-filled with the tapped simplified-debt row', () => {
        setContributions({});
        setSimplifiedDebts([
            {
                currency: 'USD',
                result: {
                    debts: [
                        {
                            fromUserId: 'alice',
                            fromUserName: 'Alice',
                            toUserId: 'me',
                            toUserName: 'Me',
                            amount: 25,
                            currency: 'USD',
                        },
                    ],
                    transactionCount: 1,
                    algorithm: 'exact',
                },
            },
        ]);
        const { getByTestId } = renderWithQuery(<BalancesScreen />);
        fireEvent.press(getByTestId('settle-debt-alice-me-USD'));
        expect(getByTestId('settle-sheet-open')).toBeTruthy();
        expect(getByTestId('settle-sheet-from').props.children).toBe('alice');
        expect(getByTestId('settle-sheet-to').props.children).toBe('me');
        expect(getByTestId('settle-sheet-currency').props.children).toBe('USD');
        expect(getByTestId('settle-sheet-amount').props.children).toBe('25');
    });
});
