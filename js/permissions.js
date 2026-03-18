/**
 * permissions.js — Shared Permission Utility
 * ============================================
 * Reads user permissions from sessionStorage and provides helper functions
 * for checking and applying UI-level permission enforcement.
 *
 * Usage in any page:
 *   <script src="js/permissions.js"></script>
 *   ...
 *   window.AppPermissions.applyToPage('Purchase'); // auto-hides elements
 *
 * Permission string format (from roles.js / Supabase roles table):
 *   "Manage Products"       → canView('Products')
 *   "Create Products"       → canCreate('Products')
 *   "Edit Products"         → canEdit('Products')
 *   "Delete Products"       → canDelete('Products')
 */

(function () {
    'use strict';

    var STORAGE_KEY = 'app_user_permissions';
    var ROLE_KEY = 'app_user_role';

    /* ------------------------------------------------------------------ */
    /* 1. Read / Write helpers                                              */
    /* ------------------------------------------------------------------ */

    /** Store permission array and role into sessionStorage (called from admin-dashboard) */
    function storePermissions(permArray, role) {
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(permArray || []));
            sessionStorage.setItem(ROLE_KEY, role || '');
        } catch (e) {
            console.warn('[Permissions] Could not write to sessionStorage:', e);
        }
    }

    /** 
     * Fetch user permissions from Supabase and store them.
     * @param {string} roleName 
     */
    async function fetchUserPermissions(roleName) {
        if (!roleName) return [];

        // Admin has all perms — handled via isAdmin()
        if (roleName === 'admin') {
            storePermissions([], 'admin');
            return [];
        }

        try {
            const client = window.supabase || window.supabaseClient;
            if (!client) throw new Error('Supabase client not found');

            const { data, error } = await client
                .from('roles')
                .select('permissions')
                .eq('name', roleName)
                .single();

            if (error) throw error;

            const permArray = Array.isArray(data?.permissions) ? data.permissions : [];
            storePermissions(permArray, roleName);
            return permArray;
        } catch (e) {
            console.warn('[Permissions] Could not fetch permissions:', e);
            return [];
        }
    }

    /** Get the stored permission array */
    function getPermissions() {
        try {
            var raw = sessionStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    /** Get the stored role string */
    function getRole() {
        try {
            return sessionStorage.getItem(ROLE_KEY) || '';
        } catch (e) {
            return '';
        }
    }

    /** Admin always has all permissions */
    function isAdmin() {
        return getRole() === 'admin';
    }

    /* ------------------------------------------------------------------ */
    /* 2. Permission checkers                                               */
    /* ------------------------------------------------------------------ */

    /**
     * Check if user has a specific permission string.
     * Admins always return true.
     * @param {string} permString - e.g. "Delete Products"
     */
    function has(permString) {
        if (isAdmin()) return true;
        var perms = getPermissions();
        return perms.indexOf(permString) !== -1;
    }

    /** View permission — stored as "Manage X" for backward compat */
    function canView(moduleKey) {
        if (isAdmin()) return true;
        return has('Manage ' + moduleKey);
    }

    function canCreate(moduleKey) {
        if (isAdmin()) return true;
        return has('Create ' + moduleKey);
    }

    function canEdit(moduleKey) {
        if (isAdmin()) return true;
        return has('Edit ' + moduleKey);
    }

    function canDelete(moduleKey) {
        if (isAdmin()) return true;
        return has('Delete ' + moduleKey);
    }

    /* ------------------------------------------------------------------ */
    /* 3. UI enforcement helpers                                            */
    /* ------------------------------------------------------------------ */

    /**
     * Hide an element by selector if condition is false.
     * @param {string} selector
     * @param {boolean} allowed
     */
    function toggleElement(selector, allowed) {
        var elements = document.querySelectorAll(selector);
        elements.forEach(function (el) {
            if (!allowed) {
                el.style.display = 'none';
                el.setAttribute('data-perm-hidden', '1');
            }
        });
    }

    /**
     * Main auto-apply function.
     * Searches for elements with data-perm-action attribute and hides them
     * if the user doesn't have the required permission.
     *
     * @param {string} defaultModule - e.g. "Purchase"
     * @param {HTMLElement|Document} ctx - Optional context to search within (defaults to document)
     */
    function applyToPage(defaultModule, ctx) {
        if (isAdmin()) return; // admins see everything

        var root = ctx || document;
        var elements = root.querySelectorAll('[data-perm-action]');

        elements.forEach(function (el) {
            var action = (el.getAttribute('data-perm-action') || '').toLowerCase();
            var module = el.getAttribute('data-perm-module') || defaultModule || '';

            var allowed = false;
            switch (action) {
                case 'create': allowed = canCreate(module); break;
                case 'edit': allowed = canEdit(module); break;
                case 'delete': allowed = canDelete(module); break;
                case 'view': allowed = canView(module); break;
                default: allowed = true;
            }

            if (!allowed) {
                el.style.display = 'none';
                el.setAttribute('data-perm-hidden', '1');

                // Also disable if it's an input/button to be safe
                if (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'SELECT') {
                    el.disabled = true;
                }
            } else {
                // Restore if it was previously hidden/disabled by this script
                if (el.getAttribute('data-perm-hidden') === '1') {
                    el.style.display = '';
                    el.removeAttribute('data-perm-hidden');
                    if (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'SELECT') {
                        el.disabled = false;
                    }
                }
            }
        });
    }


    /**
     * Sidebar enforcement — called from admin-dashboard.html.
     * Map of view key → required permission string (the "Manage X" view perm).
     */
    var VIEW_PERMISSION_MAP = {
        '': 'Manage Dashboard',
        'reports': 'Manage Reports',
        'products': 'Manage Products',
        'product-add': 'Manage Products',
        'categories': 'Manage Product Categories',
        'variations': 'Manage Variations',
        'brands': 'Manage Brands',
        'units': 'Manage Units',
        'barcodes': 'Manage Products',
        'adjustments': 'Manage Adjustments',
        'warehouses': 'Manage Warehouses',
        'quotation': 'Manage Quotations',
        'purchase-order': 'Manage Purchase',
        'purchase-order-list': 'Manage Purchase',
        'purchase-list': 'Manage Purchase',
        'purchase-add': 'Manage Purchase',
        'purchase-return': 'Manage Purchase Return',
        'pos': 'Manage Pos Screen',
        'sales': 'Manage Sale',
        'sales-return': 'Manage Sale Return',
        'transfers': 'Manage Transfers',
        'expenses': 'Manage Expenses',
        'expense-categories': 'Manage Expense Categories',
        'suppliers': 'Manage Suppliers',
        'customers': 'Manage Customers',
        'users': 'Manage Users',
        'roles': 'Manage Roles',
        'currencies': 'Manage Setting',
        'settings': 'Manage Setting',
        'languages': 'Manage Setting',
        'sms-templates': 'Manage Setting',
        'email-templates': 'Manage Setting',
        'api-settings': 'Manage Setting'
    };

    /** Map of view key -> Permission Module name (base for Create/Edit/Delete) */
    var VIEW_MODULE_MAP = {
        'products': 'Products',
        'product-add': 'Products',
        'categories': 'Product Categories',
        'variations': 'Variations',
        'brands': 'Brands',
        'units': 'Units',
        'adjustments': 'Adjustments',
        'warehouses': 'Warehouses',
        'quotation': 'Quotations',
        'purchase-order': 'Purchase',
        'purchase-order-list': 'Purchase',
        'purchase-list': 'Purchase',
        'purchase-add': 'Purchase',
        'purchase-return': 'Purchase Return',
        'sales': 'Sale',
        'sales-return': 'Sale Return',
        'transfers': 'Transfers',
        'expenses': 'Expenses',
        'expense-categories': 'Expense Categories',
        'suppliers': 'Suppliers',
        'customers': 'Customers',
        'users': 'Users',
        'roles': 'Roles',
        'settings': 'Setting'
    };

    /**
     * Check if user can access a specific view.
     * Admins always return true. Dashboard (empty key) always returns true as fallback.
     */
    function canAccessView(viewKey) {
        if (isAdmin()) return true;

        // Dashboard (empty key or 'dashboard')
        if (viewKey === '' || viewKey === 'dashboard') {
            return has('Manage Dashboard');
        }

        var requiredPerm = VIEW_PERMISSION_MAP[viewKey];
        if (!requiredPerm) return true; // unknown views are allowed by default
        return has(requiredPerm);
    }

    /**
     * Find the first view the user has permission for.
     * Useful for landing pages.
     */
    function getFirstAccessibleView() {
        if (isAdmin()) return 'dashboard';

        // Priority sequence
        var preferredOrder = [
            'dashboard',
            'pos',
            'products',
            'sales',
            'purchase-list',
            'customers',
            'reports'
        ];

        // 1. Check preferred order first
        for (var i = 0; i < preferredOrder.length; i++) {
            if (canAccessView(preferredOrder[i])) return preferredOrder[i];
        }

        // 2. Fallback to anything in the map
        for (var key in VIEW_PERMISSION_MAP) {
            if (canAccessView(key)) return key;
        }

        return null;
    }

    /** Map a view name to its module for granular perms */
    function getModuleKey(viewKey) {
        return VIEW_MODULE_MAP[viewKey] || '';
    }

    /**
     * Apply sidebar visibility based on permissions.
     * Hides <li class="nav-item"> elements whose data-view attribute
     * maps to a permission the user doesn't have.
     * Hides empty <div class="nav-section"> groups too.
     */
    function applySidebar() {
        if (isAdmin()) return;

        // Hide individual nav items
        var navLinks = document.querySelectorAll('.nav-link[data-view]');
        navLinks.forEach(function (link) {
            var viewKey = link.getAttribute('data-view');
            if (!canAccessView(viewKey)) {
                var li = link.closest('li.nav-item');
                if (li) li.style.display = 'none';
            }
        });

        // Hide entire nav-sections if all their items are hidden
        var sections = document.querySelectorAll('.nav-section');
        sections.forEach(function (section) {
            var visibleItems = section.querySelectorAll('li.nav-item:not([style*="display: none"])');
            if (visibleItems.length === 0) {
                section.style.display = 'none';
            }
        });

        // Also handle submenu parents: if all children hidden, hide parent
        var dropdownItems = document.querySelectorAll('.nav-item.has-submenu');
        dropdownItems.forEach(function (item) {
            var visibleSubItems = item.querySelectorAll('.submenu li.nav-item:not([style*="display: none"])');
            if (visibleSubItems.length === 0) {
                item.style.display = 'none';
            }
        });
    }

    /* ------------------------------------------------------------------ */
    /* 4. Expose API                                                        */
    /* ------------------------------------------------------------------ */

    window.AppPermissions = {
        storePermissions: storePermissions,
        fetchUserPermissions: fetchUserPermissions,
        getPermissions: getPermissions,
        getRole: getRole,
        isAdmin: isAdmin,
        has: has,
        canView: canView,
        canCreate: canCreate,
        canEdit: canEdit,
        canDelete: canDelete,
        canAccessView: canAccessView,
        getFirstAccessibleView: getFirstAccessibleView,
        applyToPage: applyToPage,
        applySidebar: applySidebar,
        getModuleKey: getModuleKey,
        VIEW_PERMISSION_MAP: VIEW_PERMISSION_MAP,
        VIEW_MODULE_MAP: VIEW_MODULE_MAP
    };

})();
