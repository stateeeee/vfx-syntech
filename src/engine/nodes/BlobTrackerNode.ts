import { ParamSchema } from '../../bridge/types';
import { EngineNode, NodeRenderContext, Target, QUAD_VS, compileProgram, createTarget, destroyTarget } from '../SynEngine';

/* ═══════════════════════════════════════════════════════════════
   BLOB TRACKER node — native port of the tracker's core:
   luma-threshold blob detection on a downscaled analysis buffer
   (connected components), bracket markers + connection lines
   drawn on a 2D overlay, composited over the input in GLSL.
   Parameter keys match the standalone effect.
   ═══════════════════════════════════════════════════════════════ */

const MAX_BLOBS = 16;

const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform sampler2D uOverlay;
uniform vec4 uBlobs[${MAX_BLOBS}]; // x,y,w,h in top-left normalized coords
uniform int uBlobCount;
uniform float uTime;
uniform float uFxInvert, uFxThermal, uFxSecurity, uFxGlitch, uFxOpacity;
out vec4 o;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 thermal(float t){
  return clamp(vec3(t * 3.0 - 1.0, t * 3.0 - 0.5, 1.0 - t * 2.0) * step(0.02, t), 0.0, 1.0);
}
void main(){
  vec3 base = texture(uTex, vUV).rgb;
  vec2 tl = vec2(vUV.x, 1.0 - vUV.y); // top-left space, same as blob rects
  bool inside = false;
  for (int i = 0; i < ${MAX_BLOBS}; i++) {
    if (i >= uBlobCount) break;
    vec4 b = uBlobs[i];
    if (tl.x >= b.x && tl.x <= b.x + b.z && tl.y >= b.y && tl.y <= b.y + b.w) { inside = true; break; }
  }
  if (inside && uFxOpacity > 0.0) {
    vec3 fx = base;
    vec2 suv = vUV;
    if (uFxGlitch > 0.0) {
      float band = floor(tl.y * 60.0);
      float g = hash(vec2(band, floor(uTime * 17.0)));
      if (g < uFxGlitch * 0.03) suv.x += (hash(vec2(band, uTime)) - 0.5) * uFxGlitch * 0.02;
      fx = texture(uTex, suv).rgb;
    }
    float lum = dot(fx, vec3(0.299, 0.587, 0.114));
    if (uFxThermal > 0.5) fx = thermal(lum);
    if (uFxSecurity > 0.5) {
      float sl = sin(tl.y * 500.0) * 0.5 + 0.5;
      fx = vec3(0.1, 1.0, 0.35) * lum * (0.75 + 0.25 * sl)
         + (hash(suv * 700.0 + fract(uTime) * 91.0) - 0.5) * 0.12;
    }
    if (uFxInvert > 0.5) fx = 1.0 - fx;
    base = mix(base, fx, uFxOpacity);
  }
  vec4 ov = texture(uOverlay, tl);
  o = vec4(mix(base, ov.rgb, ov.a), 1.0);
}`;

/* ── PANELS mode: the tracker's 3D render mode, ported to raw WebGL2
      (the standalone uses three.js; here a handful of perspective-
      projected quads textured with regions of the input frame float
      over a dimmed background, wobbling with turbulence noise). ── */

const PANEL_VS = `#version 300 es
layout(location=0) in vec2 aPos; /* unit quad -0.5..0.5 */
uniform mat4 uMVP;
uniform vec2 uSize;
uniform vec4 uUvRect; /* u, v, uw, uh in input-texture space */
out vec2 vUV;
out vec2 vLocal;
void main(){
  vLocal = aPos + 0.5;
  vUV = uUvRect.xy + vLocal * uUvRect.zw;
  gl_Position = uMVP * vec4(aPos * uSize, 0.0, 1.0);
}`;

const PANEL_FS = `#version 300 es
precision highp float;
in vec2 vUV;
in vec2 vLocal;
uniform sampler2D uTex;
out vec4 o;
void main(){
  vec3 col = texture(uTex, clamp(vUV, 0.0, 1.0)).rgb;
  // thin scanner-style frame on the panel edge
  vec2 e = min(vLocal, 1.0 - vLocal);
  float frame = 1.0 - smoothstep(0.0, 0.02, min(e.x, e.y));
  col = mix(col, vec3(1.0), frame * 0.55);
  o = vec4(col, 1.0);
}`;

const BG_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform float uOpacity;
out vec4 o;
void main(){ o = vec4(texture(uTex, vUV).rgb * uOpacity, 1.0); }`;

/* fixed panel layout, mirroring the standalone's floating arrangement:
   [w, h, ox, oy, oz, rx, ry, rz, u, v, uw, uh] */
const PANEL_DEFS: number[][] = [
  [2.3, 1.4, -2.2,  0.9, -0.6, -0.06,  0.28,  0.02, 0.02, 0.45, 0.42, 0.50],
  [1.7, 1.1,  0.1,  1.2, -1.0,  0.10, -0.12, -0.03, 0.30, 0.50, 0.38, 0.45],
  [2.0, 1.3,  2.3,  0.7, -0.3, -0.04, -0.30,  0.04, 0.55, 0.40, 0.42, 0.55],
  [1.5, 1.0, -2.6, -0.9,  0.2,  0.08,  0.34, -0.05, 0.05, 0.05, 0.35, 0.40],
  [2.4, 1.5, -0.2, -1.1,  0.5, -0.10,  0.06,  0.03, 0.28, 0.02, 0.45, 0.42],
  [1.6, 1.05, 2.5, -1.0,  0.0,  0.06, -0.36, -0.02, 0.60, 0.06, 0.38, 0.40],
  [1.3, 0.9,  0.0,  0.0,  1.2,  0.02,  0.10,  0.06, 0.35, 0.30, 0.30, 0.35],
];

/* minimal column-major mat4 helpers (enough for a perspective camera) */
type Mat4 = Float32Array;
const m4mul = (a: Mat4, b: Mat4): Mat4 => {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
};
const m4perspective = (fovyDeg: number, aspect: number, near: number, far: number): Mat4 => {
  const f = 1 / Math.tan((fovyDeg * Math.PI) / 360);
  const nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
};
const m4lookAt = (ex: number, ey: number, ez: number): Mat4 => {
  // looking at the origin, up = +Y
  let zx = ex, zy = ey, zz = ez;
  const zl = Math.hypot(zx, zy, zz) || 1;
  zx /= zl; zy /= zl; zz /= zl;
  let xx = -zz, xy = 0, xz = zx; // up × z
  const xl = Math.hypot(xx, xy, xz) || 1;
  xx /= xl; xy /= xl; xz /= xl;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return new Float32Array([
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * ex + xy * ey + xz * ez), -(yx * ex + yy * ey + yz * ez), -(zx * ex + zy * ey + zz * ez), 1,
  ]);
};
const m4model = (x: number, y: number, z: number, rx: number, ry: number, rz: number, s: number): Mat4 => {
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  // R = Rz·Ry·Rx, scaled uniformly, then translated
  return new Float32Array([
    s * (cz * cy), s * (sz * cy), s * -sy, 0,
    s * (cz * sy * sx - sz * cx), s * (sz * sy * sx + cz * cx), s * (cy * sx), 0,
    s * (cz * sy * cx + sz * sx), s * (sz * sy * cx - cz * sx), s * (cy * cx), 0,
    x, y, z, 1,
  ]);
};

interface Blob { x: number; y: number; w: number; h: number; cx: number; cy: number; area: number }

const AW = 160; // analysis buffer width; height follows aspect

export class BlobTrackerNode implements EngineNode {
  readonly id = 'blob_tracker';
  readonly name = 'BLOB TRACKER';
  enabled = true;
  readonly params: ParamSchema[];
  private values: Record<string, number> = {
    threshold: 127, minArea: 12, maxBlobs: 12, connWidth: 2, showBoxes: 1, showConnections: 1, dashedLines: 0, showLabels: 1,
    fxInvert: 0, fxThermal: 0, fxSecurity: 0, glitch: 0, fxOpacity: 100,
    panelsMode: 0, panelScale: 1, panelTurbulence: 1, panelCamZ: 7, panelsBgOpacity: 50,
  };

  private prog: WebGLProgram | null = null;
  private panelProg: WebGLProgram | null = null;
  private bgProg: WebGLProgram | null = null;
  private panelVao: WebGLVertexArrayObject | null = null;
  private target: Target | null = null;
  private overlayTex: WebGLTexture | null = null;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private U: Record<string, Record<string, WebGLUniformLocation | null>> = {};

  private analysisCv = document.createElement('canvas');
  private analysisCtx = this.analysisCv.getContext('2d', { willReadFrequently: true })!;
  private overlayCv = document.createElement('canvas');
  private overlayCtx = this.overlayCv.getContext('2d')!;
  private labels = new Int32Array(0);
  lastBlobs: Blob[] = [];

  constructor() {
    const P = (key: string, label: string, min: number, max: number, step: number, hint: string, bool = false, group = 'TRACKER'): ParamSchema => ({
      key, label, type: bool ? 'boolean' : 'number', min, max, step,
      value: this.values[key], group, reactive: !bool, aiHint: hint,
    });
    this.params = [
      P('threshold', 'BLOB THRESHOLD', 0, 255, 1, 'Luma threshold; lower detects more and larger blobs'),
      P('minArea', 'MIN BLOB AREA', 1, 200, 1, 'Minimum blob area on the analysis grid'),
      P('maxBlobs', 'MAX BLOBS', 1, 30, 1, 'Maximum number of tracked blobs'),
      P('connWidth', 'LINE WIDTH', 1, 12, 1, 'Stroke width of connection lines'),
      P('showBoxes', 'BRACKETS', 0, 1, 1, 'Draw bracket markers around blobs', true),
      P('showConnections', 'CONNECTIONS', 0, 1, 1, 'Draw lines between blob centers', true),
      P('dashedLines', 'DASHED LINES', 0, 1, 1, 'Dashed instead of solid lines', true),
      P('showLabels', 'LABELS', 0, 1, 1, 'Coordinates label next to each blob', true),
      P('fxInvert', 'FX INVERT', 0, 1, 1, 'Invert colors inside blobs', true),
      P('fxThermal', 'FX THERMAL', 0, 1, 1, 'Thermal-camera palette inside blobs', true),
      P('fxSecurity', 'FX SECURITY', 0, 1, 1, 'Security-camera look inside blobs', true),
      P('glitch', 'GLITCH', 0, 20, 1, 'Digital glitch intensity inside blobs'),
      P('fxOpacity', 'FX OPACITY', 0, 100, 1, 'Opacity of the FX rendered inside blobs'),
      P('panelsMode', 'PANELS MODE', 0, 1, 1, '3D floating video panels render mode (replaces the 2D tracker draw)', true, 'PANELS'),
      P('panelScale', 'PANEL SCALE', 0.3, 2, 0.01, 'Scale of the 3D panels in panels render mode', false, 'PANELS'),
      P('panelTurbulence', 'PANEL TURBULENCE', 0, 3, 0.1, 'Organic motion turbulence of the 3D panels', false, 'PANELS'),
      P('panelCamZ', 'PANEL CAMERA Z', 4, 12, 0.1, '3D camera distance in panels render mode', false, 'PANELS'),
      P('panelsBgOpacity', 'PANELS BG', 0, 100, 1, 'Opacity of the dimmed video behind the panels', false, 'PANELS'),
    ];
  }

  setParam(key: string, value: unknown): void {
    if (!(key in this.values)) return;
    const v = Number(value === true ? 1 : value === false ? 0 : value);
    if (isNaN(v)) return;
    const def = this.params.find((p) => p.key === key)!;
    this.values[key] = Math.max(def.min ?? 0, Math.min(def.max ?? 1, v));
  }

  getParam(key: string): unknown { return this.values[key]; }

  init(gl: WebGL2RenderingContext): void {
    this.prog = compileProgram(gl, QUAD_VS, COMPOSITE_FS);
    ['uTex', 'uOverlay', 'uBlobs', 'uBlobCount', 'uTime', 'uFxInvert', 'uFxThermal', 'uFxSecurity', 'uFxGlitch', 'uFxOpacity']
      .forEach((u) => { this.uniforms[u] = gl.getUniformLocation(this.prog!, u); });

    this.panelProg = compileProgram(gl, PANEL_VS, PANEL_FS);
    this.bgProg = compileProgram(gl, QUAD_VS, BG_FS);
    this.U.panel = {};
    ['uMVP', 'uSize', 'uUvRect', 'uTex'].forEach((u) => { this.U.panel[u] = gl.getUniformLocation(this.panelProg!, u); });
    this.U.bg = {};
    ['uTex', 'uOpacity'].forEach((u) => { this.U.bg[u] = gl.getUniformLocation(this.bgProg!, u); });

    // unit quad for the panels (triangle strip, -0.5..0.5)
    this.panelVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.panelVao);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.overlayTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.overlayTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  resize(width: number, height: number): void {
    const ah = Math.max(2, Math.round((AW * height) / Math.max(1, width)));
    this.analysisCv.width = AW;
    this.analysisCv.height = ah;
    this.labels = new Int32Array(AW * ah);
    this.overlayCv.width = width;
    this.overlayCv.height = height;
  }

  /** connected components on the thresholded analysis buffer */
  private detect(source: TexImageSource): Blob[] {
    const aw = this.analysisCv.width;
    const ah = this.analysisCv.height;
    const ctx = this.analysisCtx;
    ctx.drawImage(source as CanvasImageSource, 0, 0, aw, ah);
    const data = ctx.getImageData(0, 0, aw, ah).data;
    const thr = this.values.threshold;
    const labels = this.labels;
    labels.fill(0);

    const blobs: Blob[] = [];
    const stack: number[] = [];
    let nextLabel = 1;

    for (let i = 0; i < aw * ah; i++) {
      if (labels[i] !== 0) continue;
      const lum = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
      if (lum < thr) { labels[i] = -1; continue; }

      // flood fill this component
      let minX = aw, maxX = 0, minY = ah, maxY = 0, area = 0, sx = 0, sy = 0;
      stack.length = 0;
      stack.push(i);
      labels[i] = nextLabel;
      while (stack.length) {
        const p = stack.pop()!;
        const px = p % aw, py = (p / aw) | 0;
        area++; sx += px; sy += py;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
        const neigh = [p - 1, p + 1, p - aw, p + aw];
        for (let k = 0; k < 4; k++) {
          const q = neigh[k];
          if (q < 0 || q >= aw * ah) continue;
          if (k === 0 && px === 0) continue;
          if (k === 1 && px === aw - 1) continue;
          if (labels[q] !== 0) continue;
          const ql = 0.299 * data[q * 4] + 0.587 * data[q * 4 + 1] + 0.114 * data[q * 4 + 2];
          if (ql >= thr) { labels[q] = nextLabel; stack.push(q); }
          else labels[q] = -1;
        }
      }
      nextLabel++;
      if (area >= this.values.minArea) {
        blobs.push({
          x: minX / aw, y: minY / ah,
          w: (maxX - minX + 1) / aw, h: (maxY - minY + 1) / ah,
          cx: sx / area / aw, cy: sy / area / ah, area,
        });
      }
    }
    blobs.sort((a, b) => b.area - a.area);
    return blobs.slice(0, this.values.maxBlobs);
  }

  private drawOverlay(blobs: Blob[]): void {
    const W = this.overlayCv.width;
    const H = this.overlayCv.height;
    const ctx = this.overlayCtx;
    ctx.clearRect(0, 0, W, H);
    const v = this.values;
    ctx.lineWidth = v.connWidth;
    ctx.setLineDash(v.dashedLines ? [8, 6] : []);

    if (v.showConnections && blobs.length > 1) {
      ctx.strokeStyle = 'rgba(212,175,55,0.85)';
      ctx.beginPath();
      for (let i = 0; i < blobs.length; i++) {
        for (let j = i + 1; j < blobs.length; j++) {
          ctx.moveTo(blobs[i].cx * W, blobs[i].cy * H);
          ctx.lineTo(blobs[j].cx * W, blobs[j].cy * H);
        }
      }
      ctx.stroke();
    }

    if (v.showBoxes) {
      ctx.strokeStyle = '#ffffff';
      ctx.setLineDash([]);
      ctx.lineWidth = Math.max(1.5, v.connWidth * 0.75);
      const arm = Math.max(8, W * 0.012);
      for (const b of blobs) {
        const x = b.x * W, y = b.y * H, w = b.w * W, h = b.h * H;
        // corner brackets
        const cs: Array<[number, number, number, number]> = [
          [x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1],
        ];
        ctx.beginPath();
        for (const [px, py, dx, dy] of cs) {
          ctx.moveTo(px + dx * arm, py);
          ctx.lineTo(px, py);
          ctx.lineTo(px, py + dy * arm);
        }
        ctx.stroke();
      }
    }

    if (v.showLabels) {
      ctx.fillStyle = 'rgba(212,175,55,0.95)';
      ctx.font = `${Math.max(10, Math.round(H * 0.016))}px monospace`;
      blobs.forEach((b, i) => {
        ctx.fillText(
          `B${String(i + 1).padStart(2, '0')} ${Math.round(b.cx * 100)}:${Math.round(b.cy * 100)}`,
          b.x * this.overlayCv.width,
          Math.max(12, b.y * this.overlayCv.height - 6)
        );
      });
    }
  }

  /** PANELS mode: dimmed background + floating perspective video panels */
  private renderPanels(ctx: NodeRenderContext): WebGLTexture {
    const { gl, inputTex, width, height, time, drawQuad } = ctx;
    const v = this.values;
    const t = time * 0.35 * v.panelTurbulence;
    const PA = 0.35 * v.panelTurbulence;       // position wobble amplitude
    const RA = 0.06 * v.panelTurbulence;       // rotation wobble amplitude

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target!.fbo);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // dimmed source behind the panels
    if (v.panelsBgOpacity > 0) {
      gl.useProgram(this.bgProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, inputTex);
      gl.uniform1i(this.U.bg.uTex, 0);
      gl.uniform1f(this.U.bg.uOpacity, v.panelsBgOpacity / 100);
      drawQuad();
    }

    // drifting camera looking at the origin
    const camX = Math.sin(t * 0.28) * 0.6;
    const camY = Math.sin(t * 0.22 + 1.7) * 0.4;
    const viewProj = m4mul(m4perspective(55, width / Math.max(1, height), 0.1, 100), m4lookAt(camX, camY, v.panelCamZ));

    gl.useProgram(this.panelProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, inputTex);
    gl.uniform1i(this.U.panel.uTex, 0);
    gl.bindVertexArray(this.panelVao);

    // painter's order: farthest panels first (camera sits on +Z)
    const order = PANEL_DEFS.map((d, i) => ({ d, i })).sort((a, b) => a.d[4] - b.d[4]);
    for (const { d, i } of order) {
      const [w, h, ox, oy, oz, rx, ry, rz, u, vv, uw, uh] = d;
      const px = ox + Math.sin(t + i * 3.7) * PA;
      const py = oy + Math.sin(t * 0.9 + i * 2.1) * PA * 0.8;
      const pz = oz + Math.sin(t * 0.7 + i * 5.3) * PA * 0.3;
      const prx = rx + Math.sin(t * 0.6 + i * 1.9 + 10) * RA;
      const pry = ry + Math.sin(t * 0.6 + i * 2.7 + 10) * RA;
      const prz = rz + Math.sin(t * 0.6 + i * 3.3 + 10) * RA * 0.5;
      const mvp = m4mul(viewProj, m4model(px, py, pz, prx, pry, prz, v.panelScale));
      gl.uniformMatrix4fv(this.U.panel.uMVP, false, mvp);
      gl.uniform2f(this.U.panel.uSize, w, h);
      gl.uniform4f(this.U.panel.uUvRect, u, vv, uw, uh);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.bindVertexArray(null);
    return this.target!.tex;
  }

  render(ctx: NodeRenderContext): WebGLTexture {
    const { gl, inputTex, width, height, drawQuad, source } = ctx;
    if (!this.target || this.target.w !== width || this.target.h !== height) {
      destroyTarget(gl, this.target);
      this.target = createTarget(gl, width, height);
      if (this.overlayCv.width !== width || this.overlayCv.height !== height) this.resize(width, height);
    }

    if (this.values.panelsMode >= 0.5) return this.renderPanels(ctx);

    if (source) {
      this.lastBlobs = this.detect(source);
      this.drawOverlay(this.lastBlobs);
    }

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.overlayTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, this.overlayCv);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target.fbo);
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, inputTex);
    gl.uniform1i(this.uniforms.uTex, 0);
    gl.uniform1i(this.uniforms.uOverlay, 1);
    const rects = new Float32Array(MAX_BLOBS * 4);
    const n = Math.min(this.lastBlobs.length, MAX_BLOBS);
    for (let i = 0; i < n; i++) {
      const b = this.lastBlobs[i];
      rects.set([b.x, b.y, b.w, b.h], i * 4);
    }
    gl.uniform4fv(this.uniforms.uBlobs, rects);
    gl.uniform1i(this.uniforms.uBlobCount, n);
    gl.uniform1f(this.uniforms.uTime, ctx.time);
    const v = this.values;
    gl.uniform1f(this.uniforms.uFxInvert, v.fxInvert);
    gl.uniform1f(this.uniforms.uFxThermal, v.fxThermal);
    gl.uniform1f(this.uniforms.uFxSecurity, v.fxSecurity);
    gl.uniform1f(this.uniforms.uFxGlitch, v.glitch);
    gl.uniform1f(this.uniforms.uFxOpacity, v.fxOpacity / 100);
    drawQuad();
    return this.target.tex;
  }

  dispose(gl: WebGL2RenderingContext): void {
    [this.prog, this.panelProg, this.bgProg].forEach((p) => { if (p) gl.deleteProgram(p); });
    if (this.panelVao) gl.deleteVertexArray(this.panelVao);
    if (this.overlayTex) gl.deleteTexture(this.overlayTex);
    destroyTarget(gl, this.target);
    this.target = null;
  }
}
