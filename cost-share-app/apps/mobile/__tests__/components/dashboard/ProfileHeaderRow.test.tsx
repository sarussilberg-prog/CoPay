import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ProfileHeaderRow } from '../../../components/dashboard/ProfileHeaderRow';

describe('ProfileHeaderRow', () => {
    it('renders name, email and triggers onEditPress', () => {
        const onEdit = jest.fn();
        const { getByText, getByTestId } = render(
            <ProfileHeaderRow name="Alice" email="a@x.com" avatarUrl={undefined} onEditPress={onEdit} />,
        );
        expect(getByText('Alice')).toBeTruthy();
        expect(getByText('a@x.com')).toBeTruthy();
        fireEvent.press(getByTestId('profile-header-edit'));
        expect(onEdit).toHaveBeenCalled();
    });
});
