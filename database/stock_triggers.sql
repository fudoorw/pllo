-- Centralized Stock Management Triggers (Robust Version)
-- This script ensures that stock is updated automatically across all modules
-- and handles cascading deletions correctly via dual parent/child triggers.

-- 1. Helper function to update both global and warehouse stock
CREATE OR REPLACE FUNCTION update_inventory_levels(p_id UUID, w_id UUID, qty_delta NUMERIC) RETURNS VOID AS $$
BEGIN
    IF p_id IS NULL OR w_id IS NULL THEN
        RETURN;
    END IF;

    -- Update Global Stock
    UPDATE public.products 
    SET stock = COALESCE(stock, 0) + qty_delta,
        updated_at = now()
    WHERE id = p_id;
    
    -- Update Warehouse Stock
    INSERT INTO public.product_warehouses (product_id, warehouse_id, stock)
    VALUES (p_id, w_id, qty_delta)
    ON CONFLICT (product_id, warehouse_id)
    DO UPDATE SET stock = COALESCE(product_warehouses.stock, 0) + qty_delta;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Sales (transactions & transaction_items)
CREATE OR REPLACE FUNCTION trg_handle_transaction_delete_stock() RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    -- Flag this transaction ID as handled for the current session to prevent double-counting in child trigger
    PERFORM set_config('app.deleted_tx_id', OLD.id::text, true);
    
    -- Restore stock for all items
    FOR r IN SELECT product_id, quantity FROM public.transaction_items WHERE transaction_id = OLD.id LOOP
        PERFORM update_inventory_levels(r.product_id, OLD.warehouse_id, r.quantity);
    END LOOP;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sale_delete_stock_sync ON public.transactions;
CREATE TRIGGER trg_sale_delete_stock_sync BEFORE DELETE ON public.transactions FOR EACH ROW EXECUTE FUNCTION trg_handle_transaction_delete_stock();

CREATE OR REPLACE FUNCTION trg_handle_sale_stock() RETURNS TRIGGER AS $$
DECLARE
    v_warehouse_id UUID;
BEGIN
    IF (TG_OP = 'INSERT') THEN
        SELECT warehouse_id INTO v_warehouse_id FROM public.transactions WHERE id = NEW.transaction_id;
        IF v_warehouse_id IS NOT NULL THEN
            PERFORM update_inventory_levels(NEW.product_id, v_warehouse_id, -NEW.quantity);
        END IF;
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        -- Only run if NOT handled by the parent trigger (prevents double-counting on cascade)
        IF COALESCE(current_setting('app.deleted_tx_id', true), '') != OLD.transaction_id::text THEN
            SELECT warehouse_id INTO v_warehouse_id FROM public.transactions WHERE id = OLD.transaction_id;
            IF v_warehouse_id IS NOT NULL THEN
                PERFORM update_inventory_levels(OLD.product_id, v_warehouse_id, OLD.quantity);
            END IF;
        END IF;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sale_stock_sync ON transaction_items;
CREATE TRIGGER trg_sale_stock_sync BEFORE INSERT OR DELETE ON transaction_items FOR EACH ROW EXECUTE FUNCTION trg_handle_sale_stock();


-- 3. Purchases (purchases & purchase_items)
CREATE OR REPLACE FUNCTION trg_handle_purchase_status_change() RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
    v_qty NUMERIC;
BEGIN
    -- If status changed to Received from something else
    IF (OLD.status != 'Received' OR OLD.status IS NULL) AND NEW.status = 'Received' THEN
        FOR r IN SELECT product_id, quantity, unit, COALESCE(pcs_box::numeric, 1) as conv, COALESCE(item_status, 'Normal') as i_status FROM public.purchase_items WHERE purchase_id = NEW.id LOOP
            IF r.i_status = 'Normal' THEN
                v_qty := r.quantity;
                IF UPPER(r.unit) LIKE '%BOX%' THEN
                    v_qty := v_qty * r.conv;
                END IF;
                PERFORM update_inventory_levels(r.product_id, NEW.warehouse_id, v_qty);
            END IF;
        END LOOP;
    -- If status changed from Received to something else
    ELSIF OLD.status = 'Received' AND (NEW.status != 'Received' OR NEW.status IS NULL) THEN
        FOR r IN SELECT product_id, quantity, unit, COALESCE(pcs_box::numeric, 1) as conv, COALESCE(item_status, 'Normal') as i_status FROM public.purchase_items WHERE purchase_id = OLD.id LOOP
            IF r.i_status = 'Normal' THEN
                v_qty := r.quantity;
                IF UPPER(r.unit) LIKE '%BOX%' THEN
                    v_qty := v_qty * r.conv;
                END IF;
                PERFORM update_inventory_levels(r.product_id, OLD.warehouse_id, -v_qty);
            END IF;
        END LOOP;
    -- If warehouse changed but status remains Received
    ELSIF OLD.status = 'Received' AND NEW.status = 'Received' AND OLD.warehouse_id != NEW.warehouse_id THEN
        FOR r IN SELECT product_id, quantity, unit, COALESCE(pcs_box::numeric, 1) as conv, COALESCE(item_status, 'Normal') as i_status FROM public.purchase_items WHERE purchase_id = NEW.id LOOP
            IF r.i_status = 'Normal' THEN
                v_qty := r.quantity;
                IF UPPER(r.unit) LIKE '%BOX%' THEN
                    v_qty := v_qty * r.conv;
                END IF;
                PERFORM update_inventory_levels(r.product_id, OLD.warehouse_id, -v_qty);
                PERFORM update_inventory_levels(r.product_id, NEW.warehouse_id, v_qty);
            END IF;
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_purchase_status_update_stock ON public.purchases;
CREATE TRIGGER trg_purchase_status_update_stock AFTER UPDATE OF status, warehouse_id ON public.purchases FOR EACH ROW EXECUTE FUNCTION trg_handle_purchase_status_change();


CREATE OR REPLACE FUNCTION trg_handle_purchase_delete_stock() RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
    v_qty NUMERIC;
BEGIN
    PERFORM set_config('app.deleted_purchase_id', OLD.id::text, true);
    
    IF OLD.status = 'Received' THEN
        FOR r IN SELECT product_id, quantity, unit, COALESCE(pcs_box::numeric, 1) as conv, COALESCE(item_status, 'Normal') as i_status FROM public.purchase_items WHERE purchase_id = OLD.id LOOP
            IF r.i_status = 'Normal' THEN
                v_qty := r.quantity;
                IF UPPER(r.unit) LIKE '%BOX%' THEN
                    v_qty := v_qty * r.conv;
                END IF;
                PERFORM update_inventory_levels(r.product_id, OLD.warehouse_id, -v_qty);
            END IF;
        END LOOP;
    END IF;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_purchase_delete_stock_sync ON public.purchases;
CREATE TRIGGER trg_purchase_delete_stock_sync BEFORE DELETE ON public.purchases FOR EACH ROW EXECUTE FUNCTION trg_handle_purchase_delete_stock();

CREATE OR REPLACE FUNCTION trg_handle_purchase_stock() RETURNS TRIGGER AS $$
DECLARE
    v_warehouse_id UUID;
    v_status TEXT;
    v_new_qty NUMERIC;
    v_old_qty NUMERIC;
BEGIN
    IF (TG_OP = 'INSERT') THEN
        IF COALESCE(NEW.item_status, 'Normal') = 'Normal' THEN
            SELECT warehouse_id, status INTO v_warehouse_id, v_status FROM public.purchases WHERE id = NEW.purchase_id;
            IF v_warehouse_id IS NOT NULL AND v_status = 'Received' THEN
                v_new_qty := NEW.quantity;
                IF UPPER(NEW.unit) LIKE '%BOX%' THEN
                    v_new_qty := v_new_qty * COALESCE(NEW.pcs_box::numeric, 1);
                END IF;
                PERFORM update_inventory_levels(NEW.product_id, v_warehouse_id, v_new_qty);
            END IF;
        END IF;
        RETURN NEW;
    ELSIF (TG_OP = 'UPDATE') THEN
        SELECT warehouse_id, status INTO v_warehouse_id, v_status FROM public.purchases WHERE id = NEW.purchase_id;
        IF v_warehouse_id IS NOT NULL AND v_status = 'Received' THEN
            -- First, revert old stock if it was 'Normal'
            IF COALESCE(OLD.item_status, 'Normal') = 'Normal' THEN
                v_old_qty := OLD.quantity;
                IF UPPER(OLD.unit) LIKE '%BOX%' THEN
                    v_old_qty := v_old_qty * COALESCE(OLD.pcs_box::numeric, 1);
                END IF;
                PERFORM update_inventory_levels(OLD.product_id, v_warehouse_id, -v_old_qty);
            END IF;
            -- Then, apply new stock if it is 'Normal'
            IF COALESCE(NEW.item_status, 'Normal') = 'Normal' THEN
                v_new_qty := NEW.quantity;
                IF UPPER(NEW.unit) LIKE '%BOX%' THEN
                    v_new_qty := v_new_qty * COALESCE(NEW.pcs_box::numeric, 1);
                END IF;
                PERFORM update_inventory_levels(NEW.product_id, v_warehouse_id, v_new_qty);
            END IF;
        END IF;
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        IF COALESCE(OLD.item_status, 'Normal') = 'Normal' THEN
            IF COALESCE(current_setting('app.deleted_purchase_id', true), '') != OLD.purchase_id::text THEN
                SELECT warehouse_id, status INTO v_warehouse_id, v_status FROM public.purchases WHERE id = OLD.purchase_id;
                IF v_warehouse_id IS NOT NULL AND v_status = 'Received' THEN
                    v_old_qty := OLD.quantity;
                    IF UPPER(OLD.unit) LIKE '%BOX%' THEN
                        v_old_qty := v_old_qty * COALESCE(OLD.pcs_box::numeric, 1);
                    END IF;
                    PERFORM update_inventory_levels(OLD.product_id, v_warehouse_id, -v_old_qty);
                END IF;
            END IF;
        END IF;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_purchase_stock_sync ON purchase_items;
CREATE TRIGGER trg_purchase_stock_sync BEFORE INSERT OR UPDATE OR DELETE ON purchase_items FOR EACH ROW EXECUTE FUNCTION trg_handle_purchase_stock();

-- 4. Returns (purchase_returns & purchase_return_items)
CREATE OR REPLACE FUNCTION trg_handle_purchase_return_delete_stock() RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
    v_qty NUMERIC;
BEGIN
    PERFORM set_config('app.deleted_return_id', OLD.id::text, true);
    IF OLD.status = 'Completed' THEN
        FOR r IN SELECT product_id, quantity, unit, pcs_box, item_status FROM public.purchase_return_items WHERE return_id = OLD.id LOOP
            IF COALESCE(r.item_status, 'Normal') = 'Normal' THEN
                v_qty := r.quantity;
                IF UPPER(r.unit) LIKE '%BOX%' THEN
                    v_qty := v_qty * COALESCE(r.pcs_box::numeric, 1);
                END IF;
                PERFORM update_inventory_levels(r.product_id, OLD.warehouse_id, v_qty);
            END IF;
        END LOOP;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_purchase_return_delete_stock_sync ON public.purchase_returns;
CREATE TRIGGER trg_purchase_return_delete_stock_sync BEFORE DELETE ON public.purchase_returns FOR EACH ROW EXECUTE FUNCTION trg_handle_purchase_return_delete_stock();

CREATE OR REPLACE FUNCTION trg_handle_purchase_return_stock() RETURNS TRIGGER AS $$
DECLARE
    v_warehouse_id UUID;
    v_status TEXT;
    v_qty NUMERIC;
BEGIN
    IF (TG_OP = 'INSERT') THEN
        SELECT warehouse_id, status INTO v_warehouse_id, v_status FROM public.purchase_returns WHERE id = NEW.return_id;
        IF v_warehouse_id IS NOT NULL AND v_status = 'Completed' THEN
            IF COALESCE(NEW.item_status, 'Normal') = 'Normal' THEN
                v_qty := NEW.quantity;
                IF UPPER(NEW.unit) LIKE '%BOX%' THEN
                    v_qty := v_qty * COALESCE(NEW.pcs_box::numeric, 1);
                END IF;
                PERFORM update_inventory_levels(NEW.product_id, v_warehouse_id, -v_qty);
            END IF;
        END IF;
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        IF COALESCE(current_setting('app.deleted_return_id', true), '') != OLD.return_id::text THEN
            SELECT warehouse_id, status INTO v_warehouse_id, v_status FROM public.purchase_returns WHERE id = OLD.return_id;
            IF v_warehouse_id IS NOT NULL AND v_status = 'Completed' THEN
                IF COALESCE(OLD.item_status, 'Normal') = 'Normal' THEN
                    v_qty := OLD.quantity;
                    IF UPPER(OLD.unit) LIKE '%BOX%' THEN
                        v_qty := v_qty * COALESCE(OLD.pcs_box::numeric, 1);
                    END IF;
                    PERFORM update_inventory_levels(OLD.product_id, v_warehouse_id, v_qty);
                END IF;
            END IF;
        END IF;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_purchase_return_stock_sync ON purchase_return_items;
CREATE TRIGGER trg_purchase_return_stock_sync BEFORE INSERT OR DELETE ON purchase_return_items FOR EACH ROW EXECUTE FUNCTION trg_handle_purchase_return_stock();


-- 5. Transfers (transfers & transfer_items)
CREATE OR REPLACE FUNCTION trg_handle_transfer_delete_stock() RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    PERFORM set_config('app.deleted_transfer_id', OLD.id::text, true);
    FOR r IN SELECT product_id, quantity FROM public.transfer_items WHERE transfer_id = OLD.id LOOP
        PERFORM update_inventory_levels(r.product_id, OLD.from_warehouse_id, r.quantity);
        PERFORM update_inventory_levels(r.product_id, OLD.to_warehouse_id, -r.quantity);
    END LOOP;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_transfer_delete_stock_sync ON public.transfers;
CREATE TRIGGER trg_transfer_delete_stock_sync BEFORE DELETE ON public.transfers FOR EACH ROW EXECUTE FUNCTION trg_handle_transfer_delete_stock();

CREATE OR REPLACE FUNCTION trg_handle_transfer_stock() RETURNS TRIGGER AS $$
DECLARE
    v_from_warehouse_id UUID;
    v_to_warehouse_id UUID;
BEGIN
    IF (TG_OP = 'INSERT') THEN
        SELECT from_warehouse_id, to_warehouse_id INTO v_from_warehouse_id, v_to_warehouse_id 
        FROM public.transfers WHERE id = NEW.transfer_id;
        IF v_from_warehouse_id IS NOT NULL THEN
            PERFORM update_inventory_levels(NEW.product_id, v_from_warehouse_id, -NEW.quantity);
            PERFORM update_inventory_levels(NEW.product_id, v_to_warehouse_id, NEW.quantity);
        END IF;
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        IF COALESCE(current_setting('app.deleted_transfer_id', true), '') != OLD.transfer_id::text THEN
            SELECT from_warehouse_id, to_warehouse_id INTO v_from_warehouse_id, v_to_warehouse_id 
            FROM public.transfers WHERE id = OLD.transfer_id;
            IF v_from_warehouse_id IS NOT NULL THEN
                PERFORM update_inventory_levels(OLD.product_id, v_from_warehouse_id, OLD.quantity);
                PERFORM update_inventory_levels(OLD.product_id, v_to_warehouse_id, -OLD.quantity);
            END IF;
        END IF;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_transfer_stock_sync ON transfer_items;
CREATE TRIGGER trg_transfer_stock_sync BEFORE INSERT OR DELETE ON transfer_items FOR EACH ROW EXECUTE FUNCTION trg_handle_transfer_stock();


-- 6. Ensure Cascading Deletes for items to trigger stock restoration
ALTER TABLE public.transaction_items DROP CONSTRAINT IF EXISTS transaction_items_transaction_id_fkey;
ALTER TABLE public.transaction_items ADD CONSTRAINT transaction_items_transaction_id_fkey 
    FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE CASCADE;

ALTER TABLE public.purchase_items DROP CONSTRAINT IF EXISTS purchase_items_purchase_id_fkey;
ALTER TABLE public.purchase_items ADD CONSTRAINT purchase_items_purchase_id_fkey 
    FOREIGN KEY (purchase_id) REFERENCES public.purchases(id) ON DELETE CASCADE;

ALTER TABLE public.purchase_return_items DROP CONSTRAINT IF EXISTS purchase_return_items_purchase_return_id_fkey;
ALTER TABLE public.purchase_return_items ADD CONSTRAINT purchase_return_items_purchase_return_id_fkey 
    FOREIGN KEY (return_id) REFERENCES public.purchase_returns(id) ON DELETE CASCADE;

ALTER TABLE public.transfer_items DROP CONSTRAINT IF EXISTS transfer_items_transfer_id_fkey;
ALTER TABLE public.transfer_items ADD CONSTRAINT transfer_items_transfer_id_fkey 
    FOREIGN KEY (transfer_id) REFERENCES public.transfers(id) ON DELETE CASCADE;
