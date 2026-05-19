import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { LanguageSheet } from '../../../components/settings/LanguageSheet';

describe('LanguageSheet', () => {
    it('calls onSelect', () => {
        const onSelect = jest.fn();
        const { getByText } = render(<LanguageSheet visible current="en" onSelect={onSelect} onClose={() => {}} />);
        fireEvent.press(getByText('profile.hebrew'));
        expect(onSelect).toHaveBeenCalledWith('he');
    });
});
