// frontend/js/dialog-manager.js
// Robust, Promise-based modal API with focus trapping and keyboard accessibility.

class DialogManager {
    constructor() {
        this.overlay = document.getElementById('global-modal-overlay');
        this.modal = document.getElementById('global-modal');
        this.titleEl = document.getElementById('modal-title');
        this.bodyEl = document.getElementById('modal-body');
        this.btnCancel = document.getElementById('modal-btn-cancel');
        this.btnConfirm = document.getElementById('modal-btn-confirm');
        this.btnClose = document.getElementById('modal-close');

        this.currentResolve = null;
        this.previousActiveElement = null;

        // Bound context for dynamic listeners
        this._handleKeyDown = this._handleKeyDown.bind(this);
        this._handleOverlayClick = this._handleOverlayClick.bind(this);

        this.initListeners();
    }

    initListeners() {
        if (!this.overlay) return;
        this.btnCancel?.addEventListener('click', () => this.handleAction(false));
        this.btnConfirm?.addEventListener('click', () => this.handleAction(true));
        this.btnClose?.addEventListener('click', () => this.handleAction(false));
        this.overlay.addEventListener('click', this._handleOverlayClick);
    }

    /**
     * Shows a confirmation dialog.
     * @param {string} title - The dialog title.
     * @param {string} htmlMessage - The body content (accepts HTML).
     * @param {string} confirmBtnText - Text for the confirm button.
     * @param {string} cancelBtnText - Text for the cancel button.
     * @returns {Promise<boolean>} True if confirmed, false if canceled.
     */
    confirm(title, htmlMessage, confirmBtnText = "Confirm", cancelBtnText = "Cancel") {
        if (!this.overlay || !this.modal) {
            console.error("Modal elements missing from DOM. Assuming false.");
            return Promise.resolve(false);
        }

        // Setup Content
        this.titleEl.textContent = title;
        this.bodyEl.innerHTML = htmlMessage;
        this.btnConfirm.textContent = confirmBtnText;
        this.btnCancel.textContent = cancelBtnText;

        // Store focus to restore later
        this.previousActiveElement = document.activeElement;

        // Display mechanics
        this.overlay.style.display = 'flex';
        document.body.classList.add('modal-open');

        // Bind keyboard events for this session
        document.addEventListener('keydown', this._handleKeyDown);

        // Auto-focus confirm button (focus trap starting point)
        // Set timeout allows display:flex to render before focusing
        setTimeout(() => {
            this.btnConfirm.focus();
        }, 50);

        return new Promise((resolve) => {
            this.currentResolve = resolve;
        });
    }

    /**
     * Internal handler to process Escape, Enter, and Tab focus-trapping.
     */
    _handleKeyDown(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            this.handleAction(false);
        } else if (e.key === 'Enter') {
            // Only capture Enter if we are not already focused on the cancel button
            if (document.activeElement !== this.btnCancel && document.activeElement !== this.btnClose) {
                e.preventDefault();
                this.handleAction(true);
            }
        } else if (e.key === 'Tab') {
            // Trap Focus
            const focusableElements = this.modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            if (focusableElements.length === 0) return;

            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];

            if (e.shiftKey) { // Shift + Tab
                if (document.activeElement === firstElement) {
                    lastElement.focus();
                    e.preventDefault();
                }
            } else { // Tab
                if (document.activeElement === lastElement) {
                    firstElement.focus();
                    e.preventDefault();
                }
            }
        }
    }

    /**
     * Closes the modal if user clicks the dark backdrop outside the modal core.
     */
    _handleOverlayClick(e) {
        if (e.target === this.overlay) {
            this.handleAction(false);
        }
    }

    /**
     * Resolves the outstanding promise and cleans up DOM state.
     */
    handleAction(result) {
        // Hide UI
        this.overlay.style.display = 'none';
        document.body.classList.remove('modal-open');

        // Remove structural listeners
        document.removeEventListener('keydown', this._handleKeyDown);

        // Restore focus
        if (this.previousActiveElement && typeof this.previousActiveElement.focus === 'function') {
            this.previousActiveElement.focus();
        }

        // Return promise result
        if (this.currentResolve) {
            this.currentResolve(result);
            this.currentResolve = null;
        }
    }
}

// Bootstrap
window.addEventListener("app-ready", () => {
    // Allows overwriting the basic Phase 4 dialogue manager
    window.dialogManager = new DialogManager();
});
