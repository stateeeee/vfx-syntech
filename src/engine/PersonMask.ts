/* ═══════════════════════════════════════════════════════════════
   PERSON MASK — shared MediaPipe selfie segmentation service for
   SynEngine nodes (PLAN.md phase 5 parity: the standalone Bokeh
   and Blob Reveal builds gate their look on a person rotoscope).

   tasks-vision is lazy-loaded from the same CDN the standalone
   effects already use, only when a node actually asks for the
   mask (segEnabled). Everything degrades gracefully: while the
   model loads — or if the CDN/model is unreachable — nodes simply
   see "no mask" and render exactly as before.
   ═══════════════════════════════════════════════════════════════ */

const TASKS_VISION = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';
/** segmentation cadence — the standalone runs every N frames too */
const INTERVAL_MS = 100;

export type PersonMaskState = 'off' | 'loading' | 'ready' | 'error';

export class PersonMask {
  state: PersonMaskState = 'off';
  /** grayscale confidence mask (R channel), drawn top-left like the video */
  readonly maskCanvas = document.createElement('canvas');
  private maskCtx = this.maskCanvas.getContext('2d')!;
  private segmenter: any = null;
  private lastRun = 0;
  private lastTs = 0;
  private hasMask = false;

  constructor() {
    this.maskCanvas.width = 2;
    this.maskCanvas.height = 2;
  }

  get ready(): boolean { return this.state === 'ready' && this.hasMask; }

  /** kick off the lazy CDN load; safe to call every frame */
  enable(): void {
    if (this.state !== 'off') return;
    this.state = 'loading';
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const vision = await import(/* @vite-ignore */ `${TASKS_VISION}/vision_bundle.mjs`);
      const fileset = await vision.FilesetResolver.forVisionTasks(`${TASKS_VISION}/wasm`);
      this.segmenter = await vision.ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL },
        runningMode: 'VIDEO',
        outputConfidenceMasks: true,
      });
      this.state = 'ready';
    } catch (e) {
      console.warn('PersonMask: segmentation unavailable —', (e as Error).message);
      this.state = 'error';
    }
  }

  /** run segmentation on the source at most every INTERVAL_MS */
  tick(source: HTMLVideoElement | null, now: number): void {
    if (this.state !== 'ready' || !this.segmenter || !source || source.readyState < 2) return;
    if (now - this.lastRun < INTERVAL_MS) return;
    this.lastRun = now;
    // segmentForVideo needs a strictly increasing timestamp
    const ts = Math.max(this.lastTs + 1, Math.round(now));
    this.lastTs = ts;
    try {
      const res = this.segmenter.segmentForVideo(source, ts);
      const mask = res?.confidenceMasks?.[0];
      if (mask) {
        const w = mask.width, h = mask.height;
        if (this.maskCanvas.width !== w || this.maskCanvas.height !== h) {
          this.maskCanvas.width = w;
          this.maskCanvas.height = h;
        }
        const data = mask.getAsFloat32Array() as Float32Array;
        const img = this.maskCtx.createImageData(w, h);
        for (let i = 0; i < w * h; i++) {
          const v = Math.max(0, Math.min(255, Math.round(data[i] * 255)));
          img.data[i * 4] = v;
          img.data[i * 4 + 3] = 255;
        }
        this.maskCtx.putImageData(img, 0, 0);
        this.hasMask = true;
      }
      res?.close?.();
    } catch (e) {
      console.warn('PersonMask: segment failed —', (e as Error).message);
      this.state = 'error';
    }
  }

  dispose(): void {
    try { this.segmenter?.close?.(); } catch { /* already gone */ }
    this.segmenter = null;
    this.state = 'off';
    this.hasMask = false;
  }
}
