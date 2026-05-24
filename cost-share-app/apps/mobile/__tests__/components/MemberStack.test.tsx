import React from 'react';
import { render } from '@testing-library/react-native';
import { MemberStack } from '../../components/groupDetail/MemberStack';
import { GroupMemberLite } from '@cost-share/shared';

const member = (i: number): GroupMemberLite => ({
  userId: `u${i}`,
  displayName: `User ${i}`,
  isActive: true,
});

describe('MemberStack', () => {
  it('renders up to four avatars and no overflow tile when ≤4', () => {
    const { queryByTestId } = render(
      <MemberStack members={[member(1), member(2), member(3), member(4)]} testID="stack" />,
    );
    expect(queryByTestId('stack-overflow')).toBeNull();
  });

  it('renders the +N overflow tile when more than four members', () => {
    const { getByTestId, getByText } = render(
      <MemberStack
        members={[member(1), member(2), member(3), member(4), member(5), member(6)]}
        testID="stack"
      />,
    );
    expect(getByTestId('stack-overflow')).toBeTruthy();
    expect(getByText('+2')).toBeTruthy();
  });
});
