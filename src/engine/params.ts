import { EngineNode } from './SynEngine';

/* ═══════════════════════════════════════════════════════════════
   PARAM BUS — the shared Manual/Auto control matrix (PLAN.md §4.4):

     final value = base(manual) + amount × signal × range

   Signals come from the AudioEngine (bass/loud/treble/beat) and the
   VideoAnalyzer (motion/bright). The bus owns the BASE value of
   every numeric node parameter, so the UI edits a stable number
   while modulation is layered on top each frame without ever
   feeding back into the base. (The AI layer writes bases and
   routes too — same contract.)
   ═══════════════════════════════════════════════════════════════ */

export type ModSource = 'bass' | 'loud' | 'treble' | 'beat' | 'motion' | 'bright';
export const MOD_SOURCES: ModSource[] = ['bass', 'loud', 'treble', 'beat', 'motion', 'bright'];

/** everything a route can listen to, all normalized 0..1 */
export type ModSignals = Record<ModSource, number>;

export interface ModRoute {
  source: ModSource;
  /** -1..1 — fraction of the parameter's full range added at signal = 1 */
  amount: number;
}

/** serialized form of the bus for chain presets (localStorage) */
export interface ParamBusState {
  bases: Record<string, number>;
  mods: Record<string, ModRoute>;
}

export class ParamBus {
  private base = new Map<string, number>();
  private mods = new Map<string, ModRoute>();

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

  getMod(node: EngineNode, key: string): ModRoute | null {
    return this.mods.get(this.k(node, key)) ?? null;
  }

  setMod(node: EngineNode, key: string, mod: ModRoute | null): void {
    const k = this.k(node, key);
    if (mod) this.mods.set(k, mod);
    else {
      this.mods.delete(k);
      node.setParam(key, this.getBase(node, key)); // return to the manual base
    }
  }

  /** routes with a live source, for UI badges/telemetry */
  activeRoutes(): number { return this.mods.size; }

  /** per-frame: write base + modulation offset into every routed parameter */
  apply(chain: EngineNode[], signals: ModSignals): void {
    if (this.mods.size === 0) return;
    for (const node of chain) {
      for (const p of node.params) {
        if (p.type !== 'number') continue;
        const mod = this.mods.get(this.k(node, p.key));
        if (!mod || mod.amount === 0) continue;
        const b = this.base.get(this.k(node, p.key));
        if (b === undefined) continue;
        const range = (p.max ?? 1) - (p.min ?? 0);
        node.setParam(p.key, b + mod.amount * signals[mod.source] * range);
      }
    }
  }

  /* ── preset serialization ─────────────────────────────────── */

  serialize(): ParamBusState {
    return {
      bases: Object.fromEntries(this.base),
      mods: Object.fromEntries(this.mods),
    };
  }

  /** restore bases + routes and push the bases into the chain's nodes */
  restore(state: ParamBusState, chain: EngineNode[]): void {
    this.base = new Map(Object.entries(state.bases ?? {}));
    this.mods = new Map(Object.entries(state.mods ?? {}));
    for (const node of chain) {
      for (const p of node.params) {
        if (p.type !== 'number') continue;
        const b = this.base.get(this.k(node, p.key));
        if (b !== undefined) node.setParam(p.key, b);
      }
    }
  }
}
