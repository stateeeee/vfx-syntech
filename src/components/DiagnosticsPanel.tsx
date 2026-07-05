import React, { useState, useEffect, useRef } from 'react';
import { DiagnosticsState, SignalSource } from '../types';

interface DiagnosticsPanelProps {
  signalSource: SignalSource;
  isStreaming: boolean;
}

export default function DiagnosticsPanel({ signalSource, isStreaming }: DiagnosticsPanelProps) {
  const [diag, setDiag] = useState<DiagnosticsState>({
    cpuUsage: 14.5,
    memoryUsage: 312,
    gpuLoad: 24.1,
    signalStrength: 98.2,
    errorsDetected: 0,
    logs: [
      'SYSTEM INITIALIZED :: VFX SYNTECH v4.2.8-STABLE',
      'GLOBAL BUFFER ALLOCATED: 4896 SAMPLES',
      'NATIVE VECTOR ASSETS LOADED SUCCESSFULLY',
      'STANDBY READY FOR SIGNALLING STREAM...'
    ]
  });

  const [calibrating, setCalibrating] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  // Auto scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [diag.logs]);

  // Simulate standard fluctuating system metrics
  useEffect(() => {
    if (!isStreaming) return;

    const interval = setInterval(() => {
      setDiag((prev) => {
        const deltaCpu = (Math.random() - 0.5) * 3;
        const deltaGpu = (Math.random() - 0.5) * 4;
        const deltaMem = (Math.random() - 0.5) * 1.5;
        const strengthJitter = (Math.random() - 0.5) * 1.0;

        // Generate occasional signal warnings or info
        const newLogs = [...prev.logs];
        if (Math.random() < 0.08) {
          const events = [
            `CHANNEL FLUX OVERRIDE ACTUATED [${signalSource}]`,
            `RENDER PIPELINE SYNCHRONIZATION: OK`,
            `FRAME RASTER CONVERSION COMPLETE`,
            `LATENCY CALIBRATION STABLE AT 1.2MS`,
            `AURUM MATRIX MATRIX DETECTED: 512x512 CELLS`
          ];
          newLogs.push(`INFO :: ${events[Math.floor(Math.random() * events.length)]}`);
        }

        return {
          ...prev,
          cpuUsage: Math.max(8, Math.min(95, prev.cpuUsage + deltaCpu)),
          gpuLoad: Math.max(12, Math.min(98, prev.gpuLoad + deltaGpu)),
          memoryUsage: Math.max(290, Math.min(450, prev.memoryUsage + deltaMem)),
          signalStrength: Math.max(90, Math.min(100, prev.signalStrength + strengthJitter)),
          logs: newLogs.slice(-40) // Keep last 40 lines
        };
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [isStreaming, signalSource]);

  // Add system logs helper
  const addLog = (msg: string) => {
    setDiag((prev) => ({
      ...prev,
      logs: [...prev.logs, `${new Date().toLocaleTimeString()} :: ${msg}`].slice(-40)
    }));
  };

  // Run mock diagnostics routine
  const handleDiagnosticAction = (actionName: string) => {
    if (calibrating) return;
    setCalibrating(actionName);
    setProgress(0);
    addLog(`INITIATING: ${actionName.toUpperCase()} ROUTINE...`);

    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          setCalibrating(null);
          addLog(`SUCCESS :: ${actionName.toUpperCase()} COMPLETE. STATUS: NOMINAL.`);
          
          if (actionName === 'Recalibrate Phase') {
            setDiag(prev => ({ ...prev, signalStrength: 99.8 }));
          } else if (actionName === 'Flush Buffers') {
            setDiag(prev => ({ ...prev, memoryUsage: 302 }));
          }
          return 100;
        }
        return p + 10;
      });
    }, 150);
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Dynamic Graph Meters */}
      <div className="grid grid-cols-2 gap-3">
        <div className="border border-gold-900/30 bg-neutral-950/40 p-2.5 rounded">
          <div className="flex justify-between text-[10px] font-mono text-gold-500 mb-1">
            <span>CPU COMPILER LOAD</span>
            <span>{diag.cpuUsage.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-neutral-900 h-1.5 rounded-full overflow-hidden">
            <div 
              className="bg-gold-500 h-full transition-all duration-300"
              style={{ width: `${diag.cpuUsage}%` }}
            />
          </div>
        </div>

        <div className="border border-gold-900/30 bg-neutral-950/40 p-2.5 rounded">
          <div className="flex justify-between text-[10px] font-mono text-gold-500 mb-1">
            <span>GPU RASTER BUFFER</span>
            <span>{diag.gpuLoad.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-neutral-900 h-1.5 rounded-full overflow-hidden">
            <div 
              className="bg-gold-400 h-full transition-all duration-300"
              style={{ width: `${diag.gpuLoad}%` }}
            />
          </div>
        </div>

        <div className="border border-gold-900/30 bg-neutral-950/40 p-2.5 rounded">
          <div className="flex justify-between text-[10px] font-mono text-gold-500 mb-1">
            <span>SYSTEM MEM ALLOC</span>
            <span>{diag.memoryUsage.toFixed(0)} MB</span>
          </div>
          <div className="w-full bg-neutral-900 h-1.5 rounded-full overflow-hidden">
            <div 
              className="bg-gold-600 h-full transition-all duration-300"
              style={{ width: `${(diag.memoryUsage / 500) * 100}%` }}
            />
          </div>
        </div>

        <div className="border border-gold-900/30 bg-neutral-950/40 p-2.5 rounded">
          <div className="flex justify-between text-[10px] font-mono text-gold-500 mb-1">
            <span>SIGNAL CONSTANCY</span>
            <span>{isStreaming ? diag.signalStrength.toFixed(1) : '0.0'}%</span>
          </div>
          <div className="w-full bg-neutral-900 h-1.5 rounded-full overflow-hidden">
            <div 
              className="bg-gold-300 h-full transition-all duration-300"
              style={{ width: `${isStreaming ? diag.signalStrength : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Diagnostics Buttons */}
      <div className="border border-gold-900/30 bg-neutral-950/20 p-3 rounded">
        <h4 className="text-[10px] font-mono text-gold-500 uppercase tracking-wider mb-2">DIAGNOSTIC CALIBRATION CONTROL</h4>
        
        {calibrating ? (
          <div className="space-y-2 py-1">
            <div className="flex justify-between text-[10px] font-mono text-gold-300">
              <span>RUNNING {calibrating.toUpperCase()}...</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-neutral-900 h-2 rounded border border-gold-900/30 overflow-hidden">
              <div 
                className="bg-gold-400 h-full transition-all duration-150"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleDiagnosticAction('Recalibrate Phase')}
              disabled={!isStreaming}
              className="px-2 py-1.5 text-[10px] font-mono text-gold-300 hover:text-white bg-neutral-950 hover:bg-gold-950/30 border border-gold-800/40 disabled:opacity-40 rounded transition-colors"
            >
              RECALIBRATE
            </button>
            <button
              onClick={() => handleDiagnosticAction('Flush Buffers')}
              className="px-2 py-1.5 text-[10px] font-mono text-gold-300 hover:text-white bg-neutral-950 hover:bg-gold-950/30 border border-gold-800/40 rounded transition-colors"
            >
              FLUSH BUFF
            </button>
            <button
              onClick={() => handleDiagnosticAction('Hardware Test')}
              className="px-2 py-1.5 text-[10px] font-mono text-gold-300 hover:text-white bg-neutral-950 hover:bg-gold-950/30 border border-gold-800/40 rounded transition-colors"
            >
              RUN TEST
            </button>
          </div>
        )}
      </div>

      {/* Dynamic scrolling console logs */}
      <div className="flex-1 flex flex-col min-h-[140px] border border-gold-900/30 bg-black rounded p-3 font-mono text-[9px] text-amber-500/90 overflow-hidden">
        <div className="flex justify-between border-b border-gold-950/80 pb-1 mb-2">
          <span>CONSOLE STREAMS MONITOR</span>
          <span>LIVE_LOGS</span>
        </div>
        <div 
          ref={logContainerRef}
          className="flex-1 overflow-y-auto space-y-1 pr-1"
        >
          {diag.logs.map((log, i) => (
            <div 
              key={i} 
              className={`leading-normal border-l-2 pl-1.5 py-0.5 ${
                log.includes('SUCCESS') ? 'border-gold-400 text-gold-200 bg-gold-950/10' :
                log.includes('INFO') ? 'border-gold-700 text-gold-500/90' :
                log.includes('INITIATING') ? 'border-amber-600 text-amber-300 bg-amber-950/10 animate-pulse' :
                'border-gold-900 text-gold-400/80'
              }`}
            >
              {log}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
