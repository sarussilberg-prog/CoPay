import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: View };
});

import { SummaryCover } from '../../components/groupDetail/SummaryCover';

const mockGroup = (overrides: Partial<any> = {}): any => ({
  id: 'g1',
  name: 'Paris Trip',
  groupType: 'trip',
  imageUrl: undefined,
  defaultCurrency: 'USD',
  ...overrides,
});

const noop = () => {};

describe('SummaryCover', () => {
  it('renders gradient variant when no imageUrl', () => {
    const { getByTestId, queryByTestId } = render(
      <SummaryCover
        group={mockGroup()}
        members={[]}
        topInset={0}
        onBack={noop}
        onShare={noop}
        onMenu={noop}
      />,
    );
    expect(getByTestId('summary-cover-gradient')).toBeTruthy();
    expect(queryByTestId('summary-cover-image')).toBeNull();
  });

  it('renders image variant when imageUrl is set', () => {
    const { getByTestId, queryByTestId } = render(
      <SummaryCover
        group={mockGroup({ imageUrl: 'https://example.com/x.jpg' })}
        members={[]}
        topInset={20}
        onBack={noop}
        onShare={noop}
        onMenu={noop}
      />,
    );
    expect(getByTestId('summary-cover-image')).toBeTruthy();
    expect(queryByTestId('summary-cover-gradient')).toBeNull();
  });

  it('renders the group name', () => {
    const { getByText } = render(
      <SummaryCover
        group={mockGroup({ name: 'Paris Trip' })}
        members={[
          { userId: 'u1', displayName: 'A', isActive: true },
          { userId: 'u2', displayName: 'B', isActive: true },
        ]}
        topInset={0}
        onBack={noop}
        onShare={noop}
        onMenu={noop}
      />,
    );
    expect(getByText('Paris Trip')).toBeTruthy();
  });

  it('fires onBack / onShare / onMenu when buttons are tapped', () => {
    const onBack = jest.fn();
    const onShare = jest.fn();
    const onMenu = jest.fn();
    const { getByTestId } = render(
      <SummaryCover
        group={mockGroup()}
        members={[]}
        topInset={0}
        onBack={onBack}
        onShare={onShare}
        onMenu={onMenu}
      />,
    );
    fireEvent.press(getByTestId('appbar-back'));
    fireEvent.press(getByTestId('appbar-share'));
    fireEvent.press(getByTestId('appbar-menu'));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onMenu).toHaveBeenCalledTimes(1);
  });
});
