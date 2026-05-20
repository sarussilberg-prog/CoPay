import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from '../../components/AppText';
import { RtlLayoutProvider } from '../../hooks/useRtlLayout';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'he' },
    }),
}));

describe('AppText', () => {
    it('aligns Hebrew text to the right by default', () => {
        const { getByText } = render(
            <RtlLayoutProvider>
                <Text>שלום</Text>
            </RtlLayoutProvider>,
        );

        expect(getByText('שלום').props.style).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ textAlign: 'right', writingDirection: 'rtl' }),
            ]),
        );
    });

    it('keeps centered text centered in Hebrew', () => {
        const { getByText } = render(
            <RtlLayoutProvider>
                <Text className="text-center">מרכז</Text>
            </RtlLayoutProvider>,
        );

        expect(getByText('מרכז').props.style).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ textAlign: 'center', writingDirection: 'rtl' }),
            ]),
        );
    });
});
