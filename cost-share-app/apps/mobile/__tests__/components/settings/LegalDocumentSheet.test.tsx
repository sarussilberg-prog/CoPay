import React from 'react';
import { render } from '@testing-library/react-native';

const mockUseLegalDocument = jest.fn();

jest.mock('../../../hooks/queries/useLegalDocument', () => ({
    useLegalDocument: (...args: unknown[]) => mockUseLegalDocument(...args),
}));

jest.mock('react-native-markdown-display', () => ({
    __esModule: true,
    default: ({ children }: { children: string }) => {
        const ReactLazy = require('react');
        const { Text: RNText } = require('react-native');
        return ReactLazy.createElement(RNText, { testID: 'markdown-body' }, children);
    },
}));

// Override the global react-i18next mock so this suite gets real-looking English
// strings (the global jest-setup returns keys; these tests assert actual copy).
jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => {
            const dict: Record<string, string> = {
                'legal.termsTitle': 'Terms of Service',
                'legal.privacyTitle': 'Privacy Policy',
                'legal.close': 'Close',
                'legal.errorTitle': "Couldn't load document",
                'legal.errorBody': 'Check your connection and try again.',
                'legal.retry': 'Try again',
                'legal.lastUpdated': 'Updated: {{date}}',
                'legal.versionLabel': 'v{{version}}',
                'legal.understood': 'I understand',
            };
            let value = dict[key] ?? key;
            if (opts) {
                for (const [k, v] of Object.entries(opts)) {
                    value = value.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), String(v));
                }
            }
            return value;
        },
        i18n: { language: 'en', changeLanguage: jest.fn(), dir: () => 'ltr' },
    }),
    initReactI18next: { type: '3rdParty', init: jest.fn() },
    Trans: ({ children }: { children: React.ReactNode }) => children,
}));

import { LegalDocumentSheet } from '../../../components/settings/LegalDocumentSheet';

const baseDoc = {
    id: 'uuid-1',
    slug: 'terms' as const,
    locale: 'en' as const,
    version: '1.0.0',
    title: 'Terms of Service',
    contentMd: '# Welcome\n\nBody text.',
    effectiveDate: '2026-01-01',
    updatedAt: '2026-05-23T10:00:00Z',
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('LegalDocumentSheet', () => {
    it('does not render when visible is false', () => {
        mockUseLegalDocument.mockReturnValue({ data: baseDoc, isLoading: false, isError: false, refetch: jest.fn() });
        const { queryByTestId } = render(
            <LegalDocumentSheet visible={false} slug="terms" onClose={() => {}} />,
        );
        expect(queryByTestId('legal-sheet')).toBeNull();
    });

    it('renders loading state when isLoading is true', () => {
        mockUseLegalDocument.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: jest.fn() });
        const { getByTestId } = render(
            <LegalDocumentSheet visible={true} slug="terms" onClose={() => {}} />,
        );
        expect(getByTestId('legal-sheet-skeleton')).toBeTruthy();
    });

    it('renders error state with retry when isError is true', () => {
        const refetch = jest.fn();
        mockUseLegalDocument.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
        const { getByTestId, getByText } = render(
            <LegalDocumentSheet visible={true} slug="terms" onClose={() => {}} />,
        );
        expect(getByTestId('legal-sheet-error')).toBeTruthy();
        expect(getByText('Try again')).toBeTruthy();
    });

    it('renders title, version, effective date, and markdown body on success', () => {
        mockUseLegalDocument.mockReturnValue({ data: baseDoc, isLoading: false, isError: false, refetch: jest.fn() });
        const { getByText, getByTestId } = render(
            <LegalDocumentSheet visible={true} slug="terms" onClose={() => {}} />,
        );
        expect(getByText('Terms of Service')).toBeTruthy();
        expect(getByTestId('markdown-body').props.children).toBe('# Welcome\n\nBody text.');
        expect(getByText(/v1\.0\.0/)).toBeTruthy();
    });

    it('passes slug to useLegalDocument', () => {
        mockUseLegalDocument.mockReturnValue({ data: baseDoc, isLoading: false, isError: false, refetch: jest.fn() });
        render(<LegalDocumentSheet visible={true} slug="privacy" onClose={() => {}} />);
        expect(mockUseLegalDocument).toHaveBeenCalledWith('privacy');
    });
});
