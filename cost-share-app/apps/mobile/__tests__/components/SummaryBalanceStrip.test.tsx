import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SummaryBalanceStrip } from '../../components/groupDetail/SummaryBalanceStrip';

describe('SummaryBalanceStrip', () => {
  it('renders the owed copy when net is positive', () => {
    const { getByText } = render(
      <SummaryBalanceStrip
        balance={{ net: 42, currency: 'USD', isSettled: false }}
        onPress={() => {}}
      />,
    );
    expect(getByText(/USD 42\.00/)).toBeTruthy();
    expect(getByText(/credit/i)).toBeTruthy();
  });

  it('renders the owe copy when net is negative', () => {
    const { getByText } = render(
      <SummaryBalanceStrip
        balance={{ net: -10, currency: 'USD', isSettled: false }}
        onPress={() => {}}
      />,
    );
    expect(getByText(/USD 10\.00/)).toBeTruthy();
    expect(getByText(/owe/i)).toBeTruthy();
  });

  it('renders the settled copy when isSettled', () => {
    const { queryByText, getByText } = render(
      <SummaryBalanceStrip
        balance={{ net: 0, currency: 'USD', isSettled: true }}
        onPress={() => {}}
      />,
    );
    expect(getByText(/settled/i)).toBeTruthy();
    expect(queryByText(/USD 0/)).toBeNull();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <SummaryBalanceStrip
        balance={{ net: 42, currency: 'USD', isSettled: false }}
        onPress={onPress}
        testID="strip"
      />,
    );
    fireEvent.press(getByTestId('strip'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
