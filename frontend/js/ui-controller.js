// frontend/js/ui-controller.js
// High-level application orchestrator: tool activation, file upload, API fetch, export flow.

window.addEventListener("app-ready", initUI);

function initUI() {
    // ─── DOM CACHE ─────────────────────────────────────────────────────────
    const uploadInput = document.getElementById("dicom-upload");
    const fileDisplay = document.getElementById("file-name-display");
    const sensSlider = document.getElementById("sensitivity-slider");
    const qualSelect = document.getElementById("quality-select");
    const btnPreview = document.getElementById("btn-preview");
    const btnClean = document.getElementById("btn-clean");
    const statusPanel = document.getElementById("status-panel");
    const ariaStatus = document.getElementById("aria-status");
    const emptyState = document.getElementById("viewer-empty-state");

    // Export flow
    const exportActions = document.getElementById("export-actions");
    const chkVerify = document.getElementById("chk-verify");
    const btnCommit = document.getElementById("btn-commit-clean");
    const btnCancel = document.getElementById("btn-cancel-clean");
    const downloadPanel = document.getElementById("download-actions");

    // Toolbar & Drawer
    const toolBtns = document.querySelectorAll(".tool-btn[data-tool]");
    const drawerToggle = document.getElementById("btn-toggle-drawer");
    const drawer = document.getElementById("app-drawer");

    // Measurement wiring
    const btnClear = document.getElementById("btn-clear-measurements");
    const btnToggleMm = document.getElementById("btn-toggle-measurements");
    const btnExport = document.getElementById("btn-export-measurements");
    const btnUndo = document.getElementById("btn-undo-measurement");

    // ─── STATE ──────────────────────────────────────────────────────────────
    let currentFile = null;
    let undoStack = [];
    const API_BASE = "/api";

    // ─── HELPERS ────────────────────────────────────────────────────────────
    function setStatus(msg, isError = false) {
        if (!statusPanel) return;
        statusPanel.style.display = "block";
        
        if (isError) {
            statusPanel.innerHTML = `
                <div class="alert-block">
                    <button class="alert-close" onclick="this.parentElement.style.display='none'" aria-label="Close alert">&times;</button>
                    <div class="alert-title">System Error</div>
                    <div>${msg}</div>
                </div>
            `;
            statusPanel.style.color = ""; // Managed by CSS
        } else {
            statusPanel.innerHTML = msg;
            statusPanel.style.color = "var(--text-muted)";
        }
        
        if (ariaStatus) {
            ariaStatus.textContent = "";
            setTimeout(() => ariaStatus.textContent = msg, 50);
        }
    }

    function setLoading(v) {
        if (btnPreview) btnPreview.disabled = v || !currentFile;
        if (btnClean) btnClean.disabled = v;
        document.body.style.cursor = v ? "wait" : "";
    }

    // ─── TOOL ACTIVATION ───────────────────────────────────────────────────
    window.activeClinicalTool = "pan-zoom";

    function activateTool(name) {
        window.activeClinicalTool = name;
        toolBtns.forEach(btn => {
            const active = btn.dataset.tool === name;
            btn.setAttribute("aria-pressed", active);
            btn.classList.toggle("active", active);
        });
    }

    toolBtns.forEach(btn => {
        btn.addEventListener("click", () => activateTool(btn.dataset.tool));
    });

    // Keyboard shortcuts
    window.addEventListener("keydown", (e) => {
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
        const map = { p: "pan-zoom", w: "wl", d: "length", a: "angle", r: "roi" };
        if (map[e.key]) { e.preventDefault(); activateTool(map[e.key]); }
        if (e.code === "Space") { e.preventDefault(); document.getElementById("btn-cine-play")?.click(); }
    });

    // ─── DRAWER TOGGLE ─────────────────────────────────────────────────────
    if (drawerToggle && drawer) {
        drawerToggle.addEventListener("click", () => {
            const collapsed = drawer.classList.toggle("collapsed");
            drawerToggle.setAttribute("aria-expanded", !collapsed);
        });

        // Session restore
        if (window.CONFIG?.FEATURES?.session_restore && sessionStorage.getItem("drawer") === "collapsed") {
            drawer.classList.add("collapsed");
            drawerToggle.setAttribute("aria-expanded", "false");
        }
        drawer.addEventListener("transitionend", () => {
            if (window.CONFIG?.FEATURES?.session_restore) {
                sessionStorage.setItem("drawer", drawer.classList.contains("collapsed") ? "collapsed" : "open");
            }
        });
    }

    // ─── MEASUREMENT WIRING ────────────────────────────────────────────────
    if (btnClear) btnClear.addEventListener("click", async () => {
        if (window.dialogManager) {
            const ok = await window.dialogManager.confirm(
                "Clear All Measurements",
                "Delete all measurements? This cannot be undone.",
                "Delete All"
            );
            if (!ok) return;
        }
        window.measurementManager?.clear?.();
    });

    if (btnToggleMm) btnToggleMm.addEventListener("click", () => window.measurementManager?.toggleVisibility?.());
    if (btnExport) btnExport.addEventListener("click", () => window.measurementManager?.exportJSON?.());
    if (btnUndo) btnUndo.addEventListener("click", () => window.measurementManager?.undo?.());

    // ─── FILE UPLOAD ───────────────────────────────────────────────────────
    if (uploadInput) {
        uploadInput.addEventListener("change", (e) => {
            if (e.target.files.length === 0) return;
            currentFile = e.target.files[0];
            if (fileDisplay) fileDisplay.textContent = currentFile.name;
            if (btnPreview) btnPreview.disabled = false;
            if (btnClean) btnClean.disabled = true;
            if (emptyState) emptyState.style.display = "flex";
            if (exportActions) exportActions.style.display = "none";
            if (statusPanel) statusPanel.style.display = "none";
            undoStack = [];
        });
    }

    // ─── PREVIEW ───────────────────────────────────────────────────────────
    if (btnPreview) {
        btnPreview.addEventListener("click", async () => {
            if (!currentFile) return;
            setLoading(true);
            setStatus("⏳ Generating preview…");

            const fd = new FormData();
            fd.append("file", currentFile);
            if (sensSlider) fd.append("sensitivity", sensSlider.value);
            if (qualSelect) fd.append("quality", qualSelect.value);

            // Optimistic: hide empty state now
            if (emptyState) emptyState.style.display = "none";

            try {
                const res = await fetch(`${API_BASE}/preview`, { method: "POST", body: fd });
                if (!res.ok) throw new Error(await res.text());
                const data = await res.json();

                if (window.rendererController) {
                    await window.rendererController.loadImages(data.orig_url, data.overlay_url);
                }

                setStatus(data.status || "Preview ready.");
                if (btnClean) btnClean.disabled = false;
                if (exportActions) exportActions.style.display = "none";
                undoStack = [{ src: data.overlay_url, state: "preview" }];
            } catch (err) {
                // Custom override for canvas context error
                const errMsg = err.message.includes('getContext') 
                    ? "⚠️ System error preventing canvas render (Code: ERR_RENDER). Please refresh or report issue."
                    : `❌ ${err.message}`;
                setStatus(errMsg, true);
                if (emptyState) emptyState.style.display = "flex";
            } finally {
                setLoading(false);
            }
        });
    }

    // ─── CLEAN INITIATE ────────────────────────────────────────────────────
    if (btnClean) {
        btnClean.addEventListener("click", () => {
            if (undoStack.length === 0) return;
            if (exportActions) exportActions.style.display = "block";
            if (chkVerify) chkVerify.checked = false;
            if (btnCommit) btnCommit.disabled = true;
            if (downloadPanel) downloadPanel.style.display = "none";
        });
    }

    if (chkVerify) chkVerify.addEventListener("change", (e) => { if (btnCommit) btnCommit.disabled = !e.target.checked; });

    if (btnCancel) {
        btnCancel.addEventListener("click", async () => {
            if (window.dialogManager) {
                const ok = await window.dialogManager.confirm("Revert?", "Discard overlay and revert to initial preview?", "Discard");
                if (!ok) return;
            }
            if (exportActions) exportActions.style.display = "none";
            if (downloadPanel) downloadPanel.style.display = "none";
            if (undoStack.length > 0 && window.rendererController) {
                try {
                    await window.rendererController.loadImages(undoStack[0].src, undoStack[0].src);
                    setStatus("↺ Reverted to preview.");
                } catch (err) {
                    setStatus(`❌ Failed to revert: ${err.message}`, true);
                }
            }
        });
    }

    // ─── COMMIT CLEAN ──────────────────────────────────────────────────────
    if (btnCommit) {
        btnCommit.addEventListener("click", async () => {
            if (chkVerify && !chkVerify.checked) return;
            if (!currentFile) return;

            setLoading(true);
            setStatus("🚧 Processing clinical inpainting…");

            const fd = new FormData();
            fd.append("file", currentFile);
            if (sensSlider) fd.append("sensitivity", sensSlider.value);
            fd.append("quality", "Precise");

            try {
                const res = await fetch(`${API_BASE}/clean`, { method: "POST", body: fd });
                if (!res.ok) throw new Error(await res.text());
                const data = await res.json();

                if (window.rendererController) {
                    await window.rendererController.loadImages(data.orig_url, data.cleaned_url);
                }

                setStatus("✅ Export ready.");
                if (exportActions) exportActions.style.display = "block";
                if (downloadPanel) downloadPanel.style.display = "flex";

                const dlPng = document.getElementById("btn-download-png");
                if (dlPng) {
                    dlPng.onclick = () => {
                        const a = document.createElement("a");
                        a.href = data.cleaned_url;
                        a.download = currentFile.name.replace(/\.\w+$/, "_cleaned.png");
                        a.click();
                    };
                }
                
                const dlDcm = document.getElementById("btn-download-dcm");
                if (dlDcm) {
                    dlDcm.onclick = () => {
                        const a = document.createElement("a");
                        a.href = data.orig_url;
                        a.download = currentFile.name.replace(/\.\w+$/, "_cleaned.dcm");
                        a.click();
                    };
                }
            } catch (err) {
                setStatus(`❌ ${err.message}`, true);
            } finally {
                setLoading(false);
            }
        });
    }
}
