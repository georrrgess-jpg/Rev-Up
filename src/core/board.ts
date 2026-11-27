import {
  ACTIVE_FAMILIES, BOARD_EXPANDED, FAMILIES, COMBO_NITRO_EVERY, COMBO_WINDOW_MS, CRATE_SCRAP_COST, CRATE_TIER_ODDS,
  Family, MAX_TIER, MERGE_ALL_NITRO_MIN_CHAIN, MERGE_CASH, QUALITY_ODDS, Quality, SCRAP_VALUE, PART_ORDER_PRICE, nitroCapFor, carById, ENABLED_CARS,
  TARGETED_CRATE_CASH_COST, TARGETED_CRATE_SCRAP_COST, polishCost, scrapOrderCost,
  AUTO_SHELF_RANK, BATCH_MERGE_RANK, CHAIN_BENCH_RANK, ORDER_DISCOUNT, POLISHED_ORDER_MUL, POLISHED_ORDER_RANK, SHELF_SLOTS, roundCash,
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

/** Why two parts can't merge, in plain words (null when they can). */
export function mergeBlocker(a: Part | null, b: Part | null): string | null {
  if (!a || !b || a.id === b.id) return null;
  if (canFuse(a, b)) return null;
  if (a.f !== b.f) return `${FAMILIES[a.f].plural} only merge with ${FAMILIES[a.f].plural}`;
  if (a.t !== b.t) return `T${a.t} only merges with another T${a.t}`;
  return `T${MAX_TIER} is the top tier for now`;
}

/**
 * What dropping `from` onto `to` would make, assuming standard quality rolls (a Mint can jump one tier more):
 * the merged tier and the full cascade through orthogonal neighbours of `to`. Null when it is not a merge.
 */
export function mergePreview(s: GameState, from: SlotRef, to: SlotRef): { family: Family; fromTier: number; tier: number; chain: number } | null {
  const a = getPart(s, from);
  const b = getPart(s, to);
  if (sameRef(from, to) || !canFuse(a, b)) return null;
  let tier = b!.t + 1;
  let chain = 1;
  if (to.zone !== 'board') return { family: b!.f, fromTier: b!.t, tier, chain };
  const used = new Set<number>([a!.id, b!.id]);
  const r = Math.floor(to.i / s.cols);
  const c = to.i % s.cols;
  for (;;) {
    if (tier >= MAX_TIER) break;
    let found = false;
    for (const [dr, dc] of NEIGHBOR_ORDER) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= s.rows || nc >= s.cols) continue;
      const i = nr * s.cols + nc;
      if (from.zone === 'board' && from.i === i) continue; // the source cell is empty after the merge
      const p = s.board[i];
      if (p && !used.has(p.id) && p.f === b!.f && p.t === tier) { used.add(p.id); tier++; chain++; found = true; break; }
    }
    if (!found) break;
  }
  return { family: b!.f, fromTier: b!.t, tier, chain };
}

// ---------------- Merge All ----------------

/** Deterministic batch merge with normal fusion rules. Nitro: one charge if the longest chain ≥ threshold. */
export function mergeAll(s: GameState, only?: Family): GameEvent[] {
  const events: GameEvent[] = [];
  let longest = 0;
  let fusions = 0;
  let longChains = 0; // 1.9 Chain bench: chains of the nitro length
  let found = true;
  // 1.9 Batch merge (Bench rank 2): one family only
  const fams = only && (s.upgrades.grid ?? 0) >= BATCH_MERGE_RANK ? [only] : ACTIVE_FAMILIES;
  while (found) {
    found = false;
    outer: for (let t = 1; t < MAX_TIER; t++) {
      for (const f of fams) {
        const refs: SlotRef[] = [];
        s.board.forEach((p, i) => { if (p && p.f === f && p.t === t) refs.push({ zone: 'board', i }); });
        s.tray.forEach((p, i) => { if (p && p.f === f && p.t === t) refs.push({ zone: 'tray', i }); });
        if (refs.length >= 2) {
          // Destination: first board slot (stable), source: next one in order.
          const chain = fuseChain(s, refs[1], refs[0], events);
          fusions += chain;
          longest = Math.max(longest, chain);
          if (chain >= MERGE_ALL_NITRO_MIN_CHAIN) longChains++;
          found = true;
          break outer; // re-scan from the lowest tier after each chain
        }
      }
    }
  }
  if (fusions > 0) {
    s.mergeAllUses++;
    const bank = Math.min(longChains, (s.upgrades.grid ?? 0) >= CHAIN_BENCH_RANK ? 2 : 1); // 1.9 Chain bench: up to 2
    for (let k = 0; k < bank; k++) {
      if (s.nitro < nitroCapFor(s.upgrades.nitroTank)) {
        s.nitro++;
        events.push({ type: 'nitro', total: s.nitro, source: 'mergeAll' });
      } else { events.push({ type: 'nitroFull' }); break; }
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

export function placeNew(s: GameState, f: Family, t: number, source: string, events: GameEvent[], q: Quality = 'std'): boolean {
  const at = firstFree(s);
  if (!at) return false;
  setPart(s, at, { id: s.nextPartId++, f, t, q });
  events.push({ type: 'place', at, family: f, tier: t, source });
  return true;
}

/** Open banked crates while capacity exists. Crates stay banked when full. */
export function openCrates(s: GameState, max = Infinity): GameEvent[] {
  const events: GameEvent[] = [];
  let opened = 0;
  while (s.crates.length > 0 && opened < max) {
    if (!firstFree(s)) {
      // 1.9 overflow auto-shelving (Storage rank 2): a reward part (an order, a stage payout, a race prize) that finds
      // no room on the bench or rack goes onto the Parts Shelf. Printer and starter crates keep waiting.
      const c0 = s.crates[0];
      if (autoShelfOn(s) && shelfFree(s) > 0 && c0.source !== 'printer' && c0.source !== 'starter') {
        const c = s.crates.shift()!;
        const { f, t } = crateContents(s, c);
        const p: Part = { id: s.nextPartId++, f, t, q: c.q ?? 'std' };
        (s.shelf ??= []).push(p);
        opened++;
        continue;
      }
      events.push({ type: 'crateBlocked' });
      break;
    }
    const c = s.crates.shift()!;
    const { f, t } = crateContents(s, c);
    placeNew(s, f, t, c.source, events, c.q);
    opened++;
  }
  return events;
}

export function scrapValue(p: Part): number {
  return SCRAP_VALUE[p.t] ?? 0;
}

export const isFavorite = (s: GameState, id: number) => (s.favorites ?? []).includes(id);

export function scrapPart(s: GameState, at: SlotRef): GameEvent[] {
  const p = getPart(s, at);
  if (!p) return [{ type: 'invalid', reason: 'empty' }];
  if (isFavorite(s, p.id)) return [{ type: 'invalid', reason: `Your T${p.t} ${FAMILIES[p.f].name} is starred to keep — unstar it to recycle it` }];
  const value = scrapValue(p);
  setPart(s, at, null);
  s.scrap += value;
  s.stats.scrapped++;
  return [{ type: 'scrap', at, value }];
}

/** Star / unstar a part to keep. Fitted parts can be starred too (they are never recycled anyway). Stale ids drop. */
export function toggleFavorite(s: GameState, id: number): GameEvent[] {
  const live = new Set([...allParts(s), ...Object.values(s.installed ?? {}).flatMap((sl) => Object.values(sl ?? {}))].filter(Boolean).map((p) => (p as Part).id));
  if (!live.has(id)) return [{ type: 'invalid', reason: 'That part is gone' }];
  const fav = (s.favorites ?? []).filter((x) => live.has(x));
  s.favorites = fav.includes(id) ? fav.filter((x) => x !== id) : [...fav, id];
  return [{ type: 'favorite', id, on: s.favorites.includes(id) }];
}

/**
 * Recycle several bench / spare-rack parts in one step. Only parts found on the board or rack by id are pressed:
 * fitted parts are never there, starred parts are skipped, and an id already gone (a second tap) adds nothing.
 */
export function recycleParts(s: GameState, ids: number[]): GameEvent[] {
  const events: GameEvent[] = [];
  const want = new Set(ids);
  const refs: SlotRef[] = [
    ...s.board.map((p, i) => (p && want.has(p.id) ? { zone: 'board' as const, i } : null)),
    ...s.tray.map((p, i) => (p && want.has(p.id) ? { zone: 'tray' as const, i } : null)),
  ].filter((r): r is SlotRef => !!r);
  for (const r of refs) {
    const p = getPart(s, r)!;
    if (isFavorite(s, p.id)) continue;
    events.push(...scrapPart(s, r));
  }
  if (!events.length) return [{ type: 'invalid', reason: 'Nothing to recycle: those parts are starred, fitted or already gone' }];
  return events;
}

/** What recycling these ids would do, by the same rule as recycleParts: the exact scrap it pays, and the parts it
 *  leaves alone (starred, fitted to a car, or already gone). The Keep / Recycle sheet shows this before the tap. */
export function recyclePreview(s: GameState, ids: number[]): { count: number; scrap: number; starred: number; fitted: number; missing: number } {
  const want = new Set(ids);
  const bench = allParts(s).filter((p) => want.has(p.id));
  const fittedIds = new Set(Object.values(s.installed ?? {}).flatMap((sl) => Object.values(sl ?? {})).filter(Boolean).map((p) => (p as Part).id));
  const press = bench.filter((p) => !isFavorite(s, p.id));
  const fitted = [...want].filter((id) => fittedIds.has(id)).length;
  return { count: press.length, scrap: press.reduce((a, p) => a + scrapValue(p), 0), starred: bench.length - press.length, fitted, missing: want.size - bench.length - fitted };
}

/** Workshop: order a part of the family and tier you pick, paid in scrap. Same tiers as the cash counter (the
 *  next car's own part must still be merged), charged once, delivered to the bench or first in the crate queue. */
export function scrapOrder(s: GameState, family: Family, tier: number): GameEvent[] {
  if (!ACTIVE_FAMILIES.includes(family)) return [{ type: 'invalid', reason: 'Pick a family' }];
  if (!Number.isInteger(tier) || tier < 1 || tier > orderMaxTier(s)) return [{ type: 'invalid', reason: `T${tier} parts aren't sold yet` }];
  const cost = scrapOrderCost(tier);
  if (s.scrap < cost) return [{ type: 'invalid', reason: `Need ${cost - s.scrap} more scrap` }];
  s.scrap -= cost;
  s.crates.unshift({ kind: 'targeted', family, tier, source: 'shop' });
  return openCrates(s, 1);
}

/** Where a part is: a bench / rack cell, or a car's slot. */
function findPart(s: GameState, id: number): Part | null {
  const p = allParts(s).find((x) => x.id === id);
  if (p) return p;
  for (const sl of Object.values(s.installed ?? {})) for (const x of Object.values(sl ?? {})) if (x && x.id === id) return x;
  return null;
}

/** Workshop: polish a standard part (bench, rack or fitted) to Polished, +15%, for scrap. */
export function polishPart(s: GameState, id: number): GameEvent[] {
  const p = findPart(s, id);
  if (!p) return [{ type: 'invalid', reason: 'That part is gone' }];
  if (p.q !== 'std') return [{ type: 'invalid', reason: `It is already ${p.q === 'mint' ? 'Mint' : 'Polished'}` }];
  const cost = polishCost(p.t);
  if (s.scrap < cost) return [{ type: 'invalid', reason: `Need ${cost - s.scrap} more scrap` }];
  s.scrap -= cost;
  p.q = 'polished';
  return [{ type: 'polish', id, family: p.f, tier: p.t, cost }];
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
  // every car you can chase now (two at a branch), so the keystone of either is reachable
  const goalTier = Math.max(0, ...ENABLED_CARS.filter((c) => c.unlock && !s.owned.includes(c.id) && s.owned.includes(c.unlock.after ?? ENABLED_CARS[ENABLED_CARS.indexOf(c) - 1]?.id)).map((c) => c.unlock!.tier));
  return Math.max(1, Math.min(Math.max(cap, goalTier) - 1, MAX_TIER - 1));
}

/** The cash price of an order now: the list price less the Workshop discount, ×1.5 for a Polished order, on a cash
 *  step. The preview and the charge both read this. */
export function orderPrice(s: GameState, tier: number, polished = false): number {
  const list = PART_ORDER_PRICE[tier] ?? 0;
  const lvl = s.upgrades.workshop ?? 0;
  const disc = ORDER_DISCOUNT[Math.min(lvl, ORDER_DISCOUNT.length - 1)] ?? 0;
  return roundCash(list * (1 - disc) * (polished ? POLISHED_ORDER_MUL : 1));
}
export const polishedOrdersOpen = (s: GameState) => (s.upgrades.workshop ?? 0) >= POLISHED_ORDER_RANK;

/** Order a Part: a known family and tier for cash. It goes straight onto the bench, or first in the crate queue
 *  (or onto the shelf with overflow auto-shelving). `polished` (Workshop rank 2) delivers it Polished. */
export function orderPart(s: GameState, family: Family, tier: number, polished = false): GameEvent[] {
  if (!ACTIVE_FAMILIES.includes(family)) return [{ type: 'invalid', reason: 'Pick a family' }];
  if (!Number.isInteger(tier) || tier < 1 || tier > orderMaxTier(s)) return [{ type: 'invalid', reason: `T${tier} parts aren't sold yet` }];
  if (polished && !polishedOrdersOpen(s)) return [{ type: 'invalid', reason: 'Polished orders open with the Workshop counter rank 2' }];
  const price = orderPrice(s, tier, polished);
  if (s.cash < price) return [{ type: 'invalid', reason: `Need $${price - s.cash} more` }];
  s.cash -= price;
  s.stats.spent = (s.stats.spent ?? 0) + price;
  s.crates.unshift({ kind: 'targeted', family, tier, source: 'shop', ...(polished ? { q: 'polished' as const } : {}) });
  return openCrates(s, 1);
}

// ---------------- Parts Shelf (1.9; the moves and surplus uses live in core/shelf.ts) ----------------

/** Shelf slots now, by Storage rank. */
export const shelfCap = (s: GameState) => SHELF_SLOTS[Math.min(s.upgrades.storage ?? 0, SHELF_SLOTS.length - 1)];
export const shelfParts = (s: GameState): Part[] => (s.shelf ?? []).filter((p): p is Part => !!p);
export const shelfFree = (s: GameState) => Math.max(0, shelfCap(s) - shelfParts(s).length);
export const autoShelfOn = (s: GameState) => (s.upgrades.storage ?? 0) >= AUTO_SHELF_RANK;

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
