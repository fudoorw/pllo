/**
 * Dashboard View Module
 * Handles date filtering, data loading from Supabase, and UI updates.
 */

let datePickers = {};
let warehousesData = [];

document.addEventListener('DOMContentLoaded', () => {
    initDateFilters();
    loadWarehouses();
    initDashboard();

    // Listen for postMessage from parent (admin-core.js) to reload dashboard data
    // This avoids cross-origin SecurityError when running on file:// protocol
    window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'LOAD_DASHBOARD') {
            initDashboard();
        }
    });
});

/**
 * Initialize Flatpickr Date Inputs
 */
function initDateFilters() {
    const config = {
        dateFormat: "d m y",
        disableMobile: "true",
        theme: "dark"
    };

    // Default to this month
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);

    datePickers.from = flatpickr("#date-from", {
        ...config,
        defaultDate: firstDay
    });

    datePickers.to = flatpickr("#date-to", {
        ...config,
        defaultDate: now
    });
}

/**
 * Load Warehouses for Filter
 */
async function loadWarehouses() {
    try {
        const { data, error } = await window.supabase
            .from('warehouses')
            .select('id, name')
            .order('name');

        if (error) throw error;

        warehousesData = data || [];

        const select = document.getElementById('warehouse-filter');
        if (select) {
            warehousesData.forEach(w => {
                const opt = document.createElement('option');
                opt.value = w.id;
                opt.textContent = w.name;
                select.appendChild(opt);
            });
        }
    } catch (e) {
        console.error('Error loading warehouses:', e);
    }
}

/**
 * Get selected warehouse ID
 */
function getSelectedWarehouse() {
    const select = document.getElementById('warehouse-filter');
    return select ? select.value : '';
}

/**
 * Main Initialization
 */
async function initDashboard() {
    console.log('Initializing Dashboard with Filters...');

    // Get dates from pickers
    const fromDate = datePickers.from ? datePickers.from.selectedDates[0] : null;
    const toDate = datePickers.to ? datePickers.to.selectedDates[0] : null;

    if (typeof window.showLoading === 'function') window.showLoading();

    try {
        await Promise.all([
            loadTopRowStats(fromDate, toDate),
            loadCashBookSummary(fromDate, toDate),
            loadProfitLossSummary(fromDate, toDate)
        ]);
        updatePeriodLabels(fromDate, toDate);
    } catch (error) {
        console.error('Dashboard init error:', error);
    } finally {
        if (typeof window.hideLoading === 'function') window.hideLoading();
    }
}

/**
 * Apply Filter Button Handler
 */
window.applyDashboardFilter = function () {
    initDashboard();
};

/**
 * Update UI labels to show the active range
 */
function updatePeriodLabels(from, to) {
    if (!from || !to) return;
    const fmt = d => d.toLocaleString('en-GB', { day: '2-digit', month: 'short' });
    const label = `${fmt(from)} - ${fmt(to)}`;

    const elements = ['sale-period', 'pur-period', 'pl-period'];
    elements.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = label;
    });
}

/**
 * Load SALE, PURCHASE, TRANSACTIONS, and ITEM IN STOCK panels
 */
async function loadTopRowStats(start, end) {
    try {
        if (!start || !end) return;

        const warehouseId = getSelectedWarehouse();

        // Prepare date strings
        const startISO = new Date(start.setHours(0, 0, 0, 0)).toISOString();
        const endISO = new Date(end.setHours(23, 59, 59, 999)).toISOString();
        const startYMD = startISO.split('T')[0];
        const endYMD = endISO.split('T')[0];

        // Build query with optional warehouse filter
        let salesQuery = window.supabase.from('transactions')
            .select('total_amount, payment_method, id, status, warehouse_id')
            .gte('created_at', startISO)
            .lte('created_at', endISO)
            .neq('status', 'cancelled');

        if (warehouseId) {
            salesQuery = salesQuery.eq('warehouse_id', warehouseId);
        }

        let purQuery = window.supabase.from('purchases')
            .select('grand_total, payment_type')
            .gte('date', startYMD)
            .lte('date', endYMD);

        let saleItemsQuery = window.supabase.from('transaction_items')
            .select('quantity, transaction_id');

        let purItemsQuery = window.supabase.from('purchase_items')
            .select('quantity, purchase_id');

        // Run all queries in parallel for better performance
        const [
            { data: sales },
            { data: purchases },
            { data: saleItems },
            { data: purItems }
        ] = await Promise.all([
            salesQuery.limit(10000),
            purQuery.limit(10000),
            saleItemsQuery.limit(10000),
            purItemsQuery.limit(10000)
        ]);

        const saleBreakdown = { Cash: 0, Credit: 0, KPay: 0, Wave: 0 };
        (sales || []).forEach(s => {
            const amt = Number(s.total_amount) || 0;
            const method = (s.payment_method || '').toLowerCase();
            if (method.includes('k pay') || method.includes('kpay') || method.includes('k-pay') || method.includes('kbz')) saleBreakdown.KPay += amt;
            else if (method.includes('wave')) saleBreakdown.Wave += amt;
            else if (method.includes('credit')) saleBreakdown.Credit += amt;
            else saleBreakdown.Cash += amt;
        });

        const sTotal = Object.values(saleBreakdown).reduce((a, b) => a + b, 0);

        const purBreakdown = { Cash: 0, Credit: 0, KPay: 0, Wave: 0 };
        (purchases || []).forEach(p => {
            const amt = Number(p.grand_total) || 0;
            const rawType = p.payment_type || 'Cash';
            
            // Parse pipe-separated format: "Method|Wallet" (e.g. "Cash|KBZ Pay")
            let method = rawType;
            let wallet = 'None';
            if (rawType.includes('|')) {
                [method, wallet] = rawType.split('|');
            }
            
            const methodLower = method.toLowerCase();
            const walletLower = wallet.toLowerCase();
            
            // Categorize by method (Cash/Credit/Consignment)
            if (methodLower.includes('credit')) purBreakdown.Credit += amt;
            else if (methodLower.includes('consignment')) purBreakdown.Credit += amt;
            else purBreakdown.Cash += amt;
            
            // If a wallet was used, also track it (but don't double-count the amount)
            // The wallet is informational — the amount is already counted in the method above
            // However, if you want KPay/Wave to show the wallet amounts separately:
            if (walletLower.includes('kbz') || walletLower.includes('kpay')) {
                purBreakdown.Cash -= amt;
                purBreakdown.KPay += amt;
            } else if (walletLower.includes('wave')) {
                purBreakdown.Cash -= amt;
                purBreakdown.Wave += amt;
            }
        });

        const pTotal = Object.values(purBreakdown).reduce((a, b) => a + b, 0);

        // 4. Stock Valuation (Paginated to handle 8k+ products)
        let totalQuantity = 0, totalCostVal = 0, totalSaleVal = 0, distinctProductCount = 0;

        if (warehouseId) {
            // Warehouse-specific: paginated product_warehouses
            let allPW = [];
            let pwFrom = 0;
            while (true) {
                const { data: pw, error } = await window.supabase
                    .from('product_warehouses')
                    .select('product_id, stock')
                    .eq('warehouse_id', warehouseId)
                    .range(pwFrom, pwFrom + 999);
                if (error || !pw || pw.length === 0) break;
                allPW = allPW.concat(pw);
                if (pw.length < 1000) break;
                pwFrom += 1000;
            }
            const pwMap = {};
            allPW.forEach(p => pwMap[p.product_id] = p.stock);

            // Paginated products for cost/price
            let pFrom = 0;
            while (true) {
                const { data, error } = await window.supabase
                    .from('products')
                    .select('id, cost, price')
                    .range(pFrom, pFrom + 999);
                if (error || !data || data.length === 0) break;
                data.forEach(p => {
                    const stock = pwMap[p.id] !== undefined ? Number(pwMap[p.id]) : 0;
                    if (stock > 0) {
                        distinctProductCount++;
                        totalQuantity += stock;
                        totalCostVal += stock * (Number(p.cost) || 0);
                        totalSaleVal += stock * (Number(p.price) || 0);
                    }
                });
                if (data.length < 1000) break;
                pFrom += 1000;
            }
        } else {
            // Global: paginated products
            let pFrom = 0;
            while (true) {
                const { data, error } = await window.supabase
                    .from('products')
                    .select('stock, cost, price')
                    .range(pFrom, pFrom + 999);
                if (error || !data || data.length === 0) break;
                data.forEach(p => {
                    const s = Number(p.stock) || 0;
                    if (s > 0) {
                        distinctProductCount++;
                        totalQuantity += s;
                        totalCostVal += s * (Number(p.cost) || 0);
                        totalSaleVal += s * (Number(p.price) || 0);
                    }
                });
                if (data.length < 1000) break;
                pFrom += 1000;
            }
        }

        // Update UI
        const fmt = n => Number(n || 0).toLocaleString();

        document.getElementById('sale-cash').textContent = fmt(saleBreakdown.Cash);
        document.getElementById('sale-credit').textContent = fmt(saleBreakdown.Credit);
        document.getElementById('sale-kpay').textContent = fmt(saleBreakdown.KPay);
        document.getElementById('sale-wave').textContent = fmt(saleBreakdown.Wave);

        document.getElementById('pur-cash').textContent = fmt(purBreakdown.Cash);
        document.getElementById('pur-credit').textContent = fmt(purBreakdown.Credit);
        document.getElementById('pur-kpay').textContent = fmt(purBreakdown.KPay);
        document.getElementById('pur-wave').textContent = fmt(purBreakdown.Wave);

        document.getElementById('sale-grand-total').textContent = fmt(sTotal);
        document.getElementById('pur-grand-total').textContent = fmt(pTotal);

        document.getElementById('trans-sale-count').textContent = fmt(sales?.length || 0);
        document.getElementById('trans-sale-items').textContent = fmt((saleItems || []).reduce((acc, i) => acc + (Number(i.quantity) || 0), 0));
        document.getElementById('trans-pur-count').textContent = fmt(purchases?.length || 0);
        document.getElementById('trans-pur-items').textContent = fmt((purItems || []).reduce((acc, i) => acc + (Number(i.quantity) || 0), 0));

        document.getElementById('stock-total').textContent = fmt(distinctProductCount);
        document.getElementById('stock-cost-val').textContent = fmt(totalCostVal);
        document.getElementById('stock-sale-val').textContent = fmt(totalSaleVal);

    } catch (e) {
        console.error('Error loading top row stats:', e);
    }
}

/**
 * Load Cash Book Summary Panel
 */
async function loadCashBookSummary(start, end) {
    try {
        if (!start || !end) return;
        const warehouseId = getSelectedWarehouse();
        const startISO = new Date(start.setHours(0, 0, 0, 0)).toISOString();
        const endISO = new Date(end.setHours(23, 59, 59, 999)).toISOString();
        const startYMD = startISO.split('T')[0];
        const endYMD = endISO.split('T')[0];

        // Fetch activities within range
        let salesQuery = window.supabase.from('transactions')
            .select('created_at, total_amount, customer_name, status, warehouse_id')
            .gte('created_at', startISO)
            .lte('created_at', endISO)
            .order('created_at', { ascending: false });

        if (warehouseId) {
            salesQuery = salesQuery.eq('warehouse_id', warehouseId);
        }

        let expQuery = window.supabase.from('expenses')
            .select('created_at, date, amount, item')
            .gte('date', startYMD)
            .lte('date', endYMD)
            .order('date', { ascending: false });

        // Parallelize queries
        const [
            { data: sales },
            { data: expenses }
        ] = await Promise.all([
            salesQuery.limit(10000),
            expQuery.limit(10000)
        ]);

        const rows = [];
        (sales || []).forEach(s => {
            const isReturn = s.status === 'refunded' || s.status === 'cancelled';
            rows.push({
                date: s.created_at,
                particulars: (isReturn ? '[RETURN] ' : 'Sale - ') + (s.customer_name || 'Walk-in'),
                receipt: isReturn ? 0 : (Number(s.total_amount) || 0),
                payment: isReturn ? (Number(s.total_amount) || 0) : 0,
                ts: new Date(s.created_at).getTime()
            });
        });

        (expenses || []).forEach(e => rows.push({
            date: e.date,
            particulars: 'Exp - ' + (e.item || 'Expense'),
            receipt: 0,
            payment: Number(e.amount) || 0,
            ts: new Date(e.created_at || e.date).getTime()
        }));

        rows.sort((a, b) => b.ts - a.ts);

        const body = document.getElementById('cash-body');
        if (!body) return;
        body.innerHTML = '';

        const fmt = n => Number(n || 0).toLocaleString();
        let totalR = 0, totalP = 0;

        rows.forEach(r => {
            totalR += r.receipt;
            totalP += r.payment;

            const tr = document.createElement('tr');
            const dateObj = new Date(r.date);
            const dateLabel = String(dateObj.getDate()).padStart(2, '0') + '-' + dateObj.toLocaleString('en-US', { month: 'short' });

            tr.innerHTML = `
                <td style="text-align:center">${dateLabel}</td>
                <td>${r.particulars}</td>
                <td class="val text-green">${r.receipt > 0 ? fmt(r.receipt) : ''}</td>
                <td class="val text-red">${r.payment > 0 ? fmt(r.payment) : ''}</td>
                <td class="val">-</td>
            `;
            body.appendChild(tr);
        });

        document.getElementById('cash-total-receipt').textContent = fmt(totalR);
        document.getElementById('cash-total-payment').textContent = fmt(totalP);
        document.getElementById('cash-current-balance').textContent = fmt(totalR - totalP);
        document.getElementById('cash-final-balance').textContent = fmt(totalR - totalP) + ' KS';

    } catch (e) {
        console.error('Error loading cash book summary:', e);
    }
}

/**
 * Load Profit & Loss Summary Panel
 */
async function loadProfitLossSummary(start, end) {
    try {
        if (!start || !end) return;
        const warehouseId = getSelectedWarehouse();
        const startISO = new Date(start.setHours(0, 0, 0, 0)).toISOString();
        const endISO = new Date(end.setHours(23, 59, 59, 999)).toISOString();
        const startYMD = startISO.split('T')[0];
        const endYMD = endISO.split('T')[0];

        // 1. Sales & Returns
        let salesQuery = window.supabase.from('transactions')
            .select('total_amount, status, warehouse_id')
            .gte('created_at', startISO)
            .lte('created_at', endISO);

        if (warehouseId) {
            salesQuery = salesQuery.eq('warehouse_id', warehouseId);
        }

        let purQuery = window.supabase.from('purchases')
            .select('grand_total')
            .gte('date', startYMD)
            .lte('date', endYMD);

        let purRetQuery = window.supabase.from('purchase_returns')
            .select('grand_total')
            .gte('date', startYMD)
            .lte('date', endYMD);

        let adjQuery = window.supabase.from('adjustments')
            .select('amount')
            .gte('created_at', startISO)
            .lte('created_at', endISO);

        // Parallelize all queries for Profit & Loss
        const [
            { data: sales },
            { data: purchases },
            { data: purReturns },
            { data: adjustments },
            { data: expenses }
        ] = await Promise.all([
            salesQuery.limit(10000),
            purQuery.limit(10000),
            purRetQuery.limit(10000),
            adjQuery.limit(10000),
            window.supabase.from('expenses')
                .select('amount')
                .gte('date', startYMD)
                .lte('date', endYMD)
                .limit(10000)
        ]);

        let totalRev = 0, totalSaleReturn = 0;
        (sales || []).forEach(s => {
            const amt = Number(s.total_amount) || 0;
            if (s.status === 'refunded' || s.status === 'cancelled') totalSaleReturn += amt;
            else totalRev += amt;
        });

        let totalPur = (purchases || []).reduce((acc, p) => acc + (Number(p.grand_total) || 0), 0);
        let totalPurReturn = (purReturns || []).reduce((acc, r) => acc + (Number(r.grand_total) || 0), 0);
        let totalAdj = (adjustments || []).reduce((acc, a) => acc + (Number(a.amount) || 0), 0);
        let totalExp = (expenses || []).reduce((acc, e) => acc + (Number(e.amount) || 0), 0);

        const fmt = n => Number(n || 0).toLocaleString();
        const netProfit = (totalRev - totalSaleReturn) - (totalPur - totalPurReturn) - totalExp + totalAdj;

        document.getElementById('pl-sale').textContent = fmt(totalRev);
        document.getElementById('pl-sale-return').textContent = fmt(totalSaleReturn);
        document.getElementById('pl-purchase').textContent = fmt(totalPur);
        document.getElementById('pl-pur-return').textContent = fmt(totalPurReturn);
        document.getElementById('pl-adjustment').textContent = fmt(totalAdj);
        document.getElementById('pl-expense').textContent = fmt(totalExp);
        document.getElementById('pl-income').textContent = '0';

        const netProfitEl = document.getElementById('pl-net-profit');
        netProfitEl.textContent = fmt(netProfit) + ' KS';

        if (netProfit < 0) {
            netProfitEl.style.color = 'var(--error)';
        } else {
            netProfitEl.style.color = 'var(--success)';
        }

    } catch (e) {
        console.error('Error loading profit-loss summary:', e);
    }
}

window.loadDashboardData = initDashboard;
