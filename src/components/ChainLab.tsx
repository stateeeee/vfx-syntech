import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowDown, ArrowUp, Camera, Diamond, Film, Link2, Mic, Power } from 'lucide-react';
import { SynEngine, EngineNode } from '../engine/SynEngine';
import { NODE_FACTORY } from '../engine/nodes';
import { AudioEngine, AudioLevels } from '../engine/AudioEngine';
import { ParamBus, AUDIO_SOURCES, AudioSource } from '../engine/params';
import { ModuleId } from '../types';

interface ChainLabProps {
  isDayMode: boolean;
  onBack: () => void;
  /**
   * Effects to start enabled, in chain order — set when the chain was
   * created by linking nodes on the brain graph. The remaining effects
   * are still added to the rack, just bypassed.
   */
  initialChain?: ModuleId[];
}

// default rack order: trackers first, lens/grade passes last
const RACK_ORDER: ModuleId[] = ['blob_tracker', 'blob_reveal', 'bokeh', 'analog', 'anamorphic_lab'];
const DEFAULT_ENABLED: ModuleId[] = ['blob_tracker', 'analog'];

/**
 * CHAIN LAB — the native SynEngine surface (PLAN.md phase 5):
 * one WebGL context, all five effects composed in series on the same
 * frame. This is the capability the iframe architecture cannot provide.
 */
export default function ChainLab({ isDayMode, onBack, initialChain }: ChainLabProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const engineRef = useRef<SynEngine | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const busRef = useRef<ParamBus | null>(null);
  if (!audioRef.current) audioRef.current = new AudioEngine();
  if (!busRef.current) busRef.current = new ParamBus();
  const [fps, setFps] = useState(0);
  const [sourceKind, setSourceKind] = useState<'none' | 'video' | 'webcam'>('none');
  const [error, setError] = useState<string | null>(null);
  const [audioOn, setAudioOn] = useState(false);
  const [levels, setLevels] = useState<AudioLevels>({ bass: 0, loud: 0, treble: 0, beat: 0, bpm: null });
  // bump to re-read node state after any mutation (params live in the nodes)
  const [, setRev] = useState(0);
  const bump = () => setRev((r) => r + 1);

  useEffect(() => {
    if (!canvasRef.current) return;
    let engine: SynEngine;
    try {
      engine = new SynEngine(canvasRef.current);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    const active = initialChain?.length ? initialChain : DEFAULT_ENABLED;
    const rack = [...active, ...RACK_ORDER.filter((id) => !active.includes(id))];
    rack.forEach((id) => {
      const node = NODE_FACTORY[id]();
      node.enabled = active.includes(id);
      engine.addNode(node);
    });
    // manual/auto control matrix (PLAN §4.4): bases live in the bus, the
    // audio offsets are layered on top of them at the start of every frame
    busRef.current!.snapshot(engine.chain);
    engine.beforeFrame = (now) => {
      const lv = audioRef.current!.tick(now);
      busRef.current!.apply(engine.chain, lv);
    };
    engine.onFps = setFps;
    engine.start();
    engineRef.current = engine;
    return () => {
      audioRef.current?.stop();
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // low-rate UI mirror of the live audio levels (meters + modulated readouts)
  useEffect(() => {
    if (!audioOn) return;
    const id = setInterval(() => setLevels({ ...audioRef.current!.levels }), 120);
    return () => clearInterval(id);
  }, [audioOn]);

  const toggleAudio = async () => {
    const audio = audioRef.current!;
    if (audio.active) {
      audio.stop();
      setAudioOn(false);
      setLevels({ bass: 0, loud: 0, treble: 0, beat: 0, bpm: null });
      return;
    }
    try {
      await audio.start();
      setAudioOn(true);
      setError(null);
    } catch (e) {
      setError('Audio in: ' + (e as Error).message);
    }
  };

  const loadVideo = async (file: File | null) => {
    if (!file || !engineRef.current) return;
    try {
      await engineRef.current.loadVideoFile(file);
      setSourceKind('video');
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const toggleWebcam = async () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.kind === 'webcam') {
      engine.stopSource();
      setSourceKind('none');
      return;
    }
    try {
      await engine.startWebcam();
      setSourceKind('webcam');
      setError(null);
    } catch (e) {
      setError('Webcam: ' + (e as Error).message);
    }
  };

  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');

  // Master Quality export of the WHOLE CHAIN: the shared engine
  // (vendor/syntech-export.js) steps the source video frame by frame while
  // SynEngine renders deterministically with a synthetic clock.
  const runMasterExport = async () => {
    const engine = engineRef.current;
    if (!engine || exporting) return;
    const video = engine.source;
    if (engine.kind !== 'video' || !video || !isFinite(video.duration) || !video.duration) {
      setExportMsg('✗ load a video file first');
      return;
    }
    setExporting(true);
    setExportMsg('preparing…');
    try {
      const loadScript = (src: string) =>
        new Promise<void>((res, rej) => {
          if (document.querySelector(`script[src="${src}"]`)) return res();
          const el = document.createElement('script');
          el.src = src;
          el.onload = () => res();
          el.onerror = () => rej(new Error('failed to load ' + src));
          document.head.appendChild(el);
        });
      await loadScript('/effects/vendor/mp4-muxer.min.js');
      await loadScript('/effects/vendor/syntech-export.js');
      const SyntechExport = (window as any).SyntechExport;
      if (!SyntechExport?.isSupported()) throw new Error('WebCodecs not available in this browser');

      engine.stop();
      video.pause();
      const t0 = video.currentTime;
      let clock = performance.now();
      try {
        const res = await SyntechExport.exportMasterQuality({
          video,
          fps: 30,
          getFrame: async () => {
            clock += 1000 / 30;
            engine.renderFrame(clock);
            return engine.canvas;
          },
          filename: 'vfx_chain_' + Date.now() + '.mp4',
          onProgress: (done: number, total: number, phase: string) =>
            setExportMsg(`MASTER ${phase.toUpperCase()} ${done}/${total}`),
        });
        setExportMsg(`✓ ${res.filename} (${res.codec}${res.audio ? ' + audio' : ''})`);
      } finally {
        await new Promise<void>((r) => {
          const on = () => { video.removeEventListener('seeked', on); r(); };
          video.addEventListener('seeked', on);
          setTimeout(r, 1500);
          video.currentTime = t0;
        });
        void video.play().catch(() => {});
        engine.start();
      }
    } catch (e) {
      setExportMsg('✗ ' + (e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const chain = engineRef.current?.chain ?? [];

  const nodeCard = (node: EngineNode, idx: number) => (
    <div
      key={node.id}
      className={`border rounded p-3 space-y-2 transition-colors ${
        node.enabled
          ? isDayMode ? 'border-gold-500/50 bg-white' : 'border-gold-500/40 bg-[#0c0c0c]'
          : isDayMode ? 'border-neutral-200 bg-neutral-50 opacity-60' : 'border-white/10 bg-black/40 opacity-60'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-mono text-[10px] font-extrabold tracking-widest">
          <span className="text-gold-500">{String(idx + 1).padStart(2, '0')}</span>
          <span className={isDayMode ? 'text-neutral-900' : 'text-white'}>{node.name}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            title="Move up the chain"
            onClick={() => { engineRef.current?.swapNodes(idx, idx - 1); bump(); }}
            disabled={idx === 0}
            className="p-1 rounded border border-gold-500/20 text-gold-500 hover:bg-gold-500/10 disabled:opacity-30 cursor-pointer"
          >
            <ArrowUp className="w-3 h-3" />
          </button>
          <button
            title="Move down the chain"
            onClick={() => { engineRef.current?.swapNodes(idx, idx + 1); bump(); }}
            disabled={idx === chain.length - 1}
            className="p-1 rounded border border-gold-500/20 text-gold-500 hover:bg-gold-500/10 disabled:opacity-30 cursor-pointer"
          >
            <ArrowDown className="w-3 h-3" />
          </button>
          <button
            title={node.enabled ? 'Bypass this node' : 'Enable this node'}
            data-testid={`toggle-${node.id}`}
            onClick={() => { node.enabled = !node.enabled; bump(); }}
            className={`p-1 rounded border cursor-pointer ${
              node.enabled ? 'border-gold-500 bg-gold-500 text-black' : 'border-gold-500/30 text-neutral-500'
            }`}
          >
            <Power className="w-3 h-3" />
          </button>
        </div>
      </div>

      {node.enabled && (
        <div className="space-y-1.5">
          {node.params.map((p) =>
            p.type === 'boolean' ? (
              <label key={p.key} className={`flex items-center justify-between font-mono text-[9px] uppercase tracking-wider cursor-pointer ${isDayMode ? 'text-neutral-600' : 'text-neutral-400'}`}>
                {p.label}
                <input
                  type="checkbox"
                  data-testid={`param-${node.id}-${p.key}`}
                  checked={Number(node.getParam(p.key)) >= 0.5}
                  onChange={(e) => { node.setParam(p.key, e.target.checked ? 1 : 0); bump(); }}
                  className="accent-[#D4AF37]"
                />
              </label>
            ) : (() => {
              const bus = busRef.current!;
              const base = bus.getBase(node, p.key);
              const mod = bus.getMod(node, p.key);
              const dec = (p.step ?? 1) < 1 ? 2 : 0;
              // cycle the audio route: off → bass → loud → treble → beat → off
              const cycleMod = () => {
                const order: (AudioSource | null)[] = [null, ...AUDIO_SOURCES];
                const next = order[(order.indexOf(mod?.source ?? null) + 1) % order.length];
                bus.setMod(node, p.key, next ? { source: next, amount: mod?.amount ?? 0.5 } : null);
                bump();
              };
              return (
                <div key={p.key} className="space-y-0.5">
                  <div className={`flex justify-between items-center font-mono text-[9px] uppercase tracking-wider ${isDayMode ? 'text-neutral-600' : 'text-neutral-400'}`}>
                    <span>{p.label}</span>
                    <span className="flex items-center gap-1.5">
                      {p.reactive && (
                        <button
                          type="button"
                          title="Audio modulation source (PLAN §4.4: base + audio × amount)"
                          data-testid={`mod-src-${node.id}-${p.key}`}
                          onClick={cycleMod}
                          className={`px-1 rounded border text-[8px] font-bold cursor-pointer ${
                            mod ? 'border-amber-400 bg-amber-400/20 text-amber-400' : 'border-gold-500/25 text-neutral-500 hover:text-gold-500'
                          }`}
                        >
                          {mod ? mod.source.toUpperCase() : '~'}
                        </button>
                      )}
                      <span className="text-gold-500 font-bold">{base.toFixed(dec)}</span>
                    </span>
                  </div>
                  <input
                    type="range"
                    data-testid={`param-${node.id}-${p.key}`}
                    min={p.min}
                    max={p.max}
                    step={p.step}
                    value={base}
                    onChange={(e) => { bus.setBase(node, p.key, parseFloat(e.target.value)); bump(); }}
                    className="w-full h-1 accent-[#D4AF37] cursor-pointer"
                  />
                  {mod && (
                    <div className="flex items-center gap-1.5">
                      <span className={`font-mono text-[8px] uppercase ${isDayMode ? 'text-neutral-500' : 'text-neutral-500'}`}>AMT</span>
                      <input
                        type="range"
                        data-testid={`mod-amt-${node.id}-${p.key}`}
                        min={-1}
                        max={1}
                        step={0.05}
                        value={mod.amount}
                        onChange={(e) => { bus.setMod(node, p.key, { source: mod.source, amount: parseFloat(e.target.value) }); bump(); }}
                        className="flex-1 h-1 accent-amber-400 cursor-pointer"
                      />
                      <span data-testid={`mod-val-${node.id}-${p.key}`} className="font-mono text-[8px] text-amber-400 w-9 text-right">
                        {Number(node.getParam(p.key)).toFixed(dec)}
                      </span>
                    </div>
                  )}
                </div>
              );
            })()
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col flex-1 min-h-[600px]">
      {/* toolbar */}
      <div className={`flex items-center justify-between gap-3 px-4 md:px-6 py-3 border-b transition-colors duration-300 ${isDayMode ? 'border-gold-500/15 bg-[#f7f5f0]' : 'border-gold-500/20 bg-black'}`}>
        <button
          type="button"
          onClick={onBack}
          className={`flex items-center gap-2 font-mono text-[10px] font-bold tracking-[0.2em] uppercase px-3 py-2 rounded border transition-colors cursor-pointer ${isDayMode ? 'border-gold-500/40 text-gold-700 hover:bg-gold-500/10' : 'border-gold-500/30 text-gold-500 hover:bg-gold-500/10'}`}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to console
        </button>
        <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-widest">
          <span className={`flex items-center gap-1.5 font-extrabold ${isDayMode ? 'text-neutral-900' : 'text-white'}`}>
            <Link2 className="w-3 h-3 text-gold-500" />
            CHAIN LAB <span className="text-gold-500">// SYNENGINE</span>
          </span>
          <span className={isDayMode ? 'text-neutral-600' : 'text-neutral-400'}>
            FPS <b className="text-gold-500" data-testid="chain-fps">{fps}</b>
          </span>
          <button
            type="button"
            data-testid="chain-master"
            onClick={runMasterExport}
            disabled={exporting}
            className="flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-widest uppercase px-3 py-1.5 rounded bg-gold-500 text-black hover:bg-gold-400 disabled:opacity-40 cursor-pointer"
          >
            <Diamond className="w-3 h-3" /> Master MP4
          </button>
          {exportMsg && (
            <span data-testid="chain-export-msg" className="text-[9px] text-gold-500 normal-case tracking-normal max-w-56 truncate">{exportMsg}</span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col lg:flex-row min-h-0">
        {/* stage */}
        <div className="flex-1 bg-black flex items-center justify-center p-3 min-h-[320px] relative">
          <canvas ref={canvasRef} data-testid="chain-canvas" className="max-w-full max-h-full border border-gold-500/20" />
          {sourceKind === 'none' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
              <div className="font-mono text-[11px] tracking-[0.3em] text-gold-500 font-bold">NO SIGNAL</div>
              <div className="font-mono text-[9px] tracking-widest text-neutral-500 uppercase">Load a video or start the webcam →</div>
            </div>
          )}
        </div>

        {/* control rail */}
        <div className={`w-full lg:w-72 shrink-0 border-t lg:border-t-0 lg:border-l p-4 space-y-4 overflow-y-auto scrollbar-thin transition-colors ${isDayMode ? 'border-gold-500/15 bg-[#faf9f5]' : 'border-gold-500/15 bg-[#080808]'}`}>
          <div className="space-y-2">
            <div className="font-mono text-[9px] font-extrabold tracking-widest text-gold-500 uppercase border-b border-gold-500/15 pb-1">Source</div>
            <div className="flex gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-1.5 font-mono text-[9px] font-bold tracking-wider uppercase px-2 py-2 rounded border border-gold-500/30 text-gold-500 hover:bg-gold-500/10 cursor-pointer"
              >
                <Film className="w-3 h-3" /> Video
              </button>
              <button
                onClick={toggleWebcam}
                className={`flex-1 flex items-center justify-center gap-1.5 font-mono text-[9px] font-bold tracking-wider uppercase px-2 py-2 rounded border cursor-pointer ${sourceKind === 'webcam' ? 'border-gold-500 bg-gold-500 text-black' : 'border-gold-500/30 text-gold-500 hover:bg-gold-500/10'}`}
              >
                <Camera className="w-3 h-3" /> {sourceKind === 'webcam' ? 'Stop' : 'Webcam'}
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="video/*"
              data-testid="chain-file"
              className="hidden"
              onChange={(e) => loadVideo(e.target.files?.[0] ?? null)}
            />
            <button
              onClick={toggleAudio}
              data-testid="audio-toggle"
              className={`w-full flex items-center justify-center gap-1.5 font-mono text-[9px] font-bold tracking-wider uppercase px-2 py-2 rounded border cursor-pointer ${
                audioOn ? 'border-amber-400 bg-amber-400/15 text-amber-400' : 'border-gold-500/30 text-gold-500 hover:bg-gold-500/10'
              }`}
            >
              <Mic className="w-3 h-3" /> {audioOn ? 'Audio In: Live' : 'Audio In (Mic)'}
            </button>
            {audioOn && (
              <div className="space-y-1">
                {(['bass', 'loud', 'treble'] as const).map((band) => (
                  <div key={band} className="flex items-center gap-1.5 font-mono text-[8px] uppercase">
                    <span className={`w-9 ${isDayMode ? 'text-neutral-500' : 'text-neutral-500'}`}>{band}</span>
                    <div className={`flex-1 h-1 rounded overflow-hidden ${isDayMode ? 'bg-neutral-200' : 'bg-white/10'}`}>
                      <div className="h-full bg-amber-400 transition-[width] duration-100" style={{ width: `${Math.min(100, Math.round(levels[band] * 100))}%` }} />
                    </div>
                    <span data-testid={`audio-${band}`} className="w-6 text-right text-amber-400">{Math.round(levels[band] * 100)}</span>
                  </div>
                ))}
                <div className="flex items-center gap-1.5 font-mono text-[8px] uppercase">
                  <span className={isDayMode ? 'text-neutral-500' : 'text-neutral-500'}>beat</span>
                  <span
                    className="w-2 h-2 rounded-full bg-amber-400"
                    style={{ opacity: 0.15 + levels.beat * 0.85 }}
                  />
                  <span className={`ml-auto ${isDayMode ? 'text-neutral-500' : 'text-neutral-500'}`}>
                    BPM <b className="text-amber-400">{levels.bpm ?? '--'}</b>
                  </span>
                </div>
                <p className={`font-mono text-[8px] leading-relaxed ${isDayMode ? 'text-neutral-500' : 'text-neutral-600'}`}>
                  Route audio onto any reactive parameter with the <b className="text-amber-400">~</b> chip next to its value.
                </p>
              </div>
            )}
            {error && <div className="font-mono text-[9px] text-red-400">{error}</div>}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between font-mono text-[9px] font-extrabold tracking-widest text-gold-500 uppercase border-b border-gold-500/15 pb-1">
              <span>Signal chain</span>
              <span className={isDayMode ? 'text-neutral-500' : 'text-neutral-500'}>SOURCE → {chain.filter((n) => n.enabled).map((n) => n.id.toUpperCase()).join(' → ') || 'OUT'} → OUT</span>
            </div>
            {chain.map((n, i) => nodeCard(n, i))}
          </div>

          <p className={`font-mono text-[8px] leading-relaxed ${isDayMode ? 'text-neutral-500' : 'text-neutral-600'}`}>
            Native SynEngine nodes — one WebGL context, effects composed in series on the same frame.
            The full standalone effects remain available from the library while porting continues.
          </p>
        </div>
      </div>
    </div>
  );
}
