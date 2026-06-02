-- ============================================================================
-- Production customization of legal_documents (Kupay).
-- Operator: Nave Sarussi (individual / sole proprietor, Israel).
-- Trade name: "Sarussilberg".
-- Effective date: 2026-06-02 (Internal Testing first submission to Google Play).
--
-- Prerequisites: cost-share-app/supabase/seed-legal-documents.sql has already
-- been run against this project (jfqxjjjbpxbwwvoygahu). Re-running the seed is
-- safe — it uses ON CONFLICT DO UPDATE.
--
-- Idempotent: re-running this script with the same operator info is a no-op.
-- Apply via Supabase Studio (SQL Editor) on the PRODUCTION project.
-- ============================================================================

BEGIN;

-- English copies (terms + privacy).
UPDATE public.legal_documents SET
    content_md =
        replace(
            replace(
                replace(
                    content_md,
                    '[Partnership Name]', 'Nave Sarussi'
                ),
                'a partnership organized under the laws of the State of Israel',
                'an individual operating from Israel under the trade name "Sarussilberg"'
            ),
            '{{EFFECTIVE_DATE}}', 'June 2, 2026'
        ),
    effective_date = '2026-06-02'
WHERE locale = 'en' AND is_published = true;

-- Hebrew copies (terms + privacy).
UPDATE public.legal_documents SET
    content_md =
        replace(
            replace(
                replace(
                    content_md,
                    '[Partnership Name]', 'נוה סרוסי'
                ),
                'שותפות הפועלת לפי חוקי מדינת ישראל',
                'עוסק יחיד הפועל מישראל תחת שם המסחר "Sarussilberg"'
            ),
            '{{EFFECTIVE_DATE}}', '2 ביוני 2026'
        ),
    effective_date = '2026-06-02'
WHERE locale = 'he' AND is_published = true;

COMMIT;

-- Verify — expect 4 rows, both no_*_placeholder columns true.
SELECT
    slug,
    locale,
    version,
    is_published,
    effective_date,
    content_md NOT LIKE '%[Partnership Name]%' AS no_partner_placeholder,
    content_md NOT LIKE '%{{EFFECTIVE_DATE}}%' AS no_date_placeholder,
    content_md NOT LIKE '%partnership organized%' AS no_partnership_clause_en,
    content_md NOT LIKE '%שותפות הפועלת%' AS no_partnership_clause_he
FROM public.legal_documents
WHERE is_published = true
ORDER BY slug, locale;
