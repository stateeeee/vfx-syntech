import { ParamSchema } from '../../bridge/types';
import { EngineNode, NodeRenderContext, Target, QUAD_VS, compileProgram, createTarget, destroyTarget } from '../SynEngine';

/* ═══════════════════════════════════════════════════════════════
   BLOB TRACKER node — native port of the tracker's core:
   luma-threshold blob detection on a downscaled analysis buffer
   (connected components), bracket markers + connection lines
   drawn on a 2D overlay, composited over the input in GLSL.
   Parameter keys match the standalone effect.
   ═══════════════════════════════════════════════════════════════ */

const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform sampler2D uOverlay;
out vec4 o;
void main(){
  vec4 base = texture(uTex, vUV);
  vec4 ov = texture(uOverlay, vec2(vUV.x, 1.0 - vUV.y));
  o = vec4(mix(base.rgb, ov.rgb, ov.a), 1.0);
}`;

interface Blob { x: number; y: number; w: number; h: number; cx: number; cy: number; area: number }

const AW = 160; // analysis buffer width; height follows aspect

export class BlobTrackerNode implements EngineNode {
  readonly id = 'blob_tracker';
  readonly name = 'BLOB TRACKER';
  enabled = true;
  readonly params: ParamSchema[];
  private values: Record<string, number> = {
    threshold: 127, minArea: 12, maxBlobs: 12, connWidth: 2, showBoxes: 1, showConnections: 1, dashedLines: 0, showLabels: 1,
  };

  private prog: WebGLProgram | null = null;
  private target: Target | null = null;
  private overlayTex: WebGLTexture | null = null;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};

  private analysisCv = document.createElement('canvas');
  private analysisCtx = this.analysisCv.getContext('2d', { willReadFrequently: true })!;
  private overlayCv = document.createElement('canvas');
  private overlayCtx = this.overlayCv.getContext('2d')!;
  private labels = new Int32Array(0);
  lastBlobs: Blob[] = [];

  constructor() {
    const P = (key: string, label: string, min: number, max: number, step: number, hint: string, bool = false): ParamSchema => ({
      key, label, type: bool ? 'boolean' : 'number', min, max, step,
      value: this.values[key], group: 'TRACKER', reactive: !bool, aiHint: hint,
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
    ['uTex', 'uOverlay'].forEach((u) => { this.uniforms[u] = gl.getUniformLocation(this.prog!, u); });
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

  render(ctx: NodeRenderContext): WebGLTexture {
    const { gl, inputTex, width, height, drawQuad, source } = ctx;
    if (!this.target || this.target.w !== width || this.target.h !== height) {
      destroyTarget(gl, this.target);
      this.target = createTarget(gl, width, height);
      if (this.overlayCv.width !== width || this.overlayCv.height !== height) this.resize(width, height);
    }

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
    drawQuad();
    return this.target.tex;
  }

  dispose(gl: WebGL2RenderingContext): void {
    if (this.prog) gl.deleteProgram(this.prog);
    if (this.overlayTex) gl.deleteTexture(this.overlayTex);
    destroyTarget(gl, this.target);
    this.target = null;
  }
}
