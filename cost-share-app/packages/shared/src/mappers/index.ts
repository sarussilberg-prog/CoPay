import { DEFAULT_CURRENCY } from '../constants';
import {
    User,
    Group,
    GroupMember,
    GroupMemberLite,
    GroupWithMembers,
    GroupMessage,
    Expense,
    ExpenseSplit,
    Settlement,
} from '../types';

type Row = Record<string, unknown>;

const toDate = (v: unknown): Date =>
    v instanceof Date ? v : new Date(String(v));

export const profileFromRow = (r: Row): User => ({
    id: r.id as string,
    name: r.name as string,
    email: (r.email as string) ?? undefined,
    avatarUrl: (r.avatar_url as string) ?? undefined,
    phone: (r.phone as string) ?? undefined,
    inviteToken: (r.invite_token as string) ?? '',
    defaultCurrency: (r.default_currency as string) || DEFAULT_CURRENCY,
    language: r.language as User['language'],
    createdAt: toDate(r.created_at),
    updatedAt: toDate(r.updated_at),
});

export const groupFromRow = (r: Row): Group => ({
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string) ?? undefined,
    imageUrl: (r.image_url as string) ?? undefined,
    groupType: r.group_type as Group['groupType'],
    defaultCurrency: r.default_currency as string,
    inviteToken: (r.invite_token as string) ?? '',
    createdBy: r.created_by as string,
    isActive: r.is_active as boolean,
    createdAt: toDate(r.created_at),
    updatedAt: toDate(r.updated_at),
});

export const groupMemberFromRow = (r: Row): GroupMember => ({
    id: r.id as string,
    groupId: r.group_id as string,
    userId: r.user_id as string,
    joinedAt: toDate(r.joined_at),
    leftAt: r.left_at ? toDate(r.left_at) : undefined,
    isActive: r.is_active as boolean,
});

type MemberJoinRow = {
    user_id: unknown;
    is_active?: unknown;
    profiles?: { id?: unknown; name?: unknown; avatar_url?: unknown } | null;
};

export const groupWithMembersFromRow = (
    r: Row & { group_members?: MemberJoinRow[] | null },
): GroupWithMembers => {
    const memberRows = Array.isArray(r.group_members) ? r.group_members : [];
    const members: GroupMemberLite[] = memberRows
        .filter(m => m.is_active === undefined || m.is_active === true)
        .map(m => ({
            userId: String(m.user_id ?? m.profiles?.id ?? ''),
            displayName: String(m.profiles?.name ?? ''),
            avatarUrl: (m.profiles?.avatar_url as string | undefined) ?? undefined,
        }))
        .filter(m => m.userId.length > 0);
    return {
        ...groupFromRow(r),
        members,
        isArchivedByMe: false,
        isAutoArchived: false,
    };
};

export const expenseFromRow = (r: Row): Expense => ({
    id: r.id as string,
    groupId: r.group_id as string,
    description: r.description as string,
    amount: Number(r.amount),
    currency: r.currency as string,
    category: (r.category as Expense['category']) ?? undefined,
    expenseDate: toDate(r.expense_date),
    receiptUrl: (r.receipt_url as string) ?? undefined,
    paidBy: r.paid_by as string,
    createdBy: r.created_by as string,
    isDeleted: r.is_deleted as boolean,
    createdAt: toDate(r.created_at),
    updatedAt: toDate(r.updated_at),
});

export const expenseSplitFromRow = (r: Row): ExpenseSplit => ({
    id: r.id as string,
    expenseId: r.expense_id as string,
    userId: r.user_id as string,
    amount: Number(r.amount),
    createdAt: toDate(r.created_at),
});

export const groupMessageFromRow = (r: Row): GroupMessage => ({
    id: r.id as string,
    groupId: r.group_id as string,
    userId: r.user_id as string,
    body: r.body as string,
    editedAt: r.edited_at ? toDate(r.edited_at) : null,
    isDeleted: (r.is_deleted as boolean) ?? false,
    createdAt: toDate(r.created_at),
    updatedAt: toDate(r.updated_at),
});

export const settlementFromRow = (r: Row): Settlement => ({
    id: r.id as string,
    groupId: r.group_id as string,
    fromUserId: r.from_user_id as string,
    toUserId: r.to_user_id as string,
    amount: Number(r.amount),
    currency: r.currency as string,
    settlementDate: toDate(r.settlement_date),
    paymentMethod: (r.payment_method as Settlement['paymentMethod']) ?? undefined,
    createdBy: r.created_by as string,
    createdAt: toDate(r.created_at),
    updatedAt: r.updated_at ? toDate(r.updated_at) : toDate(r.created_at),
    deletedAt: r.deleted_at ? toDate(r.deleted_at) : null,
});
