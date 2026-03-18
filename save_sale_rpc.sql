-- Supabase RPC Function for POS Sales
-- Run this in your Supabase SQL Editor

CREATE OR REPLACE FUNCTION process_pos_sale(
  tx_data JSONB,
  payments_data JSONB,
  items_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_tx_id UUID;
  result JSONB;
BEGIN

  -- 0. Check if we are updating an existing transaction
  new_tx_id := NULLIF(tx_data->>'id', '')::uuid;

  IF new_tx_id IS NOT NULL THEN
    -- A. Reconcile Stock: Delete old items to trigger stock restoration
    -- existing trigger trg_handle_sale_stock will restore stock on DELETE
    DELETE FROM public.transaction_items WHERE transaction_id = new_tx_id;
    
    -- B. Clean up old payments
    DELETE FROM public.transaction_payments WHERE transaction_id = new_tx_id;

    -- C. Update Transaction
    UPDATE public.transactions SET
        voucher_no = tx_data->>'voucher_no',
        warehouse_id = NULLIF(tx_data->>'warehouse_id', '')::uuid,
        customer_id = NULLIF(tx_data->>'customer_id', '')::uuid,
        subtotal = (tx_data->>'subtotal')::numeric,
        total_amount = (tx_data->>'total_amount')::numeric,
        total = (tx_data->>'total')::numeric,
        paid_amount = (tx_data->>'paid_amount')::numeric,
        tax_percent = (tx_data->>'tax_percent')::numeric,
        tax_amount = (tx_data->>'tax_amount')::numeric,
        discount_value = (tx_data->>'discount_value')::numeric,
        discount_type = tx_data->>'discount_type',
        discount_amount = (tx_data->>'discount_amount')::numeric,
        shipping_amount = (tx_data->>'shipping_amount')::numeric,
        payment_method = tx_data->>'payment_method',
        transaction_status = tx_data->>'transaction_status',
        payment_status = tx_data->>'payment_status',
        payment_details = (tx_data->'payment_details')::jsonb,
        items = (tx_data->'items')::jsonb,
        cashier = tx_data->>'cashier',
        counter = tx_data->>'counter'
    WHERE id = new_tx_id;
  ELSE
    -- 1. Insert Transaction (existing logic)
    INSERT INTO public.transactions (
        voucher_no, warehouse_id, customer_id, subtotal, total_amount, total, 
        paid_amount, tax_percent, tax_amount, discount_value, discount_type, 
        discount_amount, shipping_amount, payment_method, transaction_status, 
        payment_status, payment_details, items, cashier, counter, created_at
    )
    VALUES (
        tx_data->>'voucher_no',
        NULLIF(tx_data->>'warehouse_id', '')::uuid,
        NULLIF(tx_data->>'customer_id', '')::uuid,
        (tx_data->>'subtotal')::numeric,
        (tx_data->>'total_amount')::numeric,
        (tx_data->>'total')::numeric,
        (tx_data->>'paid_amount')::numeric,
        (tx_data->>'tax_percent')::numeric,
        (tx_data->>'tax_amount')::numeric,
        (tx_data->>'discount_value')::numeric,
        tx_data->>'discount_type',
        (tx_data->>'discount_amount')::numeric,
        (tx_data->>'shipping_amount')::numeric,
        tx_data->>'payment_method',
        tx_data->>'transaction_status',
        tx_data->>'payment_status',
        (tx_data->'payment_details')::jsonb,
        (tx_data->'items')::jsonb,
        tx_data->>'cashier',
        tx_data->>'counter',
        now()
    ) RETURNING id INTO new_tx_id;
  END IF;

  -- 2. Insert Payments if any (re-inserted after deletion if update)
  IF jsonb_array_length(payments_data) > 0 THEN
    INSERT INTO public.transaction_payments (transaction_id, amount, payment_method, payment_date, note)
    SELECT 
      new_tx_id,
      (value->>'amount')::numeric,
      value->>'payment_method',
      (value->>'payment_date')::date,
      value->>'note'
    FROM jsonb_array_elements(payments_data);
  END IF;

  -- 3. Insert Line Items (re-inserted after deletion if update)
  IF jsonb_array_length(items_data) > 0 THEN
    INSERT INTO public.transaction_items (transaction_id, product_id, product_name, quantity, price, subtotal, discount)
    SELECT 
      new_tx_id,
      NULLIF(value->>'product_id', '')::uuid, 
      value->>'product_name',
      (value->>'quantity')::numeric,
      (value->>'price')::numeric,
      (value->>'subtotal')::numeric,
      (value->>'discount')::numeric
    FROM jsonb_array_elements(items_data);
  END IF;

  -- Return success with the new ID
  result := jsonb_build_object('success', true, 'transaction_id', new_tx_id);
  RETURN result;

EXCEPTION WHEN OTHERS THEN
  -- Postgres automatically rolls back the transaction on exception
  RAISE EXCEPTION 'Failed to process sale: %', SQLERRM;
END;
$$;
