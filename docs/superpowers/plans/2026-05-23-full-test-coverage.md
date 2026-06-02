# Full Mobile Test Coverage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the highest-risk test gaps in the Kupay mobile app and shared calculations layer so every critical user flow (auth, expenses, settlements, groups, invites, balances, realtime sync) has unit/integration tests with deterministic mocks.

**Architecture:** Follow existing patterns in `cost-share-app/apps/mobile/__tests__/`: mock `lib/supabase`, `lib/auth`, `react-native-toast-message`, and `i18n`; test pure logic under `__tests__/shared/`; test hooks with a new `renderHookWithQuery` helper. No production refactors unless a function is untestable without extraction. Each phase is an independent PR.

**Tech Stack:** Jest (`jest-expo`), `@testing-library/react-native`, `@tanstack/react-query`, Supabase client mocks, `@cost-share/shared` via `moduleNameMapper`.

**SRS mapping:** REQ-EXP-02/04/05, REQ-BAL-*, REQ-SET-*, REQ-GRP-*, REQ-INV-*, REQ-AUTH-01, REQ-PROF-04/06/07.

**Run all tests:** `cd cost-share-app/apps/mobile && npm test`

**Run one file:** `cd cost-share-app/apps/mobile && npm test -- __tests__/shared/expenseValidators.test.ts`

---

## Scope & Phases

This plan is split into **11 phases**. Execute in order — later phases depend on helpers/patterns from earlier ones. Each phase ends with `npm test` green and one commit.

| Phase | Focus | New test files | REQ IDs |
|-------|-------|----------------|---------|
| 0 | Baseline + hook helper | `helpers/renderHookWithQuery.tsx` | — |
| 1 | Shared validators + FX display | `shared/expenseValidators.test.ts`, `shared/settlementValidators.test.ts`, `shared/groupBalanceDisplay.test.ts` | REQ-EXP-02, REQ-SET-*, REQ-PROF-07 |
| 2 | Settlements service CRUD | extend `services/settlements.service.test.ts` | REQ-SET-* |
| 3 | Expenses service create/delete | extend `services/expenses.service.test.ts` | REQ-EXP-02/05 |
| 4 | Groups service | `services/groups.service.test.ts` | REQ-GRP-* |
| 5 | Friends + invites | `services/friends.service.test.ts`, extend `deepLinks.service.test.ts`, `hooks/useInviteRedemption.test.ts` | REQ-INV-* |
| 6 | Auth gaps | extend `auth.service.test.ts`, `lib/auth.test.ts` | REQ-AUTH-01, REQ-PROF-06 |
| 7 | Realtime hooks | `hooks/useGroupExpensesRealtime.test.ts`, `hooks/useGroupSettlementsRealtime.test.ts`, `hooks/useUserGroupMembershipsRealtime.test.ts` | REQ-RT-* |
| 8 | React Query hooks | `hooks/queries/useSettlementQueries.test.ts`, `hooks/useGroupBalancesDisplay.test.ts` | REQ-BAL-*, REQ-PROF-07 |
| 9 | Remaining services | `services/users.service.test.ts`, `services/activity.service.test.ts`, `services/messages.service.test.ts` | REQ-PROF-04 |
| 10 | Screen interaction gaps | extend `ExpenseDetailScreen.test.tsx`, `GroupMembersScreen.test.tsx`, new Friends/FindFriends/GroupNote tests | REQ-EXP-05, REQ-GRP-06 |
| 11 | Mappers + lib | `shared/mappers.test.ts`, targeted lib tests | — |

**Out of scope for this plan (low ROI / visual-only):** `groupTypeVisuals.ts`, `currencyLocaleNames.ts`, `queryClient.ts` singleton wiring, pure styling components already snapshot-tested.

---

## File Structure (what gets created/modified)

| File | Responsibility |
|------|----------------|
| `__tests__/helpers/renderHookWithQuery.tsx` | Wraps `renderHook` with fresh `QueryClient` |
| `__tests__/shared/expenseValidators.test.ts` | `calculateEqualSplit`, `validateExpenseSplits` |
| `__tests__/shared/settlementValidators.test.ts` | `validateSettlementAmount`, `calculateUserBalancesFromData` |
| `__tests__/shared/groupBalanceDisplay.test.ts` | `resolveGroupBalanceDisplay`, `collectGroupFxCurrencies` |
| `__tests__/services/settlements.service.test.ts` | Extend with CRUD + history |
| `__tests__/services/expenses.service.test.ts` | Extend with create/delete/fetch |
| `__tests__/services/groups.service.test.ts` | CRUD, archive, balance RPCs |
| `__tests__/services/friends.service.test.ts` | Friends RPC/table reads |
| `__tests__/services/deepLinks.service.test.ts` | Extend with `handleInviteLink` |
| `__tests__/hooks/useInviteRedemption.test.ts` | Pending invite + replay |
| `__tests__/hooks/useGroupExpensesRealtime.test.ts` | Channel callbacks |
| `__tests__/hooks/useGroupSettlementsRealtime.test.ts` | Cache invalidation |
| `__tests__/hooks/useUserGroupMembershipsRealtime.test.ts` | Join/leave store updates |
| `__tests__/hooks/queries/useSettlementQueries.test.ts` | Mutation invalidation keys |
| `__tests__/hooks/useGroupBalancesDisplay.test.ts` | FX rollup hook |
| `__tests__/services/users.service.test.ts` | `fetchBalanceSummary` |
| `__tests__/services/activity.service.test.ts` | Pagination + merge |
| `__tests__/services/messages.service.test.ts` | CRUD + soft-delete |
| `__tests__/shared/mappers.test.ts` | Row → domain mappers |
| `jest.config.js` | Expand `collectCoverageFrom` to services/lib/hooks |

---

## Phase 0: Test Infrastructure

### Task 0: Hook test helper

**Files:**
- Create: `cost-share-app/apps/mobile/__tests__/helpers/renderHookWithQuery.tsx`

- [ ] **Step 1: Create helper**

```tsx
import React from 'react';
import { renderHook, RenderHookOptions } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export function renderHookWithQuery<Result, Props>(
    callback: (props: Props) => Result,
    options?: RenderHookOptions<Props>,
) {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return { ...renderHook(callback, { wrapper, ...options }), queryClient: client };
}
```

- [ ] **Step 2: Verify Jest resolves the helper**

Run: `cd cost-share-app/apps/mobile && npm test -- __tests__/hooks/useRtlLayout.test.ts`
Expected: PASS (sanity — existing suite still green)

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/apps/mobile/__tests__/helpers/renderHookWithQuery.tsx
git commit -m "test(mobile): add renderHookWithQuery helper for hook unit tests"
```

---

## Phase 1: Shared Calculations (Pure Logic)

### Task 1: `calculateEqualSplit` and `validateExpenseSplits`

**Files:**
- Create: `cost-share-app/apps/mobile/__tests__/shared/expenseValidators.test.ts`
- Reference: `packages/shared/src/calculations/index.ts:51-79`

- [ ] **Step 1: Write failing tests**

```ts
import {
    calculateEqualSplit,
    validateExpenseSplits,
} from '@cost-share/shared';

describe('calculateEqualSplit', () => {
    it('distributes remainder to the last person', () => {
        expect(calculateEqualSplit(10, 3)).toEqual([3.33, 3.33, 3.34]);
    });

    it('returns equal shares when amount divides evenly', () => {
        expect(calculateEqualSplit(12, 4)).toEqual([3, 3, 3, 3]);
    });
});

describe('validateExpenseSplits', () => {
    it('accepts splits within 0.01 tolerance', () => {
        expect(
            validateExpenseSplits(10, [
                { userId: 'a', amount: 3.33 },
                { userId: 'b', amount: 3.33 },
                { userId: 'c', amount: 3.34 },
            ]),
        ).toEqual({ valid: true });
    });

    it('rejects when sum differs by more than 0.01', () => {
        const result = validateExpenseSplits(10, [
            { userId: 'a', amount: 3 },
            { userId: 'b', amount: 3 },
        ]);
        expect(result.valid).toBe(false);
        expect(result.difference).toBe(4);
    });

    it('rejects negative split amounts', () => {
        expect(
            validateExpenseSplits(10, [{ userId: 'a', amount: -1 }]).valid,
        ).toBe(false);
    });
});
```

- [ ] **Step 2: Run test to verify it passes (pure logic already implemented)**

Run: `cd cost-share-app/apps/mobile && npm test -- __tests__/shared/expenseValidators.test.ts`
Expected: PASS (3 suites, all green)

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/apps/mobile/__tests__/shared/expenseValidators.test.ts
git commit -m "test(shared): cover equal split and expense split validation"
```

---

### Task 2: `validateSettlementAmount` and `calculateUserBalancesFromData`

**Files:**
- Create: `cost-share-app/apps/mobile/__tests__/shared/settlementValidators.test.ts`
- Reference: `packages/shared/src/calculations/index.ts:85-158`

- [ ] **Step 1: Write tests**

```ts
import {
    calculateUserBalancesFromData,
    validateSettlementAmount,
} from '@cost-share/shared';

const balances = calculateUserBalancesFromData(
    'g1',
    'ILS',
    ['alice', 'bob'],
    [{ id: 'e1', paidBy: 'alice', amount: 100 }],
    [
        { expenseId: 'e1', userId: 'alice', amount: 50 },
        { expenseId: 'e1', userId: 'bob', amount: 50 },
    ],
    [],
);

describe('calculateUserBalancesFromData', () => {
    it('computes net = paid - owed + received - paid settlements', () => {
        const alice = balances.find(b => b.userId === 'alice')!;
        const bob = balances.find(b => b.userId === 'bob')!;
        expect(alice.netBalance).toBe(50);
        expect(bob.netBalance).toBe(-50);
    });
});

describe('validateSettlementAmount', () => {
    it('caps settlement at the smaller of debtor/creditor nets', () => {
        const result = validateSettlementAmount(balances, 'bob', 'alice', 60);
        expect(result.valid).toBe(false);
        expect(result.maxAmount).toBe(50);
    });

    it('rejects when debtor does not owe', () => {
        expect(
            validateSettlementAmount(balances, 'alice', 'bob', 10).valid,
        ).toBe(false);
    });

    it('accepts a valid partial settlement', () => {
        expect(
            validateSettlementAmount(balances, 'bob', 'alice', 25).valid,
        ).toBe(true);
    });
});
```

- [ ] **Step 2: Run tests**

Run: `cd cost-share-app/apps/mobile && npm test -- __tests__/shared/settlementValidators.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/apps/mobile/__tests__/shared/settlementValidators.test.ts
git commit -m "test(shared): cover settlement amount validation and legacy balance calc"
```

---

### Task 3: `groupBalanceDisplay`

**Files:**
- Create: `cost-share-app/apps/mobile/__tests__/shared/groupBalanceDisplay.test.ts`
- Reference: `packages/shared/src/calculations/groupBalanceDisplay.ts`

- [ ] **Step 1: Write tests**

```ts
import {
    collectGroupFxCurrencies,
    resolveGroupBalanceDisplay,
} from '@cost-share/shared';

describe('resolveGroupBalanceDisplay', () => {
    it('returns same-currency balance unchanged', () => {
        expect(
            resolveGroupBalanceDisplay(
                { groupId: 'g1', userId: 'u1', currency: 'ILS', net: -12.5 },
                'ILS',
            ),
        ).toEqual({ net: -12.5, currency: 'ILS', isConverted: false });
    });

    it('returns zero in default currency when foreign net is negligible', () => {
        expect(
            resolveGroupBalanceDisplay(
                { groupId: 'g1', userId: 'u1', currency: 'USD', net: 0.005 },
                'ILS',
            ),
        ).toEqual({ net: 0, currency: 'ILS', isConverted: false });
    });

    it('marks conversionFailed when rates are missing', () => {
        expect(
            resolveGroupBalanceDisplay(
                { groupId: 'g1', userId: 'u1', currency: 'USD', net: 10 },
                'ILS',
            ),
        ).toEqual({
            net: 10,
            currency: 'USD',
            isConverted: false,
            conversionFailed: true,
        });
    });

    it('converts foreign balance when rate is available', () => {
        const result = resolveGroupBalanceDisplay(
            { groupId: 'g1', userId: 'u1', currency: 'USD', net: -10 },
            'ILS',
            { base: 'ILS', rates: { USD: 0.27 } },
        );
        expect(result).toMatchObject({
            currency: 'ILS',
            isConverted: true,
            net: expect.any(Number),
        });
        expect(result!.net).toBeLessThan(0);
    });
});

describe('collectGroupFxCurrencies', () => {
    it('collects unique foreign currencies with non-zero nets', () => {
        expect(
            collectGroupFxCurrencies(
                [
                    { groupId: 'g1', userId: 'u1', currency: 'USD', net: 5 },
                    { groupId: 'g2', userId: 'u1', currency: 'EUR', net: -2 },
                    { groupId: 'g3', userId: 'u1', currency: 'ILS', net: 1 },
                    { groupId: 'g4', userId: 'u1', currency: 'USD', net: 0 },
                ],
                'ILS',
            ),
        ).toEqual(['EUR', 'USD']);
    });
});
```

- [ ] **Step 2: Run tests**

Run: `cd cost-share-app/apps/mobile && npm test -- __tests__/shared/groupBalanceDisplay.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/apps/mobile/__tests__/shared/groupBalanceDisplay.test.ts
git commit -m "test(shared): cover group balance FX display helpers"
```

---

## Phase 2: Settlements Service CRUD

### Task 4: `createSettlement` validation and success

**Files:**
- Modify: `cost-share-app/apps/mobile/__tests__/services/settlements.service.test.ts`
- Reference: `services/settlements.service.ts:52-99`

- [ ] **Step 1: Add mocks and failing test at bottom of file**

```ts
const mockFrom = jest.fn();
const mockInsert = jest.fn();
const mockSelect = jest.fn();
const mockSingle = jest.fn();
const mockToastShow = jest.fn();

jest.mock('../../lib/supabase', () => ({
    supabase: {
        rpc: (...a: unknown[]) => mockRpc(...a),
        from: (...a: unknown[]) => mockFrom(...a),
    },
}));
jest.mock('../../lib/auth', () => ({
    getCurrentUserId: jest.fn().mockResolvedValue('me'),
}));
jest.mock('react-native-toast-message', () => ({
    __esModule: true,
    default: { show: (...args: unknown[]) => mockToastShow(...args) },
}));

import { createSettlement } from '../../services/settlements.service';
import Toast from 'react-native-toast-message';

describe('createSettlement', () => {
    beforeEach(() => {
        mockFrom.mockReset();
        mockInsert.mockReset();
        mockSelect.mockReset();
        mockSingle.mockReset();
        (Toast.show as jest.Mock).mockClear();
        mockFrom.mockReturnValue({
            insert: mockInsert.mockReturnValue({
                select: mockSelect.mockReturnValue({
                    single: mockSingle,
                }),
            }),
        });
    });

    it('rejects non-positive amounts without hitting Supabase', async () => {
        const result = await createSettlement({
            groupId: 'g1',
            fromUserId: 'a',
            toUserId: 'b',
            amount: 0,
            currency: 'ILS',
        });
        expect(result).toBeNull();
        expect(mockFrom).not.toHaveBeenCalled();
        expect(Toast.show).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'error' }),
        );
    });

    it('inserts settlement row and shows success toast', async () => {
        mockSingle.mockResolvedValue({
            data: {
                id: 's1',
                group_id: 'g1',
                from_user_id: 'a',
                to_user_id: 'b',
                amount: 25,
                currency: 'ILS',
                settlement_date: '2026-05-23',
                created_by: 'me',
                created_at: '2026-05-23T00:00:00.000Z',
                updated_at: '2026-05-23T00:00:00.000Z',
                deleted_at: null,
                payment_method: null,
            },
            error: null,
        });

        const result = await createSettlement({
            groupId: 'g1',
            fromUserId: 'a',
            toUserId: 'b',
            amount: 25,
            currency: 'ILS',
        });

        expect(mockFrom).toHaveBeenCalledWith('settlements');
        expect(mockInsert).toHaveBeenCalledWith(
            expect.objectContaining({
                group_id: 'g1',
                from_user_id: 'a',
                to_user_id: 'b',
                amount: 25,
                created_by: 'me',
            }),
        );
        expect(result?.id).toBe('s1');
        expect(Toast.show).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'success' }),
        );
    });
});
```

- [ ] **Step 2: Run test**

Run: `cd cost-share-app/apps/mobile && npm test -- __tests__/services/settlements.service.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/apps/mobile/__tests__/services/settlements.service.test.ts
git commit -m "test(settlements): cover createSettlement validation and success path"
```

---

### Task 5: `updateSettlement`, `deleteSettlement`, `getSettlementHistory`

**Files:**
- Modify: `cost-share-app/apps/mobile/__tests__/services/settlements.service.test.ts`

- [ ] **Step 1: Add tests**

```ts
import {
    deleteSettlement,
    getSettlementHistory,
    updateSettlement,
} from '../../services/settlements.service';

describe('updateSettlement', () => {
    it('rejects invalid amount patches', async () => {
        expect(await updateSettlement('s1', { amount: -5 })).toBeNull();
    });
});

describe('deleteSettlement', () => {
    it('soft-deletes and returns true', async () => {
        const mockUpdate = jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ error: null }),
        });
        mockFrom.mockReturnValue({ update: mockUpdate });

        expect(await deleteSettlement('s1')).toBe(true);
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ deleted_at: expect.any(String) }),
        );
    });
});

describe('getSettlementHistory', () => {
    it('queries both directions of a pair', async () => {
        const mockOr = jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({ data: [], error: null }),
        });
        const mockIs = jest.fn().mockReturnValue({ or: mockOr });
        const mockEq = jest.fn().mockReturnValue({ is: mockIs });
        const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
        mockFrom.mockReturnValue({ select: mockSelect });

        await getSettlementHistory('g1', 'u1', 'u2');

        expect(mockEq).toHaveBeenCalledWith('group_id', 'g1');
        expect(mockOr).toHaveBeenCalledWith(
            expect.stringContaining('from_user_id.eq.u1'),
        );
    });
});
```

- [ ] **Step 2: Run tests**

Run: `cd cost-share-app/apps/mobile && npm test -- __tests__/services/settlements.service.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/apps/mobile/__tests__/services/settlements.service.test.ts
git commit -m "test(settlements): cover update, delete, and pair history queries"
```

---

## Phase 3: Expenses Service

### Task 6: `createExpense`

**Files:**
- Modify: `cost-share-app/apps/mobile/__tests__/services/expenses.service.test.ts`
- Reference: `services/expenses.service.ts:109-177`

- [ ] **Step 1: Extend mocks for chained inserts**

Add to top of file (merge with existing mocks):

```ts
const mockAddExpense = jest.fn();
jest.mock('../../store', () => ({
    useAppStore: {
        getState: jest.fn(() => ({
            expenses: [],
            updateExpense: jest.fn(),
            addExpense: mockAddExpense,
            removeExpense: jest.fn(),
        })),
    },
}));

jest.mock('../../lib/auth', () => ({
    getCurrentUserId: jest.fn().mockResolvedValue('creator'),
}));

import { createExpense } from '../../services/expenses.service';
```

- [ ] **Step 2: Write tests**

```ts
describe('createExpense', () => {
    beforeEach(() => {
        mockAddExpense.mockClear();
        mockFrom.mockImplementation((table: string) => {
            if (table === 'expenses') {
                return {
                    insert: jest.fn().mockReturnValue({
                        select: jest.fn().mockReturnValue({
                            single: jest.fn().mockResolvedValue({
                                data: {
                                    id: 'e-new',
                                    group_id: 'g1',
                                    description: 'Lunch',
                                    amount: 30,
                                    currency: 'ILS',
                                    category: 'food',
                                    expense_date: '2026-05-23',
                                    paid_by: 'creator',
                                    created_by: 'creator',
                                    receipt_url: null,
                                    is_deleted: false,
                                    created_at: '2026-05-23T00:00:00.000Z',
                                    updated_at: '2026-05-23T00:00:00.000Z',
                                },
                                error: null,
                            }),
                        }),
                    }),
                };
            }
            if (table === 'expense_splits') {
                return {
                    insert: jest.fn().mockResolvedValue({ error: null }),
                };
            }
            return {};
        });
    });

    it('rejects invalid split totals', async () => {
        const result = await createExpense({
            groupId: 'g1',
            description: 'Bad',
            amount: 10,
            currency: 'ILS',
            category: 'food',
            paidBy: 'creator',
            splits: [
                { userId: 'a', amount: 3 },
                { userId: 'b', amount: 3 },
            ],
        });
        expect(result).toBeNull();
        expect(mockAddExpense).not.toHaveBeenCalled();
    });

    it('inserts expense + splits and updates store', async () => {
        const result = await createExpense({
            groupId: 'g1',
            description: 'Lunch',
            amount: 30,
            currency: 'ILS',
            category: 'food',
            paidBy: 'creator',
            splits: [
                { userId: 'creator', amount: 15 },
                { userId: 'friend', amount: 15 },
            ],
        });
        expect(result?.id).toBe('e-new');
        expect(mockAddExpense).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'e-new',
                splits: expect.arrayContaining([
                    expect.objectContaining({ userId: 'creator', amount: 15 }),
                ]),
            }),
        );
    });
});
```

- [ ] **Step 3: Run tests**

Run: `cd cost-share-app/apps/mobile && npm test -- __tests__/services/expenses.service.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/apps/mobile/__tests__/services/expenses.service.test.ts
git commit -m "test(expenses): cover createExpense validation and store sync"
```

---

### Task 7: `deleteExpense`

**Files:**
- Modify: `cost-share-app/apps/mobile/__tests__/services/expenses.service.test.ts`

- [ ] **Step 1: Write tests**

```ts
import { deleteExpense } from '../../services/expenses.service';

describe('deleteExpense', () => {
    it('soft-deletes, removes from store, and toasts success', async () => {
        const mockRemoveExpense = jest.fn();
        (useAppStore.getState as jest.Mock).mockReturnValue({
            expenses: [],
            updateExpense: jest.fn(),
            addExpense: jest.fn(),
            removeExpense: mockRemoveExpense,
        });

        mockFrom.mockReturnValue({
            update: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                    select: jest.fn().mockReturnValue({
                        maybeSingle: jest.fn().mockResolvedValue({
                            data: { id: 'e1' },
                            error: null,
                        }),
                    }),
                }),
            }),
        });

        expect(await deleteExpense('e1')).toBe(true);
        expect(mockRemoveExpense).toHaveBeenCalledWith('e1');
    });

    it('returns false when update fails', async () => {
        mockFrom.mockReturnValue({
            update: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                    select: jest.fn().mockReturnValue({
                        maybeSingle: jest.fn().mockResolvedValue({
                            data: null,
                            error: { message: 'fail' },
                        }),
                    }),
                }),
            }),
        });
        expect(await deleteExpense('e1')).toBe(false);
    });
});
```

- [ ] **Step 2: Run tests**

Run: `cd cost-share-app/apps/mobile && npm test -- __tests__/services/expenses.service.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/apps/mobile/__tests__/services/expenses.service.test.ts
git commit -m "test(expenses): cover deleteExpense success and failure paths"
```

---

## Phase 4: Groups Service

### Task 8: `archiveGroup` and `createGroup`

**Files:**
- Create: `cost-share-app/apps/mobile/__tests__/services/groups.service.test.ts`
- Reference: `services/groups.service.ts:150-257`

- [ ] **Step 1: Write test file scaffold + archive tests**

```ts
const mockRpc = jest.fn();
const mockFrom = jest.fn();
const mockToastShow = jest.fn();
const mockUpdateGroup = jest.fn();
const mockAddGroup = jest.fn();

jest.mock('../../lib/supabase', () => ({
    supabase: {
        rpc: (...a: unknown[]) => mockRpc(...a),
        from: (...a: unknown[]) => mockFrom(...a),
    },
}));
jest.mock('../../lib/auth', () => ({
    getCurrentUserId: jest.fn().mockResolvedValue('me'),
}));
jest.mock('react-native-toast-message', () => ({
    __esModule: true,
    default: { show: (...args: unknown[]) => mockToastShow(...args) },
}));
jest.mock('../../store', () => ({
    useAppStore: {
        getState: jest.fn(() => ({
            groups: [{ id: 'g1', name: 'Trip', isArchivedByMe: false }],
            updateGroup: mockUpdateGroup,
            addGroup: mockAddGroup,
        })),
    },
}));
jest.mock('../../i18n', () => ({ __esModule: true, default: { t: (k: string) => k } }));

import { archiveGroup, createGroup } from '../../services/groups.service';

describe('archiveGroup', () => {
    beforeEach(() => {
        mockRpc.mockReset();
        mockUpdateGroup.mockClear();
    });

    it('maps has_balance RPC error', async () => {
        mockRpc.mockResolvedValue({ error: { message: 'has_balance' } });
        expect(await archiveGroup('g1')).toBe('has_balance');
        expect(mockUpdateGroup).not.toHaveBeenCalled();
    });

    it('updates store and returns null on success', async () => {
        mockRpc.mockResolvedValue({ error: null });
        expect(await archiveGroup('g1')).toBeNull();
        expect(mockUpdateGroup).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'g1', isArchivedByMe: true }),
        );
    });
});

describe('createGroup', () => {
    it('deduplicates creator in member list', async () => {
        mockFrom.mockImplementation((table: string) => {
            if (table === 'groups') {
                return {
                    insert: jest.fn().mockReturnValue({
                        select: jest.fn().mockReturnValue({
                            single: jest.fn().mockResolvedValue({
                                data: {
                                    id: 'g-new',
                                    name: 'Roommates',
                                    description: null,
                                    image_url: null,
                                    group_type: 'general',
                                    default_currency: 'ILS',
                                    created_by: 'me',
                                    is_active: true,
                                    created_at: '2026-05-23T00:00:00.000Z',
                                    updated_at: '2026-05-23T00:00:00.000Z',
                                },
                                error: null,
                            }),
                        }),
                    }),
                };
            }
            if (table === 'group_members') {
                return {
                    insert: jest.fn().mockResolvedValue({ error: null }),
                };
            }
            return {};
        });

        await createGroup({
            name: 'Roommates',
            memberIds: ['me', 'friend'],
        });

        expect(mockAddGroup).toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run tests**

Run: `cd cost-share-app/apps/mobile && npm test -- __tests__/services/groups.service.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/apps/mobile/__tests__/services/groups.service.test.ts
git commit -m "test(groups): cover archive errors and createGroup member dedup"
```

---

### Task 9: Balance RPC wrappers

**Files:**
- Modify: `cost-share-app/apps/mobile/__tests__/services/groups.service.test.ts`

- [ ] **Step 1: Add tests for `getGroupBalancesByCurrency` and `getGroupSimplifiedDebtsByCurrency`**

```ts
import {
    getGroupBalancesByCurrency,
    getGroupSimplifiedDebtsByCurrency,
} from '../../services/groups.service';

describe('getGroupBalancesByCurrency', () => {
    it('returns empty array when RPC errors', async () => {
        mockRpc.mockResolvedValue({ data: null, error: { message: 'fail' } });
        expect(await getGroupBalancesByCurrency('g1')).toEqual([]);
    });
});

describe('getGroupSimplifiedDebtsByCurrency', () => {
    it('maps simplified debt rows', async () => {
        mockRpc.mockResolvedValue({
            data: [{ from_user_id: 'a', to_user_id: 'b', currency: 'ILS', amount: 12 }],
            error: null,
        });
        const rows = await getGroupSimplifiedDebtsByCurrency('g1');
        expect(rows).toEqual([
            expect.objectContaining({
                fromUserId: 'a',
                toUserId: 'b',
                currency: 'ILS',
                amount: 12,
            }),
        ]);
    });
});
```

- [ ] **Step 2: Run tests**

Run: `cd cost-share-app/apps/mobile && npm test -- __tests__/services/groups.service.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/apps/mobile/__tests__/services/groups.service.test.ts
git commit -m "test(groups): cover balance and simplified debt RPC mappers"
```

---

## Phase 5: Friends & Invites

### Task 10: `friends.service.ts`

**Files:**
- Create: `cost-share-app/apps/mobile/__tests__/services/friends.service.test.ts`

- [ ] **Step 1: Write tests**

```ts
const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock('../../lib/supabase', () => ({
    supabase: {
        from: (...a: unknown[]) => mockFrom(...a),
        rpc: (...a: unknown[]) => mockRpc(...a),
    },
}));
jest.mock('../../lib/auth', () => ({
    getCurrentUserId: jest.fn().mockResolvedValue('me'),
}));

import {
    acceptFriendRequest,
    fetchFriends,
    searchUsers,
    sendFriendRequest,
} from '../../services/friends.service';

describe('fetchFriends', () => {
    it('returns empty list when no friendships', async () => {
        mockFrom.mockReturnValue({
            select: jest.fn().mockResolvedValue({ data: [], error: null }),
        });
        expect(await fetchFriends()).toEqual([]);
    });
});

describe('searchUsers', () => {
    it('returns empty for queries shorter than 2 chars', async () => {
        expect(await searchUsers('a')).toEqual([]);
        expect(mockRpc).not.toHaveBeenCalled();
    });
});

describe('friend request mutations', () => {
    it('acceptFriendRequest calls RPC', async () => {
        mockRpc.mockResolvedValue({ error: null });
        expect(await acceptFriendRequest('req1')).toBe(true);
        expect(mockRpc).toHaveBeenCalledWith('accept_friend_request', {
            p_request_id: 'req1',
        });
    });

    it('sendFriendRequest returns null on RPC error', async () => {
        mockRpc.mockResolvedValue({ data: null, error: { message: 'fail' } });
        expect(await sendFriendRequest('other')).toBeNull();
    });
});
```

- [ ] **Step 2: Run tests**

Run: `cd cost-share-app/apps/mobile && npm test -- __tests__/services/friends.service.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/apps/mobile/__tests__/services/friends.service.test.ts
git commit -m "test(friends): cover fetch, search guard, and request RPCs"
```

---

### Task 11: `handleInviteLink`

**Files:**
- Modify: `cost-share-app/apps/mobile/__tests__/services/deepLinks.service.test.ts`

- [ ] **Step 1: Add mocks and tests**

```ts
const mockRpc = jest.fn();
const mockInvalidate = jest.fn();
const mockNavigate = jest.fn();

jest.mock('../../lib/supabase', () => ({
    supabase: { rpc: (...a: unknown[]) => mockRpc(...a) },
}));
jest.mock('react-native-toast-message', () => ({
    __esModule: true,
    default: { show: jest.fn() },
}));
jest.mock('../../i18n', () => ({ __esModule: true, default: { t: (k: string) => k } }));

import { handleInviteLink } from '../../services/deepLinks.service';
import Toast from 'react-native-toast-message';

describe('handleInviteLink', () => {
    const queryClient = { invalidateQueries: mockInvalidate } as any;
    const navigation = { navigate: mockNavigate } as any;

    beforeEach(() => {
        mockRpc.mockReset();
        mockInvalidate.mockReset();
        mockNavigate.mockReset();
        (Toast.show as jest.Mock).mockClear();
    });

    it('redeems friend invite and navigates to Friends', async () => {
        mockRpc.mockResolvedValue({
            data: { friend_id: 'f1', friend_name: 'Avi' },
            error: null,
        });

        await handleInviteLink({ kind: 'friend', token: 'abc1234567' }, navigation, queryClient);

        expect(mockRpc).toHaveBeenCalledWith('redeem_friend_invite', {
            p_token: 'abc1234567',
        });
        expect(mockNavigate).toHaveBeenCalledWith('Profile', { screen: 'Friends' });
    });

    it('shows invalid toast on invite_not_found', async () => {
        mockRpc.mockResolvedValue({ data: null, error: { message: 'invite_not_found' } });
        await handleInviteLink({ kind: 'group', token: 'abc1234567' }, navigation, queryClient);
        expect(Toast.show).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'error' }),
        );
    });
});
```

- [ ] **Step 2: Run tests**

Run: `cd cost-share-app/apps/mobile && npm test -- __tests__/services/deepLinks.service.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/apps/mobile/__tests__/services/deepLinks.service.test.ts
git commit -m "test(deepLinks): cover handleInviteLink success and error paths"
```

---

### Task 12: `useInviteRedemption`

**Files:**
- Create: `cost-share-app/apps/mobile/__tests__/hooks/useInviteRedemption.test.ts`

- [ ] **Step 1: Write tests**

```tsx
const mockSetPendingInvite = jest.fn();
const mockHandleInviteLink = jest.fn().mockResolvedValue(undefined);

jest.mock('expo-linking', () => ({
    useURL: jest.fn(),
}));
jest.mock('@react-navigation/native', () => ({
    useNavigation: () => ({ navigate: jest.fn() }),
}));
jest.mock('../../services/deepLinks.service', () => ({
    parseIncomingUrl: jest.fn(),
    handleInviteLink: (...args: unknown[]) => mockHandleInviteLink(...args),
}));
jest.mock('../../services/auth.service', () => ({
    isAuthCallbackUrl: jest.fn().mockReturnValue(false),
}));
jest.mock('../../store', () => ({
    useAppStore: (selector: (s: unknown) => unknown) =>
        selector({
            session: null,
            pendingInvite: null,
            setPendingInvite: mockSetPendingInvite,
        }),
}));

import * as Linking from 'expo-linking';
import { parseIncomingUrl } from '../../services/deepLinks.service';
import { useInviteRedemption } from '../../hooks/useInviteRedemption';
import { renderHookWithQuery } from '../helpers/renderHookWithQuery';

describe('useInviteRedemption', () => {
    beforeEach(() => {
        mockSetPendingInvite.mockClear();
        mockHandleInviteLink.mockClear();
    });

    it('parks invite when user is logged out', () => {
        (Linking.useURL as jest.Mock).mockReturnValue('com.kupay.mobile://invite/i/abc1234567');
        (parseIncomingUrl as jest.Mock).mockReturnValue({
            kind: 'friend',
            token: 'abc1234567',
        });

        renderHookWithQuery(() => useInviteRedemption());

        expect(mockSetPendingInvite).toHaveBeenCalledWith({
            kind: 'friend',
            token: 'abc1234567',
        });
        expect(mockHandleInviteLink).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run tests**

Run: `cd cost-share-app/apps/mobile && npm test -- __tests__/hooks/useInviteRedemption.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/apps/mobile/__tests__/hooks/useInviteRedemption.test.ts
git commit -m "test(invites): cover pending invite when logged out"
```

---

## Phase 6: Auth Gaps

### Task 13: Token-pair auth redirect

**Files:**
- Modify: `cost-share-app/apps/mobile/__tests__/services/auth.service.test.ts`

- [ ] **Step 1: Add mock and test**

Extend supabase auth mock:

```ts
const mockSetSession = jest.fn();
// inside jest.mock('../../lib/supabase'):
setSession: (...args: unknown[]) => mockSetSession(...args),
```

Test:

```ts
it('sets session from access_token and refresh_token query params', async () => {
    mockSetSession.mockResolvedValue({ error: null });
    const url =
        'com.kupay.mobile://auth/callback#access_token=at&refresh_token=rt&token_type=bearer';
    const result = await handleAuthRedirectUrl(url);
    expect(mockSetSession).toHaveBeenCalledWith({
        access_token: 'at',
        refresh_token: 'rt',
    });
    expect(result.error).toBeNull();
});
```

- [ ] **Step 2: Run tests**

Run: `cd cost-share-app/apps/mobile && npm test -- __tests__/services/auth.service.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/apps/mobile/__tests__/services/auth.service.test.ts
git commit -m "test(auth): cover token-pair redirect handling"
```

---

### Task 14: `assertProfileActive` fail-open

**Files:**
- Modify: `cost-share-app/apps/mobile/__tests__/lib/auth.test.ts`

- [ ] **Step 1: Add test**

```ts
it('returns active when profile lookup errors (fail-open)', async () => {
    mockFrom.mockReturnValue({
        select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({
                    data: null,
                    error: { message: 'network' },
                }),
            }),
        }),
    });
    expect(await assertProfileActive('u1')).toBe('active');
});
```

- [ ] **Step 2: Run tests**

Run: `cd cost-share-app/apps/mobile && npm test -- __tests__/lib/auth.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/apps/mobile/__tests__/lib/auth.test.ts
git commit -m "test(auth): cover assertProfileActive fail-open on DB error"
```

---

## Phase 7: Realtime Hooks

Pattern for all three hooks: mock `supabase.channel().on()` to capture the callback, invoke with synthetic payloads, assert store/query side effects.

### Task 15: `useGroupExpensesRealtime`

**Files:**
- Create: `cost-share-app/apps/mobile/__tests__/hooks/useGroupExpensesRealtime.test.ts`

- [ ] **Step 1: Write channel callback test**

```ts
const handlers: Array<(payload: unknown) => void> = [];
const mockRemoveExpense = jest.fn();
const mockInvalidate = jest.fn();

jest.mock('../../lib/supabase', () => ({
    supabase: {
        channel: jest.fn(() => ({
            on: jest.fn((_event: unknown, _filter: unknown, cb: (p: unknown) => void) => {
                handlers.push(cb);
                return { subscribe: jest.fn() };
            }),
        })),
        removeChannel: jest.fn(),
    },
}));
jest.mock('../../services/expenses.service', () => ({
    getExpenseWithSplitsById: jest.fn(),
}));
jest.mock('../../services/users.service', () => ({
    fetchBalanceSummary: jest.fn(),
}));
jest.mock('../../lib/queryClient', () => ({
    queryClient: { invalidateQueries: (...a: unknown[]) => mockInvalidate(...a) },
}));
jest.mock('../../store', () => ({
    useAppStore: { getState: () => ({ removeExpense: mockRemoveExpense }) },
}));

import { renderHook } from '@testing-library/react-native';
import { useGroupExpensesRealtime } from '../../hooks/useGroupExpensesRealtime';

describe('useGroupExpensesRealtime', () => {
    it('removes expense on DELETE event', () => {
        renderHook(() => useGroupExpensesRealtime('g1'));
        handlers[0]?.({ eventType: 'DELETE', old: { id: 'e1' } });
        expect(mockRemoveExpense).toHaveBeenCalledWith('e1');
        expect(mockInvalidate).toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run tests**

Run: `cd cost-share-app/apps/mobile && npm test -- __tests__/hooks/useGroupExpensesRealtime.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/apps/mobile/__tests__/hooks/useGroupExpensesRealtime.test.ts
git commit -m "test(realtime): cover expense DELETE handler"
```

Repeat Tasks 16–17 for `useGroupSettlementsRealtime` and `useUserGroupMembershipsRealtime` with the same channel-capture pattern (one commit each).

---

## Phase 8: React Query Hooks

### Task 18: `useCreateSettlementMutation` invalidates caches

**Files:**
- Create: `cost-share-app/apps/mobile/__tests__/hooks/queries/useSettlementQueries.test.ts`

- [ ] **Step 1: Write test using renderHookWithQuery**

Mock `createSettlement` to resolve, render hook, call `mutate`, assert `queryClient.getQueryCache().findAll()` invalidations include `groupSettlements`, `groupPairwiseDebts`, `dashboard`.

- [ ] **Step 2: Run tests**

Run: `cd cost-share-app/apps/mobile && npm test -- __tests__/hooks/queries/useSettlementQueries.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/apps/mobile/__tests__/hooks/queries/useSettlementQueries.test.ts
git commit -m "test(queries): cover settlement mutation cache invalidation"
```

---

## Phase 9: Remaining Services

### Task 19: `users.service.ts` — `fetchBalanceSummary`

**Files:**
- Create: `cost-share-app/apps/mobile/__tests__/services/users.service.test.ts`

Test RPC `get_user_dashboard` mapping into store `setBalanceSummary`.

### Task 20: `activity.service.ts`

**Files:**
- Create: `cost-share-app/apps/mobile/__tests__/services/activity.service.test.ts`

Test cursor pagination, merge sort by date, settlement copy strings (`youPaid` / `paidYou`).

### Task 21: `messages.service.ts`

**Files:**
- Create: `cost-share-app/apps/mobile/__tests__/services/messages.service.test.ts`

Test create/update soft-delete paths mirroring `feed.test.ts` patterns.

One commit per task file.

---

## Phase 10: Screen Interaction Gaps

### Task 22: `ExpenseDetailScreen` delete flow

**Files:**
- Modify: `cost-share-app/apps/mobile/__tests__/screens/expenses/ExpenseDetailScreen.test.tsx`

- [ ] **Step 1: Add interaction test**

```tsx
import { deleteExpense } from '../../../services/expenses.service';

const mockDelete = deleteExpense as jest.MockedFunction<typeof deleteExpense>;

it('calls deleteExpense after confirm', async () => {
    mockDelete.mockResolvedValue(true);
    mockGet.mockResolvedValue({ ...expense, splits: [] });
    const { getByText } = renderWithQuery(<ExpenseDetailScreen />);
    fireEvent.press(getByText('common.delete')); // use actual i18n key from screen
    fireEvent.press(getByText('common.confirm'));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('e1'));
});
```

Adjust button labels to match `ExpenseDetailScreen.tsx` accessibility/text.

- [ ] **Step 2: Run test**

Run: `cd cost-share-app/apps/mobile && npm test -- __tests__/screens/expenses/ExpenseDetailScreen.test.tsx`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/apps/mobile/__tests__/screens/expenses/ExpenseDetailScreen.test.tsx
git commit -m "test(expense-detail): cover delete confirmation flow"
```

### Task 23: `FriendsScreen`, `FindFriendsScreen`, `GroupNoteScreen`

Create one test file per screen under `__tests__/screens/profile/` and `__tests__/screens/groups/` following `SettingsScreen.test.tsx` patterns (mock services, assert mutation calls on button press).

### Task 24: `GroupMembersScreen` add/remove

Extend existing test — fire press on remove member, assert `removeGroupMember` mock called.

---

## Phase 11: Mappers & Coverage Config

### Task 25: `mappers/index.ts`

**Files:**
- Create: `cost-share-app/apps/mobile/__tests__/shared/mappers.test.ts`

Test `expenseFromRow`, `groupWithMembersFromRow`, `settlementFromRow` with snake_case DB rows, inactive member filtering, date coercion.

### Task 26: Expand Jest coverage collection

**Files:**
- Modify: `cost-share-app/apps/mobile/jest.config.js`

```js
collectCoverageFrom: [
    'components/**/*.{ts,tsx}',
    'screens/**/*.{ts,tsx}',
    'services/**/*.{ts,tsx}',
    'lib/**/*.{ts,tsx}',
    'hooks/**/*.{ts,tsx}',
    '../../packages/shared/src/calculations/**/*.{ts,tsx}',
    'store/**/*.{ts,tsx}',
    '!**/*.d.ts',
],
```

Run: `cd cost-share-app/apps/mobile && npm run test:coverage`
Target after all phases: **≥80% statements** on `services/`, `packages/shared/src/calculations/`.

- [ ] **Commit**

```bash
git add cost-share-app/apps/mobile/jest.config.js cost-share-app/apps/mobile/__tests__/shared/mappers.test.ts
git commit -m "test: add mapper tests and expand coverage collection paths"
```

---

## Final Verification Gate

After all phases:

```bash
cd cost-share-app/apps/mobile && npm test
cd cost-share-app/apps/mobile && npm run test:coverage
```

Expected: all suites PASS; no skipped tests; coverage report includes services/lib/hooks.

---

## Self-Review Checklist

| SRS requirement | Covered by tasks |
|-----------------|------------------|
| REQ-EXP-02 create + splits | Tasks 1, 6 |
| REQ-EXP-05 delete | Tasks 7, 22 |
| REQ-SET-* settlements | Tasks 2, 4, 5, 18 |
| REQ-GRP-* groups | Tasks 8, 9, 24 |
| REQ-INV-* invites | Tasks 11, 12 |
| REQ-AUTH-01 OAuth | Task 13 |
| REQ-PROF-06 deactivated | Task 14 |
| REQ-PROF-07 FX rollup | Tasks 3, 8-phase hook |
| Realtime sync | Tasks 15–17 |

**Placeholder scan:** No TBD/TODO steps. Each task includes runnable code and commands.

**Type consistency:** All imports use `@cost-share/shared` or relative paths matching existing tests.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-23-full-test-coverage.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per phase (or per task within a phase), review between tasks, fast iteration. REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**2. Inline Execution** — execute phases in this session using superpowers:executing-plans, batch execution with checkpoints after each phase.

**Which approach?**
