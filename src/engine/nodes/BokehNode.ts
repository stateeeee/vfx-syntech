import { ParamSchema } from '../../bridge/types';
import { EngineNode, NodeRenderContext, Target, QUAD_VS, compileProgram, createTarget, destroyTarget } from '../SynEngine';

/* ═══════════════════════════════════════════════════════════════
   BOKEH node — native port of the Bokeh effect's lens pipeline:
   1) bokeh disc blur (Poisson / swirl / explosive / anamorphic
      tap kernels in linear light with highlight bloom),
   2) post-blur UV distortion (swirl / explosive / squeeze),
   3) anamorphic optics (squeeze, barrel, letterbox, breathing,
      radial + elliptical vignette).
   Parameter keys match the standalone effect. With SEGMENTATION
   enabled the shared PersonMask service gates the blur so the
   subject stays sharp (mask absent → whole frame is background).
   ═══════════════════════════════════════════════════════════════ */

const BOKEH_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform sampler2D uMask;   /* person confidence mask, top-left space */
uniform float uHasMask;    /* 1 = subject gating active */
uniform float uRadius;
uniform float uBloom;
uniform int   uStyle;   /* 0=normal 1=swirly 2=explosive 3=anamorphic */
uniform vec2  uPx;
uniform float uAspect;
uniform float uTime;
out vec4 o;

vec3 toLinear(vec3 c){ return c*c; }
vec3 toSRGB(vec3 c)  { return sqrt(max(c, 0.0)); }

float maskAt(vec2 uv){
  if(uHasMask < 0.5) return 0.0;
  return texture(uMask, vec2(uv.x, 1.0 - uv.y)).r;
}

float gold(vec2 p, float seed){
  return fract(tan(distance(p*vec2(1.61803398874989,1.41421356237), p+seed))*p.x);
}

void tapAcc(vec2 uv, float w0, float bloomK, inout vec3 acc, inout float wt){
  uv = clamp(uv, 0.0, 1.0);
  vec3 lin = toLinear(texture(uTex, uv).rgb);
  float lum = dot(lin, vec3(0.299,0.587,0.114));
  /* subject pixels barely contribute to the background disc (halo guard) */
  float w = (1.0 + lum*lum*bloomK) * (1.0 - maskAt(uv)*0.88) * w0;
  acc += lin * w; wt += w;
}

void main(){
  /* person mask shrinks the circle of confusion: subject stays sharp */
  float selfMask = maskAt(vUV);
  float coc = pow(clamp(1.0 - selfMask, 0.0, 1.0), 1.35) * uRadius;
  if(coc < 0.6){ o = texture(uTex, vUV); return; }
  vec2 px = uPx;
  vec3 acc = vec3(0.0); float wt = 0.0;
  float bloomK = uBloom;
  float mgate = 1.0 - selfMask*0.88;

  tapAcc(vUV, mgate, bloomK, acc, wt);

  /* STYLE 0: NORMAL — 37-tap Poisson disc in 5 jittered rings */
  if(uStyle == 0){
    float rr; float a; vec2 t;
    rr = coc*0.20;
    for(int i=0;i<6;i++){
      a = float(i)*1.0472 + gold(vUV, float(i)*0.3+uTime*0.01)*0.25;
      t = vUV + vec2(cos(a)*rr*px.x, sin(a)*rr*px.y*uAspect);
      tapAcc(t, mgate, bloomK, acc, wt);
    }
    rr = coc*0.40;
    for(int i=0;i<8;i++){
      a = float(i)*0.7854 + gold(vUV, float(i)*0.7+uTime*0.013)*0.2;
      t = vUV + vec2(cos(a)*rr*px.x, sin(a)*rr*px.y*uAspect);
      tapAcc(t, mgate, bloomK, acc, wt);
    }
    rr = coc*0.60;
    for(int i=0;i<8;i++){
      a = float(i)*0.7854 + 0.39 + gold(vUV, float(i)*1.1+uTime*0.017)*0.18;
      t = vUV + vec2(cos(a)*rr*px.x, sin(a)*rr*px.y*uAspect);
      tapAcc(t, mgate, bloomK, acc, wt);
    }
    rr = coc*0.80;
    for(int i=0;i<8;i++){
      a = float(i)*0.7854 + 0.19 + gold(vUV, float(i)*1.5+uTime*0.021)*0.15;
      t = vUV + vec2(cos(a)*rr*px.x, sin(a)*rr*px.y*uAspect);
      tapAcc(t, mgate, bloomK, acc, wt);
    }
    rr = coc*1.00;
    for(int i=0;i<7;i++){
      a = float(i)*0.8976 + 0.44 + gold(vUV, float(i)*2.1+uTime*0.011)*0.12;
      t = vUV + vec2(cos(a)*rr*px.x, sin(a)*rr*px.y*uAspect);
      tapAcc(t, mgate, bloomK*1.3, acc, wt); /* outer ring: stronger highlight boost */
    }
  }

  /* STYLE 1: SWIRLY — spiral kernel, Helios-style bokeh */
  else if(uStyle == 1){
    float swirlK = 1.8;
    for(int i=0;i<30;i++){
      float fi = float(i)/30.0;
      float r = (0.2+fi*0.8)*coc;
      float a = fi*6.2832*2.5 + gold(vUV, fi*3.7+uTime*0.009)*0.3 + r*swirlK;
      vec2 t = vUV + vec2(cos(a)*r*px.x, sin(a)*r*px.y*uAspect);
      tapAcc(t, mgate, bloomK, acc, wt);
    }
  }

  /* STYLE 2: EXPLOSIVE — tight inner disc + radial burst streaks */
  else if(uStyle == 2){
    for(int i=0;i<12;i++){
      float a = float(i)*0.5236;
      float r = coc*(0.3+gold(vUV, float(i)*1.3+uTime*0.008)*0.25);
      tapAcc(vUV + vec2(cos(a)*r*px.x, sin(a)*r*px.y*uAspect), mgate, bloomK, acc, wt);
    }
    for(int i=0;i<8;i++){
      float a = float(i)*0.7854 + gold(vUV, float(i)*2.2+uTime*0.013)*0.1;
      for(int k=0;k<4;k++){
        float r = mix(coc*0.9, coc*2.0, float(k)/3.0);
        tapAcc(vUV + vec2(cos(a)*r*px.x, sin(a)*r*px.y*uAspect), mgate, bloomK*(1.0+float(k)*0.4), acc, wt);
      }
    }
  }

  /* STYLE 3: ANAMORPHIC 2.39:1 — elliptical rings + horizontal streak taps */
  else {
    float aX = 2.39, aY = 1.0;
    float eRadii[4] = float[4](0.25, 0.50, 0.75, 1.00);
    for(int ri=0;ri<4;ri++){
      float er = eRadii[ri]*coc;
      int nTaps = ri==0 ? 6 : (ri==1 ? 8 : (ri==2 ? 10 : 12));
      for(int i=0;i<12;i++){
        if(i >= nTaps) break;
        float a = float(i)*6.2832/float(nTaps) + gold(vUV, float(ri*12+i)*1.7+uTime*0.008)*0.15;
        vec2 t = vUV + vec2(cos(a)*er*aX*px.x, sin(a)*er*aY*px.y*uAspect);
        tapAcc(t, mgate, bloomK, acc, wt);
      }
    }
    for(int i=1;i<=8;i++){
      float xOff = float(i)*coc*0.45*px.x*aX;
      float lum1 = dot(toLinear(texture(uTex, clamp(vUV+vec2(xOff,0.0),0.0,1.0)).rgb), vec3(0.299,0.587,0.114));
      float lum2 = dot(toLinear(texture(uTex, clamp(vUV-vec2(xOff,0.0),0.0,1.0)).rgb), vec3(0.299,0.587,0.114));
      float fw  = lum1*lum1*bloomK*0.6*(1.0-float(i)/9.0);
      float fw2 = lum2*lum2*bloomK*0.6*(1.0-float(i)/9.0);
      tapAcc(vUV+vec2( xOff,0.0), mgate*fw,  bloomK, acc, wt);
      tapAcc(vUV+vec2(-xOff,0.0), mgate*fw2, bloomK, acc, wt);
    }
  }

  o = vec4(toSRGB(acc / max(wt, 0.001)), 1.0);
}`;

const DISTORT_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform int   uMode;      /* 1=swirl 2=explosive 3=anamorphic */
uniform float uSwirl;
uniform float uFalloff;
uniform float uExplosive;
uniform float uSqueeze;
uniform float uAspect;
out vec4 o;
void main(){
  vec2 center = vec2(0.5);
  vec2 delta = vUV - center;
  float r = length(vec2(delta.x*uAspect, delta.y));
  vec2 sampleUV = vUV;
  if(uMode == 1){
    float angle = uSwirl * exp(-r*r*uFalloff);
    float s = sin(angle); float c = cos(angle);
    sampleUV = center + vec2(delta.x*c - delta.y*s, delta.x*s + delta.y*c);
  } else if(uMode == 2){
    vec2 dir = delta / max(r, 0.001);
    sampleUV = vUV + dir * (uExplosive * r * 0.5);
  } else if(uMode == 3){
    sampleUV.x = center.x + delta.x * uSqueeze;
  }
  o = texture(uTex, clamp(sampleUV, 0.001, 0.999));
}`;

const OPTICS_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform float uVignette;      /* radial lens falloff              */
uniform float uSqueeze;       /* anamorphic horizontal squeeze    */
uniform float uBarrel;        /* oval-lens barrel distortion      */
uniform float uLetterbox;     /* 1=crop to uRatio toward centre   */
uniform float uRatio;         /* target widescreen aspect ratio   */
uniform float uVideoAR;       /* native canvas aspect ratio       */
uniform float uBreathing;     /* 1=lens-breathing oscillation     */
uniform float uAnamVignette;  /* elliptical anamorphic vignette   */
uniform float uTime;
out vec4 o;

vec2 squeezeUV(vec2 uv, float sq){
  if(sq <= 1.001) return uv;
  return vec2(clamp(0.5 + (uv.x-0.5)*sq, 0.001, 0.999), uv.y);
}
vec2 barrel(vec2 uv, float k){
  vec2 c = uv - 0.5;
  float r2 = dot(c, c);
  c.x += c.x*r2*(k*0.35);
  c.y += c.y*r2*(k*1.20);
  return c + 0.5;
}
float anamVig(vec2 uv, float str){
  vec2 d = (uv-0.5)*vec2(0.82,1.18);
  return clamp(1.0 - dot(d,d)*str*2.8, 0.0, 1.0);
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
  uv = breathe(uv, uBreathing, uTime);
  uv = clamp(uv, 0.001, 0.999);
  vec2 uvTex = squeezeUV(uv, uSqueeze);
  uvTex = clamp(barrel(uvTex, uBarrel), 0.001, 0.999);
  vec3 col = texture(uTex, uvTex).rgb;
  if(uVignette > 0.001){
    vec2 vc = uvTex*2.0-1.0;
    float vr = dot(vc, vc);
    col *= max(1.0 - vr*vr*uVignette*0.7, 0.0);
  }
  if(uAnamVignette > 0.001) col *= anamVig(uvScr, uAnamVignette);
  o = vec4(col, 1.0);
}`;

interface Def { key: string; label: string; group: string; min: number; max: number; step: number; value: number; hint: string; bool?: boolean }

const DEFS: Def[] = [
  { key: 'bokehRadius',      label: 'BOKEH RADIUS',   group: 'BOKEH', min: 0, max: 50, step: 0.5, value: 18, hint: 'Blur disc radius — overall depth-of-field strength (0 = sharp)' },
  { key: 'bokehStyle',       label: 'BOKEH STYLE',    group: 'BOKEH', min: 0, max: 3, step: 1, value: 0, hint: 'Disc kernel: 0=normal 1=swirly 2=explosive 3=anamorphic' },
  { key: 'bokehBloom',       label: 'BLOOM',          group: 'BOKEH', min: 0, max: 3, step: 0.01, value: 1.2, hint: 'Highlight boost inside the blur discs' },
  { key: 'bokehVignette',    label: 'VIGNETTE',       group: 'BOKEH', min: 0, max: 1, step: 0.01, value: 0.35, hint: 'Radial lens vignette falloff' },
  { key: 'distortMode',      label: 'DISTORT MODE',   group: 'DISTORT', min: 0, max: 3, step: 1, value: 0, hint: 'Post-blur distortion: 0=off 1=swirl 2=explosive 3=anamorphic' },
  { key: 'distortSwirl',     label: 'SWIRL ANGLE',    group: 'DISTORT', min: 0.1, max: 3.14, step: 0.01, value: 1.8, hint: 'Max swirl angle (radians) of the post-blur distortion' },
  { key: 'distortFalloff',   label: 'SWIRL FALLOFF',  group: 'DISTORT', min: 0.5, max: 10, step: 0.1, value: 2.5, hint: 'How quickly the swirl fades from the centre' },
  { key: 'distortExplosive', label: 'EXPLOSIVE',      group: 'DISTORT', min: 0, max: 1, step: 0.01, value: 0.4, hint: 'Outward explosive distortion amount' },
  { key: 'distortSqueeze',   label: 'SQUEEZE',        group: 'DISTORT', min: 1, max: 2, step: 0.01, value: 1.5, hint: 'Oval squeeze of the distortion field' },
  { key: 'anamSqueeze',      label: 'ANAM SQUEEZE',   group: 'ANAMORPHIC', min: 1, max: 2.2, step: 0.02, value: 1, hint: 'Horizontal anamorphic squeeze (1 = off, 2 = 2x)' },
  { key: 'anamRatio',        label: 'ASPECT RATIO',   group: 'ANAMORPHIC', min: 1.78, max: 2.8, step: 0.01, value: 2.39, hint: 'Target widescreen aspect ratio (1.78-2.80)' },
  { key: 'anamBarrel',       label: 'BARREL',         group: 'ANAMORPHIC', min: 0, max: 1, step: 0.01, value: 0.22, hint: 'Lens barrel distortion' },
  { key: 'anamVignette',     label: 'ANAM VIGNETTE',  group: 'ANAMORPHIC', min: 0, max: 1, step: 0.01, value: 0.4, hint: 'Elliptical anamorphic lens vignette' },
  { key: 'anamLetterbox',    label: 'LETTERBOX',      group: 'ANAMORPHIC', min: 0, max: 1, step: 1, value: 0, hint: 'Crop to the target aspect ratio', bool: true },
  { key: 'anamBreathing',    label: 'BREATHING',      group: 'ANAMORPHIC', min: 0, max: 1, step: 1, value: 0, hint: 'Subtle lens-breathing zoom oscillation', bool: true },
  { key: 'segEnabled',       label: 'SEGMENTATION',   group: 'SUBJECT', min: 0, max: 1, step: 1, value: 0, hint: 'Keep the detected person sharp while the background blurs (loads the segmentation model)', bool: true },
];

export class BokehNode implements EngineNode {
  readonly id = 'bokeh';
  readonly name = 'BOKEH';
  enabled = true;
  readonly params: ParamSchema[];
  private v: Record<string, number> = {};

  private bokehProg: WebGLProgram | null = null;
  private distortProg: WebGLProgram | null = null;
  private opticsProg: WebGLProgram | null = null;
  private tA: Target | null = null;
  private tB: Target | null = null;
  private out: Target | null = null;
  private maskTex: WebGLTexture | null = null;
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
    this.bokehProg = compileProgram(gl, QUAD_VS, BOKEH_FS);
    this.distortProg = compileProgram(gl, QUAD_VS, DISTORT_FS);
    this.opticsProg = compileProgram(gl, QUAD_VS, OPTICS_FS);
    this.locate(gl, 'bokeh', this.bokehProg, ['uTex', 'uMask', 'uHasMask', 'uRadius', 'uBloom', 'uStyle', 'uPx', 'uAspect', 'uTime']);
    this.maskTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([0]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.locate(gl, 'distort', this.distortProg, ['uTex', 'uMode', 'uSwirl', 'uFalloff', 'uExplosive', 'uSqueeze', 'uAspect']);
    this.locate(gl, 'optics', this.opticsProg, ['uTex', 'uVignette', 'uSqueeze', 'uBarrel', 'uLetterbox', 'uRatio', 'uVideoAR', 'uBreathing', 'uAnamVignette', 'uTime']);
  }

  resize(_w: number, _h: number): void { /* targets rebuilt lazily in render */ }

  private ensureTargets(gl: WebGL2RenderingContext, w: number, h: number): void {
    if (this.out && this.out.w === w && this.out.h === h) return;
    [this.tA, this.tB, this.out].forEach((t) => destroyTarget(gl, t));
    this.tA = createTarget(gl, w, h);
    this.tB = createTarget(gl, w, h);
    this.out = createTarget(gl, w, h);
  }

  render(ctx: NodeRenderContext): WebGLTexture {
    const { gl, inputTex, width, height, time, drawQuad } = ctx;
    this.ensureTargets(gl, width, height);
    const v = this.v;
    const aspect = width / Math.max(1, height);

    // 1 — bokeh disc blur (person mask keeps the subject sharp when present)
    const useMask = v.segEnabled >= 0.5 && !!ctx.personMask;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    if (useMask) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, ctx.personMask!);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.tA!.fbo);
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.bokehProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, inputTex);
    gl.uniform1i(this.U.bokeh.uTex, 0);
    gl.uniform1i(this.U.bokeh.uMask, 1);
    gl.uniform1f(this.U.bokeh.uHasMask, useMask ? 1 : 0);
    gl.uniform1f(this.U.bokeh.uRadius, v.bokehRadius);
    gl.uniform1f(this.U.bokeh.uBloom, v.bokehBloom);
    gl.uniform1i(this.U.bokeh.uStyle, Math.round(v.bokehStyle));
    gl.uniform2f(this.U.bokeh.uPx, 1 / width, 1 / height);
    gl.uniform1f(this.U.bokeh.uAspect, aspect);
    gl.uniform1f(this.U.bokeh.uTime, time);
    drawQuad();
    let cur = this.tA!.tex;

    // 2 — post-blur distortion (skipped when off)
    if (Math.round(v.distortMode) > 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.tB!.fbo);
      gl.viewport(0, 0, width, height);
      gl.useProgram(this.distortProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, cur);
      gl.uniform1i(this.U.distort.uTex, 0);
      gl.uniform1i(this.U.distort.uMode, Math.round(v.distortMode));
      gl.uniform1f(this.U.distort.uSwirl, v.distortSwirl);
      gl.uniform1f(this.U.distort.uFalloff, v.distortFalloff);
      gl.uniform1f(this.U.distort.uExplosive, v.distortExplosive);
      gl.uniform1f(this.U.distort.uSqueeze, v.distortSqueeze);
      gl.uniform1f(this.U.distort.uAspect, aspect);
      drawQuad();
      cur = this.tB!.tex;
    }

    // 3 — anamorphic optics
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.out!.fbo);
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.opticsProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, cur);
    gl.uniform1i(this.U.optics.uTex, 0);
    gl.uniform1f(this.U.optics.uVignette, v.bokehVignette);
    gl.uniform1f(this.U.optics.uSqueeze, v.anamSqueeze);
    gl.uniform1f(this.U.optics.uBarrel, v.anamBarrel);
    gl.uniform1f(this.U.optics.uLetterbox, v.anamLetterbox);
    gl.uniform1f(this.U.optics.uRatio, v.anamRatio);
    gl.uniform1f(this.U.optics.uVideoAR, aspect);
    gl.uniform1f(this.U.optics.uBreathing, v.anamBreathing);
    gl.uniform1f(this.U.optics.uAnamVignette, v.anamVignette);
    gl.uniform1f(this.U.optics.uTime, time);
    drawQuad();
    return this.out!.tex;
  }

  dispose(gl: WebGL2RenderingContext): void {
    [this.bokehProg, this.distortProg, this.opticsProg].forEach((p) => { if (p) gl.deleteProgram(p); });
    if (this.maskTex) gl.deleteTexture(this.maskTex);
    [this.tA, this.tB, this.out].forEach((t) => destroyTarget(gl, t));
    this.tA = this.tB = this.out = null;
  }
}
