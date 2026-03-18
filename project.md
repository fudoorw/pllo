# PROJ: Nova POS POS System - Architecture & Context for AI Prompt Injection

## 1. Project Overview
Nova POS POS is a robust, web-based Point of Sale (POS) system designed for retail and inventory management. It features multi-warehouse support, product variations, barcode scanning, sales/purchase flows, and comprehensive reporting. The backend utilizes Supabase for authentication, real-time database, and serverless functions.

## 2. Technology Stack
- **Frontend**: Vanilla HTML5, CSS3, JavaScript (ES6+). No heavy frameworks (React/Vue/Angular).
- **Backend**: Supabase (PostgreSQL, GoTrue for Auth, PostgREST for APIs).
- **Communication**: PostMessage API for parent-iframe communication (Grid patterns).
- **Design**: Font Awesome 6.4.0, Google Fonts (Inter), Flatpickr (Dates), TomSelect (Selects).
- **Styling**: Custom CSS with variables, "Glassmorphism" utility classes (`glass-card`, `glass-input`).

## 3. Core File Structure
```text
/                       - Main UI Entry Points
├── index.html          - Login / Gateway
├── admin-dashboard.html- Main Admin Shell
├── pos.html            - Retail Sales Interface
├── products.html       - Inventory Management
├── purchase-add.html   - Stock Replenishment Entry
├── purchase-order.html - Purchase Order Creation (Excel Grid)
├── purchase-list.html  - Procurement Listing
├── report.html         - Business Intelligence
├── settings.html       - Application Configuration
├── js/                 - Logic & State Management
│   ├── app-config.js   - Global configuration singleton
│   ├── auth.js         - Session & Role Gatekeeper
│   ├── supabase-client.js - Backend initialization
│   ├── data-loader.js  - Resilient fetching abstraction
│   ├── purchase-order.js- Advanced PO UI logic (Grid)
│   ├── purchases.js    - Procurement workflows & DB saving
│   ├── dashboard.js    - Metrics aggregation logic
│   └── permissions.js  - RBAC (Role-Based Access Control)
├── css/                - Styling
│   ├── styles.css      - Global Design System
│   ├── dashboard.css   - Admin Specific Styles
│   └── glass.css       - Glassmorphism components
└── supabase/           - Backend Definitions
    └── supabase_schema_export.sql - Source of truth for DB Schema
```

## 4. Application Architecture Patterns

### Initialization & Auth Flow
1. **Config Load**: `config.js` sets API keys.
2. **Supabase Client**: `js/supabase-client.js` initializes `window.supabase`.
3. **AppConfig**: `js/app-config.js` fetches global settings (store name, currency) into `window.AppConfig`.
4. **Auth Check**: `js/auth.js` verifies the session and redirects to login if unauthorized.

### Resilient Data Fetching (`data-loader.js`)
The system uses a `DataLoader` utility to ensure reliable performance even on unstable networks:
- **Retry Logic**: Automatic retries with exponential backoff for failed requests.
- **Offline Detection**: Uses `navigator.onLine` to pause fetches and notify the user.
- **Loading UI**: Managed through `showLoading()` and `hideLoading()` with a "warmed-up" flag.
- **Optimization**: After the first successful load, subsequent background refreshes often skip the full-page overlay to improve perceived speed.

### UI & UX Patterns
- **Glassmorphism**: A modern UI aesthetic using semi-transparent backgrounds and blurs (`backdrop-filter`).
- **Iframe Bridge**: Complex modules like the "Excel-style" item entry often run in iframes. They communicate with the parent window via `postMessage` to sync state or trigger redirects.
- **Dynamic Grids**: Used heavily in Purchases and Sales for fast data entry.

---

## 5. Implementation Deep Dives

### Purchase Order Logic (`purchase-order.js`)
This module implements a high-performance, keyboard-friendly data entry grid:
- **Excel-Style Grid**: Mimics spreadsheet behavior with Arrow Key navigation and Enter-to-next-row logic.
- **Product Lookup**: Real-time search by `item_code` or `barcode`. It uses a `Map` cache for fast local lookups after the initial fetch.
- **Unit Conversion**: Handles complex logic for "Boxes" vs. "Pieces" calculations dynamically.
- **Drafting**: Auto-saves current state to `localStorage` to prevent data loss.

### Savings & Inventory Workflow (`purchases.js`)
Handling the procurement lifecycle:
1. **Validation**: Strict client-side validation for suppliers, warehouses, and at least one item.
2. **Transaction Simulation**: Saves the main `purchases` record first, retrieves the ID, then performs bulk inserts for `purchase_items`.
3. **Inventory Sync**: Upon successful purchase save, it calls a Supabase RPC function (`increment_stock`) to atomically update warehouse quantities.
4. **Returns**: Partial or full returns decrease stock and update the `return_status` of the original purchase.

### Dashboard & Metrics (`dashboard.js`)
Aggregates business intelligence in real-time:
- **Parallel Fetching**: Uses `Promise.all` to fetch Sales, Purchases, Expenses, and Cash Book data simultaneously.
- **Timeframe Filtering**: Supports predefined filters (Today, This Month) and custom date ranges via Flatpickr.
- **Dynamic Calculations**: Computes Gross Profit and Net Profit on-the-fly based on filtered data.
- **Warehouse Context**: All metrics can be scoped to a specific warehouse or "All Warehouses".

---

## 6. Database Schema Summary
### Core Tables
- **products**: `id`, `item_code`, `name`, `cost`, `price`, `item_image`.
- **warehouses**: `id`, `name`, `location`.
- **stocks**: Junction table linking `product_id` and `warehouse_id` with `quantity`.
- **purchases**: `id`, `supplier_id`, `warehouse_id`, `total_amount`, `paid_amount`, `status`.
- **transactions**: `id`, `customer_id`, `total`, `discount`, `payment_method`.

### Role-Based Access Control (RBAC)
Managed via `public.user_roles`:
- **admin**: Full system access.
- **cashier**: Restricted to POS and basic sales reporting.
- **manager**: Can manage inventory and view most reports, but restricted from system settings.

## 7. Development Guidelines for AI
- **Vanilla JS**: Do not introduce frameworks. Use ES6 modules and standard APIs.
- **Error Handling**: Always use `try/catch` with `DataLoader` integration for UI feedback.
- **Aesthetics**: Follow the Glassmorphism patterns. Use HSL colors for consistency.
- **Atomic Operations**: For stock changes, always use database RPC calls to ensure consistency.
- **Context Aware**: Before suggesting changes, check `app-config.js` to see how global settings are handled.
