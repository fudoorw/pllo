/**
 * Admin Dashboard - Core Infrastructure Module
 * Handles initialization, routing, authentication integration, and global UI utilities.
 */

// Global State
window.currentUser = null;

/**
 * Global Loading UI Utilities
 * These were previously missing but called throughout the app.
 */
window.showLoading = function () {
    let overlay = document.getElementById('global-loading');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'global-loading';
        overlay.className = 'modal-overlay'; // Reuse existing styles
        overlay.style.zIndex = '9999';
        overlay.style.background = 'rgba(15, 23, 42, 0.8)'; // Semi-transparent dark
        overlay.innerHTML = `
            <div class="flex flex-col items-center gap-md">
                <div class="spinner"></div>
                <p style="color: var(--text-primary); font-weight: 500;">Please wait...</p>
            </div>
        `;
        document.body.appendChild(overlay);
    }
    overlay.classList.remove('hidden');
};

window.hideLoading = function () {
    const overlay = document.getElementById('global-loading');
    if (overlay) {
        overlay.classList.add('hidden');
    }
};

/**
 * Dashboard Initialization
 * Boots the application, checks auth, and loads initial view.
 */
window.init = async function () {
    console.log('Initializing Admin Dashboard...');

    try {
        // Require auth and get user - allow all roles, permissions will handle the rest
        const user = await window.requireAuth();
        if (!user) {
            if (typeof window.hideLoading === 'function') window.hideLoading();
            return;
        }

        window.currentUser = user;

        // Update UI with user info
        const userNameEl = document.getElementById('userName');
        const userRoleEl = document.getElementById('userRole');
        if (userNameEl) userNameEl.textContent = user.email.split('@')[0];
        if (userRoleEl) userRoleEl.textContent = user.role.charAt(0).toUpperCase() + user.role.slice(1);

        // Apply role permissions
        if (window.AppPermissions && typeof window.AppPermissions.applySidebar === 'function') {
            window.AppPermissions.applySidebar();
        } else {
            window.applyRolePermissions(user.role);
        }

        // Setup initial view
        const urlParams = new URLSearchParams(window.location.search);
        let initialView = urlParams.get('view') || '';
        const action = urlParams.get('action');

        // Check if user has permission for initial view or dashboard
        if (!window.AppPermissions.canAccessView(initialView)) {
            // Find first allowed view
            initialView = window.AppPermissions.getFirstAccessibleView() || 'dashboard';
        }

        window.switchView(initialView, action);

        // Load reference data first as it's often needed by views
        await window.loadReferenceData();

        // Initialize touch optimizations if available
        if (typeof window.setupDoubleTouchEditing === 'function') {
            window.setupDoubleTouchEditing();
        }

        // Final safety: ensure loading is hidden after everything is initialized
        if (typeof window.hideLoading === 'function') window.hideLoading();
    } catch (error) {
        console.error('Initialization error:', error);
        if (typeof window.hideLoading === 'function') window.hideLoading();
        alert('Failed to initialize application. Please refresh or login again.');
    }
};

/**
 * Role-Based Access Control
 */
window.hasPermission = function (role, viewName) {
    // 1. Check dynamic permissions if available
    if (window.AppPermissions && typeof window.AppPermissions.canAccessView === 'function') {
        return window.AppPermissions.canAccessView(viewName);
    }

    // 2. Legacy Fallback (Hardcoded roles)
    const adminOnly = ['users', 'variations', 'currencies', 'roles'];
    const managerOnly = ['products', 'categories', 'brands', 'units', 'barcodes', 'purchase-manager', 'purchase-order', 'purchase-add', 'purchase-return', 'warehouses', 'sales', 'sales-return', 'expense-categories', 'suppliers', 'customers'];

    if (role === 'admin') return true;
    if (role === 'manager') {
        return adminOnly.indexOf(viewName) === -1;
    }
    if (role === 'cashier') {
        return adminOnly.indexOf(viewName) === -1 && managerOnly.indexOf(viewName) === -1;
    }
    return false;
};

window.applyRolePermissions = function (role) {
    const elements = document.querySelectorAll('[data-permissions]');
    elements.forEach(el => {
        const allowedRoles = el.getAttribute('data-permissions').split(',');
        if (allowedRoles.indexOf(role) === -1) {
            el.style.display = 'none';
            if (el.classList.contains('nav-section')) el.classList.add('hidden');
        } else {
            el.style.display = '';
            el.classList.remove('hidden');
        }
    });
};

/**
 * View Switcher / Router
 */
window.switchView = function (viewName, action = null) {
    // Default to dashboard
    if (!viewName || viewName === '') viewName = 'dashboard';

    // Permission Check
    if (window.currentUser && !window.hasPermission(window.currentUser.role, viewName)) {
        console.warn('Unauthorized view access attempt:', viewName);
        viewName = 'dashboard';
    }

    const targetId = viewName === 'dashboard' ? 'view-dashboard' : `view-${viewName}`;
    const targetEl = document.getElementById(targetId);

    if (!targetEl) {
        console.warn(`View "${viewName}" not found, falling back to dashboard.`);
        return window.switchView('dashboard');
    }

    // Hide all views dynamically
    document.querySelectorAll('[id^="view-"]').forEach(el => el.classList.add('hidden'));

    // Show target view
    targetEl.classList.remove('hidden');

    // Update Title
    const titleEl = document.querySelector('.page-title-nav');
    if (titleEl) {
        // Custom titles for specific views
        const customTitles = {
            'products': 'Products manager',
            'product-add': 'Add Product',
            'categories': 'Categories',
            'variations': 'Variations',
            'brands': 'Brands',
            'units': 'Units',
            'barcodes': 'Print Barcodes',
            'adjustments': 'Stock Adjustments',
            'warehouses': 'Warehouses',
            'transfers': 'Stock Transfers',
            'expenses': 'Expenses',
            'expense-categories': 'Expense Categories',
            'customers': 'Customers',
            'suppliers': 'Suppliers',
            'users': 'Users',
            'roles': 'Roles & Permissions',
            'currencies': 'Currencies',
            'languages': 'Languages',
            'settings': 'Settings',
            'reports': 'Reports',
            'pos': 'POS',
            'sales': 'Sales',
            'sale-pos': "Today's Sales",
            'sales-return': 'Sales Return',
            'purchase-add': 'Add Purchase',
            'purchase-list': 'Purchase List',
            'purchase-order': 'Purchase Order',
            'purchase-order-list': 'Purchase Orders',
            'purchase-return': 'Purchase Return',
            'quotation': 'Quotations',
            'sms-templates': 'SMS Templates',
            'email-templates': 'Email Templates',
            'api-settings': 'API Settings'
        };

        if (customTitles[viewName]) {
            titleEl.textContent = customTitles[viewName];
        } else {
            titleEl.textContent = viewName.split('-').map(word =>
                word.charAt(0).toUpperCase() + word.slice(1)
            ).join(' ');
        }
    }

    // Update Sidebar Active State
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        const onclick = link.getAttribute('onclick');
        // Precise matching for switchView('viewName')
        const viewMatch = onclick && onclick.match(/switchView\s*\(\s*['"]([^'"]+)['"]/);
        if (viewMatch && viewMatch[1] === viewName) {
            link.classList.add('active');
            // Handle parent menu item
            const submenu = link.closest('.submenu');
            if (submenu) {
                const parentItem = submenu.closest('.nav-item');
                if (parentItem) parentItem.classList.add('active');
            }
        }
    });

    // Handle View-Specific Loading
    switch (viewName) {
        case 'dashboard':
            const dashIframe = document.getElementById('dashboardIframe');
            if (dashIframe) {
                try {
                    // Use postMessage to avoid cross-origin SecurityError on file:// origins
                    dashIframe.contentWindow.postMessage({ type: 'LOAD_DASHBOARD' }, '*');
                } catch (e) {
                    console.warn('postMessage to dashboard iframe failed:', e);
                }
            }
            break;
        case 'products':
            if (typeof window.loadProducts === 'function') {
                if (typeof window.loadReferenceData === 'function') {
                    window.loadReferenceData().then(() => {
                        window.loadProducts();
                    });
                }
            }
            break;
        case 'product-add':
            break;
        case 'categories':
            break;
        case 'variations':
            break;
        case 'brands':
            break;
        case 'units':
            break;
        // Purchase views are handled by self-contained iframes
        case 'purchase-list': break;
        case 'purchase-add':
            if (action && typeof action === 'object' && action.id) {
                const addIframe = document.getElementById('purchaseAddIframe');
                if (addIframe) {
                    addIframe.src = `purchase-add.html?id=${action.id}&mode=embedded`;
                }
            } else {
                const addIframe = document.getElementById('purchaseAddIframe');
                if (addIframe) {
                    addIframe.src = 'purchase-add.html?mode=embedded';
                }
            }
            break;
        case 'purchase-return': break;
        case 'users': if (typeof window.loadUsersList === 'function') window.loadUsersList(); break;
        case 'adjustments':
            // Handled via iframe src in admin-dashboard.html
            break;
        case 'warehouses': break;
    }

    // Handle POS-specific logic (e.g. loading a translation)
    if (viewName === 'pos' && action && typeof action === 'object' && action.editId) {
        const posIframe = document.getElementById('posIframe');
        if (posIframe) {
            posIframe.src = `pos.html?transactionId=${action.editId}`;
        }
    } else if (viewName === 'pos') {
        const posIframe = document.getElementById('posIframe');
        if (posIframe) {
            posIframe.src = 'pos.html'; // Reset if no action
        }
    }

    if (viewName === 'sale-pos') {
        const salePosIframe = document.getElementById('salePosIframe');
        if (salePosIframe) {
            if (salePosIframe.src && salePosIframe.src.indexOf('sale-pos.html') !== -1) {
                try {
                    salePosIframe.contentWindow.postMessage({ type: 'REFRESH_SALES' }, '*');
                } catch (e) {
                    console.log("PostMessage to sale-pos failed", e);
                }
            } else {
                salePosIframe.src = 'sale-pos.html';
            }
        }
    }

    // Update URL without reload
    const newUrl = new URL(window.location);
    newUrl.searchParams.set('view', viewName);
    if (action && typeof action === 'string') newUrl.searchParams.set('action', action);
    else newUrl.searchParams.delete('action');
    window.history.pushState({}, '', newUrl);
};


/**
 * Reference Data Loading
 * Loads common categories, brands, etc. for dropdowns.
 */
window.loadReferenceData = function () {
    return new Promise(function (resolve) {
        if (typeof window.DataLoader !== 'undefined') {
            window.DataLoader.fetch({
                fetchFn: async function () {
                    var results = await Promise.all([
                        window.supabase.from('categories').select('*').order('name'),
                        window.supabase.from('subcategories').select('*').order('name'),
                        window.supabase.from('brands').select('*').order('name'),
                        window.supabase.from('units').select('*').order('name')
                    ]);
                    // Check for errors in any result
                    for (var i = 0; i < results.length; i++) {
                        if (results[i].error) throw results[i].error;
                    }
                    return { data: results };
                },
                containerId: null,
                loadingMessage: 'Loading reference data...',
                onSuccess: function (results) {
                    window.refCategories = results[0].data || [];
                    window.refSubcategories = results[1].data || [];
                    window.refBrands = results[2].data || [];
                    window.refUnits = results[3].data || [];
                    console.log('Reference data loaded');
                    resolve();
                },
                onError: function () {
                    console.error('Reference data load failed after retries.');
                    resolve(); // Don't block init
                }
            });
        } else {
            (async function () {
                try {
                    var results = await Promise.all([
                        window.supabase.from('categories').select('*').order('name'),
                        window.supabase.from('subcategories').select('*').order('name'),
                        window.supabase.from('brands').select('*').order('name'),
                        window.supabase.from('units').select('*').order('name')
                    ]);
                    window.refCategories = results[0].data || [];
                    window.refSubcategories = results[1].data || [];
                    window.refBrands = results[2].data || [];
                    window.refUnits = results[3].data || [];
                    console.log('Reference data loaded');
                } catch (error) {
                    console.error('Error loading reference data:', error);
                }
                resolve();
            })();
        }
    });
};

/**
 * Utility: HTML Escaping
 */
window.escapeHtml = function (text) {
    if (!text) return '';
    return text
        .toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
};

window.getCategoryName = function (id) {
    if (!id || !window.refCategories) return '';
    const cat = window.refCategories.find(c => c.id === id);
    return cat ? cat.name : '';
};

window.getSubcategoryName = function (id) {
    if (!id || !window.refSubcategories) return '';
    const sub = window.refSubcategories.find(s => s.id === id);
    return sub ? sub.name : '';
};

window.getBrandName = function (id) {
    if (!id || !window.refBrands) return '';
    const brand = window.refBrands.find(b => b.id === id);
    return brand ? brand.name : '';
};

window.getUnitName = function (id) {
    if (!id || !window.refUnits) return '';
    const unit = window.refUnits.find(u => u.id === id);
    return unit ? (unit.short_name || unit.name) : '';
};

/**
 * Utility: Module-specific Sync Status Update
 */
window.updateModuleSyncStatus = function (moduleId, status) {
    const el = document.getElementById('syncStatus' + moduleId) || document.getElementById('syncStatus');
    if (el) {
        el.textContent = status;
        el.className = 'sync-status ' + (status.includes('Unsaved') || status.includes('Error') ? 'status-warning' : 'status-success');
    }
};
/**
 * Placeholder Views
 */
window.viewTransactions = function () {
    alert('Transactions page coming soon!');
};

window.manageUsers = function () {
    alert('User management feature coming soon!');
};

window.openPOS = function () {
    window.switchView('pos');
};
