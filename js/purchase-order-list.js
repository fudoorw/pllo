/**
 * Purchase Voucher List Logic - Excel Grid Version
 * Derived from purchase-list.js but only pulls vouchers (status='Ordered')
 */

const SCHEMA = [
    { id: 'date', label: 'Date', width: '8%', align: 'center' },
    { id: 'voucher', label: 'PO Number', width: '12%', minWidth: '120px' },
    { id: 'supplier', label: 'Supplier', width: '15%', minWidth: '150px' },
    { id: 'payment', label: 'Payment', width: '8%', align: 'center' },
    { id: 'shop', label: 'Shop / Warehouse', width: '12%', minWidth: '120px' },
    { id: 'total', label: 'Total', width: '8%', align: 'right' },
    { id: 'net', label: 'Net', width: '8%', align: 'right' },
    { id: 'paid', label: 'Paid', width: '8%', align: 'right' },
    { id: 'remain', label: 'Remaining', width: '8%', align: 'right' },
    { id: 'status', label: 'Payment Status', width: '7%', align: 'center' },
    { id: 'remark', label: 'Remark', width: '6%' },
    { id: 'action', label: 'Action', width: '6%', align: 'center' }
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
            loadSuppliers(),
            loadOrderRefs()
        ]);

        await loadOrders();

        // Event listeners for filters
        document.getElementById('filterDateFrom').addEventListener('change', loadOrders);
        document.getElementById('filterDateTo').addEventListener('change', loadOrders);
        document.getElementById('filterShop').addEventListener('change', loadOrders);
        document.getElementById('filterSupplier').addEventListener('change', loadOrders);
        document.getElementById('filterOrder').addEventListener('change', loadOrders);
        document.getElementById('filterPayment').addEventListener('change', loadOrders);
        document.getElementById('filterStatus').addEventListener('change', loadOrders);
        document.getElementById('searchBox').addEventListener('input', debounce(loadOrders, 300));

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
        updateTotals(0, 0, 0, 0);
        return;
    }
    emptyState.classList.add('hidden');

    let totalAmt = 0, totalNet = 0, totalPaid = 0, totalRemain = 0;

    state.filteredData.forEach((p, rIdx) => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-white/[0.04] transition-colors";

        const tax = Number(p.order_tax_amount || 0);
        const discount = Number(p.discount_amount || 0);
        const shipping = Number(p.shipping_amount || 0);
        const grandTotal = Number(p.grand_total || 0); // Final Net amount in DB
        const paidAmount = Number(p.paid_amount || 0);
        
        const subtotal = grandTotal - tax + discount - shipping;
        const remainAmount = grandTotal - paidAmount;
        const status = p.payment_status || (paidAmount >= grandTotal ? 'Paid' : (paidAmount > 0 ? 'Partial' : 'Unpaid'));

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
                    td.style.color = 'var(--text-muted)';
                    break;
                case 'voucher':
                    td.innerHTML = `
                        <div style="display:flex; align-items:center; gap:8px; white-space:nowrap; overflow:hidden;">
                            <span style="font-family:monospace; font-weight:700; color:var(--text-primary); cursor:pointer;" onclick="viewOrderDetail('${p.id}')">${p.reference_no || 'N/A'}</span>
                            <button onclick="copyToClipboard('${p.reference_no || ''}')" style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:10px; padding:2px; flex-shrink:0; opacity:0.5; transition:opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.5">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                    `;
                    break;
                case 'supplier':
                    td.innerHTML = `<div style="max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0;" title="${p.supplier?.name || 'N/A'}">${p.supplier?.name || 'N/A'}</div>`;
                    td.style.fontWeight = '600';
                    td.style.color = 'var(--text-secondary)';
                    break;
                case 'payment':
                    td.textContent = p.payment_type || '-';
                    td.style.color = 'var(--text-muted)';
                    td.style.fontSize = '10px';
                    td.style.textTransform = 'uppercase';
                    td.style.fontWeight = '700';
                    break;
                case 'shop':
                    td.innerHTML = `<div style="max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0;" title="${p.warehouse?.name || 'N/A'}">${p.warehouse?.name || 'N/A'}</div>`;
                    td.style.color = 'var(--text-muted)';
                    break;
                case 'total':
                    td.textContent = subtotal.toLocaleString();
                    td.style.color = '#a5b4fc';
                    td.style.fontWeight = '600';
                    break;
                case 'net':
                    td.textContent = grandTotal.toLocaleString();
                    td.style.color = '#34d399';
                    td.style.fontWeight = '700';
                    break;
                case 'paid':
                    td.textContent = paidAmount.toLocaleString();
                    td.style.color = '#60a5fa';
                    td.style.fontWeight = '700';
                    break;
                case 'remain':
                    td.textContent = remainAmount.toLocaleString();
                    td.style.color = remainAmount > 0 ? '#f87171' : '#666';
                    td.style.fontWeight = '800';
                    break;
                case 'status':
                    td.innerHTML = getPaymentStatusBadge(status);
                    break;
                case 'remark':
                    td.textContent = p.note || '-';
                    td.style.color = 'var(--text-muted)';
                    td.style.fontSize = '11px';
                    td.style.fontStyle = 'italic';
                    break;
                case 'action':
                    td.innerHTML = `
                        <div style="display:flex; gap:6px; justify-content:center; align-items:center;">
                            <button class="btn-icon" onclick="printOrder('${p.id}')" title="Print PO" style="color:#60a5fa;"><i class="fas fa-print"></i></button>
                            <button class="btn-icon" onclick="deleteOrder('${p.id}')" title="Delete PO" style="color:#f87171;"><i class="fas fa-trash-alt"></i></button>
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

async function loadOrders() {
    toggleLoading(true);
    try {
        const filterDateFrom = document.getElementById('filterDateFrom').value;
        const filterDateTo = document.getElementById('filterDateTo').value;
        const filterShop = document.getElementById('filterShop').value;
        const filterSupplier = document.getElementById('filterSupplier').value;
        const filterOrder = document.getElementById('filterOrder').value;
        const filterPayment = document.getElementById('filterPayment').value;
        const filterStatus = document.getElementById('filterStatus').value;
        const searchTerm = document.getElementById('searchBox').value.trim();

        let query = supabase.from('purchases').select(`
            *,
            order_tax_amount,
            discount_amount,
            shipping_amount,
            supplier:suppliers(name),
            warehouse:warehouses(name)
        `).eq('status', 'Ordered').order('date', { ascending: false });

        if (filterDateFrom) query = query.gte('date', filterDateFrom);
        if (filterDateTo) query = query.lte('date', filterDateTo);
        if (filterShop) query = query.eq('warehouse_id', filterShop);
        if (filterSupplier) query = query.eq('supplier_id', filterSupplier);
        if (filterPayment) query = query.eq('payment_type', filterPayment);
        if (filterOrder) query = query.eq('reference_no', filterOrder);
        if (filterStatus) query = query.eq('payment_status', filterStatus);

        const { data, error } = await query;
        if (error) throw error;

        state.data = data || [];
        state.filteredData = [...state.data];

        if (searchTerm) {
            const q = searchTerm.toLowerCase();
            state.filteredData = state.data.filter(p =>
                (p.reference_no && p.reference_no.toLowerCase().includes(q)) ||
                (p.supplier?.name && p.supplier.name.toLowerCase().includes(q)) ||
                (p.note && p.note.toLowerCase().includes(q))
            );
        }

        renderBody();
    } catch (err) {
        console.error('Load error:', err);
    } finally {
        toggleLoading(false);
    }
}

async function loadOrderRefs() {
    const { data } = await supabase.from('purchases').select('reference_no').eq('status', 'Ordered').order('reference_no');
    const sel = document.getElementById('filterOrder');
    (data || []).forEach(o => {
        const opt = document.createElement('option');
        opt.value = o.reference_no;
        opt.textContent = o.reference_no;
        sel.appendChild(opt);
    });
}

function getPaymentStatusBadge(status) {
    const colors = {
        'Paid': '#22c55e',
        'Partial': '#f59e0b',
        'Unpaid': '#ef4444'
    };
    const color = colors[status] || '#888';
    return `<span style="background:${color}22;color:${color};padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;border:1px solid ${color}44;display:inline-block;min-width:55px;text-align:center;">${status || '-'}</span>`;
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
    if (el) show ? el.classList.remove('hidden') : el.classList.add('hidden');
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
    }

    function handleMouseUp() {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'default';
    }
}

function loadShops() {
    return supabase.from('warehouses').select('id, name').order('name').then(({ data }) => {
        const select = document.getElementById('filterShop');
        (data || []).forEach(shop => {
            const opt = document.createElement('option');
            opt.value = shop.id;
            opt.textContent = shop.name;
            select.appendChild(opt);
        });
    });
}

function loadSuppliers() {
    return supabase.from('suppliers').select('id, name').order('name').then(({ data }) => {
        const select = document.getElementById('filterSupplier');
        (data || []).forEach(supplier => {
            const opt = document.createElement('option');
            opt.value = supplier.id;
            opt.textContent = supplier.name;
            select.appendChild(opt);
        });
    });
}

function viewOrderDetail(id) {
    if (window.parent && window.parent.switchView) {
        window.parent.switchView('purchaseorder', { id: id });
    } else {
        window.location.href = `purchaseorder.html?id=${id}`;
    }
}

function printOrder(id) {
    window.open(`purchase-order-print.html?id=` + id, '_blank');
}

async function deleteOrder(id) {
    if (!confirm('🚨 Are you sure you want to delete this purchase order? This will remove the record and all associated items. This action cannot be undone.')) return;

    try {
        logActivity('Deleting purchase order...');

        // 1. Delete items first (FK constraint)
        const { error: itemErr } = await supabase.from('purchase_items').delete().eq('purchase_id', id);
        if (itemErr) throw itemErr;

        // 2. Delete main purchase record
        const { error: pErr } = await supabase.from('purchases').delete().eq('id', id);
        if (pErr) throw pErr;

        logActivity('Purchase order deleted successfully.');
        loadOrders();

    } catch (err) {
        console.error('Delete error:', err);
        alert('❌ Failed to delete: ' + err.message);
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        logActivity('Copied: ' + text);
    }).catch(err => {
        console.error('Failed to copy:', err);
    });
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

function resetFilters() {
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value = '';
    document.getElementById('filterShop').value = '';
    document.getElementById('filterSupplier').value = '';
    document.getElementById('filterOrder').value = '';
    document.getElementById('filterPayment').value = '';
    document.getElementById('filterStatus').value = '';
    document.getElementById('searchBox').value = '';
    loadOrders();
}

function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

document.addEventListener('DOMContentLoaded', init);
