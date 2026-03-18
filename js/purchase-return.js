// Use the centralized Supabase client from config.js + supabase-client.js
const db = window.supabase;

async function init() {
    if (window.location.search.includes('mode=embedded')) {
        document.body.classList.add('embedded');
    }

    // Set today's date
    document.getElementById('returnDate').value = new Date().toISOString().split('T')[0];

    await loadShops();
    await loadSuppliers();
    generateVoucherNumber();

    // Event listeners
    document.getElementById('btnSave').addEventListener('click', saveReturn);
    document.getElementById('btnAddReturn').addEventListener('click', addProductRow);

    // Calculate totals on input change
    document.getElementById('productsTableBody').addEventListener('input', calculateRowAmount);
    document.getElementById('taxPercent').addEventListener('input', calculateTotals);
    document.getElementById('discount').addEventListener('input', calculateTotals);
    document.getElementById('shipping').addEventListener('input', calculateTotals);
    document.getElementById('refundAmount').addEventListener('input', calculateRemaining);
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

function generateVoucherNumber() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000);
    document.getElementById('voucherNo').value = `PR${year}${month}${day}${random}`;
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
    const refundAmount = parseFloat(document.getElementById('refundAmount').value) || 0;
    const remainAmount = netAmount - refundAmount;

    document.getElementById('remainAmount').value = remainAmount.toFixed(2);
}


async function saveReturn() {
    const returnDate = document.getElementById('returnDate').value;
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
        const itemCode = row.cells[1].querySelector('input').value;
        const barcode = row.cells[2].querySelector('input').value;
        const description = row.cells[3].querySelector('input').value;
        const qty = parseFloat(row.cells[4].querySelector('input').value) || 0;
        const pcsBox = parseFloat(row.cells[5].querySelector('input').value) || 0;
        const cost = parseFloat(row.cells[6].querySelector('input').value) || 0;
        const discount = parseFloat(row.cells[7].querySelector('input').value) || 0;
        const amount = parseFloat(row.cells[8].querySelector('input').value) || 0;
        const remark = row.cells[9].querySelector('input').value;

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
                pcs_box: pcsBox
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
    const refundA = parseFloat(document.getElementById('refundAmount').value) || 0;

    const returnData = {
        reference_no: voucherNo,
        date: returnDate,
        warehouse_id: shopId,
        supplier_id: supplierId,
        payment_type: document.getElementById('paymentType').value,
        order_tax_percentage: taxP,
        order_tax_amount: taxA,
        discount_amount: discA,
        shipping_amount: shipA,
        grand_total: netA,
        refund_amount: refundA,
        status: document.getElementById('status').value,
        payment_status: document.getElementById('paymentStatus').value,
        note: document.getElementById('remarkText').value,
        total_qty: products.reduce((acc, p) => acc + p.quantity, 0)
    };

    try {
        // 1. Insert Purchase Return
        const { data: rData, error: rError } = await db.from('purchase_returns').insert([returnData]).select().single();
        if (rError) throw rError;

        const returnId = rData.id;

        // 2. Insert Items
        const itemsToInsert = products.map(p => ({
            purchase_return_id: returnId,
            quantity: p.quantity,
            unit_cost: p.unit_cost,
            discount_percentage: p.discount_percentage,
            subtotal: p.subtotal,
            remark: p.remark,
            description: p.description
        }));

        const { error: iError } = await db.from('purchase_return_items').insert(itemsToInsert);
        if (iError) throw iError;

        // 3. Update Stock (Automatic via Database Triggers)
        // Manual stock update removed to prevent double-counting.

        alert('Purchase return saved successfully!');
        window.location.href = 'purchase-list.html';
    } catch (error) {
        console.error('Error saving purchase return:', error);
        alert('Error saving purchase return: ' + error.message);
    }
}

document.addEventListener('DOMContentLoaded', init);
