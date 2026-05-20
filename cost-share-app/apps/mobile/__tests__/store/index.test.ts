import { useAppStore } from '../../store';
import type { GroupWithMembers, ExpenseWithSplits } from '@cost-share/shared';

const makeGroup = (id: string, name = `Group ${id}`): GroupWithMembers => ({
    id,
    name,
    description: '',
    groupType: 'general',
    defaultCurrency: 'USD',
    inviteToken: `token${id}`,
    createdBy: 'creator',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    members: [],
    isArchivedByMe: false,
    isAutoArchived: false,
});

const makeExpense = (id: string, amount = 10): ExpenseWithSplits => ({
    id,
    groupId: 'g1',
    description: `expense ${id}`,
    amount,
    currency: 'USD',
    category: 'other',
    expenseDate: new Date(),
    paidBy: 'u1',
    createdBy: 'u1',
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    splits: [],
});

beforeEach(() => {
    useAppStore.setState({
        session: null,
        currentUser: null,
        groups: [],
        expenses: [],
        language: 'en',
    });
});

describe('useAppStore', () => {
    describe('session', () => {
        it('starts with null session', () => {
            expect(useAppStore.getState().session).toBeNull();
            expect(useAppStore.getState().currentUser).toBeNull();
        });

        it('setSession(null) clears session and currentUser', () => {
            useAppStore.setState({ currentUser: { id: 'u1' } as any });
            useAppStore.getState().setSession(null);
            expect(useAppStore.getState().session).toBeNull();
            expect(useAppStore.getState().currentUser).toBeNull();
        });

        it('setSession derives currentUser from session payload', () => {
            const mockSession = {
                user: {
                    id: 'user-123',
                    email: 'test@example.com',
                    user_metadata: { full_name: 'Test User', avatar_url: 'http://x/a.png' },
                    created_at: '2026-01-01T00:00:00Z',
                    updated_at: '2026-01-02T00:00:00Z',
                },
            } as any;
            useAppStore.getState().setSession(mockSession);
            const user = useAppStore.getState().currentUser;
            expect(user?.id).toBe('user-123');
            expect(user?.email).toBe('test@example.com');
            expect(user?.name).toBe('Test User');
            expect(user?.avatarUrl).toBe('http://x/a.png');
        });
    });

    describe('groups', () => {
        it('setGroups replaces the array', () => {
            useAppStore.getState().setGroups([makeGroup('a'), makeGroup('b')]);
            expect(useAppStore.getState().groups).toHaveLength(2);
        });

        it('addGroup prepends to the array (newest first)', () => {
            useAppStore.getState().addGroup(makeGroup('a'));
            useAppStore.getState().addGroup(makeGroup('b'));
            expect(useAppStore.getState().groups).toHaveLength(2);
            expect(useAppStore.getState().groups[0].id).toBe('b');
            expect(useAppStore.getState().groups[1].id).toBe('a');
        });

        it('updateGroup replaces matching group by id', () => {
            useAppStore.getState().setGroups([makeGroup('a', 'Old')]);
            useAppStore.getState().updateGroup(makeGroup('a', 'New'));
            expect(useAppStore.getState().groups[0].name).toBe('New');
        });

        it('removeGroup removes the matching group', () => {
            useAppStore.getState().setGroups([makeGroup('a'), makeGroup('b')]);
            useAppStore.getState().removeGroup('a');
            expect(useAppStore.getState().groups).toHaveLength(1);
            expect(useAppStore.getState().groups[0].id).toBe('b');
        });
    });

    describe('expenses', () => {
        it('setExpenses replaces the array', () => {
            useAppStore.getState().setExpenses([makeExpense('a'), makeExpense('b')]);
            expect(useAppStore.getState().expenses).toHaveLength(2);
        });

        it('addExpense appends to the array', () => {
            useAppStore.getState().addExpense(makeExpense('a'));
            useAppStore.getState().addExpense(makeExpense('b'));
            expect(useAppStore.getState().expenses).toHaveLength(2);
        });

        it('updateExpense replaces matching expense by id', () => {
            useAppStore.getState().setExpenses([makeExpense('a', 1)]);
            useAppStore.getState().updateExpense(makeExpense('a', 99));
            expect(useAppStore.getState().expenses[0].amount).toBe(99);
        });

        it('removeExpense removes the matching expense', () => {
            useAppStore.getState().setExpenses([makeExpense('a'), makeExpense('b')]);
            useAppStore.getState().removeExpense('a');
            expect(useAppStore.getState().expenses).toHaveLength(1);
            expect(useAppStore.getState().expenses[0].id).toBe('b');
        });
    });

    describe('language', () => {
        it('starts in English', () => {
            expect(useAppStore.getState().language).toBe('en');
        });

        it('setLanguage updates the language', () => {
            useAppStore.getState().setLanguage('he');
            expect(useAppStore.getState().language).toBe('he');
        });
    });
});
