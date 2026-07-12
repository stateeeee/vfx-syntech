import { ParamSchema } from '../../bridge/types';
import { EngineNode, NodeRenderContext, Target, QUAD_VS, compileProgram, createTarget, destroyTarget } from '../SynEngine';

/* ═══════════════════════════════════════════════════════════════
   ANALOG node — native port of the Analog effect.
   Pipeline (mirrors the standalone): input → pixel sort (N ping-
   pong passes) → feedback mix against the persistent previous
   output (zoom/rotate/drift/hue/decay) → CRT/glitch pass.
   Parameter keys match the standalone effect.
   ═══════════════════════════════════════════════════════════════ */

const SORT_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform float uParity, uThresh, uWidth;
out vec4 o;
float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
void main(){
  float ix = floor(vUV.x * uWidth);
  float partner = (mod(ix + uParity, 2.0) < 1.0) ? ix + 1.0 : ix - 1.0;
  partner = clamp(partner, 0.0, uWidth - 1.0);
  vec3 me = texture(uTex, vUV).rgb;
  vec3 other = texture(uTex, vec2((partner + 0.5) / uWidth, vUV.y)).rgb;
  float lm = lum(me), lo = lum(other);
  bool meLeft = partner > ix;
  vec3 res = me;
  // sort bright runs: brighter pixels drift left inside above-threshold spans
  if (lm > uThresh && lo > uThresh) {
    if (meLeft)  res = (lo > lm) ? other : me;
    else         res = (lo < lm) ? other : me;
  }
  o = vec4(res, 1.0);
}`;

const FBK_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex, uPrev;
uniform float uAmt, uZoom, uRot, uDecay, uHue, uDriftX;
out vec4 o;
vec3 hueRotate(vec3 c, float a){
  const mat3 toYIQ = mat3(0.299,0.587,0.114, 0.596,-0.274,-0.322, 0.211,-0.523,0.312);
  const mat3 toRGB = mat3(1.0,0.956,0.621, 1.0,-0.272,-0.647, 1.0,-1.106,1.703);
  vec3 yiq = c * toYIQ;
  float h = atan(yiq.z, yiq.y) + a;
  float ch = length(yiq.yz);
  return clamp(vec3(yiq.x, ch * cos(h), ch * sin(h)) * toRGB, 0.0, 1.0);
}
void main(){
  vec2 c = vUV - 0.5;
  float ang = uRot * 0.03;
  float scl = 1.0 + uZoom * 0.03;
  mat2 R = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
  vec2 puv = R * (c / scl) + 0.5 - vec2(uDriftX * 0.006, 0.0);
  vec3 prev = texture(uPrev, puv).rgb;
  if (abs(uHue) > 0.001) prev = hueRotate(prev, uHue * 0.12);
  prev *= 1.0 - uDecay * 0.22;
  vec3 cur = texture(uTex, vUV).rgb;
  o = vec4(mix(cur, max(cur, prev), uAmt), 1.0);
}`;

const CRT_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform float uTime;
uniform float uTear, uChroma, uNoise, uRollBar, uScanlines, uBarrel, uVignette, uCrtBlend;
out vec4 o;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec2 uv = vUV;
  vec2 c = uv - 0.5;
  float r2 = dot(c, c);
  vec2 barrelUV = 0.5 + c * (1.0 + uBarrel * 0.35 * r2);
  float band = floor(barrelUV.y * 90.0);
  float tearNoise = hash(vec2(band, floor(uTime * 13.0)));
  float tear = (tearNoise < uTear * 0.35) ? (hash(vec2(band, uTime)) - 0.5) * uTear * 0.25 : 0.0;
  vec2 suv = vec2(barrelUV.x + tear, barrelUV.y);
  float roll = uRollBar * 0.25 * smoothstep(0.0, 0.12, 0.06 - abs(fract(suv.y + uTime * 0.15) - 0.5) * 0.12);
  float ca = uChroma * 0.012;
  vec3 col;
  col.r = texture(uTex, suv + vec2(ca, 0.0)).r;
  col.g = texture(uTex, suv).g;
  col.b = texture(uTex, suv - vec2(ca, 0.0)).b;
  float n = hash(suv * vec2(1920.0, 1080.0) + fract(uTime) * 917.0);
  col += (n - 0.5) * uNoise * 0.55;
  col += roll;
  float sl = sin(suv.y * 1080.0 * 3.14159) * 0.5 + 0.5;
  col *= mix(1.0, 0.72 + 0.28 * sl, uScanlines);
  col *= 1.0 - uVignette * smoothstep(0.35, 0.95, length(c) * 1.35);
  if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) col = vec3(0.0);
  vec3 clean = texture(uTex, uv).rgb;
  o = vec4(mix(clean, col, uCrtBlend), 1.0);
}`;

interface Def { key: string; label: string; group: string; min: number; max: number; step: number; value: number; hint: string; bool?: boolean }

const DEFS: Def[] = [
  { key: 'feedbackAmt',   label: 'FEEDBACK AMOUNT', group: 'FEEDBACK', min: 0, max: 0.98, step: 0.01, value: 0,    hint: 'Video feedback intensity (echo trails)' },
  { key: 'feedbackZoom',  label: 'FEEDBACK ZOOM',   group: 'FEEDBACK', min: -1, max: 1,   step: 0.01, value: 0.2,  hint: 'Feedback zoom in/out per frame' },
  { key: 'feedbackRot',   label: 'FEEDBACK ROTATE', group: 'FEEDBACK', min: -1, max: 1,   step: 0.01, value: 0,    hint: 'Feedback rotation per frame' },
  { key: 'feedbackDecay', label: 'FEEDBACK DECAY',  group: 'FEEDBACK', min: 0, max: 1,    step: 0.01, value: 0.3,  hint: 'How quickly feedback trails fade' },
  { key: 'hueShift',      label: 'HUE SHIFT',       group: 'FEEDBACK', min: -1, max: 1,   step: 0.01, value: 0,    hint: 'Hue rotation applied to the feedback' },
  { key: 'feedbackDriftX',label: 'DRIFT X',         group: 'FEEDBACK', min: -1, max: 1,   step: 0.01, value: 0,    hint: 'Horizontal drift of the feedback image' },
  { key: 'sortEnabled',   label: 'PIXEL SORT',      group: 'PIXEL SORT', min: 0, max: 1,  step: 1,    value: 0,    hint: 'Enable the pixel sorting stage', bool: true },
  { key: 'sortThresh',    label: 'SORT THRESHOLD',  group: 'PIXEL SORT', min: 0, max: 1,  step: 0.01, value: 0.5,  hint: 'Luma threshold that triggers pixel sorting' },
  { key: 'sortPasses',    label: 'SORT PASSES',     group: 'PIXEL SORT', min: 1, max: 24, step: 1,    value: 6,    hint: 'Sorting passes (more = longer streaks)' },
  { key: 'tearAmt',       label: 'TEAR',            group: 'GLITCH', min: 0, max: 1, step: 0.01, value: 0.25, hint: 'Horizontal sync tearing amount' },
  { key: 'chromaAmt',     label: 'CHROMA',          group: 'GLITCH', min: 0, max: 1, step: 0.01, value: 0.3,  hint: 'Chromatic aberration / color bleed' },
  { key: 'noiseAmt',      label: 'NOISE',           group: 'GLITCH', min: 0, max: 1, step: 0.01, value: 0.15, hint: 'Analog static noise amount' },
  { key: 'rollBar',       label: 'ROLL BAR',        group: 'GLITCH', min: 0, max: 1, step: 0.01, value: 0,    hint: 'Vertical rolling luminance bar' },
  { key: 'scanlinesAmt',  label: 'SCANLINES',       group: 'CRT', min: 0, max: 1, step: 0.01, value: 0.5,  hint: 'Scanline intensity' },
  { key: 'barrelAmt',     label: 'BARREL',          group: 'CRT', min: 0, max: 1, step: 0.01, value: 0.25, hint: 'CRT barrel distortion' },
  { key: 'vignetteAmt',   label: 'VIGNETTE',        group: 'CRT', min: 0, max: 1, step: 0.01, value: 0.4,  hint: 'Corner darkening of the tube' },
  { key: 'crtBlend',      label: 'CRT BLEND',       group: 'CRT', min: 0, max: 1, step: 0.01, value: 1.0,  hint: 'Overall blend with the clean image' },
];

export class AnalogNode implements EngineNode {
  readonly id = 'analog';
  readonly name = 'ANALOG';
  enabled = true;
  readonly params: ParamSchema[];
  private v: Record<string, number> = {};

  private sortProg: WebGLProgram | null = null;
  private fbkProg: WebGLProgram | null = null;
  private crtProg: WebGLProgram | null = null;
  private pingA: Target | null = null;
  private pingB: Target | null = null;
  private fbkState: Target | null = null;
  private out: Target | null = null;
  private U: Record<string, Record<string, WebGLUniformLocation | null>> = {};

  constructor() {
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

  private locate(gl: WebGL2RenderingContext, name: string, prog: WebGLProgram, names: string[]): void {
    this.U[name] = {};
    names.forEach((u) => { this.U[name][u] = gl.getUniformLocation(prog, u); });
  }

  init(gl: WebGL2RenderingContext): void {
    this.sortProg = compileProgram(gl, QUAD_VS, SORT_FS);
    this.fbkProg = compileProgram(gl, QUAD_VS, FBK_FS);
    this.crtProg = compileProgram(gl, QUAD_VS, CRT_FS);
    this.locate(gl, 'sort', this.sortProg, ['uTex', 'uParity', 'uThresh', 'uWidth']);
    this.locate(gl, 'fbk', this.fbkProg, ['uTex', 'uPrev', 'uAmt', 'uZoom', 'uRot', 'uDecay', 'uHue', 'uDriftX']);
    this.locate(gl, 'crt', this.crtProg, ['uTex', 'uTime', 'uTear', 'uChroma', 'uNoise', 'uRollBar', 'uScanlines', 'uBarrel', 'uVignette', 'uCrtBlend']);
  }

  resize(_w: number, _h: number): void { /* targets rebuilt lazily in render */ }

  private ensureTargets(gl: WebGL2RenderingContext, w: number, h: number): void {
    if (this.out && this.out.w === w && this.out.h === h) return;
    [this.pingA, this.pingB, this.fbkState, this.out].forEach((t) => destroyTarget(gl, t));
    this.pingA = createTarget(gl, w, h);
    this.pingB = createTarget(gl, w, h);
    this.fbkState = createTarget(gl, w, h);
    this.out = createTarget(gl, w, h);
  }

  render(ctx: NodeRenderContext): WebGLTexture {
    const { gl, inputTex, width, height, time, drawQuad } = ctx;
    this.ensureTargets(gl, width, height);
    const v = this.v;
    let cur = inputTex;

    // 1 — pixel sort: even/odd transposition ping-pong
    if (v.sortEnabled >= 0.5) {
      let read = cur;
      let a = this.pingA!, b = this.pingB!;
      const passes = Math.round(v.sortPasses);
      for (let i = 0; i < passes; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, a.fbo);
        gl.viewport(0, 0, width, height);
        gl.useProgram(this.sortProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, read);
        gl.uniform1i(this.U.sort.uTex, 0);
        gl.uniform1f(this.U.sort.uParity, i % 2);
        gl.uniform1f(this.U.sort.uThresh, v.sortThresh);
        gl.uniform1f(this.U.sort.uWidth, width);
        drawQuad();
        read = a.tex;
        [a, b] = [b, a];
      }
      cur = read;
    }

    // 2 — feedback: mix with the persistent previous output, then persist.
    //     pingB (free after sort loop ends on pingA side) holds the new mix.
    const mixT = cur === this.pingB!.tex ? this.pingA! : this.pingB!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, mixT.fbo);
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.fbkProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, cur);
    gl.uniform1i(this.U.fbk.uTex, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.fbkState!.tex);
    gl.uniform1i(this.U.fbk.uPrev, 1);
    gl.uniform1f(this.U.fbk.uAmt, v.feedbackAmt);
    gl.uniform1f(this.U.fbk.uZoom, v.feedbackZoom);
    gl.uniform1f(this.U.fbk.uRot, v.feedbackRot);
    gl.uniform1f(this.U.fbk.uDecay, v.feedbackDecay);
    gl.uniform1f(this.U.fbk.uHue, v.hueShift);
    gl.uniform1f(this.U.fbk.uDriftX, v.feedbackDriftX);
    drawQuad();
    cur = mixT.tex;

    // persist the mixed frame as next frame's feedback source
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, mixT.fbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fbkState!.fbo);
    gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);

    // 3 — CRT / glitch pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.out!.fbo);
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.crtProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, cur);
    gl.uniform1i(this.U.crt.uTex, 0);
    gl.uniform1f(this.U.crt.uTime, time);
    gl.uniform1f(this.U.crt.uTear, v.tearAmt);
    gl.uniform1f(this.U.crt.uChroma, v.chromaAmt);
    gl.uniform1f(this.U.crt.uNoise, v.noiseAmt);
    gl.uniform1f(this.U.crt.uRollBar, v.rollBar);
    gl.uniform1f(this.U.crt.uScanlines, v.scanlinesAmt);
    gl.uniform1f(this.U.crt.uBarrel, v.barrelAmt);
    gl.uniform1f(this.U.crt.uVignette, v.vignetteAmt);
    gl.uniform1f(this.U.crt.uCrtBlend, v.crtBlend);
    drawQuad();
    return this.out!.tex;
  }

  dispose(gl: WebGL2RenderingContext): void {
    [this.sortProg, this.fbkProg, this.crtProg].forEach((p) => { if (p) gl.deleteProgram(p); });
    [this.pingA, this.pingB, this.fbkState, this.out].forEach((t) => destroyTarget(gl, t));
    this.pingA = this.pingB = this.fbkState = this.out = null;
  }
}
