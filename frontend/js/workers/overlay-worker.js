// frontend/js/workers/overlay-worker.js
// Dedicated WebWorker for offloading heavy pixel blending or pseudo-coloring tasks.
// Prevents main-thread stuttering ("max-ping" architecture constraint).

self.onmessage = async function (e) {
    const { type, payload } = e.data;

    switch (type) {
        case 'INIT':
            self.postMessage({ type: 'READY', status: 'Worker Initialized' });
            break;

        case 'BLEND_MASKS':
            // Payload contains: origBuffer (ArrayBuffer), maskBuffer (ArrayBuffer), width, height
            // Simulates an expensive CPU blending operation
            try {
                const blendedBuffer = await processHeavyBlend(
                    payload.origBuffer,
                    payload.maskBuffer,
                    payload.width,
                    payload.height
                );

                self.postMessage({
                    type: 'BLENDED_FRAME',
                    buffer: blendedBuffer
                }, [blendedBuffer]); // Transferrable object (0-copy)
            } catch (err) {
                self.postMessage({ type: 'ERROR', message: err.message });
            }
            break;

        default:
            console.warn("Worker received unknown message type:", type);
    }
};

/**
 * CPU-intensive alpha blending logic (Max-Ping simulation stub)
 */
async function processHeavyBlend(orig, mask, w, h) {
    const origView = new Uint8ClampedArray(orig);
    const maskView = new Uint8ClampedArray(mask);
    const destView = new Uint8ClampedArray(w * h * 4);

    // Simulate complex math loop
    for (let i = 0; i < origView.length; i += 4) {
        // Simple alpha over composite
        const alpha = maskView[i + 3] / 255.0;
        destView[i] = (maskView[i] * alpha) + (origView[i] * (1 - alpha));
        destView[i + 1] = (maskView[i + 1] * alpha) + (origView[i + 1] * (1 - alpha));
        destView[i + 2] = (maskView[i + 2] * alpha) + (origView[i + 2] * (1 - alpha));
        destView[i + 3] = 255;
    }

    return destView.buffer;
}
