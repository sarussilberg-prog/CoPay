import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { SettingsSection } from '../../../components/settings/SettingsSection';

describe('SettingsSection', () => {
    it('renders title + children', () => {
        const { getByText } = render(<SettingsSection title="General"><Text>Inside</Text></SettingsSection>);
        expect(getByText('General')).toBeTruthy();
        expect(getByText('Inside')).toBeTruthy();
    });
});
