import { useRef } from 'react';
import {
    type QueryClient,
    useMutation,
    useQueryClient,
} from '@tanstack/react-query';
import * as Sentry from '@sentry/react-native';
import type {
    CreateExpenseDto,
    ExpenseWithSplits,
    UpdateExpenseDto,
} from '@cost-share/shared';
import {
    createExpense,
    deleteExpense,
    updateExpense,
} from '../../services/expenses.service';
import { queryKeys } from '../queries/keys';
import {
    addExpenseMutationKey,
    createPendingExpenseId,
    isPendingExpenseId,
} from '../../lib/pendingExpense';
import {
    registerPendingFollowUp,
    takePendingFollowUp,
    type PendingFollowUp,
} from '../../lib/pendingFollowUps';
import { SENTRY_TAGS } from '../../lib/sentryTags';

/**
 * Variables are self-contained (include groupId + pendingId) so a persisted
 * paused mutation can resume after the app is killed and reopened. React Query
 * persists variables + mutationKey but NOT mutationFn / callbacks — if those
 * referenced closure-scoped values, the mutation would resume into a black
 * hole. With variables holding everything, the shared handlers registered via
 * `setMutationDefaults` can fully reconstruct the side-effects on resume.
 */
export interface AddExpenseVariables extends CreateExpenseDto {
    pendingId: string;
}

interface MutationContext {
    pendingId: string;
}

interface OptimisticRow extends ExpenseWithSplits {
    pendingFailed?: boolean;
}

function buildOptimisticRow(variables: AddExpenseVariables): OptimisticRow {
    const { pendingId, groupId } = variables;
    return {
        id: pendingId,
        groupId,
        description: variables.description,
        amount: variables.amount,
        currency: variables.currency,
        category: variables.category,
        expenseDate: variables.expenseDate ?? new Date(),
        paidBy: variables.paidBy,
        createdBy: variables.paidBy,
        receiptUrl: variables.receiptUrl,
        splitMode: variables.splitMode ?? 'equal',
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        splits: variables.splits.map((s) => ({
            id: '',
            expenseId: pendingId,
            userId: s.userId,
            amount: s.amount ?? 0,
            createdAt: new Date(),
        })),
        pendingFailed: false,
    };
}

/**
 * Registers the shared add-expense mutation handlers on the queryClient.
 * Must be called once at app start, BEFORE `resumePausedMutations()`. Without
 * this, paused mutations restored from disk have no mutationFn / callbacks to
 * run, so resume is a silent no-op and the optimistic row in cache gets
 * sweeped or replaced by the next refetch.
 */
export function registerAddExpenseMutationDefaults(client: QueryClient): void {
    client.setMutationDefaults(['addExpense'], {
        networkMode: 'online',
        retry: (failureCount, error) => {
            if (failureCount >= 3) return false;
            const anyErr = error as unknown as {
                status?: number;
                response?: { status?: number };
            };
            const status = anyErr?.status ?? anyErr?.response?.status;
            if (typeof status === 'number') {
                if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
                    return false;
                }
            }
            return true;
        },
        retryDelay: (attemptIndex) => Math.min(2000 * 4 ** attemptIndex, 30_000),
        mutationFn: async (variables: AddExpenseVariables) => {
            const { groupId, pendingId } = variables;
            // Cancellation gate: the optimistic row is the source of truth
            // for "this mutation should still send." If the row was removed
            // (user edited and we re-enqueued under a new pendingId, user
            // deleted the pending row, etc.) we abort here. This makes cancel
            // robust across app restarts — the persister may bring back a
            // paused mutation that was supposed to be dead, but without its
            // optimistic row in the cache it has no business creating a
            // server row.
            const cached =
                client.getQueryData<OptimisticRow[]>(queryKeys.groupExpenses(groupId)) ??
                [];
            if (!cached.some((e) => e.id === pendingId)) {
                const err = new Error('addExpense: cancelled (pending row removed)');
                (err as Error & { isCancellation?: boolean }).isCancellation = true;
                throw err;
            }
            // Service signature accepts CreateExpenseDto; pendingId is a
            // client-only field and is dropped before hitting the network.
            const { pendingId: _ignored, ...dto } = variables;
            void _ignored;
            return createExpense(dto);
        },
        onMutate: async (variables: AddExpenseVariables) => {
            const { groupId, pendingId } = variables;
            const key = queryKeys.groupExpenses(groupId);
            await client.cancelQueries({ queryKey: key });
            client.setQueryData<OptimisticRow[]>(key, (prev) => {
                const list = prev ?? [];
                // Idempotent: if the row is already in cache (e.g. restored
                // from disk on app reopen), don't duplicate it.
                if (list.some((e) => e.id === pendingId)) return list;
                return [...list, buildOptimisticRow(variables)];
            });
            return { pendingId } as MutationContext;
        },
        onSuccess: (
            serverRow: ExpenseWithSplits,
            variables: AddExpenseVariables,
            ctx: MutationContext | undefined,
        ) => {
            const { groupId } = variables;
            const pendingId = ctx?.pendingId ?? variables.pendingId;
            const key = queryKeys.groupExpenses(groupId);

            try {
                client.setQueryData<OptimisticRow[]>(key, (prev) => {
                    const list = (prev ?? []).filter((e) => e.id !== pendingId);
                    if (!serverRow?.id) return list;
                    if (list.some((e) => e.id === serverRow.id)) return list;
                    return [...list, serverRow];
                });
            } catch (err) {
                Sentry.captureException(err, {
                    tags: { tag: SENTRY_TAGS.MUTATION_OFFLINE_ADD },
                });
            }

            if (serverRow?.id && pendingId) {
                const followUp = takePendingFollowUp(pendingId);
                if (followUp?.kind === 'edit') {
                    void updateExpense(serverRow.id, followUp.payload).catch((err) => {
                        Sentry.captureException(err, {
                            tags: { tag: SENTRY_TAGS.MUTATION_OFFLINE_ADD },
                            extra: { followUp: 'edit', serverId: serverRow.id },
                        });
                    });
                } else if (followUp?.kind === 'delete') {
                    void deleteExpense(serverRow.id).catch((err) => {
                        Sentry.captureException(err, {
                            tags: { tag: SENTRY_TAGS.MUTATION_OFFLINE_ADD },
                            extra: { followUp: 'delete', serverId: serverRow.id },
                        });
                    });
                }
            }
        },
        onError: (
            err: Error,
            variables: AddExpenseVariables,
            ctx: MutationContext | undefined,
        ) => {
            // Cancellation is expected and silent. The pending row is already
            // gone (that's why the mutationFn aborted) so there's nothing to
            // mark as failed and no incident to capture.
            if ((err as Error & { isCancellation?: boolean }).isCancellation) {
                return;
            }
            const { groupId } = variables;
            const pendingId = ctx?.pendingId ?? variables.pendingId;
            client.setQueryData<OptimisticRow[]>(
                queryKeys.groupExpenses(groupId),
                (prev) =>
                    (prev ?? []).map((e) =>
                        e.id === pendingId ? { ...e, pendingFailed: true } : e,
                    ),
            );
            Sentry.captureException(err, {
                tags: { tag: SENTRY_TAGS.MUTATION_OFFLINE_ADD },
                level: 'warning',
            });
        },
    });
}

export function useAddExpenseMutation(groupId: string) {
    const client = useQueryClient();
    // Stable for the lifetime of the hook mount; each new AddExpenseScreen mount
    // generates a fresh pendingId (edit-while-pending in E4 relies on this).
    const pendingId = useRef(createPendingExpenseId()).current;

    // Idempotently register defaults so every live mutation goes through the
    // same handlers as a restored, paused mutation. `restoreClient` registers
    // these at app boot too; the duplicate call here is a no-op-on-overwrite
    // that also covers test environments (which skip restoreClient).
    registerAddExpenseMutationDefaults(client);

    // Defaults provide mutationFn + all callbacks. The hook only owns the
    // mutationKey + variable injection so live calls go through the exact
    // same handlers as restored, paused mutations.
    const mutation = useMutation<
        ExpenseWithSplits,
        Error,
        Omit<AddExpenseVariables, 'pendingId' | 'groupId'>,
        MutationContext
    >({
        mutationKey: addExpenseMutationKey(pendingId),
    });

    return {
        ...mutation,
        mutate: (
            input: Omit<AddExpenseVariables, 'pendingId' | 'groupId'>,
            options?: Parameters<typeof mutation.mutate>[1],
        ) => {
            mutation.mutate(
                { ...input, groupId, pendingId } as unknown as Omit<
                    AddExpenseVariables,
                    'pendingId' | 'groupId'
                >,
                options,
            );
        },
        mutateAsync: (
            input: Omit<AddExpenseVariables, 'pendingId' | 'groupId'>,
            options?: Parameters<typeof mutation.mutateAsync>[1],
        ) => {
            return mutation.mutateAsync(
                { ...input, groupId, pendingId } as unknown as Omit<
                    AddExpenseVariables,
                    'pendingId' | 'groupId'
                >,
                options,
            );
        },
    };
}

export function getPendingExpenseFromCache(
    client: QueryClient,
    groupId: string,
    pendingId: string,
): OptimisticRow | null {
    if (!isPendingExpenseId(pendingId)) return null;
    const list =
        client.getQueryData<OptimisticRow[]>(queryKeys.groupExpenses(groupId)) ?? [];
    return list.find((e) => e.id === pendingId) ?? null;
}

export type PendingEditAction =
    | 'cancel-and-reenqueue'
    | 'chain-follow-up'
    | 'no-pending-mutation';

export function resolvePendingEditAction(
    client: QueryClient,
    pendingId: string,
): PendingEditAction {
    const mutations = client
        .getMutationCache()
        .findAll({ mutationKey: addExpenseMutationKey(pendingId) });
    if (mutations.length === 0) return 'no-pending-mutation';
    const m = mutations[mutations.length - 1];
    if (m.state.isPaused) return 'cancel-and-reenqueue';
    if (m.state.status === 'pending') return 'chain-follow-up';
    return 'cancel-and-reenqueue';
}

export function cancelPendingAddExpense(
    client: QueryClient,
    groupId: string,
    pendingId: string,
): void {
    // Remove the optimistic row FIRST. The mutationFn checks for this row
    // before sending, so even if the mutation somehow gets a chance to run
    // (e.g., resumed from a stale persisted state on the next session) it
    // will abort and won't create a duplicate server expense.
    client.setQueryData<OptimisticRow[]>(queryKeys.groupExpenses(groupId), (prev) =>
        (prev ?? []).filter((e) => e.id !== pendingId),
    );
    const cache = client.getMutationCache();
    cache
        .findAll({ mutationKey: addExpenseMutationKey(pendingId) })
        .forEach((m) => {
            // Belt-and-suspenders: cancel() aborts any in-flight network
            // call (no-op on paused); the cache.remove() / destroy() drops
            // the mutation so resumePausedMutations skips it. Both methods
            // exist across RQ versions; we call whichever is available.
            const cancelable = m as { cancel?: () => Promise<unknown> };
            void cancelable.cancel?.().catch(() => {});
            const maybeRemove = (cache as unknown as {
                remove?: (m: unknown) => void;
            }).remove;
            if (typeof maybeRemove === 'function') {
                maybeRemove.call(cache, m);
            } else {
                (m as { destroy?: () => void }).destroy?.();
            }
        });
}

export function chainEditFollowUp(
    client: QueryClient,
    groupId: string,
    pendingId: string,
    payload: UpdateExpenseDto,
): void {
    // Update the optimistic row in place so the user sees their edit immediately.
    // Splits change shape between UpdateExpenseDto (ExpenseSplitInput[]) and the
    // cached row (ExpenseSplit[]); we re-derive the cached splits from the input
    // so the row in cache stays the correct ExpenseWithSplits shape.
    client.setQueryData<OptimisticRow[]>(queryKeys.groupExpenses(groupId), (prev) =>
        (prev ?? []).map((e) => {
            if (e.id !== pendingId) return e;
            const nextSplits = payload.splits
                ? payload.splits.map((s) => ({
                      id: '',
                      expenseId: pendingId,
                      userId: s.userId,
                      amount: s.amount ?? 0,
                      createdAt: e.createdAt,
                  }))
                : e.splits;
            const { splits: _splits, ...rest } = payload;
            void _splits;
            return { ...e, ...rest, id: pendingId, splits: nextSplits };
        }),
    );
    registerPendingFollowUp(pendingId, {
        kind: 'edit',
        payload,
    } satisfies PendingFollowUp);
}

export function chainDeleteFollowUp(
    client: QueryClient,
    groupId: string,
    pendingId: string,
): void {
    client.setQueryData<OptimisticRow[]>(queryKeys.groupExpenses(groupId), (prev) =>
        (prev ?? []).filter((e) => e.id !== pendingId),
    );
    registerPendingFollowUp(pendingId, { kind: 'delete' } satisfies PendingFollowUp);
}
