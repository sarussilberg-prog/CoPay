-- ============================================================================
-- Legal Documents table — server-driven Terms of Service & Privacy Policy.
--
-- Content is Markdown stored per (slug, locale). Public anon read is allowed
-- ONLY for is_published = true. All writes are blocked via RLS; edits are
-- performed by an admin using the service-role key (Supabase Studio).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.legal_documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            TEXT NOT NULL CHECK (slug IN ('terms', 'privacy')),
    locale          TEXT NOT NULL CHECK (locale IN ('en', 'he')),
    version         TEXT NOT NULL,
    title           TEXT NOT NULL,
    content_md      TEXT NOT NULL,
    effective_date  DATE NOT NULL,
    is_published    BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Exactly one published row per (slug, locale).
CREATE UNIQUE INDEX IF NOT EXISTS legal_documents_published_unique
    ON public.legal_documents (slug, locale)
    WHERE is_published = true;

-- Lookup index for the standard fetch query.
CREATE INDEX IF NOT EXISTS legal_documents_lookup
    ON public.legal_documents (slug, locale, is_published);

-- Reuse the existing updated_at trigger from schema.sql.
DROP TRIGGER IF EXISTS update_legal_documents_updated_at ON public.legal_documents;
CREATE TRIGGER update_legal_documents_updated_at
    BEFORE UPDATE ON public.legal_documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row-Level Security: public read of published rows, all writes blocked.
ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read published legal documents" ON public.legal_documents;
CREATE POLICY "Public can read published legal documents"
    ON public.legal_documents
    FOR SELECT
    TO anon, authenticated
    USING (is_published = true);

-- No INSERT/UPDATE/DELETE policies → all writes blocked for anon/authenticated.
-- Admin edits go through Supabase Studio (service-role key bypasses RLS).

-- Defense in depth: tighten Supabase's default privileges so SELECT is the
-- actual ceiling for non-admin roles, even if RLS is ever disabled.
REVOKE ALL ON public.legal_documents FROM anon, authenticated;
GRANT SELECT ON public.legal_documents TO anon, authenticated;
