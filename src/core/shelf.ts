// 1.9 Parts Shelf: storage off the merge board, and immediate uses for surplus parts.
//
// The shelf (`s.shelf`, a compact list of parts) holds parts you are not merging now: over-cap parts waiting for a
// later car, spares, keepers. Shelf parts never merge, never fit and never count as merge ingredients until you move
// them back. Capacity comes from the Storage path (data: SHELF_SLOTS; board.shelfCap). A part lives in exactly one
// place (board, rack, shelf or one car's slot); every move here is a single transaction with nothing duplicated.
//
// Surplus uses, each with its payoff and cost shown before you confirm (the preview runs the same rule as the action):
//   tradeParts      selected parts -> one known part (a goal ingredient or an upgrade for the car you drive). The
//                   parts count their recycle value × TRADE_RATE (1, or 1.25 with the Trade counter) against the
//                   scrap-order price (2× the part's recycle value); the remainder is lost and shown first.
//   contributeParts selected parts -> cash credit toward the next rank of a Garage upgrade (CONTRIBUTE_CASH_PER_SCRAP
//                   per scrap of recycle value, at most half the rank's price; the price stays on a cash step).
//   recycleToward   recycle selected parts and, once the scrap covers it, place a chosen scrap order in the same tap.
// Fitted parts are never touched (they are not on the bench or shelf). Starred parts are skipped. Crafted credit
// (`s.crafted`) is never changed. No loop pays: a traded part recycles for at most 0.75× what went in, and a part
// bought for cash credits at most 6/30 of its price toward an upgrade.
import {
  ACTIVE_FAMILIES, CONTRIBUTE_CASH_PER_SCRAP, CONTRIBUTE_MAX_SHARE, CarClass, ENABLED_CARS, FAMILIES, Family, SCRAP_VALUE,
  SHELF_SORT_RANK, TRADE_RATE, UPGRADES, UpgradeId, carById, cashStep, scrapOrderCost,
} from '../data/tables';
import { allParts, firstFree, getPart, isFavorite, openCrates, orderMaxTier, scrapPart, setPart, shelfCap, shelfFree, shelfParts } from './board';
import type { GameEvent, SlotRef } from './events';
import { fitted } from './install';
import { goalStatus, upgradeCost, upgradeCreditOf, upgradeListCost, upgradeLock } from './progression';
import type { GameState, Part } from './state';

export { shelfCap, shelfFree, shelfParts, autoShelfOn } from './board';

const name = (p: Pick<Part, 'f' | 't'>) => `T${p.t} ${FAMILIES[p.f].name}`;

// ---------------- Moves ----------------

/** Move a bench or rack part onto the shelf. Refused (nothing changes) when the shelf is full or the cell is empty. */
export function storePart(s: GameState, from: SlotRef): GameEvent[] {
  const p = getPart(s, from);
  if (!p) return [{ type: 'invalid', reason: 'Nothing there to store' }];
  if (shelfFree(s) <= 0) return [{ type: 'invalid', reason: `The shelf is full (${shelfCap(s)} parts) — move a part back, use some surplus, or grow it in the Shop's Garage tab` }];
  setPart(s, from, null);
  (s.shelf ??= []).push(p);
  s.shelf = s.shelf.filter(Boolean);
  return []; // no board event: the shelf is off the board (the UI re-reads the state)
}

/** Store several bench / rack parts by id (as many as fit; the rest stay where they are). */
export function storeParts(s: GameState, ids: number[]): GameEvent[] {
  let n = 0;
  for (const id of ids) {
    const at = refOf(s, id);
    if (!at || shelfFree(s) <= 0) continue;
    storePart(s, at);
    n++;
  }
  return n ? [] : [{ type: 'invalid', reason: shelfFree(s) <= 0 ? 'The shelf is full' : 'Those parts are not on the bench' }];
}

/** Move a shelf part back to the bench (first free cell, or `to` when it is empty). Refused when there is no room. */
export function unstorePart(s: GameState, id: number, to?: SlotRef): GameEvent[] {
  const list = shelfParts(s);
  const p = list.find((x) => x.id === id);
  if (!p) return [{ type: 'invalid', reason: 'That part is not on the shelf' }];
  const at = to && !getPart(s, to) && inRange(s, to) ? to : firstFree(s);
  if (!at) return [{ type: 'invalid', reason: 'No room on the bench or rack — merge a pair or store a part first' }];
  s.shelf = list.filter((x) => x.id !== id);
  setPart(s, at, p);
  return [{ type: 'place', at, family: p.f, tier: p.t, source: 'shelf' }];
}

const inRange = (s: GameState, r: SlotRef) => r.i >= 0 && r.i < (r.zone === 'board' ? s.board.length : s.tray.length);

function refOf(s: GameState, id: number): SlotRef | null {
  const b = s.board.findIndex((p) => p?.id === id);
  if (b >= 0) return { zone: 'board', i: b };
  const t = s.tray.findIndex((p) => p?.id === id);
  return t >= 0 ? { zone: 'tray', i: t } : null;
}

// ---------------- What a part is for ----------------

/** The earliest car on the ladder that runs this part at full strength (its cap reaches the part's tier). */
export function earliestCarFor(part: Pick<Part, 't'>): CarClass {
  return ENABLED_CARS.find((c) => c.cap >= part.t) ?? ENABLED_CARS[ENABLED_CARS.length - 1];
}
/** One line: who can use it, e.g. "Runs at full strength from the Corvo Rally (yours)". */
export function earliestCarText(s: GameState, part: Pick<Part, 't'>): string {
  const c = earliestCarFor(part);
  const best = Math.max(...s.owned.map((id) => carById(id).cap));
  if (best >= part.t) {
    const mine = ENABLED_CARS.find((x) => x.cap >= part.t && s.owned.includes(x.id));
    return `Runs at full strength on your ${mine?.model ?? c.model}${mine && mine.id !== c.id ? ` (from the ${c.model})` : ''}`;
  }
  return `Runs at full strength from the ${c.model} (not yours yet) — on your cars it runs at T${best}`;
}

/** Over the cap of the car you drive, and not an ingredient for the goal keystone: a part worth shelving. */
export function isOverCap(s: GameState, part: Pick<Part, 'f' | 't'>): boolean {
  if (part.t <= carById(s.activeCar).cap) return false;
  const g = goalStatus(s);
  if (g && !g.keystoneDone && part.f === g.family && part.t < g.tier) return false;
  return true;
}
/** Bench / rack parts that are over the active car's cap (see isOverCap), unstarred ones first. */
export const overCapParts = (s: GameState): Part[] => allParts(s).filter((p) => isOverCap(s, p));

/** One tap (Storage rank 3): every over-cap bench part onto the shelf, as many as fit. */
export function storeOverCap(s: GameState): GameEvent[] {
  if ((s.upgrades.storage ?? 0) < SHELF_SORT_RANK) return [{ type: 'invalid', reason: 'One-tap storing opens with Parts Shelf rank 3' }];
  const ids = overCapParts(s).map((p) => p.id);
  if (!ids.length) return [{ type: 'invalid', reason: 'No over-cap parts on the bench' }];
  return storeParts(s, ids);
}

export interface ShelfItem {
  part: Part;
  starred: boolean;
  scrap: number;
  earliest: { car: string; model: string; owned: boolean; text: string };
  overCap: boolean;
  /** room on the bench to move it back */
  canMoveBack: boolean;
}
/** The shelf as the UI lists it: each part with who can use it and its recycle value. */
export function shelfView(s: GameState): { cap: number; used: number; free: number; items: ShelfItem[] } {
  const items = shelfParts(s).map((p) => {
    const c = earliestCarFor(p);
    return {
      part: p, starred: isFavorite(s, p.id), scrap: SCRAP_VALUE[p.t] ?? 0, overCap: isOverCap(s, p), canMoveBack: !!firstFree(s),
      earliest: { car: c.id, model: c.model, owned: s.owned.includes(c.id), text: earliestCarText(s, p) },
    };
  });
  return { cap: shelfCap(s), used: items.length, free: shelfFree(s), items };
}

// ---------------- Surplus uses ----------------

/** Parts the surplus actions may use: on the shelf, bench or rack, not starred (fitted parts are never there). */
function takeable(s: GameState, ids: number[]): Part[] {
  const want = new Set(ids);
  const seen = new Set<number>();
  return [...shelfParts(s), ...allParts(s)].filter((p) => want.has(p.id) && !isFavorite(s, p.id) && !seen.has(p.id) && (seen.add(p.id), true));
}
/** Take parts out of the shelf, bench or rack (they are gone). */
function remove(s: GameState, parts: Part[]) {
  const ids = new Set(parts.map((p) => p.id));
  s.shelf = shelfParts(s).filter((p) => !ids.has(p.id));
  s.board = s.board.map((p) => (p && ids.has(p.id) ? null : p));
  s.tray = s.tray.map((p) => (p && ids.has(p.id) ? null : p));
}

export const tradeRate = (s: GameState) => TRADE_RATE[Math.min(s.upgrades.workshop ?? 0, TRADE_RATE.length - 1)];
/** A part's trade-in value in scrap terms (its recycle value × the trade rate). */
export const tradeValue = (s: GameState, p: Pick<Part, 't'>) => (SCRAP_VALUE[p.t] ?? 0) * tradeRate(s);

export interface TradeTarget { family: Family; tier: number; cost: number; why: string }
/** Parts worth trading toward: the goal keystone's ingredient (the highest tier sold below it), and a part that
 *  upgrades a slot on the car you drive. Never the keystone itself (it is always a merge). */
export function tradeTargets(s: GameState): TradeTarget[] {
  const out: TradeTarget[] = [];
  const max = orderMaxTier(s);
  const g = goalStatus(s);
  if (g && !g.keystoneDone) {
    const t = Math.max(1, Math.min(max, g.tier - 1));
    out.push({ family: g.family, tier: t, cost: scrapOrderCost(t), why: `Ingredient for the ${g.car.model}'s T${g.tier} ${FAMILIES[g.family].name} (merge two)` });
  }
  const car = carById(s.activeCar);
  for (const f of ACTIVE_FAMILIES) {
    const have = fitted(s, s.activeCar)[f]?.t ?? 0;
    const t = Math.min(car.cap, max);
    if (t > have && !out.some((o) => o.family === f && o.tier === t)) out.push({ family: f, tier: t, cost: scrapOrderCost(t), why: `Upgrades your ${car.model}'s ${FAMILIES[f].name} (T${have || 0} → T${t})` });
  }
  return out;
}

export interface TradePreview { ok: boolean; why: string; cost: number; value: number; lost: number; used: number[]; family: Family; tier: number }
/** What trading these parts for a T`tier` `family` would do: the exact value counted, the price, what is lost. */
export function tradePreview(s: GameState, ids: number[], family: Family, tier: number): TradePreview {
  const parts = takeable(s, ids);
  const cost = scrapOrderCost(tier);
  const value = Math.floor(parts.reduce((a, p) => a + tradeValue(s, p), 0));
  const base = { cost, value, lost: Math.max(0, value - cost), used: parts.map((p) => p.id), family, tier };
  if (!ACTIVE_FAMILIES.includes(family) || !Number.isInteger(tier) || tier < 1 || tier > orderMaxTier(s)) return { ...base, ok: false, why: `T${tier} parts can't be traded for yet (up to T${orderMaxTier(s)})` };
  if (!parts.length) return { ...base, ok: false, why: 'Pick unstarred parts from the shelf or bench' };
  if (parts.some((p) => p.f === family && p.t >= tier)) return { ...base, ok: false, why: `Trading a ${name({ f: family, t: tier })} or better for a ${name({ f: family, t: tier })} gains nothing` };
  if (value < cost) return { ...base, ok: false, why: `${value} of ${cost} — add ${cost - value} more trade value` };
  return { ...base, ok: true, why: '' };
}

/** The smallest set of surplus parts (shelf first, then unused bench parts) that covers a trade, or null. */
export function autoTradePick(s: GameState, family: Family, tier: number, surplusBench: number[] = []): number[] | null {
  const cost = scrapOrderCost(tier);
  const g = goalStatus(s);
  // never offered: starred parts, parts as good as the target, and the goal keystone's own ingredients
  const keep = (p: Part) => isFavorite(s, p.id) || (p.f === family && p.t >= tier) || (!!g && !g.keystoneDone && p.f === g.family && p.t < g.tier);
  const benchSet = new Set(surplusBench);
  const pool = [...shelfParts(s), ...allParts(s).filter((p) => benchSet.has(p.id))].filter((p) => !keep(p));
  // largest first while it fits under the cost, then the smallest that tops it up
  pool.sort((a, b) => tradeValue(s, b) - tradeValue(s, a));
  const pick: Part[] = [];
  let v = 0;
  for (const p of pool) { if (v >= cost) break; if (v + tradeValue(s, p) <= cost) { pick.push(p); v += tradeValue(s, p); } }
  if (v < cost) {
    const rest = pool.filter((p) => !pick.includes(p)).sort((a, b) => tradeValue(s, a) - tradeValue(s, b));
    const top = rest.find((p) => v + tradeValue(s, p) >= cost);
    if (top) { pick.push(top); v += tradeValue(s, top); }
  }
  return v >= cost ? pick.map((p) => p.id) : null;
}

/** Trade parts for one known part. The new part goes to the bench (or the shelf, or first in the crate queue). */
export function tradeParts(s: GameState, ids: number[], family: Family, tier: number): GameEvent[] {
  const pv = tradePreview(s, ids, family, tier);
  if (!pv.ok) return [{ type: 'invalid', reason: pv.why }];
  remove(s, takeable(s, pv.used));
  s.stats.scrapped += pv.used.length;
  s.crates.unshift({ kind: 'targeted', family, tier, source: 'shop' });
  const ev = openCrates(s, 1);
  if (!ev.some((e) => e.type === 'place') && s.crates[0]?.source === 'shop' && shelfFree(s) > 0 && !firstFree(s)) {
    // no bench room and no auto-shelving: the traded part goes straight to the shelf (it never waits behind crates)
    const c = s.crates.shift()!;
    (s.shelf ??= []).push({ id: s.nextPartId++, f: c.family!, t: c.tier!, q: 'std' });
  }
  return ev.filter((e) => e.type !== 'crateBlocked');
}

// ---- contribute to a Garage upgrade

const ceilStep = (x: number) => {
  if (x <= 0) return 0;
  let r = Math.ceil(x / cashStep(x)) * cashStep(x);
  if (r % cashStep(r)) r = Math.ceil(r / cashStep(r)) * cashStep(r);
  return r;
};

export interface ContributePreview { ok: boolean; why: string; upgrade: UpgradeId; used: number[]; raw: number; priceBefore: number; priceAfter: number; credit: number; capped: boolean }
/** What contributing these parts to `id`'s next rank would do: the price before and after, exactly. */
export function contributePreview(s: GameState, ids: number[], id: UpgradeId): ContributePreview {
  const parts = takeable(s, ids);
  const list = upgradeListCost(s, id);
  const before = upgradeCost(s, id) ?? 0;
  const raw = parts.reduce((a, p) => a + (SCRAP_VALUE[p.t] ?? 0), 0) * CONTRIBUTE_CASH_PER_SCRAP;
  const base = { upgrade: id, used: parts.map((p) => p.id), raw, priceBefore: before, priceAfter: before, credit: upgradeCreditOf(s, id), capped: false };
  if (!UPGRADES.some((u) => u.id === id)) return { ...base, ok: false, why: 'Unknown upgrade' };
  if (list === null) return { ...base, ok: false, why: 'That upgrade is maxed' };
  const lock = upgradeLock(s, id);
  if (lock) return { ...base, ok: false, why: lock };
  if (!parts.length) return { ...base, ok: false, why: 'Pick unstarred parts from the shelf or bench' };
  const floor = ceilStep(list * (1 - CONTRIBUTE_MAX_SHARE)); // the lowest the price can go
  const after = Math.max(floor, ceilStep(before - raw));
  const capped = before - raw < floor;
  if (after >= before) return { ...base, capped, ok: false, why: capped ? `Parts can cover at most half the price ($${(list - floor).toLocaleString('en-US')})` : `Worth $${Math.floor(raw)} — too little to lower the $${before.toLocaleString('en-US')} price a step` };
  return { ...base, priceAfter: after, credit: list - after, capped, ok: true, why: '' };
}

/** Contribute parts toward an upgrade's next rank (they are gone; the credit stays until that rank is bought). */
export function contributeParts(s: GameState, ids: number[], id: UpgradeId): GameEvent[] {
  const pv = contributePreview(s, ids, id);
  if (!pv.ok) return [{ type: 'invalid', reason: pv.why }];
  remove(s, takeable(s, pv.used));
  s.stats.scrapped += pv.used.length;
  (s.upgradeCredit ??= {})[id] = pv.credit;
  return [];
}

// ---- recycle toward a priced scrap order

export interface RecycleTowardPreview { ok: boolean; why: string; used: number[]; scrap: number; total: number; cost: number; orders: boolean; family: Family; tier: number }
export function recycleTowardPreview(s: GameState, ids: number[], family: Family, tier: number): RecycleTowardPreview {
  const parts = takeable(s, ids);
  const scrap = parts.reduce((a, p) => a + (SCRAP_VALUE[p.t] ?? 0), 0);
  const cost = scrapOrderCost(tier);
  const total = s.scrap + scrap;
  const base = { used: parts.map((p) => p.id), scrap, total, cost, orders: total >= cost, family, tier };
  if (!ACTIVE_FAMILIES.includes(family) || !Number.isInteger(tier) || tier < 1 || tier > orderMaxTier(s)) return { ...base, orders: false, ok: false, why: `T${tier} isn't sold yet (up to T${orderMaxTier(s)})` };
  if (!parts.length) return { ...base, ok: false, why: 'Pick unstarred parts from the shelf or bench' };
  return { ...base, ok: true, why: '' };
}
/** Recycle the parts; if the scrap then covers the order, place it in the same transaction. */
export function recycleToward(s: GameState, ids: number[], family: Family, tier: number): GameEvent[] {
  const pv = recycleTowardPreview(s, ids, family, tier);
  if (!pv.ok) return [{ type: 'invalid', reason: pv.why }];
  const parts = takeable(s, pv.used);
  const ev: GameEvent[] = [];
  // bench parts go through the scrap press (its events); shelf parts are pressed directly
  for (const p of parts) {
    const at = refOf(s, p.id);
    if (at) ev.push(...scrapPart(s, at));
    else { s.shelf = shelfParts(s).filter((x) => x.id !== p.id); s.scrap += SCRAP_VALUE[p.t] ?? 0; s.stats.scrapped++; }
  }
  if (s.scrap >= pv.cost) {
    s.scrap -= pv.cost;
    s.crates.unshift({ kind: 'targeted', family, tier, source: 'shop' });
    ev.push(...openCrates(s, 1).filter((e) => e.type !== 'crateBlocked'));
  }
  return ev;
}
