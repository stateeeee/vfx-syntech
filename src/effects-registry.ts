import { ModuleId } from './types';

export interface EffectRegistryEntry {
  id: ModuleId;
  /**
   * Path (same origin) of the standalone HTML build of the effect, served
   * from public/effects/<id>/index.html. null = real implementation not
   * delivered yet; the module card only selects it in the dashboard.
   */
  iframeSrc: string | null;
}

export const EFFECTS_REGISTRY: Record<ModuleId, EffectRegistryEntry> = {
  blob_tracker: { id: 'blob_tracker', iframeSrc: '/effects/blob_tracker/index.html' },
  analog: { id: 'analog', iframeSrc: '/effects/analog/index.html' },
  blob_reveal: { id: 'blob_reveal', iframeSrc: '/effects/blob_reveal/index.html' },
  bokeh: { id: 'bokeh', iframeSrc: '/effects/bokeh/index.html' },
  anamorphic_lab: { id: 'anamorphic_lab', iframeSrc: '/effects/anamorphic_lab/index.html' },
};

export function hasRealEffect(id: ModuleId): boolean {
  return EFFECTS_REGISTRY[id].iframeSrc !== null;
}
