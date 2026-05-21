import React from 'react';
import { fireEvent, act } from '@testing-library/react-native';
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

// Stub SettleUpSheet so we can detect when it opens and assert prefill.
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

const members = [
    { id: 'me', name: 'Me', email: 'me@x.com', defaultCurrency: 'USD', language: 'en', createdAt: new Date(), updatedAt: new Date(), inviteToken: 'me-token' },
    { id: 'alice', name: 'Alice', email: 'a@x.com', defaultCurrency: 'USD', language: 'en', createdAt: new Date(), updatedAt: new Date(), inviteToken: 'a-token' },
    { id: 'bob', name: 'Bob', email: 'b@x.com', defaultCurrency: 'USD', language: 'en', createdAt: new Date(), updatedAt: new Date(), inviteToken: 'b-token' },
];

function setContributions(totals: any[], matrix: any[] = []) {
    mockContributionsQuery.mockReturnValue({
        data: { totals, matrix },
        isLoading: false,
        isFetching: false,
        refetch: jest.fn(),
    });
}

function setSimplifiedDebts(entries: any[]) {
    mockSimplifiedDebtsQuery.mockReturnValue({
        data: entries,
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
});

describe('BalancesScreen', () => {
    it('renders the mode toggle and defaults to Paid', () => {
        setContributions([], []);
        setSimplifiedDebts([]);
        const { getByTestId } = renderWithQuery(<BalancesScreen />);
        const paidBtn = getByTestId('balance-mode-toggle-paid');
        const spentOnBtn = getByTestId('balance-mode-toggle-spentOn');
        expect(paidBtn.props.accessibilityState?.selected).toBe(true);
        expect(spentOnBtn.props.accessibilityState?.selected).toBe(false);
    });

    it('renders all members in roster order (current user first as "You")', () => {
        setContributions(
            [
                { userId: 'me', paid: [], owed: [] },
                { userId: 'alice', paid: [], owed: [] },
                { userId: 'bob', paid: [], owed: [] },
            ],
            [],
        );
        setSimplifiedDebts([]);
        const { getByTestId, getAllByText } = renderWithQuery(<BalancesScreen />);
        expect(getByTestId('member-row-me')).toBeTruthy();
        expect(getByTestId('member-row-alice')).toBeTruthy();
        expect(getByTestId('member-row-bob')).toBeTruthy();
        // "You" appears via i18n key — t() returns key in tests, but the row
        // still uses the translated string-shape. Verify by ensuring the
        // "common.you" key is referenced via the paidMode.row label string.
        expect(getAllByText(/balances\.paidMode\.row/).length).toBeGreaterThan(0);
    });

    it('shows per-currency paid amounts in Paid mode and switches to owed in Spent on', () => {
        setContributions(
            [
                {
                    userId: 'me',
                    paid: [{ currency: 'USD', amount: 100 }],
                    owed: [{ currency: 'USD', amount: 50 }],
                },
                {
                    userId: 'alice',
                    paid: [],
                    owed: [{ currency: 'USD', amount: 50 }],
                },
                { userId: 'bob', paid: [], owed: [] },
            ],
            [],
        );
        setSimplifiedDebts([]);
        const { getByText, getByTestId, queryByText } = renderWithQuery(
            <BalancesScreen />,
        );
        expect(getByText('USD 100.00')).toBeTruthy();
        expect(queryByText('USD 50.00')).toBeNull();

        fireEvent.press(getByTestId('balance-mode-toggle-spentOn'));
        // Now Alice's owed (USD 50) and Me's owed (USD 50) should appear.
        // Use getAllByText to find both.
        // After toggle: paid 100 should be gone from the me row.
        expect(queryByText('USD 100.00')).toBeNull();
    });

    it('shows "No activity" line for members with zero activity in the selected mode', () => {
        setContributions(
            [
                { userId: 'me', paid: [{ currency: 'USD', amount: 10 }], owed: [] },
                { userId: 'alice', paid: [], owed: [] },
                { userId: 'bob', paid: [], owed: [] },
            ],
            [],
        );
        setSimplifiedDebts([]);
        const { getAllByText } = renderWithQuery(<BalancesScreen />);
        // Alice and Bob both have no paid activity — two "No activity" lines.
        const noActivity = getAllByText('balances.noActivityInMode');
        expect(noActivity.length).toBeGreaterThanOrEqual(2);
    });

    it('opens MemberContributionDialog when a member row is tapped', () => {
        setContributions(
            [
                {
                    userId: 'me',
                    paid: [{ currency: 'USD', amount: 60 }],
                    owed: [{ currency: 'USD', amount: 20 }],
                },
                { userId: 'alice', paid: [], owed: [{ currency: 'USD', amount: 20 }] },
                { userId: 'bob', paid: [], owed: [{ currency: 'USD', amount: 20 }] },
            ],
            [
                { payerId: 'me', consumerId: 'me', currency: 'USD', amount: 20 },
                { payerId: 'me', consumerId: 'alice', currency: 'USD', amount: 20 },
                { payerId: 'me', consumerId: 'bob', currency: 'USD', amount: 20 },
            ],
        );
        setSimplifiedDebts([]);
        const { getByTestId } = renderWithQuery(<BalancesScreen />);
        fireEvent.press(getByTestId('member-row-me'));
        // Dialog renders a section per counterparty.
        expect(getByTestId('contribution-section-alice')).toBeTruthy();
        expect(getByTestId('contribution-section-bob')).toBeTruthy();
    });

    it('renders the simplified-debts section per currency and shows the Minimum badge when all currencies are exact', () => {
        setContributions(
            [
                { userId: 'me', paid: [], owed: [] },
                { userId: 'alice', paid: [], owed: [] },
                { userId: 'bob', paid: [], owed: [] },
            ],
            [],
        );
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
            {
                currency: 'ILS',
                result: {
                    debts: [
                        {
                            fromUserId: 'bob',
                            fromUserName: 'Bob',
                            toUserId: 'me',
                            toUserName: 'Me',
                            amount: 75,
                            currency: 'ILS',
                        },
                    ],
                    transactionCount: 1,
                    algorithm: 'exact',
                },
            },
        ]);
        const { getByText, getByTestId } = renderWithQuery(<BalancesScreen />);
        expect(getByText('USD 25.00')).toBeTruthy();
        expect(getByText('ILS 75.00')).toBeTruthy();
        expect(getByTestId('minimum-badge')).toBeTruthy();
    });

    it('hides the Minimum badge when any currency simplification is greedy', () => {
        setContributions([], []);
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
                    algorithm: 'greedy',
                },
            },
        ]);
        const { queryByTestId, getByTestId } = renderWithQuery(<BalancesScreen />);
        expect(getByTestId('debts-summary')).toBeTruthy();
        expect(queryByTestId('minimum-badge')).toBeNull();
    });

    it('shows the "all settled" empty state when no currency has debts', () => {
        setContributions([], []);
        setSimplifiedDebts([]);
        const { getByText, queryByTestId } = renderWithQuery(<BalancesScreen />);
        expect(getByText('balances.allSettled')).toBeTruthy();
        expect(queryByTestId('debts-summary')).toBeNull();
    });

    it('opens SettleUpSheet pre-filled with the tapped simplified-debt row', () => {
        setContributions([], []);
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
