// Fit Parts: each car has one slot per active part family. A fitted part leaves the bench (it is no longer
// on the board or the spare rack and cannot be merged or scrapped) and powers only that car. Every part has
// exactly one location: a board cell, a spare-rack cell, or one car's slot.
//
// Contract (docs/CONTRACTS.md): owned by the Garage systems workstream. The functions here are the only code
// that moves parts between the bench and a car's slots.
import { ACTIVE_FAMILIES, CarId, Family, carById } from '../data/tables';
import { firstFree, getPart, setPart } from './board';
import type { GameEvent, SlotRef } from './events';
import { contributionOn } from './loadout';
import type { GameState, Part } from './state';

/** The parts fitted to a car (missing families are empty slots). */
export const fitted = (s: GameState, car: CarId): Partial<Record<Family, Part>> => s.installed?.[car] ?? {};

/** Every fitted part on every car (for id bookkeeping and validation). */
export function installedParts(s: GameState): Part[] {
  return Object.values(s.installed ?? {}).flatMap((slots) => Object.values(slots ?? {}).filter(Boolean) as Part[]);
}

/**
 * Fit the part at `from` to `car`. If the slot already holds a part, the two swap places atomically: the
 * outgoing part takes the incoming part's cell, so a swap never needs a free cell and never loses a part.
 */
export function installPart(s: GameState, car: CarId, from: SlotRef): GameEvent[] {
  if (!s.owned.includes(car)) return [{ type: 'invalid', reason: 'Not your car' }];
  const p = getPart(s, from);
  if (!p) return [{ type: 'invalid', reason: 'empty' }];
  const slots = (s.installed[car] ??= {});
  const out = slots[p.f] ?? null;
  setPart(s, from, out); // outgoing part (or nothing) takes the cell
  slots[p.f] = p;
  return [{ type: 'install', car, family: p.f, partId: p.id, from, outgoingId: out?.id ?? null }];
}

/** Take a part off a car onto the bench. Needs a free cell; otherwise nothing changes and the reason says how to make room. */
export function removePart(s: GameState, car: CarId, family: Family): GameEvent[] {
  const slots = s.installed[car];
  const p = slots?.[family];
  if (!p) return [{ type: 'invalid', reason: 'Nothing fitted there' }];
  const at = firstFree(s);
  if (!at) return [{ type: 'invalid', reason: 'Bench full — merge a pair or scrap a part to make room' }];
  setPart(s, at, p);
  delete slots![family];
  return [{ type: 'uninstall', car, family, partId: p.id, to: at }];
}

/** Where a candidate part is: a bench cell, or fitted to another car. */
export type PartSource = { at: SlotRef; part: Part } | { car: CarId; part: Part };

/**
 * Move a fitted part from one car to another. The receiving car's part in that slot (if any) goes the other way,
 * so this is an atomic swap that never needs a bench cell.
 */
export function movePartBetweenCars(s: GameState, fromCar: CarId, family: Family, toCar: CarId): GameEvent[] {
  if (fromCar === toCar || !s.owned.includes(toCar)) return [{ type: 'invalid', reason: 'Not available' }];
  const src = s.installed[fromCar];
  const p = src?.[family];
  if (!p) return [{ type: 'invalid', reason: 'Nothing fitted there' }];
  const dst = (s.installed[toCar] ??= {});
  const out = dst[family];
  dst[family] = p;
  if (out) src![family] = out; else delete src![family];
  return [{ type: 'move-fit', fromCar, toCar, family, partId: p.id, outgoingId: out?.id ?? null }];
}

/**
 * The recommended fit for this car: per family, the strongest available part if it beats what is fitted.
 * Bench parts come first; a part fitted to another car is suggested only when it is strictly better than
 * anything on the bench (it would leave that car). Ties keep the fitted part, then prefer the lower tier.
 */
export function recommendedFit(s: GameState, car: CarId): Partial<Record<Family, PartSource>> {
  const cap = carById(car).cap;
  const cur = fitted(s, car);
  const best: Partial<Record<Family, PartSource>> = {};
  const score = (p: Part) => contributionOn(p, cap);
  const better = (p: Part, have: Part | undefined | null, strict: boolean) => {
    if (!have) return true;
    const a = score(p), b = score(have);
    return a > b || (!strict && a === b && p.t < have.t && have !== cur[p.f]);
  };
  const consider = (src: PartSource, strict: boolean) => {
    const p = src.part;
    if (!ACTIVE_FAMILIES.includes(p.f)) return;
    const have = best[p.f]?.part ?? cur[p.f];
    if (better(p, have, strict) && (!cur[p.f] || score(p) > score(cur[p.f]!))) best[p.f] = src;
  };
  s.board.forEach((p, i) => p && consider({ at: { zone: 'board', i }, part: p }, false));
  s.tray.forEach((p, i) => p && consider({ at: { zone: 'tray', i }, part: p }, false));
  for (const other of s.owned) {
    if (other === car) continue;
    for (const p of Object.values(fitted(s, other))) if (p) consider({ car: other, part: p }, true);
  }
  return best;
}

/** Fit every recommended part (each a swap, so it always fits). */
export function fitRecommended(s: GameState, car: CarId): GameEvent[] {
  const events: GameEvent[] = [];
  const rec = recommendedFit(s, car);
  for (const f of ACTIVE_FAMILIES) {
    const r = rec[f];
    if (!r) continue;
    if ('at' in r) events.push(...installPart(s, car, r.at));
    else events.push(...movePartBetweenCars(s, r.car, f, car));
  }
  return events;
}

/**
 * Save migration (v1 → v2): v1 auto-equipped the best bench part per family on the active car. Fit exactly those
 * parts to the active car so its build is unchanged, they leave the bench (freeing cells), and no part is duplicated.
 */
export function installLegacyLoadout(s: GameState) {
  s.installed ??= {};
  if (Object.keys(s.installed).length) return;
  // bench parts only: no other car has fitted parts yet
  fitRecommended(s, s.activeCar);
}
