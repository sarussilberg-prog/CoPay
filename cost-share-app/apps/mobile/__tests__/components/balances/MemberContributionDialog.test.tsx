import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { MemberContributionDialog } from '../../../components/balances/MemberContributionDialog';

const members = [
    { userId: 'me', displayName: 'Me' },
    { userId: 'alice', displayName: 'Alice' },
    { userId: 'bob', displayName: 'Bob' },
];

describe('MemberContributionDialog', () => {
    it('returns null when no member is selected', () => {
        const { toJSON } = render(
            <MemberContributionDialog
                open
                member={null}
                allMembers={members}
                matrix={[]}
                selfTotals={[]}
                mode="paid"
                currentUserId="me"
                onClose={() => {}}
            />,
        );
        expect(toJSON()).toBeNull();
    });

    it('renders nothing when open=false', () => {
        const { queryByText } = render(
            <MemberContributionDialog
                open={false}
                member={members[0]}
                allMembers={members}
                matrix={[]}
                selfTotals={[]}
                mode="paid"
                currentUserId="me"
                onClose={() => {}}
            />,
        );
        expect(queryByText('balances.memberContributionTitle')).toBeNull();
    });

    it('renders a section per counterparty in Paid mode with gross amounts', () => {
        const { getByTestId, getByText, getAllByText } = render(
            <MemberContributionDialog
                open
                member={members[0]}
                allMembers={members}
                matrix={[
                    { payerId: 'me', consumerId: 'alice', currency: 'USD', amount: 40 },
                    { payerId: 'me', consumerId: 'bob', currency: 'USD', amount: 25 },
                    { payerId: 'me', consumerId: 'bob', currency: 'ILS', amount: 90 },
                ]}
                selfTotals={[
                    { currency: 'USD', amount: 100 },
                    { currency: 'ILS', amount: 90 },
                ]}
                mode="paid"
                currentUserId="me"
                onClose={() => {}}
            />,
        );

        // Header totals.
        expect(getByText('USD 100.00')).toBeTruthy();
        // ILS 90 appears both at the header total and inside Bob's section.
        expect(getAllByText('ILS 90.00').length).toBe(2);

        // Counterparty sections.
        expect(getByTestId('contribution-section-alice')).toBeTruthy();
        expect(getByTestId('contribution-section-bob')).toBeTruthy();

        // Bob has both currencies; Alice has only USD 40.
        expect(getByText('USD 40.00')).toBeTruthy();
        expect(getByText('USD 25.00')).toBeTruthy();
    });

    it('shows "No activity" line for counterparties with zero gross activity', () => {
        const { getAllByText } = render(
            <MemberContributionDialog
                open
                member={members[0]}
                allMembers={members}
                matrix={[
                    { payerId: 'me', consumerId: 'alice', currency: 'USD', amount: 40 },
                ]}
                selfTotals={[{ currency: 'USD', amount: 40 }]}
                mode="paid"
                currentUserId="me"
                onClose={() => {}}
            />,
        );
        // Only Bob has no activity (Alice has $40 paid for her).
        // CurrencyAmountList for self in header renders amounts, not empty.
        expect(getAllByText('balances.noActivityInMode').length).toBe(1);
    });

    it('flips matrix direction in Spent on mode', () => {
        const { getAllByText, queryByText } = render(
            <MemberContributionDialog
                open
                member={members[0]}
                allMembers={members}
                matrix={[
                    // Spent on Me means others paid for Me.
                    { payerId: 'alice', consumerId: 'me', currency: 'USD', amount: 70 },
                    { payerId: 'me', consumerId: 'alice', currency: 'USD', amount: 40 },
                ]}
                selfTotals={[{ currency: 'USD', amount: 70 }]}
                mode="spentOn"
                currentUserId="me"
                onClose={() => {}}
            />,
        );
        // Spent on Me from Alice → 70 (appears in header + Alice's section).
        expect(getAllByText('USD 70.00').length).toBe(2);
        // The reverse direction (40) must not bleed into the Spent on view.
        expect(queryByText('USD 40.00')).toBeNull();
    });

    it('closes when the backdrop is pressed', () => {
        const onClose = jest.fn();
        const { getByTestId } = render(
            <MemberContributionDialog
                open
                member={members[0]}
                allMembers={members}
                matrix={[]}
                selfTotals={[]}
                mode="paid"
                currentUserId="me"
                onClose={onClose}
            />,
        );
        fireEvent.press(getByTestId('contribution-dialog-backdrop'));
        expect(onClose).toHaveBeenCalled();
    });
});
