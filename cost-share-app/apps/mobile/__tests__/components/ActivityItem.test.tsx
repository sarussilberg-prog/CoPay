import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ActivityItem } from '../../components/ActivityItem';
import type {
    ActivityEvent,
    ActivityEventKind,
    GroupMemberLite,
} from '@cost-share/shared';

function buildEvent(
    kind: ActivityEventKind,
    overrides: Partial<ActivityEvent> = {},
): ActivityEvent {
    const base: ActivityEvent = {
        id: `a-${kind}`,
        userId: 'u-me',
        kind,
        groupId: 'g1',
        refId: 'src-1',
        actorUserId: 'u1',
        metadata: {},
        createdAt: new Date('2026-05-01T10:00:00Z'),
    };
    return {
        ...base,
        ...overrides,
        metadata: { ...(base.metadata ?? {}), ...(overrides.metadata ?? {}) },
    };
}

const actor: GroupMemberLite = {
    userId: 'u1',
    displayName: 'Alice',
    isActive: true,
};

describe('ActivityItem', () => {
    it('renders the description and actor name in meta for expenses', () => {
        const event = buildEvent('expense_added', {
            id: 'e1',
            metadata: { description: 'Coffee', amount: 5.5, currency: 'USD' },
        });
        const { getByText } = render(
            <ActivityItem
                event={event}
                actor={actor}
                currentUserId="u-me"
                groupName="Trip"
            />,
        );
        expect(getByText('Coffee')).toBeTruthy();
        expect(getByText(/Alice/)).toBeTruthy();
    });

    it('renders the amount with currency for expenses', () => {
        const event = buildEvent('expense_added', {
            id: 'e1',
            metadata: { description: 'Coffee', amount: 5.5, currency: 'USD' },
        });
        const { getByText, getByTestId } = render(
            <ActivityItem event={event} actor={actor} currentUserId="u-me" />,
        );
        expect(getByText(/\$5\.50/)).toBeTruthy();
        expect(getByTestId('activity-card-amount')).toBeTruthy();
    });

    it('renders the actor avatar on the leading edge', () => {
        const event = buildEvent('expense_added', {
            id: 'e1',
            metadata: { description: 'Coffee', amount: 5.5, currency: 'USD' },
        });
        const { getByTestId } = render(
            <ActivityItem event={event} actor={actor} currentUserId="u-me" />,
        );
        expect(getByTestId('activity-avatar')).toBeTruthy();
        expect(getByTestId('activity-card-thumbnail-icon')).toBeTruthy();
    });

    it('includes group name in the card when provided', () => {
        const event = buildEvent('expense_added', {
            id: 'e1',
            metadata: { description: 'Coffee', amount: 5.5, currency: 'USD' },
        });
        const { getByText } = render(
            <ActivityItem
                event={event}
                actor={actor}
                currentUserId="u-me"
                groupName="Weekend trip"
            />,
        );
        expect(getByText(/Weekend trip/)).toBeTruthy();
    });

    it('renders profile image when avatar url is provided', () => {
        const event = buildEvent('expense_added', {
            id: 'e1',
            metadata: { description: 'Coffee', amount: 5.5, currency: 'USD' },
        });
        const { getByTestId } = render(
            <ActivityItem
                event={event}
                actor={{ ...actor, avatarUrl: 'https://example.com/alice.png' }}
                currentUserId="u-me"
            />,
        );
        expect(getByTestId('activity-avatar-image')).toBeTruthy();
    });

    it('calls onPress with the event when the card is pressed', () => {
        const event = buildEvent('expense_added', {
            id: 'e1',
            metadata: { description: 'Coffee', amount: 5.5, currency: 'USD' },
        });
        const onPress = jest.fn();
        const { getByTestId } = render(
            <ActivityItem
                event={event}
                actor={actor}
                currentUserId="u-me"
                onPress={onPress}
            />,
        );
        fireEvent.press(getByTestId('activity-card-e1'));
        expect(onPress).toHaveBeenCalledWith(event);
    });

    it('renders message body without amount', () => {
        const event = buildEvent('message_posted', {
            id: 'm1',
            metadata: { body: 'See you tonight' },
        });
        const { getByText, queryByText, getByTestId } = render(
            <ActivityItem
                event={event}
                actor={actor}
                currentUserId="u-me"
                onPress={jest.fn()}
            />,
        );
        expect(getByText('See you tonight')).toBeTruthy();
        expect(getByTestId('activity-avatar')).toBeTruthy();
        expect(queryByText(/USD/)).toBeNull();
    });

    it('renders friend request title from metadata.status', () => {
        const event = buildEvent('friend_request_received', {
            id: 'fr1',
            metadata: { status: 'accepted' },
        });
        const { getByTestId } = render(
            <ActivityItem event={event} actor={actor} currentUserId="u-me" />,
        );
        expect(getByTestId('activity-card-fr1')).toBeTruthy();
    });

    it('renders group_added without amount', () => {
        const event = buildEvent('group_added', { id: 'ga1' });
        const { getByTestId, queryByTestId } = render(
            <ActivityItem
                event={event}
                actor={actor}
                currentUserId="u-me"
                groupName="Trip"
            />,
        );
        expect(getByTestId('activity-card-ga1')).toBeTruthy();
        expect(queryByTestId('activity-card-amount')).toBeNull();
    });

    it('renders group_member_joined card without amount', () => {
        const event = buildEvent('group_member_joined', { id: 'mj1' });
        const newMember: GroupMemberLite = {
            userId: 'u2',
            displayName: 'Bob',
            isActive: true,
        };
        const { getByTestId, queryByTestId } = render(
            <ActivityItem
                event={event}
                actor={actor}
                newMember={newMember}
                currentUserId="u-me"
                groupName="Trip"
            />,
        );
        expect(getByTestId('activity-card-mj1')).toBeTruthy();
        expect(queryByTestId('activity-card-amount')).toBeNull();
    });

    it('group_removed is not pressable even when onPress is provided', () => {
        const event = buildEvent('group_removed', { id: 'gr1' });
        const onPress = jest.fn();
        const { getByTestId } = render(
            <ActivityItem
                event={event}
                actor={actor}
                currentUserId="u-me"
                groupName="Trip"
                onPress={onPress}
            />,
        );
        // Tapping the card should NOT call onPress because group_removed
        // is rendered as a plain View (no TouchableOpacity).
        fireEvent.press(getByTestId('activity-card-gr1'));
        expect(onPress).not.toHaveBeenCalled();
    });

    it('renders settlement amount on its own line', () => {
        const event = buildEvent('settlement_added', {
            id: 's1',
            metadata: {
                from_user_id: 'u-me',
                to_user_id: 'u1',
                amount: 20,
                currency: 'USD',
            },
        });
        const { getByTestId } = render(
            <ActivityItem event={event} actor={actor} currentUserId="u-me" />,
        );
        expect(getByTestId('activity-card-s1')).toBeTruthy();
        expect(getByTestId('activity-card-amount')).toBeTruthy();
    });
});
