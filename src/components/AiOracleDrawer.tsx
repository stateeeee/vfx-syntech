import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  X, 
  Send, 
  Bot, 
  User, 
  RefreshCw, 
  Cpu, 
  SlidersHorizontal,
  Lightbulb,
  Workflow
} from 'lucide-react';
import Markdown from 'react-markdown';

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
  presetSuggested?: any;
}

interface AiOracleDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentConfig: {
    activeModule: string;
    signalSource: string;
    bufferSize: number;
    parameters: any;
  };
  onApplyPreset: (preset: any) => void;
}

export default function AiOracleDrawer({
  isOpen,
  onClose,
  currentConfig,
  onApplyPreset,
}: AiOracleDrawerProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'model',
      text: `Greetings, Operator. I am the **VFX Syntech AI Vault Oracle** embedded in your Obsidian Constellation Vault.

I can help you analyze visual signals, suggest mathematical VFX parameters, or optimize the live matrix constellations. 

Try selecting one of the analytical pathways below or write a custom query to begin.`,
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('Consulting core index...');
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll chat to latest messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Cybernetic loading texts sequence
  useEffect(() => {
    if (!isLoading) return;
    const phrases = [
      'Accessing vault index...',
      'Decompressing node vectors...',
      'Synthesizing parameters...',
      'Consulting Gemini models...',
      'Finalizing neural prediction...'
    ];
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % phrases.length;
      setLoadingText(phrases[i]);
    }, 1500);
    return () => clearInterval(interval);
  }, [isLoading]);

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;

    const userMsg: Message = {
      id: `msg_${Date.now()}`,
      role: 'user',
      text: textToSend,
      timestamp: new Date()
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      // Map current React messages state to backend payload
      const historyPayload = messages.map(m => ({
        role: m.role,
        text: m.text
      }));

      const res = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          history: historyPayload,
          currentConfig: {
            activeModule: currentConfig.activeModule,
            signalSource: currentConfig.signalSource,
            bufferSize: currentConfig.bufferSize,
            parameters: currentConfig.parameters
          }
        })
      });

      const data = await res.json();

      if (res.ok) {
        const modelMsg: Message = {
          id: `msg_${Date.now() + 1}`,
          role: 'model',
          text: data.reply,
          timestamp: new Date(),
          presetSuggested: data.preset
        };
        setMessages((prev) => [...prev, modelMsg]);
      } else {
        throw new Error(data.error || 'Server rejected request');
      }

    } catch (err: any) {
      console.error('AI chat error:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: `msg_err_${Date.now()}`,
          role: 'model',
          text: `⚠️ **Neural Link Interruption**: Failed to complete server-side prompt proxy. Please ensure your \`GEMINI_API_KEY\` is configured in the secrets menu. \n\n*Error details: ${err.message || 'Unknown network failure'}*`,
          timestamp: new Date()
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const triggerPresetAction = (presetName: string, prompt: string) => {
    handleSendMessage(prompt);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Dark Backdrop Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black z-40"
          />

          {/* Obsidian AI Side Drawer Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 h-full w-full max-w-md bg-[#050505] border-l border-gold-500/25 z-50 flex flex-col shadow-2xl"
          >
            {/* Header section with branding & active status */}
            <div className="px-6 py-5 border-b border-gold-500/20 bg-black flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 border border-gold-500/60 rotate-45 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4 text-gold-500 -rotate-45" />
                </div>
                <div>
                  <h2 className="text-xs tracking-[0.25em] font-mono text-gold-500 uppercase font-bold">
                    OBSIDIAN AI VAULT
                  </h2>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-gold-500 animate-pulse"></span>
                    <span className="text-[9px] font-mono text-neutral-400">ORACLE NODE v2.0 // GEMINI 3.5</span>
                  </div>
                </div>
              </div>

              <button 
                onClick={onClose}
                className="p-1.5 rounded border border-gold-500/10 hover:border-gold-500/40 text-neutral-400 hover:text-white transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Config context info block */}
            <div className="px-6 py-3 bg-[#0a0a0a] border-b border-gold-500/10 flex justify-between items-center text-[9px] font-mono text-neutral-400">
              <span>TARGET MODULE: <strong className="text-gold-500 uppercase">{currentConfig.activeModule}</strong></span>
              <span>INPUT: <strong className="text-gold-500 uppercase">{currentConfig.signalSource}</strong></span>
            </div>

            {/* Scrollable multi-turn chat message thread */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 scrollbar-thin scrollbar-thumb-gold-950">
              {messages.map((msg) => {
                const isModel = msg.role === 'model';
                return (
                  <div 
                    key={msg.id} 
                    className={`flex gap-3.5 ${isModel ? 'justify-start' : 'justify-end'}`}
                  >
                    {isModel && (
                      <div className="w-7 h-7 rounded bg-gold-950/40 border border-gold-500/30 flex items-center justify-center shrink-0 text-gold-500">
                        <Bot className="w-4 h-4" />
                      </div>
                    )}

                    <div className="max-w-[85%] space-y-2.5">
                      <div className={`p-4 rounded border font-mono text-xs leading-relaxed ${
                        isModel 
                          ? 'bg-black/60 border-gold-500/15 text-neutral-300' 
                          : 'bg-gold-500/10 border-gold-500/35 text-gold-200'
                      }`}>
                        
                        {/* Rendering response markdown content nicely wrapped */}
                        <div className="markdown-body space-y-1.5">
                          <Markdown>{msg.text.split('PRESET:')[0]}</Markdown>
                        </div>

                        {/* Apply Interactive Parameters Suggestions */}
                        {isModel && msg.presetSuggested && (
                          <div className="mt-3.5 pt-3.5 border-t border-gold-500/15 space-y-2">
                            <div className="flex items-center gap-1.5 text-[10px] text-gold-400 font-bold">
                              <SlidersHorizontal className="w-3.5 h-3.5 text-gold-500" />
                              NEURAL PARAMETER RECOMMENDED!
                            </div>
                            <p className="text-[9px] text-neutral-400 leading-tight">
                              The AI has calculated a mathematical coordinate map for your current canvas. Apply directly?
                            </p>
                            <button
                              onClick={() => onApplyPreset(msg.presetSuggested)}
                              className="w-full mt-1 px-3 py-2 bg-gold-500 text-black font-extrabold text-[10px] tracking-wider uppercase rounded hover:bg-gold-400 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <Cpu className="w-3.5 h-3.5" />
                              APPLY PRESET TO SLIDERS
                            </button>
                          </div>
                        )}
                      </div>

                      <div className={`text-[8px] text-neutral-600 font-mono px-1 ${!isModel ? 'text-right' : ''}`}>
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>

                    {!isModel && (
                      <div className="w-7 h-7 rounded bg-gold-500/20 border border-gold-500/40 flex items-center justify-center shrink-0 text-gold-300">
                        <User className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                );
              })}

              {isLoading && (
                <div className="flex gap-3.5 justify-start">
                  <div className="w-7 h-7 rounded bg-gold-950/40 border border-gold-500/30 flex items-center justify-center shrink-0 text-gold-500 animate-spin">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </div>
                  <div className="p-4 rounded border border-gold-500/10 bg-black/40 font-mono text-[10px] text-gold-500/70 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-gold-500 animate-ping"></span>
                    <span>{loadingText}</span>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Quick Presets Action Bar */}
            <div className="px-6 py-3 border-t border-gold-500/10 bg-[#080808] space-y-2">
              <div className="text-[9px] font-mono text-neutral-500 uppercase font-bold tracking-wider">
                Select Analytical Vector
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => triggerPresetAction(
                    'optimize',
                    `Optimize the settings of the active module "${currentConfig.activeModule}" to maximize its visual density and output intensity. Generate preset.`
                  )}
                  disabled={isLoading}
                  className="px-2.5 py-1 rounded bg-[#111] border border-gold-500/15 text-[10px] font-mono text-gold-400 hover:text-white hover:border-gold-500/45 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-40"
                >
                  <Lightbulb className="w-3 h-3 text-gold-500" />
                  Optimize {currentConfig.activeModule.toUpperCase()}
                </button>

                <button
                  onClick={() => triggerPresetAction(
                    'constellation',
                    `Explain how the active module "${currentConfig.activeModule}" maps to the Obsidian Constellation Nodes. Give me some insights on signal flow.`
                  )}
                  disabled={isLoading}
                  className="px-2.5 py-1 rounded bg-[#111] border border-gold-500/15 text-[10px] font-mono text-gold-400 hover:text-white hover:border-gold-500/45 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-40"
                >
                  <Workflow className="w-3 h-3 text-gold-500" />
                  Graph Constellation Map
                </button>
              </div>
            </div>

            {/* Text Message Input Bar */}
            <div className="p-6 border-t border-gold-500/20 bg-black">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage(input);
                }}
                className="flex gap-2.5"
              >
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask Gemini to optimize active nodes..."
                  disabled={isLoading}
                  className="flex-1 bg-neutral-950 border border-gold-500/25 px-4 py-2.5 rounded font-mono text-xs text-white focus:outline-none focus:border-gold-500/60 placeholder-neutral-600 disabled:opacity-40"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="px-4 bg-gold-500 text-black font-extrabold rounded flex items-center justify-center transition-colors hover:bg-gold-400 cursor-pointer disabled:opacity-30"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
