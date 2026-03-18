/**
 * Centralized Application Configuration
 * Handled as a singleton window.AppConfig
 */

window.AppConfig = {
    settings: {},
    isLoaded: false,
    
    // Default values for critical fields
    defaults: {
        store_name: 'POS System',
        sales_prefix: 'INV',
        purchase_prefix: 'PUR',
        default_currency: 'USD',
        language: 'en'
    },

    /**
     * Initialize settings from Supabase
     */
    async init() {
        if (this.isLoaded) return;
        
        try {
            console.log('[AppConfig] Initializing settings...');
            const { data, error } = await window.supabase
                .from('settings')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "No rows found"

            if (data) {
                this.settings = data;
                console.log('[AppConfig] Settings loaded successfully:', data);
            } else {
                console.warn('[AppConfig] No settings found in database, using defaults.');
            }
            
            this.isLoaded = true;
            this.applyToUI();
            
            // Dispatch event for components waiting for config
            window.dispatchEvent(new CustomEvent('appConfigReady', { detail: this.settings }));
            
            return this.settings;
        } catch (e) {
            console.error('[AppConfig] Failed to load settings:', e);
            this.isLoaded = true; // Mark as loaded anyway to prevent infinite retry loops
        }
    },

    /**
     * Get a setting with a fallback
     */
    get(key, fallback = null) {
        if (this.settings && this.settings[key] !== undefined && this.settings[key] !== null && this.settings[key] !== '') {
            return this.settings[key];
        }
        return fallback || this.defaults[key] || '';
    },

    /**
     * Automatically populate UI elements with [data-config] attributes
     */
    applyToUI() {
        const elements = document.querySelectorAll('[data-config]');
        elements.forEach(el => {
            const key = el.getAttribute('data-config');
            const value = this.get(key);
            
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.value = value;
            } else {
                el.innerText = value;
            }
        });
    }
};

// Initialize once Supabase client is available
if (window.supabase) {
    window.AppConfig.init();
} else {
    window.addEventListener('supabaseClientReady', () => {
        window.AppConfig.init();
    });
}
