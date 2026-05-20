import React from 'react';
import { render } from '@testing-library/react-native';
import { CurrencyBadge } from '../../components/CurrencyBadge';
import { useAppStore } from '../../store';

describe('CurrencyBadge', () => {
    it('shows Hebrew currency name when app language is he', () => {
        useAppStore.setState({ language: 'he' });
        const { getByTestId } = render(<CurrencyBadge currency="AMD" />);
        expect(getByTestId('currency-badge-name-AMD').props.children).toBe('דראם ארמני');
    });

    it('shows English currency name when app language is en', () => {
        useAppStore.setState({ language: 'en' });
        const { getByTestId } = render(<CurrencyBadge currency="USD" />);
        expect(getByTestId('currency-badge-name-USD').props.children).toBe('US Dollar');
    });
});
