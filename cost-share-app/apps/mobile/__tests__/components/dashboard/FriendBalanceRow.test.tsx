import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { FriendBalanceRow } from '../../../components/dashboard/FriendBalanceRow';

const base = {
    userId: 'u2',
    name: 'Bob',
    avatarUrl: undefined,
    isActive: true,
    sharedGroupIds: ['g1'],
    byCurrency: [{ currency: 'USD', netBalance: 25 }],
};

const displayOwed = { netBalance: 25, currency: 'USD', isConverted: false };

describe('FriendBalanceRow', () => {
    it('renders avatar and amount when friend owes you', () => {
        const { getByText, getByTestId } = render(
            <FriendBalanceRow
                friend={base}
                display={displayOwed}
                onPress={() => {}}
                testID="friend-u2"
            />,
        );
        expect(getByText('Bob')).toBeTruthy();
        expect(getByTestId('friend-u2-avatar')).toBeTruthy();
        expect(getByText(/25\.00/)).toBeTruthy();
        expect(getByText('dashboard.owesYou')).toBeTruthy();
    });

    it('shows zero amount at settled balance', () => {
        const { getByText } = render(
            <FriendBalanceRow
                friend={base}
                display={{ netBalance: 0, currency: 'USD', isConverted: false }}
                onPress={() => {}}
            />,
        );
        expect(getByText(/\$0\.00/)).toBeTruthy();
    });

    it('shows converted label for multi-currency rollup', () => {
        const { getByText } = render(
            <FriendBalanceRow
                friend={base}
                display={{ netBalance: 100, currency: 'ILS', isConverted: true }}
                onPress={() => {}}
            />,
        );
        expect(getByText('dashboard.friendConverted')).toBeTruthy();
    });

    it('triggers onPress with friend data', () => {
        const onPress = jest.fn();
        const { getByText } = render(
            <FriendBalanceRow friend={base} display={displayOwed} onPress={onPress} />,
        );
        fireEvent.press(getByText('Bob'));
        expect(onPress).toHaveBeenCalledWith(base);
    });
});
