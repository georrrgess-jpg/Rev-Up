// Pit Setup (Pit Stop update): what a track asks of a car, and for each part slot the best compatible parts you
// already own (bench, spare rack, other cars) with what each swap changes. Swaps reuse core/install.ts, so a part
// keeps exactly one location. If nothing owned helps, it names the exact merge or Workshop order that would.
// Owned by the Pit Setup & Rival Runs workstream.
import { ACTIVE_FAMILIES, CarId, FAMILIES, Family, PART_ORDER_PRICE, TIER_STAT, TRACKS, Track, carById, scrapOrderCost } from '../data/tables';
import { allParts, orderMaxTier } from './board';
import type { SlotRef } from './events';
import { PartSource, describeCell, fitCandidates, fitted } from './install';
import { computeLoadout, contributionOn, loadoutWith } from './loadout';
import type { GameState, Part } from './state';
import { mph } from './units';

type Stats = { top: number; accel: number; grip: number };
export type Demand = 'launch' | 'straights' | 'corners';
export const DEMAND_FAMILY: Record<Demand, Family> = { launch: 'turbo', straights: 'engine', corners: 'tires' };
export const DEMAND_LABEL: Record<Demand, string> = { launch: 'Launch', straights: 'Straights', corners: 'Corners' };

/** Share of the track's time-weight on launch, straights and corners (sums to 1), with a word for each: High for
 *  the biggest demand and any within 75% of it, Medium from 40% of it. */
export function trackDemands(trackId: Track['id']): { key: Demand; share: number; level: 'High' | 'Medium' | 'Low' }[] {
  const w: Record<Demand, number> = { launch: 0, straights: 0, corners: 0 };
  for (const sg of TRACKS[trackId].segments) {
    if (sg.type === 'launch') w.launch += sg.length * 1.6; // the slowest metres: acceleration decides them
    else if (sg.type === 'straight') w.straights += sg.length;
    else if (sg.type === 'highway') w.straights += sg.length * 1.25;
    else if (sg.type === 'bend') w.corners += sg.length * Math.min(2.5, 100 / (sg.radius ?? 100)); // tight = slow = long
    else w.corners += sg.length * Math.min(1, 70 / (sg.radius ?? 140)); // a fast sweeper
  }
  const sum = w.launch + w.straights + w.corners || 1;
  const top = Math.max(w.launch, w.straights, w.corners) || 1;
  return (Object.keys(w) as Demand[]).map((key) => {
    const rel = w[key] / top;
    return { key, share: w[key] / sum, level: rel >= 0.75 ? 'High' : rel >= 0.4 ? 'Medium' : 'Low' };
  });
}

/** Plain words for a stat change: "+6 mph top speed", "+9% launch", "+5% grip". Empty when nothing moves. */
export function changeWords(before: Stats, after: Stats): string[] {
  const out: string[] = [];
  const dTop = mph(after.top) - mph(before.top);
  if (dTop) out.push(`${dTop > 0 ? '+' : '−'}${Math.abs(dTop)} mph top speed`);
  const pct = (k: 'accel' | 'grip') => Math.round(((after[k] - before[k]) / before[k]) * 100);
  const a = pct('accel'), g = pct('grip');
  if (a) out.push(`${a > 0 ? 'better' : 'slower'} launch (${a > 0 ? '+' : '−'}${Math.abs(a)}% acceleration)`);
  if (g) out.push(`${g > 0 ? 'more' : 'less'} grip (${g > 0 ? '+' : '−'}${Math.abs(g)}%)`);
  return out;
}

export interface PitOption { src: PartSource; where: string; after: Stats; words: string[] }
export type PitHint =
  | { kind: 'merge'; family: Family; tier: number; cells: SlotRef[]; text: string }
  | { kind: 'order'; family: Family; tier: number; cash: number; scrap: number; text: string }
  | { kind: 'max'; text: string };
export interface PitSlot { family: Family; current: Part | null; options: PitOption[]; hint: PitHint | null }

const where = (src: PartSource) => ('at' in src ? (src.at.zone === 'tray' ? 'spare rack' : 'bench') : `on the ${carById(src.car).model}`);

/** Per slot: what is fitted, the best owned parts that would improve it here (best first), else a craft/order hint. */
export function pitSlots(s: GameState, car: CarId, partCap?: number, max = 2): PitSlot[] {
  const before = computeLoadout(s, car, undefined, partCap).stats;
  const cap = Math.min(carById(car).cap, partCap ?? Infinity);
  return ACTIVE_FAMILIES.map((family) => {
    const stat = FAMILIES[family].stat as keyof Stats;
    const current = fitted(s, car)[family] ?? null;
    const options: PitOption[] = [];
    for (const src of fitCandidates(s, car, family)) {
      if (options.length >= max) break;
      const after = loadoutWith(s, car, { [family]: src.part }, partCap).stats;
      if (after[stat] <= before[stat] + 1e-9) continue;
      options.push({ src, where: where(src), after, words: changeWords(before, after) });
    }
    return { family, current, options, hint: options.length ? null : hintFor(s, car, family, current, cap) };
  });
}

/** The exact merge (a pair on your bench) or Workshop order that would beat what is fitted, within the cap. */
export function hintFor(s: GameState, car: CarId, family: Family, current: Part | null, cap: number): PitHint {
  const have = current ? contributionOn(current, cap) : 0;
  const name = FAMILIES[family].name;
  // a pair to merge: the highest tier whose merged part beats the fitted one
  const bench: { p: Part; at: SlotRef }[] = [];
  s.board.forEach((p, i) => p && p.f === family && bench.push({ p, at: { zone: 'board', i } }));
  s.tray.forEach((p, i) => p && p.f === family && bench.push({ p, at: { zone: 'tray', i } }));
  for (let t = cap - 1; t >= 1; t--) {
    const pair = bench.filter((x) => x.p.t === t).slice(0, 2);
    if (pair.length === 2 && TIER_STAT[Math.min(t + 1, cap)] > have + 1e-9) {
      return { kind: 'merge', family, tier: t + 1, cells: pair.map((x) => x.at), text: `Merge your two T${t} ${FAMILIES[family].plural} (${describeCell(s, pair[0].at)} and ${describeCell(s, pair[1].at)}) into a T${t + 1} ${name}` };
    }
  }
  const tier = Math.min(cap, orderMaxTier(s));
  if (TIER_STAT[tier] > have + 1e-9 && PART_ORDER_PRICE[tier]) {
    return { kind: 'order', family, tier, cash: PART_ORDER_PRICE[tier], scrap: scrapOrderCost(tier), text: `Order a T${tier} ${name} in the Workshop: $${PART_ORDER_PRICE[tier]} or ${scrapOrderCost(tier)} scrap` };
  }
  return { kind: 'max', text: current && current.t >= cap ? `T${cap} is the most this ${partCapWord(cap, car)} runs` : `No better ${name} to buy yet` };
}
const partCapWord = (cap: number, car: CarId) => (cap < carById(car).cap ? 'race' : 'car');

/** For tests: every part id owned (bench, rack, every car) — the Pit Setup never creates or duplicates one. */
export const ownedPartIds = (s: GameState) => [
  ...allParts(s).map((p) => p.id),
  ...Object.values(s.installed ?? {}).flatMap((sl) => Object.values(sl ?? {}).filter(Boolean).map((p) => (p as Part).id)),
];
