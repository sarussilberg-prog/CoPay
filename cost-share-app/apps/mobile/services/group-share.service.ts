/**
 * Group report export as a CSV file (UTF-8 BOM, RFC 4180, Excel-compatible).
 */

import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sentry from '@sentry/react-native';
import { Group, FeedItem, GroupMemberLite, PairwiseDebt } from '@cost-share/shared';
import Toast from 'react-native-toast-message';
import i18n from '../i18n';
import { buildGroupExportCsv } from '../lib/groupExportCsv';
import { downloadTextAsFile } from '../lib/webFileDownload';

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
    return `${base}-${todayIsoFrom(exportedAt)}.csv`;
}

function todayIsoFrom(date: Date): string {
    return date.toISOString().slice(0, 10);
}

async function writeCsvReport(group: Group, csv: string): Promise<string> {
    const filename = buildGroupExportFilename(group);
    const file = new File(Paths.cache, filename);
    file.create({ overwrite: true });
    file.write(csv);
    return file.uri;
}

export async function exportGroupCsv(
    group: Group,
    payload: GroupExportPayload,
): Promise<boolean> {
    try {
        const language = i18n.language === 'he' ? 'he' : 'en';
        const csv = buildGroupExportCsv({
            group,
            feed: payload.feed,
            debts: payload.debts,
            members: payload.members,
            exportedAt: new Date(),
            language,
            t: i18n.t.bind(i18n),
        });

        if (Platform.OS === 'web') {
            downloadTextAsFile(buildGroupExportFilename(group), csv, 'text/csv;charset=utf-8');
            Toast.show({
                type: 'success',
                text1: i18n.t('groups.share.exportTitle'),
            });
            return true;
        }

        const uri = await writeCsvReport(group, csv);

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
            mimeType: 'text/csv',
            dialogTitle: i18n.t('groups.share.exportTitle'),
            UTI: 'public.comma-separated-values-text',
        });
        return true;
    } catch (error) {
        Sentry.captureException(error, {
            tags: { service: 'group-share', op: 'export' },
        });
        console.error('Failed to export group report:', error);
        Toast.show({
            type: 'error',
            text1: i18n.t('groups.share.exportError'),
            text2: i18n.t('common.networkError'),
        });
        return false;
    }
}
