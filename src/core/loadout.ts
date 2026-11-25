import {
  ACTIVE_FAMILIES, CarId, Family, QUALITY_BONUS, STAT_SCALE, TIER_STAT, carById,
} from '../data/tables';
import type { GameState, Part } from './state';
import { allParts } from './board';

export const contribution = (p: Part) => TIER_STAT[p.t] * (p.q === 'std' ? 1 : QUALITY_BONUS);

export interface Loadout {
  car: CarId;
  equipped: Partial<Record<Family, Part>>;
  /** A stronger part exists but exceeds the car's equip cap. */
  blocked: Partial<Record<Family, Part>>;
  stats: { top: number; accel: number; grip: number };
}

const better = (a: Part, b: Part | undefined) => {
  if (!b) return true;
  const ca = contribution(a);
  const cb = contribution(b);
  return ca > cb || (ca === cb && a.id < b.id);
};

export function computeLoadout(s: GameState, car: CarId = s.activeCar, exclude?: number): Loadout {
  const cls = carById(car);
  const equipped: Loadout['equipped'] = {};
  const blocked: Loadout['blocked'] = {};
  for (const p of allParts(s)) {
    if (p.id === exclude) continue;
    if (p.t <= cls.cap) {
      if (better(p, equipped[p.f])) equipped[p.f] = p;
    } else if (better(p, blocked[p.f])) blocked[p.f] = p;
  }
  for (const f of ACTIVE_FAMILIES) {
    const b = blocked[f];
    const e = equipped[f];
    if (b && e && contribution(b) <= contribution(e)) delete blocked[f];
  }
  return { car, equipped, blocked, stats: statsFor(car, equipped) };
}

export function statsFor(car: CarId, equipped: Partial<Record<Family, Part>>) {
  const cls = carById(car);
  const c = (f: Family) => (equipped[f] ? contribution(equipped[f]!) : 0);
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
