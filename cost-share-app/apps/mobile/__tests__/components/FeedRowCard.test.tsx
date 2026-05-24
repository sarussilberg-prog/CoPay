import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { FeedRowCard } from '../../components/FeedRowCard';
import { View } from 'react-native';

describe('FeedRowCard', () => {
  const baseProps = {
    thumbnail: <View testID="thumb-stub" />,
    title: 'Sushi on Friday',
    meta: 'Aug 14 · Paid by Sarah',
    amount: 'USD 84.20',
  };

  it('renders title, meta, and amount', () => {
    const { getByText } = render(<FeedRowCard {...baseProps} />);
    expect(getByText('Sushi on Friday')).toBeTruthy();
    expect(getByText('Aug 14 · Paid by Sarah')).toBeTruthy();
    expect(getByText('USD 84.20')).toBeTruthy();
  });

  it('renders the sub-line when provided', () => {
    const { getByText, queryByText, rerender } = render(
      <FeedRowCard {...baseProps} subLine="You lent USD 21.05" />,
    );
    expect(getByText('You lent USD 21.05')).toBeTruthy();
    rerender(<FeedRowCard {...baseProps} />);
    expect(queryByText('You lent USD 21.05')).toBeNull();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <FeedRowCard {...baseProps} onPress={onPress} testID="card" />,
    );
    fireEvent.press(getByTestId('card'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
