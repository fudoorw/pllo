-- Migration 03: Add missing foreign key indexes (Performance)
-- Supabase flagged 35 foreign keys without covering indexes
-- Indexes dramatically speed up JOINs, WHERE filters, and CASCADE deletes

-- expenses
CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON public.expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_created_by ON public.expenses(created_by);
CREATE INDEX IF NOT EXISTS idx_expenses_warehouse_id ON public.expenses(warehouse_id);

-- product_barcodes
CREATE INDEX IF NOT EXISTS idx_product_barcodes_product_id ON public.product_barcodes(product_id);

-- product_suppliers
CREATE INDEX IF NOT EXISTS idx_product_suppliers_supplier_id ON public.product_suppliers(supplier_id);

-- product_variations
CREATE INDEX IF NOT EXISTS idx_product_variations_variation_option_id ON public.product_variations(variation_option_id);

-- product_warehouses
CREATE INDEX IF NOT EXISTS idx_product_warehouses_warehouse_id ON public.product_warehouses(warehouse_id);

-- promotions
CREATE INDEX IF NOT EXISTS idx_promotions_buy_product_id ON public.promotions(buy_product_id);
CREATE INDEX IF NOT EXISTS idx_promotions_get_product_id ON public.promotions(get_product_id);

-- purchase_items
CREATE INDEX IF NOT EXISTS idx_purchase_items_product_id ON public.purchase_items(product_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase_id ON public.purchase_items(purchase_id);

-- purchase_return_items
CREATE INDEX IF NOT EXISTS idx_purchase_return_items_product_id ON public.purchase_return_items(product_id);
CREATE INDEX IF NOT EXISTS idx_purchase_return_items_return_id ON public.purchase_return_items(return_id);

-- purchase_returns
CREATE INDEX IF NOT EXISTS idx_purchase_returns_created_by ON public.purchase_returns(created_by);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_purchase_id ON public.purchase_returns(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_supplier_id ON public.purchase_returns(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_warehouse_id ON public.purchase_returns(warehouse_id);

-- purchases
CREATE INDEX IF NOT EXISTS idx_purchases_created_by ON public.purchases(created_by);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier_id ON public.purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_warehouse_id ON public.purchases(warehouse_id);

-- quotation_items
CREATE INDEX IF NOT EXISTS idx_quotation_items_product_id ON public.quotation_items(product_id);
CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation_id ON public.quotation_items(quotation_id);

-- quotations
CREATE INDEX IF NOT EXISTS idx_quotations_created_by ON public.quotations(created_by);
CREATE INDEX IF NOT EXISTS idx_quotations_customer_id ON public.quotations(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotations_warehouse_id ON public.quotations(warehouse_id);

-- transaction_items
CREATE INDEX IF NOT EXISTS idx_transaction_items_product_id ON public.transaction_items(product_id);
CREATE INDEX IF NOT EXISTS idx_transaction_items_promotion_id ON public.transaction_items(promotion_id);

-- transactions
CREATE INDEX IF NOT EXISTS idx_transactions_customer_id ON public.transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_promotion_id ON public.transactions(promotion_id);
CREATE INDEX IF NOT EXISTS idx_transactions_warehouse_id ON public.transactions(warehouse_id);

-- transfer_items
CREATE INDEX IF NOT EXISTS idx_transfer_items_product_id ON public.transfer_items(product_id);
CREATE INDEX IF NOT EXISTS idx_transfer_items_transfer_id ON public.transfer_items(transfer_id);

-- transfers
CREATE INDEX IF NOT EXISTS idx_transfers_from_warehouse_id ON public.transfers(from_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_transfers_to_warehouse_id ON public.transfers(to_warehouse_id);

-- Also: Drop duplicate indexes (Supabase flagged these)
-- products has both idx_products_name and products_name_idx (identical)
DROP INDEX IF EXISTS public.products_name_idx;
-- user_roles has both idx_user_roles_user_id and user_roles_user_id_idx (identical)
DROP INDEX IF EXISTS public.user_roles_user_id_idx;

-- Also: Add important date indexes for report queries
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON public.transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON public.purchases(date);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(date);
CREATE INDEX IF NOT EXISTS idx_transaction_items_transaction_id ON public.transaction_items(transaction_id);
