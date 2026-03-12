# Integration Guide: Max-Ping PACS Evolution

This document outlines the steps to integrate, configure, and test the Phase 5 "Max-Ping" frontend refactor for the Ultrasound Annotation Cleaner.

## Prerequisites
- Node.js > 18.x
- Vite 5+

## Quick Start
1. Ensure the Python FastAPI backend is running on `127.0.0.1:8000`.
2. Navigate to the `frontend/` directory.
3. Install dependencies (if not already done):
   ```bash
   npm install
   ```
4. Start the Vite dev server:
   ```bash
   npm run dev
   ```
5. The UI will be available at `http://localhost:5173`. The proxy will correctly route API requests.

## Feature Flags Configuration
The application behavior can be tuned globally via the `window.CONFIG.FEATURES` mapping found in `<head>` of `index.html`.

* `render_worker` (boolean): Default `true`. If true, attempts to initialize `overlay-worker.js` for heavy ArrayBuffer blending calculations, freeing the main thread. Fallback is synchronous CPU math in `renderer-controller.js`.
* `advanced_measurements` (boolean): Default `true`. Enables the discrete Undo Stack, UUID tracking, and JSON Serialization per measurement vector.
* `session_restore` (boolean): Default `true`. Automatically remembers the Open/Collapsed state of the right-hand Metadata Drawer across F5 reloads using `sessionStorage` (WARNING: Do NOT store PHI in SessionStorage).

To disable a feature (e.g. for low-memory environments), edit `index.html`:
```html
<script>
window.CONFIG = {
    FEATURES: {
        render_worker: false, 
        advanced_measurements: true,
        session_restore: false
    }
};
</script>
```

## Security & Privacy (PHI Handling)
- **Local Network Only**: All API calls natively point to `/api`, which Vite proxies to localhost. There are zero external CDN dependencies calling out to the internet.
- **Data Export Redaction**: The JSON Measurement Export dumps coordinate math ONLY. No patient metadata from the DICOM Header is merged into the JSON payload by default.

## Rollback Procedure
If the new WebWorker or Dialog system causes unexpected regression:
1. Revert `window.dialogManager` to standard `window.confirm()` stubs inside `ui-controller.js`.
2. Disable the `render_worker` feature flag.
3. Fallback `ClinicalWebGLRenderer` to `ClinicalCanvasRenderer` globally if specific GPU drivers fail.
