import React from 'react';
import { render } from '@testing-library/react-native';
import {
    ActivityItemCard,
    resolveActivityTitle,
} from '../../components/ActivityItemCard';
import type { ActivityEvent, ActivityEventKind } from '@cost-share/shared';

function buildEvent(
    kind: ActivityEventKind,
    overrides: Partial<ActivityEvent> = {},
): ActivityEvent {
    const base: ActivityEvent = {
        id: `evt-${kind}`,
        userId: 'u-recipient',
        kind,
        groupId: 'g-1',
        refId: 'src-1',
        actorUserId: 'u-actor',
        metadata: {},
        createdAt: new Date('2026-05-26T12:00:00Z'),
    };
    return {
        ...base,
        ...overrides,
        metadata: { ...(base.metadata ?? {}), ...(overrides.metadata ?? {}) },
    };
}

const t = (key: string, opts?: Record<string, string>) => {
    if (key === 'activity.notifications.friendRequest') {
        return `Friend request from ${opts?.name}`;
    }
    if (key === 'activity.notifications.friendRequestAccepted') {
        return `Friends with ${opts?.name}`;
    }
    if (key === 'activity.notifications.friendRequestRejected') {
        return `Rejected ${opts?.name}`;
    }
    if (key === 'activity.notifications.groupInvite') {
        return `${opts?.name} added you to ${opts?.group}`;
    }
    if (key === 'activity.notifications.memberJoined') {
        return `${opts?.name} joined ${opts?.group}`;
    }
    if (key === 'activity.notifications.memberLeft') {
        return `${opts?.name} left ${opts?.group}`;
    }
    if (key === 'common.you') return 'You';
    return key;
};

describe('resolveActivityTitle', () => {
    it('returns the expense description from metadata', () => {
        const title = resolveActivityTitle(
            buildEvent('expense_added', { metadata: { description: 'Lunch' } }),
            { actorName: 'Alice', groupName: 'Trip' },
            t as never,
        );
        expect(title).toBe('Lunch');
    });

    it('returns the message body from metadata for messages', () => {
        const title = resolveActivityTitle(
            buildEvent('message_posted', { metadata: { body: 'Hello' } }),
            { actorName: 'Alice', groupName: 'Trip' },
            t as never,
        );
        expect(title).toBe('Hello');
    });

    it('builds notification copy for pending friend requests', () => {
        const title = resolveActivityTitle(
            buildEvent('friend_request_received', { metadata: { status: 'pending' } }),
            { actorName: 'Alice', groupName: '' },
            t as never,
        );
        expect(title).toBe('Friend request from Alice');
    });

    it('builds accepted friend request copy', () => {
        const title = resolveActivityTitle(
            buildEvent('friend_request_received', { metadata: { status: 'accepted' } }),
            { actorName: 'Alice', groupName: '' },
            t as never,
        );
        expect(title).toBe('Friends with Alice');
    });

    it('builds rejected friend request copy', () => {
        const title = resolveActivityTitle(
            buildEvent('friend_request_received', { metadata: { status: 'rejected' } }),
            { actorName: 'Alice', groupName: '' },
            t as never,
        );
        expect(title).toBe('Rejected Alice');
    });

    it('builds group invite copy', () => {
        const title = resolveActivityTitle(
            buildEvent('group_added'),
            { actorName: 'Alice', groupName: 'Trip' },
            t as never,
        );
        expect(title).toBe('Alice added you to Trip');
    });

    it('uses the new member name when supplied for joins', () => {
        const title = resolveActivityTitle(
            buildEvent('group_member_joined'),
            { actorName: 'Alice', groupName: 'Trip', newMemberName: 'Bob' },
            t as never,
        );
        expect(title).toBe('Bob joined Trip');
    });

    it('builds group_removed copy', () => {
        const title = resolveActivityTitle(
            buildEvent('group_removed'),
            { actorName: 'Alice', groupName: 'Trip' },
            t as never,
        );
        expect(title).toBe('Alice left Trip');
    });
});

describe('ActivityItemCard', () => {
    it('renders group name on its own line and amount for expenses', () => {
        const { getByText, getByTestId } = render(
            <ActivityItemCard
                event={buildEvent('expense_added', {
                    metadata: { description: 'Coffee', amount: 5.5, currency: 'USD' },
                })}
                title="Coffee"
                meta="Alice · now"
                groupName="Trip"
                testID="card"
            />,
        );
        expect(getByText('Trip')).toBeTruthy();
        expect(getByText(/\$5\.50/)).toBeTruthy();
        expect(getByTestId('activity-card-amount')).toBeTruthy();
    });

    it('renders amount for settlements', () => {
        const { getByTestId } = render(
            <ActivityItemCard
                event={buildEvent('settlement_added', {
                    metadata: { amount: 20, currency: 'USD' },
                })}
                title="You paid Bob"
                meta="now"
                testID="card"
            />,
        );
        expect(getByTestId('activity-card-amount')).toBeTruthy();
    });

    it('omits amount for messages', () => {
        const { queryByTestId } = render(
            <ActivityItemCard
                event={buildEvent('message_posted', {
                    metadata: { body: 'Hello' },
                })}
                title="Hello"
                meta="Alice · now"
                testID="card"
            />,
        );
        expect(queryByTestId('activity-card-amount')).toBeNull();
    });

    it('omits amount for friend requests', () => {
        const { queryByTestId } = render(
            <ActivityItemCard
                event={buildEvent('friend_request_received', {
                    metadata: { status: 'pending' },
                })}
                friendRequestStatus="pending"
                title="Friend request from Alice"
                meta="now"
                testID="card"
            />,
        );
        expect(queryByTestId('activity-card-amount')).toBeNull();
    });

    it('omits amount for group_added', () => {
        const { queryByTestId } = render(
            <ActivityItemCard
                event={buildEvent('group_added')}
                title="Alice added you"
                meta="now"
                testID="card"
            />,
        );
        expect(queryByTestId('activity-card-amount')).toBeNull();
    });

    it('omits amount for group_member_joined', () => {
        const { queryByTestId } = render(
            <ActivityItemCard
                event={buildEvent('group_member_joined')}
                title="Bob joined"
                meta="now"
                testID="card"
            />,
        );
        expect(queryByTestId('activity-card-amount')).toBeNull();
    });

    it('omits amount for group_removed', () => {
        const { queryByTestId } = render(
            <ActivityItemCard
                event={buildEvent('group_removed')}
                title="Alice left"
                meta="now"
                testID="card"
            />,
        );
        expect(queryByTestId('activity-card-amount')).toBeNull();
    });
});
