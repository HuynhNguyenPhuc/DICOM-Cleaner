// renderer-webgl.js
// High-performance WebGL 2D renderer for DICOM 16-bit textures.
// Supports GPU-accelerated Window/Leveling and Matrix Transformations.

class ClinicalWebGLRenderer {
    constructor(canvasElement) {
        this.canvas = typeof canvasElement === 'string' ? document.getElementById(canvasElement) : canvasElement;

        // Attempt WebGL2 first for advanced texture formats, fallback to WebGL1
        this.gl = this.canvas.getContext('webgl2') || this.canvas.getContext('webgl');
        if (!this.gl) {
            console.error("WebGL not supported.");
            return;
        }

        // --- Defaults ---
        this.scale = 1.0;
        this.translateX = 0;
        this.translateY = 0;
        this.windowWidth = 256;
        this.windowCenter = 127;

        this.textureWidth = 0;
        this.textureHeight = 0;

        // --- Shaders ---
        this.initShaders();
        this.initBuffers();
        this.initUniforms();
    }

    initShaders() {
        const gl = this.gl;

        const vsSource = `
            attribute vec2 a_position;
            attribute vec2 a_texCoord;
            
            uniform vec2 u_resolution;
            uniform vec2 u_translation;
            uniform vec2 u_scale;
            uniform vec2 u_textureSize;
            uniform vec2 u_containerSize;

            varying vec2 v_texCoord;

            void main() {
                // Calculate aspect ratio preserving dimensions (similar to object-fit: contain)
                float canvasAspect = u_containerSize.x / u_containerSize.y;
                float imgAspect = u_textureSize.x / u_textureSize.y;
                
                vec2 renderSize = u_textureSize;
                if (imgAspect > canvasAspect) {
                    renderSize.x = u_containerSize.x;
                    renderSize.y = u_containerSize.x / imgAspect;
                } else {
                    renderSize.y = u_containerSize.y;
                    renderSize.x = u_containerSize.y * imgAspect;
                }

                // Scale from native pixel coordinates (0-width) to WebGL clip space (-1 to +1)
                // 1. Convert position to absolute pixel position based on image bounds
                vec2 pixelPos = a_position * renderSize;

                // 2. Center the image in the container
                vec2 offset = (u_containerSize - renderSize) / 2.0;
                pixelPos += offset;
                
                // 3. Apply Zoom/Pan (origin at center of screen for zoom)
                vec2 center = u_containerSize / 2.0;
                pixelPos = ((pixelPos - center) * u_scale) + center + u_translation;

                // Convert to WebGL Clip Space (-1.0 to 1.0)
                vec2 clipSpace = (pixelPos / u_containerSize) * 2.0 - 1.0;
                
                // Flip Y because WebGL 0,0 is bottom-left but DOM is top-left
                gl_Position = vec4(clipSpace * vec2(1.0, -1.0), 0.0, 1.0);

                v_texCoord = a_texCoord;
            }
        `;

        // Fragment shader handles Window/Level intensity mapping natively on GPU
        const fsSource = `
            precision mediump float;
            
            // The 16-bit texture is usually sampled as a normalized float (0.0 - 1.0)
            uniform sampler2D u_image;
            uniform float u_windowWidth;
            uniform float u_windowCenter;
            
            varying vec2 v_texCoord;

            void main() {
                // Read exact pixel normalized value
                vec4 texColor = texture2D(u_image, v_texCoord);
                
                // Assuming raw 16-bit data was normalized to 0-1 when uploaded as a texture.
                // Normally DICOM requires multiplying back to intercept/slope, but for this viewer:
                // We map window/level directly over the normalized 0.0-1.0 range,
                // treating WW and WC as relative percentages for simplicity unless real DICOM metadata is provided.
                
                float ww = max(u_windowWidth, 0.001); // Avoid div by 0
                float wc = u_windowCenter;

                // Standard DICOM linear W/L mapping formula:
                // v = ((pixelValue - (wc - 0.5)) / (ww - 1)) + 0.5
                float v = ((texColor.r * 255.0) - (wc - 0.5)) / (ww - 1.0) + 0.5;
                
                // Clamp between 0 (black) and 1 (white)
                float intensity = clamp(v, 0.0, 1.0);
                
                gl_FragColor = vec4(intensity, intensity, intensity, texColor.a);
            }
        `;

        this.program = this.createProgram(vsSource, fsSource);
        gl.useProgram(this.program);
    }

    createProgram(vsSource, fsSource) {
        const gl = this.gl;
        const vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, vsSource);
        gl.compileShader(vs);
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
            console.error("Vertex shader error: " + gl.getShaderInfoLog(vs));
        }

        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, fsSource);
        gl.compileShader(fs);
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
            console.error("Fragment shader error: " + gl.getShaderInfoLog(fs));
        }

        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        return prog;
    }

    initBuffers() {
        const gl = this.gl;
        // Quad geometry (2 triangles forming a square)
        this.positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        // Positions are normalized 0-1 quad. The shader scales them up.
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            0.0, 0.0,
            1.0, 0.0,
            0.0, 1.0,
            0.0, 1.0,
            1.0, 0.0,
            1.0, 1.0,
        ]), gl.STATIC_DRAW);

        this.texCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            0.0, 0.0,
            1.0, 0.0,
            0.0, 1.0,
            0.0, 1.0,
            1.0, 0.0,
            1.0, 1.0,
        ]), gl.STATIC_DRAW);
    }

    initUniforms() {
        const gl = this.gl;
        this.locations = {
            position: gl.getAttribLocation(this.program, "a_position"),
            texCoord: gl.getAttribLocation(this.program, "a_texCoord"),
            resolution: gl.getUniformLocation(this.program, "u_resolution"),
            translation: gl.getUniformLocation(this.program, "u_translation"),
            scale: gl.getUniformLocation(this.program, "u_scale"),
            textureSize: gl.getUniformLocation(this.program, "u_textureSize"),
            containerSize: gl.getUniformLocation(this.program, "u_containerSize"),
            windowWidth: gl.getUniformLocation(this.program, "u_windowWidth"),
            windowCenter: gl.getUniformLocation(this.program, "u_windowCenter")
        };
    }

    /**
     * Accepts a raw Javascript Image() object or an HTMLVideoElement and uploads it to VRAM.
     * In a full 16-bit pipeline, this would accept Uint16Array + gl.LUMINANCE + gl.UNSIGNED_SHORT.
     */
    loadImageTexture(imageHTML) {
        if (!this.gl) return;
        const gl = this.gl;

        this.textureWidth = imageHTML.naturalWidth || imageHTML.videoWidth || imageHTML.width;
        this.textureHeight = imageHTML.naturalHeight || imageHTML.videoHeight || imageHTML.height;

        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);

        // Upload to GPU
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageHTML);

        // Clamp to edge to avoid wrap artifacts
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

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
        // Look up the size the browser is displaying the canvas in CSS pixels.
        const displayWidth = this.canvas.clientWidth;
        const displayHeight = this.canvas.clientHeight;

        // Check if the canvas is not the same size.
        const needResize = this.canvas.width !== displayWidth ||
            this.canvas.height !== displayHeight;

        if (needResize) {
            this.canvas.width = displayWidth;
            this.canvas.height = displayHeight;
        }
        return needResize;
    }

    render() {
        if (!this.gl || !this.texture) return;
        const gl = this.gl;

        this.resizeCanvasToDisplaySize();
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(this.program);

        // Bind attributes
        gl.enableVertexAttribArray(this.locations.position);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.vertexAttribPointer(this.locations.position, 2, gl.FLOAT, false, 0, 0);

        gl.enableVertexAttribArray(this.locations.texCoord);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
        gl.vertexAttribPointer(this.locations.texCoord, 2, gl.FLOAT, false, 0, 0);

        // Bind Uniforms
        gl.uniform2f(this.locations.resolution, gl.canvas.width, gl.canvas.height);
        gl.uniform2f(this.locations.containerSize, gl.canvas.width, gl.canvas.height);
        gl.uniform2f(this.locations.textureSize, this.textureWidth, this.textureHeight);
        gl.uniform2f(this.locations.translation, this.translateX, this.translateY);
        gl.uniform2f(this.locations.scale, this.scale, this.scale);

        gl.uniform1f(this.locations.windowWidth, this.windowWidth);
        gl.uniform1f(this.locations.windowCenter, this.windowCenter);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
}

window.ClinicalWebGLRenderer = ClinicalWebGLRenderer;
