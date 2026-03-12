// window-level.js
// Implements mouse-drag adjustments for Window Center / Window Width

class WindowLevelTool {
    constructor() {
        this.active = false;
        this.baseWc = 127;
        this.baseWw = 256;
        this.currentWc = this.baseWc;
        this.currentWw = this.baseWw;
        this.isDragging = false;
        this.lastX = 0;
        this.lastY = 0;
    }

    activate(viewerElement) {
        this.active = true;
        this.viewer = viewerElement;
        this.bindEvents();
    }

    deactivate() {
        this.active = false;
        this.unbindEvents();
    }

    bindEvents() {
        this.downHandler = (e) => {
            if (!this.active) return;
            this.isDragging = true;
            this.lastX = e.clientX;
            this.lastY = e.clientY;
            this.viewer.setPointerCapture(e.pointerId);
            e.stopPropagation();
        };

        this.upHandler = (e) => {
            if (this.isDragging) {
                this.isDragging = false;
                this.viewer.releasePointerCapture(e.pointerId);
                e.stopPropagation();
            }
        };

        this.moveHandler = (e) => {
            if (!this.active || !this.isDragging) return;

            const dx = e.clientX - this.lastX;
            const dy = e.clientY - this.lastY;

            this.lastX = e.clientX;
            this.lastY = e.clientY;

            // X controls Width, Y controls Center (Standard PACS behavior)
            this.currentWw = Math.max(1, this.currentWw + dx * 2);
            this.currentWc = this.currentWc - dy * 2; // Up is lower center

            if (window.viewerController) {
                window.viewerController.setWindowLevel(this.currentWw, this.currentWc);
            }

            // Update UI Header
            const wcEl = document.getElementById("meta-wc");
            const wwEl = document.getElementById("meta-ww");
            if (wcEl) wcEl.innerText = Math.round(this.currentWc);
            if (wwEl) wwEl.innerText = Math.round(this.currentWw);
            e.stopPropagation();
        };

        this.viewer.addEventListener("pointerdown", this.downHandler, true);
        window.addEventListener("pointerup", this.upHandler, true);
        window.addEventListener("pointermove", this.moveHandler, true);
    }

    unbindEvents() {
        if (this.downHandler) this.viewer.removeEventListener("pointerdown", this.downHandler, true);
        if (this.upHandler) window.removeEventListener("pointerup", this.upHandler, true);
        if (this.moveHandler) window.removeEventListener("pointermove", this.moveHandler, true);
    }
}

window.WLTool = WindowLevelTool;
