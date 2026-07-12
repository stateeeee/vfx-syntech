import { ParamSchema } from '../../bridge/types';
import { EngineNode, NodeRenderContext, Target, QUAD_VS, compileProgram, createTarget, destroyTarget } from '../SynEngine';

/* ═══════════════════════════════════════════════════════════════
   ANALOG node — native port of the Analog effect's core looks
   (tear, chroma bleed, noise, roll bar, scanlines, barrel,
   vignette, CRT blend), single-pass GLSL. Parameter keys match
   the standalone effect so presets carry over.
   ═══════════════════════════════════════════════════════════════ */

const FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform float uTime;
uniform float uTear, uChroma, uNoise, uRollBar, uScanlines, uBarrel, uVignette, uCrtBlend;
out vec4 o;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main(){
  vec2 uv = vUV;

  // barrel distortion
  vec2 c = uv - 0.5;
  float r2 = dot(c, c);
  vec2 barrelUV = 0.5 + c * (1.0 + uBarrel * 0.35 * r2);

  // horizontal tear: occasional row displacement
  float band = floor(barrelUV.y * 90.0);
  float tearNoise = hash(vec2(band, floor(uTime * 13.0)));
  float tear = (tearNoise < uTear * 0.35) ? (hash(vec2(band, uTime)) - 0.5) * uTear * 0.25 : 0.0;
  vec2 suv = vec2(barrelUV.x + tear, barrelUV.y);

  // rolling luminance bar
  float roll = uRollBar * 0.25 * smoothstep(0.0, 0.12, 0.06 - abs(fract(suv.y + uTime * 0.15) - 0.5) * 0.12);

  // chroma bleed
  float ca = uChroma * 0.012;
  vec3 col;
  col.r = texture(uTex, suv + vec2(ca, 0.0)).r;
  col.g = texture(uTex, suv).g;
  col.b = texture(uTex, suv - vec2(ca, 0.0)).b;

  // analog noise
  float n = hash(suv * vec2(1920.0, 1080.0) + fract(uTime) * 917.0);
  col += (n - 0.5) * uNoise * 0.55;
  col += roll;

  // scanlines
  float sl = sin(suv.y * 1080.0 * 3.14159) * 0.5 + 0.5;
  col *= mix(1.0, 0.72 + 0.28 * sl, uScanlines);

  // vignette
  float vig = 1.0 - uVignette * smoothstep(0.35, 0.95, length(c) * 1.35);
  col *= vig;

  // outside the tube after barrel = black
  if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) col = vec3(0.0);

  vec3 clean = texture(uTex, uv).rgb;
  o = vec4(mix(clean, col, uCrtBlend), 1.0);
}`;

interface NumParam { key: string; label: string; min: number; max: number; step: number; value: number; hint: string }

const DEFS: NumParam[] = [
  { key: 'tearAmt',      label: 'TEAR',       min: 0, max: 1, step: 0.01, value: 0.25, hint: 'Horizontal sync tearing amount' },
  { key: 'chromaAmt',    label: 'CHROMA',     min: 0, max: 1, step: 0.01, value: 0.3,  hint: 'Chromatic aberration / color bleed' },
  { key: 'noiseAmt',     label: 'NOISE',      min: 0, max: 1, step: 0.01, value: 0.15, hint: 'Analog static noise amount' },
  { key: 'rollBar',      label: 'ROLL BAR',   min: 0, max: 1, step: 0.01, value: 0.0,  hint: 'Vertical rolling luminance bar' },
  { key: 'scanlinesAmt', label: 'SCANLINES',  min: 0, max: 1, step: 0.01, value: 0.5,  hint: 'Scanline intensity' },
  { key: 'barrelAmt',    label: 'BARREL',     min: 0, max: 1, step: 0.01, value: 0.25, hint: 'CRT barrel distortion' },
  { key: 'vignetteAmt',  label: 'VIGNETTE',   min: 0, max: 1, step: 0.01, value: 0.4,  hint: 'Corner darkening of the tube' },
  { key: 'crtBlend',     label: 'CRT BLEND',  min: 0, max: 1, step: 0.01, value: 1.0,  hint: 'Overall blend with the clean image' },
];

export class AnalogNode implements EngineNode {
  readonly id = 'analog';
  readonly name = 'ANALOG';
  enabled = true;
  readonly params: ParamSchema[];
  private values: Record<string, number> = {};
  private prog: WebGLProgram | null = null;
  private target: Target | null = null;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};

  constructor() {
    DEFS.forEach((d) => { this.values[d.key] = d.value; });
    this.params = DEFS.map((d) => ({
      key: d.key, label: d.label, type: 'number' as const,
      min: d.min, max: d.max, step: d.step, value: d.value,
      group: 'ANALOG', reactive: true, aiHint: d.hint,
    }));
  }

  setParam(key: string, value: unknown): void {
    const def = DEFS.find((d) => d.key === key);
    if (!def) return;
    const v = Number(value);
    if (isNaN(v)) return;
    this.values[key] = Math.max(def.min, Math.min(def.max, v));
  }

  getParam(key: string): unknown { return this.values[key]; }

  init(gl: WebGL2RenderingContext): void {
    this.prog = compileProgram(gl, QUAD_VS, FS);
    ['uTex', 'uTime', 'uTear', 'uChroma', 'uNoise', 'uRollBar', 'uScanlines', 'uBarrel', 'uVignette', 'uCrtBlend']
      .forEach((u) => { this.uniforms[u] = gl.getUniformLocation(this.prog!, u); });
  }

  resize(width: number, height: number): void {
    if (this.target && this.target.w === width && this.target.h === height) return;
    // target rebuilt lazily in render (needs gl)
    this.pendingSize = { w: width, h: height };
  }
  private pendingSize: { w: number; h: number } | null = { w: 2, h: 2 };

  render(ctx: NodeRenderContext): WebGLTexture {
    const { gl, inputTex, width, height, time, drawQuad } = ctx;
    if (this.pendingSize || !this.target || this.target.w !== width || this.target.h !== height) {
      destroyTarget(gl, this.target);
      this.target = createTarget(gl, width, height);
      this.pendingSize = null;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target.fbo);
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, inputTex);
    gl.uniform1i(this.uniforms.uTex, 0);
    gl.uniform1f(this.uniforms.uTime, time);
    const v = this.values;
    gl.uniform1f(this.uniforms.uTear, v.tearAmt);
    gl.uniform1f(this.uniforms.uChroma, v.chromaAmt);
    gl.uniform1f(this.uniforms.uNoise, v.noiseAmt);
    gl.uniform1f(this.uniforms.uRollBar, v.rollBar);
    gl.uniform1f(this.uniforms.uScanlines, v.scanlinesAmt);
    gl.uniform1f(this.uniforms.uBarrel, v.barrelAmt);
    gl.uniform1f(this.uniforms.uVignette, v.vignetteAmt);
    gl.uniform1f(this.uniforms.uCrtBlend, v.crtBlend);
    drawQuad();
    return this.target.tex;
  }

  dispose(gl: WebGL2RenderingContext): void {
    if (this.prog) gl.deleteProgram(this.prog);
    destroyTarget(gl, this.target);
    this.target = null;
  }
}
