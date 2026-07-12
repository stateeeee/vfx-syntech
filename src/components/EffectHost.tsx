import React, { useEffect, useRef } from 'react';
import { ArrowLeft, Radio, Sparkle } from 'lucide-react';
import { ModuleConfig } from '../types';
import { EffectTelemetry, ParamSchema, ShellMessage } from '../bridge/types';
import { useEffectBridge } from '../bridge/useEffectBridge';

interface EffectHostProps {
  module: ModuleConfig;
  iframeSrc: string;
  isDayMode: boolean;
  onBack: () => void;
  onTelemetry?: (t: EffectTelemetry) => void;
  /** Latest ParamSchema declared by the effect (empty until syntech:ready) */
  onParams?: (params: ParamSchema[]) => void;
  /** Hands the shell a sender for param:set / preset:apply messages */
  onSendReady?: (send: (message: ShellMessage) => void) => void;
  /** Opens the Gemini AI drawer over the effect */
  onOpenAi?: () => void;
}

/**
 * Full-terminal host for a real effect (decision #1 in PLAN.md). Phase 1:
 * the effect is the original standalone HTML build running in an iframe;
 * the syntech:* bridge carries telemetry now and parameters from Phase 2.
 */
export default function EffectHost({
  module,
  iframeSrc,
  isDayMode,
  onBack,
  onTelemetry,
  onParams,
  onSendReady,
  onOpenAi,
}: EffectHostProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const { isReady, params, telemetry, send } = useEffectBridge(iframeRef, onTelemetry);

  const onParamsRef = useRef(onParams);
  onParamsRef.current = onParams;
  useEffect(() => {
    onParamsRef.current?.(params);
  }, [params]);

  const onSendReadyRef = useRef(onSendReady);
  onSendReadyRef.current = onSendReady;
  useEffect(() => {
    onSendReadyRef.current?.(send);
  }, [send]);

  const handleBack = () => {
    // Let the effect stop camera/mic/recorders before the frame is torn down
    send({ type: 'syntech:close' });
    onBack();
  };

  return (
    <div className="flex flex-col flex-1 min-h-[600px]">
      {/* Host toolbar: back navigation + live effect telemetry */}
      <div
        className={`flex items-center justify-between gap-3 px-4 md:px-6 py-3 border-b transition-colors duration-300 ${
          isDayMode ? 'border-gold-500/15 bg-[#f7f5f0]' : 'border-gold-500/20 bg-black'
        }`}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleBack}
            className={`flex items-center gap-2 font-mono text-[10px] font-bold tracking-[0.2em] uppercase px-3 py-2 rounded border transition-colors cursor-pointer ${
              isDayMode
                ? 'border-gold-500/40 text-gold-700 hover:bg-gold-500/10'
                : 'border-gold-500/30 text-gold-500 hover:bg-gold-500/10'
            }`}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to console
          </button>

          {onOpenAi && (
            <button
              type="button"
              onClick={onOpenAi}
              className="flex items-center gap-2 font-mono text-[10px] font-bold tracking-[0.2em] uppercase px-3 py-2 rounded bg-gold-500 text-black hover:bg-gold-400 transition-colors cursor-pointer"
            >
              <Sparkle className="w-3.5 h-3.5" />
              Gemini AI
            </button>
          )}
        </div>

        <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-widest">
          <span className={`font-extrabold ${isDayMode ? 'text-neutral-900' : 'text-white'}`}>
            {module.name}
          </span>

          <span
            className={`flex items-center gap-1.5 ${
              isReady ? 'text-gold-500' : isDayMode ? 'text-neutral-400' : 'text-neutral-600'
            }`}
          >
            <Radio className="w-3 h-3" />
            {isReady ? 'LINKED' : 'LOADING'}
          </span>

          {isReady && params.length > 0 && (
            <span className={`hidden md:inline ${isDayMode ? 'text-neutral-600' : 'text-neutral-400'}`}>
              <b className="text-gold-500">{params.length}</b> PARAMS
            </span>
          )}

          {telemetry && (
            <>
              <span className={isDayMode ? 'text-neutral-600' : 'text-neutral-400'}>
                FPS <b className="text-gold-500">{telemetry.fps}</b>
              </span>
              <span className={`hidden sm:inline ${isDayMode ? 'text-neutral-600' : 'text-neutral-400'}`}>
                SRC <b className="text-gold-500">{telemetry.srcMode.toUpperCase()}</b>
              </span>
              {telemetry.recording && (
                <span className="flex items-center gap-1 text-red-500 font-extrabold animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  REC
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* The effect itself. Removing the iframe on back also hard-releases
          camera/microphone in every browser, on top of syntech:close. */}
      <iframe
        ref={iframeRef}
        src={iframeSrc}
        title={module.name}
        className="flex-1 w-full min-h-[540px] border-0 bg-black"
        allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-write"
        allowFullScreen
      />
    </div>
  );
}
