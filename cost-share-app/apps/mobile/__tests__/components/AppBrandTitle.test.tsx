import React from 'react';
import { render } from '@testing-library/react-native';
import { AppBrandTitle } from '../../components/AppBrandTitle';
import { APP_BRAND_COLOR, APP_BRAND_TITLE } from '../../theme/brand';

describe('AppBrandTitle', () => {
    it('renders the canonical brand title', () => {
        const { getByText, getByTestId } = render(<AppBrandTitle />);
        expect(getByTestId('app-brand-title')).toBeTruthy();
        expect(getByText(APP_BRAND_TITLE)).toBeTruthy();
    });

    it('uses primary-dark brand color class', () => {
        const { getByTestId } = render(<AppBrandTitle />);
        expect(getByTestId('app-brand-title').props.className).toContain('text-primary-dark');
    });

    it('uses bold 3xl typography', () => {
        const { getByTestId } = render(<AppBrandTitle />);
        const className = getByTestId('app-brand-title').props.className as string;
        expect(className).toContain('text-3xl');
        expect(className).toContain('font-bold');
    });

    it('exports shared brand color constant', () => {
        expect(APP_BRAND_COLOR).toBe('#3B82F6');
    });
});
