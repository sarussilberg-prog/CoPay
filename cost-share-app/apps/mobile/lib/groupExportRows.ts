import { FeedItem, GroupMemberLite, PairwiseDebt } from '@cost-share/shared';
import type { TFunction } from 'i18next';
import { formatExportDate, formatExportTime, htmlEscape } from './groupExportFormat';

function formatSplits(
    splits: { userId: string; amount: number }[],
    names: Map<string, string>,
    currency: string,
): string {
    return splits
        .map(s => `${names.get(s.userId) ?? s.userId}: ${currency} ${s.amount.toFixed(2)}`)
        .join(' · ');
}

function feedTypeLabel(kind: FeedItem['kind'], t: TFunction): string {
    if (kind === 'expense') return t('groups.share.typeExpense');
    if (kind === 'message') return t('groups.share.typeMessage');
    return t('groups.share.typeSettlement');
}

export function buildDebtTableRows(
    debts: PairwiseDebt[],
    names: Map<string, string>,
    t: TFunction,
): string {
    if (debts.length === 0) {
        return `<tr><td colspan="4" class="empty">${htmlEscape(t('groups.share.allSettled'))}</td></tr>`;
    }
    const sorted = [...debts].sort((a, b) => {
        const cur = a.currency.localeCompare(b.currency);
        if (cur !== 0) return cur;
        return b.amount - a.amount;
    });
    return sorted
        .map(d => {
            const from = names.get(d.fromUserId) ?? d.fromUserId;
            const to = names.get(d.toUserId) ?? d.toUserId;
            return `<tr>
  <td>${htmlEscape(from)}</td>
  <td>${htmlEscape(to)}</td>
  <td class="num">${d.amount.toFixed(2)}</td>
  <td>${htmlEscape(d.currency)}</td>
</tr>`;
        })
        .join('\n');
}

export function buildHistoryTableRows(
    feed: FeedItem[],
    names: Map<string, string>,
    t: TFunction,
    language: 'en' | 'he',
): string {
    if (feed.length === 0) {
        return `<tr><td colspan="8" class="empty">${htmlEscape(t('groups.share.emptyHistory'))}</td></tr>`;
    }
    const sorted = [...feed].sort((a, b) => b.sortAt.getTime() - a.sortAt.getTime());

    return sorted
        .map(item => {
            const date = formatExportDate(item.sortAt, language);
            const time = formatExportTime(item.sortAt, language);
            const type = feedTypeLabel(item.kind, t);

            if (item.kind === 'expense') {
                const e = item.expense;
                const payer = names.get(e.paidBy) ?? e.paidBy;
                const category = e.category ? t(`expenses.categories.${e.category}`) : '';
                const splits = formatSplits(e.splits, names, e.currency);
                const details = [category, splits].filter(Boolean).join(' · ');
                return `<tr class="row-expense">
  <td>${htmlEscape(date)}</td>
  <td>${htmlEscape(time)}</td>
  <td>${htmlEscape(type)}</td>
  <td>${htmlEscape(e.description)}</td>
  <td class="num">${e.amount.toFixed(2)}</td>
  <td>${htmlEscape(e.currency)}</td>
  <td>${htmlEscape(payer)}</td>
  <td>${htmlEscape(details)}</td>
</tr>`;
            }

            if (item.kind === 'message') {
                const m = item.message;
                const author = names.get(m.userId) ?? m.userId;
                const edited = m.editedAt ? ` (${t('groups.message.edited')})` : '';
                return `<tr class="row-message">
  <td>${htmlEscape(date)}</td>
  <td>${htmlEscape(time)}</td>
  <td>${htmlEscape(type)}</td>
  <td>${htmlEscape(m.body)}</td>
  <td class="num muted">—</td>
  <td class="muted">—</td>
  <td>${htmlEscape(author + edited)}</td>
  <td class="muted">—</td>
</tr>`;
            }

            const s = item.settlement;
            const from = names.get(s.fromUserId) ?? s.fromUserId;
            const to = names.get(s.toUserId) ?? s.toUserId;
            const methodKey = s.paymentMethod
                ? (`balances.methods.${s.paymentMethod}` as const)
                : null;
            const method = methodKey ? t(methodKey) : '';
            const details = method ? `${from} → ${to} · ${method}` : `${from} → ${to}`;
            return `<tr class="row-settlement">
  <td>${htmlEscape(date)}</td>
  <td>${htmlEscape(time)}</td>
  <td>${htmlEscape(type)}</td>
  <td>${htmlEscape(t('feed.settlement', {
      from,
      to,
      amount: `${s.currency} ${s.amount.toFixed(2)}`,
  }))}</td>
  <td class="num">${s.amount.toFixed(2)}</td>
  <td>${htmlEscape(s.currency)}</td>
  <td>${htmlEscape(from)}</td>
  <td>${htmlEscape(details)}</td>
</tr>`;
        })
        .join('\n');
}

export function memberNameMap(members: GroupMemberLite[]): Map<string, string> {
    return new Map(members.map(m => [m.userId, m.displayName]));
}
