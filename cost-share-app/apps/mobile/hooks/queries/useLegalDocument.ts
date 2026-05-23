import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { LegalSlug, Language } from '@cost-share/shared';
import { fetchLegalDocument } from '../../services/legal.service';
import { queryKeys } from './keys';

export function useLegalDocument(slug: LegalSlug) {
    const { i18n } = useTranslation();
    const locale: Language = i18n.language === 'he' ? 'he' : 'en';

    return useQuery({
        queryKey: queryKeys.legalDocument(slug, locale),
        queryFn: () => fetchLegalDocument(slug, locale),
        staleTime: 5 * 60 * 1000,         // 5 minutes
        gcTime: 24 * 60 * 60 * 1000,      // 24 hours
        retry: 1,
    });
}
