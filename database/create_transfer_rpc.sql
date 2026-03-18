CREATE OR REPLACE FUNCTION process_transfer_stock(
    p_from_warehouse_id UUID,
    p_to_warehouse_id UUID,
    p_product_id UUID,
    p_quantity INT
) RETURNS void AS $$
BEGIN
    -- 1) Decrement stock from the source warehouse
    UPDATE product_warehouses
    SET stock = stock - p_quantity
    WHERE product_id = p_product_id
      AND warehouse_id = p_from_warehouse_id;

    -- Optional check to ensure it didn't do something weird or go below 0 if you want strict constraints
    -- IF NOT FOUND THEN RAISE EXCEPTION 'Product not found in source warehouse'; END IF;

    -- 2) Increment stock in the destination warehouse (or Insert if not exists)
    INSERT INTO product_warehouses (product_id, warehouse_id, stock)
    VALUES (p_product_id, p_to_warehouse_id, p_quantity)
    ON CONFLICT (product_id, warehouse_id)
    DO UPDATE SET stock = product_warehouses.stock + p_quantity;

END;
$$ LANGUAGE plpgsql;
