/**
 * datepicker-init.js
 * Auto-converts all <input type="date"> to Flatpickr with DD-Mon-YYYY display.
 * 
 * Usage: Just include this script in any HTML page:
 *   <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css">
 *   <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/flatpickr/dist/themes/dark.css">
 *   <script src="https://cdn.jsdelivr.net/npm/flatpickr"></script>
 *   <script src="js/datepicker-init.js"></script>
 */

(function () {
    'use strict';

    const DISPLAY_FORMAT = 'd-M-Y';   // 06-Mar-2026
    const ALT_INPUT = true;            // Show formatted date, keep YYYY-MM-DD in hidden input

    /**
     * Initialize Flatpickr on a single date input element.
     */
    function initDatePicker(input) {
        if (input._flatpickr) return; // Already initialized

        const currentValue = input.value; // Preserve existing value

        // Convert type from "date" to "text" to prevent native picker
        input.type = 'text';

        const fp = flatpickr(input, {
            dateFormat: 'Y-m-d',          // Internal value format (for DB)
            altInput: ALT_INPUT,           // Show user-friendly format
            altFormat: DISPLAY_FORMAT,     // What the user sees
            allowInput: true,
            defaultDate: currentValue || null,
            theme: 'dark',
            // Prevent the calendar from changing the stored value format
            onChange: function (selectedDates, dateStr, instance) {
                // Dispatch a change event so existing listeners still work
                const event = new Event('change', { bubbles: true });
                input.dispatchEvent(event);
            }
        });

        return fp;
    }

    /**
     * Initialize all date inputs on the page.
     */
    function initAllDatePickers() {
        const dateInputs = document.querySelectorAll('input[type="date"]');
        dateInputs.forEach(initDatePicker);
    }

    /**
     * Watch for dynamically added date inputs (for modals, dynamic rows, etc.)
     */
    function observeDynamicInputs() {
        const observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                mutation.addedNodes.forEach(function (node) {
                    if (node.nodeType !== 1) return;
                    // Check the node itself
                    if (node.matches && node.matches('input[type="date"]')) {
                        initDatePicker(node);
                    }
                    // Check children
                    if (node.querySelectorAll) {
                        node.querySelectorAll('input[type="date"]').forEach(initDatePicker);
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Expose globally so dynamically created inputs can be initialized manually
    window.initDatePicker = initDatePicker;
    window.initAllDatePickers = initAllDatePickers;

    // Auto-init on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            initAllDatePickers();
            observeDynamicInputs();
        });
    } else {
        initAllDatePickers();
        observeDynamicInputs();
    }
})();
