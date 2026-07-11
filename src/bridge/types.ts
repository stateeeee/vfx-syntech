// Protocol between the VFX Syntech shell and effect modules.
// Today an effect is a standalone HTML build running in an iframe; after
// porting it will be a native module. Both speak the same messages, sent
// across the boundary as { type: 'syntech:*', payload } via postMessage,
// so the shell never needs to know how an effect is implemented.

export type ParamType = 'number' | 'boolean' | 'color' | 'enum' | 'xy';

export interface ParamSchema {
  key: string;
  label: string;
  type: ParamType;
  min?: number;
  max?: number;
  step?: number;
  value: unknown;
  /** UI section the parameter belongs to, e.g. "TRACKER", "AUDIO REACTIVE" */
  group: string;
  /** true when the parameter can be driven by audio/video reactivity */
  reactive: boolean;
  /** natural-language description used to prompt Gemini */
  aiHint?: string;
}

export type ControlSource = 'manual' | 'auto' | 'ai';

export interface EffectTelemetry {
  fps: number;
  srcMode: string;
  recording: boolean;
}

/** Messages the shell sends into an effect. */
export type ShellMessage =
  | { type: 'syntech:init'; payload: { theme: 'night' | 'day'; lang: string } }
  | { type: 'syntech:param:set'; payload: { key: string; value: unknown; source: ControlSource } }
  | { type: 'syntech:preset:apply'; payload: { params: Record<string, unknown> } }
  | { type: 'syntech:transport'; payload: { action: 'play' | 'pause' | 'record:start' | 'record:stop' } }
  | { type: 'syntech:close' };

/** Messages an effect sends back to the shell. */
export type EffectMessage =
  | { type: 'syntech:ready'; payload: { effectId: string; version: string; params: ParamSchema[] } }
  | { type: 'syntech:param:changed'; payload: { key: string; value: unknown } }
  | { type: 'syntech:state'; payload: EffectTelemetry }
  | { type: 'syntech:export:done'; payload: { blobUrl: string; mime: string; filename: string } };

export function isEffectMessage(data: unknown): data is EffectMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof (data as { type?: unknown }).type === 'string' &&
    (data as { type: string }).type.startsWith('syntech:')
  );
}
