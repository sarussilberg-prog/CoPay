import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SplitTypeSelector } from '../../components/SplitTypeSelector';

describe('SplitTypeSelector', () => {
    it('renders both options', () => {
        const { getByText } = render(
            <SplitTypeSelector value="equal" onChange={() => { }} />
        );
        expect(getByText('expenses.equalSplit')).toBeTruthy();
        expect(getByText('expenses.unequalSplit')).toBeTruthy();
    });

    it('invokes onChange when switching to equal', () => {
        const onChange = jest.fn();
        const { getByTestId } = render(
            <SplitTypeSelector value="unequal" onChange={onChange} />
        );
        fireEvent.press(getByTestId('split-type-equal'));
        expect(onChange).toHaveBeenCalledWith('equal');
    });

    it('invokes onChange when switching to unequal', () => {
        const onChange = jest.fn();
        const { getByTestId } = render(
            <SplitTypeSelector value="equal" onChange={onChange} />
        );
        fireEvent.press(getByTestId('split-type-unequal'));
        expect(onChange).toHaveBeenCalledWith('unequal');
    });
});
