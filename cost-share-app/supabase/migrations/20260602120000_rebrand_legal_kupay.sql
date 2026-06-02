-- Rebrand legal document copy: Kupa → Kupay (app display name).
-- Safe to run multiple times (replace is idempotent once applied).

UPDATE public.legal_documents
SET
    content_md = replace(content_md, 'Kupa', 'Kupay'),
    title = replace(title, 'Kupa', 'Kupay')
WHERE content_md LIKE '%Kupa%' OR title LIKE '%Kupa%';
