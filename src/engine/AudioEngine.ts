/* ═══════════════════════════════════════════════════════════════
   AUDIO ENGINE — native audio reactivity for SynEngine (PLAN.md
   phase 5 / §4.4, plus §10 "Audio da file"). Two sources feed the
   same analysis: the microphone, or a loaded music track (essential
   for music videos). AnalyserNode → per-frame band levels (bass <
   250 Hz, treble > 4 kHz, same as the standalone effects) plus beat
   detection with a decaying envelope, routed onto node parameters
   by the ParamBus.
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

export type AudioMode = 'off' | 'mic' | 'file';

/** transport state of the loaded music track, for the UI */
export interface FileTransport {
  name: string;
  playing: boolean;
  currentTime: number;
  duration: number;
  loop: boolean;
}

const ZERO: AudioLevels = { bass: 0, loud: 0, treble: 0, beat: 0, bpm: null };

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private elSource: MediaElementAudioSourceNode | null = null;
  private objectUrl: string | null = null;
  private freq = new Uint8Array(0);
  private loudHist: number[] = [];
  private lastBeatT = 0;
  private beatIntervals: number[] = [];

  mode: AudioMode = 'off';
  fileName = '';
  levels: AudioLevels = { ...ZERO };
  /** beat triggers when loudness exceeds recent average × sensitivity */
  beatSens = 1.4;
  /** minimum seconds between detected beats */
  beatGap = 0.35;

  get active(): boolean { return this.mode !== 'off'; }

  private async ensureCtx(): Promise<AnalyserNode> {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.82;
      this.analyser = analyser;
      this.freq = new Uint8Array(analyser.frequencyBinCount);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    return this.analyser!;
  }

  /** microphone source */
  async startMic(): Promise<void> {
    if (this.mode === 'mic') return;
    this.stopSource();
    const analyser = await this.ensureCtx();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    this.ctx!.createMediaStreamSource(stream).connect(analyser);
    this.stream = stream;
    this.mode = 'mic';
  }

  /** back-compat alias */
  async start(): Promise<void> { return this.startMic(); }

  /** loaded music track source — analysed AND played back audibly */
  async startFile(file: File): Promise<void> {
    this.stopSource();
    const analyser = await this.ensureCtx();
    const el = new Audio();
    el.crossOrigin = 'anonymous';
    this.objectUrl = URL.createObjectURL(file);
    el.src = this.objectUrl;
    el.loop = true;
    await new Promise<void>((res, rej) => {
      el.onloadedmetadata = () => res();
      el.onerror = () => rej(new Error('could not decode this audio file'));
    });
    const src = this.ctx!.createMediaElementSource(el);
    src.connect(analyser);
    src.connect(this.ctx!.destination); // keep the music audible
    this.audioEl = el;
    this.elSource = src;
    this.fileName = file.name;
    this.mode = 'file';
    await el.play().catch(() => {}); // autoplay may need a later user gesture
  }

  /* ── file transport ─────────────────────────────────────────── */

  get transport(): FileTransport | null {
    const el = this.audioEl;
    if (this.mode !== 'file' || !el) return null;
    return {
      name: this.fileName,
      playing: !el.paused,
      currentTime: el.currentTime || 0,
      duration: isFinite(el.duration) ? el.duration : 0,
      loop: el.loop,
    };
  }

  togglePlay(): void {
    const el = this.audioEl;
    if (!el) return;
    if (el.paused) void el.play().catch(() => {});
    else el.pause();
  }

  seek(t: number): void { if (this.audioEl) this.audioEl.currentTime = t; }
  setLoop(on: boolean): void { if (this.audioEl) this.audioEl.loop = on; }

  /** release only the current source, keep the AudioContext alive */
  private stopSource(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.audioEl) { this.audioEl.pause(); this.audioEl.src = ''; }
    try { this.elSource?.disconnect(); } catch { /* already gone */ }
    this.elSource = null;
    this.audioEl = null;
    if (this.objectUrl) { URL.revokeObjectURL(this.objectUrl); this.objectUrl = null; }
    this.fileName = '';
    this.mode = 'off';
    this.loudHist = [];
    this.beatIntervals = [];
    this.lastBeatT = 0;
    this.levels = { ...ZERO };
  }

  stop(): void {
    this.stopSource();
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.analyser = null;
  }

  /** call once per rendered frame; `now` is performance.now() ms */
  tick(now: number): AudioLevels {
    const lv = this.levels;
    if (this.mode === 'off' || !this.analyser || !this.ctx) {
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
