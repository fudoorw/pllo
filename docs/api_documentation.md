# API Documentation (Comprehensive) - POS Project

This updated document provides a 100% complete overview of the Supabase API interface for the "pos" project.

## 1. REST API (PostgREST)
Every table listed below is accessible via standard REST operations at `https://jjjdzpmxyifubbnvktwn.supabase.co/rest/v1/`.

### Core Application Tables
| Category | Tables |
| :--- | :--- |
| **Catalog** | `products`, `categories`, `subcategories`, `brands`, `units`, `variation_types`, `variation_options`, `product_variations` |
| **Sales** | `transactions`, `transaction_items` |
| **Purchases** | `purchases`, `purchase_items`, `purchase_returns`, `purchase_return_items` |
| **Inventory** | `warehouses`, `adjustments`, `transfers`, `transfer_items` |
| **People** | `suppliers`, `customers`, `user_roles`, `roles` |
| **Expenses** | `expense_categories`, `expenses` |
| **Other** | `quotations`, `quotation_items`, `settings`, `sms_templates`, `email_templates`, `api_settings`, `currencies`, `languages`, `payment_methods` |
| **Mapping** | `product_barcodes`, `product_suppliers`, `product_warehouses` |

## 2. API Connection Details
To connect to the backend, use the following credentials with the Supabase client library:

- **Supabase URL**: `https://jjjdzpmxyifubbnvktwn.supabase.co`
- **Anon Key (Legacy)**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqamR6cG14eWlmdWJibnZrdHduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjY5MDYsImV4cCI6MjA4NjIwMjkwNn0.cz1ejFGDNHnSSCLU7n5lg59WZVchqT4JpfHfuXy0Rpg`
- **Publishable Key**: `sb_publishable_MOCc6fvCuOl0vQLenQ6-KQ_ZOOmMYre`

### Connection Example (JavaScript)
```javascript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://jjjdzpmxyifubbnvktwn.supabase.co'
const supabaseKey = 'sb_publishable_MOCc6fvCuOl0vQLenQ6-KQ_ZOOmMYre'
const supabase = createClient(supabaseUrl, supabaseKey)

// Example: Fetch products
const { data, error } = await supabase.from('products').select('*')
```

## 3. Endpoints
- **REST Root**: `/rest/v1/`
- **Edge Functions**: `/functions/v1/`
    - `admin-create-user`: Used for programmatic user management.

## 4. Recommended Query Patterns
- **Fetch Products with Category**: `GET /rest/v1/products?select=*,categories(*)`
- **Fetch Sales with Items**: `GET /rest/v1/transactions?select=*,transaction_items(*)`
- **Filter Inventory by Warehouse**: `GET /rest/v1/product_warehouses?warehouse_id=eq.{id}`
