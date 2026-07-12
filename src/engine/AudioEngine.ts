/* ═══════════════════════════════════════════════════════════════
   AUDIO ENGINE — native audio reactivity for SynEngine (PLAN.md
   phase 5 / §4.4). Microphone → AnalyserNode → per-frame band
   levels (same bands as the standalone effects: bass < 250 Hz,
   treble > 4 kHz) plus beat detection with a decaying envelope,
   ready to be routed onto node parameters by the ParamBus.
   ═══════════════════════════════════════════════════════════════ */

export interface AudioLevels {
  /** 0..1 mean energy below 250 Hz */
  bass: number;
  /** 0..1 mean energy across the whole spectrum */
  loud: number;
  /** 0..1 mean energy above 4 kHz */
  treble: number;
  /** decaying 1→0 envelope retriggered on every detected beat */
  beat: number;
  /** rough tempo estimate from recent beat intervals, null until stable */
  bpm: number | null;
}

const ZERO: AudioLevels = { bass: 0, loud: 0, treble: 0, beat: 0, bpm: null };

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private freq = new Uint8Array(0);
  private loudHist: number[] = [];
  private lastBeatT = 0;
  private beatIntervals: number[] = [];

  levels: AudioLevels = { ...ZERO };
  /** beat triggers when loudness exceeds recent average × sensitivity */
  beatSens = 1.4;
  /** minimum seconds between detected beats */
  beatGap = 0.35;

  get active(): boolean { return this.analyser !== null; }

  async start(): Promise<void> {
    if (this.analyser) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const ctx = new AudioContext();
    if (ctx.state === 'suspended') await ctx.resume();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.82;
    ctx.createMediaStreamSource(stream).connect(analyser);
    this.stream = stream;
    this.ctx = ctx;
    this.analyser = analyser;
    this.freq = new Uint8Array(analyser.frequencyBinCount);
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.analyser = null;
    this.loudHist = [];
    this.beatIntervals = [];
    this.lastBeatT = 0;
    this.levels = { ...ZERO };
  }

  /** call once per rendered frame; `now` is performance.now() ms */
  tick(now: number): AudioLevels {
    const lv = this.levels;
    if (!this.analyser || !this.ctx) {
      lv.beat *= 0.92;
      return lv;
    }
    this.analyser.getByteFrequencyData(this.freq);
    const n = this.freq.length;
    const nyquist = this.ctx.sampleRate / 2;
    const bassEnd = Math.max(1, Math.round((250 / nyquist) * n));
    const trebleStart = Math.round((4000 / nyquist) * n);
    let bS = 0, lS = 0, tS = 0, tN = 0;
    for (let i = 0; i < n; i++) {
      const v = this.freq[i];
      if (i < bassEnd) bS += v;
      lS += v;
      if (i >= trebleStart) { tS += v; tN++; }
    }
    lv.bass = bS / bassEnd / 255;
    lv.loud = lS / n / 255;
    lv.treble = tN > 0 ? tS / tN / 255 : 0;

    // beat: loudness spike over the recent (~1 s) average, rate-limited
    this.loudHist.push(lv.loud);
    if (this.loudHist.length > 60) this.loudHist.shift();
    const avg = this.loudHist.reduce((a, b) => a + b, 0) / this.loudHist.length;
    const tSec = now / 1000;
    if (lv.loud > 0.05 && lv.loud > avg * this.beatSens && tSec - this.lastBeatT > this.beatGap) {
      if (this.lastBeatT > 0) {
        this.beatIntervals.push(tSec - this.lastBeatT);
        if (this.beatIntervals.length > 8) this.beatIntervals.shift();
        if (this.beatIntervals.length >= 3) {
          const sorted = [...this.beatIntervals].sort((a, b) => a - b);
          lv.bpm = Math.round(60 / sorted[(sorted.length / 2) | 0]);
        }
      }
      this.lastBeatT = tSec;
      lv.beat = 1;
    } else {
      lv.beat *= 0.92;
    }
    return lv;
  }
}
