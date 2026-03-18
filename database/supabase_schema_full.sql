-- Supabase Full Schema Export: public
-- Generated on 2026-02-27
-- Total Tables: 36

-- 1. user_roles
CREATE TABLE public.user_roles (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    CONSTRAINT user_roles_pkey PRIMARY KEY (id),
    CONSTRAINT user_roles_user_id_key UNIQUE (user_id),
    CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
    CONSTRAINT user_roles_role_check CHECK (role = ANY (ARRAY['admin'::text, 'cashier'::text, 'manager'::text]))
);

-- 2. categories
CREATE TABLE public.categories (
    id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT categories_pkey PRIMARY KEY (id),
    CONSTRAINT categories_name_key UNIQUE (name)
);

-- 3. subcategories
CREATE TABLE public.subcategories (
    id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
    category_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT subcategories_pkey PRIMARY KEY (id),
    CONSTRAINT subcategories_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id)
);

-- 4. products
CREATE TABLE public.products (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text,
    price numeric NOT NULL DEFAULT 0,
    category text,
    image_url text,
    stock integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    code text,
    brand text,
    cost numeric DEFAULT 0,
    unit text,
    category_id uuid,
    subcategory_id uuid,
    brand_id uuid,
    unit_id uuid,
    item_code text,
    barcodes text[] DEFAULT '{}'::text[],
    pcs_per_box integer DEFAULT 1,
    supplier text,
    shop text,
    purchase_unit text,
    sale_unit text,
    discount numeric DEFAULT 0,
    box_price numeric DEFAULT 0,
    remark text,
    CONSTRAINT products_pkey PRIMARY KEY (id),
    CONSTRAINT products_item_code_key UNIQUE (item_code),
    CONSTRAINT products_price_check CHECK (price >= 0::numeric),
    CONSTRAINT products_stock_check CHECK (stock >= 0)
);

-- 5. variation_types
CREATE TABLE public.variation_types (
    id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT variation_types_pkey PRIMARY KEY (id),
    CONSTRAINT variation_types_name_key UNIQUE (name)
);

-- 6. variation_options
CREATE TABLE public.variation_options (
    id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
    variation_type_id uuid NOT NULL,
    option_value text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT variation_options_pkey PRIMARY KEY (id),
    CONSTRAINT variation_options_variation_type_id_fkey FOREIGN KEY (variation_type_id) REFERENCES public.variation_types(id)
);

-- 7. product_variations
CREATE TABLE public.product_variations (
    id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
    product_id uuid NOT NULL,
    variation_option_id uuid NOT NULL,
    sku text,
    price_adjustment numeric DEFAULT 0,
    stock integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT product_variations_pkey PRIMARY KEY (id),
    CONSTRAINT product_variations_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id),
    CONSTRAINT product_variations_variation_option_id_fkey FOREIGN KEY (variation_option_id) REFERENCES public.variation_options(id)
);

-- 8. brands
CREATE TABLE public.brands (
    id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
    name text NOT NULL,
    description text,
    website text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT brands_pkey PRIMARY KEY (id),
    CONSTRAINT brands_name_key UNIQUE (name)
);

-- 9. units
CREATE TABLE public.units (
    id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
    name text NOT NULL,
    short_name text NOT NULL,
    allow_decimals boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT units_pkey PRIMARY KEY (id),
    CONSTRAINT units_name_key UNIQUE (name)
);

-- 10. suppliers
CREATE TABLE public.suppliers (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    company_name text,
    email text,
    phone text,
    address text,
    tax_number text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    dob date,
    country text,
    city text,
    CONSTRAINT suppliers_pkey PRIMARY KEY (id)
);

-- 11. warehouses
CREATE TABLE public.warehouses (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    code text,
    phone text,
    email text,
    address text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    country text,
    city text,
    zip_code text,
    CONSTRAINT warehouses_pkey PRIMARY KEY (id),
    CONSTRAINT warehouses_code_key UNIQUE (code)
);

-- 12. transactions
CREATE TABLE public.transactions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid,
    total numeric DEFAULT 0,
    payment_method text,
    status text DEFAULT 'completed'::text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    remark text,
    paid_amount numeric DEFAULT 0,
    payment_status text DEFAULT 'completed'::text,
    voucher_no text,
    warehouse_id uuid,
    customer_id uuid,
    counter text,
    table_no text,
    tax_amount numeric DEFAULT 0,
    discount_amount numeric DEFAULT 0,
    shipping_amount numeric DEFAULT 0,
    discount_type text DEFAULT 'cash'::text,
    payment_details jsonb DEFAULT '[]'::jsonb,
    cashier text,
    shop text,
    customer_name text,
    tax_percent numeric DEFAULT 0,
    discount_value numeric DEFAULT 0,
    subtotal numeric DEFAULT 0,
    total_amount numeric DEFAULT 0,
    refund_amount numeric DEFAULT 0,
    items jsonb DEFAULT '[]'::jsonb,
    transaction_status text,
    CONSTRAINT transactions_pkey PRIMARY KEY (id),
    CONSTRAINT transactions_total_check CHECK (total >= 0::numeric),
    CONSTRAINT transactions_status_check CHECK (status = ANY (ARRAY['completed'::text, 'cancelled'::text, 'refunded'::text])),
    CONSTRAINT transactions_discount_type_check CHECK (discount_type = ANY (ARRAY['percent'::text, 'cash'::text]))
);

-- 13. transaction_items
CREATE TABLE public.transaction_items (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    transaction_id uuid,
    product_id uuid,
    product_name text NOT NULL,
    quantity integer NOT NULL,
    price numeric NOT NULL,
    subtotal numeric NOT NULL,
    discount numeric DEFAULT 0,
    CONSTRAINT transaction_items_pkey PRIMARY KEY (id),
    CONSTRAINT transaction_items_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id),
    CONSTRAINT transaction_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id),
    CONSTRAINT transaction_items_quantity_check CHECK (quantity > 0),
    CONSTRAINT transaction_items_price_check CHECK (price >= 0::numeric),
    CONSTRAINT transaction_items_subtotal_check CHECK (subtotal >= 0::numeric)
);

-- 14. purchases
CREATE TABLE public.purchases (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    date date NOT NULL DEFAULT CURRENT_DATE,
    reference_no text,
    supplier_id uuid,
    warehouse_id uuid,
    status text DEFAULT 'Received'::text,
    payment_status text DEFAULT 'Unpaid'::text,
    payment_type text,
    total_qty numeric DEFAULT 0,
    order_tax_percentage numeric DEFAULT 0,
    order_tax_amount numeric DEFAULT 0,
    discount_amount numeric DEFAULT 0,
    shipping_amount numeric DEFAULT 0,
    grand_total numeric DEFAULT 0,
    paid_amount numeric DEFAULT 0,
    note text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    shipping_method text,
    priority text DEFAULT 'Normal'::text,
    agent_name text,
    instructions text,
    expected_delivery date,
    reference_no_ext text,
    tax_code text,
    CONSTRAINT purchases_pkey PRIMARY KEY (id),
    CONSTRAINT purchases_reference_no_key UNIQUE (reference_no)
);

-- 15. purchase_items
CREATE TABLE public.purchase_items (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    purchase_id uuid,
    product_id uuid,
    quantity numeric NOT NULL,
    unit_cost numeric NOT NULL,
    discount_amount numeric DEFAULT 0,
    tax_percentage numeric DEFAULT 0,
    tax_amount numeric DEFAULT 0,
    subtotal numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    pcs_box text,
    remark text,
    item_status text DEFAULT 'Normal'::text,
    unit text,
    unit_id uuid,
    description text,
    discount_percentage numeric,
    CONSTRAINT purchase_items_pkey PRIMARY KEY (id),
    CONSTRAINT purchase_items_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES public.purchases(id),
    CONSTRAINT purchase_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);

-- 16. purchase_returns
CREATE TABLE public.purchase_returns (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    date date NOT NULL DEFAULT CURRENT_DATE,
    reference_no text,
    purchase_id uuid,
    supplier_id uuid,
    warehouse_id uuid,
    status text DEFAULT 'Completed'::text,
    payment_status text DEFAULT 'Paid'::text,
    grand_total numeric DEFAULT 0,
    note text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT purchase_returns_pkey PRIMARY KEY (id),
    CONSTRAINT purchase_returns_reference_no_key UNIQUE (reference_no)
);

-- 17. purchase_return_items
CREATE TABLE public.purchase_return_items (
    id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
    return_id uuid,
    product_id uuid,
    quantity numeric NOT NULL,
    unit_price numeric NOT NULL,
    total numeric NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    CONSTRAINT purchase_return_items_pkey PRIMARY KEY (id)
);

-- 18. adjustments
CREATE TABLE public.adjustments (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    product_id uuid,
    type text NOT NULL,
    quantity integer NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    cost numeric DEFAULT 0,
    amount numeric DEFAULT 0,
    remark text,
    CONSTRAINT adjustments_pkey PRIMARY KEY (id)
);

-- 19. transfers
CREATE TABLE public.transfers (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    date date DEFAULT CURRENT_DATE,
    from_warehouse_id uuid,
    to_warehouse_id uuid,
    total_qty numeric DEFAULT 0,
    grand_total numeric DEFAULT 0,
    remark text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT transfers_pkey PRIMARY KEY (id)
);

-- 20. transfer_items
CREATE TABLE public.transfer_items (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    transfer_id uuid,
    product_id uuid,
    quantity numeric DEFAULT 0,
    unit_cost numeric DEFAULT 0,
    subtotal numeric DEFAULT 0,
    remark text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT transfer_items_pkey PRIMARY KEY (id)
);

-- 21. expense_categories
CREATE TABLE public.expense_categories (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT expense_categories_pkey PRIMARY KEY (id),
    CONSTRAINT expense_categories_name_key UNIQUE (name)
);

-- 22. expenses
CREATE TABLE public.expenses (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    date date DEFAULT CURRENT_DATE,
    category_id uuid,
    item text NOT NULL,
    amount numeric DEFAULT 0,
    payment_method text,
    remark text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    warehouse_id uuid,
    reference_no text,
    CONSTRAINT expenses_pkey PRIMARY KEY (id)
);

-- 23. customers
CREATE TABLE public.customers (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    company_name text,
    email text,
    phone text,
    address text,
    tax_number text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    dob date,
    country text,
    city text,
    CONSTRAINT customers_pkey PRIMARY KEY (id)
);

-- 24. roles
CREATE TABLE public.roles (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text,
    permissions jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT roles_pkey PRIMARY KEY (id),
    CONSTRAINT roles_name_key UNIQUE (name)
);

-- 25. currencies
CREATE TABLE public.currencies (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    code text NOT NULL,
    name text NOT NULL,
    symbol text,
    exchange_rate numeric DEFAULT 1,
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    CONSTRAINT currencies_pkey PRIMARY KEY (id),
    CONSTRAINT currencies_code_key UNIQUE (code)
);

-- 26. languages
CREATE TABLE public.languages (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    code text NOT NULL,
    name text NOT NULL,
    flag text,
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    CONSTRAINT languages_pkey PRIMARY KEY (id),
    CONSTRAINT languages_code_key UNIQUE (code)
);

-- 27. settings
CREATE TABLE public.settings (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    store_name text,
    store_address text,
    store_phone text,
    store_email text,
    store_logo text,
    tax_rate numeric DEFAULT 0,
    currency_symbol text DEFAULT '$'::text,
    updated_at timestamp with time zone DEFAULT now(),
    default_currency text,
    default_email text,
    currency_icon_right boolean DEFAULT false,
    footer text,
    default_customer text DEFAULT 'walk-in-customer'::text,
    default_warehouse uuid,
    country text,
    state text,
    city text,
    postal_code text,
    date_format text DEFAULT 'YYYY-MM-DD'::text,
    developed_by text,
    purchase_prefix text DEFAULT 'PU'::text,
    purchase_return_prefix text DEFAULT 'PR'::text,
    sales_prefix text DEFAULT 'SA'::text,
    sales_return_prefix text DEFAULT 'SR'::text,
    expense_prefix text DEFAULT 'EX'::text,
    mail_mailer text DEFAULT 'smtp'::text,
    mail_host text,
    mail_port text DEFAULT '1025'::text,
    sender_name text,
    mail_username text,
    mail_password text,
    mail_encryption text,
    show_note boolean DEFAULT true,
    show_phone boolean DEFAULT true,
    show_customer boolean DEFAULT true,
    show_address boolean DEFAULT true,
    show_email boolean DEFAULT false,
    show_tax_discount boolean DEFAULT true,
    show_barcode boolean DEFAULT true,
    show_logo_payment boolean DEFAULT false,
    show_product_code boolean DEFAULT false,
    receipt_note text,
    CONSTRAINT settings_pkey PRIMARY KEY (id)
);

-- 28. sms_templates
CREATE TABLE public.sms_templates (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    message text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT sms_templates_pkey PRIMARY KEY (id)
);

-- 29. email_templates
CREATE TABLE public.email_templates (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    subject text NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT email_templates_pkey PRIMARY KEY (id)
);

-- 30. api_settings
CREATE TABLE public.api_settings (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    sms_provider text,
    sms_api_key text,
    sms_api_secret text,
    sms_sender_id text,
    payment_gateway text,
    payment_public_key text,
    payment_secret_key text,
    webhook_url text DEFAULT 'https://yourapp.com/api/webhook'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT api_settings_pkey PRIMARY KEY (id)
);

-- 31. quotations
CREATE TABLE public.quotations (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    date date NOT NULL DEFAULT CURRENT_DATE,
    reference_no text,
    customer_id uuid,
    warehouse_id uuid,
    status text DEFAULT 'Sent'::text,
    total_qty numeric DEFAULT 0,
    order_tax_percentage numeric DEFAULT 0,
    order_tax_amount numeric DEFAULT 0,
    discount_amount numeric DEFAULT 0,
    shipping_amount numeric DEFAULT 0,
    grand_total numeric DEFAULT 0,
    note text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT quotations_pkey PRIMARY KEY (id),
    CONSTRAINT quotations_reference_no_key UNIQUE (reference_no)
);

-- 32. quotation_items
CREATE TABLE public.quotation_items (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    quotation_id uuid,
    product_id uuid,
    net_unit_price numeric DEFAULT 0,
    stock numeric DEFAULT 0,
    unit text,
    quantity numeric DEFAULT 1,
    discount_amount numeric DEFAULT 0,
    tax_percentage numeric DEFAULT 0,
    tax_amount numeric DEFAULT 0,
    subtotal numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT quotation_items_pkey PRIMARY KEY (id)
);

-- 33. payment_methods
CREATE TABLE public.payment_methods (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    CONSTRAINT payment_methods_pkey PRIMARY KEY (id),
    CONSTRAINT payment_methods_name_key UNIQUE (name)
);

-- 34. product_barcodes
CREATE TABLE public.product_barcodes (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    product_id uuid,
    barcode text NOT NULL,
    unit_type text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT product_barcodes_pkey PRIMARY KEY (id),
    CONSTRAINT product_barcodes_barcode_key UNIQUE (barcode)
);

-- 35. product_suppliers
CREATE TABLE public.product_suppliers (
    product_id uuid NOT NULL,
    supplier_id uuid NOT NULL,
    CONSTRAINT product_suppliers_pkey PRIMARY KEY (product_id, supplier_id)
);

-- 36. product_warehouses
CREATE TABLE public.product_warehouses (
    product_id uuid NOT NULL,
    warehouse_id uuid NOT NULL,
    stock integer DEFAULT 0,
    CONSTRAINT product_warehouses_pkey PRIMARY KEY (product_id, warehouse_id)
);

-- Foreign Keys (Post-Creation for circular dependencies)
ALTER TABLE public.products ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id);
ALTER TABLE public.products ADD CONSTRAINT products_subcategory_id_fkey FOREIGN KEY (subcategory_id) REFERENCES public.subcategories(id);
ALTER TABLE public.products ADD CONSTRAINT products_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id);
ALTER TABLE public.products ADD CONSTRAINT products_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id);
ALTER TABLE public.transactions ADD CONSTRAINT transactions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);
ALTER TABLE public.transactions ADD CONSTRAINT transactions_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);
ALTER TABLE public.purchases ADD CONSTRAINT purchases_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);
ALTER TABLE public.purchases ADD CONSTRAINT purchases_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);
ALTER TABLE public.purchase_returns ADD CONSTRAINT purchase_returns_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES public.purchases(id);
ALTER TABLE public.purchase_returns ADD CONSTRAINT purchase_returns_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);
ALTER TABLE public.purchase_returns ADD CONSTRAINT purchase_returns_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);
ALTER TABLE public.transfers ADD CONSTRAINT transfers_from_warehouse_id_fkey FOREIGN KEY (from_warehouse_id) REFERENCES public.warehouses(id);
ALTER TABLE public.transfers ADD CONSTRAINT transfers_to_warehouse_id_fkey FOREIGN KEY (to_warehouse_id) REFERENCES public.warehouses(id);
ALTER TABLE public.expenses ADD CONSTRAINT expenses_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.expense_categories(id);
ALTER TABLE public.expenses ADD CONSTRAINT expenses_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);
ALTER TABLE public.quotations ADD CONSTRAINT quotations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);
ALTER TABLE public.quotations ADD CONSTRAINT quotations_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);
ALTER TABLE public.product_barcodes ADD CONSTRAINT product_barcodes_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);
ALTER TABLE public.product_suppliers ADD CONSTRAINT product_suppliers_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);
ALTER TABLE public.product_suppliers ADD CONSTRAINT product_suppliers_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);
ALTER TABLE public.product_warehouses ADD CONSTRAINT product_warehouses_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);
ALTER TABLE public.product_warehouses ADD CONSTRAINT product_warehouses_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);
