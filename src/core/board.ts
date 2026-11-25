import {
  ACTIVE_FAMILIES, BOARD_EXPANDED, COMBO_NITRO_EVERY, COMBO_WINDOW_MS, CRATE_SCRAP_COST, CRATE_TIER_ODDS,
  Family, MAX_TIER, MERGE_ALL_NITRO_MIN_CHAIN, MERGE_CASH, QUALITY_ODDS, Quality, SCRAP_VALUE, PART_ORDER_PRICE, nitroCapFor, carById, ENABLED_CARS,
  TARGETED_CRATE_CASH_COST, TARGETED_CRATE_SCRAP_COST,
} from '../data/tables';
import { nextRandom, pickWeighted } from './rng';
import type { Crate, GameState, Part } from './state';
import { GameEvent, SlotRef, sameRef } from './events';

export const getPart = (s: GameState, r: SlotRef): Part | null =>
  (r.zone === 'board' ? s.board[r.i] : s.tray[r.i]) ?? null;

export const setPart = (s: GameState, r: SlotRef, p: Part | null) => {
  if (r.zone === 'board') s.board[r.i] = p;
  else s.tray[r.i] = p;
};

export const canFuse = (a: Part | null, b: Part | null): boolean =>
  !!a && !!b && a.id !== b.id && a.f === b.f && a.t === b.t && a.t < MAX_TIER;

export function allParts(s: GameState): Part[] {
  return [...s.board, ...s.tray].filter((p): p is Part => !!p);
}

export const freeSlots = (s: GameState) =>
  s.board.filter((p) => !p).length + s.tray.filter((p) => !p).length;

export const isFull = (s: GameState) => freeSlots(s) === 0;

/** Count of distinct T1-equivalents; used for conservation checks in tests. */
export const partMass = (p: Part) => 2 ** (p.t - 1);

// ---------------- Quality roll ----------------

/** Test/dev hook: force every roll (e.g. 'std' for the zero-Mint baseline playthrough). */
export const luck: { force: Quality | null } = { force: null };

export function rollQuality(s: GameState): Quality {
  const r = nextRandom(s);
  if (luck.force) return luck.force;
  if (r < QUALITY_ODDS.mint) return 'mint';
  if (r < QUALITY_ODDS.mint + QUALITY_ODDS.polished) return 'polished';
  return 'std';
}

export function addCrafted(s: GameState, f: Family, fromTier: number, toTier: number, events: GameEvent[]) {
  for (let t = fromTier + 1; t <= toTier; t++) {
    const key = `${f}:${t}`;
    if (!s.crafted.includes(key)) {
      s.crafted.push(key);
      events.push({ type: 'keystone', family: f, tier: t });
    }
  }
}

export const craftedTier = (s: GameState, f: Family): number =>
  s.crafted.reduce((m, k) => {
    const [ff, tt] = k.split(':');
    return ff === f ? Math.max(m, Number(tt)) : m;
  }, 0);

/** Fuse `src` into `dst` (both must hold matching parts). Result lands in dst. */
function fuseOnce(s: GameState, src: SlotRef, dst: SlotRef, chain: number, events: GameEvent[]): Part {
  const a = getPart(s, src)!;
  const b = getPart(s, dst)!;
  const q = rollQuality(s);
  let tier = b.t + 1;
  let skipped = false;
  if (q === 'mint' && tier < MAX_TIER) {
    tier += 1;
    skipped = true;
  }
  const np: Part = { id: s.nextPartId++, f: b.f, t: tier, q };
  setPart(s, src, null);
  setPart(s, dst, np);
  s.stats.fusions++;
  if (q === 'mint') s.stats.mints++;
  if (q === 'polished') s.stats.polished++;
  addCrafted(s, np.f, a.t, tier, events);
  const cash = MERGE_CASH(tier);
  s.cash += cash;
  events.push({ type: 'fuse', at: dst, consumed: src, family: np.f, fromTier: a.t, tier, q, chain, skipped });
  events.push({ type: 'cash', amount: cash, reason: 'fusion' });
  return np;
}

const NEIGHBOR_ORDER: [number, number][] = [[-1, 0], [0, 1], [1, 0], [0, -1]]; // up, right, down, left

function findCascadeNeighbor(s: GameState, at: SlotRef): SlotRef | null {
  if (at.zone !== 'board') return null;
  const p = getPart(s, at);
  if (!p || p.t >= MAX_TIER) return null;
  const r = Math.floor(at.i / s.cols);
  const c = at.i % s.cols;
  for (const [dr, dc] of NEIGHBOR_ORDER) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr < 0 || nc < 0 || nr >= s.rows || nc >= s.cols) continue;
    const ref: SlotRef = { zone: 'board', i: nr * s.cols + nc };
    if (canFuse(getPart(s, ref), p)) return ref;
  }
  return null;
}

/** Resolve a fusion and its full orthogonal cascade. Returns chain length. */
function fuseChain(s: GameState, src: SlotRef, dst: SlotRef, events: GameEvent[]): number {
  let chain = 1;
  fuseOnce(s, src, dst, chain, events);
  for (;;) {
    const n = findCascadeNeighbor(s, dst);
    if (!n) break;
    chain++;
    fuseOnce(s, n, dst, chain, events);
  }
  return chain;
}

function bumpCombo(s: GameState, now: number, fusions: number, events: GameEvent[]) {
  for (let k = 0; k < fusions; k++) {
    if (now - s.combo.lastAt > COMBO_WINDOW_MS) s.combo.count = 0;
    s.combo.count++;
    s.combo.lastAt = now;
    if (s.combo.count % COMBO_NITRO_EVERY === 0) {
      if (s.nitro < nitroCapFor(s.upgrades.nitroTank)) {
        s.nitro++;
        events.push({ type: 'nitro', total: s.nitro, source: 'combo' });
      } else events.push({ type: 'nitroFull' });
    }
  }
  events.push({ type: 'combo', count: s.combo.count });
}

/** Player drag/tap action: move to empty slot, or fuse onto a matching part. */
export function moveOrFuse(s: GameState, from: SlotRef, to: SlotRef, now: number): GameEvent[] {
  const events: GameEvent[] = [];
  if (sameRef(from, to)) return events;
  const a = getPart(s, from);
  const b = getPart(s, to);
  if (!a) return [{ type: 'invalid', reason: 'empty' }];
  if (!b) {
    setPart(s, to, a);
    setPart(s, from, null);
    events.push({ type: 'move', from, to });
    return events;
  }
  if (!canFuse(a, b)) {
    if (a.f === b.f && a.t === b.t && a.t >= MAX_TIER) return [{ type: 'invalid', reason: `T${MAX_TIER} is the top tier for now` }];
    return [{ type: 'invalid', reason: a.f !== b.f ? 'Different family' : 'Different tier' }];
  }
  const before = events.length;
  fuseChain(s, from, to, events);
  const fusions = events.slice(before).filter((e) => e.type === 'fuse').length;
  bumpCombo(s, now, fusions, events);
  return events;
}

// ---------------- Merge All ----------------

/** Deterministic batch merge with normal fusion rules. Nitro: one charge if the longest chain ≥ threshold. */
export function mergeAll(s: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  let longest = 0;
  let fusions = 0;
  let found = true;
  while (found) {
    found = false;
    outer: for (let t = 1; t < MAX_TIER; t++) {
      for (const f of ACTIVE_FAMILIES) {
        const refs: SlotRef[] = [];
        s.board.forEach((p, i) => { if (p && p.f === f && p.t === t) refs.push({ zone: 'board', i }); });
        s.tray.forEach((p, i) => { if (p && p.f === f && p.t === t) refs.push({ zone: 'tray', i }); });
        if (refs.length >= 2) {
          // Destination: first board slot (stable), source: next one in order.
          const chain = fuseChain(s, refs[1], refs[0], events);
          fusions += chain;
          longest = Math.max(longest, chain);
          found = true;
          break outer; // re-scan from the lowest tier after each chain
        }
      }
    }
  }
  if (fusions > 0) {
    s.mergeAllUses++;
    if (longest >= MERGE_ALL_NITRO_MIN_CHAIN) {
      if (s.nitro < nitroCapFor(s.upgrades.nitroTank)) {
        s.nitro++;
        events.push({ type: 'nitro', total: s.nitro, source: 'mergeAll' });
      } else events.push({ type: 'nitroFull' });
    }
  }
  events.push({ type: 'mergeAll', fusions, longest });
  return events;
}

export function hasAnyPair(s: GameState): boolean {
  const seen = new Set<string>();
  for (const p of allParts(s)) {
    if (p.t >= MAX_TIER) continue;
    const k = `${p.f}:${p.t}`;
    if (seen.has(k)) return true;
    seen.add(k);
  }
  return false;
}

// ---------------- Placement & crates ----------------

/** Shared placement rule for every reward source: board first (reading order), then overflow tray. */
export function firstFree(s: GameState): SlotRef | null {
  const b = s.board.findIndex((p) => !p);
  if (b >= 0) return { zone: 'board', i: b };
  const t = s.tray.findIndex((p) => !p);
  if (t >= 0) return { zone: 'tray', i: t };
  return null;
}

export function crateContents(s: GameState, c: Crate): { f: Family; t: number } {
  if (c.kind === 'catchup' && c.family && c.tier) return { f: c.family, t: c.tier };
  const f = c.family ?? ACTIVE_FAMILIES[Math.floor(nextRandom(s) * ACTIVE_FAMILIES.length)];
  const odds = CRATE_TIER_ODDS[Math.min(s.upgrades.crateTier, CRATE_TIER_ODDS.length - 1)];
  const t = c.tier ?? pickWeighted(nextRandom(s), odds) + 1;
  return { f, t: Math.min(t, MAX_TIER) };
}

export function placeNew(s: GameState, f: Family, t: number, source: string, events: GameEvent[]): boolean {
  const at = firstFree(s);
  if (!at) return false;
  setPart(s, at, { id: s.nextPartId++, f, t, q: 'std' });
  events.push({ type: 'place', at, family: f, tier: t, source });
  return true;
}

/** Open banked crates while capacity exists. Crates stay banked when full. */
export function openCrates(s: GameState, max = Infinity): GameEvent[] {
  const events: GameEvent[] = [];
  let opened = 0;
  while (s.crates.length > 0 && opened < max) {
    if (!firstFree(s)) {
      events.push({ type: 'crateBlocked' });
      break;
    }
    const c = s.crates.shift()!;
    const { f, t } = crateContents(s, c);
    placeNew(s, f, t, c.source, events);
    opened++;
  }
  return events;
}

export function scrapValue(p: Part): number {
  return SCRAP_VALUE[p.t] ?? 0;
}

export function scrapPart(s: GameState, at: SlotRef): GameEvent[] {
  const p = getPart(s, at);
  if (!p) return [{ type: 'invalid', reason: 'empty' }];
  const value = scrapValue(p);
  setPart(s, at, null);
  s.scrap += value;
  s.stats.scrapped++;
  return [{ type: 'scrap', at, value }];
}

export function buyCrate(s: GameState, kind: 'std' | 'targeted' | 'cash', family?: Family): GameEvent[] {
  if (kind === 'std') {
    if (s.scrap < CRATE_SCRAP_COST) return [{ type: 'invalid', reason: `Need ${CRATE_SCRAP_COST} scrap` }];
    s.scrap -= CRATE_SCRAP_COST;
    s.crates.push({ kind: 'std', source: 'shop' });
  } else if (kind === 'targeted') {
    if (!family) return [{ type: 'invalid', reason: 'Pick a family' }];
    if (s.scrap < TARGETED_CRATE_SCRAP_COST) return [{ type: 'invalid', reason: `Need ${TARGETED_CRATE_SCRAP_COST} scrap` }];
    s.scrap -= TARGETED_CRATE_SCRAP_COST;
    s.crates.push({ kind: 'targeted', family, source: 'shop' });
  } else {
    if (!family) return [{ type: 'invalid', reason: 'Pick a family' }];
    if (s.cash < TARGETED_CRATE_CASH_COST) return [{ type: 'invalid', reason: `Need $${TARGETED_CRATE_CASH_COST}` }];
    s.cash -= TARGETED_CRATE_CASH_COST;
    s.crates.push({ kind: 'targeted', family, source: 'shop' });
  }
  return openCrates(s, 1);
}

/** The highest tier the parts counter sells: one below your best car's cap (the cap tier is a craft). */
export function orderMaxTier(s: GameState): number {
  const cap = Math.max(...s.owned.map((id) => carById(id).cap));
  // the next car's keystone craft is always reachable: two bought parts of the tier below make it
  const next = ENABLED_CARS.find((c) => !s.owned.includes(c.id));
  const goalTier = next?.unlock ? next.unlock.tier : 0;
  return Math.max(1, Math.min(Math.max(cap, goalTier) - 1, MAX_TIER - 1));
}

/** Order a Part: a known family and tier for cash. It goes straight onto the bench, or first in the crate queue. */
export function orderPart(s: GameState, family: Family, tier: number): GameEvent[] {
  if (tier < 1 || tier > orderMaxTier(s)) return [{ type: 'invalid', reason: `T${tier} parts aren't sold yet` }];
  const price = PART_ORDER_PRICE[tier];
  if (s.cash < price) return [{ type: 'invalid', reason: `Need $${price - s.cash} more` }];
  s.cash -= price;
  s.stats.spent = (s.stats.spent ?? 0) + price;
  s.crates.unshift({ kind: 'targeted', family, tier, source: 'shop' });
  return openCrates(s, 1);
}

/** Expand 5×6 → 6×7, keeping each part at its row/column. */
export function expandBoard(s: GameState) {
  const { cols, rows } = BOARD_EXPANDED;
  if (s.cols >= cols) return;
  const nb: (Part | null)[] = new Array(cols * rows).fill(null);
  for (let r = 0; r < s.rows; r++) for (let c = 0; c < s.cols; c++) nb[r * cols + c] = s.board[r * s.cols + c];
  s.board = nb;
  s.cols = cols;
  s.rows = rows;
}
