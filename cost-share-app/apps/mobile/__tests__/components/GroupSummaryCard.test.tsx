import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { GroupSummaryCard } from '../../components/groupDetail/GroupSummaryCard';
import { Group, GroupMemberLite } from '@cost-share/shared';

const group = {
  id: 'g1',
  name: 'Paris Trip',
  groupType: 'trip',
  defaultCurrency: 'USD',
} as unknown as Group;

const members: GroupMemberLite[] = [
  { userId: 'u1', displayName: 'A', isActive: true },
  { userId: 'u2', displayName: 'B', isActive: true },
];

const noop = () => {};

const baseProps = {
  group,
  members,
  balance: { net: 42, currency: 'USD', isSettled: false },
  settlementCount: 1,
  noteHasContent: false,
  onBack: noop,
  onShare: noop,
  onMenu: noop,
  onOpenBalances: noop,
  onOpenNote: noop,
  onOpenSettleUp: noop,
};

describe('GroupSummaryCard', () => {
  it('renders the cover, balance strip, and footer', () => {
    const { getByText, getByTestId } = render(<GroupSummaryCard {...baseProps} />);
    expect(getByText('Paris Trip')).toBeTruthy();
    expect(getByText(/USD 42\.00/)).toBeTruthy();
    expect(getByTestId('summary-note-pill')).toBeTruthy();
    expect(getByTestId('summary-settle-pill')).toBeTruthy();
  });

  it('routes the balance/note/settle taps to their handlers', () => {
    const onOpenBalances = jest.fn();
    const onOpenNote = jest.fn();
    const onOpenSettleUp = jest.fn();
    const { getByTestId } = render(
      <GroupSummaryCard
        {...baseProps}
        onOpenBalances={onOpenBalances}
        onOpenNote={onOpenNote}
        onOpenSettleUp={onOpenSettleUp}
      />,
    );
    fireEvent.press(getByTestId('summary-balance-strip'));
    fireEvent.press(getByTestId('summary-note-pill'));
    fireEvent.press(getByTestId('summary-settle-pill'));
    expect(onOpenBalances).toHaveBeenCalledTimes(1);
    expect(onOpenNote).toHaveBeenCalledTimes(1);
    expect(onOpenSettleUp).toHaveBeenCalledTimes(1);
  });

  it('routes the back/share/menu taps to their handlers', () => {
    const onBack = jest.fn();
    const onShare = jest.fn();
    const onMenu = jest.fn();
    const { getByTestId } = render(
      <GroupSummaryCard
        {...baseProps}
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
