-- ============================================================================
-- SQL regression tests for public.get_group_pairwise_debts(p_group_id UUID)
--
-- The whole script runs in a single transaction with ROLLBACK at the end, so
-- it leaves no data behind. Each assertion uses RAISE EXCEPTION on failure
-- so a non-zero exit code (or an error from the MCP) surfaces the regression.
--
-- To run via Supabase MCP:
--     copy the contents below and pass to mcp__supabase__execute_sql
--
-- To run via Supabase CLI against the linked project:
--     supabase db query --linked -f supabase/__tests__/get_group_pairwise_debts.test.sql
--
-- Why session_replication_role = replica?
--   * profiles.id has a FK to auth.users(id).
--   * auth.users has an INSERT trigger (handle_new_user) that tries to create
--     a profile from NEW.email/raw_user_meta_data; with synthetic test users
--     those columns are NULL and the trigger fails on profiles.name NOT NULL.
--   * `session_replication_role = replica` disables triggers AND FK checks
--     for the transaction (Postgres treats FKs as system triggers). ROLLBACK
--     restores the normal role.
--
-- Why stub is_group_member()?
--   * The RPC gates its body on public.is_group_member(p_group_id), which
--     reads auth.uid(). auth.uid() can't be set reliably from a plain SQL
--     session, so we replace the function with one that always returns TRUE
--     for the duration of the transaction. ROLLBACK restores the original
--     definition (DDL in Postgres is transactional).
--
-- Regressions covered:
--   * 42702 "column reference 'currency' is ambiguous" — without the
--     `#variable_conflict use_column` directive every assertion below errors.
--   * Settlements must SUBTRACT from expense debts, not double them.
--   * Per-currency rows must stay independent within the same pair.
--   * Fully settled pairs disappear; over-settlement flips direction.
--   * Soft-deleted expenses (is_deleted = TRUE) and settlements (deleted_at
--     IS NOT NULL) must be excluded.
-- ============================================================================

BEGIN;

SET LOCAL session_replication_role = replica;

DO $outer$
DECLARE
    v_group  CONSTANT UUID := '00000000-0000-0000-0000-000000000001';
    v_alice  CONSTANT UUID := '00000000-0000-0000-0000-0000000000a1';
    v_bob    CONSTANT UUID := '00000000-0000-0000-0000-0000000000b1';
    v_carol  CONSTANT UUID := '00000000-0000-0000-0000-0000000000c1';
    v_exp    UUID;
    v_amount NUMERIC;
    v_from   UUID;
    v_to     UUID;
    v_rows   INT;
    v_eur    NUMERIC;
    v_eur_ct INT;
BEGIN
    -- ---- seed -----------------------------------------------------------
    INSERT INTO auth.users (id) VALUES (v_alice), (v_bob), (v_carol);
    INSERT INTO public.profiles (id, email, name, default_currency, language, is_active, invite_token)
    VALUES
        (v_alice, 'alice@test.local', 'Alice', 'USD', 'en', TRUE, 'tt_alice'),
        (v_bob,   'bob@test.local',   'Bob',   'USD', 'en', TRUE, 'tt_bob'),
        (v_carol, 'carol@test.local', 'Carol', 'USD', 'en', TRUE, 'tt_carol');
    INSERT INTO public.groups (id, name, default_currency, created_by, is_active, group_type, invite_token)
    VALUES (v_group, 'Pairwise Test Group', 'USD', v_alice, TRUE, 'general', 'tt_group');
    INSERT INTO public.group_members (group_id, user_id, is_active)
    VALUES (v_group, v_alice, TRUE), (v_group, v_bob, TRUE), (v_group, v_carol, TRUE);

    -- ---- stub the membership gate ---------------------------------------
    EXECUTE $stub$
        CREATE OR REPLACE FUNCTION public.is_group_member(check_group_id uuid)
        RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
        AS 'SELECT TRUE'
    $stub$;

    -- ---- CASE 1: A pays $30; A&B split → B owes A $15 -------------------
    INSERT INTO public.expenses (group_id, paid_by, amount, currency, description, expense_date, created_by, is_deleted)
    VALUES (v_group, v_alice, 30, 'USD', 'Lunch', CURRENT_DATE, v_alice, FALSE)
    RETURNING id INTO v_exp;
    INSERT INTO public.expense_splits (expense_id, user_id, amount)
    VALUES (v_exp, v_alice, 15), (v_exp, v_bob, 15);

    SELECT COUNT(*) INTO v_rows FROM public.get_group_pairwise_debts(v_group);
    SELECT from_user_id, to_user_id, amount INTO v_from, v_to, v_amount
    FROM public.get_group_pairwise_debts(v_group) LIMIT 1;
    IF v_rows <> 1 OR v_from <> v_bob OR v_to <> v_alice OR v_amount <> 15 THEN
        RAISE EXCEPTION 'CASE 1 FAILED: rows=% from=% to=% amount=%', v_rows, v_from, v_to, v_amount;
    END IF;

    -- ---- CASE 2: Bob settles $10 of $15 → row remains, amount=5 ---------
    INSERT INTO public.settlements (group_id, from_user_id, to_user_id, amount, currency, settlement_date, created_by)
    VALUES (v_group, v_bob, v_alice, 10, 'USD', CURRENT_DATE, v_bob);
    SELECT COUNT(*) INTO v_rows FROM public.get_group_pairwise_debts(v_group);
    SELECT amount INTO v_amount FROM public.get_group_pairwise_debts(v_group) LIMIT 1;
    IF v_rows <> 1 OR v_amount <> 5 THEN
        RAISE EXCEPTION 'CASE 2 FAILED: rows=% amount=%', v_rows, v_amount;
    END IF;

    -- ---- CASE 3: Bob settles remaining $5 → 0 rows ----------------------
    INSERT INTO public.settlements (group_id, from_user_id, to_user_id, amount, currency, settlement_date, created_by)
    VALUES (v_group, v_bob, v_alice, 5, 'USD', CURRENT_DATE, v_bob);
    SELECT COUNT(*) INTO v_rows FROM public.get_group_pairwise_debts(v_group);
    IF v_rows <> 0 THEN
        RAISE EXCEPTION 'CASE 3 FAILED: rows=%', v_rows;
    END IF;

    -- ---- CASE 4: Bob over-pays $3 → direction flips to A→B $3 -----------
    INSERT INTO public.settlements (group_id, from_user_id, to_user_id, amount, currency, settlement_date, created_by)
    VALUES (v_group, v_bob, v_alice, 3, 'USD', CURRENT_DATE, v_bob);
    SELECT amount, from_user_id, to_user_id INTO v_amount, v_from, v_to
    FROM public.get_group_pairwise_debts(v_group) LIMIT 1;
    IF v_from <> v_alice OR v_to <> v_bob OR v_amount <> 3 THEN
        RAISE EXCEPTION 'CASE 4 FAILED: from=% to=% amount=%', v_from, v_to, v_amount;
    END IF;

    -- ---- CASE 5: Multi-currency. Carol pays €40, splits with Alice ------
    INSERT INTO public.expenses (group_id, paid_by, amount, currency, description, expense_date, created_by, is_deleted)
    VALUES (v_group, v_carol, 40, 'EUR', 'Hotel', CURRENT_DATE, v_carol, FALSE)
    RETURNING id INTO v_exp;
    INSERT INTO public.expense_splits (expense_id, user_id, amount)
    VALUES (v_exp, v_alice, 20), (v_exp, v_carol, 20);

    SELECT COUNT(*) INTO v_rows FROM public.get_group_pairwise_debts(v_group);
    IF v_rows <> 2 THEN
        RAISE EXCEPTION 'CASE 5 FAILED: expected 2 rows (USD + EUR), got %', v_rows;
    END IF;
    SELECT COUNT(*), MIN(amount) INTO v_eur_ct, v_eur
    FROM public.get_group_pairwise_debts(v_group) WHERE currency = 'EUR';
    IF v_eur_ct <> 1 OR v_eur <> 20 THEN
        RAISE EXCEPTION 'CASE 5 EUR FAILED: count=% amount=%', v_eur_ct, v_eur;
    END IF;

    -- ---- CASE 6: Soft-deleted expense (is_deleted=TRUE) is ignored ------
    INSERT INTO public.expenses (group_id, paid_by, amount, currency, description, expense_date, created_by, is_deleted)
    VALUES (v_group, v_carol, 100, 'EUR', 'Ignored', CURRENT_DATE, v_carol, TRUE)
    RETURNING id INTO v_exp;
    INSERT INTO public.expense_splits (expense_id, user_id, amount)
    VALUES (v_exp, v_alice, 50), (v_exp, v_carol, 50);
    SELECT COUNT(*) INTO v_eur_ct
    FROM public.get_group_pairwise_debts(v_group) WHERE currency = 'EUR' AND amount = 20;
    IF v_eur_ct <> 1 THEN
        RAISE EXCEPTION 'CASE 6 FAILED: soft-deleted expense changed totals; count=%', v_eur_ct;
    END IF;

    -- ---- CASE 7: Soft-deleted settlement (deleted_at IS NOT NULL) -------
    INSERT INTO public.settlements (group_id, from_user_id, to_user_id, amount, currency, settlement_date, created_by, deleted_at)
    VALUES (v_group, v_alice, v_carol, 20, 'EUR', CURRENT_DATE, v_alice, NOW());
    SELECT amount INTO v_eur FROM public.get_group_pairwise_debts(v_group) WHERE currency = 'EUR';
    IF v_eur <> 20 THEN
        RAISE EXCEPTION 'CASE 7 FAILED: soft-deleted settlement changed totals; eur=%', v_eur;
    END IF;

    RAISE NOTICE 'get_group_pairwise_debts: ALL 7 CASES PASSED';
END
$outer$;

ROLLBACK;
