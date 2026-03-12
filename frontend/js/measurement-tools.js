// frontend/js/measurement-tools.js
// Max-Ping Measurement Tooling
// Handles ROI, Angle, Distance tools, undo stacks, and UUID tracking.

class MeasurementManager {
    constructor(viewerContainer) {
        this.container = viewerContainer;
        this.svg = document.getElementById("measurement-svg");

        this.measurements = []; // State: { id, type, data, domNodes }
        this.undoStack = [];    // For Undo behavior
        this.isVisible = true;
        this.pixelSpacing = [1.0, 1.0];

        // Active Draw State
        this.isDrawing = false;
        this.startP = null;
        this.midP = null;
        this.activeNodes = { line: null, text: null };

        this.initEvents();
    }

    initEvents() {
        if (!this.container) return;

        this.container.addEventListener("pointerdown", (e) => {
            const tool = window.activeClinicalTool;
            if (!['length', 'angle', 'roi'].includes(tool) || e.button !== 0) return;

            const p = this._getInverseCoords(e);

            if (tool === 'angle' && this.isDrawing && !this.midP) {
                this.midP = p; // Click 2
                return;
            }

            this.isDrawing = true;
            this.startP = p;
            this.midP = null;

            // Initialize graphic nodes
            const ns = "http://www.w3.org/2000/svg";
            if (tool === 'length') {
                this.activeNodes.line = document.createElementNS(ns, "line");
            } else if (tool === 'roi') {
                this.activeNodes.line = document.createElementNS(ns, "rect");
                this.activeNodes.line.setAttribute("fill", "rgba(251, 191, 36, 0.15)");
            } else if (tool === 'angle') {
                this.activeNodes.line = document.createElementNS(ns, "polyline");
                this.activeNodes.line.setAttribute("fill", "none");
            }

            // Common attributes
            this.activeNodes.line.setAttribute("stroke", "var(--col-warning)");
            this.activeNodes.line.setAttribute("stroke-width", "2");
            this.activeNodes.text = document.createElementNS(ns, "text");
            this.activeNodes.text.setAttribute("fill", "var(--col-warning)");
            this.activeNodes.text.setAttribute("font-size", "14px");
            this.activeNodes.text.setAttribute("font-family", "var(--font-mono)");
            this.activeNodes.text.setAttribute("font-weight", "bold");
            this.activeNodes.text.style.textShadow = "1px 1px 2px #000";

            this.svg.appendChild(this.activeNodes.line);
            this.svg.appendChild(this.activeNodes.text);

            this.container.setPointerCapture(e.pointerId);
            e.stopPropagation();
        });

        this.container.addEventListener("pointermove", (e) => {
            if (!this.isDrawing || !this.activeNodes.line) return;
            const p = this._getInverseCoords(e);
            const tool = window.activeClinicalTool;

            requestAnimationFrame(() => {
                if (tool === 'length') {
                    this.activeNodes.line.setAttribute("x1", this.startP.x);
                    this.activeNodes.line.setAttribute("y1", this.startP.y);
                    this.activeNodes.line.setAttribute("x2", p.x);
                    this.activeNodes.line.setAttribute("y2", p.y);

                    const dist = Math.sqrt((p.x - this.startP.x) ** 2 + (p.y - this.startP.y) ** 2) * this.pixelSpacing[0];
                    this.activeNodes.text.textContent = `${dist.toFixed(1)} mm`;
                    this.activeNodes.text.setAttribute("x", p.x + 10);
                    this.activeNodes.text.setAttribute("y", p.y + 10);
                }
                else if (tool === 'roi') {
                    const x = Math.min(p.x, this.startP.x);
                    const y = Math.min(p.y, this.startP.y);
                    const w = Math.abs(p.x - this.startP.x);
                    const h = Math.abs(p.y - this.startP.y);
                    this.activeNodes.line.setAttribute("x", x);
                    this.activeNodes.line.setAttribute("y", y);
                    this.activeNodes.line.setAttribute("width", w);
                    this.activeNodes.line.setAttribute("height", h);

                    const area = (w * h * this.pixelSpacing[0] * this.pixelSpacing[1]);
                    this.activeNodes.text.textContent = `${area.toFixed(1)} mm²`;
                    this.activeNodes.text.setAttribute("x", x);
                    this.activeNodes.text.setAttribute("y", y - 10);
                }
                else if (tool === 'angle') {
                    if (!this.midP) {
                        this.activeNodes.line.setAttribute("points", `${this.startP.x},${this.startP.y} ${p.x},${p.y}`);
                    } else {
                        this.activeNodes.line.setAttribute("points", `${this.startP.x},${this.startP.y} ${this.midP.x},${this.midP.y} ${p.x},${p.y}`);
                        // Angle Calc
                        const v1 = { x: this.startP.x - this.midP.x, y: this.startP.y - this.midP.y };
                        const v2 = { x: p.x - this.midP.x, y: p.y - this.midP.y };
                        const dot = v1.x * v2.x + v1.y * v2.y;
                        const mag1 = Math.sqrt(v1.x ** 2 + v1.y ** 2);
                        const mag2 = Math.sqrt(v2.x ** 2 + v2.y ** 2);
                        let angleDeg = (Math.acos(dot / (mag1 * mag2)) * 180 / Math.PI).toFixed(1);
                        if (isNaN(angleDeg)) angleDeg = 0;

                        this.activeNodes.text.textContent = `${angleDeg}°`;
                        this.activeNodes.text.setAttribute("x", this.midP.x + 15);
                        this.activeNodes.text.setAttribute("y", this.midP.y + 15);
                    }
                }
            });
        });

        this.container.addEventListener("pointerup", (e) => {
            const tool = window.activeClinicalTool;
            if (!this.isDrawing) return;

            if (tool === 'angle' && !this.midP) return; // Need 3rd point

            this.isDrawing = false;
            if (this.activeNodes.line && this.activeNodes.text && this.activeNodes.text.textContent) {
                this.addMeasurement(tool.toUpperCase(), this.activeNodes.text.textContent, this.activeNodes);
            }

            // Keep nodes in DOM via the addMeasurement reference, null out local drawing state
            this.activeNodes = { line: null, text: null };
            try { this.container.releasePointerCapture(e.pointerId); } catch (err) { }
        });

        // Sync SVG scale to Renderer Matrix
        this.container.addEventListener('view-transform-changed', (e) => {
            // Apply SVG transform to align with WebGL
            // Note: in a true WebGL + SVG overlay mapped system, you apply the literal CSS transform matrix to the SVG container
            this.svg.style.transform = `translate(${e.detail.tx}px, ${e.detail.ty}px) scale(${e.detail.scale})`;

            // Defeat stroke-width scaling to keep UI crisp regardless of zoom
            const inverseScale = 1.0 / e.detail.scale;
            this.svg.querySelectorAll('*').forEach(node => {
                if (node.tagName === 'line' || node.tagName === 'rect' || node.tagName === 'polyline') {
                    node.setAttribute('stroke-width', 2 * inverseScale);
                } else if (node.tagName === 'text') {
                    node.style.transform = `scale(${inverseScale})`; // Requires manual mapping logic based on origin, simplified here.
                }
            });
        });
    }

    _getInverseCoords(e) {
        // True image pixel coordinate
        const rect = this.container.getBoundingClientRect();
        let mouseX = e.clientX - rect.left;
        let mouseY = e.clientY - rect.top;

        if (window.rendererController) {
            const s = window.rendererController.scale;
            const tx = window.rendererController.translateX;
            const ty = window.rendererController.translateY;
            const cx = rect.width / 2;
            const cy = rect.height / 2;
            return {
                x: ((mouseX - cx - tx) / s) + cx,
                y: ((mouseY - cy - ty) / s) + cy
            };
        }
        return { x: mouseX, y: mouseY };
    }

    // --- State API ---
    addMeasurement(type, value, nodes) {
        const id = 'm-' + crypto.randomUUID().split('-')[0];
        const record = { id, type, value, nodes };

        this.measurements.push(record);
        this.undoStack.push({ action: 'add', record });
        this.renderList();
    }

    deleteMeasurement(id) {
        const idx = this.measurements.findIndex(m => m.id === id);
        if (idx > -1) {
            const m = this.measurements[idx];
            if (m.nodes.line) m.nodes.line.remove();
            if (m.nodes.text) m.nodes.text.remove();

            this.undoStack.push({ action: 'delete', record: m, index: idx });
            this.measurements.splice(idx, 1);
            this.renderList();
        }
    }

    undo() {
        if (this.undoStack.length === 0) return;
        const last = this.undoStack.pop();

        if (last.action === 'add') {
            // Undo an add -> remove it
            const idx = this.measurements.findIndex(m => m.id === last.record.id);
            if (idx > -1) {
                this.measurements[idx].nodes.line.remove();
                this.measurements[idx].nodes.text.remove();
                this.measurements.splice(idx, 1);
            }
        } else if (last.action === 'delete') {
            // Undo a delete -> restore it
            this.svg.appendChild(last.record.nodes.line);
            this.svg.appendChild(last.record.nodes.text);
            this.measurements.splice(last.index, 0, last.record);
        }
        this.renderList();
    }

    clear() {
        if (this.measurements.length === 0) return;
        this.undoStack.push({ action: 'clear', previous: [...this.measurements] });
        this.measurements = [];
        this.svg.innerHTML = '';
        this.renderList();
    }

    toggleVisibility() {
        this.isVisible = !this.isVisible;
        this.svg.style.display = this.isVisible ? 'block' : 'none';
    }

    exportJSON() {
        const payload = this.measurements.map(m => ({ id: m.id, type: m.type, value: m.value }));
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `measurements_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    renderList() {
        const list = document.getElementById("measurements-list");
        const empty = document.getElementById("measurements-empty");
        if (!list) return;

        if (this.measurements.length === 0) {
            if (empty) empty.style.display = 'block';
            list.querySelectorAll('.measurement-chip').forEach(c => c.remove());
            return;
        }

        if (empty) empty.style.display = 'none';

        // Keep existing chips, add new, remove old (React-lite approach)
        const currentHtml = this.measurements.map(m => `
            <div class="measurement-chip" data-id="${m.id}" style="background:var(--bg-surface); border:1px solid var(--bg-border); padding:0.5rem; border-radius:4px; display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; gap:0.5rem; align-items:baseline;">
                    <span style="color:var(--text-muted); font-size:10px; font-weight:600;">${m.type}</span>
                    <span style="color:var(--text-main); font-family:var(--font-mono); font-size:12px;">${m.value}</span>
                </div>
                <button class="btn-delete" data-id="${m.id}" aria-label="Delete Measurement" style="background:none; border:none; color:var(--col-error); cursor:pointer; font-size:12px; padding:0.25rem;">✕</button>
            </div>
        `).join('');

        // Avoid innerHTML thrashing on inputs, replace only chip container
        // Since we are pure vanilla, innerHTML is fine for a small list
        list.querySelectorAll('.measurement-chip').forEach(c => c.remove());
        list.insertAdjacentHTML('beforeend', currentHtml);

        list.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => this.deleteMeasurement(e.target.dataset.id));
        });
    }
}

// Bootstrap
window.addEventListener("app-ready", () => {
    if (window.CONFIG?.FEATURES?.advanced_measurements) {
        window.measurementManager = new MeasurementManager(document.getElementById("comp-viewer"));
    }
});
