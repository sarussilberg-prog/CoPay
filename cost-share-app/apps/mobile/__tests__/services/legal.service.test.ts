const mockSelect = jest.fn();
const mockEq1 = jest.fn();
const mockEq2 = jest.fn();
const mockEq3 = jest.fn();
const mockMaybeSingle = jest.fn();

const mockGetItem = jest.fn();
const mockSetItem = jest.fn();

jest.mock('../../lib/supabase', () => ({
    supabase: {
        from: jest.fn(() => ({ select: mockSelect })),
    },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
        getItem: (...args: unknown[]) => mockGetItem(...args),
        setItem: (...args: unknown[]) => mockSetItem(...args),
    },
}));

import { fetchLegalDocument } from '../../services/legal.service';
import type { LegalDocument } from '@cost-share/shared';

const ROW = {
    id: 'uuid-1',
    slug: 'terms' as const,
    locale: 'en' as const,
    version: '1.0.0',
    title: 'Terms of Service',
    content_md: '# Hello',
    effective_date: '2026-01-01',
    updated_at: '2026-05-23T10:00:00Z',
};

function buildChain(rowOrError: { data?: typeof ROW | null; error?: unknown }) {
    mockMaybeSingle.mockResolvedValue(rowOrError);
    mockEq3.mockReturnValue({ maybeSingle: mockMaybeSingle });
    mockEq2.mockReturnValue({ eq: mockEq3 });
    mockEq1.mockReturnValue({ eq: mockEq2 });
    mockSelect.mockReturnValue({ eq: mockEq1 });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
});

describe('fetchLegalDocument', () => {
    it('returns mapped doc from Supabase on success and writes cache', async () => {
        buildChain({ data: ROW, error: null });
        const doc = await fetchLegalDocument('terms', 'en');

        expect(doc).toEqual<LegalDocument>({
            id: 'uuid-1',
            slug: 'terms',
            locale: 'en',
            version: '1.0.0',
            title: 'Terms of Service',
            contentMd: '# Hello',
            effectiveDate: '2026-01-01',
            updatedAt: '2026-05-23T10:00:00Z',
        });
        expect(mockSetItem).toHaveBeenCalledWith(
            'legal:terms:en',
            JSON.stringify(doc),
        );
    });

    it('queries by slug + locale + is_published = true', async () => {
        buildChain({ data: ROW, error: null });
        await fetchLegalDocument('privacy', 'he');

        expect(mockEq1).toHaveBeenCalledWith('slug', 'privacy');
        expect(mockEq2).toHaveBeenCalledWith('locale', 'he');
        expect(mockEq3).toHaveBeenCalledWith('is_published', true);
    });

    it('falls back to cached doc when network errors and cache exists', async () => {
        const cached: LegalDocument = {
            id: 'uuid-cached',
            slug: 'terms',
            locale: 'en',
            version: '1.0.0',
            title: 'Cached Terms',
            contentMd: '# Cached',
            effectiveDate: '2026-01-01',
            updatedAt: '2026-05-20T10:00:00Z',
        };
        mockGetItem.mockResolvedValue(JSON.stringify(cached));
        buildChain({ data: null, error: new Error('network down') });

        const doc = await fetchLegalDocument('terms', 'en');
        expect(doc).toEqual(cached);
        expect(mockGetItem).toHaveBeenCalledWith('legal:terms:en');
    });

    it('throws when network fails and no cache exists', async () => {
        mockGetItem.mockResolvedValue(null);
        buildChain({ data: null, error: new Error('network down') });

        await expect(fetchLegalDocument('terms', 'en')).rejects.toThrow();
    });

    it('throws when document is missing in DB and no cache', async () => {
        buildChain({ data: null, error: null });
        mockGetItem.mockResolvedValue(null);

        await expect(fetchLegalDocument('terms', 'en')).rejects.toThrow(/not found/i);
    });
});
