// renderer-canvas-fallback.js
// High-performance Canvas API fallback for legacy browsers without WebGL.
// Uses `setTransform` for exact matrix translations matching the GPU pipeline.

class ClinicalCanvasRenderer {
    constructor(canvasElement) {
        this.canvas = typeof canvasElement === 'string' ? document.getElementById(canvasElement) : canvasElement;
        this.ctx = this.canvas.getContext('2d');

        this.scale = 1.0;
        this.translateX = 0;
        this.translateY = 0;

        this.windowWidth = 256;
        this.windowCenter = 127;

        this.image = null;
    }

    loadImageTexture(imageHTML) {
        this.image = imageHTML;
        this.render();
    }

    setWindowLevel(ww, wc) {
        this.windowWidth = ww;
        this.windowCenter = wc;
        this.render();
    }

    setTransform(scale, tx, ty) {
        this.scale = scale;
        this.translateX = tx;
        this.translateY = ty;
        this.render();
    }

    resizeCanvasToDisplaySize() {
        const displayWidth = this.canvas.clientWidth;
        const displayHeight = this.canvas.clientHeight;
        if (this.canvas.width !== displayWidth || this.canvas.height !== displayHeight) {
            this.canvas.width = displayWidth;
            this.canvas.height = displayHeight;
            return true;
        }
        return false;
    }

    render() {
        if (!this.ctx || !this.image) return;

        this.resizeCanvasToDisplaySize();
        const cw = this.canvas.width;
        const ch = this.canvas.height;

        // 1. Clear State
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, cw, ch);

        // 2. pseudo Window/Level using CSS filters internally on the canvas context
        // Actual formula: contrast = 255/ww, brightness = (ww/2 - wc) / ww
        const contrast = 256 / Math.max(1, this.windowWidth);
        const brightness = 1 + ((128 - this.windowCenter) / Math.max(1, this.windowWidth));
        this.ctx.filter = `contrast(${contrast}) brightness(${brightness})`;

        // 3. Calculate "object-fit: contain" dimensions mathematically
        const imgAspect = this.image.naturalWidth / this.image.naturalHeight;
        const contAspect = cw / ch;
        let renderWidth, renderHeight, offsetX = 0, offsetY = 0;

        if (imgAspect > contAspect) {
            renderWidth = cw;
            renderHeight = cw / imgAspect;
            offsetY = (ch - renderHeight) / 2;
        } else {
            renderHeight = ch;
            renderWidth = ch * imgAspect;
            offsetX = (cw - renderWidth) / 2;
        }

        // 4. Apply Pan / Zoom Matrix
        // Translate to center, apply scale and user translation, then translate back
        const cx = cw / 2;
        const cy = ch / 2;
        this.ctx.translate(cx + this.translateX, cy + this.translateY);
        this.ctx.scale(this.scale, this.scale);
        this.ctx.translate(-cx, -cy);

        // 5. Draw
        this.ctx.drawImage(this.image, offsetX, offsetY, renderWidth, renderHeight);

        // Reset filter for other native rendering tasks outside this class
        this.ctx.filter = "none";
    }
}

window.ClinicalCanvasRenderer = ClinicalCanvasRenderer;
