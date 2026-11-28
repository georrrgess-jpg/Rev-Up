import { allParts, canFuse, freeSlots, hasAnyPair, orderMaxTier, orderPrice } from './board';
import { fitted, recommendedFit } from './install';
import { computeLoadout, loadoutWith } from './loadout';
import { goalStatus, mergeAllUnlocked, upgradeCost, upgradeLock, upgradeShown } from './progression';
import { RaceSim, runRace, type RaceSetup } from './race';
import { mph } from './units';
import { ACTIVE_FAMILIES, FAMILIES, Family, TUNE_STAGES, UPGRADES, UpgradeId, carById, eventById, tunePrice, type CarId } from '../data/tables';
import type { GameState, Part } from './state';

type RacerStats = RaceSetup['player']['stats'];

/**
 * Teach-through-play steps, derived purely from game state so finishing actions out of order or reloading
 * mid-step is always safe. Returns the one step to coach now, or null.
 *
 * The first session, in order (each beat resolves itself by play; "Got it" ends the ones that only explain):
 *   goal      — the next car and why you want it (Got it, or any merge)
 *   merge     — merge one matching pair (teaches tiers: two T1s make a T2)
 *   fit       — parts don't fit themselves: fit the new part to your car (ends when the car has a part fitted)
 *   race1     — one race
 *   spend     — use the payout in the Shop (ends on the first purchase, or Got it)
 *   goalCard  — the exact remaining requirements for the next car (Got it)
 * Then contextual tips, each shown once when first met: craftGoal, betterPart, nitroBank, overflow (spare rack),
 * scrap, mergeAll, cap.
 */
export type TutorialStep =
  | 'goal' | 'merge' | 'fit' | 'race1' | 'spend' | 'goalCard'
  | 'craftGoal' | 'betterPart' | 'nitroBank' | 'overflow' | 'scrap' | 'mergeAll' | 'cap'
  /** @deprecated kept so older callers compile; the Shop beat is now 'spend'. */
  | 'shop';

/** Beginner beats: a returning save never sees these. */
export const BEGINNER_STEPS = ['goal', 'fit', 'spend', 'goalCard', 'craftGoal', 'shop'] as const;

export function hasPairOf(s: GameState, family?: string): boolean {
  const parts = allParts(s);
  for (let a = 0; a < parts.length; a++) for (let b = a + 1; b < parts.length; b++) {
    if ((!family || parts[a].f === family) && canFuse(parts[a], parts[b])) return true;
  }
  return false;
}

/** Nothing fitted on the active car yet, and a part on the bench that could go on. */
export function hasEmptyCar(s: GameState): boolean {
  const slots = fitted(s, s.activeCar);
  return ACTIVE_FAMILIES.every((f) => !slots[f]) && allParts(s).some((p) => ACTIVE_FAMILIES.includes(p.f));
}

/** A part on the bench (not on another car) would make the active car faster. */
export function benchUpgradeWaiting(s: GameState): boolean {
  const rec = recommendedFit(s, s.activeCar);
  return Object.values(rec).some((src) => !!src && 'at' in src);
}

// ---------------- Redline first session (1.10): one test run, step by step ----------------
//
// merge → fit → race (shift, then nitro, coached on the track) → result (what the new part measurably did, the next
// car and the one thing to do) → craft (merge toward the next car's part) → done.
// Each step is derived from play, so finishing out of order or reloading mid-step is safe; `s.onboard.step` records
// the step last shown (resume, analytics) and `skipped` / `done` end the sequence. Saves that already raced or own a
// second car never enter it.

export type OnboardStep = 'merge' | 'fit' | 'race' | 'craft';

/** The first session is running (a fresh save that has not finished or skipped it). */
export function onboardActive(s: GameState): boolean {
  const o = s.onboard;
  return !!o && !o.done && !o.skipped && !s.tips.skipGuide;
}

/** Something on the bench could go in an empty slot of the active car. */
function fittable(s: GameState): boolean {
  const slots = fitted(s, s.activeCar);
  return allParts(s).some((p) => ACTIVE_FAMILIES.includes(p.f) && !slots[p.f]);
}

/** The step to coach now, or null when the sequence is over (or not running). */
export function onboardStep(s: GameState): OnboardStep | null {
  if (!onboardActive(s)) return null;
  const raced = s.stats.races > 0 || !!s.pendingQuick;
  if (!raced) {
    if (!s.stats.milestones.firstMerge && hasPairOf(s)) return 'merge';
    const slots = fitted(s, s.activeCar);
    if (!ACTIVE_FAMILIES.some((f) => slots[f]) && fittable(s)) return 'fit';
    return 'race';
  }
  const g = goalStatus(s);
  if (g && !g.keystoneDone && s.owned.length === 1) return 'craft';
  return null;
}

/** The part the fit step teaches: the best bench part for an empty slot (the merged Engine on a fresh save). */
export function onboardFitPart(s: GameState): Part | null {
  const slots = fitted(s, s.activeCar);
  const parts = allParts(s).filter((p) => ACTIVE_FAMILIES.includes(p.f) && !slots[p.f]);
  return parts.sort((a, b) => b.t - a.t || (a.f === 'engine' ? -1 : b.f === 'engine' ? 1 : 0))[0] ?? null;
}

const STAT_OF: Record<string, { label: string; key: 'top' | 'grip' | 'accel'; meaning: string }> = {
  engine: { label: 'Top speed', key: 'top', meaning: 'faster on the straights' },
  tires: { label: 'Grip', key: 'grip', meaning: 'quicker through bends and off the line' },
  turbo: { label: 'Acceleration', key: 'accel', meaning: 'quicker off the line' },
};

/** What fitting `part` to `car` changes, in the family's own stat: "Top speed 49 → 55 mph · faster on the straights". */
export function fitChange(s: GameState, car: CarId, part: Part): { label: string; from: string; to: string; meaning: string; up: boolean; short: string } | null {
  const st = STAT_OF[part.f];
  if (!st) return null;
  const a = computeLoadout(s, car).stats;
  const b = loadoutWith(s, car, { [part.f]: part }).stats;
  const fmt = (v: number) => st.key === 'top' ? `${mph(v)} mph` : st.key === 'grip' ? v.toFixed(2) : v.toFixed(1);
  const from = fmt(a[st.key]), to = fmt(b[st.key]);
  if (from === to) return null;
  const short = st.key === 'top' ? to : `${st.key === 'grip' ? 'grip' : 'accel'} ${to}`;
  // "65 → 71 mph": the unit once, after the new value
  return { label: st.label, from: st.key === 'top' ? String(mph(a.top)) : from, to, meaning: st.meaning, up: b[st.key] > a[st.key], short };
}

/** "Top speed 49 → 55 mph" for a part that was just fitted, from the stats before and after. */
export function statLine(f: Family, a: { top: number; grip: number; accel: number }, b: { top: number; grip: number; accel: number }): string | null {
  const st = STAT_OF[f];
  if (!st) return null;
  const fmt = (v: number) => st.key === 'top' ? `${mph(v)} mph` : st.key === 'grip' ? v.toFixed(2) : v.toFixed(1);
  const from = fmt(a[st.key]), to = fmt(b[st.key]);
  return from === to ? null : `${st.label} ${st.key === 'top' ? mph(a.top) : from} → ${to}`;
}

/** Where on a course a time difference came from. */
export type Where = 'off the line' | 'on the straights' | 'through the bends';

/**
 * What each fitted part did on this exact race, measured in the simulation: the same event, seed and rivals, clean
 * shifts and Perfect boosts, with the part and without it. Returns the parts that made a difference, biggest first,
 * with where on the course most of the time came from.
 */
export function measureParts(s: GameState, setup: RaceSetup): { part: Part; seconds: number; where: Where; whereS: number }[] {
  const car = setup.player.car;
  const slots = fitted(s, car);
  const ev = eventById(setup.eventId);
  const cap = ev.partCap ?? (ev.heatOf ? eventById(ev.heatOf).partCap : undefined);
  const run = (stats: RacerStats) => {
    const out = runRace({ ...setup, player: { ...setup.player, stats }, analysis: false }, 'perfect', 'clean');
    const me = out.standings.find((r) => r.isPlayer)!;
    return { time: out.playerTime ?? Infinity, splits: me.splits };
  };
  let track;
  try { track = new RaceSim({ ...setup, analysis: false }).track; } catch { return []; }
  const base = run(computeLoadout(s, car, undefined, cap).stats);
  const out: { part: Part; seconds: number; where: Where; whereS: number }[] = [];
  for (const f of ACTIVE_FAMILIES) {
    const p = slots[f];
    if (!p) continue;
    const without = run(loadoutWith(s, car, { [f]: null }, cap).stats);
    const seconds = without.time - base.time;
    if (!(seconds >= 0.05) || !Number.isFinite(seconds)) continue;
    // per-segment gain, grouped by kind of segment
    const by: Record<Where, number> = { 'off the line': 0, 'on the straights': 0, 'through the bends': 0 };
    let prevA = 0, prevB = 0;
    track.segments.forEach((sg, i) => {
      const a = base.splits[i], b = without.splits[i];
      if (a === undefined || b === undefined) return;
      const gain = (b - prevB) - (a - prevA);
      prevA = a; prevB = b;
      const k: Where = i === 0 ? 'off the line' : sg.radius ? 'through the bends' : 'on the straights';
      by[k] += gain;
    });
    const best = (Object.entries(by) as [Where, number][]).sort((x, y) => y[1] - x[1])[0];
    out.push({ part: p, seconds, where: best[0], whereS: best[1] });
  }
  return out.sort((a, b) => b.seconds - a.seconds);
}

/**
 * The part a player needs for the goal and cannot make from what they hold: one free crate of the family, at the tier
 * that closes the gap without overshooting, offered once during the first session (the guaranteed route past an
 * unlucky or emptied bench). Null when the bench can already make it.
 */
export function rescueCrate(s: GameState): { family: Family; tier: number } | null {
  if (s.tips['fr:rescue']) return null;
  const g = goalStatus(s);
  if (!g || g.keystoneDone) return null;
  const { have, need } = ingredients(s, g.family, g.tier);
  if (have >= need) return null;
  let t = g.tier - 1;
  while (t > 1 && 2 ** (t - 1) > need - have) t--;
  return { family: g.family, tier: t };
}

/** The guided sequence is over: record it (once). */
export function finishOnboard(s: GameState, now: number, skipped = false) {
  if (!s.onboard || s.onboard.done || (skipped && s.onboard.skipped)) return;
  s.onboard = { ...s.onboard, step: 'done', done: true, ...(skipped ? { skipped: true } : {}), at: now };
}

export function tutorialStep(s: GameState): TutorialStep | null {
  if (s.tips.skipGuide) return null;
  const ob = onboardStep(s);
  if (ob) return ob === 'race' ? 'race1' : ob === 'craft' ? 'craftGoal' : ob;
  if (onboardActive(s)) return null; // finishing: the UI records it this frame
  const raced = s.stats.races > 0 || !!s.pendingQuick;
  // just in time, one line each: cash once it buys something useful
  if (raced && !s.tips.spend && !(s.stats.spent ?? 0) && bestBuy(s).affordable) return 'spend';
  if (!s.tips.betterPart && s.stats.milestones.firstMerge && benchUpgradeWaiting(s)) return 'betterPart';
  if (s.nitro > 0 && !s.tips.nitroBank) return 'nitroBank';
  if (s.tray.some(Boolean) && !s.tips.overflow) return 'overflow';
  if (freeSlots(s) === 0 && !s.tips.scrap) return 'scrap';
  if (mergeAllUnlocked(s) && hasAnyPair(s) && !s.tips.mergeAll) return 'mergeAll';
  if (Object.keys(computeLoadout(s).blocked).length && !s.tips.cap) return 'cap';
  return null;
}

// ---------------- Best buy (the Shop's recommendation, and whether the 'spend' beat has anything to teach) ----

/** Ingredients toward a crafted tier, in T1 units: 2^(t-1) per bench part below the target tier. */
export function ingredients(s: GameState, f: Family, tier: number): { have: number; need: number } {
  const have = allParts(s).filter((p) => p.f === f && p.t < tier).reduce((n, p) => n + 2 ** (p.t - 1), 0);
  return { have, need: 2 ** (tier - 1) };
}

export type BuyPick =
  | { kind: 'order'; fam: Family; tier: number; price: number; title: string; why: string }
  | { kind: 'tune'; price: number; title: string; why: string }
  | { kind: 'upgrade'; id: UpgradeId; price: number; title: string; why: string };

/** The one purchase that helps most now — goal ingredients, then a part that makes the active car faster, then a
 *  tune-up, then garage upgrades — affordable first; otherwise the cheapest of them to save up for. */
export function bestBuy(s: GameState): { pick: BuyPick | null; affordable: boolean } {
  const g = goalStatus(s);
  const maxT = orderMaxTier(s);
  const car = carById(s.activeCar);
  const options: BuyPick[] = [];
  if (g && !g.keystoneDone) {
    const fam = FAMILIES[g.family];
    const { have, need } = ingredients(s, g.family, g.tier);
    if (have < need) for (let t = Math.min(maxT, g.tier - 1); t >= 1; t--) {
      const add = 2 ** (t - 1);
      if (add > need - have && t > 1) continue; // never overshoot: buy what closes the gap
      options.push({
        kind: 'order', fam: g.family, tier: t, price: orderPrice(s, t), title: `T${t} ${fam.name}`,
        why: `Toward the T${g.tier} ${fam.name} the ${g.car.model} needs: ingredients ${have}/${need} → ${Math.min(need, have + add)}/${need}. You still merge it yourself.`,
      });
    }
  }
  // a part that makes the car you race faster: above what is fitted and on the bench, within the car's limit
  const slots = fitted(s, s.activeCar);
  const parts: BuyPick[] = [];
  for (const f of ACTIVE_FAMILIES) {
    if (g && !g.keystoneDone && f === g.family && ingredients(s, f, g.tier).have >= ingredients(s, f, g.tier).need) continue; // merge them up instead
    const held = Math.max(slots[f]?.t ?? 0, ...allParts(s).filter((p) => p.f === f).map((p) => p.t));
    for (let t = Math.min(car.cap, maxT); t > held; t--) {
      parts.push({ kind: 'order', fam: f, tier: t, price: orderPrice(s, t), title: `T${t} ${FAMILIES[f].name}`,
        why: `Fit it to your ${car.model} for more ${FAMILIES[f].statLabel.toLowerCase()} (yours: ${slots[f] ? `T${slots[f]!.t}` : 'empty slot'}).` });
    }
  }
  options.push(...parts.sort((a, b) => (a.kind === 'order' && b.kind === 'order' ? b.tier - a.tier : 0)));
  const stage = s.tune?.[s.activeCar] ?? 0;
  if (stage < TUNE_STAGES) options.push({ kind: 'tune', price: tunePrice(s.activeCar, stage), title: `Tune-up stage ${stage + 1}`, why: `+2% speed, acceleration and grip for your ${car.model}.` });
  for (const u of UPGRADES) {
    if (!upgradeShown(s, u) || upgradeLock(s, u.id)) continue;
    const next = u.levels[s.upgrades[u.id] ?? 0];
    const cost = upgradeCost(s, u.id);
    if (next && cost !== null) options.push({ kind: 'upgrade', id: u.id, price: cost, title: u.name, why: next.label });
  }
  const can = options.find((o) => o.price <= s.cash);
  if (can) return { pick: can, affordable: true };
  return { pick: options.slice().sort((a, b) => a.price - b.price)[0] ?? null, affordable: false };
}

/** Tips that only make sense to a brand-new player: a returning save marks them done on load. The first-session
 *  sequence starts only for a save that has never raced and owns one car; any other save is recorded as done. */
export function settleTutorialForExistingSave(s: GameState) {
  if (s.stats.races >= 3 || s.owned.length > 1) {
    for (const id of BEGINNER_STEPS) s.tips[id] = true;
  }
  const o = s.onboard as unknown;
  if (o !== undefined && (!o || typeof o !== 'object' || typeof (o as { step?: unknown }).step !== 'string')) delete s.onboard; // malformed
  if (!s.onboard) {
    const old = s.stats.races > 0 || s.owned.length > 1 || !!s.pendingQuick;
    s.onboard = old || s.tips.skipGuide ? { step: 'done', done: true } : { step: 'merge' };
  }
}
