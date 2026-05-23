import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('expo-linear-gradient', () => {
    const { View } = require('react-native');
    return { LinearGradient: View };
});

import { GroupHero } from '../../components/GroupHero';
import type { Group } from '@cost-share/shared';

const base: Group = {
    id: 'g1',
    name: 'Trip to Paris',
    groupType: 'trip',
    defaultCurrency: 'EUR',
    inviteToken: 'abc1234567',
    createdBy: 'u1',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
};

describe('GroupHero', () => {
    it('renders the group name', () => {
        const { getByText } = render(
            <GroupHero group={base} memberCount={3} onBack={() => {}} onMenu={() => {}} />,
        );
        expect(getByText('Trip to Paris')).toBeTruthy();
    });

    it('renders the gradient fallback when group has no image', () => {
        const { getByTestId } = render(
            <GroupHero group={base} memberCount={3} onBack={() => {}} onMenu={() => {}} />,
        );
        expect(getByTestId('hero-gradient')).toBeTruthy();
    });

    it('renders the image background when group has an imageUrl', () => {
        const withImage = { ...base, imageUrl: 'https://x/y.jpg' };
        const { getByTestId } = render(
            <GroupHero group={withImage} memberCount={3} onBack={() => {}} onMenu={() => {}} />,
        );
        expect(getByTestId('hero-image-bg')).toBeTruthy();
    });

    it('invokes onBack and onMenu', () => {
        const onBack = jest.fn();
        const onMenu = jest.fn();
        const { getByTestId } = render(
            <GroupHero group={base} memberCount={3} onBack={onBack} onMenu={onMenu} />,
        );
        fireEvent.press(getByTestId('hero-back-btn'));
        fireEvent.press(getByTestId('hero-menu-btn'));
        expect(onBack).toHaveBeenCalled();
        expect(onMenu).toHaveBeenCalled();
    });

    it('renders group stats when provided', () => {
        const { getByTestId, getByText } = render(
            <GroupHero
                group={base}
                memberCount={3}
                stats={{
                    totalSpent: [{ currency: 'EUR', amount: 150 }],
                    totalUnsettled: [{ currency: 'EUR', amount: 25 }],
                }}
                onBack={() => {}}
                onMenu={() => {}}
            />,
        );
        expect(getByTestId('hero-group-stats')).toBeTruthy();
        expect(getByText('groups.hero.spentTogether')).toBeTruthy();
        expect(getByText('groups.hero.leftToSettle')).toBeTruthy();
        expect(getByText('€150.00')).toBeTruthy();
        expect(getByText('€25.00')).toBeTruthy();
    });

    it('shows settled label when there is no remaining group balance', () => {
        const { getByText } = render(
            <GroupHero
                group={base}
                memberCount={3}
                stats={{
                    totalSpent: [{ currency: 'EUR', amount: 150 }],
                    totalUnsettled: [],
                }}
                onBack={() => {}}
                onMenu={() => {}}
            />,
        );
        expect(getByText('groups.card.settled')).toBeTruthy();
    });

    it('renders the full primary-currency amount without truncation', () => {
        const ilsGroup = { ...base, defaultCurrency: 'ILS' };
        const { getByText } = render(
            <GroupHero
                group={ilsGroup}
                memberCount={2}
                stats={{
                    totalSpent: [{ currency: 'ILS', amount: 58 }],
                    totalUnsettled: [],
                }}
                onBack={() => {}}
                onMenu={() => {}}
            />,
        );
        expect(getByText('₪58.00')).toBeTruthy();
    });
});
