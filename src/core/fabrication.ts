// Fab bench (Scrap & surplus): scrap → one-race kits (Nitro canister, Soft compound, Launch kit, Race fuel). Kits sit
// on a shelf (at most KIT_SHELF_MAX each), are armed in Pit Setup (at most KITS_PER_RACE, one of each), apply to the
// next live race through its RaceSetup, and are used up only when that race is committed: an abandoned race or a
// reload spends nothing, a second commit of the same race spends nothing more. Quick Races and Rival Runs never use
// kits. Scrap never turns back into cash, and a kit never turns back into scrap, so there is no loop.
//
// API for other workstreams (e.g. contract rewards): `grantItem(s, id, n)` adds kits (or scrap with id 'scrap') and
// returns how many were actually added (the shelf cap applies); `ITEM_IDS` lists the valid ids.
import { CREW_NITRO, carById } from '../data/tables';
import { FAB_OPEN_CARS, KITS, KITS_PER_RACE, KIT_SHELF_MAX, KitDef, KitId, kitById, kitCost } from '../data/fabrication';
import type { GameEvent } from './events';
import type { GameState } from './state';

export type { KitId } from '../data/fabrication';
export type ItemId = KitId | 'scrap';
export const ITEM_IDS: ItemId[] = [...KITS.map((k) => k.id), 'scrap'];

export const fabOpen = (s: GameState) => s.owned.length >= FAB_OPEN_CARS;
const fab = (s: GameState) => (s.fab ??= { kits: {}, armed: [], inRace: null });
export const kitCount = (s: GameState, id: KitId) => s.fab?.kits?.[id] ?? 0;
/** Today's kit price: by your best car's cap, so kits stay worth a few surplus parts all game. */
export const topCap = (s: GameState) => Math.max(...s.owned.map((c) => carById(c).cap));
export const kitPrice = (s: GameState) => kitCost(topCap(s));
/** Kits armed for the next live race that are still on the shelf. */
export const armedKits = (s: GameState): KitDef[] =>
  (s.fab?.armed ?? []).filter((k, i, a) => a.indexOf(k) === i && kitCount(s, k as KitId) > 0).map((k) => kitById(k)!).filter(Boolean).slice(0, KITS_PER_RACE);

/** Grant kits or scrap (rewards from other systems). Returns the number actually added. */
export function grantItem(s: GameState, id: ItemId, n = 1): number {
  const k = Math.max(0, Math.floor(n));
  if (!k) return 0;
  if (id === 'scrap') { s.scrap += k; return k; }
  if (!kitById(id)) return 0;
  const f = fab(s);
  const add = Math.max(0, Math.min(k, KIT_SHELF_MAX - (f.kits[id] ?? 0)));
  f.kits[id] = (f.kits[id] ?? 0) + add;
  return add;
}

/** Make one kit for scrap. */
export function fabricate(s: GameState, id: KitId): GameEvent[] {
  const k = kitById(id);
  if (!k) return [{ type: 'invalid', reason: 'Unknown kit' }];
  if (!fabOpen(s)) return [{ type: 'invalid', reason: `The Fab bench opens with your ${FAB_OPEN_CARS}th car` }];
  if (kitCount(s, id) >= KIT_SHELF_MAX) return [{ type: 'invalid', reason: `The shelf holds ${KIT_SHELF_MAX} ${k.name}s — use one first` }];
  const cost = kitPrice(s);
  if (s.scrap < cost) return [{ type: 'invalid', reason: `Need ${cost - s.scrap} more scrap` }];
  s.scrap -= cost;
  grantItem(s, id, 1);
  return [{ type: 'fabricate', kit: id, cost }];
}

/** Arm or disarm a kit for the next live race. Arming a third kit replaces the oldest one. */
export function armKit(s: GameState, id: KitId, on: boolean): GameEvent[] {
  if (!kitById(id)) return [{ type: 'invalid', reason: 'Unknown kit' }];
  const f = fab(s);
  let armed = f.armed.filter((k) => k !== id && kitCount(s, k as KitId) > 0);
  if (on) {
    if (kitCount(s, id) <= 0) return [{ type: 'invalid', reason: `No ${kitById(id)!.name} on the shelf — make one at the Fab bench` }];
    armed = [...armed, id].slice(-KITS_PER_RACE);
  }
  f.armed = armed;
  return [{ type: 'armKit', kit: id, on }];
}

/** Apply armed kits to a live race setup (stats and nitro) and remember which race they are on. */
export function applyKits<T extends { player: { stats: { top: number; accel: number; grip: number } }; nitroCharges: number }>(s: GameState, raceId: number, setup: T): T {
  const kits = armedKits(s);
  if (!kits.length) { if (s.fab) s.fab.inRace = null; return setup; }
  const stats = { ...setup.player.stats };
  let nitro = setup.nitroCharges;
  for (const k of kits) {
    if (k.nitro) nitro += k.nitro;
    if (k.stat && k.mul) stats[k.stat] *= k.mul;
  }
  fab(s).inRace = { id: raceId, kits: kits.map((k) => k.id) };
  return { ...setup, player: { ...setup.player, stats }, nitroCharges: nitro };
}

/** Free nitro charges in the race being committed: canisters ride with the crew charge, ahead of the bank. */
export const raceCanisters = (s: GameState, raceId: number) =>
  s.fab?.inRace?.id === raceId ? s.fab.inRace.kits.reduce((a, k) => a + (kitById(k)?.nitro ?? 0), 0) : 0;

/**
 * Use up the kits of a committed live race (once: the record is cleared) and keep canister charges out of the bank:
 * the commit took `max(0, used − crew)` from the bank; canisters cover their share of that.
 */
export function consumeKits(s: GameState, raceId: number, nitroBefore: number, nitroUsed: number): GameEvent[] {
  const r = s.fab?.inRace;
  if (!r || r.id !== raceId) return [];
  const can = raceCanisters(s, raceId);
  const tookBank = Math.min(nitroBefore, Math.max(0, nitroUsed - CREW_NITRO));
  const shouldTake = Math.min(nitroBefore, Math.max(0, nitroUsed - CREW_NITRO - can));
  s.nitro += tookBank - shouldTake;
  const f = fab(s);
  for (const k of r.kits) f.kits[k] = Math.max(0, (f.kits[k] ?? 0) - 1);
  f.inRace = null;
  f.armed = [];
  return [{ type: 'kitsUsed', kits: r.kits as KitId[] }];
}
