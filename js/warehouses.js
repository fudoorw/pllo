/**
 * Warehouse Management Module
 * Excel-like grid with click-to-edit cells
 */

const SCHEMA = [
    { id: 'select', label: '', width: '44px', noSort: true, type: 'checkbox' },
    { id: 'index', label: '#', width: '48px', align: 'center', noSort: true },
    { id: 'name', label: 'Warehouse Name*', width: '20%', minWidth: '150px' },
    { id: 'email', label: 'Email', width: '18%', minWidth: '150px' },
    { id: 'phone', label: 'Phone', width: '14%', minWidth: '120px' },
    { id: 'city', label: 'City', width: '14%', minWidth: '100px' },
    { id: 'country', label: 'Country', width: '14%', minWidth: '100px' },
    { id: 'zip_code', label: 'Zip Code', width: '10%', minWidth: '80px' },
    { id: 'actions', label: '', width: '52px', align: 'center', noSort: true }
];

let warehousesData = [];
let modifiedIds = new Set();
let deletedIds = new Set();
let selectedIds = new Set();

function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// --- Data Loading ---

window.loadWarehouses = async function () {
    try {
        updateSyncStatus('Loading...');

        const draft = localStorage.getItem('pos_draft_warehouses');
        if (draft) {
            const parsed = JSON.parse(draft);
            if ((parsed.modifiedIds.length > 0 || parsed.deletedIds.length > 0) && confirm('Resume unsaved warehouse changes?')) {
                warehousesData = parsed.warehousesData;
                modifiedIds = new Set(parsed.modifiedIds);
                deletedIds = new Set(parsed.deletedIds);
                renderGrid();
                updateSyncStatus('Unsaved Changes (Local)');
                return;
            } else {
                localStorage.removeItem('pos_draft_warehouses');
            }
        }

        const { data, error } = await window.supabase
            .from('warehouses')
            .select('*')
            .order('name');

        if (error) throw error;
        warehousesData = data || [];
        modifiedIds.clear();
        deletedIds.clear();
        renderGrid();
        updateSyncStatus('Synced');
        updateRowCount();
    } catch (e) {
        console.error('Error loading warehouses:', e);
        updateSyncStatus('Error', 'error');
    }
};

function saveDraft() {
    const draft = {
        warehousesData,
        modifiedIds: Array.from(modifiedIds),
        deletedIds: Array.from(deletedIds)
    };
    localStorage.setItem('pos_draft_warehouses', JSON.stringify(draft));
    updateSyncStatus('Unsaved', 'pending');
}

function clearDraft() {
    localStorage.removeItem('pos_draft_warehouses');
}

function updateSyncStatus(status, type = 'success') {
    const statusEl = document.getElementById('syncStatus');
    if (statusEl) {
        statusEl.textContent = status;
        statusEl.className = 'sync-status';
        if (type === 'pending') statusEl.classList.add('pending');
        else if (type === 'error') statusEl.classList.add('error');
    }
}

function updateRowCount() {
    const el = document.getElementById('rowCount');
    if (el) el.textContent = `${warehousesData.length} warehouse${warehousesData.length !== 1 ? 's' : ''}`;
}

function updateActionStatus(msg) {
    const el = document.getElementById('actionStatus');
    if (el) el.textContent = msg;
}

// --- Grid Rendering ---

function renderHeader() {
    const thead = document.getElementById('gridHeader');
    if (!thead) return;

    let html = '';
    SCHEMA.forEach((col, index) => {
        const isLast = index === SCHEMA.length - 1;
        const isCheckbox = col.type === 'checkbox';

        html += `
            <th style="width: ${col.width}; min-width: ${col.minWidth || 'auto'}; text-align: ${col.align || 'left'};">
                <div style="position: relative; height: 100%; padding: 12px 8px;">
                    ${isCheckbox ? `
                        <label class="checkbox-container">
                            <input type="checkbox" onchange="toggleSelectAll(this)">
                            <span class="checkmark"></span>
                        </label>
                    ` : `<span>${col.label}</span>`}
                    ${(!isLast && !isCheckbox) ? `<div class="resizer" data-idx="${index}"></div>` : ''}
                </div>
            </th>
        `;
    });
    thead.innerHTML = html;
    setupResizers();
}

function renderBody() {
    const tbody = document.getElementById('gridBody');
    if (!tbody) return;

    if (warehousesData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${SCHEMA.length}" class="empty-state">No warehouses found. Click "Add Row" to create one.</td></tr>`;
        return;
    }

    tbody.innerHTML = warehousesData.map((w, index) => {
        const isModified = modifiedIds.has(w.id);
        const isNew = w.id && w.id.toString().startsWith('new_');
        const isSelected = selectedIds.has(w.id);

        return `
            <tr class="${isModified ? 'modified' : ''} ${isNew ? 'new-row' : ''}" data-index="${index}">
                <td class="check-col">
                    <label class="checkbox-container">
                        <input type="checkbox" class="selection-checkbox" onchange="handleSelectionChange(this)" data-id="${w.id}" ${isSelected ? 'checked' : ''}>
                        <span class="checkmark"></span>
                    </label>
                </td>
                <td class="row-idx">${index + 1}</td>
                <td>
                    <div class="cell-container">
                        <input type="text" class="cell-input" value="${escapeHtml(w.name || '')}" data-field="name" placeholder="Required">
                    </div>
                </td>
                <td>
                    <div class="cell-container">
                        <input type="text" class="cell-input" value="${escapeHtml(w.email || '')}" data-field="email" placeholder="Optional">
                    </div>
                </td>
                <td>
                    <div class="cell-container">
                        <input type="text" class="cell-input" value="${escapeHtml(w.phone || '')}" data-field="phone" placeholder="Optional">
                    </div>
                </td>
                <td>
                    <div class="cell-container">
                        <input type="text" class="cell-input" value="${escapeHtml(w.city || '')}" data-field="city" placeholder="Optional">
                    </div>
                </td>
                <td>
                    <div class="cell-container">
                        <input type="text" class="cell-input" value="${escapeHtml(w.country || '')}" data-field="country" placeholder="Optional">
                    </div>
                </td>
                <td>
                    <div class="cell-container">
                        <input type="text" class="cell-input" value="${escapeHtml(w.zip_code || '')}" data-field="zip_code" placeholder="Optional">
                    </div>
                </td>
                <td class="action-cell">
                    <button class="btn-delete" onclick="deleteWarehouse(${index})" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    setupCellEvents();
}

window.renderGrid = function () {
    renderHeader();
    renderBody();
    updateBulkToolbar();
    updateRowCount();
};

// --- Cell Events ---

function setupCellEvents() {
    const inputs = document.querySelectorAll('.cell-input');
    inputs.forEach(input => {
        input.addEventListener('input', handleCellInput);
        input.addEventListener('focus', handleCellFocus);
        input.addEventListener('keydown', handleCellKeydown);
    });
}

function handleCellFocus(e) {
    const input = e.target;
    const container = input.closest('.cell-container');
    const tr = input.closest('tr');
    const rowIdx = parseInt(tr.dataset.index);
    const field = input.dataset.field;
    updateActionStatus(`Editing: ${field} [Row ${rowIdx + 1}]`);
}

function handleCellInput(e) {
    const input = e.target;
    const tr = input.closest('tr');
    const index = parseInt(tr.dataset.index);
    const field = input.dataset.field;
    const value = input.value;

    warehousesData[index][field] = value;
    modifiedIds.add(warehousesData[index].id);
    tr.classList.add('modified');
    saveDraft();
}

function handleCellKeydown(e) {
    const input = e.target;
    const tr = input.closest('tr');
    const rowIdx = parseInt(tr.dataset.index);

    if (e.key === 'Enter') {
        e.preventDefault();
        moveFocus(rowIdx, 1);
    } else if (e.key === 'ArrowDown' && rowIdx < warehousesData.length - 1) {
        e.preventDefault();
        moveFocus(rowIdx + 1, 0);
    } else if (e.key === 'ArrowUp' && rowIdx > 0) {
        e.preventDefault();
        moveFocus(rowIdx - 1, 0);
    }
}

function moveFocus(rowIdx, colOffset) {
    const rows = document.querySelectorAll('#gridBody tr');
    if (!rows[rowIdx]) return;
    const inputs = rows[rowIdx].querySelectorAll('.cell-input');
    if (inputs[colOffset]) {
        inputs[colOffset].focus();
        inputs[colOffset].select();
    }
}

// --- CRUD Operations ---

window.addNewWarehouse = function () {
    const newWarehouse = {
        id: 'new_' + Date.now(),
        name: '',
        email: '',
        phone: '',
        city: '',
        country: '',
        zip_code: ''
    };
    warehousesData.push(newWarehouse);
    modifiedIds.add(newWarehouse.id);
    renderGrid();

    setTimeout(() => {
        const rows = document.querySelectorAll('#gridBody tr');
        const lastRow = rows[rows.length - 1];
        if (lastRow) {
            const input = lastRow.querySelector('input[data-field="name"]');
            if (input) {
                input.focus();
                input.click();
            }
        }
    }, 50);
    saveDraft();
    updateActionStatus('New row added');
};

window.deleteWarehouse = function (index) {
    const w = warehousesData[index];
    if (confirm(`Are you sure you want to delete "${w.name || 'this warehouse'}"?`)) {
        if (!w.id.toString().startsWith('new_')) {
            deletedIds.add(w.id.toString());
        }
        modifiedIds.delete(w.id.toString());
        selectedIds.delete(w.id.toString());
        warehousesData.splice(index, 1);
        renderGrid();
        saveDraft();
        updateBulkToolbar();
        updateActionStatus('Deleted');
    }
};

/**
 * Checks if a warehouse is referenced by other records
 * Used to provide helpful error messages when deletion is blocked by FK constraints
 */
async function getWarehouseDependencies(warehouseId) {
    if (!warehouseId || warehouseId.toString().startsWith('new_')) return null;

    try {
        const checks = [
            { table: 'transactions', label: 'Transactions' },
            { table: 'purchases', label: 'Purchases' },
            { table: 'purchase_returns', label: 'Purchase Returns' },
            { table: 'transfers', label: 'Transfers (From)', field: 'from_warehouse_id' },
            { table: 'transfers', label: 'Transfers (To)', field: 'to_warehouse_id' },
            { table: 'expenses', label: 'Expenses' },
            { table: 'quotations', label: 'Quotations' },
            { table: 'product_warehouses', label: 'Product Stock Records' }
        ];

        const results = await Promise.all(checks.map(async (check) => {
            const field = check.field || 'warehouse_id';
            const { count, error } = await window.supabase
                .from(check.table)
                .select('*', { count: 'exact', head: true })
                .eq(field, warehouseId);

            if (error && error.code !== 'PGRST116') { // Ignore missing table errors if any
                console.warn(`Dependency check failed for ${check.table}:`, error);
                return null;
            }
            return count > 0 ? { label: check.label, count } : null;
        }));

        return results.filter(r => r !== null);
    } catch (e) {
        console.error('Error checking warehouse dependencies:', e);
        return null;
    }
}

window.saveChanges = async function () {
    const btn = document.getElementById('saveBtn');
    if (!btn) return;
    const originalContent = btn.innerHTML;

    try {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        btn.disabled = true;
        updateActionStatus('Saving...');

        // 1. Handle Deletions first
        if (deletedIds.size > 0) {
            const idsToDelete = Array.from(deletedIds);
            const { error } = await window.supabase
                .from('warehouses')
                .delete()
                .in('id', idsToDelete);

            if (error) {
                // Handle Foreign Key Violation (23503)
                if (error.code === '23503' || error.message?.includes('violates foreign key constraint')) {
                    const deps = await getWarehouseDependencies(idsToDelete[0]); // Check the first one that failed
                    let msg = "Cannot delete warehouse(s): They are referenced by other records.";
                    if (deps && deps.length > 0) {
                        msg += "\n\nDependencies found:\n" + deps.map(d => `- ${d.label}: ${d.count}`).join('\n');
                        msg += "\n\nPlease remove or reassign these records before deleting the warehouse.";
                    }
                    throw new Error(msg);
                }
                throw error;
            }
        }

        // 2. Handle Upserts
        const toSave = warehousesData
            .filter(w => modifiedIds.has(w.id))
            .map(w => {
                const payload = {
                    name: w.name,
                    email: w.email,
                    phone: w.phone,
                    city: w.city,
                    country: w.country,
                    zip_code: w.zip_code
                };
                if (!w.id.toString().startsWith('new_')) {
                    payload.id = w.id;
                }
                return payload;
            })
            .filter(w => w.name);

        if (toSave.length > 0) {
            const { error } = await window.supabase
                .from('warehouses')
                .upsert(toSave);
            if (error) throw error;
        }

        alert('Changes saved successfully!');
        clearDraft();
        await window.loadWarehouses();

        if (window.parent && typeof window.parent.loadReferenceData === 'function') {
            await window.parent.loadReferenceData();
        }
        updateActionStatus('Saved');
    } catch (err) {
        console.error(err);
        alert(err.message || 'Error occurred while saving changes.');
        updateActionStatus('Error');
    } finally {
        btn.innerHTML = originalContent;
        btn.disabled = false;
    }
};

// --- Selection & Bulk Actions ---

window.toggleSelectAll = function (master) {
    const checkboxes = document.querySelectorAll('#gridBody .selection-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = master.checked;
        const id = cb.dataset.id;
        if (master.checked) selectedIds.add(id);
        else selectedIds.delete(id);
    });
    updateBulkToolbar();
};

window.handleSelectionChange = function (cb) {
    const id = cb.dataset.id;
    if (cb.checked) selectedIds.add(id);
    else selectedIds.delete(id);
    updateBulkToolbar();
    updateMasterCheckbox();
};

function updateMasterCheckbox() {
    const master = document.querySelector('#gridHeader input[type="checkbox"]');
    if (!master) return;
    const allSelected = warehousesData.length > 0 && warehousesData.every(w => selectedIds.has(w.id));
    master.checked = allSelected;
    master.indeterminate = selectedIds.size > 0 && !allSelected;
}

function updateBulkToolbar() {
    const toolbar = document.getElementById('bulkToolbar');
    const countEl = document.getElementById('selectedCount');
    if (!toolbar || !countEl) return;

    if (selectedIds.size > 0) {
        toolbar.classList.add('visible');
        toolbar.classList.remove('hidden');
        countEl.textContent = selectedIds.size;
    } else {
        toolbar.classList.add('hidden');
        toolbar.classList.remove('visible');
    }
}

window.clearSelection = function () {
    selectedIds.clear();
    const master = document.querySelector('#gridHeader input[type="checkbox"]');
    if (master) master.checked = false;
    const items = document.querySelectorAll('#gridBody .selection-checkbox');
    items.forEach(i => i.checked = false);
    updateBulkToolbar();
    updateActionStatus('Selection cleared');
};

window.bulkDelete = async function () {
    if (selectedIds.size === 0) return;
    if (confirm(`Are you sure you want to delete ${selectedIds.size} selected warehouses?`)) {
        const btn = document.getElementById('bulkDeleteBtn'); // Assuming there might be one, or just update status
        try {
            updateActionStatus('Deleting...');
            const idsToDelete = Array.from(selectedIds);
            const realIds = idsToDelete.filter(id => !id.toString().startsWith('new_'));

            if (realIds.length > 0) {
                const { error } = await window.supabase
                    .from('warehouses')
                    .delete()
                    .in('id', realIds);

                if (error) {
                    if (error.code === '23503' || error.message?.includes('violates foreign key constraint')) {
                        // Check first ID that potentially failed
                        const deps = await getWarehouseDependencies(realIds[0]);
                        let msg = "Cannot delete some warehouses: They are referenced by other records.";
                        if (deps && deps.length > 0) {
                            msg += "\n\nDependencies found for one or more items:\n" + deps.map(d => `- ${d.label}: ${d.count}`).join('\n');
                        }
                        throw new Error(msg);
                    }
                    throw error;
                }
            }

            warehousesData = warehousesData.filter(w => !selectedIds.has(w.id.toString()));
            selectedIds.clear();
            renderGrid();
            saveDraft();
            alert('Bulk deletion complete.');
            updateActionStatus('Deleted');

            if (window.parent && typeof window.parent.loadReferenceData === 'function') {
                await window.parent.loadReferenceData();
            }
        } catch (e) {
            console.error(e);
            alert(e.message || 'Error deleting warehouses.');
            updateActionStatus('Error');
            await window.loadWarehouses(); // Reload to restore UI state since delete failed
        }
    }
};

// --- Column Resizing ---

function setupResizers() {
    const table = document.getElementById('gridTable');
    const headerRow = document.getElementById('gridHeader');
    if (!table || !headerRow) return;

    const resizers = headerRow.querySelectorAll('.resizer');
    const cols = headerRow.querySelectorAll('th');

    resizers.forEach(resizer => {
        resizer.addEventListener('mousedown', initResize);
        resizer.addEventListener('touchstart', initResize, { passive: false });

        function initResize(e) {
            e.preventDefault();
            const th = resizer.closest('th');
            const nextTh = th.nextElementSibling;
            if (!nextTh) return;

            const startX = e.type === 'mousedown' ? e.pageX : e.touches[0].pageX;
            const startWidth = th.offsetWidth;
            const nextStartWidth = nextTh.offsetWidth;
            const totalWidth = table.offsetWidth;

            function onMove(me) {
                const curX = me.type === 'mousemove' ? me.pageX : me.touches[0].pageX;
                const diff = curX - startX;
                const newWidth = ((startWidth + diff) / totalWidth * 100);
                const newNextWidth = ((nextStartWidth - diff) / totalWidth * 100);

                if (newWidth > 5 && newNextWidth > 5) {
                    th.style.width = newWidth + '%';
                    nextTh.style.width = newNextWidth + '%';
                }
            }

            function onEnd() {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onEnd);
                document.removeEventListener('touchmove', onMove);
                document.removeEventListener('touchend', onEnd);
                document.body.style.cursor = 'default';
            }

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onEnd);
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('touchend', onEnd);
            document.body.style.cursor = 'col-resize';
        }
    });
}

// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    if (window.supabase || (window.parent && window.parent.supabase)) {
        if (!window.supabase) window.supabase = window.parent.supabase;
        window.loadWarehouses();
    }
});
