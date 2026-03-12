// frontend/js/renderer-controller.js
// High-performance central arbiter for dual WebGL/Canvas render pipelines.
// Implements requestAnimationFrame (rAF) loop and coalesced event dispatching (max-ping).

class RendererController {
    constructor() {
        this.origRenderer = null;
        this.overlayRenderer = null;

        // Matrix State
        this.scale = 1.0;
        this.translateX = 0;
        this.translateY = 0;

        this.isDragging = false;
        this.lastMouse = { x: 0, y: 0 };
        this.container = document.getElementById("comp-viewer");

        // rAF State
        this._renderPending = false;
        this._boundRenderLoop = this._renderLoop.bind(this);

        // Worker State
        this.worker = null;
        if (window.CONFIG?.FEATURES?.render_worker) {
            this._initWorker();
        }

        this._initEvents();
    }

    _initWorker() {
        try {
            this.worker = new Worker(new URL('./workers/overlay-worker.js', import.meta.url), { type: 'module' });
            this.worker.onmessage = (e) => {
                if (e.data.type === 'BLENDED_FRAME') {
                    // Fast path update for overlay renderer if needed
                    // In a production WebGL environment with OffscreenCanvas, the worker would render directly.
                    // For this architecture, we might receive stitched ArrayBuffers back.
                }
            };
        } catch (err) {
            console.warn("WebWorker unsupported or failed to load. Falling back to main-thread.", err);
        }
    }

    async loadImages(origSrc, overlaySrc) {
        // Fallback or WebGL Renderer Instantiation (Lazy)
        if (!this.origRenderer) {
            const RClass = window.ClinicalWebGLRenderer || window.ClinicalCanvasRenderer;
            this.origRenderer = new RClass("gl-orig");
            this.overlayRenderer = new RClass("gl-clean");

            // Re-bind to correct DOM nodes built by vite
            this.origRenderer.canvas = document.getElementById("gl-orig");
            this.origRenderer.gl = this.origRenderer.canvas.getContext("webgl2"); // simplify instantiation
            if (!this.origRenderer.gl) this.origRenderer = new window.ClinicalCanvasRenderer("gl-orig");

            this.overlayRenderer.canvas = document.getElementById("gl-clean");
            this.overlayRenderer.gl = this.overlayRenderer.canvas.getContext("webgl2");
            if (!this.overlayRenderer.gl) this.overlayRenderer = new window.ClinicalCanvasRenderer("gl-clean");
        }

        // Load images from URLs using DicomLoader
        try {
            const loader = new window.ClinicalDicomLoader();
            if (origSrc) {
                const origImg = await loader.loadImagePixels(origSrc);
                if (origImg && this.origRenderer) {
                    this.origRenderer.loadImageTexture(origImg);
                }
            }
            if (overlaySrc) {
                const overlayImg = await loader.loadImagePixels(overlaySrc);
                if (overlayImg && this.overlayRenderer) {
                    this.overlayRenderer.loadImageTexture(overlayImg);
                }
            }
            this.scheduleRender();
        } catch (err) {
            console.error("Failed to load images:", err);
            throw new Error(`Image loading failed: ${err.message}`);
        }
    }

    setWindowLevel(ww, wc) {
        if (this.origRenderer && this.origRenderer.setWindowLevel) {
            this.origRenderer.setWindowLevel(ww, wc);
        }
        if (this.overlayRenderer && this.overlayRenderer.setWindowLevel) {
            this.overlayRenderer.setWindowLevel(ww, wc);
        }
        this.scheduleRender();
    }

    // --- Interaction Pipeline (Pointer Events) ---
    _initEvents() {
        if (!this.container) return;

        // Use passive listeners for wheel to prevent main-thread jank
        this.container.addEventListener("wheel", this._handleWheel.bind(this), { passive: false });
        this.container.addEventListener("pointerdown", this._handlePointerDown.bind(this));

        // Window level events binding global to container for smooth drags
        window.addEventListener("pointermove", this._handlePointerMove.bind(this), { passive: true });
        window.addEventListener("pointerup", this._handlePointerUp.bind(this));
    }

    _handleWheel(e) {
        if (window.activeClinicalTool !== 'pan-zoom') return;
        e.preventDefault();

        // Max-ping: math operations done inline, DOM updates deferred to rAF
        const zoomFactor = 1.05;
        const oldScale = this.scale;

        if (e.deltaY < 0) this.scale *= zoomFactor;
        else this.scale /= zoomFactor;

        // Clamp
        this.scale = Math.max(0.1, Math.min(this.scale, 20.0));

        // Pan to cursor math
        const rect = this.container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left - (rect.width / 2);
        const mouseY = e.clientY - rect.top - (rect.height / 2);

        this.translateX -= mouseX * (this.scale / oldScale - 1);
        this.translateY -= mouseY * (this.scale / oldScale - 1);

        this._updateReadouts();
        this.scheduleRender();
    }

    _handlePointerDown(e) {
        // Middle click (button 1) is always pan. Left click depends on tool.
        if (e.button === 1 || window.activeClinicalTool === 'pan-zoom') {
            this.isDragging = true;
            this.lastMouse = { x: e.clientX, y: e.clientY };
            this.container.setPointerCapture(e.pointerId);
        }
    }

    _handlePointerMove(e) {
        // Coalesced pointer events via system, we just math and request frame
        if (!this.isDragging) return;

        const dx = e.clientX - this.lastMouse.x;
        const dy = e.clientY - this.lastMouse.y;

        this.translateX += dx;
        this.translateY += dy;

        this.lastMouse = { x: e.clientX, y: e.clientY };
        this.scheduleRender();
    }

    _handlePointerUp(e) {
        this.isDragging = false;
        try { this.container.releasePointerCapture(e.pointerId); } catch (err) { }
    }

    _updateReadouts() {
        const zoomEl = document.getElementById("readout-zoom");
        if (zoomEl) zoomEl.textContent = `Zoom: ${Math.round(this.scale * 100)}%`;
    }

    // --- Render Loop (rAF) ---
    scheduleRender() {
        if (!this._renderPending) {
            this._renderPending = true;
            requestAnimationFrame(this._boundRenderLoop);
        }
    }

    _renderLoop() {
        this._renderPending = false;

        // 1. Sync matrices to renderers
        if (this.origRenderer && this.origRenderer.setTransform) {
            this.origRenderer.setTransform(this.scale, this.translateX, this.translateY);
            this.origRenderer.render();
        }
        if (this.overlayRenderer && this.overlayRenderer.setTransform) {
            this.overlayRenderer.setTransform(this.scale, this.translateX, this.translateY);
            this.overlayRenderer.render();
        }

        // 2. Dispatch custom event for SVG layer (Measurement tools) to sync its internal scale
        if (this.container) {
            this.container.dispatchEvent(new CustomEvent('view-transform-changed', {
                detail: { scale: this.scale, tx: this.translateX, ty: this.translateY }
            }));
        }
    }
}

// Bootstrap
window.addEventListener("app-ready", () => {
    window.rendererController = new RendererController();
    // Expose as viewerController for legacy bindings if any exist
    window.viewerController = window.rendererController;
});
