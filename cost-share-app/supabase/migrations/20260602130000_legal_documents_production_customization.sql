-- Production customization of legal_documents (Kupay).
-- Operator: Nave Sarussi (individual / sole proprietor, Israel).
-- Trade name: "Sarussilberg". Effective: 2026-06-02 (first Internal Testing).
-- Idempotent: re-running with same operator info is a no-op.

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
