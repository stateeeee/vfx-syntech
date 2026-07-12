import { EngineNode } from './SynEngine';
import { AudioLevels } from './AudioEngine';

/* ═══════════════════════════════════════════════════════════════
   PARAM BUS — the shared Manual/Auto control matrix (PLAN.md §4.4):

     final value = base(manual) + amount × audio signal × range

   The bus owns the BASE value of every numeric node parameter, so
   the UI edits a stable number while audio modulation is layered
   on top each frame without ever feeding back into the base.
   (The AI layer writes bases and routes too — same contract.)
   ═══════════════════════════════════════════════════════════════ */

export type AudioSource = 'bass' | 'loud' | 'treble' | 'beat';
export const AUDIO_SOURCES: AudioSource[] = ['bass', 'loud', 'treble', 'beat'];

export interface AudioMod {
  source: AudioSource;
  /** -1..1 — fraction of the parameter's full range added at signal = 1 */
  amount: number;
}

export class ParamBus {
  private base = new Map<string, number>();
  private mods = new Map<string, AudioMod>();

  private k(node: EngineNode, key: string): string { return `${node.id}.${key}`; }

  /** capture the current numeric params of the chain as base values */
  snapshot(chain: EngineNode[]): void {
    for (const node of chain) {
      for (const p of node.params) {
        if (p.type !== 'number') continue;
        this.base.set(this.k(node, p.key), Number(node.getParam(p.key)));
      }
    }
  }

  getBase(node: EngineNode, key: string): number {
    return this.base.get(this.k(node, key)) ?? Number(node.getParam(key));
  }

  setBase(node: EngineNode, key: string, value: number): void {
    this.base.set(this.k(node, key), value);
    node.setParam(key, value); // immediate response even before the next apply()
  }

  getMod(node: EngineNode, key: string): AudioMod | null {
    return this.mods.get(this.k(node, key)) ?? null;
  }

  setMod(node: EngineNode, key: string, mod: AudioMod | null): void {
    const k = this.k(node, key);
    if (mod) this.mods.set(k, mod);
    else {
      this.mods.delete(k);
      node.setParam(key, this.getBase(node, key)); // return to the manual base
    }
  }

  /** routes with a live audio source, for UI badges/telemetry */
  activeRoutes(): number { return this.mods.size; }

  /** per-frame: write base + audio offset into every routed parameter */
  apply(chain: EngineNode[], levels: AudioLevels): void {
    if (this.mods.size === 0) return;
    for (const node of chain) {
      for (const p of node.params) {
        if (p.type !== 'number') continue;
        const mod = this.mods.get(this.k(node, p.key));
        if (!mod || mod.amount === 0) continue;
        const b = this.base.get(this.k(node, p.key));
        if (b === undefined) continue;
        const range = (p.max ?? 1) - (p.min ?? 0);
        node.setParam(p.key, b + mod.amount * levels[mod.source] * range);
      }
    }
  }
}
