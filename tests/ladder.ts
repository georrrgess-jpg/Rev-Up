// Shared deterministic race comparisons for balance tests and probes: a given car and build on an event, raced on
// fixed seeds against that event's rivals (with the event's rival shift quality), with a shift and a nitro policy.
import { rivalShiftFor } from '../src/core/progression';
import { RaceSim, ShiftPolicy } from '../src/core/race';
import { mph } from '../src/core/units';
import { CarId, STAT_SCALE, TIER_STAT, TUNE_STEP, carById, eventById } from '../src/data/tables';

export type Nitro = 'none' | 'late' | 'perfect';
export const SHIFTS: ShiftPolicy[] = ['missed', 'ordinary', 'clean'];
export const NITROS: Nitro[] = ['none', 'late', 'perfect'];

export interface Build { car: CarId; tiers: [number, number, number]; tune?: number; label: string }

/** Stats of a car with engine / tires / turbo at these tiers (standard quality), capped as in a race. */
export function buildStats(b: Build, partCap?: number) {
  const c = carById(b.car);
  const cap = Math.min(c.cap, partCap ?? 99);
  const add = (t: number) => TIER_STAT[Math.min(t, cap)];
  const k = 1 + (partCap ? 0 : b.tune ?? 0) * TUNE_STEP;
  return { top: (c.base.top + add(b.tiers[0]) * STAT_SCALE.top) * k, grip: (c.base.grip + add(b.tiers[1]) * STAT_SCALE.grip) * k, accel: (c.base.accel + add(b.tiers[2]) * STAT_SCALE.accel) * k };
}

export function probeEvent(eventId: string, b: Build, shift: ShiftPolicy, nitro: Nitro, seeds: number, charges = 2) {
  const e = eventById(eventId);
  let tSum = 0, placeSum = 0, wins = 0, top = 0, n = 0, trap = 0, through = 0, gap = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const sim = new RaceSim({ eventId, seed: seed * 101, player: { name: 'p', car: b.car, stats: buildStats(b, e.partCap ?? (e.heatOf ? eventById(e.heatOf).partCap : undefined)), paint: '#fff', perfectMul: carById(b.car).perfectMul }, nitroCharges: nitro === 'none' ? 0 : charges, shift, rivalShift: rivalShiftFor(e), analysis: false });
    while (!sim.done) {
      if (sim.charges > 0 && sim.player.nitroLeft <= 0 && sim.player.finishTime === null) {
        const { active } = sim.windowState();
        if (nitro === 'perfect' && active && !sim.usedWindows.has(active.segIndex)) sim.tapNitro();
        if (nitro === 'late' && !active && sim.windows.some((w) => sim.player.x > w.end && sim.player.x < w.end + 25)) sim.tapNitro();
      }
      sim.step();
    }
    const o = sim.outcome();
    if (o.playerTime === null) continue;
    const rivals = o.standings.filter((r) => !r.isPlayer && r.finishTime !== null).map((r) => r.finishTime!).sort((a, b) => a - b);
    if (rivals.length) gap += o.playerTime - rivals[Math.min(rivals.length - 1, (e.advance ?? 1) - 1)];
    n++; tSum += o.playerTime; placeSum += o.place; if (o.place === 1) wins++; if (o.place <= (e.advance ?? 1)) through++;
    top = Math.max(top, o.topSpeed ?? 0); trap += o.trapSpeed ?? 0;
  }
  return { gap: gap / Math.max(1, n), time: tSum / Math.max(1, n), place: placeSum / Math.max(1, n), wins, through, top: mph(top), trap: mph(trap / Math.max(1, n)) };
}

const B = (car: CarId, tiers: [number, number, number], label: string, tune = 0): Build => ({ car, tiers, label, tune });

/** The car and build a player brings to each event: when it opens ("arrival") and built out ("full"). */
export const LADDER_BUILDS: Record<string, Build[]> = {
  'yard-sprint': [B('junker', [1, 1, 1], 'arrival'), B('junker', [2, 2, 2], 'full')],
  'crusher-run': [B('junker', [2, 2, 2], 'arrival'), B('beater', [3, 3, 3], 'full')],
  'rusty-ray': [B('beater', [2, 3, 2], 'arrival'), B('beater', [3, 3, 3], 'full')],
  'cul-de-sac': [B('beater', [3, 3, 3], 'arrival'), B('hothatch', [4, 4, 4], 'full')],
  'maple-mile': [B('beater', [3, 3, 3], 'arrival'), B('hothatch', [4, 3, 4], 'next car')],
  'tapeback-trophy': [B('junker', [2, 2, 2], 'full')],
  'foundry-final': [B('muscle', [5, 4, 4], 'arrival'), B('muscle', [5, 5, 5], 'full')],
  'harbor-launch': [B('muscle', [5, 4, 4], 'arrival'), B('muscle', [5, 5, 5], 'full')],
  'cliff-esses': [B('muscle', [5, 5, 4], 'arrival'), B('muscle', [5, 5, 5], 'full')],
  'coast-crown': [B('muscle', [5, 5, 5], 'full'), B('muscle', [6, 5, 5], 'T6 engine (runs T5)')],
  'corsa-club': [B('beater', [3, 3, 3], 'full')],
  'hatch-attack': [B('hothatch', [4, 4, 4], 'full')],
  'ta-strip': [B('beater', [3, 3, 3], 'full')],
  'ta-maple': [B('hothatch', [4, 4, 4], 'full')],
  'ta-cliffs': [B('muscle', [5, 5, 5], 'full')],
  'neon-mile': [B('tourer', [6, 5, 5], 'arrival'), B('tourer', [6, 6, 6], 'full')],
  'bridge-trap': [B('tourer', [6, 5, 5], 'arrival'), B('super', [7, 7, 7], 'Lumen')],
  'stock-cup': [B('tourer', [6, 6, 6], 'Altamar'), B('tuner', [6, 6, 6], 'Kestrel')],
  'skyline-run': [B('tourer', [6, 6, 6], 'Altamar'), B('tuner', [6, 6, 6], 'Kestrel')],
  'main-event:1': [B('tuner', [6, 6, 6], 'Kestrel')],
  'main-event:2': [B('tourer', [6, 6, 6], 'Altamar'), B('tuner', [6, 6, 6], 'Kestrel')],
  'main-event:3': [B('tourer', [6, 6, 6], 'Altamar'), B('tuner', [6, 6, 6], 'Kestrel')],
  'midnight-run': [B('super', [6, 6, 7], 'arrival'), B('super', [7, 7, 7], 'full')],
  'canyon-qualifier': [B('tuner', [6, 6, 6], 'Kestrel'), B('super', [7, 6, 7], 'Lumen arrival'), B('super', [7, 7, 7], 'Lumen full')],
  'mesa-trap': [B('super', [7, 7, 7], 'Lumen'), B('gt', [8, 8, 8], 'Strata'), B('proto', [9, 9, 9], 'Halcyon')],
  'dust-stage': [B('rally', [7, 8, 7], 'arrival'), B('rally', [8, 8, 8], 'full'), B('super', [7, 7, 7], 'Lumen')],
  'canyon-stage': [B('rally', [7, 8, 7], 'arrival'), B('rally', [8, 8, 8], 'full')],
  'rally-final': [B('rally', [7, 8, 7], 'arrival'), B('rally', [8, 8, 8], 'full'), B('super', [7, 7, 7], 'Lumen')],
  'ironhorse-revival': [B('muscle', [5, 5, 5], 'full'), B('muscle', [5, 5, 5], 'full + tune 3', 3)],
  'ta-canyon': [B('rally', [8, 8, 8], 'full')],
  'glacier-pass': [B('gt', [8, 8, 7], 'arrival'), B('gt', [8, 8, 8], 'full'), B('rally', [8, 8, 8], 'Corvo'), B('super', [7, 7, 7], 'Lumen')],
  'summit-1000': [B('gt', [8, 8, 7], 'arrival'), B('gt', [8, 8, 8], 'full'), B('super', [7, 7, 7], 'Lumen')],
  'altamar-tour': [B('tourer', [6, 6, 6], 'full'), B('tourer', [6, 6, 6], 'full + tune 3', 3)],
  'ta-summit': [B('gt', [8, 8, 8], 'Strata'), B('proto', [9, 9, 9], 'Halcyon')],
  'summit-gala': [B('proto', [8, 8, 9], 'arrival'), B('proto', [9, 9, 9], 'full'), B('gt', [8, 8, 8], 'Strata')],
};

// ---------------- Difficulty targets ----------------
// Each event has a reference build (index into LADDER_BUILDS) and a category. With that build, every `win` input
// (shift / nitro) must win (or go through, in a heat) and every `lose` input must not. Opening events forgive
// ordinary inputs; from the Coastal Crown on, rivals shift clean and a run with missed shifts or no nitro loses.
export type Input = [ShiftPolicy, Nitro];
export const CATEGORY: Record<'open' | 'early' | 'late' | 'boss', { win: Input[]; lose: Input[] }> = {
  open: { win: [['ordinary', 'late']], lose: [['missed', 'none']] },
  early: { win: [['ordinary', 'perfect'], ['clean', 'late']], lose: [['missed', 'none']] },
  late: { win: [['clean', 'perfect'], ['ordinary', 'perfect'], ['clean', 'late']], lose: [['missed', 'late'], ['ordinary', 'none'], ['missed', 'none']] },
  boss: { win: [['clean', 'perfect']], lose: [['ordinary', 'late'], ['missed', 'perfect']] },
};
export const TARGETS: Record<string, { cat: keyof typeof CATEGORY; ref: number }> = {
  'yard-sprint': { cat: 'open', ref: 0 },
  'crusher-run': { cat: 'open', ref: 0 },
  'tapeback-trophy': { cat: 'open', ref: 0 },
  'corsa-club': { cat: 'open', ref: 0 },
  'rusty-ray': { cat: 'early', ref: 0 },
  'cul-de-sac': { cat: 'early', ref: 0 },
  'maple-mile': { cat: 'early', ref: 1 },
  'foundry-final': { cat: 'early', ref: 0 },
  'hatch-attack': { cat: 'early', ref: 0 },
  'harbor-launch': { cat: 'late', ref: 0 },
  'cliff-esses': { cat: 'late', ref: 0 },
  'coast-crown': { cat: 'boss', ref: 0 },
  'neon-mile': { cat: 'late', ref: 0 },
  'stock-cup': { cat: 'late', ref: 1 },
  'skyline-run': { cat: 'late', ref: 0 },
  'main-event:1': { cat: 'late', ref: 0 },
  'main-event:2': { cat: 'late', ref: 0 },
  'main-event:3': { cat: 'boss', ref: 1 },
  'midnight-run': { cat: 'late', ref: 0 },
  'canyon-qualifier': { cat: 'late', ref: 2 },
  'dust-stage': { cat: 'late', ref: 0 },
  'canyon-stage': { cat: 'late', ref: 0 },
  'rally-final': { cat: 'boss', ref: 1 },
  'ironhorse-revival': { cat: 'late', ref: 0 },
  'glacier-pass': { cat: 'late', ref: 0 },
  'summit-1000': { cat: 'boss', ref: 1 },
  'altamar-tour': { cat: 'late', ref: 0 },
  'summit-gala': { cat: 'boss', ref: 1 },
};

/** Player finish time with an input (the player's run does not depend on the seed: no drafting). */
export function playerTime(eventId: string, b: Build, [shift, nitro]: Input): number {
  return probeEvent(eventId, b, shift, nitro, 1).time;
}

/** Mean finish time of the rival that decides the result (the winner, or the last one through in a heat). */
export function decidingRivalTime(eventId: string, seeds: number): number {
  const e = eventById(eventId);
  let sum = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const sim = new RaceSim({ eventId, seed: seed * 101, player: { name: 'p', car: 'junker', stats: { top: 300, accel: 40, grip: 9 }, paint: '#fff' }, nitroCharges: 0, rivalShift: rivalShiftFor(e), analysis: false });
    while (!sim.done) sim.step();
    const ts = sim.racers.filter((r) => !r.isPlayer).map((r) => r.finishTime ?? 99).sort((a, b) => a - b);
    sum += ts[Math.min(ts.length - 1, (e.advance ?? 1) - 1)];
  }
  return sum / seeds;
}
