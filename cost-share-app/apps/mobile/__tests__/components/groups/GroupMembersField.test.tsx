import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import type { User } from '@cost-share/shared';
import { GroupMembersField } from '../../../components/groups/GroupMembersField';

const u = (id: string, name: string): User =>
    ({
        id,
        name,
        email: `${id}@x.com`,
        inviteToken: `${id}tok12345`,
        defaultCurrency: 'ILS',
        language: 'he',
        isActive: true,
        isAdmin: false,
        createdAt: new Date(),
        updatedAt: new Date(),
    } as User);

describe('GroupMembersField', () => {
    it('renders an add button that calls onAddMembers', () => {
        const onAdd = jest.fn();
        const { getByTestId } = render(
            <GroupMembersField
                displayMembers={[u('u1', 'Alice')]}
                currentUserId="u1"
                currentUser={u('u1', 'Alice')}
                onAddMembers={onAdd}
                onRemoveMember={jest.fn()}
            />,
        );
        fireEvent.press(getByTestId('group-form-add-member'));
        expect(onAdd).toHaveBeenCalledTimes(1);
    });

    it('shows a remove control for non-self members and calls onRemoveMember', () => {
        const onRemove = jest.fn();
        const bob = u('u2', 'Bob');
        const { getByTestId } = render(
            <GroupMembersField
                displayMembers={[u('u1', 'Alice'), bob]}
                currentUserId="u1"
                currentUser={u('u1', 'Alice')}
                onAddMembers={jest.fn()}
                onRemoveMember={onRemove}
            />,
        );
        fireEvent.press(getByTestId('group-form-member-remove-u2'));
        expect(onRemove).toHaveBeenCalledWith(bob);
    });
});
