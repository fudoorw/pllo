/**
 * ReceiptPrinter Helper
 * Contains the "chunk" (template) and printing logic for the POS.
 */
const ReceiptPrinter = {
    /**
     * Generates a "chunk" of HTML representing the receipt.
     * @param {Object} data Transaction data from the POS
     * @returns {string} HTML string
     */
    getReceiptChunk(data) {
        const {
            voucher_no,
            warehouse_id,
            customer_name,
            cashier,
            subtotal,
            total,
            paid_amount,
            discount_amount,
            tax_amount,
            shipping_amount,
            payment_method,
            items
        } = data;

        const dateStr = new Date().toLocaleString();
        const changeAmt = Math.max(0, (paid_amount || 0) - (total || 0));

        let itemsHtml = items.map(item => {
            const qty = (item.selectedUnit === 'box') ? (item.qty * (item.pcs_per_box || 1)) : item.qty;
            const lineTotal = (qty * item.price) - (item.disc || 0);
            return `
                <tr>
                    <td colspan="3">${item.name}</td>
                </tr>
                <tr>
                    <td>${qty} x ${item.price.toLocaleString()}</td>
                    <td class="text-right">${(item.disc || 0) > 0 ? '-' + item.disc.toLocaleString() : ''}</td>
                    <td class="text-right">${lineTotal.toLocaleString()}</td>
                </tr>
            `;
        }).join('');

        return `
            <div id="receipt-content">
                <div class="receipt-header">
                    <div class="receipt-title">PRO GLASS POS</div>
                    <div class="receipt-info">
                        Voucher: ${voucher_no}<br>
                        Date: ${dateStr}<br>
                        Cashier: ${cashier || 'Admin'}<br>
                        Customer: ${customer_name || 'Walk-in'}
                    </div>
                </div>

                <table class="receipt-table">
                    <thead>
                        <tr>
                            <th width="50%">Item</th>
                            <th width="20%" class="text-right">Disc</th>
                            <th width="30%" class="text-right">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                    </tbody>
                </table>

                <div class="receipt-totals">
                    <div class="receipt-row">
                        <span>Subtotal:</span>
                        <span>${subtotal.toLocaleString()}</span>
                    </div>
                    ${(discount_amount || 0) > 0 ? `
                    <div class="receipt-row">
                        <span>Discount:</span>
                        <span>-${discount_amount.toLocaleString()}</span>
                    </div>` : ''}
                    ${(tax_amount || 0) > 0 ? `
                    <div class="receipt-row">
                        <span>Tax:</span>
                        <span>${tax_amount.toLocaleString()}</span>
                    </div>` : ''}
                    ${(shipping_amount || 0) > 0 ? `
                    <div class="receipt-row">
                        <span>Shipping:</span>
                        <span>${shipping_amount.toLocaleString()}</span>
                    </div>` : ''}
                    <div class="dashed-line"></div>
                    <div class="receipt-row bold">
                        <span>GRAND TOTAL:</span>
                        <span>${total.toLocaleString()}</span>
                    </div>
                    <div class="receipt-row">
                        <span>Paid:</span>
                        <span>${paid_amount.toLocaleString()}</span>
                    </div>
                    <div class="receipt-row">
                        <span>Change:</span>
                        <span>${changeAmt.toLocaleString()}</span>
                    </div>
                </div>

                <div class="receipt-footer">
                    <p>Method: ${payment_method || 'Cash'}</p>
                    <p>Thank You for Your Business!</p>
                </div>
            </div>
        `;
    },

    /**
     * Populates the receipt container and triggers printing.
     * @param {Object} data Transaction data
     */
    print(data) {
        // Ensure the receipt container exists in the DOM
        let container = document.getElementById('receipt-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'receipt-container';
            document.body.appendChild(container);
        }

        // Inject the "chunk"
        container.innerHTML = this.getReceiptChunk(data);

        // Allow some time for rendering and font loading, then print
        setTimeout(() => {
            window.print();
        }, 500);
    }
};
