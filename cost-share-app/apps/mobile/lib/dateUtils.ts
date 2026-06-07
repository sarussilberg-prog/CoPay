/**
 * Defensive date coercion. React Query data that gets rehydrated from
 * AsyncStorage can occasionally come back with ISO strings instead of Date
 * objects (stale cache from an earlier build, unusual serialization path,
 * payload that was set raw via setQueryData, etc.). Every callsite that does
 * `.getTime() / .getFullYear() / .toLocaleString() ...` should route the
 * value through these helpers so a string never crashes the whole screen.
 *
 * Acceptable inputs: Date, ISO string, epoch number, null, undefined.
 * Unparseable inputs fall back to epoch 0 (for ms) or a fresh `new Date()`
 * (for Date) so the calling render still produces something.
 */

export type DateLike = Date | string | number | null | undefined;

export function toDate(value: DateLike): Date {
    if (value instanceof Date) return value;
    if (value == null) return new Date(0);
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : new Date(0);
}

export function toEpochMs(value: DateLike): number {
    if (value == null) return 0;
    if (value instanceof Date) return value.getTime();
    const t = new Date(value).getTime();
    return Number.isFinite(t) ? t : 0;
}
