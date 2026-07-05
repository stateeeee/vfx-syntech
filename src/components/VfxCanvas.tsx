import React, { useRef, useEffect, useState } from 'react';
import { ModuleConfig, ModuleId, SignalSource } from '../types';

interface VfxCanvasProps {
  activeModule: ModuleId;
  setActiveModule: (id: ModuleId) => void;
  modules: ModuleConfig[];
  signalSource: SignalSource;
  isStreaming: boolean;
}

interface GraphNode {
  id: string;
  moduleId?: ModuleId; // If it's a primary hub node
  label?: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetX: number;
  targetY: number;
  size: number;
  baseSize: number;
  color: string;
  glow: string;
  pulseSpeed: number;
  pulsePhase: number;
}

interface GraphEdge {
  source: number; // Index of source node
  target: number; // Index of target node
  activeColor: string;
  inactiveColor: string;
}

export default function VfxCanvas({
  activeModule,
  setActiveModule,
  modules,
  signalSource,
  isStreaming,
}: VfxCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  
  // Mouse coordinates tracking
  const mouseRef = useRef({ x: -1000, y: -1000, clicked: false });

  // Audio state
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [micActive, setMicActive] = useState(false);
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);

  // Initialize Microphone Audio Context
  useEffect(() => {
    if (signalSource === 'MIC_AUDIO_03' && isStreaming) {
      const initMic = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          streamRef.current = stream;

          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          const audioCtx = new AudioContextClass();
          audioContextRef.current = audioCtx;

          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          analyserRef.current = analyser;

          const source = audioCtx.createMediaStreamSource(stream);
          source.connect(analyser);
          sourceRef.current = source;

          setMicActive(true);
          setMicPermissionDenied(false);
        } catch (err) {
          console.error('Error accessing microphone:', err);
          setMicActive(false);
          setMicPermissionDenied(true);
        }
      };
      initMic();
    } else {
      cleanupMic();
    }

    return () => {
      cleanupMic();
    };
  }, [signalSource, isStreaming]);

  const cleanupMic = () => {
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setMicActive(false);
  };

  // Mouse event handlers for interactive node dots
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    mouseRef.current.x = e.clientX - rect.left;
    mouseRef.current.y = e.clientY - rect.top;
  };

  const handleMouseLeave = () => {
    mouseRef.current.x = -1000;
    mouseRef.current.y = -1000;
  };

  const handleMouseDown = () => {
    mouseRef.current.clicked = true;
  };

  // Canvas drawing loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = canvas.width;
    let height = canvas.height;

    // Handle resizing using ResizeObserver
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        canvas.width = w * window.devicePixelRatio;
        canvas.height = h * window.devicePixelRatio;
        width = canvas.width;
        height = canvas.height;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      }
    });

    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }

    // -------------------------------------------------------------
    // INITIALIZE OBSIDIAN GRAPH VIEW NODE CONSTALLATIONS
    // -------------------------------------------------------------
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    const initializeGraph = (w: number, h: number) => {
      nodes.length = 0;
      edges.length = 0;

      const cx = w / 2;
      const cy = h / 2;

      // Define our 4 main Hubs (representing active modules in the network)
      const hubsConfig: { id: ModuleId; label: string; angle: number; dist: number; color: string; glow: string }[] = [
        { id: 'blob', label: 'BLOB STATE', angle: -Math.PI / 4 - 0.2, dist: 120, color: '#ffffff', glow: '#D4AF37' },
        { id: 'analog', label: 'ANALOG STATE', angle: Math.PI / 4 + 0.1, dist: 130, color: '#ffffff', glow: '#D4AF37' },
        { id: 'particle', label: 'PARTICLE HARMONICS', angle: Math.PI - 0.5, dist: 140, color: '#ffffff', glow: '#D4AF37' },
        { id: 'spectrum', label: 'SPECTRUM ANALYZER', angle: -Math.PI / 2 - 0.3, dist: 125, color: '#ffffff', glow: '#D4AF37' },
      ];

      // Add central master core node representing the root index.md / Obsidian Vault main core
      const coreIdx = 0;
      nodes.push({
        id: 'system_core',
        label: 'VFX SYNTECH',
        x: cx,
        y: cy,
        vx: 0,
        vy: 0,
        targetX: cx,
        targetY: cy,
        size: 9,
        baseSize: 9,
        color: '#ffffff',
        glow: '#D4AF37',
        pulseSpeed: 0.02,
        pulsePhase: 0,
      });

      // Create primary hubs
      hubsConfig.forEach((hub, i) => {
        const hx = cx + Math.cos(hub.angle) * hub.dist;
        const hy = cy + Math.sin(hub.angle) * hub.dist;
        const hubIdx = nodes.length;

        nodes.push({
          id: hub.id,
          moduleId: hub.id,
          label: hub.label,
          x: hx + (Math.random() - 0.5) * 50,
          y: hy + (Math.random() - 0.5) * 50,
          vx: 0,
          vy: 0,
          targetX: hx,
          targetY: hy,
          size: 6.5,
          baseSize: 6.5,
          color: hub.color,
          glow: hub.glow,
          pulseSpeed: 0.03 + i * 0.005,
          pulsePhase: Math.random() * Math.PI,
        });

        // Link Hub to Central Core
        edges.push({
          source: coreIdx,
          target: hubIdx,
          activeColor: 'rgba(212, 175, 55, 0.45)',
          inactiveColor: 'rgba(212, 175, 55, 0.15)',
        });

        // Generate satellite clusters branching out from this hub
        const numSatellites = 14 + Math.floor(Math.random() * 6); // 14 to 20 subnodes per module
        for (let s = 0; s < numSatellites; s++) {
          const satAngle = hub.angle + (Math.random() - 0.5) * (Math.PI / 1.5);
          const satDist = 40 + Math.random() * 75;
          const sx = hx + Math.cos(satAngle) * satDist;
          const sy = hy + Math.sin(satAngle) * satDist;
          const satIdx = nodes.length;

          // Color palette containing Obsidian neon gold, warm amber, soft grey, and white sparkles
          const isGoldSpark = Math.random() > 0.4;
          const nodeColor = isGoldSpark ? '#D4AF37' : '#8a6e2f';
          const sizeVal = 1.8 + Math.random() * 2.2;

          nodes.push({
            id: `${hub.id}_sat_${s}`,
            x: sx + (Math.random() - 0.5) * 20,
            y: sy + (Math.random() - 0.5) * 20,
            vx: 0,
            vy: 0,
            targetX: sx,
            targetY: sy,
            size: sizeVal,
            baseSize: sizeVal,
            color: nodeColor,
            glow: isGoldSpark ? '#D4AF37' : 'rgba(212, 175, 55, 0.2)',
            pulseSpeed: 0.01 + Math.random() * 0.02,
            pulsePhase: Math.random() * Math.PI * 2,
          });

          // Link satellite to its master hub
          edges.push({
            source: hubIdx,
            target: satIdx,
            activeColor: 'rgba(212, 175, 55, 0.35)',
            inactiveColor: 'rgba(212, 175, 55, 0.08)',
          });

          // Occasional cross-connections between sibling satellites to form organic cluster mesh
          if (s > 0 && Math.random() > 0.75) {
            edges.push({
              source: satIdx,
              target: satIdx - 1,
              activeColor: 'rgba(212, 175, 55, 0.25)',
              inactiveColor: 'rgba(212, 175, 55, 0.04)',
            });
          }
        }
      });

      // Generate a few rogue/unconnected isolated floating stars for that dynamic galaxy backdrop
      const numRogue = 15;
      for (let r = 0; r < numRogue; r++) {
        const rx = Math.random() * w;
        const ry = Math.random() * h;
        nodes.push({
          id: `rogue_${r}`,
          x: rx,
          y: ry,
          vx: 0,
          vy: 0,
          targetX: rx,
          targetY: ry,
          size: 1.2 + Math.random() * 1.5,
          baseSize: 1.2 + Math.random() * 1.5,
          color: '#513d1e',
          glow: 'rgba(212, 175, 55, 0.08)',
          pulseSpeed: 0.01,
          pulsePhase: Math.random() * Math.PI,
        });
      }
    };

    // Trigger initial setup with reasonable defaults
    initializeGraph(600, 400);

    let frameCount = 0;

    const render = () => {
      frameCount++;
      const w = canvas.width / window.devicePixelRatio;
      const h = canvas.height / window.devicePixelRatio;

      // Recalibrate node targets dynamically if viewport dimensions change dramatically
      if (nodes.length > 0 && Math.abs(nodes[0].targetX - w / 2) > 5) {
        initializeGraph(w, h);
      }

      // Clear with absolute deep pitch obsidian background
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, w, h);

      // Render fine tech grid background to reinforce system blueprints
      ctx.strokeStyle = '#0d0d0d'; // extremely faint
      ctx.lineWidth = 0.5;
      const gridSize = 40;
      for (let x = 0; x < w; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Check if engine is online
      if (!isStreaming) {
        ctx.fillStyle = 'rgba(212, 175, 55, 0.02)';
        for (let i = 0; i < 5; i++) {
          const rh = Math.random() * 3 + 1;
          const ry = Math.random() * h;
          ctx.fillRect(0, ry, w, rh);
        }

        ctx.font = '9px var(--font-mono)';
        ctx.fillStyle = '#513d1e';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('ENGINE STANDBY // CONSTALLATION GRAPH SLEEPING', w / 2, h / 2 - 15);
        ctx.fillText('CLICK "INITIALIZE STREAM" TO ACTIVATE OBSIDIAN CHANNELS', w / 2, h / 2 + 5);

        // Standby scoping baseline
        ctx.strokeStyle = '#2c200e';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(30, h / 2);
        for (let x = 30; x < w - 30; x += 1.5) {
          const noise = Math.sin(x * 0.04 + frameCount * 0.015) * 1.2;
          ctx.lineTo(x, h / 2 + noise);
        }
        ctx.stroke();

        animationRef.current = requestAnimationFrame(render);
        return;
      }

      // Read real microphone data or process dynamic simulation levels
      let audioBuffer = new Uint8Array(128);
      if (micActive && analyserRef.current) {
        analyserRef.current.getByteFrequencyData(audioBuffer);
      } else {
        const speedFactor = signalSource === 'GOLD_NOISE_04' ? 0.35 : 0.07;
        for (let i = 0; i < 128; i++) {
          let val = 0;
          if (signalSource === 'GOLD_NOISE_04') {
            val = Math.sin(i * 0.12 + frameCount * speedFactor) * 25 + (Math.random() * 20);
          } else if (signalSource === 'R_INPUT_CHANNEL_02') {
            val = Math.sin(i * 0.06 + frameCount * speedFactor) * 45 + Math.cos(i * 0.15 - frameCount * 0.05) * 15;
          } else {
            val = Math.sin(i * 0.04 + frameCount * speedFactor) * 60 + Math.sin(i * 0.1) * 10;
          }
          audioBuffer[i] = Math.max(0, Math.min(255, val + 50));
        }
      }

      // Music amplitude impact factor
      const amplitudeFactor = (audioBuffer[10] || 0) / 255.0; // 0.0 to 1.0

      // -------------------------------------------------------------
      // PHYSICAL FORCE-DIRECTED SPRING PHYSICS LOOP
      // -------------------------------------------------------------
      const cx = w / 2;
      const cy = h / 2;

      // Update positions of central nodes
      if (nodes.length > 0) {
        nodes[0].targetX = cx;
        nodes[0].targetY = cy;
      }

      // Gentle force directed spring loop
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];

        // Core drifts slightly on music frequency trigger
        const frequencyVibe = Math.sin(frameCount * 0.08 + i * 0.5) * (amplitudeFactor * 5);

        // 1. Return to base target position using spring tension
        const dx = node.targetX - node.x;
        const dy = node.targetY - node.y;
        node.vx += dx * 0.012;
        node.vy += dy * 0.012;

        // 2. Interactive mouse push / repeller field
        const mdx = node.x - mouseRef.current.x;
        const mdy = node.y - mouseRef.current.y;
        const mdist = Math.hypot(mdx, mdy);
        if (mdist < 80) {
          const repelForce = (1 - mdist / 80) * 1.5;
          node.vx += (mdx / (mdist || 1)) * repelForce;
          node.vy += (mdy / (mdist || 1)) * repelForce;
        }

        // 3. Audio vibration
        node.vx += (Math.random() - 0.5) * (amplitudeFactor * 0.8);
        node.vy += (Math.random() - 0.5) * (amplitudeFactor * 0.8);

        // Apply friction
        node.vx *= 0.88;
        node.vy *= 0.88;

        // Step coordinates
        node.x += node.vx;
        node.y += node.vy;

        // Pulsing dynamic node sizes
        const pVal = Math.sin(frameCount * node.pulseSpeed + node.pulsePhase) * 0.35 + 0.65;
        node.size = node.baseSize * (1 + pVal * 0.15 + (amplitudeFactor * 0.35));
      }

      // -------------------------------------------------------------
      // HOVER INTERACTIVE NODE DETECTION
      // -------------------------------------------------------------
      let hoveredNodeIdx = -1;
      let minHoverDist = 18; // maximum interactive click range

      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node.moduleId) { // Only click primary Module Hubs
          const dist = Math.hypot(node.x - mouseRef.current.x, node.y - mouseRef.current.y);
          if (dist < minHoverDist) {
            minHoverDist = dist;
            hoveredNodeIdx = i;
          }
        }
      }

      // Change cursor to pointer if hovering on switchable modules
      const isHoveringHub = hoveredNodeIdx !== -1;
      if (isHoveringHub) {
        canvas.style.cursor = 'pointer';
        if (mouseRef.current.clicked) {
          const clickedHub = nodes[hoveredNodeIdx];
          if (clickedHub.moduleId) {
            setActiveModule(clickedHub.moduleId);
          }
        }
      } else {
        canvas.style.cursor = 'default';
      }
      
      // Reset mouse clicked latch
      if (mouseRef.current.clicked) {
        mouseRef.current.clicked = false;
      }

      const activeHubNode = nodes.find((n) => n.moduleId === activeModule);

      // -------------------------------------------------------------
      // DRAW EDGES (THE CONSTALLATION WEB FILAMENTS)
      // -------------------------------------------------------------
      ctx.lineWidth = 0.5;
      edges.forEach((edge) => {
        const srcNode = nodes[edge.source];
        const tgtNode = nodes[edge.target];

        const isSourceActive = srcNode.moduleId === activeModule || (srcNode.id.startsWith(activeModule ?? ''));
        const isTargetActive = tgtNode.moduleId === activeModule || (tgtNode.id.startsWith(activeModule ?? ''));
        const isActiveFilament = isSourceActive && isTargetActive;

        ctx.beginPath();
        ctx.moveTo(srcNode.x, srcNode.y);
        ctx.lineTo(tgtNode.x, tgtNode.y);

        if (isActiveFilament) {
          // Glow filaments bright gold on active module selection
          ctx.strokeStyle = 'rgba(212, 175, 55, 0.45)';
          ctx.lineWidth = 0.9 + (amplitudeFactor * 0.5);
        } else {
          // Extremely faint obsidian web structure otherwise
          ctx.strokeStyle = 'rgba(138, 110, 47, 0.08)';
          ctx.lineWidth = 0.45;
        }
        ctx.stroke();

        // Pulsing electric signal impulses traversing along the filaments
        if (isActiveFilament && frameCount % 60 < 25) {
          const travelProg = ((frameCount % 60) / 25);
          const px = srcNode.x + (tgtNode.x - srcNode.x) * travelProg;
          const py = srcNode.y + (tgtNode.y - srcNode.y) * travelProg;
          ctx.beginPath();
          ctx.arc(px, py, 1.2, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
        }
      });

      // -------------------------------------------------------------
      // DRAW GRAPH NODES (SPARKLES & HUBS)
      // -------------------------------------------------------------
      nodes.forEach((node, i) => {
        const isHub = !!node.moduleId;
        const isSystemCore = node.id === 'system_core';
        const isSelectedActive = node.moduleId === activeModule;
        
        // Highlight active cluster satellites
        const isSatelliteOfActive = node.id.startsWith(activeModule ?? '');

        ctx.save();

        if (isSystemCore) {
          // Central Core Nebula Glow
          const nebGrad = ctx.createRadialGradient(node.x, node.y, 1, node.x, node.y, 22 + (amplitudeFactor * 15));
          nebGrad.addColorStop(0, 'rgba(212, 175, 55, 0.15)');
          nebGrad.addColorStop(1, 'rgba(5, 5, 5, 0)');
          ctx.fillStyle = nebGrad;
          ctx.beginPath();
          ctx.arc(node.x, node.y, 22 + (amplitudeFactor * 15), 0, Math.PI * 2);
          ctx.fill();
        }

        if (isHub) {
          // Obsidian Hub Glow
          const glowRad = node.size * (isSelectedActive ? 3.5 : 2.5) + (amplitudeFactor * 6);
          const hubGrad = ctx.createRadialGradient(node.x, node.y, 1, node.x, node.y, glowRad);
          hubGrad.addColorStop(0, isSelectedActive ? 'rgba(212, 175, 55, 0.45)' : 'rgba(212, 175, 55, 0.15)');
          hubGrad.addColorStop(1, 'rgba(5, 5, 5, 0)');
          
          ctx.fillStyle = hubGrad;
          ctx.beginPath();
          ctx.arc(node.x, node.y, glowRad, 0, Math.PI * 2);
          ctx.fill();

          // Outer reticle halo rings around Hubs
          ctx.strokeStyle = isSelectedActive ? '#ffffff' : 'rgba(212, 175, 55, 0.25)';
          ctx.lineWidth = isSelectedActive ? 0.9 : 0.45;
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.size + 4 + Math.sin(frameCount * 0.05 + i) * 1.5, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Draw solid core dot
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.size, 0, Math.PI * 2);

        if (isSystemCore) {
          ctx.fillStyle = '#D4AF37';
        } else if (isHub) {
          ctx.fillStyle = isSelectedActive ? '#ffffff' : '#D4AF37';
        } else if (isSatelliteOfActive) {
          ctx.fillStyle = '#ebd67d'; // Active satellite glows white-gold
        } else {
          ctx.fillStyle = node.color; // Standard grey/brown nebula particles
        }
        ctx.fill();

        // -------------------------------------------------------------
        // NODE TEXT LABELS / LABELS (Draw beautifully in HUD cards)
        // -------------------------------------------------------------
        if (node.label) {
          const isCore = node.id === 'system_core';
          const drawLabel = isCore || isSelectedActive || (hoveredNodeIdx === i);

          if (drawLabel) {
            ctx.restore();
            ctx.save();
            
            // Layout placement parameters
            const labelYOffset = isCore ? -16 : 14;
            ctx.font = isCore ? 'bold 10px var(--font-mono)' : 'bold 9px var(--font-mono)';
            ctx.fillStyle = isSelectedActive || isCore ? '#ffffff' : 'rgba(212, 175, 55, 0.7)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const textWidth = ctx.measureText(node.label).width;
            const padX = 6;
            const padY = 3.5;

            // Draw clean background pill container
            ctx.fillStyle = 'rgba(5, 5, 5, 0.85)';
            ctx.strokeStyle = isSelectedActive || isCore ? '#D4AF37' : 'rgba(212, 175, 55, 0.35)';
            ctx.lineWidth = 0.8;
            
            const rx = node.x - textWidth / 2 - padX;
            const ry = node.y + labelYOffset - 5 - padY;
            const rw = textWidth + padX * 2;
            const rh = 10 + padY * 2;

            ctx.beginPath();
            ctx.roundRect(rx, ry, rw, rh, 3);
            ctx.fill();
            ctx.stroke();

            // Text print
            ctx.fillStyle = isSelectedActive || isCore ? '#ffffff' : '#D4AF37';
            ctx.fillText(node.label, node.x, node.y + labelYOffset);
          }
        }

        ctx.restore();
      });

      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      resizeObserver.disconnect();
    };
  }, [activeModule, modules, signalSource, isStreaming, micActive]);

  return (
    <div 
      className="relative w-full h-full min-h-[300px] border border-gold-800/40 bg-[#050505] overflow-hidden rounded-md gold-glow-border"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
      
      {/* HUD Info Labels */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-0.5 rounded border border-gold-900/60 bg-black/85 font-mono text-[9px] text-gold-400">
        <span className={`w-1.5 h-1.5 rounded-full ${isStreaming ? 'bg-gold-500 animate-pulse' : 'bg-neutral-700'}`}></span>
        <span>OBSIDIAN CONSTALLATION VAULT v2</span>
      </div>

      <div className="absolute top-3 right-3 flex items-center gap-2 font-mono text-[9px] text-gold-400/80 bg-black/85 px-2 py-0.5 rounded border border-gold-900/60">
        <span>SIGNAL: {signalSource}</span>
      </div>

      <div className="absolute bottom-3 left-3 font-mono text-[8px] text-neutral-500 max-w-[240px] pointer-events-none uppercase">
        Obsidian Graph Engine // Hover and click node clusters to switch channels dynamically
      </div>

      {micPermissionDenied && signalSource === 'MIC_AUDIO_03' && (
        <div className="absolute inset-x-4 bottom-14 flex items-center gap-2 px-3 py-2 bg-red-950/80 border border-red-900/40 text-red-200 rounded font-mono text-xs">
          <span>⚠️ Access to microphone was denied. Using procedural generator.</span>
        </div>
      )}
    </div>
  );
}
