-- Migration: Add warehouse_id to adjustments table
ALTER TABLE public.adjustments 
ADD COLUMN warehouse_id uuid REFERENCES public.warehouses(id);

-- Optional: Add index for performance
CREATE INDEX idx_adjustments_warehouse_id ON public.adjustments(warehouse_id);
