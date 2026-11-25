// Fit Parts: each car has one slot per active part family. A fitted part leaves the bench (it is no longer
// on the board or the spare rack and cannot be merged or scrapped) and powers only that car. Every part has
// exactly one location: a board cell, a spare-rack cell, or one car's slot.
//
// Contract (docs/CONTRACTS.md): owned by the Garage systems workstream. The functions here are the only code
// that moves parts between the bench and a car's slots. Every operation is all-or-nothing: on any refusal the
// state is untouched and a single `invalid` event says why (and, where it can, how to fix it).
import { ACTIVE_FAMILIES, CarId, ENABLED_CARS, FAMILIES, Family, carById } from '../data/tables';
import { allParts, craftedTier, firstFree, getPart, setPart } from './board';
import type { GameEvent, SlotRef } from './events';
import { computeLoadout, contributionOn, loadoutWith } from './loadout';
import type { GameState, Part } from './state';

/** The reason shown when a part cannot come off a car because the bench and spare rack are full. */
export const NO_ROOM = 'Bench full — merge a pair or scrap a part to make room, or swap in another part instead';

/** The parts fitted to a car (missing families are empty slots). */
export const fitted = (s: GameState, car: CarId): Partial<Record<Family, Part>> => s.installed?.[car] ?? {};

/** Every fitted part on every car (for id bookkeeping and validation). */
export function installedParts(s: GameState): Part[] {
  return Object.values(s.installed ?? {}).flatMap((slots) => Object.values(slots ?? {}).filter(Boolean) as Part[]);
}

/** Where a part is: a bench / spare-rack cell, or a car's slot. */
export type PartLocation = { at: SlotRef } | { car: CarId; family: Family };

/** Find a part by id wherever it is (null if it no longer exists, e.g. merged or scrapped). */
export function locatePart(s: GameState, id: number): PartLocation | null {
  const b = s.board.findIndex((p) => p?.id === id);
  if (b >= 0) return { at: { zone: 'board', i: b } };
  const t = s.tray.findIndex((p) => p?.id === id);
  if (t >= 0) return { at: { zone: 'tray', i: t } };
  for (const [car, slots] of Object.entries(s.installed ?? {}) as [CarId, Partial<Record<Family, Part>>][]) {
    for (const [f, p] of Object.entries(slots ?? {}) as [Family, Part][]) if (p?.id === id) return { car, family: f };
  }
  return null;
}

/** Plain words for a bench cell: "bench row 2, slot 3" / "spare rack slot 1". */
export function describeCell(s: GameState, r: SlotRef): string {
  if (r.zone === 'tray') return `spare rack slot ${r.i + 1}`;
  return `bench row ${Math.floor(r.i / s.cols) + 1}, slot ${(r.i % s.cols) + 1}`;
}

/** Plain words for any location. */
export function describeLocation(s: GameState, loc: PartLocation | null): string {
  if (!loc) return 'gone';
  if ('at' in loc) return describeCell(s, loc.at);
  return `fitted to the ${carById(loc.car).model}`;
}

/**
 * Fit the part at `from` to `car`. If the slot already holds a part, the two swap places atomically: the
 * outgoing part takes the incoming part's cell, so a swap never needs a free cell and never loses a part.
 */
export function installPart(s: GameState, car: CarId, from: SlotRef): GameEvent[] {
  if (!s.owned.includes(car)) return [{ type: 'invalid', reason: 'Not your car' }];
  const p = getPart(s, from);
  if (!p) return [{ type: 'invalid', reason: 'empty' }];
  if (!ACTIVE_FAMILIES.includes(p.f)) return [{ type: 'invalid', reason: `${FAMILIES[p.f].plural} can't be fitted yet` }];
  s.installed ??= {};
  const slots = (s.installed[car] ??= {});
  const out = slots[p.f] ?? null;
  setPart(s, from, out); // outgoing part (or nothing) takes the cell
  slots[p.f] = p;
  return [{ type: 'install', car, family: p.f, partId: p.id, from, outgoingId: out?.id ?? null }];
}

/**
 * Take a part off a car onto the bench: into `to` if given (it must be empty), else the first free cell (bench
 * first, then the spare rack). With no free cell nothing changes and the reason says how to make room.
 */
export function removePart(s: GameState, car: CarId, family: Family, to?: SlotRef): GameEvent[] {
  const slots = s.installed?.[car];
  const p = slots?.[family];
  if (!p) return [{ type: 'invalid', reason: 'Nothing fitted there' }];
  let at: SlotRef | null;
  if (to) {
    const inRange = to.i >= 0 && to.i < (to.zone === 'board' ? s.board.length : s.tray.length);
    if (!inRange || getPart(s, to)) return [{ type: 'invalid', reason: 'Drop it on an empty cell' }];
    at = to;
  } else at = firstFree(s);
  if (!at) return [{ type: 'invalid', reason: NO_ROOM }];
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
  const src = s.installed?.[fromCar];
  const p = src?.[family];
  if (!p) return [{ type: 'invalid', reason: 'Nothing fitted there' }];
  const dst = (s.installed[toCar] ??= {});
  const out = dst[family];
  dst[family] = p;
  if (out) src![family] = out; else delete src![family];
  return [{ type: 'move-fit', fromCar, toCar, family, partId: p.id, outgoingId: out?.id ?? null }];
}

/** Fit a candidate wherever it is (bench cell or another car's slot). */
export function fitFrom(s: GameState, car: CarId, src: PartSource): GameEvent[] {
  if ('at' in src) {
    if (getPart(s, src.at)?.id !== src.part.id) return [{ type: 'invalid', reason: 'That part has moved' }];
    return installPart(s, car, src.at);
  }
  if (src.car === car) return [{ type: 'invalid', reason: 'Already fitted' }];
  if (fitted(s, src.car)[src.part.f]?.id !== src.part.id) return [{ type: 'invalid', reason: 'That part has moved' }];
  return movePartBetweenCars(s, src.car, src.part.f, car);
}

/** Every part that could go in this car's slot: bench and spare rack first, then parts fitted to other cars. */
export function fitCandidates(s: GameState, car: CarId, family: Family): PartSource[] {
  const cap = carById(car).cap;
  const list: PartSource[] = [];
  s.board.forEach((p, i) => p && p.f === family && list.push({ at: { zone: 'board', i }, part: p }));
  s.tray.forEach((p, i) => p && p.f === family && list.push({ at: { zone: 'tray', i }, part: p }));
  for (const other of s.owned) {
    if (other === car) continue;
    const p = fitted(s, other)[family];
    if (p) list.push({ car: other, part: p });
  }
  // strongest on this car first; among equals the lower tier (keeps higher parts for the next car), bench first
  const rank = (x: PartSource) => ('at' in x ? 0 : 1);
  return list.sort((a, b) => contributionOn(b.part, cap) - contributionOn(a.part, cap) || a.part.t - b.part.t || rank(a) - rank(b) || a.part.id - b.part.id);
}

/**
 * The recommended fit for this car: per family, the strongest available part if it beats what is fitted.
 * Bench parts come first; a part fitted to another car is suggested only when it is strictly better than
 * anything on the bench (it would leave that car). Ties keep the fitted part, then prefer the lower tier.
 */
export function recommendedFit(s: GameState, car: CarId, benchOnly = false): Partial<Record<Family, PartSource>> {
  const cap = carById(car).cap;
  const cur = fitted(s, car);
  const best: Partial<Record<Family, PartSource>> = {};
  const score = (p: Part) => contributionOn(p, cap);
  // Keep the next car's crafting ingredients on the bench: a bench part of the keystone family below the
  // keystone tier is an ingredient, not an upgrade, while fitting it would leave too few to craft the keystone
  // (first session: the starter T1 Tires pair is the Corsa Rojo's T3 Tires). With spares to share, it fits.
  const next = ENABLED_CARS.find((c) => !s.owned.includes(c.id))?.unlock ?? null;
  const pool = next ? allParts(s).filter((q) => q.f === next.family && q.t < next.tier).reduce((n, q) => n + 2 ** (q.t - 1), 0) : 0;
  const ingredient = (src: PartSource) => 'at' in src && !!next && src.part.f === next.family && src.part.t < next.tier
    && craftedTier(s, next.family) < next.tier && pool - 2 ** (src.part.t - 1) < 2 ** (next.tier - 1)
    && allParts(s).filter((q) => q.f === src.part.f && q.t === src.part.t).length >= 2; // only a part with a merge partner
  const consider = (src: PartSource, strict: boolean) => {
    const p = src.part;
    if (!ACTIVE_FAMILIES.includes(p.f)) return;
    if (ingredient(src)) return;
    const have = cur[p.f];
    if (have && score(p) <= score(have)) return; // must beat what is fitted
    const lead = best[p.f]?.part;
    if (!lead) { best[p.f] = src; return; }
    const a = score(p), b = score(lead);
    if (a > b || (!strict && a === b && p.t < lead.t)) best[p.f] = src;
  };
  s.board.forEach((p, i) => p && consider({ at: { zone: 'board', i }, part: p }, false));
  s.tray.forEach((p, i) => p && consider({ at: { zone: 'tray', i }, part: p }, false));
  for (const other of s.owned) {
    if (other === car) continue;
    if (!benchOnly) for (const p of Object.values(fitted(s, other))) if (p) consider({ car: other, part: p }, true);
  }
  return best;
}

/** Fit every recommended part (each a swap, so it always fits). */
export function fitRecommended(s: GameState, car: CarId): GameEvent[] {
  const events: GameEvent[] = [];
  const rec = recommendedFit(s, car);
  for (const f of ACTIVE_FAMILIES) {
    const r = rec[f];
    if (r) events.push(...fitFrom(s, car, r));
  }
  return events;
}

/** Fill this car's empty slots from the bench only (never from another car): used when a new car takes parts. */
export function fillEmptyFromBench(s: GameState, car: CarId): GameEvent[] {
  const events: GameEvent[] = [];
  const cur = fitted(s, car);
  const rec = recommendedFit(s, car, true);
  for (const f of ACTIVE_FAMILIES) {
    const r = rec[f];
    if (!cur[f] && r && 'at' in r) events.push(...fitFrom(s, car, r));
  }
  return events;
}

/** Stats now and after fitting `part` in its family's slot (or emptying the slot with `null`). */
export function previewFit(s: GameState, car: CarId, family: Family, part: Part | null) {
  const before = computeLoadout(s, car).stats;
  const after = loadoutWith(s, car, { [family]: part }).stats;
  return { before, after };
}

/** Stats now and after the whole recommended fit. */
export function previewRecommended(s: GameState, car: CarId) {
  const rec = recommendedFit(s, car);
  const over: Partial<Record<Family, Part | null>> = {};
  for (const [f, r] of Object.entries(rec) as [Family, PartSource][]) over[f] = r.part;
  return { rec, before: computeLoadout(s, car).stats, after: loadoutWith(s, car, over).stats };
}

/** Owned cars this bench part would make faster than what they have fitted now (best gain first). */
export function upgradesFor(s: GameState, p: Part): CarId[] {
  if (!ACTIVE_FAMILIES.includes(p.f)) return [];
  const gain = (car: CarId) => {
    const cap = carById(car).cap;
    const have = fitted(s, car)[p.f];
    return contributionOn(p, cap) - (have ? contributionOn(have, cap) : 0);
  };
  return s.owned.filter((c) => gain(c) > 0).sort((a, b) => (a === s.activeCar ? -1 : b === s.activeCar ? 1 : gain(b) - gain(a)));
}

/** Families whose slot on this car is empty / could take a better part right now. */
export function slotStatus(s: GameState, car: CarId) {
  const cur = fitted(s, car);
  const rec = recommendedFit(s, car);
  const empty = ACTIVE_FAMILIES.filter((f) => !cur[f]);
  const better = ACTIVE_FAMILIES.filter((f) => !!rec[f]);
  return { empty, better, rec };
}

/**
 * Save migration (v1 → v2): v1 auto-equipped the best bench part per family on the active car. Fit exactly those
 * parts to the active car so its build is unchanged, they leave the bench (freeing cells), and no part is duplicated.
 * The pick reproduces v1's rule: the strongest part at the car's cap; on a tie the lower tier, then the lower id.
 */
export function installLegacyLoadout(s: GameState) {
  s.installed ??= {};
  if (Object.keys(s.installed).length) return;
  const car = s.activeCar;
  if (!s.owned.includes(car)) return;
  const cap = carById(car).cap;
  const pick: Partial<Record<Family, Part>> = {};
  for (const p of allParts(s)) {
    if (!ACTIVE_FAMILIES.includes(p.f)) continue;
    const cur = pick[p.f];
    if (!cur) { pick[p.f] = p; continue; }
    const a = contributionOn(p, cap), b = contributionOn(cur, cap);
    if (a > b || (a === b && (p.t < cur.t || (p.t === cur.t && p.id < cur.id)))) pick[p.f] = p;
  }
  for (const p of Object.values(pick)) {
    if (!p) continue;
    const b = s.board.findIndex((x) => x?.id === p.id);
    const from: SlotRef = b >= 0 ? { zone: 'board', i: b } : { zone: 'tray', i: s.tray.findIndex((x) => x?.id === p.id) };
    installPart(s, car, from);
  }
}
