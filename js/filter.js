/**
 * Common Filter Library
 * Handle filter popup UI, metadata loading, and state across different pages.
 */
class FilterManager {
    constructor(config = {}) {
        this.onApply = config.onApply || (() => {});
        this.fields = config.fields || ['date', 'shop', 'supplier', 'status', 'payment'];
        this.state = {
            dateFrom: '',
            dateTo: '',
            shopId: '',
            supplierId: '',
            status: '',
            paymentType: '',
            searchTerm: ''
        };
        this.init();
    }

    async init() {
        this.injectStyles();
        this.injectHTML();
        await this.loadMetadata();
        this.setupEventListeners();
    }

    injectStyles() {
        if (document.getElementById('filter-system-styles')) return;
        const style = document.createElement('style');
        style.id = 'filter-system-styles';
        style.textContent = `
            .filter-popup {
                position: fixed;
                right: -340px;
                top: 0;
                height: 100%;
                width: 340px;
                background: var(--bg-secondary, #1e293b);
                border-left: 1px solid var(--border-color, rgba(255,255,255,0.1));
                padding: 24px;
                overflow-y: auto;
                z-index: 1000;
                transition: right 0.3s ease;
                box-shadow: -10px 0 30px rgba(0,0,0,0.5);
            }
            .filter-popup.show {
                right: 0;
            }
            .filter-overlay {
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.5);
                z-index: 999;
                display: none;
                backdrop-filter: blur(2px);
            }
            .filter-overlay.show {
                display: block;
            }
            .filter-field {
                margin-bottom: 20px;
            }
            .filter-field label {
                display: block;
                font-size: 10px;
                font-weight: 700;
                color: var(--text-muted, #94a3b8);
                text-transform: uppercase;
                margin-bottom: 8px;
                letter-spacing: 0.05em;
            }
            .filter-input {
                width: 100%;
                padding: 10px 12px;
                background: var(--bg-primary, #0f172a);
                border: 1px solid var(--border-color, rgba(255,255,255,0.1));
                border-radius: 8px;
                color: var(--text-primary, #f1f5f9);
                font-size: 13px;
                outline: none;
                transition: border-color 0.2s;
            }
            .filter-input:focus {
                border-color: var(--primary, #6366f1);
            }
            .filter-footer {
                margin-top: 32px;
                display: flex;
                gap: 12px;
            }
            .filter-btn {
                flex: 1;
                padding: 12px;
                border-radius: 8px;
                font-size: 12px;
                font-weight: 700;
                cursor: pointer;
                border: none;
                text-transform: uppercase;
                transition: all 0.2s;
            }
            .filter-btn-secondary {
                background: rgba(255,255,255,0.05);
                color: var(--text-secondary, #cbd5e1);
            }
            .filter-btn-primary {
                background: var(--primary, #6366f1);
                color: white;
            }
            .filter-btn:hover {
                transform: translateY(-1px);
                filter: brightness(1.1);
            }
        `;
        document.head.appendChild(style);
    }

    injectHTML() {
        if (document.getElementById('filterPopup')) return;
        
        const overlay = document.createElement('div');
        overlay.id = 'filterOverlay';
        overlay.className = 'filter-overlay';
        
        const popup = document.createElement('div');
        popup.id = 'filterPopup';
        popup.className = 'filter-popup';
        
        let fieldsHTML = '';
        
        if (this.fields.includes('date')) {
            fieldsHTML += `
                <div class="filter-field">
                    <label>Date Range</label>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                        <input type="date" id="commonFilterDateFrom" class="filter-input">
                        <input type="date" id="commonFilterDateTo" class="filter-input">
                    </div>
                </div>
            `;
        }
        
        if (this.fields.includes('shop')) {
            fieldsHTML += `
                <div class="filter-field">
                    <label>Warehouse / Shop</label>
                    <select id="commonFilterShop" class="filter-input">
                        <option value="">All Warehouses</option>
                    </select>
                </div>
            `;
        }
        
        if (this.fields.includes('supplier')) {
            fieldsHTML += `
                <div class="filter-field">
                    <label>Supplier</label>
                    <select id="commonFilterSupplier" class="filter-input">
                        <option value="">All Suppliers</option>
                    </select>
                </div>
            `;
        }
        
        if (this.fields.includes('status')) {
            fieldsHTML += `
                <div class="filter-field">
                    <label>Status</label>
                    <select id="commonFilterStatus" class="filter-input">
                        <option value="">All Statuses</option>
                        <option value="Pending">Pending</option>
                        <option value="Ordered">Ordered</option>
                        <option value="Received">Received</option>
                        <option value="Cancelled">Cancelled</option>
                    </select>
                </div>
            `;
        }

        if (this.fields.includes('payment')) {
            fieldsHTML += `
                <div class="filter-field">
                    <label>Payment Type</label>
                    <select id="commonFilterPayment" class="filter-input">
                        <option value="">All Types</option>
                        <option value="Cash">Cash</option>
                        <option value="Credit">Credit</option>
                        <option value="Bank Transfer">Bank Transfer</option>
                    </select>
                </div>
            `;
        }

        popup.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                <h3 style="font-weight: 800; font-size: 16px; display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-filter" style="color: var(--primary);"></i> FILTERS
                </h3>
                <button id="closeFilterBtn" style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:18px;">&times;</button>
            </div>
            <div class="filter-body">${fieldsHTML}</div>
            <div class="filter-footer">
                <button id="resetFilterBtn" class="filter-btn filter-btn-secondary">Reset</button>
                <button id="applyFilterBtn" class="filter-btn filter-btn-primary">Apply</button>
            </div>
        `;

        document.body.appendChild(overlay);
        document.body.appendChild(popup);
    }

    async loadMetadata() {
        if (this.fields.includes('shop')) {
            const { data } = await supabase.from('warehouses').select('id, name').order('name');
            const select = document.getElementById('commonFilterShop');
            if (select) {
                (data || []).forEach(w => {
                    const opt = document.createElement('option');
                    opt.value = w.id;
                    opt.textContent = w.name;
                    select.appendChild(opt);
                });
            }
        }
        
        if (this.fields.includes('supplier')) {
            const { data } = await supabase.from('suppliers').select('id, name').order('name');
            const select = document.getElementById('commonFilterSupplier');
            if (select) {
                (data || []).forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s.id;
                    opt.textContent = s.name;
                    select.appendChild(opt);
                });
            }
        }
    }

    setupEventListeners() {
        const overlay = document.getElementById('filterOverlay');
        const popup = document.getElementById('filterPopup');
        const closeBtn = document.getElementById('closeFilterBtn');
        const applyBtn = document.getElementById('applyFilterBtn');
        const resetBtn = document.getElementById('resetFilterBtn');

        const close = () => {
            popup.classList.remove('show');
            overlay.classList.remove('show');
        };

        const open = () => {
            popup.classList.add('show');
            overlay.classList.add('show');
        };

        overlay.onclick = close;
        closeBtn.onclick = close;
        
        applyBtn.onclick = () => {
            this.updateStateFromUI();
            this.onApply(this.state);
            close();
        };

        resetBtn.onclick = () => {
            this.resetUI();
            this.updateStateFromUI();
            this.onApply(this.state);
        };

        // Expose open method globally or via instance
        this.open = open;
        this.close = close;
    }

    updateStateFromUI() {
        const df = document.getElementById('commonFilterDateFrom');
        const dt = document.getElementById('commonFilterDateTo');
        const sh = document.getElementById('commonFilterShop');
        const su = document.getElementById('commonFilterSupplier');
        const st = document.getElementById('commonFilterStatus');
        const pa = document.getElementById('commonFilterPayment');

        if (df) this.state.dateFrom = df.value;
        if (dt) this.state.dateTo = dt.value;
        if (sh) this.state.shopId = sh.value;
        if (su) this.state.supplierId = su.value;
        if (st) this.state.status = st.value;
        if (pa) this.state.paymentType = pa.value;
    }

    resetUI() {
        const ids = ['commonFilterDateFrom', 'commonFilterDateTo', 'commonFilterShop', 'commonFilterSupplier', 'commonFilterStatus', 'commonFilterPayment'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    }

    getFilters() {
        return this.state;
    }
}
window.FilterManager = FilterManager;
