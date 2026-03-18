/**
 * Purchase List Logic - Excel Grid Version
 * High-density, schema-driven, with resizable columns.
 */

const SCHEMA = [
    { id: 'date', label: 'Date', width: '8%' },
    { id: 'voucher', label: 'Voucher', width: '15%' },
    { id: 'supplier', label: 'Supplier', width: '15%' },
    { id: 'warehouse', label: 'Warehouse', width: '12%' },
    { id: 'status', label: 'Status', width: '8%', align: 'center' },
    { id: 'payment', label: 'Payment', width: '8%', align: 'center' },
    { id: 'method', label: 'Method', width: '8%', align: 'center' },
    { id: 'total', label: 'Total', width: '8%', align: 'right' },
    { id: 'net', label: 'Net', width: '8%', align: 'right' },
    { id: 'paid', label: 'Paid', width: '8%', align: 'right' },
    { id: 'due', label: 'Remaining', width: '8%', align: 'right' },
    { id: 'action', label: 'Actions', width: '10%', align: 'center' }
];

let state = {
    data: [],
    filteredData: [],
    columns: SCHEMA,
    lastSync: null
};

async function init() {
    try {
        if (window.location.search.includes('mode=embedded')) {
            document.body.classList.add('embedded');
        }

        toggleLoading(true);
        renderHeader();
        setupResizers();

        // Load metadata in parallel
        await Promise.all([
            loadShops(),
            loadSuppliers()
        ]);

        setupRealtimeSync();

        await loadPurchases();

        // Event listeners for filters
        document.getElementById('filterDateFrom').addEventListener('change', applyFilters);
        document.getElementById('filterDateTo').addEventListener('change', applyFilters);
        document.getElementById('filterVoucher').addEventListener('input', debounce(applyFilters, 300));
        document.getElementById('filterShop').addEventListener('change', applyFilters);
        document.getElementById('filterSupplier').addEventListener('change', applyFilters);
        document.getElementById('filterPaymentStatus').addEventListener('change', applyFilters);
        document.getElementById('filterStatus').addEventListener('change', applyFilters);
        document.getElementById('filterPayment').addEventListener('change', applyFilters);
        document.getElementById('searchBox').addEventListener('input', debounce(applyFilters, 300));

        updateFilterCount();

    } catch (err) {
        console.error('Initialization failed:', err);
    } finally {
        toggleLoading(false);
    }
}

function renderHeader() {
    const head = document.getElementById('gridHeader');
    head.innerHTML = '<th class="row-idx">#</th>';

    state.columns.forEach((col, i) => {
        const th = document.createElement('th');
        th.style.width = col.width;
        th.innerHTML = `
            <div class="header-content">
                <span>${col.label}</span>
                <div class="resizer" data-idx="${i}"></div>
            </div>
        `;
        head.appendChild(th);
    });
}

function renderBody() {
    const body = document.getElementById('gridBody');
    const emptyState = document.getElementById('emptyState');
    body.innerHTML = '';

    if (state.filteredData.length === 0) {
        emptyState.classList.remove('hidden');
        // Update the empty state message
        const emptyMsg = emptyState.querySelector('span');
        if (emptyMsg) {
            emptyMsg.textContent = state.data.length === 0 ? 'No purchases found in database' : 'No matching records';
        }
        updateTotals(0, 0, 0, 0);
        return;
    }
    emptyState.classList.add('hidden');

    let totalAmt = 0, totalNet = 0, totalPaid = 0, totalRemain = 0;

    state.filteredData.forEach((p, rIdx) => {
        const tr = document.createElement('tr');

        const tax = Number(p.order_tax_amount || 0);
        const discount = Number(p.discount_amount || 0);
        const shipping = Number(p.shipping_amount || 0);
        const grandTotal = Number(p.grand_total || 0); // Final Net amount in DB
        const paidAmount = Number(p.paid_amount || 0);

        const subtotal = grandTotal - tax + discount - shipping;
        const remainAmount = grandTotal - paidAmount;
        const paymentStatus = p.payment_status || (paidAmount >= grandTotal ? 'Paid' : (paidAmount > 0 ? 'Partial' : 'Unpaid'));

        totalAmt += subtotal;
        totalNet += grandTotal;
        totalPaid += paidAmount;
        totalRemain += remainAmount;

        // Index Column
        const idxTd = document.createElement('td');
        idxTd.className = "row-idx";
        idxTd.textContent = rIdx + 1;
        tr.appendChild(idxTd);

        state.columns.forEach(col => {
            const td = document.createElement('td');
            if (col.align === 'right') td.style.textAlign = 'right';
            if (col.align === 'center') td.style.textAlign = 'center';

            switch (col.id) {
                case 'date':
                    td.textContent = p.date ? ((d) => { const dt = new Date(d); const day = String(dt.getDate()).padStart(2, '0'); const mon = dt.toLocaleString('en-US', { month: 'short' }); return day + '-' + mon + '-' + dt.getFullYear(); })(p.date) : '-';
                    break;
                case 'voucher':
                    td.innerHTML = `
                        <div style="display:flex; align-items:center; gap:8px; white-space:nowrap; overflow:hidden;">
                            <span style="font-family:monospace; font-weight:700; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; word-break:keep-all; max-width:220px; display:inline-block;">
                                ${p.reference_no || 'N/A'}
                            </span>
                            <button onclick="copyToClipboard('${p.reference_no}')" style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:10px; padding:2px; flex-shrink:0; opacity:0.5; transition:opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.5">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                    `;
                    break;
                case 'supplier':
                    td.innerHTML = `<div style="max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0;" title="${p.supplier?.name || 'N/A'}">${p.supplier?.name || 'N/A'}</div>`;
                    break;
                case 'warehouse':
                    td.innerHTML = `<div style="max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0;" title="${p.warehouse?.name || 'N/A'}">${p.warehouse?.name || 'N/A'}</div>`;
                    break;
                case 'total':
                    td.textContent = subtotal.toLocaleString();
                    td.style.color = '#a5b4fc';
                    td.style.fontWeight = '600';
                    break;
                case 'net':
                    td.textContent = grandTotal.toLocaleString();
                    td.style.color = '#34d399';
                    td.style.fontWeight = '600';
                    break;
                case 'paid':
                    td.textContent = paidAmount.toLocaleString();
                    td.style.color = '#34d399';
                    td.style.fontWeight = '700';
                    break;
                case 'due':
                    td.textContent = remainAmount.toLocaleString();
                    td.style.color = remainAmount > 0 ? '#f87171' : '#666';
                    td.style.fontWeight = '700';
                    break;
                case 'status':
                    td.innerHTML = getStatusBadge(paymentStatus);
                    break;
                case 'payment':
                    // Only show KPay, Wave Pay
                    td.innerHTML = getWalletBadge(p.payment_type);
                    break;
                case 'method':
                    // Show Method (Cash, Credit, Consignment)
                    td.innerHTML = getMethodBadge(p.payment_type);
                    break;
                case 'action':
                    td.innerHTML = `
                        <div style="display:flex; gap:6px; justify-content:center; align-items:center;">
                            <button class="btn-icon" onclick="printPurchase('${p.id}')" title="Print" style="color:#60a5fa;"><i class="fas fa-print"></i></button>
                            <button class="btn-icon" onclick="deletePurchase('${p.id}')" title="Delete" style="color:#f87171;"><i class="fas fa-trash-alt"></i></button>
                        </div>
                    `;
                    td.style.textAlign = 'center';
                    break;
            }

            tr.appendChild(td);
        });
        body.appendChild(tr);
    });

    updateTotals(totalAmt, totalNet, totalPaid, totalRemain);
    logActivity(`Loaded ${state.filteredData.length} records.`);
}

function getStatusBadge(status) {
    if (!status) return '';
    const s = status.toLowerCase();
    let color = '#94a3b8'; // gray

    // Payment Statuses & Order Statuses
    if (s.includes('unpaid') || s.includes('due') || s === 'cancelled' || s === 'returned') color = '#ef4444'; // red
    else if (s.includes('partial') || s === 'ordered' || s === 'pending') color = '#f59e0b'; // amber
    else if (s.includes('paid') || s === 'received' || s === 'completed') color = '#10b981'; // green

    return `<span style="background:${color}22;color:${color};padding:4px 10px;border-radius:99px;font-size:10px;font-weight:600;display:inline-block;white-space:nowrap;border:1px solid ${color}44;">${status}</span>`;
}

function getPaymentStatusBadge(status) {
    const colors = {
        'Paid': '#22c55e',
        'Partial': '#f59e0b',
        'Unpaid': '#ef4444'
    };
    const color = colors[status] || '#888';
    return `<span style="background:${color}22;color:${color};padding:2px 8px;border-radius:4px;font-size:0.65rem;font-weight:600;border:1px solid ${color}44;display:inline-block;width:60px;text-align:center;">${status}</span>`;
}

function getWalletBadge(type) {
    if (!type) return '-';
    // Handle split format from purchase-add.html: "Method|Wallet"
    let wallet = type;
    if (type.includes('|')) {
        wallet = type.split('|')[1];
    }

    if (wallet === 'None' || !wallet) return `<div style="text-align:center;color:#475569;font-size:10px;">-</div>`;

    const t = wallet.toLowerCase();
    let color = '';
    let label = '';

    if (t.includes('kbz') || t.includes('kpay')) { color = '#6366f1'; label = 'KPay / KBZ'; }
    else if (t.includes('wave')) { color = '#f97316'; label = 'Wave Pay'; }

    if (!label) return `<div style="text-align:center;color:#475569;font-size:10px;">-</div>`;

    return `<span style="background:${color}22;color:${color};padding:4px 12px;border-radius:99px;font-size:10px;font-weight:600;display:inline-block;white-space:nowrap;border:1px solid ${color}44;">${label}</span>`;
}

function getMethodBadge(type) {
    if (!type) {
        const color = '#10b981';
        return `<span style="background:${color}22;color:${color};padding:4px 12px;border-radius:99px;font-size:10px;font-weight:600;display:inline-block;white-space:nowrap;border:1px solid ${color}44;">Cash</span>`;
    }

    // Handle split format from purchase-add.html: "Method|Wallet"
    let method = type;
    if (type.includes('|')) {
        method = type.split('|')[0];
    }

    const t = method.toLowerCase();
    let display = method;
    let color = '#10b981'; // Green for Cash

    if (t === 'credit') { display = 'Credit'; color = '#3b82f6'; }
    else if (t === 'consignment') { display = 'Consignment'; color = '#a855f7'; }
    else if (t.includes('card')) { display = 'Card'; color = '#ec4899'; }
    else if (t === 'none' || !t) { display = 'Cash'; color = '#10b981'; }

    return `<span style="background:${color}22;color:${color};padding:4px 12px;border-radius:99px;font-size:10px;font-weight:600;display:inline-block;white-space:nowrap;border:1px solid ${color}44;">${display}</span>`;
}

async function loadPurchases() {
    toggleLoading(true);
    try {
        if (typeof supabase === 'undefined') {
            document.getElementById('activityLog').textContent = 'Error: Supabase not loaded';
            return;
        }

        const syncStatusText = document.getElementById('syncStatusText');
        if (syncStatusText) syncStatusText.textContent = 'Syncing...';

        let query = supabase.from('purchases').select(`
            *,
            order_tax_amount,
            discount_amount,
            shipping_amount,
            supplier:suppliers(name),
            warehouse:warehouses(name)
        `).neq('status', 'Ordered').order('date', { ascending: false });

        const filterDateFrom = document.getElementById('filterDateFrom').value;
        const filterDateTo = document.getElementById('filterDateTo').value;
        const filterShop = document.getElementById('filterShop').value;
        const filterSupplier = document.getElementById('filterSupplier').value;
        const filterPayment = document.getElementById('filterPayment').value;

        if (filterDateFrom) query = query.gte('date', filterDateFrom);
        if (filterDateTo) query = query.lte('date', filterDateTo);
        if (filterShop) query = query.eq('warehouse_id', filterShop);
        if (filterSupplier) query = query.eq('supplier_id', filterSupplier);
        if (filterPayment) query = query.eq('payment_type', filterPayment);

        const { data, error } = await query;
        if (error) {
            console.error('Load error:', error);
            document.getElementById('activityLog').textContent = 'Error: ' + error.message;
            return;
        }

        state.data = data || [];
        state.filteredData = [...state.data];

        applyClientFilters();
        renderBody();
        updateFilterCount();
        const lastUpdatedEl = document.getElementById('lastUpdated');
        if (lastUpdatedEl) lastUpdatedEl.textContent = new Date().toLocaleTimeString();
        if (syncStatusText) syncStatusText.textContent = 'Ready';
        logActivity(`Refreshed: ${new Date().toLocaleTimeString()}`);
    } catch (err) {
        console.error('Load error:', err);
    } finally {
        toggleLoading(false);
    }
}

function applyFilters() {
    applyClientFilters();
    renderBody();
    updateFilterCount();
}

function applyClientFilters() {
    const filterVoucher = document.getElementById('filterVoucher').value.trim().toLowerCase();
    const filterPaymentStatus = document.getElementById('filterPaymentStatus').value;
    const filterWallet = document.getElementById('filterStatus').value; // Repurposed Status filter
    const filterMethod = document.getElementById('filterPayment').value;
    const searchTerm = document.getElementById('searchBox').value.trim().toLowerCase();

    state.filteredData = state.data.filter(p => {
        const grandTotal = p.grand_total || 0;
        const paidAmount = p.paid_amount || 0;
        const paymentStatus = p.payment_status || (paidAmount >= grandTotal ? 'Paid' : (paidAmount > 0 ? 'Partial' : 'Unpaid'));

        // Parse Payment Type (Method|Wallet)
        let method = p.payment_type || 'Cash';
        let wallet = 'None';
        if (method.includes('|')) {
            [method, wallet] = method.split('|');
        }

        if (filterVoucher && !(p.reference_no && p.reference_no.toLowerCase().includes(filterVoucher))) {
            return false;
        }

        if (filterPaymentStatus && paymentStatus !== filterPaymentStatus) {
            return false;
        }

        if (filterWallet && wallet !== filterWallet) {
            return false;
        }

        if (filterMethod && method !== filterMethod) {
            return false;
        }

        // Only show vouchers starting with PV-
        if (p.reference_no && !p.reference_no.startsWith('PV-')) {
            return false;
        }

        if (searchTerm) {
            const searchMatch =
                (p.reference_no && p.reference_no.toLowerCase().includes(searchTerm)) ||
                (p.supplier?.name && p.supplier.name.toLowerCase().includes(searchTerm)) ||
                (p.note && p.note.toLowerCase().includes(searchTerm));
            if (!searchMatch) return false;
        }

        return true;
    });
}

function updateTotals(amount, net, paid, remain) {
    document.getElementById('totalAmount').textContent = amount.toLocaleString();
    document.getElementById('totalNet').textContent = net.toLocaleString();
    document.getElementById('totalPaid').textContent = paid.toLocaleString();
    document.getElementById('totalRemain').textContent = remain.toLocaleString();
}

function logActivity(msg) {
    const el = document.getElementById('activityLog');
    if (el) el.textContent = msg;
}

function toggleLoading(show) {
    const el = document.getElementById('loadingStatus');
    if (el) {
        show ? el.classList.remove('hidden') : el.classList.add('hidden');
    }
    // Also update empty state to show loading
    const emptyState = document.getElementById('emptyState');
    if (emptyState) {
        if (show) {
            emptyState.classList.remove('hidden');
            const span = emptyState.querySelector('span');
            if (span) span.textContent = 'Loading...';
        }
    }
}

function setupResizers() {
    let startX, startWidth, activeColIdx, tableWidth;

    document.getElementById('gridHeader').addEventListener('mousedown', e => {
        if (e.target.classList.contains('resizer')) {
            activeColIdx = parseInt(e.target.dataset.idx);
            const th = e.target.closest('th');
            startX = e.pageX;
            startWidth = th.offsetWidth;
            tableWidth = document.getElementById('gridTable').offsetWidth;

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'col-resize';
        }
    });

    function handleMouseMove(e) {
        const diff = e.pageX - startX;
        const newWidthPx = Math.max(50, startWidth + diff);
        const newWidthPct = (newWidthPx / tableWidth) * 100;

        state.columns[activeColIdx].width = newWidthPct + '%';

        const ths = document.getElementById('gridHeader').querySelectorAll('th');
        // +1 because of row-idx column
        ths[activeColIdx + 1].style.width = newWidthPct + '%';

        // When using table-layout: fixed, the table will honor these percentages 
        // and adjust the rest of the columns if the total exceeds 100% or fits within it.
    }

    function handleMouseUp() {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'default';
    }
}

async function loadShops() {
    const { data } = await supabase.from('warehouses').select('id, name').order('name');
    const select = document.getElementById('filterShop');
    (data || []).forEach(shop => {
        const opt = document.createElement('option');
        opt.value = shop.id;
        opt.textContent = shop.name;
        select.appendChild(opt);
    });
}

async function loadSuppliers() {
    const { data } = await supabase.from('suppliers').select('id, name').order('name');
    const select = document.getElementById('filterSupplier');
    (data || []).forEach(supplier => {
        const opt = document.createElement('option');
        opt.value = supplier.id;
        opt.textContent = supplier.name;
        select.appendChild(opt);
    });
}

function viewPurchaseDetail(id) {
    if (window.parent && window.parent.switchView) {
        window.parent.switchView('purchase-add', { id: id });
    } else {
        window.location.href = `purchase-add.html?id=${id}`;
    }
}

async function deletePurchase(id) {
    if (!confirm('🚨 Are you sure you want to delete this purchase? This will remove the record and all associated items. This action cannot be undone.')) return;

    try {
        logActivity('Deleting purchase...');

        // 1. Delete items first (FK constraint usually)
        const { error: itemErr } = await supabase.from('purchase_items').delete().eq('purchase_id', id);
        if (itemErr) throw itemErr;

        // 2. Delete main record
        const { error: pErr } = await supabase.from('purchases').delete().eq('id', id);
        if (pErr) throw pErr;

        logActivity('Purchase deleted successfully.');
        // No need for loadPurchases() if Realtime is active, but safe to call
        loadPurchases();

    } catch (err) {
        console.error('Delete error:', err);
        if (err.message && err.message.includes('products_stock_check')) {
            alert('❌ Cannot delete purchase: Some items have already been sold or transferred. Deleting this purchase would result in negative stock.');
        } else {
            alert('❌ Failed to delete: ' + err.message);
        }
    }
}

function printPurchase(id) {
    window.open(`purchase-order-print.html?id=${id}`, '_blank');
}

function copyToClipboard(text) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        logActivity(`Copied: ${text}`);
    });
}

function exportToCSV() {
    if (!state.filteredData || state.filteredData.length === 0) {
        alert('No data to export.');
        return;
    }

    const headers = ['Date', 'Voucher', 'Supplier', 'Warehouse', 'Total', 'Paid', 'Remain', 'Status'];
    const rows = state.filteredData.map(r => [
        r.date,
        r.reference_no,
        r.supplier?.name || 'N/A',
        r.warehouse?.name || 'N/A',
        r.grand_total || 0,
        r.paid_amount || 0,
        (r.grand_total - r.paid_amount) || 0,
        r.payment_status || '-'
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `purchases_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function resetFilters() {
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value = '';
    document.getElementById('filterVoucher').value = '';
    document.getElementById('filterShop').value = '';
    document.getElementById('filterSupplier').value = '';
    document.getElementById('filterPaymentStatus').value = '';
    document.getElementById('filterStatus').value = '';
    document.getElementById('filterPayment').value = '';
    document.getElementById('searchBox').value = '';
    applyFilters();
    updateFilterCount();
}

function openFilterPopup() {
    document.getElementById('filterPopup').classList.remove('hidden');
    document.getElementById('filterPopup').classList.add('show');
    document.getElementById('overlay').classList.remove('hidden');
    document.getElementById('overlay').classList.add('show');
}

function closeFilterPopup(event) {
    if (!event || event.target === document.getElementById('overlay') || event.target.classList.contains('popup-close')) {
        document.getElementById('filterPopup').classList.add('hidden');
        document.getElementById('filterPopup').classList.remove('show');
        document.getElementById('overlay').classList.add('hidden');
        document.getElementById('overlay').classList.remove('show');
    }
}

function updateFilterCount() {
    let count = 0;
    if (document.getElementById('filterDateFrom').value) count++;
    if (document.getElementById('filterDateTo').value) count++;
    if (document.getElementById('filterVoucher').value) count++;
    if (document.getElementById('filterShop').value) count++;
    if (document.getElementById('filterSupplier').value) count++;
    if (document.getElementById('filterPaymentStatus').value) count++;
    if (document.getElementById('filterStatus').value) count++;
    if (document.getElementById('filterPayment').value) count++;

    const badge = document.getElementById('activeFilterCount');
    if (badge) {
        if (count > 0) {
            badge.textContent = count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
}

function refreshData() {
    logActivity('Refreshing data...');
    loadPurchases();
}

function setupRealtimeSync() {
    if (typeof supabase === 'undefined') return;

    const channel = supabase
        .channel('purchases-realtime')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'purchases'
        }, (payload) => {
            loadPurchases();
        })
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'purchase_payments'
        }, (payload) => {
            loadPurchases();
        })
        .subscribe((status) => {
            console.log('Realtime status:', status);
            if (status === 'SUBSCRIBED') {
                logActivity('Realtime sync active');
                const badge = document.getElementById('syncStatusText');
                if (badge) {
                    badge.parentElement.style.background = 'rgba(16, 185, 129, 0.1)';
                    badge.style.color = '#10b981';
                    badge.textContent = 'Realtime Active';
                }
            }
        });
}

function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

document.addEventListener('DOMContentLoaded', init);
