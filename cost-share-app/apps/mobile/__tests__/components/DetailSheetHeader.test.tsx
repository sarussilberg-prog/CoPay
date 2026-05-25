import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithQuery } from '../helpers/renderWithQuery';
import { DetailSheetHeader } from '../../components/DetailSheetHeader';

describe('DetailSheetHeader', () => {
    it('hides edit/delete until the kebab is pressed', () => {
        const onEdit = jest.fn();
        const onDelete = jest.fn();
        const onClose = jest.fn();

        const { getByTestId, queryByTestId } = renderWithQuery(
            <DetailSheetHeader
                label="SETTLEMENT"
                onClose={onClose}
                onEdit={onEdit}
                onDelete={onDelete}
            />,
        );

        expect(queryByTestId('detail-edit-btn')).toBeNull();
        expect(queryByTestId('detail-delete-btn')).toBeNull();

        fireEvent.press(getByTestId('detail-kebab-btn'));

        fireEvent.press(getByTestId('detail-edit-btn'));
        expect(onEdit).toHaveBeenCalledTimes(1);

        fireEvent.press(getByTestId('detail-kebab-btn'));
        fireEvent.press(getByTestId('detail-delete-btn'));
        expect(onDelete).toHaveBeenCalledTimes(1);
    });

    it('invokes onClose when the close button is pressed', () => {
        const onClose = jest.fn();
        const { getByLabelText } = renderWithQuery(
            <DetailSheetHeader
                label="EXPENSE"
                onClose={onClose}
                onEdit={jest.fn()}
                onDelete={jest.fn()}
            />,
        );
        fireEvent.press(getByLabelText('groups.filters.close'));
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
