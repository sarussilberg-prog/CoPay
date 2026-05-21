-- Idempotent: public expense-receipts storage bucket for expense receipt images.
-- Path convention: <groupId>/<filename>. RLS gates access by group membership.

INSERT INTO storage.buckets (id, name, public)
VALUES ('expense-receipts', 'expense-receipts', true)
ON CONFLICT (id) DO NOTHING;

-- Bucket is public, so getPublicUrl() works without auth. Write policies below
-- still gate uploads/edits/deletes by group membership.
DROP POLICY IF EXISTS "Expense receipts are publicly readable" ON storage.objects;
CREATE POLICY "Expense receipts are publicly readable"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'expense-receipts');

DROP POLICY IF EXISTS "Group members can upload expense receipts" ON storage.objects;
CREATE POLICY "Group members can upload expense receipts"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'expense-receipts'
        AND public.is_group_member(((storage.foldername(name))[1])::uuid)
    );

DROP POLICY IF EXISTS "Group members can update expense receipts" ON storage.objects;
CREATE POLICY "Group members can update expense receipts"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'expense-receipts'
        AND public.is_group_member(((storage.foldername(name))[1])::uuid)
    );

DROP POLICY IF EXISTS "Group members can delete expense receipts" ON storage.objects;
CREATE POLICY "Group members can delete expense receipts"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'expense-receipts'
        AND public.is_group_member(((storage.foldername(name))[1])::uuid)
    );
