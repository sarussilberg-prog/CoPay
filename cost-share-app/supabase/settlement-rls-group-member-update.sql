-- Align settlement UPDATE policy with expenses: any active group member may edit or soft-delete.
-- Run once on existing Supabase projects (schema.sql already includes this for fresh installs).

DROP POLICY IF EXISTS "Either party can update settlement" ON settlements;

CREATE POLICY "Group members can update settlements" ON settlements
    FOR UPDATE USING (public.is_group_member(group_id));
