/**
 * Group report export as a styled HTML file (tables, RTL, no native modules).
 */

import { File, Paths } from 'expo-file-system';
import { Group, FeedItem, GroupMemberLite, PairwiseDebt } from '@cost-share/shared';
import Toast from 'react-native-toast-message';
import i18n from '../i18n';
import { buildGroupExportHtml } from '../lib/groupExport';

export interface GroupExportPayload {
    feed: FeedItem[];
    debts: PairwiseDebt[];
    members: GroupMemberLite[];
}


/** Filesystem-safe export basename that keeps the group name (incl. Hebrew). */
export function buildGroupExportFilename(group: Group, exportedAt = new Date()): string {
    const trimmed = group.name.trim();
    const base =
        trimmed
            .replace(/[/\\:*?"<>|]+/g, '_')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 60) || 'group';
    return `${base}-${todayIsoFrom(exportedAt)}.html`;
}

function todayIsoFrom(date: Date): string {
    return date.toISOString().slice(0, 10);
}

async function writeHtmlReport(group: Group, html: string): Promise<string> {
    const filename = buildGroupExportFilename(group);
    const file = new File(Paths.cache, filename);
    file.create({ overwrite: true });
    file.write(html);
    return file.uri;
}

export async function exportGroupCsv(
    group: Group,
    payload: GroupExportPayload,
): Promise<boolean> {
    try {
        const language = i18n.language === 'he' ? 'he' : 'en';
        const html = buildGroupExportHtml({
            group,
            feed: payload.feed,
            debts: payload.debts,
            members: payload.members,
            exportedAt: new Date(),
            language,
            t: i18n.t.bind(i18n),
        });

        const uri = await writeHtmlReport(group, html);

        const Sharing = await import('expo-sharing');
        const available = await Sharing.isAvailableAsync();
        if (!available) {
            Toast.show({
                type: 'error',
                text1: i18n.t('groups.share.exportError'),
            });
            return false;
        }
        await Sharing.shareAsync(uri, {
            mimeType: 'text/html',
            dialogTitle: i18n.t('groups.share.exportTitleHtml'),
            UTI: 'public.html',
        });
        return true;
    } catch (error) {
        console.error('Failed to export group report:', error);
        Toast.show({
            type: 'error',
            text1: i18n.t('groups.share.exportError'),
            text2: i18n.t('common.networkError'),
        });
        return false;
    }
}
