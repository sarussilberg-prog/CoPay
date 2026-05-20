/**
 * Shared multi-select semantics for filter sheets (empty selection = all).
 */

export function toggleInList<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function isAllMultiSelected<T>(selected: T[], allValues: T[]): boolean {
    return selected.length === 0 || selected.length === allValues.length;
}

export function isMultiItemActive<T>(selected: T[], value: T): boolean {
    return selected.length === 0 || selected.includes(value);
}

export function handleMultiToggle<T>(
    selected: T[],
    value: T,
    allValues: T[],
): T[] {
    if (selected.length === 0) return [value];
    const next = toggleInList(selected, value);
    if (next.length === 0 || next.length === allValues.length) return [];
    return next;
}
