export type ModuleId = 'blob_tracker' | 'analog' | 'blob_reveal' | 'bokeh' | 'anamorphic_lab';

export interface ModuleConfig {
  id: ModuleId;
  name: string;
  description: string;
  status: 'ACTIVE' | 'STANDBY';
  parameters: {
    [key: string]: {
      label: string;
      value: number;
      min: number;
      max: number;
      step: number;
      /** natural-language hint forwarded to Gemini (from the effect's ParamSchema) */
      hint?: string;
    };
  };
}

export type ActiveTab = 'PARAMETERS' | 'DIAGNOSTICS';

export type SignalSource = 'L_INPUT_CHANNEL_01' | 'R_INPUT_CHANNEL_02' | 'MIC_AUDIO_03' | 'GOLD_NOISE_04';

export interface DiagnosticsState {
  cpuUsage: number;
  memoryUsage: number;
  gpuLoad: number;
  signalStrength: number;
  errorsDetected: number;
  logs: string[];
}
