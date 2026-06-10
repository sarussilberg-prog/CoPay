import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { OnboardingStepCard } from '../../../components/groups/OnboardingStepCard';

const base = {
    index: 1,
    title: 'שם הקופה',
    complete: false,
    expanded: false,
    onToggle: jest.fn(),
    children: <Text>BODY</Text>,
    testID: 'step-name',
};

describe('OnboardingStepCard', () => {
    it('hides the body when collapsed and shows it when expanded', () => {
        const { queryByText, rerender } = render(
            <OnboardingStepCard {...base} expanded={false} />,
        );
        expect(queryByText('BODY')).toBeNull();
        rerender(<OnboardingStepCard {...base} expanded={true} />);
        expect(queryByText('BODY')).toBeTruthy();
    });

    it('calls onToggle when the header is pressed', () => {
        const onToggle = jest.fn();
        const { getByTestId } = render(
            <OnboardingStepCard {...base} onToggle={onToggle} />,
        );
        fireEvent.press(getByTestId('step-name-header'));
        expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('shows the index when incomplete and a check when complete', () => {
        const { getByText, queryByTestId, rerender } = render(
            <OnboardingStepCard {...base} index={2} complete={false} />,
        );
        expect(getByText('2')).toBeTruthy();
        expect(queryByTestId('step-name-check')).toBeNull();
        rerender(<OnboardingStepCard {...base} index={2} complete={true} />);
        expect(queryByTestId('step-name-check')).toBeTruthy();
    });

    it('shows the summary only while collapsed', () => {
        const { queryByTestId, rerender } = render(
            <OnboardingStepCard {...base} summary="טיול" expanded={false} />,
        );
        expect(queryByTestId('step-name-summary')).toBeTruthy();
        rerender(<OnboardingStepCard {...base} summary="טיול" expanded={true} />);
        expect(queryByTestId('step-name-summary')).toBeNull();
    });

    it('renders the optional label when provided', () => {
        const { getByText } = render(
            <OnboardingStepCard {...base} optionalLabel="אופציונלי" />,
        );
        expect(getByText('אופציונלי')).toBeTruthy();
    });

    it('exposes an accessibility label with the number, title and summary', () => {
        const { getByTestId } = render(
            <OnboardingStepCard {...base} index={3} title="מטבע" summary="ILS" />,
        );
        const label = getByTestId('step-name-header').props.accessibilityLabel;
        expect(label).toContain('3');
        expect(label).toContain('מטבע');
        expect(label).toContain('ILS');
    });
});
