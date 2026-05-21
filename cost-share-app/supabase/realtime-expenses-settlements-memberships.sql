-- Realtime: publish expenses, settlements, group_members so the mobile client
-- can subscribe to live INSERT/UPDATE/DELETE for the open group and the user's
-- own membership rows.
--
-- Idempotent: safe to re-run.

-- ============================================================================
-- 1) Loosen the settlements SELECT policy so soft-delete (deleted_at != NULL)
--    UPDATE events still pass RLS and reach subscribers.
--
--    Realtime checks the NEW row against SELECT RLS on UPDATE; with the old
--    `deleted_at IS NULL` clause, soft-deletes were silently dropped before
--    they could reach the other device. Clients already filter on
--    `deleted_at IS NULL` in every list query, so the visible behavior is
--    unchanged — the change is that realtime can now deliver the event.
-- ============================================================================
DROP POLICY IF EXISTS "Users can view settlements in their groups" ON public.settlements;
CREATE POLICY "Users can view settlements in their groups" ON public.settlements
    FOR SELECT USING (public.is_group_member(group_id));

-- ============================================================================
-- 2) Add tables to the supabase_realtime publication.
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'expenses'
    ) THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'settlements'
    ) THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.settlements';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'group_members'
    ) THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.group_members';
    END IF;
END $$;
