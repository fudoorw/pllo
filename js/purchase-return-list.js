/**
 * Purchase Return List Logic - Excel Grid Version
 */

const SCHEMA = [
    { id: 'date', label: 'Date', width: '8%', align: 'center' },
    { id: 'voucher', label: 'Voucher', width: '12%' },
    { id: 'supplier', label: 'Supplier', width: '15%' },
    { id: 'warehouse', label: 'Warehouse', width: '12%' },
    { id: 'total', label: 'Total', width: '10%', align: 'right' },
    { id: 'refund', label: 'Refund', width: '10%', align: 'right' },
    { id: 'paid', label: 'Refunded', width: '10%', align: 'right' },
    { id: 'due', label: 'Pending', width: '10%', align: 'right' },
    { id: 'status', label: 'Status', width: '8%', align: 'center' },
    { id: 'payment', label: 'Payment', width: '8%', align: 'center' },
    { id: 'action', label: 'Action', width: '7%', align: 'center' }
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

        await Promise.all([
            loadShops(),
            loadSuppliers()
        ]);

        await loadReturns();

        document.getElementById('filterDateFrom').addEventListener('change', applyFilters);
        document.getElementById('filterDateTo').addEventListener('change', applyFilters);
        document.getElementById('filterVoucher').addEventListener('input', debounce(applyFilters, 300));
        document.getElementById('filterShop').addEventListener('change', applyFilters);
        document.getElementById('filterSupplier').addEventListener('change', applyFilters);
        document.getElementById('filterStatus').addEventListener('change', applyFilters);
        document.getElementById('filterPayment').addEventListener('change', applyFilters);
        document.getElementById('searchBox').addEventListener('input', debounce(applyFilters, 300));

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

async function loadShops() {
    try {
        const { data, error } = await window.supabase.from('warehouses').select('*').order('name');
        if (error) throw error;

        const select = document.getElementById('filterShop');
        if (select) {
            data?.forEach(shop => {
                const opt = document.createElement('option');
                opt.value = shop.id;
                opt.textContent = shop.name;
                select.appendChild(opt);
            });
        }
        return data;
    } catch (err) {
        console.error('Error loading shops:', err);
        return [];
    }
}

async function loadSuppliers() {
    try {
        const { data, error } = await window.supabase.from('suppliers').select('*').order('name');
        if (error) throw error;

        const select = document.getElementById('filterSupplier');
        if (select) {
            data?.forEach(supplier => {
                const opt = document.createElement('option');
                opt.value = supplier.id;
                opt.textContent = supplier.name;
                select.appendChild(opt);
            });
        }
        return data;
    } catch (err) {
        console.error('Error loading suppliers:', err);
        return [];
    }
}

async function loadReturns() {
    try {
        const { data, error } = await window.supabase
            .from('purchase_returns')
            .select(`
                *,
                supplier:suppliers(name),
                warehouse:warehouses(name),
                purchase:purchases(reference_no)
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;

        state.data = data || [];
        applyFilters();
        logActivity(`Loaded ${state.data.length} returns.`);
        document.getElementById('syncStatusText').textContent = 'Synced';

    } catch (err) {
        console.error('Error loading returns:', err);
        logActivity('Error loading returns.');
    }
}

function applyFilters() {
    const search = document.getElementById('searchBox').value.toLowerCase();
    const dateFrom = document.getElementById('filterDateFrom').value;
    const dateTo = document.getElementById('filterDateTo').value;
    const voucher = document.getElementById('filterVoucher').value.toLowerCase();
    const shop = document.getElementById('filterShop').value;
    const supplier = document.getElementById('filterSupplier').value;
    const status = document.getElementById('filterStatus').value;
    const payment = document.getElementById('filterPayment').value;

    state.filteredData = state.data.filter(r => {
        if (search && !(
            (r.reference_no || '').toLowerCase().includes(search) ||
            (r.supplier?.name || '').toLowerCase().includes(search) ||
            (r.note || '').toLowerCase().includes(search)
        )) return false;

        if (voucher && !(r.reference_no || '').toLowerCase().includes(voucher)) return false;

        if (dateFrom && r.date < dateFrom) return false;
        if (dateTo && r.date > dateTo) return false;

        if (shop && r.warehouse_id !== shop) return false;
        if (supplier && r.supplier_id !== supplier) return false;
        if (status && r.status !== status) return false;
        if (payment && r.payment_type !== payment) return false;

        return true;
    });

    renderBody();
}

function renderBody() {
    const body = document.getElementById('gridBody');
    const emptyState = document.getElementById('emptyState');
    body.innerHTML = '';

    if (state.filteredData.length === 0) {
        emptyState.classList.remove('hidden');
        emptyState.style.display = 'flex';
        updateTotals(0, 0, 0, 0);
        return;
    }
    emptyState.classList.add('hidden');
    emptyState.style.display = 'none';

    let totalAmt = 0, totalRefund = 0, totalPaid = 0, totalRemain = 0;

    state.filteredData.forEach((r, rIdx) => {
        const tr = document.createElement('tr');

        const grandTotal = parseFloat(r.grand_total) || 0;
        const paidAmount = parseFloat(r.paid_amount) || 0;
        const remainAmount = grandTotal - paidAmount;

        totalAmt += grandTotal;
        totalRefund += grandTotal;
        totalPaid += paidAmount;
        totalRemain += remainAmount;

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
                    td.textContent = r.date ? formatDate(r.date) : '-';
                    td.style.color = 'var(--text-muted)';
                    break;
                case 'voucher':
                    td.innerHTML = `
                        <div style="display:flex; align-items:center; gap:8px; white-space:nowrap; overflow:hidden;">
                            <span style="font-family:monospace; font-weight:700; color:var(--text-primary);">${r.reference_no || 'N/A'}</span>
                            <button onclick="copyToClipboard('${r.reference_no || ''}')" style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:10px; padding:2px; flex-shrink:0; opacity:0.5; transition:opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.5">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                    `;
                    break;
                case 'supplier':
                    td.innerHTML = `<div style="max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0;" title="${r.supplier?.name || 'N/A'}">${r.supplier?.name || 'N/A'}</div>`;
                    td.style.fontWeight = '600';
                    td.style.color = 'var(--text-secondary)';
                    break;
                case 'warehouse':
                    td.innerHTML = `<div style="max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0;" title="${r.warehouse?.name || 'N/A'}">${r.warehouse?.name || 'N/A'}</div>`;
                    td.style.color = 'var(--text-muted)';
                    break;
                case 'total':
                    td.textContent = grandTotal.toLocaleString();
                    td.style.color = '#a5b4fc';
                    td.style.fontWeight = '600';
                    break;
                case 'refund':
                    td.textContent = grandTotal.toLocaleString();
                    td.style.color = '#a5b4fc';
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
                    td.innerHTML = getStatusBadge(r.status || 'Pending');
                    break;
                case 'payment':
                    td.textContent = r.payment_type || '-';
                    td.style.color = 'var(--text-muted)';
                    td.style.fontSize = '10px';
                    td.style.textTransform = 'uppercase';
                    td.style.fontWeight = '700';
                    break;
                case 'action':
                    td.innerHTML = `
                        <div style="display:flex; gap:6px; justify-content:center; align-items:center;">
                            <button class="btn-icon" onclick="viewReturnDetail('${r.id}')" title="View/Edit"><i class="fas fa-eye"></i></button>
                            <button class="btn-icon" onclick="printReturn('${r.id}')" title="Print" style="color:#60a5fa;"><i class="fas fa-print"></i></button>
                        </div>
                    `;
                    td.style.textAlign = 'center';
                    break;
            }

            tr.appendChild(td);
        });

        body.appendChild(tr);
    });

    updateTotals(totalAmt, totalRefund, totalPaid, totalRemain);
    logActivity(`Loaded ${state.filteredData.length} records.`);
}

function getStatusBadge(status) {
    if (!status) return '';
    const s = status.toLowerCase();
    let bg, color;
    
    if (s === 'completed') {
        bg = 'rgba(16, 185, 129, 0.2)';
        color = '#34d399';
    } else if (s === 'pending') {
        bg = 'rgba(245, 158, 11, 0.2)';
        color = '#fbbf24';
    } else if (s === 'cancelled') {
        bg = 'rgba(239, 68, 68, 0.2)';
        color = '#f87171';
    } else {
        bg = 'rgba(148, 163, 184, 0.2)';
        color = '#94a3b8';
    }

    return `<span style="background:${bg};color:${color};padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;display:inline-block;min-width:60px;text-align:center;">${status}</span>`;
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const dt = new Date(dateStr);
    const day = String(dt.getDate()).padStart(2, '0');
    const mon = dt.toLocaleString('en-US', { month: 'short' });
    return `${day}-${mon}-${dt.getFullYear()}`;
}

function updateTotals(total, net, paid, remain) {
    document.getElementById('totalAmount').textContent = total.toLocaleString();
    document.getElementById('totalNet').textContent = net.toLocaleString();
    document.getElementById('totalPaid').textContent = paid.toLocaleString();
    document.getElementById('totalRemain').textContent = remain.toLocaleString();
}

function logActivity(msg) {
    document.getElementById('activityLog').textContent = msg;
}

function toggleLoading(show) {
    const emptyState = document.getElementById('emptyState');
    if (show) {
        emptyState.classList.remove('hidden');
        emptyState.style.display = 'flex';
        emptyState.querySelector('span').textContent = 'Loading...';
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
    }

    function handleMouseUp() {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'default';
    }
}

function refreshData() {
    document.getElementById('syncStatusText').textContent = 'Syncing...';
    loadReturns();
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
    document.getElementById('filterVoucher').value = '';
    document.getElementById('filterShop').value = '';
    document.getElementById('filterSupplier').value = '';
    document.getElementById('filterStatus').value = '';
    document.getElementById('filterPayment').value = '';
    document.getElementById('searchBox').value = '';
    applyFilters();
}

function exportToExcel() {
    const data = state.filteredData.map((r, idx) => ({
        '#': idx + 1,
        'Date': r.date ? formatDate(r.date) : '',
        'Voucher': r.reference_no || '',
        'Supplier': r.supplier?.name || '',
        'Warehouse': r.warehouse?.name || '',
        'Total': r.grand_total || 0,
        'Refund': r.grand_total || 0,
        'Refunded': r.paid_amount || 0,
        'Pending': (r.grand_total || 0) - (r.paid_amount || 0),
        'Status': r.status || '',
        'Payment': r.payment_type || ''
    }));

    const csv = [
        Object.keys(data[0] || {}).join(','),
        ...data.map(row => Object.values(row).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `purchase-returns-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
}

function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        logActivity('Copied: ' + text);
    }).catch(err => {
        console.error('Failed to copy:', err);
    });
}

function viewReturnDetail(id) {
    if (window.parent && window.parent.switchView) {
        window.parent.switchView('purchase-return', { id: id });
    } else {
        window.location.href = `purchase-return.html?id=${id}`;
    }
}

function printReturn(id) {
    window.open(`purchase-return-print.html?id=` + id, '_blank');
}

document.addEventListener('DOMContentLoaded', init);
