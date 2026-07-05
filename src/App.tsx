import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Activity, 
  Layers, 
  Sliders, 
  Settings, 
  Zap, 
  Radio, 
  Cpu, 
  Lock, 
  Unlock, 
  RefreshCw, 
  Play, 
  Square,
  Volume2,
  SlidersHorizontal,
  Info,
  Sparkles
} from 'lucide-react';
import { ModuleConfig, ModuleId, ActiveTab, SignalSource } from './types';
import VfxCanvas from './components/VfxCanvas';
import DiagnosticsPanel from './components/DiagnosticsPanel';
import AiOracleDrawer from './components/AiOracleDrawer';

export default function App() {
  // App initialization & Stream engine active state
  const [isStreaming, setIsStreaming] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('PARAMETERS');
  const [activeModule, setActiveModule] = useState<ModuleId>('blob');
  const [signalSource, setSignalSource] = useState<SignalSource>('L_INPUT_CHANNEL_01');
  const [bufferSize, setBufferSize] = useState<number>(4896);
  const [globalSyncLocked, setGlobalSyncLocked] = useState(true);
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);

  // Apply a parameter preset suggested by Gemini AI
  const handleApplyPreset = (preset: any) => {
    if (!preset) return;
    setModules((prev) =>
      prev.map((m) => {
        if (m.id === activeModule) {
          const updatedParameters = { ...m.parameters };
          let updated = false;
          for (const key of Object.keys(preset)) {
            if (updatedParameters[key]) {
              updatedParameters[key] = {
                ...updatedParameters[key],
                value: Number(preset[key])
              };
              updated = true;
            }
          }
          if (updated) {
            return { ...m, parameters: updatedParameters };
          }
        }
        return m;
      })
    );
  };

  // Dynamic ticking metrics
  const [frameCount, setFrameCount] = useState(88401234);
  const [uptimeSeconds, setUptimeSeconds] = useState(15164); // 4h 12m 44s
  const [simulatedLatency, setSimulatedLatency] = useState(1.2);

  // Modules setup with their reactive parameter configurations
  const [modules, setModules] = useState<ModuleConfig[]>([
    {
      id: 'blob',
      name: 'BLOB STATE TRACKER',
      description: 'Organic vertex displacement and fluid dynamics mapping for cellular visual structures.',
      status: 'ACTIVE',
      parameters: {
        displacement: { label: 'VERTEX DISPLACEMENT', value: 55, min: 0, max: 100, step: 1 },
        fluidDynamics: { label: 'FLUID DYNAMICS', value: 65, min: 0, max: 100, step: 1 },
        cellSize: { label: 'CELLULAR DENSITY', value: 40, min: 0, max: 100, step: 1 },
      },
    },
    {
      id: 'analog',
      name: 'ANALOG STATE',
      description: 'CRT emulation, horizontal sync jitter, and chromatic aberration simulation.',
      status: 'STANDBY',
      parameters: {
        crtEmulation: { label: 'CRT EMULATION', value: 60, min: 0, max: 100, step: 1 },
        syncJitter: { label: 'HORIZONTAL JITTER', value: 35, min: 0, max: 100, step: 1 },
        chromaticAberration: { label: 'CHROMATIC OFFSET', value: 45, min: 0, max: 100, step: 1 },
      },
    },
    {
      id: 'particle',
      name: 'PARTICLE HARMONICS',
      description: 'Quantum gravity orbital field simulation mapping high-frequency wave vectors.',
      status: 'STANDBY',
      parameters: {
        speed: { label: 'HARMONIC VELOCITY', value: 60, min: 10, max: 100, step: 1 },
        gravity: { label: 'ATTRACTOR FORCE', value: 45, min: 0, max: 100, step: 1 },
        spread: { label: 'SPREAD DEVIATION', value: 55, min: 10, max: 100, step: 1 },
      },
    },
    {
      id: 'spectrum',
      name: 'SPECTRUM ANALYZER',
      description: 'Frequency spectrum bars and peak magnitude analysis with linear attenuation.',
      status: 'STANDBY',
      parameters: {
        sensitivity: { label: 'INPUT SENSITIVITY', value: 75, min: 10, max: 100, step: 1 },
        decay: { label: 'PEAK DECAY RATE', value: 45, min: 10, max: 100, step: 1 },
        resolution: { label: 'SPECTRAL RESOLUTION', value: 65, min: 10, max: 100, step: 1 },
      },
    },
  ]);

  // Handle ticking counters
  useEffect(() => {
    let frameTimer: number;
    let clockTimer: number;

    if (isStreaming) {
      // Tick frames up rapidly at ~60fps
      frameTimer = window.setInterval(() => {
        setFrameCount((prev) => prev + Math.floor(Math.random() * 2) + 1);
      }, 16);

      // Tick uptime clock
      clockTimer = window.setInterval(() => {
        setUptimeSeconds((prev) => prev + 1);
        // Vary latency slightly
        setSimulatedLatency((prev) => {
          const jitter = (Math.random() - 0.5) * 0.12;
          const base = bufferSize === 4896 ? 1.2 : bufferSize === 2048 ? 0.6 : 2.4;
          return Math.max(0.3, Math.min(5.0, Number((base + jitter).toFixed(1))));
        });
      }, 1000);
    }

    return () => {
      clearInterval(frameTimer);
      clearInterval(clockTimer);
    };
  }, [isStreaming, bufferSize]);

  // Format uptime (seconds -> hh:mm:ss)
  const formatUptime = (totalSecs: number) => {
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return [
      hrs.toString().padStart(2, '0'),
      mins.toString().padStart(2, '0'),
      secs.toString().padStart(2, '0')
    ].join(':');
  };

  // Format frame count with comma separators
  const formatFrames = (frames: number) => {
    return frames.toLocaleString('en-US');
  };

  // Toggle active/standby module state
  const toggleModuleStatus = (id: ModuleId, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent selecting the module just by clicking toggle
    setModules((prev) =>
      prev.map((m) => {
        if (m.id === id) {
          const nextStatus = m.status === 'ACTIVE' ? 'STANDBY' : 'ACTIVE';
          return { ...m, status: nextStatus };
        }
        return m;
      })
    );
  };

  // Change individual parameter slider value
  const handleParameterChange = (moduleId: ModuleId, paramKey: string, newValue: number) => {
    setModules((prev) =>
      prev.map((m) => {
        if (m.id === moduleId) {
          return {
            ...m,
            parameters: {
              ...m.parameters,
              [paramKey]: {
                ...m.parameters[paramKey],
                value: newValue,
              },
            },
          };
        }
        return m;
      })
    );
  };

  // Quick preset selections for buffer size
  const handleBufferSizeChange = (size: number) => {
    setBufferSize(size);
  };

  const currentModule = modules.find((m) => m.id === activeModule) || modules[0];

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-3 sm:p-6 md:p-8 font-sans">
      
      {/* Container simulating a premium Elegant Dark system terminal housing with thick dark metallic borders */}
      <div 
        id="vfx-syntech-terminal" 
        className="w-full max-w-7xl bg-[#050505] text-white border-[12px] border-[#1a1a1a] shadow-2xl overflow-hidden flex flex-col"
      >
        
        {/* PREMIUM ELEGANT DARK HEADER / NAVIGATION */}
        <nav className="flex flex-wrap justify-between items-center px-6 md:px-12 py-6 border-b border-gold-500/20 bg-black gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 border-2 border-gold-500 rotate-45 flex items-center justify-center shrink-0">
              <span className="text-gold-500 font-bold -rotate-45 text-xs">VS</span>
            </div>
            <span className="text-xl font-bold tracking-[0.2em] text-gold-500">
              VFX <span className="text-white font-light">SYNTECH</span>
            </span>
          </div>
          
          <ul className="hidden md:flex gap-8 lg:gap-10 text-[11px] uppercase tracking-[0.3em] font-medium text-gray-400">
            <li className="text-gold-500 cursor-default">Home</li>
            <li className="hover:text-white cursor-pointer transition-colors">Studio</li>
            <li className="hover:text-white cursor-pointer transition-colors">Projects</li>
            <li className="hover:text-white cursor-pointer transition-colors">Contact</li>
          </ul>

          <div className="flex items-center gap-3">
            {/* Quick Sync control indicator in header */}
            <button 
              onClick={() => setGlobalSyncLocked(!globalSyncLocked)}
              className="flex items-center gap-1.5 font-mono text-[10px] bg-[#111] px-3 py-1.5 rounded border border-gold-500/20 text-gold-500 hover:text-gold-300 transition-colors"
            >
              {globalSyncLocked ? (
                <>
                  <Lock className="w-3 h-3 text-gold-500" />
                  <span className="hidden sm:inline">SYNC LOCKED</span>
                </>
              ) : (
                <>
                  <Unlock className="w-3 h-3 text-amber-500" />
                  <span className="hidden sm:inline">SYNC FREE</span>
                </>
              )}
            </button>

            {/* Obsidian Gemini AI Oracle toggle button */}
            <button 
              onClick={() => setIsAiDrawerOpen(true)}
              className="flex items-center gap-1.5 font-mono text-[10px] bg-gold-500/10 px-3.5 py-2 rounded border border-gold-500/40 text-gold-500 hover:bg-gold-500 hover:text-black transition-all cursor-pointer shadow-[0_0_8px_rgba(212,175,55,0.1)] font-bold animate-pulse"
            >
              <Sparkles className="w-3.5 h-3.5 text-gold-500" />
              <span>AI ORACLE</span>
            </button>

            <div className="px-5 py-2 border border-gold-500 text-gold-500 text-[10px] tracking-widest uppercase hover:bg-gold-500 hover:text-black transition-all cursor-pointer">
              Login
            </div>
          </div>
        </nav>

        {/* HERO METADATA SECONDARY BAR */}
        <div className="border-b border-gold-500/10 bg-[#0c0c0c] px-6 md:px-12 py-3 flex flex-wrap items-center justify-between gap-3 text-[10px] font-mono text-gray-400">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="text-gold-700">BUFFER:</span>
              <select 
                value={bufferSize} 
                onChange={(e) => handleBufferSizeChange(Number(e.target.value))}
                className="bg-transparent text-gold-500 font-bold focus:outline-none cursor-pointer border border-gold-500/10 rounded px-1"
              >
                <option value={2048}>2048 SAMPLES</option>
                <option value={4896}>4896 SAMPLES</option>
                <option value={8192}>8192 SAMPLES</option>
              </select>
            </div>
            
            <div className="flex items-center gap-1">
              <span className="text-gold-700">LATENCY:</span>
              <span className="text-gold-500 font-bold tracking-wider">{isStreaming ? `${simulatedLatency}MS` : 'OFFLINE'}</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-1">
              <span className="text-gold-700">ENGINE STATE:</span>
              <span className="text-gold-500 font-bold">{isStreaming ? 'STREAMING ACTIVE' : 'STANDBY'}</span>
            </div>
            <div className="text-gold-700">|</div>
            <div>
              <span className="text-gold-700">STABLE CORE:</span> <span className="text-white">v4.2.8</span>
            </div>
          </div>
        </div>

        {/* MAIN BODY GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-gold-500/10 flex-1 min-h-[500px]">
          
          {/* COLUMN 1: CONTROLS & PARAMS / DIAGNOSTICS (Left Panel) */}
          <section className="lg:col-span-4 p-6 md:p-8 flex flex-col justify-between space-y-6 bg-[#080808]">
            
            {/* Branding Display & Core Description */}
            <div className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-gold-500 text-xs tracking-[0.5em] uppercase mb-1 opacity-80 font-mono font-medium">
                  Visual Effects & Innovation
                </h2>
                <h1 className="font-display font-black text-6xl tracking-tighter leading-none mb-2">
                  VFX <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-500 to-gold-700">SYNTECH</span>
                </h1>
              </div>

              <p className="max-w-sm text-gray-400 leading-relaxed text-xs border-l-2 border-gold-500 pl-4 font-sans">
                Pushing the boundaries of digital reality. We combine cinematic VFX mastery with cutting-edge SYNTECH pipelines to create worlds that shouldn't exist.
              </p>
            </div>

            {/* TAB CONTROLS (Diagnostics vs Parameters) */}
            <div className="space-y-4 flex-1 flex flex-col justify-end">
              <div className="flex border-b border-gold-500/20 font-mono text-xs">
                <button
                  onClick={() => setActiveTab('PARAMETERS')}
                  className={`flex items-center gap-1.5 px-4 py-2 border-b-2 transition-all duration-200 ${
                    activeTab === 'PARAMETERS'
                      ? 'border-gold-500 text-gold-500 font-bold bg-gold-500/5'
                      : 'border-transparent text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-gold-500" />
                  PARAMETERS
                </button>
                <button
                  onClick={() => setActiveTab('DIAGNOSTICS')}
                  className={`flex items-center gap-1.5 px-4 py-2 border-b-2 transition-all duration-200 ${
                    activeTab === 'DIAGNOSTICS'
                      ? 'border-gold-500 text-gold-500 font-bold bg-gold-500/5'
                      : 'border-transparent text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  <Activity className="w-3.5 h-3.5 text-gold-500" />
                  DIAGNOSTICS
                </button>
              </div>

              {/* TAB CONTENT WINDOW */}
              <div className="min-h-[220px] flex flex-col justify-start">
                <AnimatePresence mode="wait">
                  {activeTab === 'PARAMETERS' ? (
                    <motion.div
                      key="parameters"
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-4"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-gold-500 uppercase tracking-wider font-semibold">
                          Active Module Settings:
                        </span>
                        <span className="text-[10px] font-mono text-neutral-400">
                          {currentModule.name}
                        </span>
                      </div>

                      {/* Render slider inputs dynamically for the selected module */}
                      <div className="space-y-4 bg-black/60 p-4 rounded border border-gold-500/20">
                        {Object.keys(currentModule.parameters).map((key) => {
                          const param = currentModule.parameters[key];
                          return (
                            <div key={key} className="space-y-1.5">
                              <div className="flex justify-between text-[10px] font-mono text-neutral-300">
                                <span>{param.label}</span>
                                <span className="text-gold-500 font-bold">{param.value}%</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <input
                                  type="range"
                                  min={param.min}
                                  max={param.max}
                                  step={param.step}
                                  value={param.value}
                                  disabled={!isStreaming}
                                  onChange={(e) => handleParameterChange(currentModule.id, key, Number(e.target.value))}
                                  className="w-full h-1 bg-neutral-900 rounded-lg appearance-none cursor-pointer accent-gold-500 focus:outline-none disabled:opacity-30"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      
                      <div className="p-3 border border-gold-500/15 rounded bg-black/40 flex gap-2.5 items-start">
                        <Info className="w-4 h-4 text-gold-500 mt-0.5 shrink-0" />
                        <p className="text-[9px] text-neutral-400 font-mono leading-relaxed">
                          Drag range sliders to adjust parameters dynamically. Live matrix updates immediately in the center visual stream.
                        </p>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="diagnostics"
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      transition={{ duration: 0.15 }}
                      className="h-full"
                    >
                      <DiagnosticsPanel signalSource={signalSource} isStreaming={isStreaming} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Bottom Input Channel Indicator */}
            <div className="border-t border-gold-500/20 pt-4 space-y-1.5 font-mono">
              <div className="text-[9px] text-gold-500 font-bold tracking-wider uppercase">CURRENT INPUT SIGNAL</div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-white tracking-wider gold-glow-text">
                  {signalSource}
                </span>
                
                {/* Input Signal Selector Controls */}
                <div className="flex gap-1">
                  {(['L_INPUT_CHANNEL_01', 'R_INPUT_CHANNEL_02', 'MIC_AUDIO_03', 'GOLD_NOISE_04'] as SignalSource[]).map((src) => (
                    <button
                      key={src}
                      title={`Switch to ${src}`}
                      onClick={() => setSignalSource(src)}
                      className={`w-5 h-5 rounded flex items-center justify-center border font-mono text-[9px] transition-all ${
                        signalSource === src
                          ? 'bg-gold-500 border-gold-500 text-black font-extrabold shadow-[0_0_8px_rgba(212,175,55,0.4)]'
                          : 'bg-black border-gold-500/25 text-gold-500/70 hover:text-gold-500 hover:border-gold-500/50'
                      }`}
                    >
                      {src.charAt(src.length - 2) === 'L' ? 'L' : src.charAt(src.length - 2) === 'R' ? 'R' : src.includes('MIC') ? '🎤' : '⚡'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

          </section>

          {/* COLUMN 2: THE MAIN GRAPHIC STAGE (Center Panel) */}
          <section className="lg:col-span-5 p-6 md:p-8 flex flex-col justify-between space-y-4 bg-[#030303]">
            <div className="flex items-center justify-between border-b border-gold-500/20 pb-2">
              <span className="text-xs font-bold uppercase tracking-[0.25em] text-gold-500">
                VFX <span className="text-white font-light">SYNTECH</span>
              </span>
              <span className="text-[9px] font-mono tracking-[0.15em] text-neutral-400 uppercase font-medium">
                Visual Effects & Innovation
              </span>
            </div>

            {/* Interactive Vfx Canvas Component */}
            <div className="flex-1 min-h-[320px] lg:min-h-0 relative rounded border border-gold-500/25 bg-black overflow-hidden flex flex-col">
              <VfxCanvas
                activeModule={activeModule}
                setActiveModule={setActiveModule}
                modules={modules}
                signalSource={signalSource}
                isStreaming={isStreaming}
              />
            </div>

            {/* Waveform presets helper */}
            <div className="flex justify-between items-center text-[10px] font-mono text-gold-500/70 border-t border-gold-500/10 pt-3">
              <span>SCANRATE: 48.00 KHZ</span>
              <span>BITS: 32-BIT METALLIC</span>
            </div>
          </section>

          {/* COLUMN 3: MODULE LIBRARY & OUTPUT CONTROLS (Right Panel) */}
          <section className="lg:col-span-3 p-6 md:p-8 flex flex-col justify-between space-y-6 bg-[#080808]">
            
            {/* Header: Module Library */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-gold-500/20 pb-2">
                <div className="flex items-center gap-1.5 font-mono text-xs text-gold-500 font-bold uppercase tracking-wider">
                  <Layers className="w-3.5 h-3.5 text-gold-500" />
                  MODULE LIBRARY
                </div>
                <span className="text-[9px] font-mono text-neutral-500 uppercase font-semibold">SELECT ACTIVE</span>
              </div>

              {/* Module List Grid - Styled exactly as the Elegant Dark cards */}
              <div className="space-y-3">
                {modules.map((m, idx) => {
                  const isActive = m.id === activeModule;
                  const numStr = (idx + 1).toString().padStart(2, '0');
                  
                  return (
                    <div
                      key={m.id}
                      onClick={() => setActiveModule(m.id)}
                      className={`p-4 border-t-2 rounded-b text-left transition-all duration-200 cursor-pointer ${
                        isActive
                          ? 'bg-[#111] border-gold-500 shadow-[0_4px_12px_rgba(212,175,55,0.12)]'
                          : 'bg-black/60 border-t-transparent border-x border-b border-gold-500/10 hover:border-gold-500/30 hover:bg-[#111]/30'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] font-mono mb-2">
                        <span className="text-gold-500 font-bold">{numStr} // {m.id.toUpperCase()} MODULE</span>
                        
                        {/* Module status pill button */}
                        <button
                          onClick={(e) => toggleModuleStatus(m.id, e)}
                          className={`px-1.5 py-0.5 rounded text-[8px] font-bold tracking-wide transition-colors ${
                            m.status === 'ACTIVE'
                              ? 'bg-gold-500 text-black font-extrabold shadow-[0_0_5px_rgba(212,175,55,0.3)]'
                              : 'bg-neutral-900 text-gold-500 border border-gold-500/20'
                          }`}
                        >
                          {m.status}
                        </button>
                      </div>

                      <h3 className={`text-sm font-bold uppercase ${isActive ? 'text-white' : 'text-neutral-400'}`}>
                        {m.name}
                      </h3>
                      
                      <p className="text-[10px] text-neutral-400 line-clamp-2 leading-relaxed font-mono mt-1">
                        {m.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Dynamic Output Monitor Levels & Action Button */}
            <div className="space-y-4">
              <div className="border border-gold-500/20 bg-black p-3.5 rounded">
                <div className="flex justify-between items-center text-[9px] font-mono text-gold-500 mb-2 uppercase font-semibold">
                  <span>OUTPUT MONITOR</span>
                  <span className={`${isStreaming ? 'text-gold-500 animate-pulse font-bold' : 'text-neutral-600'}`}>
                    {isStreaming ? 'STREAMING' : 'IDLE'}
                  </span>
                </div>

                {/* Animated Gold Level Bars */}
                <div className="flex gap-1 h-7 items-end pt-1 bg-black/40 px-2 rounded border border-gold-500/10">
                  {Array.from({ length: 8 }).map((_, i) => {
                    const animationDelay = `${i * 0.1}s`;
                    return (
                      <div key={i} className="flex-1 bg-neutral-950 h-full rounded-t overflow-hidden relative">
                        <div 
                          className={`absolute bottom-0 inset-x-0 bg-gradient-to-t from-gold-700 to-gold-500 rounded-t ${isStreaming ? 'animate-[bounce_1.2s_infinite_ease-in-out]' : ''}`}
                          style={{ 
                            height: isStreaming ? `${30 + Math.sin(i * 0.5) * 45 + Math.random() * 25}%` : '4%',
                            animationDelay,
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* INITIALIZE STREAM ACTION BUTTON */}
              <button
                onClick={() => setIsStreaming(!isStreaming)}
                className={`w-full py-3 px-6 font-mono text-xs font-bold tracking-[0.2em] uppercase transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer ${
                  isStreaming 
                    ? 'border border-white/20 text-white hover:border-gold-500 hover:bg-gold-500/10' 
                    : 'bg-gold-500 text-black hover:bg-gold-400 font-black shadow-[0_0_15px_rgba(212,175,55,0.3)]'
                }`}
              >
                {isStreaming ? (
                  <>
                    <Square className="w-3.5 h-3.5 fill-current" />
                    TERMINATE STREAM
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    INITIALIZE STREAM
                  </>
                )}
              </button>
            </div>

          </section>

        </div>

        {/* SYSTEM STATUS FOOTER */}
        <footer className="border-t border-white/5 bg-[#0a0a0a] px-6 md:px-12 py-6 flex flex-wrap justify-between items-center text-[10px] font-mono text-gray-400 gap-4">
          
          <div className="flex gap-8 items-center flex-wrap">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full shadow-[0_0_8px_#22c55e] ${isStreaming ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-neutral-600'}`}></div>
              <span className="text-[10px] uppercase tracking-widest text-gray-400">
                SYSTEM: {isStreaming ? 'STREAMING' : 'STANDBY'}
              </span>
            </div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500">v4.2.8-STABLE</div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500">
              FRAMES: <span className="text-gold-500 font-bold">{formatFrames(frameCount)}</span>
            </div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500">
              UPTIME: <span className="text-gold-500 font-bold">{formatUptime(uptimeSeconds)}</span>
            </div>
          </div>

          <div className="text-[10px] uppercase tracking-[0.2em] text-gold-500 font-semibold">
            © 2026 VFX SYNTECH DIGITAL INDUSTRIES
          </div>
          
        </footer>

      </div>

      {/* AI Oracle Obsidian Assistant Drawer */}
      <AiOracleDrawer
        isOpen={isAiDrawerOpen}
        onClose={() => setIsAiDrawerOpen(false)}
        currentConfig={{
          activeModule,
          signalSource,
          bufferSize,
          parameters: currentModule.parameters
        }}
        onApplyPreset={handleApplyPreset}
      />
      
    </div>
  );
}
