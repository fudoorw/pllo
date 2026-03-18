let items = [];
let suppliers = [];
let warehouses = [];
let units = [];
let unitsMap = new Map();
let productsMap = new Map();
let productsArray = [];
let loadedOrderId = null;

// Reusable Paginated Fetch Utility
async function fetchAll(table, selectQuery = '*') {
    let allData = [];
    let from = 0;
    const step = 1000;

    // Show partial loading if UI elements exist
    const statusEl = document.getElementById('loadingStatus');

    while (true) {
        if (statusEl) statusEl.textContent = `Syncing ${table}... (${allData.length} loaded)`;

        const { data, error } = await supabase
            .from(table)
            .select(selectQuery)
            .range(from, from + step - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        allData = allData.concat(data);
        if (data.length < step) break;
        from += step;
    }
    return allData;
}

window.onload = () => {
    document.getElementById('orderDate').value = new Date().toISOString().split('T')[0];
    setTimeout(initData, 150);
};

async function initData() {
    // Show global loader if present
    const loader = document.getElementById('globalLoader');
    if (loader) loader.classList.remove('hidden');

    try {
        // 1. Fetch Suppliers
        suppliers = await fetchAll('suppliers', 'id, name');

        // 2. Fetch Warehouses
        warehouses = await fetchAll('warehouses', 'id, name');

        // 3. Load Units
        units = await fetchAll('units', 'id, name');
        units.forEach(u => unitsMap.set(u.id, u.name));

        // Inject custom arrow styles
        const styleEl = document.createElement('style');
        styleEl.textContent = `
            select.glass-input {
                appearance: none;
                background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Cpath fill='none' stroke='currentColor' stroke-width='2' d='M6 8l4 4 4-4'/%3E%3C/svg%3E");
                background-repeat: no-repeat;
                background-position: right 0.5rem center;
                background-size: 0.75rem;
            }
        `;
        document.head.appendChild(styleEl);

        // 4. Load ALL Products using loop
        const prodData = await fetchAll('products', 'id, code, name, barcodes, cost, price, pcs_per_box, unit_id');
        productsArray = prodData;
        prodData.forEach(p => {
            productsMap.set(p.id, p);
            if (p.code) productsMap.set(p.code, p);
            if (p.barcodes && Array.isArray(p.barcodes)) {
                p.barcodes.forEach(bc => productsMap.set(bc, p));
            }
        });

        // populate order dropdown
        await loadOrderDropdown();

        addRow();
        await generateOrderCode();

    } catch (err) {
        console.error('Init error:', err);
        alert('❌ Failed to load data: ' + err.message);
    } finally {
        if (loader) loader.classList.add('hidden');
    }
}

let pendingOrders = [];
async function loadOrderDropdown() {
    try {
        const { data } = await supabase.from('purchases').select('id, reference_no, supplier:suppliers(name)').eq('status', 'Ordered').order('date', { ascending: false }).limit(50);
        pendingOrders = data || [];
    } catch (e) {
        console.error('Order dropdown load error', e);
    }
}

function showDropdown(input, type, event) {
    if (event) event.stopPropagation();
    let menu = document.getElementById('ddMenu');
    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'ddMenu';
        menu.className = 'dropdown-menu';
        menu.style.display = 'none';
        document.body.appendChild(menu);
    }
    const rect = input.getBoundingClientRect();

    let options = [];
    if (type === 'suppliers') {
        options = suppliers.map(s => ({ id: s.id, name: s.name }));
    } else if (type === 'warehouses') {
        options = warehouses.map(w => ({ id: w.id, name: w.name }));
    } else if (type === 'paymentTypes' || type === 'footerPaymentTypes') {
        options = [
            { id: 'Cash', name: 'Cash' },
            { id: 'Credit', name: 'Credit' },
            { id: 'Consignment', name: 'Consignment' }
        ];
    } else if (type === 'taxCodes') {
        options = [
            { id: '0', name: 'Non-Taxable' },
            { id: '7', name: 'Standard GST (7%)' }
        ];
    }
    else if (type === 'orders') {
        options = pendingOrders.map(o => ({ id: o.id, name: o.reference_no + ' (' + (o.supplier?.name || 'N/A') + ')' }));
    }

    if (options.length === 0) return hideDropdown();

    menu.innerHTML = options.map(opt => `
        <div class="dropdown-item" onclick="selectDropdownItem('${type}', '${opt.id}', '${opt.name}')">
            ${opt.name}
        </div>
    `).join('');

    menu.style.display = 'block';
    menu.style.width = rect.width + 'px';
    menu.style.left = rect.left + 'px';

    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < 250) {
        // Open Upward
        menu.style.top = (rect.top + window.scrollY - 8) + 'px';
        menu.style.transform = 'translateY(-100%)';
    } else {
        // Open Downward
        menu.style.top = (rect.bottom + window.scrollY) + 'px';
        menu.style.transform = 'none';
    }
}

function selectDropdownItem(type, id, name) {
    if (type === 'suppliers') {
        document.getElementById('supplierSearch').value = name;
        document.getElementById('supplierId').value = id;
    } else if (type === 'warehouses') {
        document.getElementById('warehouseSearch').value = name;
        document.getElementById('warehouseId').value = id;
    } else if (type === 'paymentTypes' || type === 'footerPaymentTypes') {
        const searchInput = document.getElementById('footerPaymentTypeSearch');
        const hiddenInput = document.getElementById('footerPaymentType');
        if (searchInput) searchInput.value = name;
        if (hiddenInput) hiddenInput.value = id;
    } else if (type === 'taxCodes') {
        document.getElementById('taxCodeSearch').value = name;
        document.getElementById('taxCode').value = id;
        calculateTotals();
    } else if (type === 'orders') {
        const searchInput = document.querySelector('[onclick*="orders"]');
        if (searchInput) searchInput.value = name;
        loadOrder(id);
    }
    hideDropdown();
}

function openSelectDropdown(selectEl) {
    selectEl.focus();
    if (selectEl.showPicker) {
        try {
            selectEl.showPicker();
        } catch (e) { }
    }
}

function handleGenericKey(index, colId, e) {
    const menu = document.getElementById('ddMenu');
    if (menu && menu.style.display === 'block') return;

    if (e.target.tagName === 'SELECT') {
        if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            e.target.blur();
            setTimeout(() => moveFocus(index, colId, 'right'), 10);
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            return;
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            moveFocus(index, colId, 'right');
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            moveFocus(index, colId, 'left');
        }
        return;
    }

    if (e.key === 'ArrowRight') {
        e.preventDefault();
        moveFocus(index, colId, 'right');
    } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        moveFocus(index, colId, 'left');
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveFocus(index, colId, 'down');
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveFocus(index, colId, 'up');
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (colId === 'remark') {
            addRow(true);
        } else {
            moveFocus(index, colId, 'right');
        }
    }
}

window.onclick = function (event) {
    if (!event.target.matches('.glass-input') && !event.target.matches('.cell-input') && !event.target.closest('.dropdown-menu')) {
        hideDropdown();
    }
};

let activeSearchIdx = -1;

function renderTable() {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';
    items.forEach((item, index) => {
        const tr = document.createElement('tr');
        const isP = item.isPreview;
        const mutedClass = isP ? 'preview-text' : '';

        tr.innerHTML = `
            <td class="row-idx">${index + 1}</td>
            <td>
                <div class="cell-container">
                    <input type="text" value="${item.itemCode || ''}" 
                        id="itemCode-${index}"
                        oninput="handleSearch(${index}, 'itemCode', this.value)" 
                        onkeydown="handleGridKey(${index}, event)"
                        class="cell-input ${mutedClass}" placeholder="Code...">
                </div>
            </td>
            <td>
                <div class="cell-container">
                    <input type="text" value="${item.barcode || ''}" 
                        id="barcode-${index}"
                        oninput="handleSearch(${index}, 'barcode', this.value)" 
                        onkeydown="handleGridKey(${index}, event)"
                        class="cell-input ${mutedClass}" placeholder="Barcode...">
                </div>
            </td>
            <td>
                <div class="cell-container">
                    <input type="text" value="${item.description || ''}" 
                        id="description-${index}"
                        oninput="lookupProduct(${index}, 'description', this.value)"
                        onkeydown="handleGridKey(${index}, event)"
                        class="cell-input ${mutedClass}" placeholder="Search...">
                </div>
            </td>
            <td>
                <div class="cell-container" style="justify-content: center;">
                    <input type="number" value="${item.qty || 0}" id="qty-${index}"
                        oninput="updateItem(${index}, 'qty', this.value)"
                        onkeydown="handleGenericKey(${index}, 'qty', event)"
                        class="cell-input text-center no-spinner font-bold ${mutedClass}">
                </div>
            </td>
            <td>
                <div class="cell-container" style="justify-content: center;">
                    <select onfocus="openSelectDropdown(this)" onchange="updateItem(${index}, 'unitId', this.value); handleGenericKey(${index}, 'unit', event)" id="unit-${index}"
                        onkeydown="handleGenericKey(${index}, 'unit', event)"
                        class="cell-input select-dropdown text-center cursor-pointer" style="height: 26px; padding: 0 24px 0 4px;">
                        <option value="">Unit</option>
                        ${units.map(u => `<option value="${u.id}" ${item.unitId === u.id ? 'selected' : ''}>${u.name}</option>`).join('')}
                    </select>
                </div>
            </td>
            <td>
                <div class="cell-container" style="justify-content: flex-end;">
                    <input type="number" value="${item.cost || 0}" id="cost-${index}"
                        oninput="updateItem(${index}, 'cost', this.value)"
                        onkeydown="handleGenericKey(${index}, 'cost', event)"
                        class="cell-input text-right no-spinner ${mutedClass}">
                </div>
            </td>
            <td class="text-right font-bold pr-3" id="amount-${index}">${(item.amount || 0).toLocaleString()}</td>
            <td>
                <div class="cell-container">
                    <input type="text" value="${item.remark || ''}" id="remark-${index}"
                        onchange="updateItem(${index}, 'remark', this.value)"
                        onkeydown="handleGenericKey(${index}, 'remark', event)"
                        class="cell-input ${mutedClass}" placeholder="...">
                </div>
            </td>
            <td class="text-center">
                <button onclick="removeRow(${index})" class="text-white/20 hover:text-red-500 transition text-sm">
                    <i class="fas fa-times"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);

        // Add blur validation
        const rowInputs = tr.querySelectorAll('input');
        const codeInp = rowInputs[0];
        const barInp = rowInputs[1];

        const validateRow = (inp, fieldType) => {
            const val = inp.value.trim().toLowerCase();
            if (!val) return;
            const p = productsArray.find(prd => {
                if (fieldType === 'itemCode') {
                    return prd.code && prd.code.toLowerCase() === val;
                } else if (fieldType === 'barcode') {
                    return prd.barcodes && prd.barcodes.some(b => b.toLowerCase() === val);
                }
                return false;
            });
            if (!p) {
                alert(`${fieldType === 'itemCode' ? 'Item code' : 'Barcode'} not found. Exact match required.`);
                inp.value = '';
                inp.focus();
                // Clear row in array as well
                handleSearch(index, fieldType, '');
            }
        };

        codeInp.addEventListener('blur', () => validateRow(codeInp, 'itemCode'));
        barInp.addEventListener('blur', () => validateRow(barInp, 'barcode'));
    });
    calculateTotals();
}

function handleSearch(idx, field, query) {
    updateItem(idx, field, query);
    items[idx].lastTyped = field;

    if (!query || query.length < 1) {
        items[idx].isPreview = false;
        items[idx].tempProductId = null;
        return;
    }

    const q = query.toLowerCase();

    // Strict exact match lookup - field specific to avoid cross-matching (e.g. code matching another product's barcode)
    let product = productsArray.find(p => {
        if (field === 'itemCode') {
            return p.code && p.code.toLowerCase() === q;
        } else if (field === 'barcode') {
            return p.barcodes && p.barcodes.some(b => b.toLowerCase() === q);
        }
        return false;
    });

    if (product) {
        items[idx].isPreview = true;
        items[idx].tempProductId = product.id;
        items[idx].itemCode = product.code || items[idx].itemCode;
        items[idx].barcode = product.barcodes?.[0] || items[idx].barcode;
        items[idx].description = product.name || items[idx].description;
        items[idx].cost = product.cost || product.price || 0;
        items[idx].pcsBox = product.pcs_per_box || 1;
        items[idx].pcsPrice = product.cost || product.price || 0;

        if (product.unit_id) {
            const unit = units.find(u => u.id === product.unit_id);
            items[idx].unitId = product.unit_id;
            items[idx].unitName = unit ? unit.name : 'PCS';
        }

        const row = document.getElementById('tableBody').children[idx];
        if (row) {
            const inputs = row.querySelectorAll('input');
            if (field !== 'itemCode') inputs[0].value = product.code || '';
            if (field !== 'barcode') inputs[1].value = product.barcodes?.[0] || '';
            if (field !== 'description') inputs[2].value = product.name || '';
            inputs[4].value = product.cost || product.price || 0; // Corrected index from 5 to 4

            inputs.forEach((inp, i) => {
                if ([0, 1, 2, 4].includes(i)) { // Corrected index from 5 to 4
                    const fNames = ['itemCode', 'barcode', 'description', 'cost'];
                    const fieldMapping = {0: 'itemCode', 1: 'barcode', 2: 'description', 4: 'cost'};
                    if (fieldMapping[i] !== field) {
                        inp.classList.add('preview-text');
                    }
                }
            });
        }
    } else {
        items[idx].isPreview = false;
        items[idx].tempProductId = null;
        
        // Explicitly clear fields when no exact match found to avoid "sticky" stale data
        items[idx].product_id = null;
        items[idx].barcode = field === 'barcode' ? items[idx].barcode : '';
        items[idx].description = field === 'description' ? items[idx].description : '';
        items[idx].cost = 0;
        items[idx].unitId = '';
        items[idx].unitName = 'PCS';
        items[idx].amount = 0;

        const row = document.getElementById('tableBody').children[idx];
        if (row) {
            const inputs = row.querySelectorAll('input');
            inputs.forEach(inp => inp.classList.remove('preview-text'));
            
            // Re-sync UI with cleared fields except for the field being typed
            if (field !== 'barcode') {
                const bInp = document.getElementById(`barcode-${idx}`);
                if (bInp) bInp.value = '';
            }
            if (field !== 'description') {
                const dInp = document.getElementById(`description-${idx}`);
                if (dInp) dInp.value = '';
            }
            const cInp = document.getElementById(`cost-${idx}`);
            if (cInp) cInp.value = 0;

            const aCell = document.getElementById(`amount-${idx}`);
            if (aCell) aCell.textContent = '0';
        }

        if (q.length > 0 && field === 'description') {
            showProductSearchDropdown(idx, q, field);
        } else {
            hideProductSearchDropdown();
        }
    }
}

function lookupProduct(index, type, value) {
    items[index][type] = value;
    if (type === 'description') {
        showProductSearchDropdown(index, value);
        return;
    }
    handleSearch(index, type, value);
}

let productSearchIndex = 0;
let productSearchItems = [];

function showProductSearchDropdown(index, query, field = 'description') {
    let menu = document.getElementById('productSearchMenu');
    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'productSearchMenu';
        menu.className = 'glass-card fixed z-50 rounded-lg overflow-hidden border border-white/10 hide-scrollbar';
        menu.style.display = 'none';
        document.body.appendChild(menu);
    }

    const input = document.getElementById(`${field}-${index}`); // Use dynamic field
    if (!input || !menu) return;

    if (!query || query.length < 1) {
        menu.style.display = 'none';
        return;
    }

    const q = query.toLowerCase();
    productSearchItems = productsArray
        .filter(p => {
            if (!p) return false;
            if (field === 'itemCode') return p.code && p.code.toLowerCase() === q;
            if (field === 'barcode') return p.barcodes && p.barcodes.some(b => b.toLowerCase() === q);
            return false;
        })
        .slice(0, 15);

    productSearchIndex = index;

    if (productSearchItems.length === 0) {
        menu.style.display = 'none';
        return;
    }

    let html = '';
    productSearchItems.forEach((p, i) => {
        html += `<div class="dropdown-item" onclick="selectProductFromSearch(${i})" 
            style="padding:8px 12px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.05);font-size:11px;">
            <div style="font-weight:600">${p.name}</div>
            <div style="color:var(--text-muted);font-size:9px;">Code: ${p.code || '-'} | Cost: ${p.cost || 0}</div>
        </div>`;
    });

    menu.innerHTML = html;
    menu.style.display = 'block';

    const rect = input.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = (rect.bottom + 2) + 'px';
    menu.style.left = rect.left + 'px';
    menu.style.minWidth = (rect.width) + 'px';
    menu.style.maxHeight = '200px';
    menu.style.overflowY = 'auto';
}

function selectProductFromSearch(itemIdx) {
    const menu = document.getElementById('productSearchMenu');
    menu.style.display = 'none';

    const p = productSearchItems[itemIdx];
    if (!p) return;

    const index = productSearchIndex;
    items[index].isPreview = true;
    items[index].tempProductId = p.id;
    items[index].product_id = p.id;
    items[index].itemCode = p.code || '';
    items[index].barcode = p.barcodes?.[0] || '';
    items[index].description = p.name;
    items[index].cost = p.cost || 0;
    items[index].pcsBox = p.pcs_per_box || 1;
    items[index].pcsPrice = p.cost || 0;

    if (p.unit_id) {
        const unit = units.find(u => u.id === p.unit_id);
        items[index].unitId = p.unit_id;
        items[index].unitName = unit ? unit.name : 'PCS';
    } else {
        items[index].unitId = null;
        items[index].unitName = 'PCS';
    }

    renderTable();

    setTimeout(() => {
        const qtyInput = document.getElementById(`qty-${index}`);
        qtyInput?.focus();
        qtyInput?.select();
    }, 50);
}

document.addEventListener('click', function (e) {
    const menu = document.getElementById('productSearchMenu');
    if (menu && !e.target.closest('#productSearchMenu') && !e.target.closest('[id^="description-"]')) {
        menu.style.display = 'none';
    }
});

const gridColumns = ['itemCode', 'barcode', 'description', 'qty', 'unit', 'cost', 'remark'];

function getCellId(rowIdx, colId) {
    return `${colId}-${rowIdx}`;
}

function focusCell(rowIdx, colId) {
    const input = document.getElementById(getCellId(rowIdx, colId));
    if (input) {
        input.focus();
        if (input.select) input.select();
    }
}

function moveFocus(rowIdx, colId, direction) {
    const colIdx = gridColumns.indexOf(colId);
    if (direction === 'right') {
        if (colIdx < gridColumns.length - 1) {
            focusCell(rowIdx, gridColumns[colIdx + 1]);
        }
    } else if (direction === 'left') {
        if (colIdx > 0) {
            focusCell(rowIdx, gridColumns[colIdx - 1]);
        }
    } else if (direction === 'down') {
        if (rowIdx < items.length - 1) {
            focusCell(rowIdx + 1, colId);
        } else if (items[rowIdx] && items[rowIdx].product_id) {
            addRow(true);
            setTimeout(() => focusCell(rowIdx + 1, colId), 50);
        }
    } else if (direction === 'up') {
        if (rowIdx > 0) {
            focusCell(rowIdx - 1, colId);
        }
    }
}

function handleGridKey(idx, e) {
    const menu = document.getElementById('ddMenu');
    if (menu && menu.style.display === 'block') return;

    const productMenu = document.getElementById('productSearchMenu');
    if (productMenu && productMenu.style.display === 'block') return;

    if (e.target.tagName === 'SELECT') {
        if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            e.target.blur();
            const colId = e.target.id.replace(/-\d+$/, '');
            setTimeout(() => moveFocus(idx, colId, 'right'), 10);
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            const colId = e.target.id.replace(/-\d+$/, '');
            moveFocus(idx, colId, 'right');
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            const colId = e.target.id.replace(/-\d+$/, '');
            moveFocus(idx, colId, 'left');
        }
        return;
    }

    const inputId = e.target.id;
    const currentCol = inputId.replace(/-\d+$/, '') || 'itemCode';
    const isReadOnly = e.target.readOnly;

    if (e.key === 'ArrowRight') {
        if (isReadOnly) {
            e.preventDefault();
            moveFocus(idx, currentCol, 'right');
            return;
        }
        if (currentCol === 'itemCode' || currentCol === 'barcode') {
            const val = e.target.value.trim();
            if (val) {
                const q = val.toLowerCase();
                const exactMatch = productsArray.find(p => {
                    if (currentCol === 'itemCode') {
                        return p.code && p.code.toLowerCase() === q;
                    } else if (currentCol === 'barcode') {
                        return p.barcodes && p.barcodes.some(b => b.toLowerCase() === q);
                    }
                    return false;
                });
                if (!exactMatch) {
                    e.preventDefault();
                    alert(`Invalid ${currentCol === 'itemCode' ? 'item code' : 'barcode'}. Exact match required.`);
                    e.target.select();
                    return;
                }
            }
        }
        const selStart = e.target.selectionStart;
        const val = e.target.value;
        if (selStart === val.length) {
            e.preventDefault();
            moveFocus(idx, currentCol, 'right');
        }
    } else if (e.key === 'ArrowLeft') {
        if (isReadOnly) {
            e.preventDefault();
            moveFocus(idx, currentCol, 'left');
            return;
        }
        const selStart = e.target.selectionStart;
        if (selStart === 0) {
            e.preventDefault();
            moveFocus(idx, currentCol, 'left');
        }
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveFocus(idx, currentCol, 'down');
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveFocus(idx, currentCol, 'up');
    } else if (e.key === 'Enter') {
        if (currentCol === 'itemCode' || currentCol === 'barcode') {
            const val = e.target.value.trim();
            if (val) {
                const q = val.toLowerCase();
                const exactMatch = productsArray.find(p => {
                    if (currentCol === 'itemCode') {
                        return p.code && p.code.toLowerCase() === q;
                    } else if (currentCol === 'barcode') {
                        return p.barcodes && p.barcodes.some(b => b.toLowerCase() === q);
                    }
                    return false;
                });
                if (!exactMatch) {
                    e.preventDefault();
                    alert(`Invalid ${currentCol === 'itemCode' ? 'item code' : 'barcode'}. Exact match required.`);
                    e.target.select();
                    return;
                }
            }
        }
        if (items[idx].isPreview && items[idx].tempProductId) {
            e.preventDefault();
            confirmSelection(idx);
        } else {
            e.preventDefault();
            moveFocus(idx, currentCol, 'right');
        }
    } else if (e.key === 'Escape') {
        if (items[idx].isPreview) {
            items[idx].isPreview = false;
            renderTable();
        }
    }
}

function confirmSelection(idx) {
    const productId = items[idx].tempProductId;
    const product = productsMap.get(productId);
    if (!product) return;

    const unit = units.find(u => u.id === product.unit_id);
    const unitName = unit ? unit.name : 'PCS';

    items[idx] = {
        product_id: product.id,
        itemCode: product.code || '',
        barcode: product.barcodes?.[0] || '',
        description: product.name || '',
        qty: 1,
        unitId: product.unit_id || null,
        unitName: unitName,
        cost: product.cost || 0,
        pcsBox: product.pcs_per_box || 1,
        pcsPrice: product.cost || 0,
        amount: 0,
        remark: '',
        isPreview: false,
        tempProductId: null
    };

    renderTable();

    setTimeout(() => {
        const row = document.getElementById('tableBody').children[idx];
        if (row) {
            const qtyInput = row.querySelectorAll('input')[3];
            if (qtyInput) {
                qtyInput.focus();
                qtyInput.select();
            }
        }
    }, 50);
}

function updateItem(index, field, value) {
    items[index][field] = value;
    if (field === 'unitId') {
        const oldUnitName = (items[index].unitName || '').toUpperCase();
        items[index].unitId = value;
        const newUnitName = (unitsMap.get(value) || '').toUpperCase();
        items[index].unitName = unitsMap.get(value) || '';

        const pBox = parseFloat(items[index].pcsBox) || 1;

        if (newUnitName.includes('BOX') && pBox > 1) {
            if (!oldUnitName.includes('BOX')) {
                items[index].pcsPrice = parseFloat(items[index].cost) || 0;
            }
            const boxPrice = (items[index].pcsPrice || items[index].cost || 0) * pBox;
            items[index].cost = boxPrice;
            const costCell = document.getElementById(`cost-${index}`);
            if (costCell) costCell.value = boxPrice;
        } else if ((newUnitName.includes('PCS') || newUnitName.includes('PIECE')) && items[index].pcsPrice && items[index].pcsPrice > 0) {
            items[index].cost = items[index].pcsPrice;
            const costCell = document.getElementById(`cost-${index}`);
            if (costCell) costCell.value = items[index].pcsPrice;
        }

        recalculateRow(index);
    }
    if (['qty', 'cost', 'pcsBox'].includes(field)) {
        const qty = parseFloat(items[index].qty) || 0;
        const cost = parseFloat(items[index].cost) || 0;

        items[index].amount = Math.max(0, qty * cost);

        const amountCell = document.getElementById(`amount-${index}`);
        if (amountCell) amountCell.textContent = items[index].amount.toLocaleString();
        calculateTotals();
    }
}

function addRow(shouldFocus = false) {
    const index = items.length;
    items.push({
        product_id: null,
        itemCode: '',
        barcode: '',
        description: '',
        qty: 0,
        pcsBox: '',
        unitId: '',
        cost: 0,
        amount: 0,
        remark: '',
        isPreview: false,
        tempProductId: null
    });
    renderTable();
    if (shouldFocus) {
        setTimeout(() => {
            document.getElementById(`barcode-${index}`)?.focus();
        }, 50);
    }
}

function removeRow(index) {
    items.splice(index, 1);
    if (items.length === 0) addRow();
    renderTable();
}

function recalculateRow(index) {
    const qty = parseFloat(items[index].qty) || 0;
    const cost = parseFloat(items[index].cost) || 0;

    items[index].amount = Math.max(0, qty * cost);

    const amountCell = document.getElementById(`amount-${index}`);
    if (amountCell) amountCell.textContent = items[index].amount.toLocaleString();

    calculateTotals();
}

function calculateTotals() {
    const sub = items.reduce((acc, i) => acc + (parseFloat(i.amount) || 0), 0);
    const taxP = parseFloat(document.getElementById('taxPercent').value) || 0;

    const ship = parseFloat(document.getElementById('shipping').value) || 0;
    const paid = parseFloat(document.getElementById('paidAmount').value) || 0;

    const taxA = (sub * taxP) / 100;
    const net = sub + taxA + ship;

    document.getElementById('displaySubTotal').innerText = sub.toLocaleString();
    document.getElementById('displayTax').innerText = taxA.toLocaleString();
    document.getElementById('displayShipping').innerText = ship.toLocaleString();
    document.getElementById('displayNet').innerText = net.toLocaleString();

    const rem = net - paid;
    document.getElementById('remainAmount').innerText = rem.toLocaleString();

    const badge = document.getElementById('remainBadge');
    if (badge) {
        badge.innerText = `Rem: ${rem.toLocaleString()}`;
        if (paid > 0 || rem !== net) badge.classList.remove('hidden');
        else badge.classList.add('hidden');
    }
}

async function generateOrderCode() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = String(now.getFullYear()).slice(-2);
    const dateStr = `${day}${month}${year}`;

    const prefix = `PO-${dateStr}-`;

    const { data: orders, error } = await supabase
        .from('purchases')
        .select('reference_no')
        .ilike('reference_no', `${prefix}%`)
        .order('reference_no', { ascending: false });

    let nextNum = 1;
    if (orders && orders.length > 0) {
        orders.forEach(o => {
            const num = parseInt(o.reference_no?.replace(prefix, '') || '0');
            if (num >= nextNum) nextNum = num + 1;
        });
    }

    let code = '';
    let isDuplicate = true;
    while (isDuplicate) {
        code = `${prefix}${String(nextNum).padStart(4, '0')}`;
        const exists = orders?.some(o => o.reference_no === code);
        if (!exists) {
            const { data: check } = await supabase.from('purchases').select('id').eq('reference_no', code).maybeSingle();
            if (!check) isDuplicate = false;
            else nextNum++;
        } else {
            nextNum++;
        }
    }

    document.getElementById('referenceNo').value = code;
    document.getElementById('orderCode').value = code;
}

async function saveDraft() {
    await submitOrder('Draft');
}

async function submitOrder(status = 'Ordered') {
    try {
        const supplier_id = document.getElementById('supplierId').value;
        const warehouse_id = document.getElementById('warehouseId').value;

        if (!supplier_id || !warehouse_id) {
            alert('⚠️ Please select Supplier and Warehouse.');
            return;
        }

        const validItems = items.filter(i => (i.product_id || status === 'Draft') && (i.qty > 0 || status === 'Draft'));
        if (validItems.length === 0 && status !== 'Draft') {
            alert('⚠️ Please add at least one valid item.');
            return;
        }

        let ref_code = document.getElementById('referenceNo').value;

        if (!loadedOrderId || !ref_code) {
            await generateOrderCode();
            ref_code = document.getElementById('referenceNo').value;
        }

        const sub = validItems.reduce((acc, i) => acc + i.amount, 0);
        const taxP = parseFloat(document.getElementById('taxPercent').value) || 0;
        const ship = parseFloat(document.getElementById('shipping').value) || 0;
        const paid = parseFloat(document.getElementById('paidAmount').value) || 0;

        const taxA = (sub * taxP) / 100;
        const net = sub + taxA + ship;

        const orderData = {
            reference_no: ref_code,
            date: document.getElementById('orderDate').value || new Date().toISOString().split('T')[0],
            supplier_id,
            warehouse_id,
            status: status,
            payment_status: paid >= net ? 'Paid' : (paid > 0 ? 'Partial' : 'Unpaid'),
            payment_type: document.getElementById('footerPaymentType').value,
            total_qty: validItems.reduce((acc, i) => acc + (parseFloat(i.qty) || 0), 0),
            grand_total: net,
            order_tax_percentage: taxP,
            order_tax_amount: taxA,
            shipping_amount: ship,
            paid_amount: paid,
            tax_code: document.getElementById('taxCode')?.value || null,
            note: document.getElementById('orderNote')?.value || null,
            expected_delivery: document.getElementById('expectedDelivery')?.value || null
        };

        let purchaseId;
        if (loadedOrderId) {
            const { data: pData, error: pErr } = await supabase.from('purchases').update(orderData).eq('id', loadedOrderId).select().single();
            if (pErr) throw pErr;
            purchaseId = pData.id;
            await supabase.from('purchase_items').delete().eq('purchase_id', purchaseId);
        } else {
            let saveSuccess = false;
            let retryCount = 0;
            const maxRetries = 3;

            while (!saveSuccess && retryCount < maxRetries) {
                const { data: pData, error: pErr } = await supabase.from('purchases').insert(orderData).select().single();

                if (pErr) {
                    if (pErr.code === '23505' && !loadedOrderId) {
                        console.warn(`Collision detected for ${orderData.reference_no}. Retrying...`);
                        await generateOrderCode();
                        orderData.reference_no = document.getElementById('referenceNo').value;
                        retryCount++;
                        continue;
                    }
                    throw pErr;
                }

                purchaseId = pData.id;
                saveSuccess = true;
            }

            if (!saveSuccess) throw new Error("Failed to save order after multiple attempts due to sequence collisions.");
        }

        loadedOrderId = purchaseId;

        const itemsToInsert = validItems.map(item => ({
            purchase_id: purchaseId,
            product_id: item.product_id,
            quantity: parseFloat(item.qty) || 0,
            unit_cost: parseFloat(item.cost) || 0,
            subtotal: item.amount,
            unit_id: (item.unitId && item.unitId.length > 30) ? item.unitId : null,
            unit: item.unitName || null,
            pcs_box: item.pcsBox,
            remark: item.remark
        }));

        if (itemsToInsert.length > 0) {
            const { error: itemErr } = await supabase.from('purchase_items').insert(itemsToInsert);
            if (itemErr) throw itemErr;
        }

        // Manual stock update removed - handled automatically via Postgres triggers (trg_purchase_stock_sync)

        document.getElementById('orderCode').value = ref_code;
        document.getElementById('copyBtn').classList.remove('hidden');
        document.getElementById('printBtn').classList.remove('hidden');

        const isDraft = status === 'Draft';
        showSuccessModal(ref_code, isDraft);

    } catch (err) {
        console.error('Save error:', err);
        alert('❌ Failed to save order: ' + err.message);
    }
}

function showSuccessModal(code, isDraft) {
    let modalHtml = `
            <div id="successModal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(15, 23, 42, 0.85);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(12px);">
                <div class="glass-card" style="padding:40px;max-width:420px;width:95%;text-align:center;border-radius:24px;box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);">
                    <div style="font-size:50px;margin-bottom:20px;">${isDraft ? '💾' : '✨'}</div>
                    <h2 style="color:#fff;margin-bottom:10px;font-size:24px;font-weight:800;letter-spacing:-0.5px;">${isDraft ? 'PO Draft Saved!' : 'Order Saved!'}</h2>
                    <p style="color:var(--text-muted);font-size:14px;margin-bottom:24px;">${isDraft ? 'Your progress has been saved as a draft.' : 'Purchase order successfully synced to system.'}</p>
                    
                    <div style="background:rgba(255,255,255,0.05);padding:15px;border-radius:12px;margin-bottom:24px;border:1px dashed var(--primary); display:flex; align-items:center; justify-content:center; gap:10px;">
                        <span style="color:var(--primary);font-family:monospace;font-size:20px;font-weight:800;letter-spacing:1px;">${code}</span>
                        <button onclick="copyToClipboard('${code}')" class="text-white/20 hover:text-white transition-colors" title="Copy Code">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>

                    <div style="display:flex;gap:12px;justify-content:center;">
                        <button onclick="window.location.reload()" style="flex:1;background:rgba(255,255,255,0.1);color:white;padding:12px;border-radius:12px;font-weight:700;font-size:12px;cursor:pointer;border:none;">NEW ORDER</button>
                        <button onclick="document.getElementById('successModal').remove()" style="flex:1;background:var(--primary);color:white;padding:12px;border-radius:12px;font-weight:700;font-size:12px;">KEEP EDITING</button>
                    </div>
                </div>
            </div>
        `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

async function viewRecentOrders() {
    await listOrders('Ordered', '📋 RECENT PURCHASE ORDERS');
}

async function viewDrafts() {
    await listOrders('Draft', '💾 SAVED DRAFTS');
}

async function listOrders(status, title) {
    try {
        const { data, error } = await supabase
            .from('purchases')
            .select('*, supplier:suppliers(name)')
            .eq('status', status)
            .order('date', { ascending: false })
            .limit(20);

        if (error) throw error;

        if (!data || data.length === 0) {
            alert(`No ${status.toLowerCase()} orders found.`);
            return;
        }

        let html = `<div id="listModal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(15, 23, 42, 0.95);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(20px);" onclick="this.remove()">`;
        html += `<div class="glass-card" style="padding:30px;max-width:900px;width:95%;max-height:85vh;overflow-y:auto;border-radius:24px; box-shadow: 0 40px 100px -20px rgba(0,0,0,0.6); position:relative;" onclick="event.stopPropagation()">`;
        html += `<div class="flex justify-between items-center mb-6 sticky top-0 bg-[#0f172a]/80 backdrop-blur-md z-10 py-2">`;
        html += `<h2 style="color:var(--primary);font-size:18px;font-weight:800;letter-spacing:-0.5px;">${title} <span class="text-xs bg-white/10 px-2 py-1 rounded-full ml-2">${data.length} Results</span></h2>`;
        html += `<button onclick="this.closest('#listModal').remove()" style="color:var(--text-muted);font-size:28px;line-height:1;margin-right:-10px;">&times;</button>`;
        html += `</div>`;
        html += `<table style="width:100%;border-collapse:collapse; min-width: 600px;">`;
        html += `<thead><tr style="border-bottom:1px solid rgba(255,255,255,0.1);"><th style="text-align:left;padding:12px;color:var(--text-muted);font-size:10px;text-transform:uppercase;font-weight:800;letter-spacing:1px;">Reference</th><th style="text-align:left;padding:12px;color:var(--text-muted);font-size:10px;text-transform:uppercase;font-weight:800;letter-spacing:1px;">Date</th><th style="text-align:left;padding:12px;color:var(--text-muted);font-size:10px;text-transform:uppercase;font-weight:800;letter-spacing:1px;">Supplier</th><th style="text-align:right;padding:12px;color:var(--text-muted);font-size:10px;text-transform:uppercase;font-weight:800;letter-spacing:1px;">Total Amount</th><th style="text-align:center;padding:12px;color:var(--text-muted);font-size:10px;text-transform:uppercase;font-weight:800;letter-spacing:1px;">Action</th></tr></thead>`;
        html += `<tbody>`;

        data.forEach(order => {
            html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);" class="hover:bg-white/5 transition-colors">`;
            html += `<td style="padding:12px;color:var(--primary);font-weight:700;font-size:12px;">
                <div class="flex items-center gap-2">
                    ${order.reference_no}
                    <button onclick="copyToClipboard('${order.reference_no}')" class="w-6 h-6 flex items-center justify-center rounded-md bg-white/5 hover:bg-white/20 text-indigo-300 hover:text-white transition-all border border-white/5 hover:border-white/20" title="Copy">
                        <i class="fas fa-copy text-[10px]"></i>
                    </button>
                </div>
            </td>`;
            html += `<td style="padding:12px;color:#f1f5f9;font-size:12px;">${((d) => { const dt = new Date(d); const day = String(dt.getDate()).padStart(2, '0'); const mon = dt.toLocaleString('en-US', { month: 'short' }); return day + '-' + mon + '-' + dt.getFullYear(); })(order.date)}</td>`;
            html += `<td style="padding:12px;color:#f1f5f9;font-size:12px;">${order.supplier?.name || 'N/A'}</td>`;
            html += `<td style="padding:12px;color:var(--success);font-weight:700;text-align:right;font-size:12px;">${order.grand_total.toLocaleString()} Ks</td>`;
            html += `<td style="padding:12px;text-align:center;">
                <div class="flex gap-2 justify-center">
                    <button onclick="loadOrder('${order.id}'); this.closest('#listModal').remove();" class="bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-400 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all">LOAD</button>
                    <button onclick="deleteOrder('${order.id}', '${status}')" class="bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all"><i class="fas fa-trash-alt"></i></button>
                </div>
            </td>`;
            html += `</tr>`;
        });

        html += `</tbody></table>`;
        html += `</div></div>`;

        document.body.insertAdjacentHTML('beforeend', html);

    } catch (err) {
        console.error('Load orders error:', err);
        alert('Failed to load orders: ' + err.message);
    }
}

async function deleteOrder(id, currentStatus) {
    if (!confirm(`Are you sure you want to delete this ${currentStatus.toLowerCase()}? This cannot be undone.`)) return;

    try {
        const { error: itemErr } = await supabase.from('purchase_items').delete().eq('purchase_id', id);
        if (itemErr) throw itemErr;

        const { error: pErr } = await supabase.from('purchases').delete().eq('id', id);
        if (pErr) throw pErr;

        alert('Successfully deleted.');

        const modal = document.getElementById('listModal');
        if (modal) {
            modal.remove();
            listOrders(currentStatus, currentStatus === 'Draft' ? '💾 SAVED DRAFTS' : '📋 RECENT PURCHASE ORDERS');
        }

        if (loadedOrderId === id) {
            window.location.reload();
        }

    } catch (err) {
        console.error('Delete error:', err);
        alert('Failed to delete order: ' + err.message);
    }
}

async function loadOrder(id) {
    try {
        const { data: order, error } = await supabase
            .from('purchases')
            .select('*, purchase_items(*)')
            .eq('id', id)
            .single();

        if (error) throw error;

        loadedOrderId = order.id;

        document.getElementById('referenceNo').value = order.reference_no;
        document.getElementById('orderCode').value = order.reference_no;
        document.getElementById('orderDate').value = order.date;

        document.getElementById('supplierId').value = order.supplier_id;
        const sup = suppliers.find(s => s.id === order.supplier_id);
        if (sup) document.getElementById('supplierSearch').value = sup.name;

        const whId = document.getElementById('warehouseId');
        if (whId) whId.value = order.warehouse_id || '';

        const wh = warehouses.find(w => w.id === order.warehouse_id);
        const whSearch = document.getElementById('warehouseSearch');
        if (wh && whSearch) whSearch.value = wh.name;

        const pt = order.payment_type || 'Cash';
        const footerPT = document.getElementById('footerPaymentType');
        if (footerPT) {
            footerPT.value = pt;
            const footerPTSearch = document.getElementById('footerPaymentTypeSearch');
            if (footerPTSearch) footerPTSearch.value = pt;
        }

        const taxCodeEl = document.getElementById('taxCode');
        if (taxCodeEl) {
            const tc = order.tax_code || '0';
            taxCodeEl.value = tc;
            const taxCodeSearchEl = document.getElementById('taxCodeSearch');
            if (taxCodeSearchEl) {
                taxCodeSearchEl.value = tc === '7' ? 'Standard GST (7%)' : 'Non-Taxable';
            }
        }

        const expDel = document.getElementById('expectedDelivery');
        if (expDel) expDel.value = order.expected_delivery || '';

        const note = document.getElementById('orderNote');
        if (note) note.value = order.note || '';

        const taxP = document.getElementById('taxPercent');
        if (taxP) taxP.value = order.order_tax_percentage || 0;

        const ship = document.getElementById('shipping');
        if (ship) ship.value = order.shipping_amount || 0;

        document.getElementById('paidAmount').value = order.paid_amount || 0;

        document.getElementById('copyBtn').classList.remove('hidden');
        document.getElementById('loadedIndicator').classList.remove('hidden');
        document.getElementById('printBtn').classList.remove('hidden');

        items = order.purchase_items.map(pi => {
            const prod = productsMap.get(pi.product_id);
            const unitId = pi.unit_id || prod?.unit_id || '';
            return {
                product_id: pi.product_id,
                itemCode: prod?.code || '',
                barcode: prod?.barcodes?.[0] || '',
                description: prod?.name || '',
                qty: pi.quantity,
                pcsBox: pi.pcs_box || prod?.pcs_per_box || 1,
                unitId: unitId,
                unitName: unitsMap.get(unitId) || pi.unit || 'PCS',
                cost: pi.unit_cost,
                pcsPrice: prod?.cost || pi.unit_cost,
                amount: pi.subtotal,
                remark: pi.remark,
                isPreview: false,
                tempProductId: null
            };
        });

        if (items.length === 0) addRow();
        renderTable();
        calculateTotals();

    } catch (err) {
        console.error('Load error:', err);
        alert('Failed to load order detalles.');
    }
}

function copyToClipboard(text) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        const toast = document.createElement('div');
        toast.style = "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--primary);color:white;padding:10px 20px;border-radius:30px;font-weight:700;font-size:12px;z-index:100000;box-shadow:var(--shadow-glow);";
        toast.innerHTML = `<i class="fas fa-check-circle mr-2"></i> Copied to Clipboard!`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2000);
    });
}

function printOrder() {
    if (!loadedOrderId) {
        alert('Please save the order first before printing.');
        return;
    }
    window.open(`purchase-order-print.html?id=${loadedOrderId}`, '_blank');
}
