import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { InviteLinkBlock } from '../../components/InviteLinkBlock';

const mockShare = jest.fn();
const mockRotate = jest.fn();
jest.mock('../../hooks/useInviteLink', () => ({
    useInviteLink: () => ({
        url: 'https://kupa.pro/i/AbCdEfGhIj',
        isReady: true,
        share: mockShare,
        rotate: mockRotate,
    }),
}));

describe('<InviteLinkBlock />', () => {
    beforeEach(() => {
        mockShare.mockClear();
        mockRotate.mockClear();
    });

    it('calls share() when share row is pressed', () => {
        const { getByTestId } = render(<InviteLinkBlock mode="expanded" kind="friend" />);
        fireEvent.press(getByTestId('invite-link-share'));
        expect(mockShare).toHaveBeenCalled();
    });

    it('renders the rotate row in expanded mode', () => {
        const { getByTestId } = render(<InviteLinkBlock mode="expanded" kind="friend" />);
        fireEvent.press(getByTestId('invite-link-rotate'));
        expect(mockRotate).toHaveBeenCalled();
    });

    it('hides the rotate row in compact mode', () => {
        const { queryByTestId } = render(<InviteLinkBlock mode="compact" kind="friend" />);
        expect(queryByTestId('invite-link-rotate')).toBeNull();
    });

    it('does not render the raw URL text', () => {
        const { queryByText } = render(<InviteLinkBlock mode="expanded" kind="friend" />);
        expect(queryByText(/kupa\.pro/)).toBeNull();
    });
});
