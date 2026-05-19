import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { LegalSheet } from '../../../components/settings/LegalSheet';

describe('LegalSheet', () => {
    it('renders title + body when visible', () => {
        const { getByText } = render(<LegalSheet visible title="Terms" body="Body" onClose={() => {}} />);
        expect(getByText('Terms')).toBeTruthy();
        expect(getByText('Body')).toBeTruthy();
    });

    it('does not render content when hidden', () => {
        const { queryByText } = render(<LegalSheet visible={false} title="Terms" body="Body" onClose={() => {}} />);
        expect(queryByText('Terms')).toBeNull();
    });

    it('close triggers onClose', () => {
        const onClose = jest.fn();
        const { getByText } = render(<LegalSheet visible title="T" body="B" onClose={onClose} />);
        fireEvent.press(getByText('legal.close'));
        expect(onClose).toHaveBeenCalled();
    });
});
