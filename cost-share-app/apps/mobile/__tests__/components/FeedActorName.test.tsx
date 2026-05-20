import React from 'react';
import { render } from '@testing-library/react-native';
import { FeedActorName } from '../../components/FeedActorName';
import { useAppStore } from '../../store';

describe('FeedActorName', () => {
    it('aligns English names to the right in Hebrew UI', () => {
        useAppStore.setState({ language: 'he' });
        const { getByText } = render(<FeedActorName name="Bob" />);
        expect(getByText('Bob').props.style).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ textAlign: 'right' }),
            ]),
        );
    });

    it('aligns Hebrew names to the left in English UI', () => {
        useAppStore.setState({ language: 'en' });
        const { getByText } = render(<FeedActorName name="דני" />);
        expect(getByText('דני').props.style).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ textAlign: 'left' }),
            ]),
        );
    });
});
