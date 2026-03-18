/**
 * Admin Dashboard - Product Management Module
 */

// Module Schema
window.PRODUCT_SCHEMA = [
    { id: 'code', label: 'Item Code', width: '8%', type: 'text' },
    { id: 'barcodes', label: 'Barcodes', width: '15%', type: 'tags' },
    { id: 'name', label: 'Description', width: '15%', type: 'text' },
    { id: 'category_id', label: 'Category', width: '10%', type: 'dropdown', ref: 'refCategories' },
    { id: 'subcategory_id', label: 'Sub-Category', width: '10%', type: 'dropdown', ref: 'refSubcategories', parent: 'category_id' },
    { id: 'brand_id', label: 'Brand', width: '8%', type: 'dropdown', ref: 'refBrands' },
    { id: 'cost', label: 'Cost', width: '7%', type: 'number' },
    { id: 'price', label: 'Price', width: '7%', type: 'number' },
    { id: 'margin', label: 'Margin %', width: '6%', type: 'readonly' },
    { id: 'unit_id', label: 'Unit', width: '8%', type: 'dropdown', ref: 'refUnits' },
    { id: 'supplier', label: 'Supplier', width: '8%', type: 'text' },
    { id: 'shop', label: 'Shop', width: '8%', type: 'text' },
    { id: 'stock', label: 'Stock', width: '6%', type: 'number' }
];

// Module State
window.productsData = [];
window.modifiedProducts = new Set();
window.deletedProducts = new Set();
window.selectedProductIds = new Set();

// --- Iframe Communication Bridge ---
window.addEventListener('message', function (event) {
    const { type, data, rowIdx, colId, value, rowData } = event.data;
    const iframe = document.getElementById('productGridIframe');
    if (!iframe) { console.error('productGridIframe not found'); return; }
    if (event.source !== iframe.contentWindow) {
        // Only log if it's a known message type but from wrong source
        if (['CELL_UPDATE', 'SYNC_REQUEST', 'EXPORT_DATA', 'SELECTION_CHANGE'].includes(type)) {
            console.warn('Received message from unexpected source:', event.source, 'Expected:', iframe.contentWindow);
        }
        return;
    }

    if (type === 'CELL_UPDATE') {
        const product = rowData.id ? window.productsData.find(p => p.id === rowData.id) : null;

        if (product) {
            const fieldMap = {
                'desc': 'name',
                'category': 'category_id',
                'subCategory': 'subcategory_id',
                'qty': 'stock',
                'prices': 'price',
                'barcode': 'barcodes',
                'unit': 'unit_id'
            };
            const field = fieldMap[colId] || colId;

            if (colId === 'barcode') {
                product.barcodes = value ? [value] : [];
            } else {
                product[field] = value;
            }

            window.modifiedProducts.add(product.id);
            window.updateSaveButton();
            window.saveProductDraft();
        }
    } else if (type === 'SYNC_REQUEST') {
        window.saveAllChanges();
    } else if (type === 'EXPORT_DATA') {
        console.log('Parent received EXPORT_DATA from iframe:', data);
        window.processExportData(data);
    } else if (type === 'SELECTION_CHANGE') {
        window.selectedProductIds = new Set(event.data.selectedIds);
        // Update button text using ID
        const deleteBtn = document.getElementById('deleteProductBtn');
        if (deleteBtn) {
            const count = window.selectedProductIds.size;
            deleteBtn.innerHTML = count > 0 ? `<i class="fas fa-trash-alt"></i> Delete (${count})` : `<i class="fas fa-trash-alt"></i> Delete`;
            deleteBtn.disabled = count === 0;
        }
    }
});

/**
 * Local Storage Draft Helpers
 */
window.saveProductDraft = function () {
    try {
        if (window.modifiedProducts.size === 0 && window.deletedProducts.size === 0) {
            localStorage.removeItem('pos_draft_products');
            window.updateModuleSyncStatus('Products', 'Synced to Supabase');
            return;
        }

        const draft = {
            productsData: window.productsData,
            modifiedProducts: Array.from(window.modifiedProducts),
            deletedProducts: Array.from(window.deletedProducts),
            timestamp: Date.now()
        };
        localStorage.setItem('pos_draft_products', JSON.stringify(draft));
        window.updateModuleSyncStatus('Products', 'Unsaved Changes (Local)');
    } catch (e) {
        console.error('Failed to save product draft:', e);
    }
};

window.clearProductDraft = function () {
    localStorage.removeItem('pos_draft_products');
    window.updateModuleSyncStatus('Products', 'Synced to Supabase');
};

/**
 * Loading Products from Supabase
 */
window.loadProducts = function (forceRefresh) {
    forceRefresh = forceRefresh || false;
    var iframe = document.getElementById('productGridIframe');
    if (!document.getElementById('view-products')) return;

    window.updateModuleSyncStatus('Products', 'Loading...');

    // Check for local draft first
    if (!forceRefresh) {
        var localDraft = localStorage.getItem('pos_draft_products');
        if (localDraft) {
            try {
                var draft = JSON.parse(localDraft);
                var hasMods = (draft.modifiedProducts && draft.modifiedProducts.length > 0) ||
                    (draft.deletedProducts && draft.deletedProducts.length > 0);

                if (hasMods) {
                    if (confirm('You have unsaved product changes from a previous session. Would you like to resume?')) {
                        window.productsData = draft.productsData;
                        window.modifiedProducts = new Set(draft.modifiedProducts);
                        window.deletedProducts = new Set(draft.deletedProducts);
                        window.renderGrid();
                        window.updateSaveButton();
                        window.updateModuleSyncStatus('Products', 'Unsaved Changes (Local)');
                        return;
                    } else {
                        localStorage.removeItem('pos_draft_products');
                    }
                }
            } catch (e) {
                console.error('Error parsing product draft:', e);
            }
        }
    }

    // Use DataLoader if available
    if (typeof window.DataLoader !== 'undefined') {
        // Find the best container for loading UI (iframe grid or productsBody)
        var loadContainer = iframe ? null : 'productsBody';

        window.DataLoader.fetch({
            fetchFn: function () {
                return window.supabase
                    .from('products')
                    .select('*')
                    .order('code', { ascending: true });
            },
            containerId: loadContainer,
            maxRetries: 3,
            retryInterval: 2000,
            loadingMessage: 'Loading products...',
            errorMessage: 'Failed to load products. Check your connection and try again.',
            onSuccess: function (data) {
                window.productsData = data || [];
                window.modifiedProducts.clear();
                window.deletedProducts.clear();
                window.renderGrid();
                window.updateSaveButton();
                window.updateModuleSyncStatus('Products', 'Synced to Supabase');
            },
            onError: function (err) {
                console.error('Error loading products:', err);
                window.updateModuleSyncStatus('Products', 'Error: ' + (err.message || 'Unknown'));
            }
        });
    } else {
        // Fallback without DataLoader
        (async function () {
            try {
                var result = await window.supabase
                    .from('products')
                    .select('*')
                    .order('code', { ascending: true });

                if (result.error) throw result.error;

                window.productsData = result.data || [];
                window.modifiedProducts.clear();
                window.deletedProducts.clear();
                window.renderGrid();
                window.updateSaveButton();
                window.updateModuleSyncStatus('Products', 'Synced to Supabase');
            } catch (error) {
                console.error('Error loading products:', error);
                window.updateModuleSyncStatus('Products', 'Error: ' + error.message);
            }
        })();
    }
};

/**
 * Grid Rendering (Iframe Bridge)
 */
window.renderGrid = function () {
    const iframe = document.getElementById('productGridIframe');
    if (!iframe || !iframe.contentWindow) {
        console.warn('Iframe not ready');
        return;
    }

    iframe.contentWindow.postMessage({
        type: 'LOAD_DATA',
        data: window.productsData,
        references: {
            categories: window.refCategories || [],
            subcategories: window.refSubcategories || [],
            brands: window.refBrands || [],
            units: window.refUnits || []
        }
    }, '*');
};

window.addNewRow = function () {
    const newProduct = {
        id: crypto.randomUUID(),
        isNew: true, // Mark as new for the grid hint
        code: '',
        name: '',
        barcodes: [],
        category_id: null,
        subcategory_id: null,
        brand_id: null,
        cost: 0,
        price: 0,
        unit_id: null,
        supplier: '',
        shop: 'Main Warehouse',
        stock: 0,
        isNew: true
    };

    window.productsData.unshift(newProduct);
    window.modifiedProducts.add(newProduct.id);
    window.renderGrid();
    window.updateSaveButton();
    window.saveProductDraft();

    // Focus the first cell of the new row in the iframe
    setTimeout(() => {
        const iframe = document.getElementById('productGridIframe');
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({
                type: 'FOCUS_CELL',
                data: {
                    rowIdx: 0,
                    colId: 'code'
                }
            }, '*');
        }
    }, 100);
};

/**
 * Barcode Handling
 */
window.handleAddBarcode = function (event, productId) {
    if (event.key === 'Enter') {
        const input = event.target;
        const value = input.value.trim();
        if (value) {
            const product = window.productsData.find(p => p.id.toString() === productId.toString());

            if (product) {
                if (!product.barcodes) product.barcodes = [];
                if (!product.barcodes.includes(value)) {
                    product.barcodes.push(value);

                    window.modifiedProducts.add(productId);
                    window.renderGrid();
                    window.updateSaveButton();
                    window.saveProductDraft();

                    // Refocus scan input
                    setTimeout(() => {
                        const container = document.getElementById('productsBody');
                        const row = container ? container.querySelector(`tr[data-id="${productId}"]`) : null;
                        if (row) {
                            const scan = row.querySelector('.barcode-scan');
                            if (scan) scan.focus();
                        }
                    }, 50);
                }
            }
        }
        input.value = '';
        event.preventDefault();
    }
};

window.removeBarcode = function (productId, barcode) {
    const product = window.productsData.find(p => p.id.toString() === productId.toString());

    if (product && product.barcodes) {
        product.barcodes = product.barcodes.filter(b => b !== barcode);

        window.modifiedProducts.add(productId);
        window.renderGrid();
        window.updateSaveButton();
        window.saveProductDraft();
    }
};

/**
 * Calculation Logic
 */
window.calculateMargin = function (input) {
    const row = input.closest('tr');
    const productId = row.dataset.id;
    const product = window.productsData.find(p => p.id.toString() === productId.toString());

    if (product) {
        product[input.name] = parseFloat(input.value) || 0;

        const cost = product.cost || 0;
        const price = product.price || 0;
        const marginInput = row.querySelector('input[name="margin"]');

        if (marginInput && cost > 0) {
            const m = ((price - cost) / cost) * 100;
            marginInput.value = m.toFixed(2) + '%';
        }

        window.markProductModified(input);
    }
};

/**
 * Event Handlers
 */
window.handleCategoryChange = function (select) {
    const row = select.closest('tr');
    const subSelect = row.querySelector('select[name="subcategory_id"]');
    const categoryId = select.value;
    const productId = row.dataset.id;

    window.markProductModified(select);

    const product = window.productsData.find(p => p.id.toString() === productId.toString());
    if (product) {
        product.category_id = categoryId || null;
        product.subcategory_id = null; // Reset subcat on cat change
    }

    // Update Sub-category dropdown
    const filteredSubs = categoryId
        ? window.refSubcategories.filter(s => s.category_id === categoryId)
        : [];

    subSelect.innerHTML = '<option value="">Sub-Category</option>' + filteredSubs.map(s =>
        `<option value="${s.id}">${window.escapeHtml(s.name)}</option>`
    ).join('');
    subSelect.value = "";
};

/**
 * Loading Products from Supabase
 */

window.deleteProductRow = function (btn) {
    const row = btn.closest('tr');
    const id = row.dataset.id;

    if (confirm('Are you sure you want to delete this product?')) {
        const product = window.productsData.find(p => p.id === id);
        if (product && !product.isNew) {
            window.deletedProducts.add(id);
        }
        window.modifiedProducts.delete(id);

        // Visual feedback or remove if new
        if (product && product.isNew) {
            window.productsData = window.productsData.filter(p => p.id !== id);
        } else {
            row.style.opacity = '0.3';
            row.style.pointerEvents = 'none';
        }

        window.updateSaveButton();
        window.updateSaveButton();
        window.saveProductDraft();
    }
};

window.deleteSelectedProducts = function () {
    if (window.selectedProductIds.size === 0) {
        alert('Please select products to delete.');
        return;
    }

    if (!confirm(`Are you sure you want to delete ${window.selectedProductIds.size} products?`)) return;

    window.selectedProductIds.forEach(id => {
        const idStr = String(id);
        const product = window.productsData.find(p => String(p.id) === idStr);
        if (product && !product.isNew) {
            window.deletedProducts.add(idStr);
        }
        window.modifiedProducts.delete(idStr);
    });

    // Update local data
    const selectedIds = new Set(Array.from(window.selectedProductIds).map(id => String(id)));
    window.productsData = window.productsData.filter(p => !selectedIds.has(String(p.id)));

    // Clear selection
    window.selectedProductIds.clear();

    // Update UI
    window.renderGrid();
    window.updateSaveButton();
    window.saveProductDraft();

    // Update button text using ID
    const deleteBtn = document.getElementById('deleteProductBtn');
    if (deleteBtn) {
        deleteBtn.innerHTML = `<i class="fas fa-trash-alt"></i> Delete`;
        deleteBtn.disabled = true;
    }
};

window.markProductModified = function (input) {
    const row = input.closest('tr');
    const productId = row.dataset.id;
    const product = window.productsData.find(p => p.id.toString() === productId.toString());

    if (!product) return;

    const field = input.name;
    let value = input.value;

    if (['cost', 'price', 'stock'].includes(field)) {
        value = parseFloat(value) || 0;
    } else if (value === "") {
        value = null;
    }

    if (field !== 'margin') {
        product[field] = value;
    }

    window.modifiedProducts.add(product.id);
    row.classList.add('modified');
    window.updateSaveButton();
    window.saveProductDraft();
};

window.updateSaveButton = function () {
    const btns = [document.getElementById('saveBtn'), document.getElementById('saveBtnBottom')].filter(b => b);
    const count = window.modifiedProducts.size + window.deletedProducts.size;
    const label = count > 0 ? `<i class="fas fa-save"></i> Save (${count})` : '<i class="fas fa-save"></i> Save Changes';

    btns.forEach(btn => {
        btn.innerHTML = label;
        if (count > 0) btn.classList.add('pulse');
        else btn.classList.remove('pulse');
    });
};

/**
 * Persistence Loop
 */
window.saveAllChanges = async function () {
    window.showLoading();

    try {
        // 1. Handle Deletions
        if (window.deletedProducts.size > 0) {
            const { error } = await window.supabase
                .from('products')
                .delete()
                .in('id', Array.from(window.deletedProducts));
            if (error) {
                if (error.code === '23503' || (error.message && error.message.includes('foreign key constraint'))) {
                    throw new Error("Cannot delete product(s): They are linked to existing sale or purchase records. Please unselect them to save your other changes.");
                }
                throw error;
            }
        }

        // 2. Handle Upserts
        const upsertData = [];
        window.modifiedProducts.forEach(id => {
            if (window.deletedProducts.has(id)) return;
            const p = window.productsData.find(item => item.id === id);
            if (!p) return;

            upsertData.push({
                id: p.id,
                code: p.code,
                name: p.name,
                barcodes: p.barcodes || [],
                category_id: p.category_id,
                subcategory_id: p.subcategory_id,
                brand_id: p.brand_id,
                cost: p.cost,
                price: p.price,
                unit_id: p.unit_id,
                supplier: p.supplier,
                shop: p.shop,
                stock: p.stock
            });
        });

        // 2.5 Perform Pre-flight Validation
        for (const p of upsertData) {
            // Check for minimum required fields
            const hasName = p.name && p.name.trim().length > 0;
            const hasBarcode = p.barcodes && p.barcodes.length > 0 && p.barcodes[0].trim().length > 0;

            if (!hasName && !hasBarcode) {
                window.hideLoading();
                alert(`Validation Error: Please provide at least a Description or a Barcode for all products. A row is currently missing both.`);
                return; // Abort save
            }

            // Check for duplicate barcodes
            if (hasBarcode) {
                const bcode = p.barcodes[0].trim().toLowerCase();
                const duplicateProduct = window.productsData.find(existing => {
                    if (existing.id === p.id) return false; // Ignore self
                    if (!existing.barcodes || existing.barcodes.length === 0) return false;
                    return existing.barcodes.some(eb => eb.trim().toLowerCase() === bcode);
                });

                if (duplicateProduct) {
                    window.hideLoading();
                    const duplicateName = duplicateProduct.name ? `"${duplicateProduct.name}"` : 'another row';
                    alert(`Validation Error: The barcode '${p.barcodes[0]}' is already in use by ${duplicateName}. Barcodes must be unique.`);
                    return; // Abort save
                }
            }
        }

        if (upsertData.length > 0) {
            const { error } = await window.supabase.from('products').upsert(upsertData);
            if (error) throw error;

            // Sync Junction Tables for normalized schema
            for (const p of upsertData) {
                const pid = p.id;
                // Sync Barcodes
                await window.supabase.from('product_barcodes').delete().eq('product_id', pid);
                if (p.barcodes && p.barcodes.length > 0) {
                    await window.supabase.from('product_barcodes').insert(p.barcodes.map(b => ({ product_id: pid, barcode: b })));
                }

                // Sync Suppliers
                await window.supabase.from('product_suppliers').delete().eq('product_id', pid);
                const suppliers = p.supplier ? p.supplier.split(',').map(s => s.trim()).filter(s => s) : [];
                if (suppliers.length > 0) {
                    await window.supabase.from('product_suppliers').insert(suppliers.map(sid => ({ product_id: pid, supplier_id: sid })));
                }

                // Sync Warehouses
                await window.supabase.from('product_warehouses').delete().eq('product_id', pid);
                const shops = p.shop ? p.shop.split(',').map(s => s.trim()).filter(s => s) : [];
                if (shops.length > 0) {
                    await window.supabase.from('product_warehouses').insert(shops.map(wid => ({ product_id: pid, warehouse_id: wid, stock: p.stock })));
                }
            }
        }

        // 3. Post-save Cleanup
        const deletedArr = Array.from(window.deletedProducts);
        window.productsData = window.productsData.filter(p => !deletedArr.includes(p.id));
        window.productsData.forEach(p => p.isNew = false);

        window.modifiedProducts.clear();
        window.deletedProducts.clear();
        window.clearProductDraft();

        window.renderGrid();
        window.updateSaveButton();
        alert('Products saved successfully!');
    } catch (error) {
        console.error('Error saving products:', error);
        alert('Error saving products: ' + error.message);
    } finally {
        window.hideLoading();
    }
};

/**
 * Grid Navigation (A-la Excel)
 */
window.handleGridNavigation = function (event) {
    const key = event.key;
    const isArrow = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key);

    if (key === 'Enter' || isArrow) {
        // Skip if special context
        if (event.target.id === 'globalSearchInput') return;
        if (key === 'Enter' && event.target.classList.contains('barcode-scan') && event.target.value.trim() !== '') return;

        event.preventDefault();
        const inputs = Array.from(document.querySelectorAll('#productsBody .excel-input'));
        const currentIndex = inputs.indexOf(event.target);

        if (currentIndex === -1) return;

        let nextIndex = -1;
        const columns = 13; // Count based on inputs per row in renderGrid

        switch (key) {
            case 'Enter':
            case 'ArrowRight': nextIndex = currentIndex + 1; break;
            case 'ArrowLeft': nextIndex = currentIndex - 1; break;
            case 'ArrowUp': nextIndex = currentIndex - columns; break;
            case 'ArrowDown': nextIndex = currentIndex + columns; break;
        }

        if (nextIndex >= 0 && nextIndex < inputs.length) {
            inputs[nextIndex].focus();
            if (inputs[nextIndex].select) inputs[nextIndex].select();
        } else if (key === 'Enter' && nextIndex >= inputs.length) {
            window.addNewRow();
        }
    }
};

/**
     * Import/Export Integration
     */
window.exportToExcel = async function () {
    console.log('exportToExcel initiated...');

    if (typeof window.updateModuleSyncStatus === 'function') {
        window.updateModuleSyncStatus('Products', 'Preparing Export...');
    }

    try {
        // Step 1: Fetch all products
        const { data: products, error: prodError } = await window.supabase
            .from('products')
            .select('*')
            .order('created_at', { ascending: false });

        if (prodError) throw prodError;
        if (!products || products.length === 0) {
            alert("No products found to export.");
            return;
        }

        // Step 2: Fetch all reference data for name resolution
        const [catRes, subRes, brandRes, unitRes, supRes, whRes, psRes, pwRes] = await Promise.all([
            window.supabase.from('categories').select('id, name'),
            window.supabase.from('subcategories').select('id, name'),
            window.supabase.from('brands').select('id, name'),
            window.supabase.from('units').select('id, name, short_name'),
            window.supabase.from('suppliers').select('id, name'),
            window.supabase.from('warehouses').select('id, name'),
            window.supabase.from('product_suppliers').select('product_id, supplier_id'),
            window.supabase.from('product_warehouses').select('product_id, warehouse_id')
        ]);

        // Build lookup maps: id -> name
        const catMap = {};
        (catRes.data || []).forEach(c => catMap[c.id] = c.name);

        const subMap = {};
        (subRes.data || []).forEach(s => subMap[s.id] = s.name);

        const brandMap = {};
        (brandRes.data || []).forEach(b => brandMap[b.id] = b.name);

        const unitMap = {};
        (unitRes.data || []).forEach(u => unitMap[u.id] = u.short_name || u.name);

        const supMap = {};
        (supRes.data || []).forEach(s => supMap[s.id] = s.name);

        const whMap = {};
        (whRes.data || []).forEach(w => whMap[w.id] = w.name);

        // Build product -> suppliers and product -> warehouses maps
        const productSuppliersMap = {};
        (psRes.data || []).forEach(ps => {
            if (!productSuppliersMap[ps.product_id]) productSuppliersMap[ps.product_id] = [];
            const name = supMap[ps.supplier_id];
            if (name) productSuppliersMap[ps.product_id].push(name);
        });

        const productWarehousesMap = {};
        (pwRes.data || []).forEach(pw => {
            if (!productWarehousesMap[pw.product_id]) productWarehousesMap[pw.product_id] = [];
            const name = whMap[pw.warehouse_id];
            if (name) productWarehousesMap[pw.product_id].push(name);
        });

        // Step 3: Build CSV
        const headers = [
            'Item Code', 'Barcode', 'Description', 'Category', 'Sub-Category',
            'Brand', 'Cost', 'Price', 'Unit Type', 'Stock',
            'Box Price', 'Box Qty', 'Suppliers', 'Warehouses'
        ];

        const csvRows = [headers.join(',')];

        const esc = (val) => `"${String(val || '').replace(/"/g, '""')}"`;

        products.forEach(p => {
            // Resolve names from lookup maps
            const categoryName = catMap[p.category_id] || '';
            const subCategoryName = subMap[p.subcategory_id] || '';
            const brandName = brandMap[p.brand_id] || '';
            const unitName = unitMap[p.unit_id] || '';

            // Get suppliers: first from junction table, fallback to supplier field IDs
            let supplierNames = productSuppliersMap[p.id] || [];
            if (supplierNames.length === 0 && p.supplier) {
                // Fallback: supplier field may contain comma-separated IDs
                supplierNames = p.supplier.split(',')
                    .map(s => s.trim())
                    .map(sid => supMap[sid] || '')
                    .filter(Boolean);
            }

            // Get warehouses: first from junction table, fallback to shop field
            let warehouseNames = productWarehousesMap[p.id] || [];
            if (warehouseNames.length === 0 && p.shop) {
                // Fallback: shop field may contain name directly or comma-separated IDs
                const shopParts = p.shop.split(',').map(s => s.trim());
                warehouseNames = shopParts.map(sid => whMap[sid] || sid).filter(Boolean);
            }

            // Use item_code, fallback to code
            const rawItemCode = String(p.item_code || p.code || '');
            const itemCodeCSV = rawItemCode ? `="${rawItemCode.replace(/"/g, '""')}"` : '""';

            // Format all barcodes if it's an array
            // Join with a space or other character to avoid breaking the CSV format if not properly quoted, 
            // but since we want comma-separated inside the cell, we must ensure the whole string is quoted correctly for CSV.
            // Using the `=...` text injection format is causing issues when it contains commas.
            const rawBarcode = Array.isArray(p.barcodes) ? p.barcodes.join(', ') : (p.barcodes || '');
            // For CSV, if a cell contains commas, it MUST be surrounded by double quotes. 
            // We use the esc() helper function already defined above (`esc(val)`) which wraps in quotes.
            const barcodeCSV = rawBarcode ? esc(rawBarcode) : '""';

            const row = [
                itemCodeCSV,
                barcodeCSV,
                esc(p.name),
                esc(categoryName),
                esc(subCategoryName),
                esc(brandName),
                p.cost || 0,
                p.price || 0,
                esc(unitName),
                p.stock || 0,
                p.box_price || 0,
                p.pcs_per_box || 0,
                esc(supplierNames.join(', ')),
                esc(warehouseNames.join(', '))
            ];
            csvRows.push(row.join(','));
        });

        // Step 4: Download CSV
        const csvString = csvRows.join('\n');
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.style.display = 'none';
        link.href = url;
        link.download = `products_export_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        if (typeof window.updateModuleSyncStatus === 'function') {
            window.updateModuleSyncStatus('Products', 'Export Complete');
        }

    } catch (err) {
        console.error('Export error details:', err);
        alert("Export failed: " + err.message);
        if (typeof window.updateModuleSyncStatus === 'function') {
            window.updateModuleSyncStatus('Products', 'Export Error');
        }
    }
};

window.processExportData = function (data) {
    console.log('processExportData (Legacy) triggered, calling enhanced v3 export...');
    window.exportToExcel();
};

window.openExcelImport = function () {
    const input = document.getElementById('excelInput');
    if (input) input.click();
};

window.handleExcelImport = function (input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const text = e.target.result;
        const lines = text.split('\n');
        const headers = lines[0].split(',');
        const importedData = [];

        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const values = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
            const p = {};
            p.id = crypto.randomUUID();
            p.code = (values[0] || '').replace(/"/g, '');
            p.barcode = (values[1] || '').replace(/"/g, '');
            p.desc = (values[2] || '').replace(/"/g, '');

            // Resolve Names to IDs from parent state
            const catName = (values[3] || '').replace(/"/g, '').trim();
            const subName = (values[4] || '').replace(/"/g, '').trim();
            const brandName = (values[5] || '').replace(/"/g, '').trim();
            const unitName = (values[8] || '').replace(/"/g, '').trim();

            const cat = (window.refCategories || []).find(c => c.name.toLowerCase() === catName.toLowerCase());
            p.category = cat ? cat.id : catName;

            const sub = (window.refSubcategories || []).find(s => s.name.toLowerCase() === subName.toLowerCase());
            p.subCategory = sub ? sub.id : subName;

            const brand = (window.refBrands || []).find(b => b.name.toLowerCase() === brandName.toLowerCase());
            p.brand_id = brand ? brand.id : brandName;

            const unit = (window.refUnits || []).find(u =>
                u.name.toLowerCase() === unitName.toLowerCase() ||
                u.short_name.toLowerCase() === unitName.toLowerCase()
            );
            p.unit = unit ? unit.id : unitName;

            p.cost = parseFloat(values[6]) || 0;
            p.prices = parseFloat(values[7]) || 0;
            p.qty = parseFloat(values[9]) || 0;
            importedData.push(p);
        }

        const iframe = document.getElementById('productGridIframe');
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({ type: 'IMPORT_DATA', data: importedData }, '*');
            alert(`Successfully imported ${importedData.length} products to the grid.`);
        }
    };
    reader.readAsText(file);
    input.value = '';
};
