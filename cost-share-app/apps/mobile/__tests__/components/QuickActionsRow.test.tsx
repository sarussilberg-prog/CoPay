import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { QuickActionsRow } from '../../components/QuickActionsRow';

describe('QuickActionsRow', () => {
    it('renders settle up and balances labels', () => {
        const { getByText, queryByText } = render(
            <QuickActionsRow onSettleUp={() => {}} onBalances={() => {}} />,
        );
        expect(getByText('groups.actions.settleUp')).toBeTruthy();
        expect(getByText('groups.actions.balances')).toBeTruthy();
        expect(queryByText('groups.actions.export')).toBeNull();
        expect(queryByText('groups.actions.message')).toBeNull();
    });

    it('disables the Settle up action when settleUpDisabled is true', () => {
        const onSettleUp = jest.fn();
        const { getByTestId } = render(
            <QuickActionsRow
                onSettleUp={onSettleUp}
                onBalances={() => {}}
                settleUpDisabled
            />,
        );
        fireEvent.press(getByTestId('qa-settle-up'));
        expect(onSettleUp).not.toHaveBeenCalled();
    });

    it('fires onBalances when the balances chip is tapped', () => {
        const onBalances = jest.fn();
        const { getByTestId } = render(
            <QuickActionsRow onSettleUp={() => {}} onBalances={onBalances} />,
        );
        fireEvent.press(getByTestId('qa-balances'));
        expect(onBalances).toHaveBeenCalled();
    });
});
