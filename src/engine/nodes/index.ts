import { ModuleId } from '../../types';
import { EngineNode } from '../SynEngine';
import { BlobTrackerNode } from './BlobTrackerNode';
import { AnalogNode } from './AnalogNode';
import { BlobRevealNode } from './BlobRevealNode';
import { BokehNode } from './BokehNode';
import { AnamorphicNode } from './AnamorphicNode';

/**
 * Native SynEngine node for every effect (PLAN.md phase 5).
 * The brain graph and the Chain Lab build chains from this factory;
 * the iframe builds remain the full standalone experience.
 */
export const NODE_FACTORY: Record<ModuleId, () => EngineNode> = {
  blob_tracker: () => new BlobTrackerNode(),
  analog: () => new AnalogNode(),
  blob_reveal: () => new BlobRevealNode(),
  bokeh: () => new BokehNode(),
  anamorphic_lab: () => new AnamorphicNode(),
};

export function hasNativeNode(id: string): id is ModuleId {
  return id in NODE_FACTORY;
}
