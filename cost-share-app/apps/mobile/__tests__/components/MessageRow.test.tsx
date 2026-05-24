import React from 'react';
import { render } from '@testing-library/react-native';
import { MessageRow } from '../../components/MessageRow';
import type { GroupMessage } from '@cost-share/shared';

const base: GroupMessage = {
    id: 'm1',
    groupId: 'g1',
    userId: 'me',
    body: 'Hello world',
    editedAt: null,
    isDeleted: false,
    createdAt: new Date(Date.now() - 60_000),
    updatedAt: new Date(),
};

describe('MessageRow', () => {
    it('renders the body and sender name for others', () => {
        const { getAllByText, getByText, getByTestId } = render(
            <MessageRow
                message={base}
                senderName="Avi"
                isMine={false}
                onEdit={() => {}}
                onDelete={() => {}}
            />,
        );
        // "Avi" appears in both the sender label and the meta line.
        expect(getAllByText(/Avi/).length).toBeGreaterThan(0);
        expect(getByText('Hello world')).toBeTruthy();
        expect(getByTestId('message-timestamp')).toBeTruthy();
    });

    it('still renders the timestamp for own messages', () => {
        const { getByTestId } = render(
            <MessageRow
                message={base}
                senderName="Avi"
                isMine
                onEdit={() => {}}
                onDelete={() => {}}
            />,
        );
        expect(getByTestId('message-timestamp')).toBeTruthy();
    });

    it('shows the edited tag when editedAt is set', () => {
        const edited: GroupMessage = { ...base, editedAt: new Date() };
        const { getByTestId } = render(
            <MessageRow
                message={edited}
                senderName="Avi"
                isMine
                onEdit={() => {}}
                onDelete={() => {}}
            />,
        );
        expect(getByTestId('message-edited-tag')).toBeTruthy();
    });

    it('hides the edited tag when editedAt is null', () => {
        const { queryByTestId } = render(
            <MessageRow
                message={base}
                senderName="Avi"
                isMine
                onEdit={() => {}}
                onDelete={() => {}}
            />,
        );
        expect(queryByTestId('message-edited-tag')).toBeNull();
    });
});
