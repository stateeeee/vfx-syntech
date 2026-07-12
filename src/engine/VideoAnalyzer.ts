/* ═══════════════════════════════════════════════════════════════
   VIDEO ANALYZER — native video reactivity for SynEngine (PLAN.md
   §4.4: the video half of the Auto control mix). Per-frame luma
   frame-differencing on a tiny 80×45 grid gives a 0..1 MOTION
   signal, plus mean BRIGHTNESS — both routable onto node params
   through the ParamBus, exactly like the audio bands.
   ═══════════════════════════════════════════════════════════════ */

const AW = 80;
const AH = 45;
/** raw frame-difference is small for normal footage; gain maps it to ~0..1 */
const MOTION_GAIN = 4;

export class VideoAnalyzer {
  private cv = document.createElement('canvas');
  private ctx = this.cv.getContext('2d', { willReadFrequently: true })!;
  private prev = new Float32Array(AW * AH);
  private hasPrev = false;

  /** 0..1 smoothed mean luma change between consecutive frames */
  motion = 0;
  /** 0..1 mean luma of the current frame */
  bright = 0;

  constructor() {
    this.cv.width = AW;
    this.cv.height = AH;
  }

  reset(): void {
    this.hasPrev = false;
    this.motion = 0;
    this.bright = 0;
  }

  /** call once per frame with the engine source (null = no signal) */
  tick(source: TexImageSource | null): void {
    if (!source) {
      this.reset();
      return;
    }
    try {
      this.ctx.drawImage(source as CanvasImageSource, 0, 0, AW, AH);
    } catch {
      return; // source not ready yet
    }
    const d = this.ctx.getImageData(0, 0, AW, AH).data;
    const prev = this.prev;
    let diff = 0;
    let sum = 0;
    for (let i = 0; i < AW * AH; i++) {
      const lum = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
      sum += lum;
      if (this.hasPrev) diff += Math.abs(lum - prev[i]);
      prev[i] = lum;
    }
    this.bright = sum / (AW * AH) / 255;
    const raw = this.hasPrev ? Math.min(1, (diff / (AW * AH) / 255) * MOTION_GAIN) : 0;
    // light smoothing keeps the signal usable as a modulator without lag
    this.motion = this.motion * 0.6 + raw * 0.4;
    this.hasPrev = true;
  }
}
