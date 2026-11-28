// 1.9 Next Goal: what to chase, why, what it pays, what is still missing, and the one action that moves it forward.
// Pure data for the UI (the Garage goal card, the Race menu, the Shop, results and the Showroom render it).
//
// Shapes
//   Goal = {
//     key: string            // a car id ('proto'), or 'challenge:<eventId>' (an unbeaten rival / trophy / medal)
//     kind: 'car' | 'challenge'
//     title: string          // "Halcyon X" / "Grand Riviera"
//     car?: CarId
//     why: string            // why it is worth chasing: how the car drives, what it opens (before you invest)
//     reward: string         // what reaching it gives, in plain words with numbers
//     missing: string        // the requirement(s) still missing, one line ("" when ready)
//     progress: number       // 0..1, the same measure as the goal card bar
//     stages: { label: string; done: boolean; reward: string }[]  // unlock stages (each pays once), then the car
//     sessionMilestone: string // the next thing you can reach this session ("Reach 11,150 Rep → a T7 Turbo")
//     action: GoalAction     // the quickest useful step now
//     alt?: GoalAction       // a different useful step when the main route stalls (a race lost twice, an order
//                            // you can't afford yet)
//     recommended: boolean   // the goal the game picks when you have not picked one
//   }
//   GoalAction = { label: string } & (
//       { kind: 'race'; eventId: string }          // open Pit Setup on this event (switch car if it needs one)
//     | { kind: 'craft'; family: Family; tier: number }   // merge your way to this tier (the ingredients are held)
//     | { kind: 'order'; family: Family; tier: number; currency: 'cash' | 'scrap' }  // Shop order, exact price in label
//     | { kind: 'workshop'; area: 'engine' | 'wheels' | 'body' | 'tuning' }       // Mechanic Shop area
//     | { kind: 'merge' }                          // a pair is waiting on the bench
//     | { kind: 'shelf' }                          // the Parts Shelf (trade surplus toward the ingredient)
//     | { kind: 'upgrade'; id: UpgradeId })        // the Shop's Garage tab on this upgrade
//
// API
//   goalOptions(s): Goal[]        every sensible target: each car you can chase now (two at a branch), and a challenge
//   currentGoal(s): Goal | null   s.goalPick when it is still an option, else the recommendation
//   hintFor(s, screen): { text, action? }  a line per screen, so the Garage, Race menu, Shop, results and Showroom
//                                 don't repeat the same sentence
//   Game.pickGoal(key | null)     set or clear the pick (a key from goalOptions)
import {
  CarClass, CarId, DISTRICTS, EVENTS, FAMILIES, Family, RIVALS, SIGNATURE_FINISHES, TUNE_STAGES, UPGRADES, UpgradeId,
  carById, eventById, scrapOrderCost, tunePrice,
} from '../data/tables';
import { allParts, canFuse, craftedTier, orderMaxTier, orderPrice } from './board';
import {
  chaseableCars, collection, eventUnlocked, goalStatus, recommendedCar, recommendedEvent, stageViews, unlockEventDone, unlockEventText,
  upgradeCost, upgradeLock,
} from './progression';
import { autoTradePick } from './shelf';
import { prizeText, redlineView } from './rivalRuns';
import type { GameState } from './state';

export type GoalAction = { label: string } & (
  | { kind: 'race'; eventId: string }
  | { kind: 'craft'; family: Family; tier: number }
  | { kind: 'order'; family: Family; tier: number; currency: 'cash' | 'scrap' }
  | { kind: 'workshop'; area: 'engine' | 'wheels' | 'body' | 'tuning' }
  | { kind: 'merge' }
  | { kind: 'shelf' }
  | { kind: 'upgrade'; id: UpgradeId }
  /** 1.10: a Redline Series step (open its brief in the Race menu: car choice, rule, prize). */
  | { kind: 'run'; runId: string });

export interface GoalStage { label: string; done: boolean; reward: string }
export interface Goal {
  key: string;
  kind: 'car' | 'challenge' | 'series';
  title: string;
  car?: CarId;
  why: string;
  reward: string;
  missing: string;
  progress: number;
  stages: GoalStage[];
  sessionMilestone: string;
  action: GoalAction;
  alt?: GoalAction;
  recommended: boolean;
}

const usd = (x: number) => `$${x.toLocaleString('en-US')}`;
const the = (n: string) => (n.startsWith('The ') ? n : `the ${n}`);

/** Lost at least twice and never won: the route has stalled. */
const stalled = (s: GameState, eventId: string) => {
  const r = s.events[eventId];
  return !!r && r.wins === 0 && r.starts >= 2;
};

/** A useful step that is not the main route: a Tune-up, an affordable part for the car you drive, a Garage upgrade. */
function altAction(s: GameState, main: GoalAction): GoalAction | undefined {
  const car = carById(s.activeCar);
  const st = s.tune?.[s.activeCar] ?? 0;
  if (main.kind !== 'workshop' && st < TUNE_STAGES && s.cash >= tunePrice(s.activeCar, st))
    return { kind: 'workshop', area: 'tuning', label: `Tune-up your ${car.model}: +2% speed, acceleration and grip for ${usd(tunePrice(s.activeCar, st))}` };
  const g = goalStatus(s);
  if (g && !g.keystoneDone && main.kind !== 'shelf') {
    const t = Math.max(1, Math.min(orderMaxTier(s), g.tier - 1));
    if (autoTradePick(s, g.family, t)) return { kind: 'shelf', label: `Trade shelf surplus for a T${t} ${FAMILIES[g.family].name}` };
  }
  for (const u of UPGRADES) {
    const c = upgradeCost(s, u.id);
    if (c !== null && !upgradeLock(s, u.id) && s.cash >= c && main.kind !== 'upgrade') return { kind: 'upgrade', id: u.id, label: `${u.name}: ${u.levels[s.upgrades[u.id] ?? 0].label} (${usd(c)})` };
  }
  if (main.kind !== 'race') {
    const e = recommendedEvent(s);
    return { kind: 'race', eventId: e.id, label: `Race ${e.name} for cash and Rep` };
  }
  return undefined;
}

/** The quickest useful step toward a car: a held merge, an affordable order, the race it needs, or Rep. */
function carAction(s: GameState, c: CarClass): GoalAction {
  const u = c.unlock!;
  const fam = FAMILIES[u.family];
  const keyDone = craftedTier(s, u.family) >= u.tier;
  const bench = allParts(s).filter((p) => p.f === u.family && p.t < u.tier);
  if (!keyDone) {
    const units = bench.reduce((a, p) => a + 2 ** (p.t - 1), 0);
    const pair = bench.some((a) => bench.some((b) => canFuse(a, b)));
    if (units >= 2 ** (u.tier - 1) || pair) return { kind: pair ? 'merge' : 'craft', family: u.family, tier: u.tier, label: pair ? `Merge your ${fam.plural} toward the T${u.tier}` : `Merge up to the T${u.tier} ${fam.name}: you hold enough` } as GoalAction;
    const t = Math.max(1, Math.min(orderMaxTier(s), u.tier - 1));
    const held = bench.filter((p) => p.t === t).length;
    if (held < 2) {
      const price = orderPrice(s, t);
      if (s.cash >= price) return { kind: 'order', family: u.family, tier: t, currency: 'cash', label: `Order a T${t} ${fam.name} for ${usd(price)}: two make the T${t + 1}` };
      if (s.scrap >= scrapOrderCost(t)) return { kind: 'order', family: u.family, tier: t, currency: 'scrap', label: `Order a T${t} ${fam.name} for ${scrapOrderCost(t)} scrap` };
      if (autoTradePick(s, u.family, t)) return { kind: 'shelf', label: `Trade shelf surplus for a T${t} ${fam.name}` };
    }
  }
  if (u.event && !unlockEventDone(s, u.event)) {
    const e = eventById(u.event);
    const un = eventUnlocked(s, e);
    if (un.ok || un.switchCar) return { kind: 'race', eventId: e.id, label: `${unlockEventText(s, e.id)}${e.boss ? ` — beat ${RIVALS[e.boss.rival].name}` : ''}` };
    const pre = e.requires.afterWin ? eventById(e.requires.afterWin) : null;
    if (pre && eventUnlocked(s, pre).ok) return { kind: 'race', eventId: pre.id, label: `Win ${the(pre.name)} to open ${the(e.name)}` };
  }
  const e = recommendedEvent(s);
  if (s.rep < u.rep) return { kind: 'race', eventId: e.id, label: `Race ${e.name}: ${(u.rep - s.rep).toLocaleString('en-US')} more Rep` };
  if (!keyDone) {
    const t = Math.max(1, Math.min(orderMaxTier(s), u.tier - 1));
    return { kind: 'race', eventId: e.id, label: `Race ${e.name} for cash toward a T${t} ${fam.name} (${usd(orderPrice(s, t))})` };
  }
  return { kind: 'race', eventId: e.id, label: `Race ${e.name}` };
}

function carWhy(s: GameState, c: CarClass): string {
  const best = Math.max(...s.owned.map((id) => carById(id).cap));
  const opens = EVENTS.filter((e) => !e.heatOf && e.requires.car === c.id).map((e) => e.name);
  return [c.handling ?? c.blurb, c.cap > best ? `Runs T${c.cap} parts at full strength (your best car stops at T${best}).` : '',
    opens.length ? `Opens ${opens.join(', ')}.` : ''].filter(Boolean).join(' ');
}

function carGoal(s: GameState, c: CarClass, rec: boolean): Goal {
  const g = goalStatus(s, c)!;
  const sv = stageViews(s, c);
  const sig = SIGNATURE_FINISHES[c.id];
  const missing = g.line.endsWith('is ready') ? '' : g.line.replace(/ to unlock the .*$/, '');
  const stages: GoalStage[] = [...sv.map((v) => ({ label: v.label, done: v.done, reward: v.reward })),
    { label: `Unlock the ${c.model}`, done: false, reward: `The ${c.model}${sig ? ` and a shot at its ${sig.name} finish` : ''}` }];
  const next = sv.find((v) => !v.done);
  const action = carAction(s, c);
  const raceStalled = action.kind === 'race' && stalled(s, action.eventId);
  const short = action.kind === 'race' && /for cash toward/.test(action.label);
  return {
    key: c.id, kind: 'car', title: c.model, car: c.id, why: carWhy(s, c),
    reward: `The ${c.model} (${c.name}, ${DISTRICTS[c.district]?.name ?? c.district}): T${c.cap} parts${sv.length ? ` · ${sv.length} stage payouts on the way` : ''}`,
    missing, progress: g.progress, stages,
    sessionMilestone: next ? `${next.label} → ${next.reward}` : missing ? `${missing} → the ${c.model}` : `The ${c.model} is ready`,
    action, ...(raceStalled || short || action.kind === 'order' ? { alt: altAction(s, action) } : {}), recommended: rec,
  };
}

/** A challenge beside the cars: the last unbeaten rival, else the next trophy, medal or star. */
function challengeGoal(s: GameState): Goal | null {
  const boss = EVENTS.find((e) => e.boss && !e.heatOf && !s.bosses.includes(e.boss.rival) && (eventUnlocked(s, e).ok || !!eventUnlocked(s, e).switchCar));
  if (boss) {
    const r = boss.boss!.reward;
    const who = RIVALS[boss.boss!.rival].name;
    const action: GoalAction = { kind: 'race', eventId: boss.id, label: `Beat ${who} in ${boss.name}` };
    return {
      key: `challenge:${boss.id}`, kind: 'challenge', title: boss.name, why: boss.blurb,
      reward: `${usd(r.cash)}, ${r.crates} crates, the ${r.blueprint} paint and the ${r.badge} badge`,
      missing: `Beat ${who}`, progress: 0, stages: [{ label: `Beat ${who}`, done: false, reward: `${usd(r.cash)} and ${r.crates} crates` }],
      sessionMilestone: `Beat ${who} → ${usd(r.cash)}`, action, ...(stalled(s, boss.id) ? { alt: altAction(s, action) } : {}), recommended: false,
    };
  }
  const c = collection(s);
  if (c.have >= c.total) return null;
  const ev = EVENTS.find((e) => !e.heatOf && eventUnlocked(s, e).ok && ((e.trophy && !s.badges.includes(e.trophy)) || ((e.timeAttack || e.speedTrap) && (s.medals?.[e.id] ?? 0) < 3)))
    ?? EVENTS.find((e) => !e.heatOf && eventUnlocked(s, e).ok && e.goals && (s.stars?.[e.id] ?? 0) !== 7);
  if (!ev) return null;
  const m = s.medals?.[ev.id] ?? 0;
  const what = ev.trophy && !s.badges.includes(ev.trophy) ? `Win the ${ev.trophy} trophy at ${ev.name}`
    : ev.timeAttack || ev.speedTrap ? `${['Bronze', 'Silver', 'Gold'][Math.min(2, m)]} at ${ev.name}` : `Goals left on ${ev.name}`;
  const action: GoalAction = { kind: 'race', eventId: ev.id, label: what };
  return { key: `challenge:${ev.id}`, kind: 'challenge', title: ev.name, why: ev.blurb, reward: 'Collection: trophies, medals and goal stars (each pays once)', missing: what,
    progress: c.total ? c.have / c.total : 0, stages: [{ label: what, done: false, reward: 'Cash and crates, once' }], sessionMilestone: what, action, recommended: false };
}

/** 1.10 Redline Series: the chain as a goal (open and not finished): the reward car, the steps, the next step. */
function seriesGoal(s: GameState): Goal | null {
  const v = redlineView(s);
  if (!v.open || v.reward.owned || !v.next) return null;
  const n = v.next;
  return {
    key: 'series:redline', kind: 'series', title: v.name, car: v.car,
    why: `Five steps, each a different skill or build choice, each with a prize you can use at once. ${v.reward.role}`,
    reward: `The ${v.reward.model} (T${v.reward.cap}), an earned car you can't buy`,
    missing: `Step ${n.series!.step} of ${v.of}: ${n.goal}`, progress: v.done / v.of,
    stages: [...v.steps.map((x) => ({ label: `${x.step}. ${x.run.name}`, done: x.done, reward: x.prize }))],
    sessionMilestone: `${n.name} → ${prizeText(n.prize)}`,
    action: { kind: 'run', runId: n.id, label: `Redline ${n.series!.step}/${v.of} · ${n.name}: ${n.goal}` },
    recommended: false,
  };
}

/** Every sensible target now: each car you can chase (two at a branch), the Redline Series, and one challenge. */
export function goalOptions(s: GameState): Goal[] {
  const rec = recommendedCar(s);
  const cars = chaseableCars(s).map((c) => carGoal(s, c, c.id === rec?.id));
  const series = seriesGoal(s);
  const ch = challengeGoal(s);
  if (series && !cars.length) series.recommended = true;
  else if (ch && !cars.length) ch.recommended = true;
  return [...cars, ...(series ? [series] : []), ...(ch ? [ch] : [])];
}

/** The goal in force: the player's pick while it is still an option, else the recommendation. */
export function currentGoal(s: GameState): Goal | null {
  const opts = goalOptions(s);
  return opts.find((g) => g.key === s.goalPick) ?? opts.find((g) => g.recommended) ?? opts[0] ?? null;
}

export type HintScreen = 'garage' | 'race' | 'shop' | 'results' | 'showroom';
/** One line per screen from the same goal, so screens don't repeat each other: the Garage says what to do at the
 *  bench, the Race menu which race, the Shop what to buy, results what you can still reach this session, and the
 *  Showroom why the car is worth it. */
export function hintFor(s: GameState, screen: HintScreen): { text: string; action?: GoalAction } {
  const g = currentGoal(s);
  if (!g) return { text: 'Every goal met. Chase your records and dress your cars.' };
  const a = g.action;
  const alt = g.alt;
  switch (screen) {
    case 'garage': {
      const bench = a.kind === 'race' && alt && alt.kind !== 'race' ? alt : a;
      return { text: `${g.title}: ${bench.label}`, action: bench };
    }
    case 'race': {
      const race = a.kind === 'race' ? a : alt?.kind === 'race' ? alt : { kind: 'race' as const, eventId: recommendedEvent(s).id, label: `Race ${recommendedEvent(s).name}` };
      return { text: g.missing ? `${race.label} · still needed: ${g.missing}` : race.label, action: race };
    }
    case 'shop': {
      const buy = ['order', 'upgrade', 'workshop', 'shelf'].includes(a.kind) ? a : alt && ['order', 'upgrade', 'workshop', 'shelf'].includes(alt.kind) ? alt : undefined;
      return buy ? { text: buy.label, action: buy } : { text: `Saving for ${g.title}: ${g.missing || 'ready'}` };
    }
    case 'results': return { text: `Next this session: ${g.sessionMilestone}`, action: a };
    case 'showroom': return { text: `${g.title} — ${g.why}`, action: a };
  }
}

/** Is `key` something the player may pick now (a chaseable car or the current challenge)? */
export const canPickGoal = (s: GameState, key: string) => goalOptions(s).some((g) => g.key === key);
