/**
 * Shared TypeScript types for the cost-sharing application
 * These types match the DATABASE_ARCHITECTURE.md schema
 * 
 * Sections:
 * 1. Core Entities (Database Tables)
 * 2. View Types (Computed Data)
 * 3. Enums & Constants
 * 4. DTOs (Data Transfer Objects)
 * 5. API Response Wrappers
 */

// ============================================
// 1. CORE ENTITIES (Database Tables)
// ============================================

/**
 * User entity - User profile information
 * Maps to: profiles table
 * Integrates with Supabase Auth (auth.users)
 */
export interface User {
    id: string;  // UUID - references auth.users(id)
    name: string;
    email?: string;
    avatarUrl?: string;
    phone?: string;
    inviteToken: string;  // 10-char URL-safe slug; the value used to build https://kupa.pro/i/<token>
    defaultCurrency: string;  // 'USD', 'ILS', 'EUR', etc.
    language: Language;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Group entity - Expense-sharing group
 * Maps to: groups table
 */
export interface Group {
    id: string;  // UUID
    name: string;
    description?: string;
    imageUrl?: string;
    groupType: GroupType;
    defaultCurrency: string;
    inviteToken: string;  // 10-char URL-safe slug; the value used to build https://kupa.pro/g/<token>
    createdBy: string;  // Profile ID
    isActive: boolean;  // Soft delete flag
    createdAt: Date;
    updatedAt: Date;
}

/**
 * GroupMember entity - Junction table for many-to-many relationship
 * Maps to: group_members table
 */
export interface GroupMember {
    id: string;  // UUID
    groupId: string;
    userId: string;  // Profile ID
    joinedAt: Date;
    leftAt?: Date;  // NULL if still active
    isActive: boolean;
}

/**
 * Expense entity - Shared expense
 * Maps to: expenses table
 */
export interface Expense {
    id: string;  // UUID
    groupId: string;
    description: string;
    amount: number;  // DECIMAL(12,2) - precise monetary value
    currency: string;
    category?: ExpenseCategory;
    expenseDate: Date;
    receiptUrl?: string;
    paidBy: string;  // Profile ID - who paid
    createdBy: string;  // Profile ID - who recorded
    isDeleted: boolean;  // Soft delete flag
    createdAt: Date;
    updatedAt: Date;
}

/**
 * ExpenseSplit entity - How an expense is split among participants
 * Maps to: expense_splits table
 */
export interface ExpenseSplit {
    id: string;  // UUID
    expenseId: string;
    userId: string;  // Profile ID
    amount: number;  // DECIMAL(12,2) - amount owed by this user
    createdAt: Date;
}

/**
 * Settlement entity - Debt payment between users
 * Maps to: settlements table
 */
export interface Settlement {
    id: string;  // UUID
    groupId: string;
    fromUserId: string;  // Profile ID - who is paying
    toUserId: string;  // Profile ID - who receives
    amount: number;  // DECIMAL(12,2)
    currency: string;
    settlementDate: Date;
    paymentMethod?: PaymentMethod;
    createdBy: string;  // Profile ID
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
}

/** One row in the Settle Up list — a pairwise net debt within a group, per currency. */
export interface PairwiseDebt {
    fromUserId: string;  // Debtor
    toUserId: string;    // Creditor
    currency: string;
    amount: number;      // Always > 0
}

// ============================================
// 2. VIEW TYPES (Computed Data)
// ============================================

/**
 * UserBalance - Calculated balance for a user in a group
 * Implements: user_balances_view logic
 */
export interface UserBalance {
    groupId: string;
    userId: string;
    currency: string;
    totalPaid: number;  // What user paid
    totalOwed: number;  // What user owes (from splits)
    totalSettledPaid: number;  // Settlements paid by user
    totalSettledReceived: number;  // Settlements received by user
    netBalance: number;  // positive = owed to user, negative = user owes
}

/**
 * GroupSummary - Summary statistics for a group
 * Implements: group_summary_view logic
 */
export interface GroupSummary {
    groupId: string;
    name: string;
    groupType: GroupType;
    defaultCurrency: string;
    memberCount: number;
    expenseCount: number;
    totalSpent: number;
    lastExpenseDate?: Date;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * DebtSummary - Simplified debt between two users
 * Used for "who owes whom" calculations
 */
export interface DebtSummary {
    fromUserId: string;
    fromUserName: string;
    toUserId: string;
    toUserName: string;
    amount: number;
    currency: string;
}

/**
 * Result of debt simplification — list of transfers + metadata about
 * how the result was computed.
 *
 * - `algorithm: 'exact'` means the transaction count is provably minimal.
 * - `algorithm: 'greedy'` means a Splitwise-style heuristic was used
 *   (small groups always get 'exact'; very large groups get 'greedy').
 */
export interface SimplifiedDebtsResult {
    debts: DebtSummary[];
    transactionCount: number;
    algorithm: 'exact' | 'greedy';
}

/**
 * UserExpenseView - Expense with user-specific details
 * Implements: user_expenses_view logic
 */
export interface UserExpenseView {
    expenseId: string;
    groupId: string;
    groupName: string;
    description: string;
    totalAmount: number;
    currency: string;
    category?: ExpenseCategory;
    expenseDate: Date;
    paidBy: string;
    payerName: string;
    userId: string;
    userName: string;
    userOwedAmount: number;
    userPaid: boolean;  // Did this user pay the expense?
    createdAt: Date;
}

/**
 * RecentActivity - Combined feed of expenses, settlements, and group messages
 * Implements: cross-group activity tab (REQ-ACT-01)
 */
export interface RecentActivity {
    id: string;
    activityType: 'expense' | 'settlement' | 'message';
    groupId: string;
    description: string;
    amount: number;
    currency: string;
    userId: string;
    userName: string;
    userAvatarUrl?: string;
    activityDate: Date;
    createdAt: Date;
}

// ============================================
// 3. ENUMS & CONSTANTS
// ============================================

/**
 * Group types for categorization
 */
export type GroupType =
    | 'trip'
    | 'home'
    | 'couple'
    | 'general'
    | 'work'
    | 'event'
    | 'friends'
    | 'other';

/**
 * Expense categories
 */
export type ExpenseCategory =
    | 'food'
    | 'transport'
    | 'accommodation'
    | 'utilities'
    | 'entertainment'
    | 'shopping'
    | 'healthcare'
    | 'other';

/**
 * Payment methods for settlements
 */
export type PaymentMethod =
    | 'cash'
    | 'bank_transfer'
    | 'venmo'
    | 'paypal'
    | 'credit_card'
    | 'other';

/**
 * Language options for i18n
 */
export type Language = 'en' | 'he';

/**
 * Currency codes (ISO 4217)
 */
export type Currency = 'USD' | 'ILS' | 'EUR' | 'GBP' | 'JPY';

// ============================================
// 4. DTOs (Data Transfer Objects)
// ============================================

/**
 * Create Expense DTO
 */
export interface CreateExpenseDto {
    groupId: string;
    description: string;
    amount: number;
    currency: string;
    category?: ExpenseCategory;
    expenseDate?: Date;  // Defaults to today
    paidBy: string;  // Profile ID
    splits: ExpenseSplitInput[];  // How to split the expense
    receiptUrl?: string;
}

/**
 * Expense split input for creating expenses
 */
export interface ExpenseSplitInput {
    userId: string;
    amount?: number;  // Optional - if omitted, split equally
}

/**
 * Update Expense DTO
 */
export interface UpdateExpenseDto {
    description?: string;
    amount?: number;
    currency?: string;
    category?: ExpenseCategory;
    expenseDate?: Date;
    receiptUrl?: string;
    splits?: ExpenseSplitInput[];
}

/**
 * Create Settlement DTO
 */
export interface CreateSettlementDto {
    groupId: string;
    fromUserId: string;  // Who is paying
    toUserId: string;  // Who receives
    amount: number;
    currency: string;
    settlementDate?: Date;  // Defaults to today
    paymentMethod?: PaymentMethod;
}

/**
 * Update Settlement DTO — Settle Up v1 form fields only.
 */
export interface UpdateSettlementDto {
    fromUserId?: string;
    toUserId?: string;
    amount?: number;
    currency?: string;
}

/**
 * Create Group DTO
 */
export interface CreateGroupDto {
    name: string;
    description?: string;
    groupType?: GroupType;  // Defaults to 'general'
    defaultCurrency?: string;  // Defaults to 'ILS'
    memberIds: string[];  // Initial members (creator auto-included)
    imageUrl?: string;
}

/**
 * Update Group DTO
 */
export interface UpdateGroupDto {
    name?: string;
    description?: string;
    groupType?: GroupType;
    defaultCurrency?: string;
    imageUrl?: string;
}

/**
 * Add Group Member DTO
 */
export interface AddGroupMemberDto {
    groupId: string;
    userId: string;
}

/**
 * Update Profile DTO
 */
export interface UpdateProfileDto {
    name?: string;
    email?: string;
    phone?: string;
    avatarUrl?: string;
    defaultCurrency?: string;
    language?: Language;
}

/**
 * Create Profile DTO (for initial setup)
 */
export interface CreateProfileDto {
    id: string;  // From auth.users
    name: string;
    email?: string;
    avatarUrl?: string;
    phone?: string;
    defaultCurrency?: string;
    language?: Language;
}

// ============================================
// 5. API RESPONSE WRAPPERS
// ============================================

/**
 * API Response wrapper for consistent response format
 */
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
    success: boolean;
    data: T[];
    pagination: {
        page: number;
        pageSize: number;
        totalItems: number;
        totalPages: number;
    };
    error?: string;
}

/**
 * User preferences
 */
export interface UserPreferences {
    language: Language;
    currency: string;
    notifications: boolean;
}

// ============================================
// 6. GROUPS LIST + BALANCE SUMMARY
// ============================================

/** Minimal member shape for rendering inside a group card. */
export interface GroupMemberLite {
    userId: string;
    displayName: string;
    avatarUrl?: string;
}

/** Group enriched with its active members. */
export interface GroupWithMembers extends Group {
    members: GroupMemberLite[];
    /** True when the caller has manually archived this group (Type 2). */
    isArchivedByMe: boolean;
    /** True when the group is auto-archived for everyone (Type 1). */
    isAutoArchived: boolean;
}

/** One row of the per-currency balance summary for the current user. */
export interface BalanceSummaryRow {
    currency: string;
    owed: number; // amount others owe me (>= 0)
    owe: number;  // amount I owe others (>= 0)
    net: number;  // owed - owe
}

/** Per-group net balance for the current user. Positive = I'm owed; negative = I owe. */
export interface GroupBalance {
    groupId: string;
    currency: string;
    net: number;
}

/** Payload returned by supabase.rpc('get_user_balance_summary'). */
export interface BalanceSummaryResponse {
    summary: BalanceSummaryRow[];
    byGroup: GroupBalance[];
}

// ============================================
// 6b. GROUP MESSAGES + UNIFIED FEED
// ============================================

/** Standalone text message posted into a group's feed. */
export interface GroupMessage {
    id: string;
    groupId: string;
    userId: string;
    body: string;
    editedAt: Date | null;
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
}

/** Expense with its splits embedded for one-round-trip rendering. */
export interface ExpenseWithSplits extends Expense {
    splits: ExpenseSplit[];
}

/** Client-derived: expense + current user's delta (lent / borrowed / settled). */
export interface ExpenseWithDelta extends ExpenseWithSplits {
    myDelta: number;
    myDeltaState: 'lent' | 'borrowed' | 'settled';
}

/** A single item in the GroupDetailScreen feed — expense, message, or settlement. */
export type FeedItem =
    | { kind: 'expense'; sortAt: Date; expense: ExpenseWithDelta }
    | { kind: 'message'; sortAt: Date; message: GroupMessage }
    | { kind: 'settlement'; sortAt: Date; settlement: Settlement };

// ============================================
// 7. PROFILE DASHBOARD (RPC payloads)
// ============================================

/**
 * Profile dashboard payload — supabase.rpc('get_user_dashboard')
 * Headlines are null when balances span multiple currencies (server-side).
 * Profile screen may fill totals client-side via FX conversion (REQ-PROF-07).
 */
export interface BalanceSummary {
    totalOwed: number | null;
    totalOwedToUser: number | null;
    defaultCurrency: string;
    byCurrency: {
        currency: string;
        owed: number;
        owedToUser: number;
    }[];
}

/** Per-currency net with a friend (positive = friend owes you). */
export interface FriendBalanceByCurrency {
    currency: string;
    netBalance: number;
}

/** A peer with whom the user shares groups and has a non-zero net balance. */
export interface FriendBalance {
    userId: string;
    name: string;
    avatarUrl?: string;
    sharedGroupIds: string[];
    /** Balances per group currency from `get_user_dashboard`. */
    byCurrency: FriendBalanceByCurrency[];
    /** @deprecated Legacy RPC fields; prefer `byCurrency`. */
    netBalance?: number;
    currency?: string;
}

/** Group-count statistics shown on the profile dashboard. */
export interface DashboardStats {
    closedGroupsCount: number;
    activeGroupsCount: number;
}

/** Full payload returned by supabase.rpc('get_user_dashboard'). */
export interface UserDashboard {
    balanceSummary: BalanceSummary;
    stats: DashboardStats;
    friends: FriendBalance[];
}

// ============================================
// LEGACY TYPES (for backward compatibility)
// ============================================

/**
 * @deprecated Use User instead
 */
export type Profile = User;

/**
 * An invite link that arrived before the user was authenticated.
 * The redemption handler will pick it up after sign-in.
 */
export type PendingInvite =
    | { kind: 'friend'; token: string }
    | { kind: 'group'; token: string };
