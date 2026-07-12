import { ParamSchema } from '../../bridge/types';
import { EngineNode, NodeRenderContext, Target, QUAD_VS, compileProgram, createTarget, destroyTarget } from '../SynEngine';

/* ═══════════════════════════════════════════════════════════════
   ANAMORPHIC LAB node — native port of the lab's single-pass lens
   pipeline: chromatic aberration → exposure → aniso bokeh bloom +
   halation → filmic temp/lift/contrast/sat/rolloff grade → grain
   → oval vignette → horizontal flare (CPU hotspot auto-detect on
   an 80×45 buffer, same math as the standalone) → letterbox /
   breathing / squeeze / barrel optics.
   Parameter keys match the standalone effect.
   ═══════════════════════════════════════════════════════════════ */

const ANAM_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform float uTime;
uniform float uTemp, uLift, uContrast, uSat, uRolloff, uExposure;
uniform float uHalation, uGrain, uBokeh, uCA;
uniform float uBarrel, uVignette, uLetterbox, uRatio, uVideoAR, uBreathing, uSqueeze;
uniform float uFlareAmt, uFlareX, uFlareActive, uFlarePhase, uFlareJitter;
uniform float uFlareLength, uFlareColor, uFlareHeight;
out vec4 o;

float rng(vec2 c){ return fract(sin(dot(c, vec2(12.9898,78.233)))*43758.5453); }
float hash3(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
float luminance(vec3 c){ return dot(c, vec3(0.299,0.587,0.114)); }

vec2 squeezeUV(vec2 uv, float sq){
  if(sq < 1.001) return uv;
  return vec2(clamp(0.5+(uv.x-0.5)*sq, 0.001, 0.999), uv.y);
}
vec2 barrel(vec2 uv, float k){
  vec2 c = uv-0.5;
  float r2 = dot(c,c);
  c.x += c.x*r2*(k*0.35);
  c.y += c.y*r2*(k*1.20);
  return c+0.5;
}

vec3 halation(vec2 uv, float str){
  if(str < 0.01) return vec3(0.0);
  float r = 0.010*str;
  vec3 s = vec3(0.0);
  s += texture(uTex, uv+vec2( r*2.4, 0.0)).rgb;
  s += texture(uTex, uv+vec2(-r*2.4, 0.0)).rgb;
  s += texture(uTex, uv+vec2( r*1.4,  r*0.5)).rgb;
  s += texture(uTex, uv+vec2(-r*1.4,  r*0.5)).rgb;
  s += texture(uTex, uv+vec2( r*1.4, -r*0.5)).rgb;
  s += texture(uTex, uv+vec2(-r*1.4, -r*0.5)).rgb;
  s += texture(uTex, uv+vec2(0.0,  r*0.8)).rgb;
  s += texture(uTex, uv+vec2(0.0, -r*0.8)).rgb;
  s /= 8.0;
  float mask = smoothstep(0.52, 0.92, luminance(s));
  return s*vec3(1.60,0.68,0.18)*mask*str*0.52;
}

vec3 anisoBokehBloom(vec2 uv, float str){
  if(str < 0.01) return vec3(0.0);
  float w = str*0.018;
  vec3 acc = vec3(0.0);
  float tw = 0.0;
  float taps[7] = float[7](0.22, 0.18, 0.14, 0.12, 0.14, 0.18, 0.22);
  for(int i=0;i<7;i++){
    vec2 off = vec2(float(i-3)*w, 0.0);
    vec3 s = texture(uTex, uv+off).rgb;
    float hi = smoothstep(0.62, 0.98, luminance(s));
    acc += s*hi*taps[i];
    tw += taps[i]*hi;
  }
  if(tw < 0.0001) return vec3(0.0);
  acc /= tw;
  float gate = smoothstep(0.55, 0.95, luminance(texture(uTex, uv).rgb));
  return acc*str*0.85*gate;
}

vec3 chromAb(vec2 uv, float str){
  if(str < 0.01) return texture(uTex, uv).rgb;
  float dist = length(uv-0.5)*1.4;
  vec2 shift = (uv-0.5)*str*0.015*dist;
  return vec3(texture(uTex, uv+shift).r, texture(uTex, uv).g, texture(uTex, uv-shift).b);
}

vec3 instaxVhsGrain(vec2 uv, float t, float str, float lum){
  if(str < 0.004) return vec3(0.0);
  float frame = floor(t*18.0)/18.0;
  vec2 q = uv*vec2(1.0,1.15);
  float n1 = hash3(vec3(q*vec2(420.0,380.0), frame));
  float n2 = hash3(vec3(q*vec2(90.0,110.0), frame*1.7));
  float n3 = hash3(vec3(q*vec2(18.0,22.0), frame*0.4));
  float blob = smoothstep(0.35,0.72,n2)*0.9+0.25;
  float line = sin(uv.y*720.0+t*3.1)*0.5+0.5;
  line = pow(line, 6.0)*0.35;
  vec3 g = vec3(n1-0.5, n1-0.48, n1-0.52);
  g.r += 0.08*sin(uv.y*900.0+frame*12.0);
  g.b += 0.06*cos(uv.x*640.0-frame*9.0);
  g *= mix(0.65, blob, 0.85);
  g.r *= 1.12; g.g *= 0.92; g.b *= 1.08;
  float vhsBleed = smoothstep(0.2,0.55,n3)*0.22;
  g += vec3(vhsBleed*0.4, vhsBleed*0.15, -vhsBleed*0.1);
  float scan = line*str*0.45;
  g += vec3(scan*0.08, scan*0.05, scan*0.12);
  float mid = smoothstep(0.05,0.22,lum)*smoothstep(0.92,0.48,lum);
  float hiSup = 1.0-smoothstep(0.78,0.98,lum);
  return g*mid*hiSup*str*0.22;
}

float shoulderCh(float x, float rolloff, float kneeShape){
  float knee = mix(0.88, 0.58, rolloff);
  float a = mix(2.5, 8.0, rolloff)*kneeShape;
  float b = mix(0.2, 0.55, rolloff);
  float t = max(x-knee, 0.0);
  float compressed = knee + t/(1.0+a*t+b*t*t);
  return mix(x, compressed, smoothstep(knee-0.08, knee+0.02, x));
}
vec3 filmicShoulder(vec3 c, float rolloff, float kneeShape){
  if(rolloff < 0.001) return c;
  return vec3(shoulderCh(c.r,rolloff,kneeShape), shoulderCh(c.g,rolloff,kneeShape), shoulderCh(c.b,rolloff,kneeShape));
}

vec3 tempGrade(vec3 c, float temp, float lift, float contrast, float sat, float rolloff){
  c = mix(vec3(lift), vec3(1.0-lift*0.12), c);
  float k = contrast*0.55;
  c = c*(1.0+k)-k*0.5;
  c = clamp(c, 0.0, 1.0);
  c = filmicShoulder(c, rolloff, 1.0);
  float lum = luminance(c);
  float absT = abs(temp);
  vec3 shTint, mdTint, hiTint;
  if(temp >= 0.0){
    shTint = mix(vec3(1.0), vec3(1.08,0.76,0.36), absT);
    mdTint = mix(vec3(1.0), vec3(1.03,0.94,0.70), absT);
    hiTint = mix(vec3(1.0), vec3(1.01,0.98,0.87), absT);
  } else {
    shTint = mix(vec3(1.0), vec3(0.54,0.78,1.22), absT);
    mdTint = mix(vec3(1.0), vec3(0.78,0.90,1.10), absT);
    hiTint = mix(vec3(1.0), vec3(0.90,0.96,1.07), absT);
  }
  vec3 tint = lum < 0.5 ? mix(shTint, mdTint, lum*2.0) : mix(mdTint, hiTint, (lum-0.5)*2.0);
  c = mix(c, c*tint, 0.55);
  float g = luminance(c);
  c = mix(vec3(g), c, sat);
  return clamp(c, 0.0, 1.0);
}

vec3 anamFlare(vec2 uv, float amt, float fx, float act, float t, float phase, float jx, float lenP, float colP, float hgtP){
  if(amt < 0.01 || act < 0.5) return vec3(0.0);
  float n1 = hash3(vec3(uv.x*40.0+uv.y*40.0, t*2.7, phase));
  float n2 = hash3(vec3(uv.x*120.0+uv.y*120.0, t*5.1, phase*0.3));
  float flick = 0.88+0.14*sin(t*6.2+phase*12.0)+0.08*(n1-0.5);
  float micro = 0.97+0.06*sin(uv.y*180.0+t*3.0)+0.04*(n2-0.5);
  float fxw = fx+jx*0.012;
  float dy = uv.y-0.5;
  float dx = uv.x-fxw;
  dy += sin(t*1.1+uv.y*25.0)*0.004;
  float decayS1 = mix(1.4, 0.1, lenP);
  float decayS2 = mix(0.5, 0.06, lenP);
  float vDecayS1 = mix(160.0, 30.0, hgtP);
  float vDecayS2 = mix(34.0, 6.0, hgtP);
  float s1 = exp(-dy*dy*vDecayS1)*exp(-abs(dx)*decayS1);
  float s2 = exp(-dy*dy*vDecayS2)*exp(-abs(dx)*decayS2);
  float dirt = smoothstep(0.35, 0.85, rng(uv*3.7+t*0.2));
  vec3 coreCol = mix(vec3(1.0,0.80,0.30), vec3(0.35,0.55,1.0), colP);
  vec3 haloCol = mix(vec3(0.20,0.40,1.0), vec3(0.10,0.20,0.55), colP);
  vec3 col = vec3(0.0);
  col += coreCol*s1*0.95*flick*micro;
  col += haloCol*s2*0.28*flick;
  col *= mix(0.85, 1.15, dirt);
  vec3 ghostA = mix(vec3(1.0,0.5,0.15), vec3(0.35,0.55,1.0), colP);
  vec3 ghostB = mix(vec3(0.25,0.50,1.0), vec3(0.15,0.30,0.75), colP);
  for(float i=1.0;i<=5.0;i++){
    float ox = fxw-(fxw-0.5)*(i*0.22);
    float oy = 0.5+0.02*sin(t*0.9+i*1.7)+0.015*(hash3(vec3(i,t,uv.x))-0.5);
    vec2 d = vec2((uv.x-ox)*3.0, (uv.y-oy)*6.0);
    float sp = smoothstep(0.17, 0.0, length(d))*0.32;
    sp *= 0.9+0.2*hash3(vec3(i*7.1, uv.y*50.0, t*4.0));
    col += mix(ghostA, ghostB, mod(i,2.0))*sp*flick;
  }
  return col*amt;
}

float anamVig(vec2 uv, float str){
  vec2 d = (uv-0.5)*vec2(0.82,1.18);
  return clamp(1.0-dot(d,d)*str*2.8, 0.0, 1.0);
}
vec2 breathe(vec2 uv, float en, float t){
  if(en < 0.5) return uv;
  return (uv-0.5)*(1.0+sin(t*0.52)*0.004)+0.5;
}

void main(){
  vec2 uv = vUV;
  vec2 uvScr = uv;

  if(uLetterbox > 0.5 && uVideoAR > 0.1){
    float cropF = clamp(uVideoAR/uRatio, 0.05, 1.0);
    float top = (1.0-cropF)*0.5;
    if(uv.y < top || uv.y > 1.0-top){ o = vec4(0.0,0.0,0.0,1.0); return; }
    uv.y = (uv.y-top)/cropF;
    uvScr = uv;
  }

  uv = breathe(uvScr, uBreathing, uTime);
  uv = clamp(uv, 0.001, 0.999);
  vec2 uvTex = squeezeUV(uv, uSqueeze);
  vec2 dUV = clamp(barrel(uvTex, uBarrel), 0.001, 0.999);

  vec3 base = chromAb(dUV, uCA);
  float preLum = luminance(base);
  base = clamp(base*pow(2.0, uExposure), 0.0, 1.0);

  vec3 col = base + anisoBokehBloom(dUV, uBokeh) + halation(dUV, uHalation);
  col = tempGrade(col, uTemp, uLift, uContrast, uSat, uRolloff);
  col += instaxVhsGrain(uvScr, uTime, uGrain, preLum);
  col *= anamVig(uvScr, uVignette);
  col += anamFlare(vec2(vUV.x, uvScr.y), uFlareAmt, uFlareX, uFlareActive, uTime, uFlarePhase, uFlareJitter, uFlareLength, uFlareColor, uFlareHeight);

  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

interface Def { key: string; label: string; group: string; min: number; max: number; step: number; value: number; hint: string; bool?: boolean }

const DEFS: Def[] = [
  { key: 'exposure',    label: 'EXPOSURE',          group: 'COLOR', min: -2, max: 2, step: 0.02, value: 0, hint: 'Exposure in stops (-2 to +2)' },
  { key: 'temp',        label: 'TEMPERATURE',       group: 'COLOR', min: -1, max: 1, step: 0.01, value: 0.55, hint: 'Color temperature, negative=cool positive=warm' },
  { key: 'lift',        label: 'LIFT',              group: 'COLOR', min: 0, max: 0.15, step: 0.002, value: 0.045, hint: 'Black lift (film fade look)' },
  { key: 'contrast',    label: 'CONTRAST',          group: 'COLOR', min: 0, max: 1, step: 0.01, value: 0.3, hint: 'Filmic contrast amount' },
  { key: 'sat',         label: 'SATURATION',        group: 'COLOR', min: 0, max: 1.8, step: 0.01, value: 0.82, hint: 'Color saturation (0-1.8)' },
  { key: 'rolloff',     label: 'HIGHLIGHT ROLLOFF', group: 'COLOR', min: 0, max: 1, step: 0.01, value: 0.55, hint: 'Filmic highlight rolloff softness' },
  { key: 'grain',       label: 'GRAIN',             group: 'COLOR', min: 0, max: 1, step: 0.01, value: 0, hint: 'Film grain amount' },
  { key: 'bokeh',       label: 'BOKEH BLOOM',       group: 'GLASS', min: 0, max: 1, step: 0.01, value: 0.35, hint: 'Anisotropic highlight bloom amount' },
  { key: 'halation',    label: 'HALATION',          group: 'GLASS', min: 0, max: 1, step: 0.01, value: 0.45, hint: 'Warm glow around highlights (film halation)' },
  { key: 'ca',          label: 'CHROM ABERRATION',  group: 'GLASS', min: 0, max: 1, step: 0.01, value: 0.25, hint: 'Chromatic aberration at frame edges' },
  { key: 'squeeze',     label: 'SQUEEZE',           group: 'ANAMORPHIC', min: 1, max: 2.2, step: 0.02, value: 1, hint: 'Anamorphic horizontal squeeze (1=off, 2=2x)' },
  { key: 'ratio',       label: 'ASPECT RATIO',      group: 'ANAMORPHIC', min: 1.78, max: 2.8, step: 0.01, value: 2.39, hint: 'Target widescreen aspect ratio (1.78-2.80)' },
  { key: 'barrel',      label: 'BARREL',            group: 'ANAMORPHIC', min: 0, max: 1, step: 0.01, value: 0.22, hint: 'Lens barrel distortion' },
  { key: 'vignette',    label: 'VIGNETTE',          group: 'ANAMORPHIC', min: 0, max: 1, step: 0.01, value: 0.4, hint: 'Anamorphic oval vignette' },
  { key: 'letterbox',   label: 'LETTERBOX',         group: 'ANAMORPHIC', min: 0, max: 1, step: 1, value: 0, hint: 'Crop to the target aspect ratio', bool: true },
  { key: 'breathing',   label: 'BREATHING',         group: 'ANAMORPHIC', min: 0, max: 1, step: 1, value: 0, hint: 'Subtle lens-breathing zoom oscillation', bool: true },
  { key: 'flareMaster', label: 'FLARE MASTER',      group: 'FLARE', min: 0, max: 1, step: 1, value: 0, hint: 'Master switch of the flare engine (hotspot auto-detect)', bool: true },
  { key: 'flareAmt',    label: 'FLARE AMOUNT',      group: 'FLARE', min: 0, max: 1, step: 0.01, value: 0.6, hint: 'Horizontal lens flare intensity' },
  { key: 'flareLength', label: 'FLARE LENGTH',      group: 'FLARE', min: 0, max: 1, step: 0.01, value: 0.5, hint: 'Horizontal stretch of the flare streaks' },
  { key: 'flareColor',  label: 'FLARE COLOR',       group: 'FLARE', min: 0, max: 1, step: 0.01, value: 0, hint: 'Flare hue (0=classic yellow, 1=blue)' },
  { key: 'flareHeight', label: 'FLARE HEIGHT',      group: 'FLARE', min: 0, max: 1, step: 0.01, value: 0.5, hint: 'Vertical thickness of the flare streaks' },
];

const FW = 80; // flare hotspot analysis buffer, same grid as the standalone
const FH = 45;

const smoothstepJs = (e0: number, e1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export class AnamorphicNode implements EngineNode {
  readonly id = 'anamorphic_lab';
  readonly name = 'ANAMORPHIC LAB';
  enabled = true;
  readonly params: ParamSchema[];
  private v: Record<string, number> = {};

  private prog: WebGLProgram | null = null;
  private target: Target | null = null;
  private U: Record<string, WebGLUniformLocation | null> = {};

  private flareCv = document.createElement('canvas');
  private flareCtx = this.flareCv.getContext('2d', { willReadFrequently: true })!;
  private flareX = 0.5;
  private flareActive = 0;
  private flarePhase = 0;
  private targetFlareX = 0.5;
  private smoothFlareX = 0.5;
  private flareJitter = 0;

  constructor() {
    this.flareCv.width = FW;
    this.flareCv.height = FH;
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
    this.prog = compileProgram(gl, QUAD_VS, ANAM_FS);
    ['uTex', 'uTime', 'uTemp', 'uLift', 'uContrast', 'uSat', 'uRolloff', 'uExposure',
     'uHalation', 'uGrain', 'uBokeh', 'uCA',
     'uBarrel', 'uVignette', 'uLetterbox', 'uRatio', 'uVideoAR', 'uBreathing', 'uSqueeze',
     'uFlareAmt', 'uFlareX', 'uFlareActive', 'uFlarePhase', 'uFlareJitter',
     'uFlareLength', 'uFlareColor', 'uFlareHeight',
    ].forEach((u) => { this.U[u] = gl.getUniformLocation(this.prog!, u); });
  }

  resize(_w: number, _h: number): void { /* target rebuilt lazily in render */ }

  /** hotspot auto-detect on the source — same math as the standalone */
  private detectFlare(source: TexImageSource): void {
    this.flareCtx.drawImage(source as CanvasImageSource, 0, 0, FW, FH);
    const d = this.flareCtx.getImageData(0, 0, FW, FH).data;
    const th = 185;
    let sumX = 0, sumW = 0, maxL = 0, second = 0;
    for (let i = 0; i < FW * FH; i++) {
      const l = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
      if (l > maxL) { second = maxL; maxL = l; }
      else if (l > second) second = l;
      if (l > th) {
        const w = (l - th) / 70;
        sumX += ((i % FW) + 0.5) * w;
        sumW += w;
      }
    }
    const spread = (maxL - second) / 255;
    const confidence = Math.min(1, sumW / 120) * (0.5 + 0.5 * smoothstepJs(0, 0.25, spread));
    if (sumW > 8 && maxL > th) {
      this.targetFlareX = sumX / sumW / FW;
      this.flareActive = confidence;
    } else {
      this.flareActive = 0;
    }
    this.flarePhase += 0.07 + this.flareActive * 0.12;
    this.smoothFlareX += (this.targetFlareX - this.smoothFlareX) * 0.18;
    this.flareX = this.smoothFlareX;
    this.flareJitter += (Math.random() - 0.5) * 0.08;
    this.flareJitter *= 0.82;
  }

  render(ctx: NodeRenderContext): WebGLTexture {
    const { gl, inputTex, width, height, time, frame, drawQuad, source } = ctx;
    if (!this.target || this.target.w !== width || this.target.h !== height) {
      destroyTarget(gl, this.target);
      this.target = createTarget(gl, width, height);
    }
    const v = this.v;

    // the standalone samples hotspots every 160 ms; every 10th frame ≈ the same
    if (v.flareMaster >= 0.5 && source && frame % 10 === 0) this.detectFlare(source);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target.fbo);
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, inputTex);
    gl.uniform1i(this.U.uTex, 0);
    gl.uniform1f(this.U.uTime, time);
    gl.uniform1f(this.U.uTemp, v.temp);
    gl.uniform1f(this.U.uLift, v.lift);
    gl.uniform1f(this.U.uContrast, v.contrast);
    gl.uniform1f(this.U.uSat, v.sat);
    gl.uniform1f(this.U.uRolloff, v.rolloff);
    gl.uniform1f(this.U.uExposure, v.exposure);
    gl.uniform1f(this.U.uHalation, v.halation);
    gl.uniform1f(this.U.uGrain, v.grain);
    gl.uniform1f(this.U.uBokeh, v.bokeh);
    gl.uniform1f(this.U.uCA, v.ca);
    gl.uniform1f(this.U.uBarrel, v.barrel);
    gl.uniform1f(this.U.uVignette, v.vignette);
    gl.uniform1f(this.U.uLetterbox, v.letterbox);
    gl.uniform1f(this.U.uRatio, v.ratio);
    gl.uniform1f(this.U.uVideoAR, width / Math.max(1, height));
    gl.uniform1f(this.U.uBreathing, v.breathing);
    gl.uniform1f(this.U.uSqueeze, v.squeeze);
    gl.uniform1f(this.U.uFlareAmt, v.flareAmt * v.flareMaster);
    gl.uniform1f(this.U.uFlareX, this.flareX);
    gl.uniform1f(this.U.uFlareActive, this.flareActive);
    gl.uniform1f(this.U.uFlarePhase, this.flarePhase);
    gl.uniform1f(this.U.uFlareJitter, this.flareJitter);
    gl.uniform1f(this.U.uFlareLength, v.flareLength);
    gl.uniform1f(this.U.uFlareColor, v.flareColor);
    gl.uniform1f(this.U.uFlareHeight, v.flareHeight);
    drawQuad();
    return this.target.tex;
  }

  dispose(gl: WebGL2RenderingContext): void {
    if (this.prog) gl.deleteProgram(this.prog);
    destroyTarget(gl, this.target);
    this.target = null;
  }
}
