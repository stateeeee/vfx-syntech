export type ModuleId = 'blob' | 'analog' | 'particle' | 'spectrum';

export interface ModuleConfig {
  id: ModuleId;
  name: string;
  description: string;
  status: 'ACTIVE' | 'STANDBY';
  parameters: {
    [key: string]: {
      label: string;
      value: number; // 0 to 100
      min: number;
      max: number;
      step: number;
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
