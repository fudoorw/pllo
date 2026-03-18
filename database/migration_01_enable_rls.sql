-- Migration 01: Enable RLS on 7 unprotected tables
-- These tables are currently publicly accessible without any RLS

-- 1. settings
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated users on settings"
  ON public.settings FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 2. api_settings (sensitive - restrict to admin only via RPC if needed)
ALTER TABLE public.api_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated users on api_settings"
  ON public.api_settings FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 3. sms_templates
ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated users on sms_templates"
  ON public.sms_templates FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 4. email_templates
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated users on email_templates"
  ON public.email_templates FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 5. payment_methods
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated users on payment_methods"
  ON public.payment_methods FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 6. purchase_payments
ALTER TABLE public.purchase_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated users on purchase_payments"
  ON public.purchase_payments FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 7. transaction_payments
ALTER TABLE public.transaction_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated users on transaction_payments"
  ON public.transaction_payments FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
