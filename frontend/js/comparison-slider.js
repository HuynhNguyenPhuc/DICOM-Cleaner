// frontend/js/comparison-slider.js
// Split-screen comparison slider with keyboard, touch, and ARIA support.

window.addEventListener("app-ready", () => {
    const container = document.getElementById("comp-viewer");
    const clipper = document.getElementById("overlay-clipper");
    const handle = document.getElementById("viewer-handle");
    const ariaOut = document.getElementById("aria-status");

    if (!container || !handle || !clipper) return;

    let active = false;
    let pct = 50;
    let announceTimer = null;

    function update(p) {
        pct = Math.max(0, Math.min(100, p));
        // GPU-only: no layout thrashing
        clipper.style.clipPath = `polygon(${pct}% 0, 100% 0, 100% 100%, ${pct}% 100%)`;
        handle.style.left = `${pct}%`;
        handle.setAttribute("aria-valuenow", Math.round(pct));

        // Debounced ARIA announcement
        clearTimeout(announceTimer);
        announceTimer = setTimeout(() => {
            if (ariaOut) ariaOut.textContent = `Comparison slider: ${Math.round(pct)} percent`;
        }, 300);
    }

    // Pointer events
    handle.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 && e.pointerType === "mouse") return;
        active = true;
        handle.setPointerCapture(e.pointerId);
        e.stopPropagation();
    });

    window.addEventListener("pointermove", (e) => {
        if (!active) return;
        const rect = container.getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        requestAnimationFrame(() => update((x / rect.width) * 100));
    }, { passive: true });

    window.addEventListener("pointerup", () => { active = false; });

    // Keyboard
    handle.addEventListener("keydown", (e) => {
        let next = pct;
        switch (e.key) {
            case "ArrowLeft": next -= 5; break;
            case "ArrowRight": next += 5; break;
            case "PageDown": next -= 10; break;
            case "PageUp": next += 10; break;
            case "Home": next = 0; break;
            case "End": next = 100; break;
            default: return;
        }
        e.preventDefault();
        update(next);
    });

    update(50);
    window.comparisonSlider = { update, reset: () => update(50) };
});
