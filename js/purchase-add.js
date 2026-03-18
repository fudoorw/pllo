// Use the centralized Supabase client from config.js + supabase-client.js
const db = window.supabase;
let productsArray = [];

async function init() {
    if (window.location.search.includes('mode=embedded')) {
        document.body.classList.add('embedded');
    }

    // Set today's date
    document.getElementById('purchaseDate').value = new Date().toISOString().split('T')[0];

    await loadShops();
    await loadSuppliers();
    await loadProducts();
    generateVoucherNumber();

    // Event listeners
    document.getElementById('btnSave').addEventListener('click', savePurchase);
    document.getElementById('btnAddPurchase').addEventListener('click', addProductRow);

    // Calculate totals on input change
    document.getElementById('productsTableBody').addEventListener('input', calculateRowAmount);
    document.getElementById('taxPercent').addEventListener('input', calculateTotals);
    document.getElementById('discount').addEventListener('input', calculateTotals);
    document.getElementById('shipping').addEventListener('input', calculateTotals);
    document.getElementById('paidAmount').addEventListener('input', calculateRemaining);
}

async function loadShops() {
    const { data } = await db.from('warehouses').select('*');
    const select = document.getElementById('shopSelect');
    data?.forEach(shop => {
        const opt = document.createElement('option');
        opt.value = shop.id;
        opt.textContent = shop.name;
        select.appendChild(opt);
    });
}

async function loadSuppliers() {
    const { data } = await db.from('suppliers').select('*');
    const select = document.getElementById('supplierSelect');
    data?.forEach(supplier => {
        const opt = document.createElement('option');
        opt.value = supplier.id;
        opt.textContent = supplier.name;
        select.appendChild(opt);
    });
}

async function loadProducts() {
    // Paginated load for products
    let allProdData = [];
    let prodFrom = 0;
    const prodStep = 1000;
    while (true) {
        const { data: chunk, error: prodErr } = await db
            .from('products')
            .select('id, code, barcodes, name, cost, unit, unit_id, pcs_per_box')
            .range(prodFrom, prodFrom + prodStep - 1);
        if (prodErr) { console.error('Product fetch error:', prodErr); break; }
        if (!chunk || chunk.length === 0) break;
        allProdData = allProdData.concat(chunk);
        if (chunk.length < prodStep) break;
        prodFrom += prodStep;
    }
    productsArray = allProdData;
}

function generateVoucherNumber() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000);
    document.getElementById('voucherNo').value = `PU${year}${month}${day}${random}`;
}

function addProductRow() {
    const tbody = document.getElementById('productsTableBody');
    const rowCount = tbody.rows.length + 1;

    const row = document.createElement('tr');
    row.innerHTML = `
        <td>${rowCount}</td>
        <td><input type="text" placeholder="Item Code"></td>
        <td><input type="text" placeholder="Scan/Enter Barcode"></td>
        <td><input type="text" placeholder="Description"></td>
        <td><input type="number" value="0" min="0"></td>
        <td><input type="number" value="0" min="0"></td>
        <td><input type="number" value="0" min="0" step="0.01"></td>
        <td><input type="number" value="0" min="0" max="100" step="0.1"></td>
        <td><input type="number" value="0" readonly></td>
        <td><input type="text" placeholder="Remark"></td>
        <td><button class="btn-remove" onclick="removeRow(this)"><i class="fas fa-trash"></i></button></td>
    `;
    tbody.appendChild(row);
}

function removeRow(btn) {
    const row = btn.closest('tr');
    row.remove();

    // Renumber rows
    const tbody = document.getElementById('productsTableBody');
    Array.from(tbody.rows).forEach((row, index) => {
        row.cells[0].textContent = index + 1;
    });

    calculateTotals();
}

function calculateRowAmount(e) {
    const row = e.target.closest('tr');
    if (!row) return;

    const qty = parseFloat(row.cells[4].querySelector('input').value) || 0;
    const cost = parseFloat(row.cells[6].querySelector('input').value) || 0;
    const discount = parseFloat(row.cells[7].querySelector('input').value) || 0;

    let amount = qty * cost;
    amount = amount - (amount * discount / 100);

    row.cells[8].querySelector('input').value = amount.toFixed(2);

    calculateTotals();
}

function calculateTotals() {
    const tbody = document.getElementById('productsTableBody');
    let subtotal = 0;

    Array.from(tbody.rows).forEach(row => {
        const amount = parseFloat(row.cells[8].querySelector('input').value) || 0;
        subtotal += amount;
    });

    const taxPercent = parseFloat(document.getElementById('taxPercent').value) || 0;
    const discountInput = document.getElementById('discount').value;
    const shipping = parseFloat(document.getElementById('shipping').value) || 0;

    const taxAmount = subtotal * taxPercent / 100;

    // Check if discount is percentage or fixed amount
    let discountAmount = 0;
    if (discountInput.includes('%')) {
        const percent = parseFloat(discountInput.replace('%', '')) || 0;
        discountAmount = subtotal * percent / 100;
    } else {
        discountAmount = parseFloat(discountInput) || 0;
    }

    const grandTotal = subtotal + taxAmount - discountAmount + shipping;
    const netAmount = grandTotal;

    document.getElementById('grandTotal').value = subtotal.toFixed(2);
    document.getElementById('taxAmount').value = taxAmount.toFixed(2);
    document.getElementById('discountAmount').value = discountAmount.toFixed(2);
    document.getElementById('shippingAmount').value = shipping.toFixed(2);
    document.getElementById('netAmount').value = netAmount.toFixed(2);

    calculateRemaining();
}

function calculateRemaining() {
    const netAmount = parseFloat(document.getElementById('netAmount').value) || 0;
    const paidAmount = parseFloat(document.getElementById('paidAmount').value) || 0;
    const remainAmount = netAmount - paidAmount;

    document.getElementById('remainAmount').value = remainAmount.toFixed(2);
}


async function savePurchase() {
    const purchaseDate = document.getElementById('purchaseDate').value;
    const shopId = document.getElementById('shopSelect').value;
    const supplierId = document.getElementById('supplierSelect').value;
    const paymentMethod = document.getElementById('paymentMethod').value;
    const voucherNo = document.getElementById('voucherNo').value;

    if (!shopId || !supplierId) {
        alert('Please select shop and supplier');
        return;
    }

    // Get products
    const tbody = document.getElementById('productsTableBody');
    const products = [];

    Array.from(tbody.rows).forEach(row => {
        const itemCode = row.cells[1].querySelector('input').value; // Still useful for reference
        const barcode = row.cells[2].querySelector('input').value;
        const description = row.cells[3].querySelector('input').value;

        // VALIDATION: Ensure item code is an exact match for a product
        const matchedProduct = productsArray.find(p => p.code === itemCode);
        if (itemCode && !matchedProduct) {
            throw new Error(`Product with Item Code "${itemCode}" not found.`);
        }
        const qty = parseFloat(row.cells[4].querySelector('input').value) || 0;
        const pcsBox = parseFloat(row.cells[5].querySelector('input').value) || 0;
        const cost = parseFloat(row.cells[6].querySelector('input').value) || 0;
        const discount = parseFloat(row.cells[7].querySelector('input').value) || 0;
        const amount = parseFloat(row.cells[8].querySelector('input').value) || 0;
        const remark = row.cells[9].querySelector('input').value;

        // Try to find the product in our local cache if we had one, but purchase-add.js 
        // currently relies on manual entry. We should ideally lookup product-id.
        // For now, we'll keep it simple but fix the schema.

        if (qty > 0) {
            products.push({
                item_code: itemCode,
                barcode: barcode,
                description: description,
                quantity: qty,
                unit_cost: cost,
                discount_percentage: discount,
                subtotal: amount,
                remark: remark,
                pcs_box: pcsBox // Custom field in schema
            });
        }
    });

    if (products.length === 0) {
        alert('Please add at least one product');
        return;
    }

    const subtotal = parseFloat(document.getElementById('grandTotal').value) || 0;
    const taxP = parseFloat(document.getElementById('taxPercent').value) || 0;
    const taxA = parseFloat(document.getElementById('taxAmount').value) || 0;
    const discA = parseFloat(document.getElementById('discountAmount').value) || 0;
    const shipA = parseFloat(document.getElementById('shippingAmount').value) || 0;
    const netA = parseFloat(document.getElementById('netAmount').value) || 0;
    const paidA = parseFloat(document.getElementById('paidAmount').value) || 0;

    const purchaseData = {
        reference_no: voucherNo, // Corrected from voucher_no
        date: purchaseDate, // Corrected from purchase_date
        warehouse_id: shopId,
        supplier_id: supplierId,
        payment_type: document.getElementById('paymentType').value, // Corrected
        order_tax_percentage: taxP,
        order_tax_amount: taxA,
        discount_amount: discA,
        shipping_amount: shipA,
        grand_total: netA, // Corrected from net_amount
        paid_amount: paidA,
        status: document.getElementById('status').value,
        payment_status: document.getElementById('paymentStatus').value,
        note: document.getElementById('remarkText').value, // Corrected from notes
        total_qty: products.reduce((acc, p) => acc + p.quantity, 0)
    };

    try {
        // 1. Insert Purchase
        const { data: pData, error: pError } = await db.from('purchases').insert([purchaseData]).select().single();
        if (pError) throw pError;

        const purchaseId = pData.id;

        // Record initial payment if any
        if (purchaseData.paid_amount > 0) {
            const { error: payError } = await db.from('purchase_payments').insert({
                purchase_id: purchaseId,
                amount: purchaseData.paid_amount,
                payment_method: purchaseData.payment_type,
                payment_date: purchaseData.date,
                note: 'Initial payment for purchase ' + (pData.reference_no || purchaseId)
            });

            if (payError) {
                console.error('Error recording initial payment:', payError);
            }
        }

        // 2. Insert Items
        const itemsToInsert = products.map(p => ({
            purchase_id: purchaseId,
            quantity: p.quantity,
            unit: p.unit,
            unit_id: p.unitId,
            unit_cost: p.unit_cost,
            discount_percentage: p.discount_percentage,
            subtotal: p.subtotal,
            remark: p.remark,
            pcs_box: p.pcs_box || p.pcsBox,
            item_status: p.item_status || 'Normal',
            description: p.description // Helper field
        }));

        const { error: iError } = await db.from('purchase_items').insert(itemsToInsert);
        if (iError) throw iError;

        // 3. Update Stock (Automatic via Database Triggers)
        // Manual stock update removed to prevent double-counting.

        alert('Purchase saved successfully!');
        window.location.href = 'purchase-list.html';
    } catch (error) {
        console.error('Error saving purchase:', error);
        alert('Error saving purchase: ' + error.message);
    }
}

document.addEventListener('DOMContentLoaded', init);
