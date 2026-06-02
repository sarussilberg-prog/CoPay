import { create } from 'zustand';
import { Session } from '@supabase/supabase-js';
import {
    User,
    ExpenseWithSplits,
    GroupWithMembers,
    GroupMessage,
    BalanceSummaryRow,
    GroupBalance,
    BalanceSummaryResponse,
    PendingInvite,
} from '@cost-share/shared';

interface AppState {
    // Auth state
    session: Session | null;
    setSession: (session: Session | null) => void;

    // User state
    currentUser: User | null;
    setCurrentUser: (user: User | null) => void;

    // Groups state
    groups: GroupWithMembers[];
    setGroups: (groups: GroupWithMembers[]) => void;
    addGroup: (group: GroupWithMembers) => void;
    updateGroup: (group: GroupWithMembers) => void;
    removeGroup: (groupId: string) => void;

    // Balance summary state
    balanceSummary: BalanceSummaryRow[];
    groupBalances: Record<string, GroupBalance>;
    setBalanceSummary: (payload: BalanceSummaryResponse) => void;

    // Expenses state
    expenses: ExpenseWithSplits[];
    setExpenses: (expenses: ExpenseWithSplits[]) => void;
    addExpense: (expense: ExpenseWithSplits) => void;
    updateExpense: (expense: ExpenseWithSplits) => void;
    removeExpense: (expenseId: string) => void;

    // Group messages state, keyed by groupId
    messagesByGroup: Record<string, GroupMessage[]>;
    setGroupMessages: (groupId: string, messages: GroupMessage[]) => void;
    upsertGroupMessage: (message: GroupMessage) => void;
    removeGroupMessage: (groupId: string, messageId: string) => void;

    // Language state
    language: 'en' | 'he';
    setLanguage: (language: 'en' | 'he') => void;

    // Pending invite — set when an invite link arrives before sign-in.
    pendingInvite: PendingInvite | null;
    setPendingInvite: (invite: PendingInvite | null) => void;

    /** Navigation deferred until AppNavigator mounts (invite redeem outside NavigationContainer). */
    pendingNavigation:
        | { target: 'friends' }
        | { target: 'groupDetail'; groupId: string }
        | null;
    setPendingNavigation: (
        nav: AppState['pendingNavigation'],
    ) => void;

    // Deactivation notice — set when assertProfileActive detects a deactivated
    // (deleted) profile during sign-in. LoginScreen watches this flag and shows
    // an Alert once the user has been routed back. Reset after display.
    pendingDeactivationNotice: boolean;
    setPendingDeactivationNotice: (value: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
    // Auth state
    session: null,
    // currentUser is owned by hydrateCurrentUserProfile (real profile row from DB).
    // setSession used to also derive a session-payload placeholder here, but that
    // clobbered the hydrated row in App.acceptSessionIfAllowed (hydrate-then-setSession
    // order) and on every TOKEN_REFRESHED event — making Settings show ILS while the
    // dashboard RPC returned the real currency. Sign-out (session=null) still clears both.
    setSession: (session) =>
        set((state) => ({
            session,
            currentUser: session ? state.currentUser : null,
        })),

    // User state
    currentUser: null,
    setCurrentUser: (user) => set({ currentUser: user }),

    // Groups state
    groups: [],
    setGroups: (groups) => set({ groups }),
    addGroup: (group) => set((state) => ({ groups: [group, ...state.groups] })),
    updateGroup: (group) => set((state) => ({
        groups: state.groups.map((g) => (g.id === group.id ? group : g)),
    })),
    removeGroup: (groupId) => set((state) => ({
        groups: state.groups.filter((g) => g.id !== groupId),
    })),

    // Balance summary state
    balanceSummary: [],
    groupBalances: {},
    setBalanceSummary: (payload) =>
        set({
            balanceSummary: payload.summary,
            groupBalances: payload.byGroup.reduce<Record<string, GroupBalance>>(
                (acc, row) => {
                    acc[row.groupId] = row;
                    return acc;
                },
                {},
            ),
        }),

    // Expenses state
    expenses: [],
    setExpenses: (expenses) => set({ expenses }),
    addExpense: (expense) => set((state) =>
        state.expenses.some((e) => e.id === expense.id)
            ? state
            : { expenses: [...state.expenses, expense] },
    ),
    updateExpense: (expense) => set((state) => ({
        expenses: state.expenses.map((e) => (e.id === expense.id ? expense : e)),
    })),
    removeExpense: (expenseId) => set((state) => ({
        expenses: state.expenses.filter((e) => e.id !== expenseId),
    })),

    // Group messages state
    messagesByGroup: {},
    setGroupMessages: (groupId, messages) =>
        set((state) => ({
            messagesByGroup: { ...state.messagesByGroup, [groupId]: messages },
        })),
    upsertGroupMessage: (message) =>
        set((state) => {
            const existing = state.messagesByGroup[message.groupId] ?? [];
            const idx = existing.findIndex((m) => m.id === message.id);
            const next =
                idx >= 0
                    ? existing.map((m) => (m.id === message.id ? message : m))
                    : [message, ...existing];
            return {
                messagesByGroup: {
                    ...state.messagesByGroup,
                    [message.groupId]: next,
                },
            };
        }),
    removeGroupMessage: (groupId, messageId) =>
        set((state) => ({
            messagesByGroup: {
                ...state.messagesByGroup,
                [groupId]: (state.messagesByGroup[groupId] ?? []).filter(
                    (m) => m.id !== messageId,
                ),
            },
        })),

    // Language state
    language: 'en',
    setLanguage: (language) => set({ language }),

    // Pending invite state
    pendingInvite: null,
    setPendingInvite: (invite) => set({ pendingInvite: invite }),

    pendingNavigation: null,
    setPendingNavigation: (nav) => set({ pendingNavigation: nav }),

    // Deactivation notice flag
    pendingDeactivationNotice: false,
    setPendingDeactivationNotice: (value) => set({ pendingDeactivationNotice: value }),
}));
