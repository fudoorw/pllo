/**
 * Expense Categories Module - Excel-like Grid
 */

const SCHEMA = [
    { id: 'select', label: '', width: '44px', noSort: true, type: 'checkbox' },
    { id: 'index', label: '#', width: '48px', align: 'center', noSort: true },
    { id: 'name', label: 'Category Name*', width: '40%', minWidth: '200px' },
    { id: 'description', label: 'Description', width: 'auto', minWidth: '200px' },
    { id: 'actions', label: '', width: '52px', align: 'center', noSort: true }
];

let categoriesData = [];
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

window.loadCategories = async function () {
    try {
        updateSyncStatus('Loading...');

        const draft = localStorage.getItem('pos_draft_expense_categories');
        if (draft) {
            const parsed = JSON.parse(draft);
            if ((parsed.modifiedCategories && parsed.modifiedCategories.length > 0) || 
                (parsed.deletedCategories && parsed.deletedCategories.length > 0)) {
                if (confirm('Resume unsaved expense category changes?')) {
                    categoriesData = parsed.categoriesData;
                    modifiedIds = new Set(parsed.modifiedCategories || []);
                    deletedIds = new Set(parsed.deletedCategories || []);
                    renderGrid();
                    updateSyncStatus('Unsaved Changes (Local)');
                    return;
                } else {
                    localStorage.removeItem('pos_draft_expense_categories');
                }
            }
        }

        const { data, error } = await window.supabase
            .from('expense_categories')
            .select('*')
            .order('name');

        if (error) throw error;
        categoriesData = data || [];
        modifiedIds.clear();
        deletedIds.clear();
        renderGrid();
        updateSyncStatus('Synced');
    } catch (e) {
        console.error('Error loading categories:', e);
        updateSyncStatus('Error', 'error');
    }
};

function saveDraft() {
    const draft = {
        categoriesData,
        modifiedCategories: Array.from(modifiedIds),
        deletedCategories: Array.from(deletedIds)
    };
    localStorage.setItem('pos_draft_expense_categories', JSON.stringify(draft));
    updateSyncStatus('Unsaved', 'pending');
}

function clearDraft() {
    localStorage.removeItem('pos_draft_expense_categories');
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
                </div>
            </th>
        `;
    });
    thead.innerHTML = html;
}

function renderBody() {
    const tbody = document.getElementById('gridBody');
    if (!tbody) return;

    if (categoriesData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${SCHEMA.length}" class="empty-state">No categories found. Click "Add Row" to create one.</td></tr>`;
        return;
    }

    tbody.innerHTML = categoriesData.map((cat, index) => {
        const isModified = modifiedIds.has(cat.id);
        const isNew = cat.id && cat.id.toString().startsWith('new_');
        const isSelected = selectedIds.has(cat.id);

        return `
            <tr class="${isModified ? 'modified' : ''} ${isNew ? 'new-row' : ''}" data-index="${index}">
                <td class="check-col">
                    <label class="checkbox-container">
                        <input type="checkbox" class="selection-checkbox" onchange="handleSelectionChange(this)" data-id="${cat.id}" ${isSelected ? 'checked' : ''}>
                        <span class="checkmark"></span>
                    </label>
                </td>
                <td class="row-idx">${index + 1}</td>
                <td>
                    <div class="cell-container">
                        <input type="text" class="cell-input" value="${escapeHtml(cat.name || '')}" data-field="name" placeholder="Required">
                    </div>
                </td>
                <td>
                    <div class="cell-container">
                        <input type="text" class="cell-input" value="${escapeHtml(cat.description || '')}" data-field="description" placeholder="Optional">
                    </div>
                </td>
                <td class="action-cell">
                    <button class="btn-delete" onclick="deleteCategory(${index})" title="Delete">
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
    const tr = input.closest('tr');
    const rowIdx = parseInt(tr.dataset.index);
    const field = input.dataset.field;
    console.log(`Editing: ${field} [Row ${rowIdx + 1}]`);
}

function handleCellInput(e) {
    const input = e.target;
    const tr = input.closest('tr');
    const index = parseInt(tr.dataset.index);
    const field = input.dataset.field;
    const value = input.value;

    categoriesData[index][field] = value;
    modifiedIds.add(categoriesData[index].id);
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
    } else if (e.key === 'ArrowDown' && rowIdx < categoriesData.length - 1) {
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

window.addNewCategory = function () {
    const newCategory = {
        id: 'new_' + Date.now(),
        name: '',
        description: ''
    };
    categoriesData.push(newCategory);
    modifiedIds.add(newCategory.id);
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
};

window.deleteCategory = function (index) {
    const cat = categoriesData[index];
    if (confirm(`Are you sure you want to delete "${cat.name || 'this category'}"?`)) {
        if (!cat.id.toString().startsWith('new_')) {
            deletedIds.add(cat.id.toString());
        }
        modifiedIds.delete(cat.id.toString());
        selectedIds.delete(cat.id.toString());
        categoriesData.splice(index, 1);
        renderGrid();
        saveDraft();
        updateBulkToolbar();
    }
};

window.saveChanges = async function () {
    const btn = document.getElementById('saveBtn');
    if (!btn) return;
    const originalContent = btn.innerHTML;

    try {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        btn.disabled = true;

        if (deletedIds.size > 0) {
            const { error } = await window.supabase
                .from('expense_categories')
                .delete()
                .in('id', Array.from(deletedIds));
            if (error) throw error;
        }

        const toSave = categoriesData
            .filter(c => modifiedIds.has(c.id))
            .map(c => {
                const payload = {
                    name: c.name,
                    description: c.description
                };
                if (!c.id.toString().startsWith('new_')) {
                    payload.id = c.id;
                }
                return payload;
            })
            .filter(c => c.name);

        if (toSave.length > 0) {
            const { error } = await window.supabase
                .from('expense_categories')
                .upsert(toSave);
            if (error) throw error;
        }

        alert('Changes saved successfully!');
        clearDraft();
        await window.loadCategories();

        if (window.parent && typeof window.parent.loadReferenceData === 'function') {
            await window.parent.loadReferenceData();
        }
    } catch (err) {
        console.error(err);
        alert('Error: ' + err.message);
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
    const allSelected = categoriesData.length > 0 && categoriesData.every(c => selectedIds.has(c.id));
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
};

window.bulkDelete = async function () {
    if (selectedIds.size === 0) return;
    if (confirm(`Are you sure you want to delete ${selectedIds.size} selected categories?`)) {
        try {
            const idsToDelete = Array.from(selectedIds);
            const realIds = idsToDelete.filter(id => !id.toString().startsWith('new_'));

            if (realIds.length > 0) {
                const { error } = await window.supabase
                    .from('expense_categories')
                    .delete()
                    .in('id', realIds);
                if (error) throw error;
            }

            categoriesData = categoriesData.filter(c => !selectedIds.has(c.id.toString()));
            selectedIds.clear();
            renderGrid();
            saveDraft();
            alert('Bulk deletion complete.');
        } catch (e) {
            console.error(e);
            alert('Error deleting: ' + e.message);
        }
    }
};

window.refreshData = async function () {
    await window.loadCategories();
};

// --- Selection Logic (for compatibility) ---
window.selectedIds = selectedIds;
window.handleSelectionChange = window.handleSelectionChange;
window.clearSelection = window.clearSelection;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    if (window.supabase || (window.parent && window.parent.supabase)) {
        if (!window.supabase) window.supabase = window.parent.supabase;
        window.loadCategories();
    }
});
