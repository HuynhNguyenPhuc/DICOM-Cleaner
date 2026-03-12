// viewer-controller.js
// The central orchestrator binding the DOM to the renderers.
// Handles the synchronized dual-viewer logic and matrix state.

class ViewerController {
    constructor() {
        this.container = document.getElementById("comp-viewer");

        // Renderers Configuration
        this.origCanvas = document.getElementById("gl-orig");
        this.cleanCanvas = document.getElementById("gl-clean");

        if (!this.origCanvas || !this.cleanCanvas) return;

        // Try WebGL first, fallback to Canvas2D
        this.origRenderer = this.initRenderer(this.origCanvas);
        this.cleanRenderer = this.initRenderer(this.cleanCanvas);

        // Core Matrix State
        this.scale = 1.0;
        this.translateX = 0;
        this.translateY = 0;

        // Window Level State
        this.ww = 256;
        this.wc = 127;

        this.initPanZoom();
    }

    initRenderer(canvas) {
        // Attempt WebGL, if fails, fallback to Canvas
        let r = new window.ClinicalWebGLRenderer(canvas);
        if (!r.gl) {
            console.log("Falling back to Canvas renderer.");
            r = new window.ClinicalCanvasRenderer(canvas);
        }
        return r;
    }

    async loadImages(origUrl, cleanUrl) {
        const loader = new window.ClinicalDicomLoader();

        const pOrig = loader.loadImagePixels(origUrl);
        const pClean = cleanUrl ? loader.loadImagePixels(cleanUrl) : Promise.resolve(null);

        const [imgOrig, imgClean] = await Promise.all([pOrig, pClean]);

        if (imgOrig) this.origRenderer.loadImageTexture(imgOrig);
        if (imgClean) this.cleanRenderer.loadImageTexture(imgClean);

        this.resetView();
    }

    setWindowLevel(ww, wc) {
        this.ww = ww;
        this.wc = wc;
        this.origRenderer.setWindowLevel(ww, wc);
        this.cleanRenderer.setWindowLevel(ww, wc);
    }

    applyTransform() {
        this.origRenderer.setTransform(this.scale, this.translateX, this.translateY);
        this.cleanRenderer.setTransform(this.scale, this.translateX, this.translateY);

        // Dispatch event for measurement SVG sync
        this.container.dispatchEvent(new CustomEvent('view-transform-changed'));
    }

    resetView() {
        this.scale = 1.0;
        this.translateX = 0;
        this.translateY = 0;
        this.applyTransform();
    }

    initPanZoom() {
        let isPanning = false;
        let startX, startY;

        // Wheel Zoom (Centered on pointer)
        this.container.addEventListener("wheel", (e) => {
            if (window.activeClinicalTool !== "pan-zoom") return;
            e.preventDefault();

            const zoomFactor = 1.05;
            const dir = e.deltaY < 0 ? 1 : -1;

            const prevScale = this.scale;
            this.scale = dir > 0 ? this.scale * zoomFactor : this.scale / zoomFactor;
            this.scale = Math.max(0.1, Math.min(this.scale, 10.0)); // Clamp

            // Calculate translation to keep zoom centered on mouse
            const rect = this.container.getBoundingClientRect();
            const mouseX = e.clientX - rect.left - rect.width / 2;
            const mouseY = e.clientY - rect.top - rect.height / 2;

            this.translateX = mouseX - (mouseX - this.translateX) * (this.scale / prevScale);
            this.translateY = mouseY - (mouseY - this.translateY) * (this.scale / prevScale);

            this.applyTransform();
        });

        // Pointer Pan
        this.container.addEventListener("pointerdown", (e) => {
            if (window.activeClinicalTool !== "pan-zoom") return;
            if (e.target.id === "viewer-handle" || e.target.closest(".viewer-handle")) return; // Don't block comparison slider

            isPanning = true;
            startX = e.clientX - this.translateX;
            startY = e.clientY - this.translateY;
            this.container.setPointerCapture(e.pointerId);
        });

        this.container.addEventListener("pointermove", (e) => {
            if (!isPanning || window.activeClinicalTool !== "pan-zoom") return;
            this.translateX = e.clientX - startX;
            this.translateY = e.clientY - startY;
            this.applyTransform();
        });

        this.container.addEventListener("pointerup", (e) => {
            if (!isPanning) return;
            isPanning = false;
            this.container.releasePointerCapture(e.pointerId);
        });
    }
}

window.ViewerController = ViewerController;
