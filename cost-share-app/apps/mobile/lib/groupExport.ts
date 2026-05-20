/**
 * Builds a styled HTML report for group export (balances + full feed history).
 */

import { Group, FeedItem, GroupMemberLite, PairwiseDebt } from '@cost-share/shared';
import type { TFunction } from 'i18next';
import { formatExportDate, formatExportTime, formatBrandFooter, htmlEscape } from './groupExportFormat';
import { buildDebtTableRows, buildHistoryTableRows, memberNameMap } from './groupExportRows';
import { GROUP_EXPORT_STYLES } from './groupExportStyles';

export interface GroupExportInput {
    group: Group;
    feed: FeedItem[];
    debts: PairwiseDebt[];
    members: GroupMemberLite[];
    exportedAt: Date;
    language: 'en' | 'he';
    t: TFunction;
}

export function buildGroupExportHtml(input: GroupExportInput): string {
    const { group, feed, debts, members, exportedAt, language, t } = input;
    const names = memberNameMap(members);
    const dir = language === 'he' ? 'rtl' : 'ltr';
    const memberList = members.map(m => m.displayName).join(', ');
    const exportedLabel =
        formatExportDate(exportedAt, language) + ' ' + formatExportTime(exportedAt, language);

    const balancesHead = `
    <tr>
      <th>${htmlEscape(t('balances.fromUser'))}</th>
      <th>${htmlEscape(t('balances.toUser'))}</th>
      <th>${htmlEscape(t('groups.share.colAmount'))}</th>
      <th>${htmlEscape(t('groups.share.colCurrency'))}</th>
    </tr>`;

    const historyHead = `
    <tr>
      <th>${htmlEscape(t('groups.share.colDate'))}</th>
      <th>${htmlEscape(t('groups.share.colTime'))}</th>
      <th>${htmlEscape(t('groups.share.colType'))}</th>
      <th>${htmlEscape(t('groups.share.colDescription'))}</th>
      <th>${htmlEscape(t('groups.share.colAmount'))}</th>
      <th>${htmlEscape(t('groups.share.colCurrency'))}</th>
      <th>${htmlEscape(t('groups.share.colParty'))}</th>
      <th>${htmlEscape(t('groups.share.colDetails'))}</th>
    </tr>`;

    return `<!DOCTYPE html>
<html lang="${language}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${htmlEscape(group.name)} — ${htmlEscape(t('groups.share.exportTitle'))}</title>
  <style>${GROUP_EXPORT_STYLES}</style>
</head>
<body>
  <div class="wrap">
    <h1>${htmlEscape(group.name)}</h1>
    <div class="meta">
      <p><strong>${htmlEscape(t('groups.share.exportedAt'))}:</strong> ${htmlEscape(exportedLabel)}</p>
      <p><strong>${htmlEscape(t('groups.share.members'))}:</strong> ${htmlEscape(memberList || '—')}</p>
      <p><strong>${htmlEscape(t('groups.share.defaultCurrency'))}:</strong> ${htmlEscape(group.defaultCurrency)}</p>
    </div>

    <h2>${htmlEscape(t('groups.share.sectionBalances'))}</h2>
    <table>
      <thead>${balancesHead}</thead>
      <tbody>${buildDebtTableRows(debts, names, t)}</tbody>
    </table>

    <h2>${htmlEscape(t('groups.share.sectionHistory'))}</h2>
    <table>
      <thead>${historyHead}</thead>
      <tbody>${buildHistoryTableRows(feed, names, t, language)}</tbody>
    </table>

    <p class="footer">${formatBrandFooter(t('groups.share.footer'))}</p>
  </div>
</body>
</html>`;
}
