// cine-player.js
// Handles High-FPS multi-frame WebGL playback.

class CinePlayer {
    constructor(viewerController) {
        this.vc = viewerController;
        this.frames = []; // Array of URLs or Textures
        this.currentFrameIdx = 0;
        this.fps = 30; // 30 FPS Ultrasound standard
        this.isPlaying = false;
        this.loop = true;

        this.animationTimer = null;
        this.lastFrameTime = 0;
    }

    loadFrames(urls) {
        this.frames = urls;
        this.currentFrameIdx = 0;
        this.renderFrame();
    }

    play() {
        if (this.frames.length <= 1 || this.isPlaying) return;
        this.isPlaying = true;
        this.lastFrameTime = performance.now();
        requestAnimationFrame(this.tick.bind(this));
    }

    pause() {
        this.isPlaying = false;
    }

    toggle() {
        if (this.isPlaying) this.pause();
        else this.play();
    }

    setFPS(fps) {
        this.fps = fps;
    }

    next() {
        this.currentFrameIdx++;
        if (this.currentFrameIdx >= this.frames.length) {
            this.currentFrameIdx = this.loop ? 0 : this.frames.length - 1;
            if (!this.loop) this.pause();
        }
        this.renderFrame();
    }

    prev() {
        this.currentFrameIdx--;
        if (this.currentFrameIdx < 0) {
            this.currentFrameIdx = this.loop ? this.frames.length - 1 : 0;
        }
        this.renderFrame();
    }

    tick(time) {
        if (!this.isPlaying) return;

        const interval = 1000 / this.fps;
        const delta = time - this.lastFrameTime;

        if (delta > interval) {
            this.next();
            this.lastFrameTime = time - (delta % interval); // Account for drift
        }

        requestAnimationFrame(this.tick.bind(this));
    }

    renderFrame() {
        if (!this.frames || this.frames.length === 0) return;
        const url = this.frames[this.currentFrameIdx];

        // In a real WebGL PACS, you preload Textures onto the GPU and just swap the ID.
        // For the stub UI Controller bridge, we call the async loader.
        this.vc.loadImages(url, null); // Render Original only during Cine for performance

        // Update UI Text if available
        const fpsTxt = document.getElementById("cine-fps-readout");
        const playBtn = document.getElementById("btn-cine-play");

        if (fpsTxt) fpsTxt.textContent = `Frame ${this.currentFrameIdx + 1}/${this.frames.length}`;
        if (playBtn) playBtn.textContent = this.isPlaying ? "⏸" : "▶";
    }
}

window.CinePlayer = CinePlayer;
