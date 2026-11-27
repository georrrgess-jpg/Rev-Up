// Build Sheets (Scrap & surplus): each car has an Engine, Chassis and Intake build that permanently absorbs donor
// parts. A donor's points depend on its tier against the car's cap (higher tiers count more, up to cap+2) and its
// quality (Polished ×1.5, Mint ×2). Stages give a small, capped stat bonus; stage 3 needs a Polished donor and
// stage 4 a Mint donor. Donated parts are gone for good: they cannot be merged, fitted or recycled again.
// Only bench and spare-rack parts can be donated (never a fitted part). Owned by the Scrap & surplus workstream.
import {
  BUILDS_OPEN_CARS, BUILD_POINTS_BY_REL, BUILD_QUALITY_MUL, BUILD_STAGE_BONUS, BUILD_STAGE_NAMES, BUILD_STAGE_PTS,
  BUILD_STAGE_SEAL, BUILD_TRACK_NAME, CONCOURS_OPEN_CARS, CONCOURS_STAGES, concoursBadge, concoursCost,
} from '../data/fabrication';
import { ACTIVE_FAMILIES, CarId, FAMILIES, Family, SCRAP_VALUE, carById } from '../data/tables';
import type { GameEvent, SlotRef } from './events';
import type { GameState, Part } from './state';

export interface BuildTrack { pts: number; seal: number }
export const BUILD_MAX_PTS = BUILD_STAGE_PTS.reduce((a, b) => a + b, 0);
export const BUILD_STAGES = BUILD_STAGE_PTS.length;

export const buildsOpen = (s: GameState) => s.owned.length >= BUILDS_OPEN_CARS;
export const trackOf = (s: GameState, car: CarId, f: Family): BuildTrack => s.builds?.[car]?.[f] ?? { pts: 0, seal: 0 };
const sealOf = (p: Pick<Part, 'q'>) => (p.q === 'mint' ? 2 : p.q === 'polished' ? 1 : 0);

/** Points this part would give a car's build (0: too low a tier for it). */
export function donorPoints(p: Pick<Part, 't' | 'q'>, car: CarId): number {
  const rel = Math.min(2, p.t - carById(car).cap);
  const base = BUILD_POINTS_BY_REL[rel] ?? 0;
  return Math.round(base * BUILD_QUALITY_MUL[p.q]);
}

/** Stages completed: points fill stages in order, and a stage that needs a seal stops there until one is donated. */
export function stageOf(t: BuildTrack): number {
  let left = t.pts, n = 0;
  for (let i = 0; i < BUILD_STAGES; i++) {
    if (left < BUILD_STAGE_PTS[i] || t.seal < BUILD_STAGE_SEAL[i]) break;
    left -= BUILD_STAGE_PTS[i];
    n++;
  }
  return n;
}

export interface TrackView {
  family: Family; name: string; pts: number; stage: number; max: boolean;
  /** Points into the current stage and its size. */
  into: number; need: number;
  /** Waiting on a seal: the stage's points are full but it needs a Polished / Mint donor. */
  sealNeed: 0 | 1 | 2;
  bonus: number; nextBonus: number;
}
export function trackView(s: GameState, car: CarId, f: Family): TrackView {
  const t = trackOf(s, car, f);
  const stage = stageOf(t);
  const before = BUILD_STAGE_PTS.slice(0, stage).reduce((a, b) => a + b, 0);
  const need = BUILD_STAGE_PTS[stage] ?? 0;
  const into = Math.min(need, t.pts - before);
  const sealReq = (BUILD_STAGE_SEAL[stage] ?? 0) as 0 | 1 | 2;
  const per = BUILD_STAGE_BONUS[f] ?? 0;
  return {
    family: f, name: BUILD_TRACK_NAME[f] ?? FAMILIES[f].name, pts: t.pts, stage, max: stage >= BUILD_STAGES, into, need,
    sealNeed: stage < BUILD_STAGES && t.seal < sealReq ? sealReq : 0, bonus: stage * per, nextBonus: Math.min(BUILD_STAGES, stage + 1) * per,
  };
}
export const stageName = (n: number) => BUILD_STAGE_NAMES[n - 1] ?? 'Stock';
/** Stages completed across the three builds (0–12), shown as the car's build level. */
export const buildLevel = (s: GameState, car: CarId) => ACTIVE_FAMILIES.reduce((a, f) => a + stageOf(trackOf(s, car, f)), 0);
export const BUILD_LEVEL_MAX = BUILD_STAGES * 3;

/** Stat multipliers from a car's builds (used by computeLoadout outside stock-class races). */
export function buildMul(s: GameState, car: CarId): { top: number; accel: number; grip: number } {
  const m = (f: Family) => 1 + stageOf(trackOf(s, car, f)) * (BUILD_STAGE_BONUS[f] ?? 0);
  return { top: m('engine'), accel: m('turbo'), grip: m('tires') };
}

/** Why a part can't go into this car's build, or null when it can. */
export function donateBlocker(s: GameState, p: Part, car: CarId): string | null {
  if (!buildsOpen(s)) return `Build Sheets open with your ${BUILDS_OPEN_CARS}th car`;
  if (!s.owned.includes(car)) return 'You don’t own that car';
  if (!ACTIVE_FAMILIES.includes(p.f)) return 'That part has no build';
  const t = trackOf(s, car, p.f);
  const v = trackView(s, car, p.f);
  if (v.max) return `The ${carById(car).model}’s ${v.name} is complete`;
  if (donorPoints(p, car) <= 0) return `Too low a tier: the ${carById(car).model} takes T${carById(car).cap - 1} or better`;
  // all points banked and only a seal is missing: a standard donor would be wasted
  if (t.pts >= BUILD_MAX_PTS && sealOf(p) < (BUILD_STAGE_SEAL[v.stage] ?? 0)) return `Needs a ${v.sealNeed === 2 ? 'Mint' : 'Polished'} donor to finish`;
  return null;
}

export interface DonateTarget { car: CarId; pts: number; used: number; stageBefore: number; stageAfter: number; text: string }
/** What donating this part to a car would do (null when it can't). `used` is how many points actually count. */
export function donatePreview(s: GameState, p: Part, car: CarId): DonateTarget | null {
  if (donateBlocker(s, p, car)) return null;
  const t = trackOf(s, car, p.f);
  const pts = donorPoints(p, car);
  const after: BuildTrack = { pts: Math.min(BUILD_MAX_PTS, t.pts + pts), seal: Math.max(t.seal, sealOf(p)) };
  const used = after.pts - t.pts;
  const a = stageOf(t), b = stageOf(after);
  const name = BUILD_TRACK_NAME[p.f] ?? FAMILIES[p.f].name;
  const text = b > a
    ? `${carById(car).model} ${name}: stage ${b} ${stageName(b)} (+${bonusWord(p.f, (b - a) * (BUILD_STAGE_BONUS[p.f] ?? 0))})`
    : `${carById(car).model} ${name}: +${used} pts (${trackView(s, car, p.f).into + used}/${trackView(s, car, p.f).need} to stage ${a + 1})`;
  return { car, pts, used, stageBefore: a, stageAfter: b, text };
}
export const bonusWord = (f: Family, x: number) => `${(Math.round(x * 1000) / 10).toString()}% ${f === 'engine' ? 'top speed' : f === 'tires' ? 'grip' : 'acceleration'}`;

/** The best car to donate this part to: the car you race if it takes the part, else the fastest car (highest cap)
 *  that does — a part goes where it is raced most; finishing a stage breaks ties. Null when no car can take it. */
export function bestDonation(s: GameState, p: Part): DonateTarget | null {
  let best: DonateTarget | null = null;
  for (const car of s.owned) {
    const d = donatePreview(s, p, car);
    if (!d) continue;
    const score = (x: DonateTarget) => (x.car === s.activeCar ? 1e6 : 0) + carById(x.car).cap * 1000 + (x.stageAfter - x.stageBefore) * 100 + x.used;
    if (!best || score(d) > score(best)) best = d;
  }
  return best;
}

/** Donate a bench / spare-rack part (by id) to a car's build. The part leaves the game; a second tap on the same id
 *  finds nothing and changes nothing. Fitted parts are never on the bench, so they can't be donated. */
export function donatePart(s: GameState, id: number, car: CarId): GameEvent[] {
  let at: SlotRef | null = null;
  const bi = s.board.findIndex((p) => p?.id === id);
  if (bi >= 0) at = { zone: 'board', i: bi };
  else {
    const ti = s.tray.findIndex((p) => p?.id === id);
    if (ti >= 0) at = { zone: 'tray', i: ti };
  }
  if (!at) return [{ type: 'invalid', reason: 'That part is gone (fitted parts can’t be donated — unfit it first)' }];
  const p = (at.zone === 'board' ? s.board[at.i] : s.tray[at.i])!;
  const why = donateBlocker(s, p, car);
  if (why) return [{ type: 'invalid', reason: why }];
  const t = trackOf(s, car, p.f);
  const before = stageOf(t);
  const pts = donorPoints(p, car);
  const next: BuildTrack = { pts: Math.min(BUILD_MAX_PTS, t.pts + pts), seal: Math.max(t.seal, sealOf(p)) };
  ((s.builds ??= {})[car] ??= {})[p.f] = next;
  if (at.zone === 'board') s.board[at.i] = null; else s.tray[at.i] = null;
  s.favorites = (s.favorites ?? []).filter((x) => x !== id);
  return [{ type: 'donate', id, car, family: p.f, tier: p.t, q: p.q, pts: next.pts - t.pts, stage: stageOf(next), stageUp: stageOf(next) > before }];
}

/** Donate several parts, each to its best car at that moment (in the order given). Ids already gone add nothing;
 *  fitted parts are never on the bench. Starred parts are skipped here (a single, deliberate Donate can use them). */
export function donateBest(s: GameState, ids: number[]): GameEvent[] {
  const ev: GameEvent[] = [];
  const fav = new Set(s.favorites ?? []);
  for (const id of new Set(ids)) {
    if (fav.has(id)) continue;
    const p = [...s.board, ...s.tray].find((x) => x?.id === id);
    if (!p) continue;
    const to = bestDonation(s, p);
    if (!to) continue;
    ev.push(...donatePart(s, id, to.car).filter((e) => e.type === 'donate'));
  }
  return ev.length ? ev : [{ type: 'invalid', reason: 'Nothing to donate: no build can take those parts' }];
}

/** Value of a spare in each use, for the Keep / Recycle list: recycle scrap and the best build donation. */
export function surplusValue(s: GameState, p: Part) {
  return { scrap: SCRAP_VALUE[p.t] ?? 0, donate: bestDonation(s, p) };
}

// ---------------- Concours restoration (scrap sink) ----------------

export const concoursOpen = (s: GameState) => s.owned.length >= CONCOURS_OPEN_CARS;
export const concoursStage = (s: GameState, car: CarId) => Math.max(0, Math.min(CONCOURS_STAGES.length, Math.floor(s.concours?.[car] ?? 0)));

/** The next restoration stage for a car: its exact scrap price, what it gives, and why it can't be bought (or null). */
export function restoreInfo(s: GameState, car: CarId): { stage: number; of: number; name: string; cost: number; benefit: string; locked: string | null; maxed: boolean } {
  const stage = concoursStage(s, car);
  const of = CONCOURS_STAGES.length;
  const maxed = stage >= of;
  const cls = carById(car);
  const cost = maxed ? 0 : concoursCost(cls.cap, stage);
  const name = maxed ? 'Restored' : CONCOURS_STAGES[stage];
  const benefit = maxed ? `The ${cls.model} is a Concours car` : stage === of - 1
    ? `Stage ${of} of ${of}: the ${concoursBadge(cls.model)} badge for your Showroom (looks only, no performance)`
    : `Stage ${stage + 1} of ${of}: ${name.toLowerCase()} for the ${cls.model} (looks only, no performance)`;
  const locked = !concoursOpen(s) ? `Restoration opens with your ${CONCOURS_OPEN_CARS}th car` : !s.owned.includes(car) ? `Unlock the ${cls.model} first` : null;
  return { stage, of, name, cost, benefit, locked, maxed };
}

/** Restore a car one stage for scrap (stages in order, each charged once; refused when short or fully restored).
 *  Never touches cash or performance. */
export function restoreCar(s: GameState, car: CarId): GameEvent[] {
  const r = restoreInfo(s, car);
  if (r.locked) return [{ type: 'invalid', reason: r.locked }];
  if (r.maxed) return [{ type: 'invalid', reason: `The ${carById(car).model} is fully restored` }];
  if (s.scrap < r.cost) return [{ type: 'invalid', reason: `Need ${r.cost - s.scrap} more scrap` }];
  s.scrap -= r.cost;
  (s.concours ??= {})[car] = r.stage + 1;
  if (r.stage + 1 >= r.of && !s.badges.includes(concoursBadge(carById(car).model))) s.badges.push(concoursBadge(carById(car).model));
  return [{ type: 'styleBought', item: `concours:${r.stage + 1}`, car }];
}

/** Keep a loaded save's build and kit records well formed (an older save has none). */
export function sanitizeSurplus(g: GameState) {
  const ok = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0;
  if (g.builds && typeof g.builds === 'object' && !Array.isArray(g.builds)) {
    const out: NonNullable<GameState['builds']> = {};
    for (const [car, tr] of Object.entries(g.builds)) {
      if (!tr || typeof tr !== 'object') continue;
      for (const [f, v] of Object.entries(tr)) {
        const b = v as BuildTrack | undefined;
        if (!b || !ok(b.pts) || !ACTIVE_FAMILIES.includes(f as Family)) continue;
        ((out[car as CarId] ??= {}))[f as Family] = { pts: Math.min(BUILD_MAX_PTS, Math.floor(b.pts)), seal: ok(b.seal) ? Math.min(2, Math.floor(b.seal)) : 0 };
      }
    }
    g.builds = out;
  } else delete g.builds;
  if (g.fab && typeof g.fab === 'object' && !Array.isArray(g.fab)) {
    const kits: Record<string, number> = {};
    for (const [k, n] of Object.entries(g.fab.kits ?? {})) if (ok(n)) kits[k] = Math.floor(n);
    const armed = Array.isArray(g.fab.armed) ? g.fab.armed.filter((k) => typeof k === 'string') : [];
    const inRace = g.fab.inRace && ok(g.fab.inRace.id) && Array.isArray(g.fab.inRace.kits) ? { id: g.fab.inRace.id, kits: g.fab.inRace.kits.filter((k) => typeof k === 'string') } : null;
    g.fab = { kits, armed, inRace };
  } else delete g.fab;
  if (g.concours && typeof g.concours === 'object' && !Array.isArray(g.concours)) {
    const out: NonNullable<GameState['concours']> = {};
    for (const [car, n] of Object.entries(g.concours)) if (ok(n)) out[car as CarId] = Math.min(CONCOURS_STAGES.length, Math.floor(n));
    g.concours = out;
  } else delete g.concours;
}
