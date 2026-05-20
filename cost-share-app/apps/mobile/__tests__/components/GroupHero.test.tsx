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
    createdBy: 'u1',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
};

describe('GroupHero', () => {
    it('renders the group name', () => {
        const { getByText } = render(
            <GroupHero group={base} memberCount={3} onBack={() => {}} onSettings={() => {}} />,
        );
        expect(getByText('Trip to Paris')).toBeTruthy();
    });

    it('renders the gradient fallback when group has no image', () => {
        const { getByTestId } = render(
            <GroupHero group={base} memberCount={3} onBack={() => {}} onSettings={() => {}} />,
        );
        expect(getByTestId('hero-gradient')).toBeTruthy();
    });

    it('renders the image background when group has an imageUrl', () => {
        const withImage = { ...base, imageUrl: 'https://x/y.jpg' };
        const { getByTestId } = render(
            <GroupHero group={withImage} memberCount={3} onBack={() => {}} onSettings={() => {}} />,
        );
        expect(getByTestId('hero-image-bg')).toBeTruthy();
    });

    it('invokes onBack and onSettings', () => {
        const onBack = jest.fn();
        const onSettings = jest.fn();
        const { getByTestId } = render(
            <GroupHero group={base} memberCount={3} onBack={onBack} onSettings={onSettings} />,
        );
        fireEvent.press(getByTestId('hero-back-btn'));
        fireEvent.press(getByTestId('hero-settings-btn'));
        expect(onBack).toHaveBeenCalled();
        expect(onSettings).toHaveBeenCalled();
    });
});
