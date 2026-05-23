import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { MemberSelector } from '../../components/MemberSelector';
import type { User } from '@cost-share/shared';

const users: User[] = [
    {
        id: 'u1',
        email: 'a@x.com',
        name: 'Alice',
        inviteToken: 'alice123456',
        defaultCurrency: 'USD',
        language: 'en',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: 'u2',
        email: 'b@x.com',
        name: 'Bob',
        inviteToken: 'bob1234567',
        defaultCurrency: 'USD',
        language: 'en',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
    },
];

describe('MemberSelector', () => {
    it('renders all members', () => {
        const { getByText } = render(
            <MemberSelector members={users} selectedIds={[]} onToggle={() => { }} />
        );
        expect(getByText('Alice')).toBeTruthy();
        expect(getByText('Bob')).toBeTruthy();
    });

    it('invokes onToggle with the user id when a member is pressed', () => {
        const onToggle = jest.fn();
        const { getByText } = render(
            <MemberSelector members={users} selectedIds={[]} onToggle={onToggle} />
        );
        fireEvent.press(getByText('Alice'));
        expect(onToggle).toHaveBeenCalledWith('u1');
    });

    it('renders an empty message when no members provided', () => {
        const { getByText } = render(
            <MemberSelector members={[]} selectedIds={[]} onToggle={() => { }} />
        );
        expect(getByText('groups.noMembers')).toBeTruthy();
    });

    it('shows a checkmark next to selected members', () => {
        const { getAllByText } = render(
            <MemberSelector
                members={users}
                selectedIds={['u1']}
                onToggle={() => { }}
            />
        );
        // The "✓" indicator is rendered for selected items
        expect(getAllByText('✓').length).toBeGreaterThan(0);
    });
});
