import {
  ACTIVE_FAMILIES, CarId, Family, QUALITY_BONUS, STAT_SCALE, TIER_STAT, carById,
} from '../data/tables';
import type { GameState, Part } from './state';
import { allParts } from './board';

export const contribution = (p: Part) => TIER_STAT[p.t] * (p.q === 'std' ? 1 : QUALITY_BONUS);

export interface Loadout {
  car: CarId;
  equipped: Partial<Record<Family, Part>>;
  /** Equipped parts above the car's cap, running restricted at the cap tier. */
  blocked: Partial<Record<Family, Part>>;
  stats: { top: number; accel: number; grip: number };
}


/** A part's contribution on a given car: parts above the car's cap fit but run at the cap tier. */
export const contributionOn = (p: Part, cap: number) => TIER_STAT[Math.min(p.t, cap)] * (p.q === 'std' ? 1 : QUALITY_BONUS);

/**
 * Auto-equip the strongest part per family. Parts above the car's equip cap still fit and run at the cap
 * tier, so earlier cars stay competitive after you craft higher tiers. `blocked` lists families whose
 * equipped part is running restricted to the cap (shown in the Garage).
 */
export function computeLoadout(s: GameState, car: CarId = s.activeCar, exclude?: number, partCap?: number): Loadout {
  const cap = Math.min(carById(car).cap, partCap ?? Infinity);
  const equipped: Loadout['equipped'] = {};
  for (const p of allParts(s)) {
    if (p.id === exclude) continue;
    const cur = equipped[p.f];
    if (!cur) { equipped[p.f] = p; continue; }
    const a = contributionOn(p, cap), b = contributionOn(cur, cap);
    // prefer the stronger part; on a tie prefer the lower tier (keeps the higher part free for the next car), then lower id
    if (a > b || (a === b && (p.t < cur.t || (p.t === cur.t && p.id < cur.id)))) equipped[p.f] = p;
  }
  const blocked: Loadout['blocked'] = {};
  for (const f of ACTIVE_FAMILIES) if (equipped[f] && equipped[f]!.t > cap) blocked[f] = equipped[f];
  return { car, equipped, blocked, stats: statsFor(car, equipped) };
}

export function statsFor(car: CarId, equipped: Partial<Record<Family, Part>>) {
  const cls = carById(car);
  const c = (f: Family) => (equipped[f] ? contributionOn(equipped[f]!, cls.cap) : 0);
  return {
    top: cls.base.top + c('engine') * STAT_SCALE.top,
    accel: cls.base.accel + c('turbo') * STAT_SCALE.accel,
    grip: cls.base.grip + c('tires') * STAT_SCALE.grip,
  };
}

/** If this part is equipped, describe the loss and what equips next. */
export function scrapImpact(s: GameState, partId: number) {
  const now = computeLoadout(s);
  const fam = (Object.keys(now.equipped) as Family[]).find((f) => now.equipped[f]?.id === partId);
  if (!fam) return null;
  const after = computeLoadout(s, s.activeCar, partId);
  return { family: fam, before: now.equipped[fam]!, next: after.equipped[fam] ?? null };
}
