/**
 * Builds a CSV report for group export (metadata + balances + full feed history).
 *
 * Format:
 * - UTF-8 with BOM so Excel auto-detects encoding (critical for Hebrew).
 * - CRLF line terminators (RFC 4180).
 * - Fields containing comma, quote, CR, or LF are wrapped in double quotes;
 *   inner double quotes are escaped by doubling.
 * - Sections (metadata / balances / history) are separated by a blank row.
 */

import { Group, FeedItem, GroupMemberLite, PairwiseDebt } from '@cost-share/shared';
import type { TFunction } from 'i18next';
import { formatExportDate, formatExportTime } from './groupExportFormat';

const CRLF = '\r\n';
const BOM = '﻿';

export interface GroupExportInput {
    group: Group;
    feed: FeedItem[];
    debts: PairwiseDebt[];
    members: GroupMemberLite[];
    exportedAt: Date;
    language: 'en' | 'he';
    t: TFunction;
}

/** Escapes a single CSV field per RFC 4180. */
export function csvEscape(value: unknown): string {
    if (value === undefined || value === null) return '';
    const s = typeof value === 'string' ? value : String(value);
    if (/[",\r\n]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

function row(...fields: unknown[]): string {
    return fields.map(csvEscape).join(',');
}

function memberNameMap(members: GroupMemberLite[]): Map<string, string> {
    return new Map(members.map(m => [m.userId, m.displayName]));
}

function feedTypeLabel(kind: FeedItem['kind'], t: TFunction): string {
    if (kind === 'expense') return t('groups.share.typeExpense');
    if (kind === 'message') return t('groups.share.typeMessage');
    return t('groups.share.typeSettlement');
}

function formatSplits(
    splits: { userId: string; amount: number }[],
    names: Map<string, string>,
    currency: string,
): string {
    return splits
        .map(s => `${names.get(s.userId) ?? s.userId}: ${currency} ${s.amount.toFixed(2)}`)
        .join(' · ');
}

function buildMetadataLines(input: GroupExportInput): string[] {
    const { group, members, exportedAt, language, t } = input;
    const exportedLabel =
        formatExportDate(exportedAt, language) + ' ' + formatExportTime(exportedAt, language);
    const memberList = members.map(m => m.displayName).join(', ');
    return [
        row(t('groups.share.groupName'), group.name),
        row(t('groups.share.members'), memberList || '—'),
        row(t('groups.share.defaultCurrency'), group.defaultCurrency),
        row(t('groups.share.exportedAt'), exportedLabel),
    ];
}

function buildBalancesLines(
    debts: PairwiseDebt[],
    names: Map<string, string>,
    t: TFunction,
): string[] {
    const lines: string[] = [];
    lines.push(row(t('groups.share.sectionBalances')));
    lines.push(row(
        t('balances.fromUser'),
        t('balances.toUser'),
        t('groups.share.colAmount'),
        t('groups.share.colCurrency'),
    ));
    if (debts.length === 0) {
        lines.push(row(t('groups.share.allSettled')));
        return lines;
    }
    const sorted = [...debts].sort((a, b) => {
        const cur = a.currency.localeCompare(b.currency);
        if (cur !== 0) return cur;
        return b.amount - a.amount;
    });
    for (const d of sorted) {
        lines.push(row(
            names.get(d.fromUserId) ?? d.fromUserId,
            names.get(d.toUserId) ?? d.toUserId,
            d.amount.toFixed(2),
            d.currency,
        ));
    }
    return lines;
}

function buildHistoryLines(
    feed: FeedItem[],
    names: Map<string, string>,
    t: TFunction,
    language: 'en' | 'he',
): string[] {
    const lines: string[] = [];
    lines.push(row(t('groups.share.sectionHistory')));
    lines.push(row(
        t('groups.share.colDate'),
        t('groups.share.colTime'),
        t('groups.share.colType'),
        t('groups.share.colDescription'),
        t('groups.share.colAmount'),
        t('groups.share.colCurrency'),
        t('groups.share.colParty'),
        t('groups.share.colDetails'),
    ));
    if (feed.length === 0) {
        lines.push(row(t('groups.share.emptyHistory')));
        return lines;
    }
    const sorted = [...feed].sort((a, b) => b.sortAt.getTime() - a.sortAt.getTime());
    for (const item of sorted) {
        const date = formatExportDate(item.sortAt, language);
        const time = formatExportTime(item.sortAt, language);
        const type = feedTypeLabel(item.kind, t);

        if (item.kind === 'expense') {
            const e = item.expense;
            const payer = names.get(e.paidBy) ?? e.paidBy;
            const category = e.category ? t(`expenses.categories.${e.category}`) : '';
            const splits = formatSplits(e.splits, names, e.currency);
            const details = [category, splits].filter(Boolean).join(' · ');
            lines.push(row(
                date, time, type, e.description, e.amount.toFixed(2), e.currency, payer, details,
            ));
            continue;
        }

        if (item.kind === 'message') {
            const m = item.message;
            const author = names.get(m.userId) ?? m.userId;
            const edited = m.editedAt ? ` (${t('groups.message.edited')})` : '';
            lines.push(row(date, time, type, m.body, '', '', author + edited, ''));
            continue;
        }

        const s = item.settlement;
        const from = names.get(s.fromUserId) ?? s.fromUserId;
        const to = names.get(s.toUserId) ?? s.toUserId;
        const methodKey = s.paymentMethod
            ? (`balances.methods.${s.paymentMethod}` as const)
            : null;
        const method = methodKey ? t(methodKey) : '';
        const details = method ? `${from} → ${to} · ${method}` : `${from} → ${to}`;
        const description = t('feed.settlement', {
            from,
            to,
            amount: `${s.currency} ${s.amount.toFixed(2)}`,
        });
        lines.push(row(
            date, time, type, description, s.amount.toFixed(2), s.currency, from, details,
        ));
    }
    return lines;
}

export function buildGroupExportCsv(input: GroupExportInput): string {
    const names = memberNameMap(input.members);
    const metadata = buildMetadataLines(input);
    const balances = buildBalancesLines(input.debts, names, input.t);
    const history = buildHistoryLines(input.feed, names, input.t, input.language);
    const allLines = [
        ...metadata,
        '',
        ...balances,
        '',
        ...history,
    ];
    return BOM + allLines.join(CRLF) + CRLF;
}
