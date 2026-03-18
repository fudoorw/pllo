-- =========================================================================
-- Fix missing DELETE policies on transaction tables for authenticated users
-- =========================================================================

-- Ensure RLS is enabled on these tables (it should be, but just in case)
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_payments ENABLE ROW LEVEL SECURITY;

-- 1. DELETE Policy for Transactions
-- Allow authenticated users to delete transactions.
-- Note: If you want to restrict this to 'admin'/'manager' only, 
-- you can change the USING clause to verify the role in public.user_roles.
DROP POLICY IF EXISTS "Allow authenticated users to delete transactions" ON public.transactions;
CREATE POLICY "Allow authenticated users to delete transactions"
ON public.transactions
FOR DELETE
TO authenticated
USING (true);

-- 2. DELETE Policy for Transaction Items
DROP POLICY IF EXISTS "Allow authenticated users to delete transaction_items" ON public.transaction_items;
CREATE POLICY "Allow authenticated users to delete transaction_items"
ON public.transaction_items
FOR DELETE
TO authenticated
USING (true);

-- 3. DELETE Policy for Transaction Payments
DROP POLICY IF EXISTS "Allow authenticated users to delete transaction_payments" ON public.transaction_payments;
CREATE POLICY "Allow authenticated users to delete transaction_payments"
ON public.transaction_payments
FOR DELETE
TO authenticated
USING (true);

-- Explanation:
-- Without these policies, Supabase will block the frontend from deleting records
-- returning a "success" response but affecting 0 rows, leading to silent failures.
