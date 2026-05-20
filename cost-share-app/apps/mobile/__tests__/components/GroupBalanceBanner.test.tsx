import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { GroupBalanceBanner } from '../../components/GroupBalanceBanner';

describe('GroupBalanceBanner', () => {
    it('shows settled state when net is zero', () => {
        const { getByText } = render(
            <GroupBalanceBanner defaultCurrency="ILS" balance={{ groupId: 'g1', currency: 'ILS', net: 0 }} />,
        );
        expect(getByText('groups.card.settled')).toBeTruthy();
    });

    it('shows owed amount when net is positive', () => {
        const { getByText } = render(
            <GroupBalanceBanner
                defaultCurrency="ILS"
                balance={{ groupId: 'g1', currency: 'ILS', net: 50 }}
            />,
        );
        expect(getByText('groups.summary.youAreOwed')).toBeTruthy();
    });

    it('calls onPress when tapped', () => {
        const onPress = jest.fn();
        const { getByTestId } = render(
            <GroupBalanceBanner defaultCurrency="ILS" onPress={onPress} />,
        );
        fireEvent.press(getByTestId('group-balance-banner'));
        expect(onPress).toHaveBeenCalled();
    });
});
