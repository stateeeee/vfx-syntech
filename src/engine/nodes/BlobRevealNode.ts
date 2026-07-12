import { ParamSchema } from '../../bridge/types';
import { EngineNode, NodeRenderContext, Target, QUAD_VS, compileProgram, createTarget, destroyTarget } from '../SynEngine';

/* ═══════════════════════════════════════════════════════════════
   BLOB REVEAL node — native port of the reveal core:
   luma blobs detected on a 320×180 analysis buffer (same grid as
   the standalone), box-dilated, then turned into a reveal mask —
   the video shows only inside the (eroded + feathered) blob
   windows over a black frame. With SEGMENTATION enabled the shared
   PersonMask service adds the rotoscope layer on top, exactly like
   the standalone composite (blob windows + person cutout).
   Parameter keys match the standalone.
   ═══════════════════════════════════════════════════════════════ */

const REVEAL_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform sampler2D uMask;
uniform sampler2D uSeg;   /* person confidence mask */
uniform float uHasSeg;
uniform float uSegThr;
uniform float uOpacity;
out vec4 o;
void main(){
  vec2 tl = vec2(vUV.x, 1.0 - vUV.y);
  float m = texture(uMask, tl).a;
  if(uHasSeg > 0.5){
    float pm = texture(uSeg, tl).r;
    m = max(m, smoothstep(uSegThr - 0.15, uSegThr + 0.15, pm));
  }
  o = vec4(texture(uTex, vUV).rgb * m * uOpacity, 1.0);
}`;

// same analysis grid as the standalone effect
const PW = 320;
const PH = 180;

interface Def { key: string; label: string; group: string; min: number; max: number; step: number; value: number; hint: string; bool?: boolean }

const DEFS: Def[] = [
  { key: 'segEnabled',   label: 'SEGMENTATION',   group: 'SEGMENTATION', min: 0, max: 1, step: 1, value: 0, hint: 'Person rotoscope layer on top of the blob windows (loads the segmentation model)', bool: true },
  { key: 'segThreshold', label: 'SEG THRESHOLD',  group: 'SEGMENTATION', min: 5, max: 95, step: 1, value: 40, hint: 'Person segmentation mask threshold; lower keeps more of the person' },
  { key: 'lumThreshold', label: 'LUMA THRESHOLD', group: 'BLOB', min: 0, max: 255, step: 1, value: 170, hint: 'Luma threshold (0-255) for blob detection' },
  { key: 'minArea',      label: 'MIN BLOB AREA',  group: 'BLOB', min: 20, max: 5000, step: 20, value: 300, hint: 'Minimum blob area in pixels' },
  { key: 'maxBlobs',     label: 'MAX BLOBS',      group: 'BLOB', min: 1, max: 30, step: 1, value: 14, hint: 'Maximum number of reveal windows' },
  { key: 'dilate',       label: 'DILATE',         group: 'BLOB', min: 0, max: 20, step: 1, value: 4, hint: 'Expands the blob mask outward by N pixels' },
  { key: 'erode',        label: 'ERODE',          group: 'MASK', min: 0, max: 30, step: 1, value: 4, hint: 'Shrinks the mask edge inward by N pixels' },
  { key: 'feather',      label: 'FEATHER',        group: 'MASK', min: 0, max: 30, step: 1, value: 3, hint: 'Softens/blurs the mask edge' },
  { key: 'opacity',      label: 'REVEAL OPACITY', group: 'MASK', min: 10, max: 100, step: 1, value: 100, hint: 'Opacity percentage of the revealed layer' },
];

interface Blob { x: number; y: number; w: number; h: number; area: number }

export class BlobRevealNode implements EngineNode {
  readonly id = 'blob_reveal';
  readonly name = 'BLOB REVEAL';
  enabled = true;
  readonly params: ParamSchema[];
  private v: Record<string, number> = {};

  private prog: WebGLProgram | null = null;
  private target: Target | null = null;
  private maskTex: WebGLTexture | null = null;
  private segTex: WebGLTexture | null = null;
  private U: Record<string, WebGLUniformLocation | null> = {};

  private analysisCv = document.createElement('canvas');
  private analysisCtx = this.analysisCv.getContext('2d', { willReadFrequently: true })!;
  private rectCv = document.createElement('canvas');
  private rectCtx = this.rectCv.getContext('2d')!;
  private maskCv = document.createElement('canvas');
  private maskCtx = this.maskCv.getContext('2d')!;
  private bin = new Uint8Array(PW * PH);
  private dil = new Uint8Array(PW * PH);
  private vis = new Uint8Array(PW * PH);
  lastBlobs: Blob[] = [];

  constructor() {
    this.analysisCv.width = PW;
    this.analysisCv.height = PH;
    DEFS.forEach((d) => { this.v[d.key] = d.value; });
    this.params = DEFS.map((d) => ({
      key: d.key, label: d.label, type: d.bool ? 'boolean' as const : 'number' as const,
      min: d.min, max: d.max, step: d.step, value: d.value,
      group: d.group, reactive: !d.bool, aiHint: d.hint,
    }));
  }

  setParam(key: string, value: unknown): void {
    const def = DEFS.find((d) => d.key === key);
    if (!def) return;
    const n = Number(value === true ? 1 : value === false ? 0 : value);
    if (isNaN(n)) return;
    this.v[key] = Math.max(def.min, Math.min(def.max, n));
  }

  getParam(key: string): unknown { return this.v[key]; }

  init(gl: WebGL2RenderingContext): void {
    this.prog = compileProgram(gl, QUAD_VS, REVEAL_FS);
    ['uTex', 'uMask', 'uSeg', 'uHasSeg', 'uSegThr', 'uOpacity'].forEach((u) => { this.U[u] = gl.getUniformLocation(this.prog!, u); });
    const mkTex = () => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this.maskTex = mkTex();
    this.segTex = mkTex();
  }

  resize(width: number, height: number): void {
    this.rectCv.width = width;
    this.rectCv.height = height;
    this.maskCv.width = width;
    this.maskCv.height = height;
  }

  /** binary luma threshold + separable box dilation + BFS components */
  private detect(source: TexImageSource, fullW: number, fullH: number): Blob[] {
    const ctx = this.analysisCtx;
    ctx.drawImage(source as CanvasImageSource, 0, 0, PW, PH);
    const data = ctx.getImageData(0, 0, PW, PH).data;
    const thr = this.v.lumThreshold;
    const bin = this.bin;
    for (let i = 0; i < bin.length; i++) {
      const lum = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
      bin[i] = lum > thr ? 1 : 0;
    }

    const r = Math.round(this.v.dilate);
    if (r > 0) {
      // separable box dilation: horizontal run into dil, vertical back into bin
      const dil = this.dil;
      for (let y = 0; y < PH; y++) {
        const row = y * PW;
        for (let x = 0; x < PW; x++) {
          let hit = 0;
          const x0 = Math.max(0, x - r), x1 = Math.min(PW - 1, x + r);
          for (let nx = x0; nx <= x1; nx++) if (bin[row + nx]) { hit = 1; break; }
          dil[row + x] = hit;
        }
      }
      for (let x = 0; x < PW; x++) {
        for (let y = 0; y < PH; y++) {
          let hit = 0;
          const y0 = Math.max(0, y - r), y1 = Math.min(PH - 1, y + r);
          for (let ny = y0; ny <= y1; ny++) if (dil[ny * PW + x]) { hit = 1; break; }
          bin[y * PW + x] = hit;
        }
      }
    }

    // BFS connected components — minArea is in full-res pixels, like the standalone
    const vis = this.vis;
    vis.fill(0);
    const sf = (fullW * fullH) / (PW * PH);
    const minPx = this.v.minArea / Math.max(1, sf);
    const blobs: Blob[] = [];
    const q: number[] = [];

    for (let i = 0; i < bin.length; i++) {
      if (!bin[i] || vis[i]) continue;
      q.length = 0;
      q.push(i);
      vis[i] = 1;
      let qi = 0, area = 0;
      let x0 = i % PW, x1 = x0, y0 = (i / PW) | 0, y1 = y0;
      while (qi < q.length) {
        const ci = q[qi++];
        area++;
        const cx = ci % PW, cy = (ci / PW) | 0;
        if (cx < x0) x0 = cx;
        if (cx > x1) x1 = cx;
        if (cy < y0) y0 = cy;
        if (cy > y1) y1 = cy;
        for (const ni of [ci - 1, ci + 1, ci - PW, ci + PW]) {
          if (ni < 0 || ni >= bin.length || vis[ni] || !bin[ni]) continue;
          if (Math.abs((ni % PW) - cx) > 1) continue;
          vis[ni] = 1;
          q.push(ni);
        }
      }
      if (area >= minPx) blobs.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, area });
    }
    blobs.sort((a, b) => b.area - a.area);
    return blobs.slice(0, this.v.maxBlobs);
  }

  private drawMask(blobs: Blob[]): void {
    const W = this.maskCv.width;
    const H = this.maskCv.height;
    const scX = W / PW, scY = H / PH;
    const erode = this.v.erode;
    const rctx = this.rectCtx;
    rctx.clearRect(0, 0, W, H);
    rctx.fillStyle = '#fff';
    for (const b of blobs) {
      const rx = b.x * scX + erode, ry = b.y * scY + erode;
      const rw = b.w * scX - erode * 2, rh = b.h * scY - erode * 2;
      if (rw > 0 && rh > 0) rctx.fillRect(rx, ry, rw, rh);
    }
    const mctx = this.maskCtx;
    mctx.clearRect(0, 0, W, H);
    mctx.filter = this.v.feather > 0 ? `blur(${this.v.feather}px)` : 'none';
    mctx.drawImage(this.rectCv, 0, 0);
    mctx.filter = 'none';
  }

  render(ctx: NodeRenderContext): WebGLTexture {
    const { gl, inputTex, width, height, drawQuad, source } = ctx;
    if (!this.target || this.target.w !== width || this.target.h !== height) {
      destroyTarget(gl, this.target);
      this.target = createTarget(gl, width, height);
      if (this.maskCv.width !== width || this.maskCv.height !== height) this.resize(width, height);
    }

    if (source) {
      this.lastBlobs = this.detect(source, width, height);
      this.drawMask(this.lastBlobs);
    }

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, this.maskCv);

    // person rotoscope layer (shared PersonMask service, when live)
    const useSeg = this.v.segEnabled >= 0.5 && !!ctx.personMask;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.segTex);
    if (useSeg) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, ctx.personMask!);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target.fbo);
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, inputTex);
    gl.uniform1i(this.U.uTex, 0);
    gl.uniform1i(this.U.uMask, 1);
    gl.uniform1i(this.U.uSeg, 2);
    gl.uniform1f(this.U.uHasSeg, useSeg ? 1 : 0);
    gl.uniform1f(this.U.uSegThr, this.v.segThreshold / 100);
    gl.uniform1f(this.U.uOpacity, this.v.opacity / 100);
    drawQuad();
    return this.target.tex;
  }

  dispose(gl: WebGL2RenderingContext): void {
    if (this.prog) gl.deleteProgram(this.prog);
    if (this.maskTex) gl.deleteTexture(this.maskTex);
    if (this.segTex) gl.deleteTexture(this.segTex);
    destroyTarget(gl, this.target);
    this.target = null;
  }
}
