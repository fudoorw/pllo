-- Migration 02: Fix function search_path (Security Hardening)
-- This migration adds 'SET search_path = ''' to critical functions while PRESERVING their exact business logic.

-- 1. increment_stock
CREATE OR REPLACE FUNCTION public.increment_stock(row_id uuid, amount numeric)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
begin
  update public.products
  set stock = stock + amount
  where id = row_id;
end;
$$;

-- 2. generate_expense_ref (Trigger Function)
CREATE OR REPLACE FUNCTION public.generate_expense_ref()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.reference_no IS NULL THEN
        NEW.reference_no := 'EX_' || LPAD(nextval('public.expenses_id_seq'::regclass)::text, 4, '0');
    END IF;
    RETURN NEW;
END;
$$;

-- 3. generate_purchase_ref (Sophisticated logic with advisory locks)
CREATE OR REPLACE FUNCTION public.generate_purchase_ref(p_prefix text DEFAULT 'PV'::text)
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_date_str TEXT;
    v_full_prefix TEXT;
    v_max_num INT;
    v_next_num INT;
    v_candidate TEXT;
BEGIN
    -- Build date string as DDMMYY
    v_date_str := TO_CHAR(NOW() AT TIME ZONE 'UTC', 'DDMMYY');
    v_full_prefix := p_prefix || '-' || v_date_str || '-';

    -- Acquire a session-level advisory lock keyed on the prefix hash
    -- This ensures only ONE session runs this block at a time
    PERFORM pg_advisory_xact_lock(hashtext(v_full_prefix));

    -- Find the current max sequence number for today's prefix
    SELECT COALESCE(MAX(
        CASE
            WHEN reference_no ~ ('^' || v_full_prefix || '[0-9]+$')
            THEN (SUBSTRING(reference_no FROM LENGTH(v_full_prefix) + 1))::INT
            ELSE 0
        END
    ), 0)
    INTO v_max_num
    FROM public.purchases
    WHERE reference_no LIKE v_full_prefix || '%';

    v_next_num := v_max_num + 1;
    v_candidate := v_full_prefix || LPAD(v_next_num::TEXT, 4, '0');

    RETURN v_candidate;
END;
$$;

-- 4. get_user_role
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN (SELECT role FROM public.user_roles WHERE user_id = auth.uid());
END;
$$;
