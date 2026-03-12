// CSS
import './css/viewer.css';

// HTML Partials (Vite ?raw loader)
import headerHtml from './components/header.html?raw';
import sidebarHtml from './components/sidebar.html?raw';
import toolbarHtml from './components/toolbar.html?raw';
import viewerHtml from './components/viewer.html?raw';
import measurementHtml from './components/measurement-panel.html?raw';
import metadataHtml from './components/metadata-panel.html?raw';
import modalHtml from './components/modal.html?raw';

// JS Modules
import './js/renderer-canvas-fallback.js';
import './js/renderer-webgl.js';
import './js/dicom-loader.js';
import './js/window-level.js';
import './js/measurement-tools.js';
import './js/cine-player.js';
import './js/comparison-slider.js';
import './js/renderer-controller.js';
import './js/dialog-manager.js';
import './js/ui-controller.js';

// DOM Injection
function inject(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
}

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
    inject('app-header', headerHtml);
    inject('app-sidebar', sidebarHtml);
    inject('app-toolbar', toolbarHtml);
    inject('app-viewer', viewerHtml);
    inject('app-measurement-panel', measurementHtml);
    inject('app-metadata-drawer', metadataHtml);
    inject('app-dialog-modal', modalHtml);

    window.dispatchEvent(new Event('app-ready'));
});
