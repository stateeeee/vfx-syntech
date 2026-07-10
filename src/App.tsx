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
  Sparkles,
  Send,
  Bot
} from 'lucide-react';
import { ModuleConfig, ModuleId, ActiveTab, SignalSource } from './types';
import VfxCanvas from './components/VfxCanvas';
import DiagnosticsPanel from './components/DiagnosticsPanel';
import AiOracleDrawer from './components/AiOracleDrawer';

export default function App() {
  // App initialization & Stream engine active state
  const [isStreaming, setIsStreaming] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('PARAMETERS');
  const [activeModule, setActiveModule] = useState<ModuleId>('blob_tracker');
  const [signalSource, setSignalSource] = useState<SignalSource>('L_INPUT_CHANNEL_01');
  const [bufferSize, setBufferSize] = useState<number>(4896);
  const [globalSyncLocked, setGlobalSyncLocked] = useState(true);
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);

  // Gemini Intelligence custom states
  const [activeGeminiMode, setActiveGeminiMode] = useState<'art_director' | 'agent' | 'optimizer'>('art_director');
  const [geminiPrompt, setGeminiPrompt] = useState('');
  const [hoveredMode, setHoveredMode] = useState<'art_director' | 'agent' | 'optimizer' | null>(null);
  const [geminiResponse, setGeminiResponse] = useState<string | null>(null);
  const [isProcessingGemini, setIsProcessingGemini] = useState(false);
  const [suggestedPreset, setSuggestedPreset] = useState<any | null>(null);

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

  const handleSendToGemini = async () => {
    if (isProcessingGemini) return;
    const promptToSend = geminiPrompt.trim();
    
    setIsProcessingGemini(true);
    setGeminiResponse(null);
    setSuggestedPreset(null);

    try {
      if (activeGeminiMode === 'art_director') {
        const response = await fetch('/api/gemini/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            activeModule,
            parameters: currentModule.parameters,
            prompt: promptToSend
          })
        });
        const data = await response.json();
        if (data.analysis) {
          setGeminiResponse(data.analysis + (data.isFallback ? " (Local Backup)" : ""));
        } else {
          setGeminiResponse("No analysis returned from the cognitive model.");
        }
      } else if (activeGeminiMode === 'optimizer') {
        const response = await fetch('/api/gemini/optimize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            activeModule,
            parameters: currentModule.parameters,
            prompt: promptToSend
          })
        });
        const data = await response.json();
        if (data.preset) {
          setSuggestedPreset(data.preset);
          handleApplyPreset(data.preset);
          if (data.isFallback) {
            setGeminiResponse("Optimization system offline. Loaded mathematical local optimal presets instead.");
          } else {
            setGeminiResponse(`Optimized parameter map calculated and applied automatically for module "${currentModule.name}".`);
          }
        } else {
          setGeminiResponse("Optimization model was unable to generate a valid parameter map.");
        }
      } else if (activeGeminiMode === 'agent') {
        // Chatbot / agent pathway
        const msg = promptToSend || "Analyze current VFX configuration and suggest a dramatic preset.";
        const response = await fetch('/api/gemini/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: msg,
            history: [],
            currentConfig: {
              activeModule,
              parameters: currentModule.parameters
            }
          })
        });
        const data = await response.json();
        if (response.ok) {
          setGeminiResponse(data.reply);
          if (data.preset) {
            setSuggestedPreset(data.preset);
          }
        } else {
          setGeminiResponse(`Agent node reported an error: ${data.error || 'Server rejected request'}`);
        }
      }
      setGeminiPrompt('');
    } catch (err: any) {
      console.error("Gemini Core execution failed:", err);
      setGeminiResponse(`Neural link interrupted: ${err.message || 'connection failure'}`);
    } finally {
      setIsProcessingGemini(false);
    }
  };

  // Dynamic ticking metrics
  const [frameCount, setFrameCount] = useState(88401234);
  const [uptimeSeconds, setUptimeSeconds] = useState(15164); // 4h 12m 44s
  const [simulatedLatency, setSimulatedLatency] = useState(1.2);

  // Modules setup with their reactive parameter configurations
  const [modules, setModules] = useState<ModuleConfig[]>([
    {
      id: 'blob_tracker',
      name: 'BLOB TRACKER',
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
      name: 'ANALOG',
      description: 'CRT emulation, horizontal sync jitter, and chromatic aberration simulation.',
      status: 'STANDBY',
      parameters: {
        crtEmulation: { label: 'CRT EMULATION', value: 60, min: 0, max: 100, step: 1 },
        syncJitter: { label: 'HORIZONTAL JITTER', value: 35, min: 0, max: 100, step: 1 },
        chromaticAberration: { label: 'CHROMATIC OFFSET', value: 45, min: 0, max: 100, step: 1 },
      },
    },
    {
      id: 'blob_reveal',
      name: 'BLOB REVEAL',
      description: 'Dynamic canvas revealing through negative mask expansion and light refraction.',
      status: 'STANDBY',
      parameters: {
        revealThreshold: { label: 'REVEAL THRESHOLD', value: 40, min: 0, max: 100, step: 1 },
        maskInversion: { label: 'MASK INVERSION', value: 20, min: 0, max: 100, step: 1 },
        edgeFeather: { label: 'EDGE FEATHER', value: 50, min: 0, max: 100, step: 1 },
      },
    },
    {
      id: 'bokeh',
      name: 'BOKEH',
      description: 'Out-of-focus circle aberration engine with depth layer rendering.',
      status: 'STANDBY',
      parameters: {
        depthOfField: { label: 'DEPTH OF FIELD', value: 70, min: 0, max: 100, step: 1 },
        bokehScale: { label: 'BOKEH RADIUS', value: 60, min: 0, max: 100, step: 1 },
        apertureShutter: { label: 'APERTURE SHAPE', value: 45, min: 0, max: 100, step: 1 },
      },
    },
    {
      id: 'anamorphic_lab',
      name: 'ANAMORPHIC LAB',
      description: 'Horizontal lens flare stretching and ultra-wide aspect distortion generator.',
      status: 'STANDBY',
      parameters: {
        streakIntensity: { label: 'STREAK INTENSITY', value: 50, min: 0, max: 100, step: 1 },
        flareStretching: { label: 'FLARE STRETCHING', value: 80, min: 0, max: 100, step: 1 },
        diffractionGrating: { label: 'DIFFRACTION GRATING', value: 30, min: 0, max: 100, step: 1 },
      },
    },
  ]);

  const currentModule = modules.find((m) => m.id === activeModule) || modules[0];

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
        </nav>

        {/* MAIN BODY GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-gold-500/10 flex-1 min-h-[500px]">
          
          {/* COLUMN 1: SIDEBAR CONTROLS & DYNAMIC PARAMS (Left Panel) */}
          <section className="lg:col-span-4 p-6 md:p-8 flex flex-col justify-between space-y-6 bg-[#080808] overflow-hidden min-h-[480px]">
            
            {/* Branding Display & Core Description */}
            <div className="space-y-4 shrink-0">
              <div className="space-y-1">
                <h1 className="font-display font-black text-6xl tracking-tighter leading-none mb-2">
                  VFX <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-500 to-gold-700">SYNTECH</span>
                </h1>
              </div>

              <p className="max-w-sm text-gray-400 leading-relaxed text-xs border-l-2 border-gold-500 pl-4 font-sans">
                Software Ai based for professional effects audio and video reactive
              </p>
            </div>

            {/* GEMINI AI INTEGRATION SECTION - REMADE AS A STATIC COMPACT PANEL */}
            <div className="border border-gold-500/20 bg-black/60 p-5 rounded-lg flex flex-col space-y-4 flex-1 justify-between overflow-hidden">
              <div className="flex items-center gap-2 border-b border-gold-500/10 pb-2 shrink-0">
                <Sparkles className="w-4 h-4 text-gold-500 animate-pulse" />
                <span className="text-[11px] font-mono font-extrabold tracking-[0.2em] text-gold-500 uppercase">
                  Gemini Ai
                </span>
              </div>

              {/* THREE DYNAMIC COMMAND BUTTONS STACKED IN EXACT ORDER */}
              <div className="space-y-2 shrink-0">
                {/* 1. ART DIRECTOR */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveGeminiMode('art_director');
                    setGeminiResponse(null);
                    setSuggestedPreset(null);
                  }}
                  onMouseEnter={() => setHoveredMode('art_director')}
                  onMouseLeave={() => setHoveredMode(null)}
                  className={`w-full flex items-center justify-between gap-2 font-mono text-[10px] px-3.5 py-3 rounded border transition-all duration-200 cursor-pointer ${
                    activeGeminiMode === 'art_director'
                      ? 'bg-gold-500/15 border-gold-500 text-gold-500 font-bold shadow-[0_0_12px_rgba(212,175,55,0.15)]'
                      : 'bg-[#0c0c0c] border-white/5 text-neutral-400 hover:text-white hover:border-gold-500/20'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Activity className={`w-3.5 h-3.5 ${activeGeminiMode === 'art_director' ? 'text-gold-500' : 'text-neutral-500'}`} />
                    <span className="tracking-wider uppercase font-bold">ART DIRECTOR</span>
                  </div>
                  {activeGeminiMode === 'art_director' && (
                    <span className="text-[8px] bg-gold-500 text-black px-1.5 py-0.5 rounded font-extrabold tracking-wider animate-pulse">ACTIVE</span>
                  )}
                </button>

                {/* 2. AGENT */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveGeminiMode('agent');
                    setGeminiResponse(null);
                    setSuggestedPreset(null);
                  }}
                  onMouseEnter={() => setHoveredMode('agent')}
                  onMouseLeave={() => setHoveredMode(null)}
                  className={`w-full flex items-center justify-between gap-2 font-mono text-[10px] px-3.5 py-3 rounded border transition-all duration-200 cursor-pointer ${
                    activeGeminiMode === 'agent'
                      ? 'bg-gold-500/15 border-gold-500 text-gold-500 font-bold shadow-[0_0_12px_rgba(212,175,55,0.15)]'
                      : 'bg-[#0c0c0c] border-white/5 text-neutral-400 hover:text-white hover:border-gold-500/20'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Bot className={`w-3.5 h-3.5 ${activeGeminiMode === 'agent' ? 'text-gold-500' : 'text-neutral-500'}`} />
                    <span className="tracking-wider uppercase font-bold">AGENT</span>
                  </div>
                  {activeGeminiMode === 'agent' && (
                    <span className="text-[8px] bg-gold-500 text-black px-1.5 py-0.5 rounded font-extrabold tracking-wider animate-pulse">ACTIVE</span>
                  )}
                </button>

                {/* 3. AI OPTIMIZER */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveGeminiMode('optimizer');
                    setGeminiResponse(null);
                    setSuggestedPreset(null);
                  }}
                  onMouseEnter={() => setHoveredMode('optimizer')}
                  onMouseLeave={() => setHoveredMode(null)}
                  className={`w-full flex items-center justify-between gap-2 font-mono text-[10px] px-3.5 py-3 rounded border transition-all duration-200 cursor-pointer ${
                    activeGeminiMode === 'optimizer'
                      ? 'bg-gold-500/15 border-gold-500 text-gold-500 font-bold shadow-[0_0_12px_rgba(212,175,55,0.15)]'
                      : 'bg-[#0c0c0c] border-white/5 text-neutral-400 hover:text-white hover:border-gold-500/20'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Cpu className={`w-3.5 h-3.5 ${activeGeminiMode === 'optimizer' ? 'text-gold-500' : 'text-neutral-500'}`} />
                    <span className="tracking-wider uppercase font-bold">AI OPTIMIZER</span>
                  </div>
                  {activeGeminiMode === 'optimizer' && (
                    <span className="text-[8px] bg-gold-500 text-black px-1.5 py-0.5 rounded font-extrabold tracking-wider animate-pulse">ACTIVE</span>
                  )}
                </button>
              </div>

              {/* REAL-TIME DYNAMIC DESCRIPTION BOX FOR HOVER STATE */}
              <div className="bg-[#050505] p-2.5 rounded border border-white/5 font-mono text-[9px] text-neutral-400 leading-relaxed shrink-0">
                <span className="text-gold-500/50 font-bold block uppercase text-[8px] mb-0.5 tracking-wider">
                  // {hoveredMode ? 'SYSTEM HOVER BRIEF:' : 'SYSTEM STATUS:'}
                </span>
                <span className="text-neutral-300">
                  {hoveredMode 
                    ? (hoveredMode === 'art_director' 
                        ? "Generates artistic critiques and real-time aesthetic analysis for the current VFX canvas composition."
                        : hoveredMode === 'agent'
                        ? "An intelligent conversational assistant to explore visual signals and apply custom parameters."
                        : "Instantly recalibrates VFX nodes and parameters for optimal visual density and harmony.")
                    : `Active Gemini Pathway: ${activeGeminiMode.toUpperCase().replace('_', ' ')}. Enter your instructions below.`}
                </span>
              </div>

              {/* INTEGRATED MINI-CONSOLE FOR OUTPUT */}
              {(geminiResponse || isProcessingGemini) && (
                <div className="bg-black/90 border border-gold-500/15 p-3 rounded font-mono text-[9px] text-neutral-300 leading-relaxed max-h-[110px] overflow-y-auto scrollbar-thin flex-1 min-h-[50px] shadow-inner">
                  {isProcessingGemini ? (
                    <div className="flex items-center gap-2 text-gold-500/80 animate-pulse">
                      <RefreshCw className="w-3 h-3 animate-spin text-gold-500" />
                      <span>Processing neural logic via Gemini Core...</span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="text-gold-500/60 font-bold uppercase text-[8px] tracking-wider flex justify-between">
                        <span>// RESPONSE OUTPUT:</span>
                        {activeGeminiMode === 'agent' && (
                          <button 
                            onClick={() => setIsAiDrawerOpen(true)}
                            className="text-[8px] hover:text-gold-400 underline uppercase cursor-pointer"
                          >
                            Open Node Dialog
                          </button>
                        )}
                      </div>
                      <div className="text-neutral-300 italic whitespace-pre-line">
                        "{geminiResponse}"
                      </div>

                      {/* Manual presets applicator shown on demand inside Agent Mode */}
                      {suggestedPreset && activeGeminiMode === 'agent' && (
                        <button
                          onClick={() => handleApplyPreset(suggestedPreset)}
                          className="mt-2 w-full px-2 py-1 bg-gold-500 text-black font-extrabold text-[8px] tracking-wider uppercase rounded hover:bg-gold-400 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Cpu className="w-3 h-3" />
                          Apply Suggested Preset
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* COMMUNICATOR PROMPT INPUT TOPBAR STYLE BAR */}
              <div className="pt-2 border-t border-gold-500/10 shrink-0">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendToGemini();
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={geminiPrompt}
                    onChange={(e) => setGeminiPrompt(e.target.value)}
                    placeholder={
                      activeGeminiMode === 'art_director'
                        ? "Guide the Art Director critique..."
                        : activeGeminiMode === 'agent'
                        ? "Ask Gemini Agent a custom question..."
                        : "Optimize settings (e.g., retro look)..."
                    }
                    className="flex-1 bg-neutral-950 border border-gold-500/25 px-3 py-2 rounded font-mono text-[11px] text-white focus:outline-none focus:border-gold-500/60 placeholder-neutral-700"
                  />
                  <button
                    type="submit"
                    disabled={isProcessingGemini}
                    className="px-3 py-2 bg-gold-500 text-black hover:bg-gold-400 font-extrabold rounded flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            </div>

          </section>

          {/* COLUMN 2: THE MAIN GRAPHIC STAGE (Center Panel) */}
          <section className="lg:col-span-5 p-6 md:p-8 flex flex-col justify-between bg-[#030303]">
            {/* Interactive Vfx Canvas Component */}
            <div className="flex-1 min-h-[350px] lg:min-h-0 relative rounded border border-gold-500/25 bg-black overflow-hidden flex flex-col">
              <VfxCanvas
                activeModule={activeModule}
                setActiveModule={setActiveModule}
                modules={modules}
                signalSource={signalSource}
                isStreaming={isStreaming}
              />
            </div>
          </section>

          {/* COLUMN 3: EFFECTS LIBRARY & SELECTION (Right Panel) */}
          <section className="lg:col-span-3 pt-12 pb-24 px-8 md:px-10 lg:px-12 flex flex-col space-y-6 bg-[#080808] overflow-y-auto max-h-[calc(100vh-140px)] scrollbar-thin">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-gold-500/20 pb-2">
                <div className="flex items-center gap-1.5 font-mono text-xs text-gold-500 font-bold uppercase tracking-wider">
                  <Layers className="w-3.5 h-3.5 text-gold-500" />
                  EFFECTS LIBRARY
                </div>
                <span className="text-[9px] font-mono text-neutral-500 uppercase font-semibold">5 SYSTEMS</span>
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
                        <span className="text-gold-500 font-bold">{numStr} // {m.id.toUpperCase()}</span>
                        
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
                      
                      <p className="text-[10px] text-neutral-400 line-clamp-3 leading-relaxed font-mono mt-1">
                        {m.description}
                      </p>
                    </div>
                  );
                })}
              </div>
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
