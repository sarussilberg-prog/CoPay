/**
 * Supabase Storage helpers for mobile uploads
 */

import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import { supabase } from '../lib/supabase';

const GROUP_IMAGES_BUCKET = 'group-images';
const PROFILE_IMAGES_BUCKET = 'profile-images';
const EXPENSE_RECEIPTS_BUCKET = 'expense-receipts';

function extensionFromUri(uri: string): string {
    const match = uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
    return match?.[1]?.toLowerCase() ?? 'jpg';
}

function contentTypeFromExtension(ext: string): string {
    switch (ext) {
        case 'png':
            return 'image/png';
        case 'webp':
            return 'image/webp';
        case 'gif':
            return 'image/gif';
        default:
            return 'image/jpeg';
    }
}

function contentTypeFromDataUri(uri: string): string | null {
    const match = uri.match(/^data:([^;]+);/);
    return match?.[1] ?? null;
}

// fetch(localUri).blob() is unreliable in React Native; read via expo-file-system
// and hand Supabase a Uint8Array, which it accepts directly.
function base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

async function readLocalImageBytes(
    localUri: string,
): Promise<{ bytes: Uint8Array; contentType: string }> {
    const ext = extensionFromUri(localUri);
    const fallbackContentType = contentTypeFromDataUri(localUri) ?? contentTypeFromExtension(ext);

    if (Platform.OS === 'web') {
        const response = await fetch(localUri);
        if (!response.ok) {
            throw new Error(`Failed to read image (${response.status})`);
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        const contentType = response.headers.get('Content-Type') ?? fallbackContentType;
        return { bytes, contentType };
    }

    const base64 = await new File(localUri).base64();
    return { bytes: base64ToBytes(base64), contentType: fallbackContentType };
}

async function uploadImageToBucket(
    bucket: string,
    path: string,
    localUri: string,
    logLabel: string,
): Promise<string | null> {
    try {
        const { bytes, contentType } = await readLocalImageBytes(localUri);

        const { error } = await supabase.storage
            .from(bucket)
            .upload(path, bytes, { contentType, upsert: true });

        if (error) {
            console.error(`Failed to upload ${logLabel}:`, error.message);
            return null;
        }

        const { data } = supabase.storage.from(bucket).getPublicUrl(path);
        return `${data.publicUrl}?t=${Date.now()}`;
    } catch (err) {
        console.error(`Failed to upload ${logLabel}:`, err);
        return null;
    }
}

export async function uploadGroupImage(
    groupId: string,
    localUri: string,
): Promise<string | null> {
    // Fixed filename so replacements always overwrite the same object.
    return uploadImageToBucket(
        GROUP_IMAGES_BUCKET,
        `${groupId}/avatar.jpg`,
        localUri,
        'group image',
    );
}

export async function uploadProfileImage(
    userId: string,
    localUri: string,
): Promise<string | null> {
    const ext = extensionFromUri(localUri);
    return uploadImageToBucket(
        PROFILE_IMAGES_BUCKET,
        `${userId}/avatar.${ext}`,
        localUri,
        'profile image',
    );
}

export async function uploadExpenseReceipt(
    groupId: string,
    localUri: string,
): Promise<string | null> {
    // Unique filename per upload — replacing a receipt creates a new object
    // instead of overwriting, so previous URLs stay valid in the audit trail.
    const ext = extensionFromUri(localUri);
    const filename = `${Date.now()}-${Math.floor(Math.random() * 1e9)}.${ext}`;
    return uploadImageToBucket(
        EXPENSE_RECEIPTS_BUCKET,
        `${groupId}/${filename}`,
        localUri,
        'expense receipt',
    );
}
