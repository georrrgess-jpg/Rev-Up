// Plain-language numbers for the Shop and the Race menu: what a part would add to a car, how many goal
// ingredients you hold, and how a race's field compares with your build. Owned by the mobile UX workstream.
import { allParts } from '../core/board';
import { fitted, recommendedFit } from '../core/install';
import { computeLoadout } from '../core/loadout';
import type { GameState, Part } from '../core/state';
import { mph } from '../core/units';
import { ACTIVE_FAMILIES, CarId, FAMILIES, Family, RIVALS, RaceEvent, carById } from '../data/tables';

type Stats = { top: number; accel: number; grip: number };

/** "+5 mph top speed" / "+12% grip": one stat, the one a family drives. */
export function statDelta(f: Family, before: Stats, after: Stats): string {
  const st = FAMILIES[f].stat;
  if (st === 'top') {
    const d = mph(after.top) - mph(before.top);
    return d > 0 ? `+${d} mph top speed` : 'no faster';
  }
  if (st !== 'accel' && st !== 'grip') return '';
  const pct = before[st] > 0 ? Math.round(((after[st] - before[st]) / before[st]) * 100) : 0;
  return pct > 0 ? `+${pct}% ${FAMILIES[f].statLabel.toLowerCase()}` : `no more ${FAMILIES[f].statLabel.toLowerCase()}`;
}

/** What fitting this part (instead of what is fitted now) would do for a car. */
export function partGain(s: GameState, car: CarId, part: Pick<Part, 'f' | 't' | 'q'>): { text: string; better: boolean; capped: boolean } {
  const cls = carById(car);
  const before = computeLoadout(s, car).stats;
  const trial = structuredClone(s);
  ((trial.installed ??= {})[car] ??= {})[part.f] = { id: -1, ...part };
  const after = computeLoadout(trial, car).stats;
  const cur = fitted(s, car)[part.f];
  const better = after[FAMILIES[part.f].stat as keyof Stats] > before[FAMILIES[part.f].stat as keyof Stats] + 1e-9;
  const capped = part.t > cls.cap;
  const vs = cur ? `than its T${cur.t}` : 'in its empty slot';
  return {
    better, capped,
    text: better ? `On your ${cls.model}: ${statDelta(part.f, before, after)} ${vs}${capped ? ` (runs at T${cls.cap}, its limit)` : ''}`
      : `Your ${cls.model} already has a T${cur?.t ?? '?'} ${FAMILIES[part.f].name} fitted — this one would not add speed${capped ? ` (it runs parts up to T${cls.cap})` : ''}`,
  };
}

/** Ingredients toward a crafted tier, in T1 units: 2^(t-1) per part below the target tier. */
export function ingredients(s: GameState, f: Family, tier: number): { have: number; need: number } {
  const have = allParts(s).filter((p) => p.f === f && p.t < tier).reduce((n, p) => n + 2 ** (p.t - 1), 0);
  return { have, need: 2 ** (tier - 1) };
}

/** Empty slots on a car and bench parts that would make it faster. */
export function fitStatus(s: GameState, car: CarId = s.activeCar): { empty: Family[]; better: Family[] } {
  const slots = fitted(s, car);
  const rec = recommendedFit(s, car);
  const bench = new Set(allParts(s).map((p) => p.f));
  const empty = ACTIVE_FAMILIES.filter((f) => !slots[f] && bench.has(f));
  const better = ACTIVE_FAMILIES.filter((f) => slots[f] && rec[f] && 'at' in rec[f]!);
  return { empty, better };
}

export type Difficulty = { label: 'Easy' | 'Even' | 'Tough' | 'Very tough' | 'Solo'; cls: string; why: string };

/** How the field compares with your build: your stats against the fastest rival's, averaged. A rough guide only —
 *  shifting and nitro timing can beat a stronger car. */
export function difficulty(s: GameState, e: RaceEvent, car: CarId = s.activeCar): Difficulty {
  if (!e.rivals.length) return { label: 'Solo', cls: 'solo', why: 'Against the clock' };
  const me = computeLoadout(s, car, undefined, e.partCap).stats;
  const rivals = e.rivals.map((id) => RIVALS[id]).filter(Boolean);
  const best = { top: Math.max(...rivals.map((r) => r.stats.top)), accel: Math.max(...rivals.map((r) => r.stats.accel)), grip: Math.max(...rivals.map((r) => r.stats.grip)) };
  const ratio = (me.top / best.top + me.accel / best.accel + me.grip / best.grip) / 3;
  const weakest = (['top', 'accel', 'grip'] as const).reduce((a, k) => (me[k] / best[k] < me[a] / best[a] ? k : a), 'top' as 'top' | 'accel' | 'grip');
  const fam = ACTIVE_FAMILIES.find((f) => FAMILIES[f].stat === weakest)!;
  const note = `Their best ${FAMILIES[fam].statLabel.toLowerCase()} beats yours — a better ${FAMILIES[fam].name} helps`;
  if (ratio >= 1.04) return { label: 'Easy', cls: 'easy', why: 'Your build is ahead of this field' };
  if (ratio >= 0.97) return { label: 'Even', cls: 'even', why: 'Close field: clean shifts and Perfect boosts decide it' };
  if (ratio >= 0.9) return { label: 'Tough', cls: 'tough', why: note };
  return { label: 'Very tough', cls: 'vtough', why: note };
}
