// Initialize Supabase Client
let supabase_client = null;

function initSupabase() {
    // 1. Try parent window first (useful for iframes in dashboard)
    // Wrapped in try/catch to prevent SecurityError on file:// protocol
    try {
        if (window.parent && window.parent !== window && window.parent.supabase && typeof window.parent.supabase.from === 'function') {
            supabase_client = window.parent.supabase;
        }
    } catch (e) {
        // Cross-origin access blocked (file:// protocol) — fall through to local init
        console.log('Parent supabase access blocked, using local init');
    }

    // 2. Initialize local client if needed or if requested via postMessage
    const url = 'https://jjjdzpmxyifubbnvktwn.supabase.co';
    const key = 'sb_publishable_MOCc6fvCuOl0vQLenQ6-KQ_ZOOmMYre';

    if (!supabase_client && window.supabase) {
        if (typeof window.supabase.from === 'function') {
            supabase_client = window.supabase;
        } else if (typeof window.supabase.createClient === 'function') {
            supabase_client = window.supabase.createClient(url, key);
        }
    } else if (!supabase_client && typeof supabase !== 'undefined' && typeof supabase.createClient === 'function') {
        supabase_client = supabase.createClient(url, key);
    }

    if (!supabase_client) {
        console.error('Supabase client not initialized');
    }
    return supabase_client;
}

// Initialize on load
initSupabase();

const fmt = n => Number(n || 0).toLocaleString();
const fmtDate = d => {
    if (!d) return '-';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    const day = String(dt.getDate()).padStart(2, '0');
    const month = dt.toLocaleString('en-US', { month: 'short' });
    const year = dt.getFullYear();
    return `${day}-${month}-${year}`;
};
const mkD = (ago = 0) => { const d = new Date(); d.setDate(d.getDate() - ago); return d.toISOString().slice(0, 10) };
const PS = 15;

function getPrefixes() {
    let salesPrefix = 'INV';
    let purchasePrefix = 'PUR';
    try {
        const config = window.parent?.AppConfig || window.AppConfig;
        if (config && typeof config.get === 'function') {
            salesPrefix = config.get('sales_prefix', 'INV');
            purchasePrefix = config.get('purchase_prefix', 'PUR');
        }
    } catch (e) {
        // Fallback for isolated environments
    }
    return { salesPrefix, purchasePrefix };
}

// Shared data state
let DATA = [];
let pg = 0;
let srch = getUrlParam('q') || '', dF = getUrlParam('df') || '', dT = getUrlParam('dt') || '';

function getUrlParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
}

// Communication with parent
function sendToParent(type, data) {
    window.parent.postMessage({ type, ...data }, '*');
}

// Initial filters from parent if any
window.addEventListener('message', async (e) => {
    if (e.data.type === 'filter') {
        srch = e.data.search || '';
        dF = e.data.dateFrom || '';
        dT = e.data.dateTo || '';
        refresh();
    } else if (e.data.type === 'EXPORT_REPORT') {
        // Handle export request from parent (avoids cross-origin direct access)
        if (typeof window.exportToExcel === 'function') {
            window.exportToExcel(e.data.filename || 'report');
        }
    } else if (e.data.type === 'AUTH_SESSION') {
        // Handle auth session from parent to ensure RLS access
        if (supabase_client && e.data.session) {
            try {
                await supabase_client.auth.setSession(e.data.session);
                console.log('Report authenticated via shared session');
                refresh(); // Re-fetch data now that we are authenticated
            } catch (err) {
                console.error('Failed to set session from parent:', err);
            }
        }
    }
});

async function refresh() {
    const type = getUrlParam('type');
    if (!type) return;
    await fetchData(type);
    renderV(type);
}

async function fetchAll(query) {
    let allData = [];
    const pageSize = 1000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await query.range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) {
            hasMore = false;
        } else {
            allData = allData.concat(data);
            if (data.length < pageSize) {
                hasMore = false;
            } else {
                from += pageSize;
            }
        }
    }
    return allData;
}

async function fetchData(v) {
    try {
        const warehouseFilter = window.parent?.document?.getElementById('warehouse-filter');
        const warehouseId = warehouseFilter ? warehouseFilter.value : '';

        let query;
        switch (v) {
            case 'sale-detail':
                query = supabase_client.from('transaction_items').select('*, products!inner(code, barcodes, name, category, brand, cost, price, supplier, categories(name), subcategories(name), brands(name)), transactions!inner(created_at, shop, warehouse_id, warehouse:warehouses(name))').order('created_at', { foreignTable: 'transactions', ascending: false });
                break;
            case 'sale-summary':
                query = supabase_client.from('transactions').select('*, customers(name), warehouses(name)').order('created_at', { ascending: false });
                break;
            case 'purchase-detail':
                query = supabase_client.from('purchase_items').select('*, products(code, barcodes, name, category, brand, cost, price, categories(name), subcategories(name), brands(name)), purchases!inner(date, supplier_id, suppliers(name), warehouse_id, warehouses(name))').order('date', { foreignTable: 'purchases', ascending: false });
                break;
            case 'purchase-summary':
                query = supabase_client.from('purchases').select('*, suppliers(name), warehouses(name)').order('date', { ascending: false });
                break;
            case 'stock-report':
            case 'low-stock':
                if (warehouseId) {
                    query = supabase_client.from('product_warehouses')
                        .select('stock, products!inner(id, code, barcodes, name, category, brand, cost, price, supplier, categories(name), subcategories(name), brands(name))')
                        .eq('warehouse_id', warehouseId);
                    if (v === 'low-stock') query = query.lte('stock', 20);
                    query = query.order('products(name)', { ascending: true });
                } else {
                    query = supabase_client.from('products').select('*, categories(name), subcategories(name), brands(name)');
                    if (v === 'low-stock') query = query.lte('stock', 20);
                    query = query.order('name', { ascending: true });
                }
                break;
            case 'top-selling':
                query = supabase_client.from('transaction_items').select('*, transactions!inner(created_at, shop, warehouse_id, warehouse:warehouses(name)), products(code, barcodes, name, category, brand, price, supplier, subcategories(name), categories(name), brands(name))');
                break;
            case 'supplier-report':
                query = supabase_client.from('suppliers').select('*');
                break;
            case 'supplier-outstanding':
                query = supabase_client.from('suppliers').select('*');
                break;
            case 'customer-report':
                query = supabase_client.from('customers').select('*');
                break;
            case 'customer-outstanding':
                query = supabase_client.from('customers').select('*');
                break;
            case 'log-report':
                query = supabase_client.from('transactions').select('created_at, voucher_no, id, user_id, cashier, status, payment_method, total_amount').order('created_at', { ascending: false });
                break;
            case 'stock-history':
            case 'stock-history-new':
                break;
            case 'profit-loss':
            case 'cash-book':
                query = supabase_client.from('transactions').select('*, customers(name)').order('created_at', { ascending: false });
                break;
            case 'promotion-report':
                query = supabase_client.from('transaction_items').select('*, products(code, barcodes, name, supplier), promotions(name, code), transactions!inner(created_at, shop)').gt('discount', 0);
                break;
            default:
                query = supabase_client.from('transactions').select('*').order('created_at', { ascending: false });
        }

        if (dF || dT) {
            const needsDate = ['sale-detail', 'sale-summary', 'purchase-detail', 'purchase-summary', 'log-report', 'profit-loss', 'promotion-report', 'cash-book', 'stock-history', 'top-selling'].includes(v);
            if (needsDate) {
                const isDate = (v === 'purchase-detail' || v === 'purchase-summary');
                let dCol = isDate ? 'date' : 'created_at';

                // Prefix columns for joined tables
                if (v === 'top-selling' || v === 'sale-detail' || v === 'promotion-report') dCol = 'transactions.created_at';
                if (v === 'purchase-detail') dCol = 'purchases.date';

                if (dF) query = query.gte(dCol, isDate ? dF : dF + 'T00:00:00');
                if (dT) query = query.lte(dCol, isDate ? dT : dT + 'T23:59:59');
            }
        }

        if (warehouseId) {
            const needsWarehouse = ['sale-detail', 'sale-summary', 'purchase-detail', 'purchase-summary', 'top-selling', 'profit-loss', 'cash-book', 'promotion-report', 'adjustments', 'stock-report', 'low-stock', 'log-report'].includes(v);
            if (needsWarehouse) {
                let wCol = 'warehouse_id';
                if (v === 'sale-detail' || v === 'top-selling' || v === 'promotion-report') wCol = 'transactions.warehouse_id';
                if (v === 'purchase-detail') wCol = 'purchases.warehouse_id';
                query = query.eq(wCol, warehouseId);
            }
        }

        let data = [];
        if (v === 'log-report') {
            const { salesPrefix } = getPrefixes();
            const res = await query.limit(200);
            data = res.data || [];
            if (res.error) throw res.error;
            
            DATA = data.map(r => ({
                ts: fmtDate(r.created_at),
                user: userMap[r.user_id] || r.cashier || '-',
                action: r.status || 'Transaction',
                mod: 'Sales',
                ref: r.voucher_no ? `${salesPrefix}-${r.voucher_no}` : (r.id?.slice(0, 8).toUpperCase() || '-'),
                amt: fmt(r.total_amount),
                result: 'success'
            }));
        } else if (v !== 'stock-history' && v !== 'stock-history-new') {
            data = await fetchAll(query);
        }



        // Common metadata for name resolution
        let supplierMap = {};
        if (['sale-detail', 'top-selling', 'promotion-report', 'stock-report', 'low-stock'].includes(v)) {
            const { data: suppliers } = await supabase_client.from('suppliers').select('id, name');
            if (suppliers) suppliers.forEach(s => supplierMap[s.id] = s.name);
        }

        let userMap = {};
        if (['sale-summary', 'log-report'].includes(v)) {
            try {
                const { data: users } = await supabase_client.from('user_profiles').select('user_id, display_name');
                if (users) users.forEach(u => userMap[u.user_id] = u.display_name);
            } catch (e) {
                console.warn('Could not fetch user profiles for mapping', e);
            }
        }

        // Transform data based on type (Logic from original report.html)
        if (v === 'sale-detail') {
            // Group by product - show aggregated product sales
            const groups = {};
            data.forEach(r => {
                const prod = r.products;
                const pid = prod?.id || r.product_id || 'unknown';
                if (!groups[pid]) {
                    groups[pid] = {
                        itemCode: prod?.code || '-',
                        barcode: prod?.barcodes?.[0] || '-',
                        description: prod?.name || '-',
                        category: prod?.categories?.name || prod?.category || '-',
                        subCategory: prod?.subcategories?.name || '-',
                        brand: prod?.brands?.name || prod?.brand || '-',
                        price: prod?.price || 0,
                        qty: 0,
                        amount: 0,
                        discount: 0,
                        shop: r.transactions?.warehouse?.name || r.transactions?.shop || 'Main Shop',
                        supplier: supplierMap[prod?.supplier] || prod?.supplier || '-'
                    };
                }
                groups[pid].qty += Number(r.quantity) || 0;
                groups[pid].amount += Number(r.subtotal) || 0;
                groups[pid].discount += Number(r.discount) || 0;
            });
            DATA = Object.values(groups).sort((a, b) => b.amount - a.amount);
        } else if (v === 'sale-summary') {
            const { salesPrefix } = getPrefixes();
            // Detailed transaction list with all fields
            DATA = data.map(r => {
                // Support both total_amount and total columns for robustness
                const total = Number(r.total_amount) || Number(r.total) || 0;
                const discount = Number(r.discount) || 0;
                const status = (r.payment_status || '').toLowerCase();
                const paid = Number(r.paid_amount) || (status === 'completed' || status === 'paid' ? total : 0);
                const remain = Math.max(0, total - paid);

                // Map status to consistent labels for UI
                let displayStatus = 'Paid';
                if (status === 'partial') displayStatus = 'Partial';
                else if (status === 'unpaid' || (total > 0 && paid === 0)) displayStatus = 'Unpaid';
                else if (status === 'completed') displayStatus = 'Paid';
                else displayStatus = r.payment_status || 'Paid';

                return {
                    dateTime: r.created_at ? fmtDate(r.created_at) : '-',
                    ref: r.voucher_no ? `${salesPrefix}-${r.voucher_no}` : (r.id?.slice(0, 8).toUpperCase() || '-'),
                    cust: r.customers?.name || r.customer_name || 'Walk-in',
                    shop: r.warehouses?.name || r.shop || 'Main Shop',
                    total: total,
                    net: total - discount,
                    discount: discount,
                    paid: paid,
                    remain: remain,
                    pay: displayStatus,
                    method: r.payment_method || 'Cash',
                    counter: userMap[r.counter] || userMap[r.user_id] || r.cashier || r.counter || '-',
                    remark: r.remark || '-'
                };
            }).sort((a, b) => b.dateTime.localeCompare(a.dateTime));
        } else if (v === 'purchase-detail') {
            // Group by product - show aggregated product purchases
            const groups = {};
            data.forEach(r => {
                const prod = r.products;
                const pid = prod?.id || r.product_id || 'unknown';
                if (!groups[pid]) {
                    groups[pid] = {
                        itemCode: prod?.code || '-',
                        barcode: prod?.barcodes?.[0] || '-',
                        description: prod?.name || '-',
                        category: prod?.categories?.name || prod?.category || '-',
                        subCategory: prod?.subcategories?.name || '-',
                        brand: prod?.brands?.name || prod?.brand || '-',
                        cost: prod?.cost || 0,
                        qty: 0,
                        amount: 0,
                        discount: 0,
                        shop: r.purchases?.warehouses?.name || 'Main Shop',
                        supplier: r.purchases?.suppliers?.name || '-'
                    };
                }
                groups[pid].qty += Number(r.quantity) || 0;
                groups[pid].amount += Number(r.subtotal) || 0;
                groups[pid].discount += Number(r.discount_amount) || 0;
            });
            DATA = Object.values(groups).sort((a, b) => b.amount - a.amount);
        } else if (v === 'purchase-summary') {
            const { purchasePrefix } = getPrefixes();
            // Detailed purchase list with all fields
            DATA = data.map(r => {
                const total = Number(r.grand_total) || 0;
                const discount = Number(r.discount_amount) || 0;
                const paid = Number(r.paid_amount) || (r.payment_status === 'Paid' ? total : 0);
                const remain = Math.max(0, total - paid);
                return {
                    date: fmtDate(r.date),
                    ref: r.reference_no ? `${purchasePrefix}-${r.reference_no}` : (r.id?.slice(0, 8).toUpperCase() || '-'),
                    sup: r.suppliers?.name || 'Unknown',
                    shop: r.warehouses?.name || 'Main Shop',
                    total: total,
                    net: total - discount,
                    discount: discount,
                    paid: paid,
                    remain: remain,
                    pay: r.payment_status || 'Paid',
                    method: r.payment_type || 'Cash',
                    remark: r.note || r.remark || '-'
                };
            }).sort((a, b) => b.date.localeCompare(a.date));
        } else if (v === 'profit-loss') {
            // 1. Fetch sales with items (relational)
            let salesQuery = supabase_client.from('transactions')
                .select('*, transaction_items(product_id, quantity, price, products(cost))')
                .gte('created_at', dF ? dF + 'T00:00:00' : '2000-01-01')
                .lte('created_at', dT ? dT + 'T23:59:59' : '2100-01-01');
            if (warehouseId) salesQuery = salesQuery.eq('warehouse_id', warehouseId);
            const { data: salesData } = await salesQuery;

            // 2. Fetch expenses for the period
            let expensesQuery = supabase_client.from('expenses')
                .select('*, expense_categories(name)')
                .gte('date', dF || '2000-01-01')
                .lte('date', dT || '2100-01-01');
            if (warehouseId) expensesQuery = expensesQuery.eq('warehouse_id', warehouseId);
            const { data: expensesData } = await expensesQuery;

            const costMap = {};
            const needsCost = new Set();
            (salesData || []).forEach(r => {
                if (!r.transaction_items || r.transaction_items.length === 0) {
                    const items = Array.isArray(r.items) ? r.items : [];
                    items.forEach(it => { if (it.id) needsCost.add(it.id); });
                }
            });

            if (needsCost.size > 0) {
                const { data: costs } = await supabase_client.from('products').select('id, cost').in('id', Array.from(needsCost));
                (costs || []).forEach(c => costMap[c.id] = Number(c.cost) || 0);
            }

            let totalRev = 0, totalCog = 0;
            const daily = {};

            (salesData || []).forEach(r => {
                const d = fmtDate(r.created_at);
                if (!daily[d]) daily[d] = { date: d, rev: 0, cog: 0 };
                const rev = Number(r.total_amount) || Number(r.total) || 0;
                daily[d].rev += rev;
                totalRev += rev;

                let cogs = 0;
                if (r.transaction_items && r.transaction_items.length > 0) {
                    r.transaction_items.forEach(item => {
                        cogs += (Number(item.quantity) || 0) * (Number(item.products?.cost) || 0);
                    });
                } else {
                    const items = Array.isArray(r.items) ? r.items : [];
                    items.forEach(it => { cogs += (Number(it.qty) || 0) * (costMap[it.id] || 0); });
                }
                daily[d].cog += cogs;
                totalCog += cogs;
            });

            // Aggregate Expenses by category
            const expGroups = {};
            let totalExp = 0;
            (expensesData || []).forEach(e => {
                const cat = e.expense_categories?.name || 'Miscellaneous';
                const amt = Number(e.amount) || 0;
                expGroups[cat] = (expGroups[cat] || 0) + amt;
                totalExp += amt;
            });

            // We store everything in a single object but inside an array to keep DATA compatible
            DATA = [{
                summary: {
                    rev: totalRev,
                    cog: totalCog,
                    gp: totalRev - totalCog,
                    expenses: Object.entries(expGroups).map(([name, amount]) => ({ name, amount })),
                    totalExp: totalExp,
                    np: (totalRev - totalCog) - totalExp
                },
                daily: Object.values(daily).sort((a, b) => b.date.localeCompare(a.date))
            }];
        } else if (v === 'promotion-report') {
            // Aggregate by Product + Promotion
            const groups = {};
            data.forEach(r => {
                const pId = r.product_id || 'unknown';
                const prId = r.promotion_id || 'manual';
                const key = `${pId}-${prId}`;
                if (!groups[key]) {
                    const prod = r.products || {};
                    const promo = r.promotions || {};
                    groups[key] = {
                        item_code: prod.code || '-',
                        barcode: prod.barcodes?.[0] || '-',
                        name: prod.name || '-',
                        promo_title: promo.name || r.promotion_status || 'Individual Discount',
                        promo_code: promo.code || '-',
                        promo_status: r.promotion_status || 'Applied',
                        qty: 0,
                        disc: 0,
                        rev: 0,
                        count: 0,
                        supplier: supplierMap[prod.supplier] || prod.supplier || '-'
                    };
                }
                groups[key].qty += Number(r.quantity) || 0;
                groups[key].disc += Number(r.discount) || 0;
                groups[key].rev += Number(r.subtotal) || 0;
                groups[key].count++;
            });
            DATA = Object.values(groups).sort((a, b) => b.disc - a.disc);
        } else if (v === 'cash-book') {
            const entries = [];

            // 1. Calculate Opening Balance (Total before dF) - parallelized
            let openBal = 0;
            if (dF) {
                const startDate = dF + 'T00:00:00';

                // Fetch all opening balance data in parallel
                let oldSalesQ = supabase_client.from('transactions').select('total_amount').lt('created_at', startDate);
                let oldPurchasesQ = supabase_client.from('purchases').select('grand_total').lt('date', dF);
                let oldExpensesQ = supabase_client.from('expenses').select('amount').lt('date', dF);

                if (warehouseId) {
                    oldSalesQ = oldSalesQ.eq('warehouse_id', warehouseId);
                    oldPurchasesQ = oldPurchasesQ.eq('warehouse_id', warehouseId);
                    oldExpensesQ = oldExpensesQ.eq('warehouse_id', warehouseId);
                }

                const [oldSalesRes, oldPurchasesRes, oldExpensesRes] = await Promise.all([
                    oldSalesQ, oldPurchasesQ, oldExpensesQ
                ]);

                (oldSalesRes.data || []).forEach(s => openBal += Number(s.total_amount) || 0);
                (oldPurchasesRes.data || []).forEach(p => openBal -= Number(p.grand_total) || 0);
                (oldExpensesRes.data || []).forEach(e => openBal -= Number(e.amount) || 0);

                entries.push({
                    date: fmtDate(dF),
                    ref: '-',
                    desc: 'Opening Balance',
                    cat: 'System',
                    type: 'OPEN',
                    inv: openBal,
                    out: 0,
                    amt: openBal,
                    bal: openBal,
                    method: '-'
                });
            }

            // 2. Fetch Period Data - parallelized purchases + expenses
            // Sales (already fetched in main query above)
            data.forEach(r => entries.push({
                date: fmtDate(r.created_at),
                ts: r.created_at,
                ref: r.voucher_no || r.id.slice(0, 8),
                desc: 'Sales - ' + (r.customers?.name || r.customer_name || 'Walk-in'),
                cat: 'Sales',
                type: 'IN',
                inv: Number(r.total_amount) || 0,
                out: 0,
                amt: Number(r.total_amount) || 0,
                method: r.payment_method || 'Cash'
            }));

            // Fetch purchases + expenses in parallel
            try {
                let pQuery = supabase_client.from('purchases').select('date, reference_no, id, grand_total, payment_type, suppliers(name)').order('date', { ascending: true });
                let eQuery = supabase_client.from('expenses').select('date, reference_no, id, amount, payment_method, item, expense_categories(name)').order('date', { ascending: true });
                if (dF) { pQuery = pQuery.gte('date', dF); eQuery = eQuery.gte('date', dF); }
                if (dT) { pQuery = pQuery.lte('date', dT); eQuery = eQuery.lte('date', dT); }
                if (warehouseId) { pQuery = pQuery.eq('warehouse_id', warehouseId); eQuery = eQuery.eq('warehouse_id', warehouseId); }

                const [purchasesRes, expensesRes] = await Promise.all([
                    fetchAll(pQuery),
                    fetchAll(eQuery)
                ]);

                (purchasesRes || []).forEach(r => entries.push({
                    date: fmtDate(r.date),
                    ts: r.date + 'T00:00:00',
                    ref: r.reference_no || r.id.slice(0, 8),
                    desc: 'Purchase - ' + (r.suppliers?.name || 'Supplier'),
                    cat: 'Purchase',
                    type: 'OUT',
                    inv: 0,
                    out: Number(r.grand_total) || 0,
                    amt: Number(r.grand_total) || 0,
                    method: r.payment_type || 'Cash'
                }));

                // fetchAll returns a plain array, not {data}, so use directly
                (expensesRes || []).forEach(r => entries.push({
                    date: fmtDate(r.date),
                    ts: r.date + 'T00:00:00',
                    ref: r.reference_no || r.id?.slice(0, 8) || '-',
                    desc: r.item || 'Expense',
                    cat: r.expense_categories?.name || 'Expense',
                    type: 'OUT',
                    inv: 0,
                    out: Number(r.amount) || 0,
                    amt: Number(r.amount) || 0,
                    method: r.payment_method || 'Cash'
                }));
            } catch (e) { console.warn('Cash book: fetch error', e); }

            // 3. Sort and Calculate Running Balance
            // Sort by Date, then by type (OPEN first, then transactions)
            const sorted = entries.sort((a, b) => {
                if (a.date !== b.date) return a.date.localeCompare(b.date);
                if (a.type === 'OPEN') return -1;
                if (b.type === 'OPEN') return 1;
                return (a.ts || '').localeCompare(b.ts || '');
            });

            let currentBal = 0;
            sorted.forEach(row => {
                if (row.type === 'OPEN') {
                    currentBal = row.bal;
                } else {
                    currentBal += (row.type === 'IN' ? row.inv : -row.out);
                    row.bal = currentBal;
                }
            });

            DATA = sorted.reverse(); // Show newest at top for display
        } else if (v === 'stock-report' || v === 'low-stock') {
            // Get supplier names - products can have multiple suppliers
            let supplierMap = {};
            let productSuppliers = [];
            let warehouseMap = {};
            try {
                // Fetch all suppliers
                const { data: suppliers } = await supabase_client.from('suppliers').select('id, name');
                if (suppliers) {
                    suppliers.forEach(s => supplierMap[s.id] = s.name);
                }

                // Fetch all warehouses for shop name mapping
                const { data: wh } = await supabase_client.from('warehouses').select('id, name');
                if (wh) {
                    wh.forEach(w => warehouseMap[w.id] = w.name);
                }

                // Fetch product-supplier relationships
                const { data: ps } = await supabase_client.from('product_suppliers').select('product_id, supplier_id, suppliers(name)');
                if (ps) {
                    productSuppliers = ps;
                }
            } catch (e) {
                console.warn('Could not fetch metadata for stock report', e);
            }

            // Build product -> suppliers mapping
            const productSupplierMap = {};
            productSuppliers.forEach(ps => {
                if (!productSupplierMap[ps.product_id]) {
                    productSupplierMap[ps.product_id] = [];
                }
                const name = ps.suppliers?.name || supplierMap[ps.supplier_id] || '-';
                if (!productSupplierMap[ps.product_id].includes(name)) {
                    productSupplierMap[ps.product_id].push(name);
                }
            });

            DATA = (data || []).map(r => {
                const p = r.products || r; // Support both direct products and joined product_warehouses
                const barcodes = p.barcodes;
                const barcode = Array.isArray(barcodes) ? barcodes[0] : (barcodes || '');

                // Get supplier names for this product
                const supplierNames = productSupplierMap[p.id] || [];
                const supplierDisplay = supplierNames.length > 0 ? supplierNames.join(', ') : (p.supplier || '-');

                // Stock value depends on whether we joined with product_warehouses
                const stockVal = r.products ? r.stock : p.stock;

                return {
                    itemCode: p.code || p.item_code || '-',
                    barcode: barcode || '-',
                    description: p.name || p.product_name || '-',
                    category: (Array.isArray(p.categories) ? p.categories[0]?.name : p.categories?.name) || p.category_name || p.category || '-',
                    subCategory: (Array.isArray(p.subcategories) ? p.subcategories[0]?.name : p.subcategories?.name) || '-',
                    brand: (Array.isArray(p.brands) ? p.brands[0]?.name : p.brands?.name) || p.brand_name || p.brand || '-',
                    cost: parseFloat(p.cost) || 0,
                    price: parseFloat(p.price) || 0,
                    qty: parseFloat(stockVal) || 0,
                    shop: r.products ? (warehouseMap[warehouseId] || 'Selected Shop') : (warehouseMap[p.shop] || p.shop || 'Main Shop'),
                    supplier: supplierDisplay,
                    remark: p.note || p.remark || '-'
                };
            });
        } else if (v === 'log-report') {
            // Transaction history (real data, no fakes)
            DATA = data.map(r => ({
                ts: fmtDate(r.created_at),
                user: userMap[r.cashier] || userMap[r.user_id] || r.cashier || 'Admin',
                action: 'SALE',
                mod: 'POS',
                ref: r.voucher_no || r.id.slice(0, 8),
                amt: fmt(Number(r.total_amount) || 0),
                result: r.status || 'completed'
            }));
        } else if (v === 'stock-history' || v === 'stock-history-new') {
            try {
                const startDate = dF || '2000-01-01';
                const endDate = dT || new Date().toISOString().slice(0, 10);
                const nowIso = new Date().toISOString();

                // 1. Fetch all movement data from startDate until NOW for back-calculation
                let purQ = supabase_client.from('purchase_items').select('product_id, quantity, subtotal, purchases!inner(date, warehouse_id)').gte('purchases.date', startDate);
                let salQ = supabase_client.from('transaction_items').select('product_id, quantity, subtotal, discount, transactions!inner(created_at, warehouse_id, shop)').gte('transactions.created_at', startDate + 'T00:00:00');
                let retQ = supabase_client.from('purchase_return_items').select('product_id, quantity, purchase_returns!inner(date, warehouse_id)').gte('purchase_returns.date', startDate);
                let traQ = supabase_client.from('transfer_items').select('product_id, quantity, transfers!inner(date, from_warehouse_id, to_warehouse_id)').gte('transfers.date', startDate);
                let adjQ = supabase_client.from('adjustments').select('product_id, quantity, created_at, warehouse_id').gte('created_at', startDate + 'T00:00:00');

                if (warehouseId) {
                    purQ = purQ.eq('purchases.warehouse_id', warehouseId);
                    salQ = salQ.eq('transactions.warehouse_id', warehouseId);
                    retQ = retQ.eq('purchase_returns.warehouse_id', warehouseId);
                    traQ = traQ.or(`from_warehouse_id.eq.${warehouseId},to_warehouse_id.eq.${warehouseId}`, { foreignTable: 'transfers' });
                    adjQ = adjQ.eq('warehouse_id', warehouseId);
                }

                const [purchases, sales, purchaseReturns, transfers, adjustments, warehouses] = await Promise.all([
                    fetchAll(purQ), fetchAll(salQ), fetchAll(retQ), fetchAll(traQ), fetchAll(adjQ),
                    supabase_client.from('warehouses').select('id, name')
                ]);

                const warehouseMap = {};
                (warehouses.data || []).forEach(w => warehouseMap[w.id] = w.name);

                // 2. Identify unique active product IDs
                const activeIds = new Set();
                const addIds = (list, key = 'product_id') => (list || []).forEach(item => { if (item[key]) activeIds.add(item[key]); });
                addIds(purchases); addIds(sales); addIds(purchaseReturns); addIds(transfers); addIds(adjustments);

                if (activeIds.size === 0) { DATA = []; return; }

                // 3. Fetch current stock for active products
                const activeIdArr = Array.from(activeIds);
                let productsData = [];
                for (let i = 0; i < activeIdArr.length; i += 500) {
                    const chunk = activeIdArr.slice(i, i + 500);
                    let pChunkQuery;
                    if (warehouseId) {
                        pChunkQuery = supabase_client.from('product_warehouses')
                            .select('stock, products!inner(id, code, barcodes, name)')
                            .in('product_id', chunk)
                            .eq('warehouse_id', warehouseId);
                    } else {
                        pChunkQuery = supabase_client.from('products')
                            .select('id, code, barcodes, name, stock')
                            .in('id', chunk);
                    }
                    const { data: pChunk } = await pChunkQuery;
                    if (pChunk) {
                        if (warehouseId) {
                            productsData = productsData.concat(pChunk.map(r => ({ ...r.products, stock: r.stock })));
                        } else {
                            productsData = productsData.concat(pChunk);
                        }
                    }
                }

                const productMap = {};
                productsData.forEach(p => {
                    productMap[p.id] = {
                        id: p.id,
                        code: p.code,
                        barcode: Array.isArray(p.barcodes) ? p.barcodes[0] : (p.barcodes || ''),
                        name: p.name,
                        currentStock: Number(p.stock) || 0,
                        totalMovementSinceStart: 0 // To be calculated
                    };
                });

                const getDate = (item) => {
                    if (item.purchases?.date) return item.purchases.date;
                    if (item.purchase_returns?.date) return item.purchase_returns.date;
                    if (item.transfers?.date) return item.transfers.date;
                    if (item.transactions?.created_at) return item.transactions.created_at.slice(0, 10);
                    if (item.created_at) return item.created_at.slice(0, 10);
                    return '-';
                };

                const getWarehouse = (item) => {
                    if (item.purchases?.warehouse_id) return warehouseMap[item.purchases.warehouse_id] || 'Main Shop';
                    if (item.purchase_returns?.warehouse_id) return warehouseMap[item.purchase_returns.warehouse_id] || 'Main Shop';
                    if (item.transfers?.from_warehouse_id) return warehouseMap[item.transfers.from_warehouse_id] || 'Main Shop';
                    if (item.transfers?.to_warehouse_id) return warehouseMap[item.transfers.to_warehouse_id] || 'Main Shop';
                    if (item.transactions?.shop) return item.transactions.shop;
                    if (item.warehouse_id) return warehouseMap[item.warehouse_id] || 'Main Shop';
                    return 'Main Shop';
                };

                // Helper to calculate total movements since start to back-calculate opening balance
                const calcMovement = (item, multiplier) => {
                    if (productMap[item.product_id]) {
                        productMap[item.product_id].totalMovementSinceStart += (Number(item.quantity) || 0) * multiplier;
                    }
                };

                purchases.forEach(r => calcMovement(r, 1));
                sales.forEach(r => calcMovement(r, -1));
                purchaseReturns.forEach(r => calcMovement(r, -1));
                adjustments.forEach(r => calcMovement(r, 1)); // Assuming positive is add
                transfers.forEach(r => {
                    const pid = r.product_id;
                    const fromW = r.transfers?.from_warehouse_id;
                    const toW = r.transfers?.to_warehouse_id;
                    const qty = Number(r.quantity) || 0;

                    if (warehouseId) {
                        if (fromW === warehouseId) calcMovement(r, -1);
                        else if (toW === warehouseId) calcMovement(r, 1);
                    } else {
                        // Global transfers net to 0
                    }
                });

                // Calculate opening balance at startDate per product
                Object.values(productMap).forEach(p => {
                    p.openingAtStart = p.currentStock - p.totalMovementSinceStart;
                });

                // 4. Group movements within the REQUESTED period for rendering
                const grouped = {};
                const addMovement = (item, typeKey, qtyMultiplier = 1) => {
                    const pid = item.product_id;
                    const date = getDate(item);
                    if (!pid || date === '-' || date > endDate) return; // Only show up to endDate
                    
                    const key = `${pid}_${date}`;
                    if (!grouped[key]) {
                        const p = productMap[pid] || { code: '-', barcode: '-', name: 'Unknown', openingAtStart: 0 };
                        grouped[key] = {
                            productId: pid,
                            date: date,
                            dateTime: fmtDate(date),
                            itemCode: p.code,
                            barcode: p.barcode,
                            description: p.name,
                            openingQty: 0, 
                            purchaseQty: 0, saleQty: 0, purchaseReturnQty: 0,
                            saleReturnQty: 0, transferQty: 0, adjustmentQty: 0,
                            closingQty: 0,
                            shop: getWarehouse(item)
                        };
                    }
                    grouped[key][typeKey] += (Number(item.quantity) || 0) * qtyMultiplier;
                };

                purchases.forEach(r => addMovement(r, 'purchaseQty'));
                sales.forEach(r => addMovement(r, 'saleQty'));
                purchaseReturns.forEach(r => addMovement(r, 'purchaseReturnQty'));
                adjustments.forEach(r => addMovement(r, 'adjustmentQty'));
                transfers.forEach(r => {
                    const fromW = r.transfers?.from_warehouse_id;
                    const toW = r.transfers?.to_warehouse_id;
                    if (warehouseId) {
                        if (fromW === warehouseId) addMovement(r, 'transferQty', -1);
                        else if (toW === warehouseId) addMovement(r, 'transferQty', 1);
                    } else {
                        // Global net 0
                    }
                });

                // 5. Finalize rows with running balances per product
                const productHistory = {};
                Object.values(grouped).sort((a,b) => a.date.localeCompare(b.date)).forEach(row => {
                    if (!productHistory[row.productId]) {
                        productHistory[row.productId] = productMap[row.productId].openingAtStart;
                    }
                    row.openingQty = productHistory[row.productId];
                    const netChange = (row.purchaseQty || 0) - (row.saleQty || 0) - (row.purchaseReturnQty || 0) + (row.adjustmentQty || 0);
                    row.closingQty = row.openingQty + netChange;
                    productHistory[row.productId] = row.closingQty;
                });

                DATA = Object.values(grouped).sort((a, b) => {
                    if (a.date !== b.date) return b.date.localeCompare(a.date); // Newest date top
                    return (a.itemCode || '').localeCompare(b.itemCode || '');
                });

            } catch (e) {
                console.error('Stock history error:', e);
                DATA = [];
            }
        } else if (v === 'top-selling') {
            const groups = {};
            data.forEach(r => {
                const id = r.product_id || 'unknown';
                const p = r.products || {};
                const t = r.transactions || {};

                if (!groups[id]) {
                    const barcode = Array.isArray(p.barcodes) ? p.barcodes[0] : (p.barcodes || '-');
                    const cat = (Array.isArray(p.categories) ? p.categories[0]?.name : p.categories?.name) || p.category || '-';
                    const sub = (Array.isArray(p.subcategories) ? p.subcategories[0]?.name : p.subcategories?.name) || '-';
                    const brand = (Array.isArray(p.brands) ? p.brands[0]?.name : p.brands?.name) || p.brand || '-';
                    const shop = t.warehouse?.name || t.shop || 'Main Shop';

                    groups[id] = {
                        itemCode: p.code || '-',
                        barcode: barcode,
                        description: p.name || 'Unknown',
                        category: cat,
                        subCategory: sub,
                        brand: brand,
                        price: Number(p.price) || 0,
                        discount: 0,
                        qty: 0,
                        total: 0,
                        shop: shop,
                        supplier: supplierMap[p.supplier] || p.supplier || '-'
                    };
                }
                groups[id].qty += (Number(r.quantity) || 0);
                groups[id].discount += (Number(r.discount) || 0);
                groups[id].total += (Number(r.subtotal) || 0);
            });
            DATA = Object.values(groups).sort((a, b) => b.qty - a.qty);
        } else if (v === 'customer-outstanding') {
            // Calculate outstanding from unpaid transactions
            const { data: unpaid } = await supabase_client.from('transactions')
                .select('customer_id, customer_name, total_amount, paid_amount')
                .neq('payment_status', 'Paid').limit(10000);
            const custBal = {};
            (unpaid || []).forEach(r => {
                const id = r.customer_id || r.customer_name || 'Walk-in';
                if (!custBal[id]) custBal[id] = { name: '', bal: 0 };
                custBal[id].name = r.customer_name || 'Walk-in';
                custBal[id].bal += (Number(r.total_amount) || 0) - (Number(r.paid_amount) || 0);
            });
            // Match with customer data
            DATA = data.map(r => {
                const owed = custBal[r.id]?.bal || 0;
                return { name: r.name, phone: r.phone || '-', limit: 0, bal: owed, status: owed > 0 ? 'Outstanding' : 'Clear' };
            }).filter(r => r.bal > 0);
        } else if (v === 'supplier-outstanding') {
            // Calculate outstanding from unpaid purchases
            const { data: unpaidPur } = await supabase_client.from('purchases')
                .select('supplier_id, grand_total, paid_amount')
                .neq('payment_status', 'Paid').limit(10000);
            const supBal = {};
            (unpaidPur || []).forEach(r => {
                const id = r.supplier_id;
                if (!supBal[id]) supBal[id] = 0;
                supBal[id] += (Number(r.grand_total) || 0) - (Number(r.paid_amount) || 0);
            });
            DATA = data.map(r => {
                const owed = supBal[r.id] || 0;
                return { name: r.name, phone: r.phone || '-', limit: 0, bal: owed, status: owed > 0 ? 'Outstanding' : 'Clear' };
            }).filter(r => r.bal > 0);
        } else if (v === 'customer-report') {
            // Calculate outstanding per customer from unpaid transactions
            const { data: custUnpaid } = await supabase_client.from('transactions')
                .select('customer_id, total_amount, paid_amount')
                .neq('payment_status', 'Paid').limit(10000);
            const custOwed = {};
            (custUnpaid || []).forEach(r => {
                if (r.customer_id) {
                    if (!custOwed[r.customer_id]) custOwed[r.customer_id] = 0;
                    custOwed[r.customer_id] += (Number(r.total_amount) || 0) - (Number(r.paid_amount) || 0);
                }
            });
            DATA = data.map(r => ({
                name: r.name || '', phone: r.phone || '-', email: r.email || '-',
                addr: r.address || '-', out: custOwed[r.id] || 0
            }));
        } else if (v === 'supplier-report') {
            // Calculate outstanding per supplier from unpaid purchases
            const { data: supUnpaid } = await supabase_client.from('purchases')
                .select('supplier_id, grand_total, paid_amount')
                .neq('payment_status', 'Paid').limit(10000);
            const supOwed = {};
            (supUnpaid || []).forEach(r => {
                if (r.supplier_id) {
                    if (!supOwed[r.supplier_id]) supOwed[r.supplier_id] = 0;
                    supOwed[r.supplier_id] += (Number(r.grand_total) || 0) - (Number(r.paid_amount) || 0);
                }
            });
            DATA = data.map(r => ({
                name: r.name || '', email: r.email || '-', phone: r.phone || '-',
                addr: r.address || '-', out: supOwed[r.id] || 0
            }));
        } else {
            DATA = data;
        }

        if (srch) {
            const searchQ = srch.toLowerCase();
            DATA = DATA.filter(x => JSON.stringify(Object.values(x)).toLowerCase().includes(searchQ));
        }

        // Update stats topbar in parent
        sendToParent('stats-update', { type: v, data: DATA });

    } catch (err) {
        console.error('Fetch Error:', err);
        DATA = [];
    }
}

function renderPager(v, total) {
    const pages = Math.ceil(total / PS);
    const pgEl = document.getElementById('pg-' + v);
    if (!pgEl) return;

    let html = `<span class="pi">Showing ${pg * PS + 1} to ${Math.min((pg + 1) * PS, total)} of ${total}</span>`;
    html += `<div class="pb-row">`;
    html += `<div class="pb ${pg === 0 ? 'off' : ''}" onclick="setPg(${pg - 1})"><i class="fas fa-chevron-left"></i></div>`;

    // Simple pagination: current page focus
    for (let i = 0; i < pages; i++) {
        if (i < 3 || i > pages - 4 || (i >= pg - 1 && i <= pg + 1)) {
            html += `<div class="pb ${pg === i ? 'on' : ''}" onclick="setPg(${i})">${i + 1}</div>`;
        } else if (i === 3 || i === pages - 4) {
            html += `<div class="pb off">...</div>`;
        }
    }

    html += `<div class="pb ${pg >= pages - 1 ? 'off' : ''}" onclick="setPg(${pg + 1})"><i class="fas fa-chevron-right"></i></div>`;
    html += `</div>`;
    pgEl.innerHTML = html;
}

function setPg(i) {
    if (i < 0) return;
    pg = i;
    renderV(getUrlParam('type'));
}

// Export to Excel/CSV
function exportToExcel(filename = 'report') {
    if (!DATA || DATA.length === 0) {
        alert('No data to export');
        return;
    }

    // Get column headers from first data object
    const headers = Object.keys(DATA[0]);

    // Build CSV content
    let csv = headers.join(',') + '\n';

    DATA.forEach(row => {
        const values = headers.map(h => {
            let val = row[h];
            // Handle null/undefined
            if (val === null || val === undefined) val = '';
            // Escape quotes and wrap in quotes if contains comma
            if (typeof val === 'string') {
                val = val.replace(/"/g, '""');
                if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                    val = '"' + val + '"';
                }
            }
            return val;
        });
        csv += values.join(',') + '\n';
    });

    // Create blob and download
    const BOM = '\uFEFF'; // UTF-8 BOM
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename + '_' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Make export function available globally
window.exportToExcel = exportToExcel;
