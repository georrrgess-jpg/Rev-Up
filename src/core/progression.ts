import {
  ACTIVE_FAMILIES, ACTIVE_IDLE_CUTOFF_MS, CATCHUP_EFFORT_THRESHOLD, CarClass, CarId, ENABLED_CARS, EVENTS, FAMILIES, Family,
  MAX_TIER, MERGE_ALL_UNLOCK_ACTIVE_S, MERGE_ALL_UNLOCK_RACES, OFFLINE_MIN_S, PRECISION_BONUS_PER_PERFECT,
  PRINTER_INTERVAL_S, RACE_EFFORT, roundCash, floorCash, STYLE_ITEMS, DistrictId, MEDALS, MEDAL_REWARDS, CREW_NITRO, FRESH_ROUTE_AFTER_RACES, FRESH_ROUTE_BONUS, RaceEvent, SIGNATURE_FINISHES, UPGRADES, carById, eventById, UpgradeId, QUICK_PAY_SHARE, PERFECT_BONUS_SHARE, RIVALS, OFFLINE_HOURS, OFFLINE_BUDGET_RACES, SCRAP_VALUE, UpgradeDef, CRATE_TIER_ODDS, nitroCapFor, TUNE_STAGES, tunePrice,
  STAGE_LINKS, SHELF_SLOTS, ORDER_DISCOUNT, TRADE_RATE, POLISHED_ORDER_MUL, AUTO_SHELF_RANK, SHELF_SORT_RANK, BATCH_MERGE_RANK,
  CHAIN_BENCH_RANK, POLISHED_ORDER_RANK } from '../data/tables';
import { allParts, craftedTier, expandBoard, openCrates } from './board';
import { fillEmptyFromBench, fitRecommended, fitted } from './install';
import type { GameEvent } from './events';
import { computeLoadout, contributionOn } from './loadout';
import type { CarMastery, EventRecord, GameState, LastResult, LeanOutcome, Part } from './state';
import { mph } from './units';

export const PRINTER_BANK_CAP = 10; // printer pauses with this many unopened printer crates

// ---------------- Difficulty ----------------

/** Districts where rivals shift clean (the reference acceleration): from the Coastal Crown onward. */
const CLEAN_RIVALS: DistrictId[] = ['coastal', 'downtown', 'desert', 'summit', 'riviera'];
/** How well an event's rivals shift: 'ordinary' (a beat late) early on, 'clean' from the Coastal Crown onward.
 *  The race setup passes this as `RaceSetup.rivalShift`; a knockout heat uses its parent's. */
export function rivalShiftFor(e: RaceEvent): 'ordinary' | 'clean' {
  const parent = e.heatOf ? eventById(e.heatOf) : e;
  return e.rivalShift ?? parent.rivalShift ?? (CLEAN_RIVALS.includes(parent.district) ? 'clean' : 'ordinary');
}

// ---------------- Goals ----------------

/** Stars earned on Downtown Nights event goals (win · under par · a Perfect boost). */
export function starsIn(s: GameState, district: string = 'downtown'): number {
  return EVENTS.filter((e) => e.goals && e.district === district).reduce((n, e) => n + bitCount(s.stars?.[e.id] ?? 0), 0)
    + trapStars(s, district);
}
/** 1.10: a second road to Downtown stars that suits a top-speed build instead of a race win: each medal on the
 *  district's speed trap (the Bridge Speed Trap: bronze, silver, gold) counts as one star. */
export function trapStars(s: GameState, district: string = 'downtown'): number {
  return EVENTS.filter((e) => e.speedTrap && e.district === district).reduce((n, e) => n + Math.min(3, s.medals?.[e.id] ?? 0), 0);
}
const bitCount = (b: number) => (b & 1) + ((b >> 1) & 1) + ((b >> 2) & 1);
export const STAR_LABELS = ['Win', 'Under par', 'A Perfect boost'];
/** Each goal pays once: half the event's win purse. */
export const starCash = (e: RaceEvent) => roundCash(e.payout.cash[0] * 0.5);

// ---------------- Car ladder (1.9: branches) ----------------

/** The car you must own before chasing `c`: its `unlock.after`, else the enabled car before it in CARS. */
export function carAfter(c: CarClass): CarId | null {
  if (!c.unlock) return null;
  if (c.unlock.after) return c.unlock.after;
  const i = ENABLED_CARS.findIndex((x) => x.id === c.id);
  return i > 0 ? ENABLED_CARS[i - 1].id : null;
}
/** A car you can work toward now: enabled, not owned, and the car before it is yours. */
export const chaseable = (s: GameState, c: CarClass) =>
  c.enabled && !!c.unlock && !s.owned.includes(c.id) && s.owned.includes(carAfter(c) as CarId);
/** Every car you can work toward now, in ladder order (two at a branch: the Ardent and the Halcyon, the Meridian and
 *  the Sovereign). An older car you skipped stays chaseable. */
export const chaseableCars = (s: GameState): CarClass[] => ENABLED_CARS.filter((c) => chaseable(s, c));

/** The car the garage is working toward: the one you picked (Next Goal), else the first chaseable car in ladder order. */
export function nextCar(s: GameState): CarClass | null {
  const list = chaseableCars(s);
  const pick = s.goalPick ? list.find((c) => c.id === s.goalPick) : undefined;
  return pick ?? recommendedCar(s) ?? ENABLED_CARS.find((c) => !s.owned.includes(c.id)) ?? null;
}
/** The car the game recommends when you have not picked one: the first chaseable car in ladder order, unless the
 *  other car at a branch is clearly closer (a quarter of the way further along). */
export function recommendedCar(s: GameState): CarClass | null {
  const list = chaseableCars(s);
  if (list.length <= 1) return list[0] ?? null;
  const pr = list.map((c) => goalStatus(s, c)?.progress ?? 0);
  let best = 0;
  for (let i = 1; i < list.length; i++) if (pr[i] >= pr[best] + 0.25) best = i;
  return list[best];
}

/** All of a car's requirements met (Rep, crafted keystone, its event, Downtown stars). */
export function carReady(s: GameState, c: CarClass): boolean {
  const u = c.unlock;
  if (!u) return false;
  return s.rep >= u.rep && craftedTier(s, u.family) >= u.tier && (!u.event || unlockEventDone(s, u.event)) && starsIn(s) >= (u.stars ?? 0);
}

/** 1.9 Persistence route: a car's unlock race also counts as done after this many live podiums there without a win
 *  (a Main Event run counts when it reaches the final). The rival's own reward still needs the win. */
export const PERSIST_PODIUMS = 3;
/** The unlock race of a car is done: won, or PERSIST_PODIUMS live podiums there. */
export const unlockEventDone = (s: GameState, eventId: string) => (s.events[eventId]?.wins ?? 0) > 0 || (s.events[eventId]?.podiums ?? 0) >= PERSIST_PODIUMS;
/** "Win X" with the persistence route spelled out when it has started. */
export function unlockEventText(s: GameState, eventId: string): string {
  const e = eventById(eventId);
  const n = s.events[eventId]?.podiums ?? 0;
  const name = e.name.startsWith('The ') ? e.name : `the ${e.name}`;
  return n > 0 ? `Win ${name} (or ${PERSIST_PODIUMS - n} more podium${PERSIST_PODIUMS - n > 1 ? 's' : ''} there)` : `Win ${name}`;
}

// ---------------- Unlock stages (1.9) ----------------
// Every car from the Vexa GTi on is unlocked in stages that each pay something you can use at once:
//   half    reach the halfway Rep -> a part toward the keystone (two tiers under it)
//   key     craft the keystone   -> a free Tune-up stage for the car you drive (cash of equal value if it is fully tuned)
//   podium  a top 3 in the car's unlock race -> scrap worth two race-day kits at that class
//   + STAGE_LINKS: a win elsewhere that hands over a big ingredient (the Ardent's track day -> a T8 Turbo for the
//     Halcyon; the Meridian's autoroute -> a T9 Engine for the Sovereign; ...)
// Paid stages are saved in `s.stagesPaid` as `${car}:${id}`; each pays once. Stages pay only while their car is
// chaseable (or in the transaction that unlocks it), so an older save is not back-paid for cars it already owns.

export type StageTest = { rep: number } | { craft: { family: Family; tier: number } } | { podium: string } | { win: string };
export interface StageReward { part?: { family: Family; tier: number }; tune?: true; scrap?: number; cash?: number }
export interface StageDef { key: string; id: string; car: CarId; label: string; test: StageTest; reward: StageReward }

const STAGES_FROM_REP = 500;
const stageCache = new Map<CarId, StageDef[]>();
/** The stages of one car's unlock, in order (empty for the first two cars). */
export function carStages(c: CarClass): StageDef[] {
  const hit = stageCache.get(c.id);
  if (hit) return hit;
  const out: StageDef[] = [];
  const u = c.unlock;
  if (u && u.rep >= STAGES_FROM_REP) {
    const prev = carAfter(c);
    const prevRep = prev ? carById(prev).unlock?.rep ?? 0 : 0;
    const half = roundRep(prevRep + (u.rep - prevRep) / 2);
    const fam = FAMILIES[u.family].name;
    const add = (id: string, label: string, test: StageTest, reward: StageReward) => out.push({ key: `${c.id}:${id}`, id, car: c.id, label, test, reward });
    add('half', `Reach ${half.toLocaleString('en-US')} Rep`, { rep: half }, { part: { family: u.family, tier: Math.max(1, u.tier - 2) } });
    add('key', `Craft a T${u.tier} ${fam}`, { craft: { family: u.family, tier: u.tier } }, { tune: true });
    if (u.event) add('podium', `A top 3 in ${eventById(u.event).name}`, { podium: u.event }, { scrap: SCRAP_VALUE[c.cap] ?? 0 });
    for (const l of STAGE_LINKS[c.id] ?? []) add(l.id, l.label, { win: l.win }, l.reward);
  }
  stageCache.set(c.id, out);
  return out;
}
const roundRep = (x: number) => (x >= 2000 ? Math.round(x / 50) * 50 : Math.round(x / 10) * 10);

export const stagePaid = (s: GameState, key: string) => (s.stagesPaid ?? []).includes(key);
export function stageMet(s: GameState, d: StageDef): boolean {
  const t = d.test;
  if ('rep' in t) return s.rep >= t.rep;
  if ('craft' in t) return craftedTier(s, t.craft.family) >= t.craft.tier;
  if ('podium' in t) return (s.events[t.podium]?.bestPlace ?? 4) <= 3 && (s.events[t.podium]?.starts ?? 0) > 0;
  return (s.events[t.win]?.wins ?? 0) > 0;
}
/** One line for a stage's payout, from the same data that pays it. */
export function stageRewardText(s: GameState, r: StageReward): string {
  const out: string[] = [];
  if (r.part) out.push(`a T${r.part.tier} ${FAMILIES[r.part.family].name}`);
  if (r.tune) {
    const car = carById(s.activeCar);
    const st = s.tune?.[s.activeCar] ?? 0;
    out.push(st < TUNE_STAGES ? `a free Tune-up stage for your ${car.model} (worth $${tunePrice(s.activeCar, st).toLocaleString('en-US')})` : `$${tunePrice(s.activeCar, TUNE_STAGES - 1).toLocaleString('en-US')} (your ${car.model} is fully tuned)`);
  }
  if (r.scrap) out.push(`${r.scrap.toLocaleString('en-US')} scrap`);
  if (r.cash) out.push(`$${r.cash.toLocaleString('en-US')}`);
  return out.join(' + ');
}
export interface StageView { key: string; label: string; done: boolean; paid: boolean; reward: string }
export function stageViews(s: GameState, c: CarClass): StageView[] {
  return carStages(c).map((d) => ({ key: d.key, label: d.label, done: stagePaid(s, d.key) || stageMet(s, d), paid: stagePaid(s, d.key), reward: stageRewardText(s, d.reward) }));
}

function payStage(s: GameState, d: StageDef, events: GameEvent[]) {
  const r = d.reward;
  events.push({ type: 'stage', car: d.car, key: d.key, label: d.label, reward: stageRewardText(s, r) }); // text before paying (it may read the tune stage)
  (s.stagesPaid ??= []).push(d.key);
  if (r.part) {
    // the bench, else the shelf when auto-shelving is on, else first in the crate queue: never lost
    s.crates.unshift({ kind: 'targeted', family: r.part.family, tier: r.part.tier, source: 'shop' });
    events.push(...openCrates(s, 1));
  }
  if (r.tune) {
    const st = s.tune?.[s.activeCar] ?? 0;
    if (st < TUNE_STAGES) (s.tune ??= {})[s.activeCar] = st + 1;
    else { const c = tunePrice(s.activeCar, TUNE_STAGES - 1); s.cash += c; s.stats.earned = (s.stats.earned ?? 0) + c; events.push({ type: 'cash', amount: c, reason: 'stage' }); }
  }
  if (r.scrap) s.scrap += r.scrap;
  if (r.cash) { s.cash += r.cash; s.stats.earned = (s.stats.earned ?? 0) + r.cash; events.push({ type: 'cash', amount: r.cash, reason: 'stage' }); }
}

/** Pay every stage met by a chaseable car (or by `extra`, a car unlocking in this transaction). Returns the keys paid. */
export function payStages(s: GameState, events: GameEvent[], extra?: CarClass): string[] {
  const paid: string[] = [];
  const cars = chaseableCars(s);
  if (extra && !cars.includes(extra)) cars.push(extra);
  for (const c of cars) for (const d of carStages(c)) {
    if (stagePaid(s, d.key) || !stageMet(s, d)) continue;
    payStage(s, d, events);
    paid.push(d.key);
  }
  return paid;
}

export interface GoalStatus {
  car: CarClass;
  repHave: number;
  repNeed: number;
  family: Family;
  tier: number;
  keystoneDone: boolean;
  bestHeld: number; // best tier of that family currently held (any quality)
  keyProgress: number; // part inventory toward the craft
  event: string | null; // a race that must be won, if any
  eventDone: boolean;
  progress: number; // 0..1
  line: string;
}

export function goalStatus(s: GameState, forCar?: CarClass): GoalStatus | null {
  const car = forCar ?? nextCar(s);
  if (!car || !car.unlock) return null;
  const u = car.unlock;
  const keystoneDone = craftedTier(s, u.family) >= u.tier;
  const ingredients = allParts(s).filter((p) => p.f === u.family);
  const bestHeld = ingredients.reduce((m, p) => Math.max(m, p.t), 0);
  const repHave = Math.min(s.rep, u.rep);
  const repFrac = u.rep > 0 ? repHave / u.rep : 1;
  // Count ingredients usable in the recipe, including lower tiers that can merge into it.
  const units = ingredients.reduce((sum, p) => sum + (p.t < u.tier ? 2 ** (p.t - 1) : 0), 0);
  const keyFrac = keystoneDone ? 1 : Math.min(1, units / 2 ** (u.tier - 1));
  const eventDone = !u.event || unlockEventDone(s, u.event);
  const starsHave = Math.min(starsIn(s), u.stars ?? 0);
  const starsDone = starsHave >= (u.stars ?? 0);
  const keyPart = keystoneDone ? 1 : Math.min(0.95, craftedTier(s, u.family) / u.tier);
  const legs = [repFrac, keyPart, ...(u.event ? [eventDone ? 1 : 0] : []), ...(u.stars ? [starsHave / u.stars] : [])];
  const progress = legs.reduce((a, b) => a + b, 0) / legs.length;
  const fam = FAMILIES[u.family];
  const parts: string[] = [];
  if (!keystoneDone) parts.push(`Craft T${u.tier} ${fam.name}`);
  if (!eventDone) parts.push(unlockEventText(s, u.event!));
  if (!starsDone) parts.push(`${u.stars! - starsHave} more star${u.stars! - starsHave > 1 ? 's' : ''}`);
  if (s.rep < u.rep) parts.push(`${u.rep - s.rep} more Rep`);
  const line = parts.length ? `${parts.join(' · ')} to unlock the ${car.model}` : `The ${car.model} is ready`;
  return { car, repHave, repNeed: u.rep, family: u.family, tier: u.tier, keystoneDone, bestHeld, keyProgress: keyFrac, progress, line, event: u.event ?? null, eventDone };
}

/** Grant any newly satisfied cars. Ownership is committed before any reveal animation. */
export function checkUnlocks(s: GameState, events: GameEvent[], stages = true) {
  for (;;) {
    if (stages) payStages(s, events);
    const car = chaseableCars(s).find((c) => carReady(s, c));
    if (!car) return;
    {
      if (stages) payStages(s, events, car); // stages met in the same transaction still pay
      s.owned.push(car.id);
      if (s.goalPick === car.id) s.goalPick = null; // the picked goal is reached: back to the recommendation
      s.activeCar = car.id;
      s.pendingReveal ??= car.id;
      s.stats.milestones[car.id] = Math.round(s.activeS);
      events.push({ type: 'unlock', car: car.id });
      // a new car arrives with your best parts fitted (bench first; another car's part only when strictly better),
      // so the unlock is an upgrade the moment it is revealed — swaps stay possible in Fit Parts
      events.push(...fitRecommended(s, car.id));
      // a car that gave up a part gets the best bench part back in that slot, so older cars stay raceable
      for (const other of s.owned) if (other !== car.id) events.push(...fillEmptyFromBench(s, other));
    }
  }
}

// ---------------- Catch-up crate ----------------

/** Add relevant effort (active seconds or eligible race completions). Offers one targeted crate per goal after a stall. */
export function addEffort(s: GameState, amount: number, events: GameEvent[]) {
  const g = goalStatus(s);
  if (!g || g.keystoneDone) return;
  if (s.catchup.goal !== g.car.id) {
    s.catchup.goal = g.car.id;
    s.catchup.effort = 0;
    s.catchup.bestTier = g.bestHeld;
  }
  if (g.bestHeld > s.catchup.bestTier) {
    s.catchup.bestTier = g.bestHeld;
    s.catchup.effort = 0; // progress made
    return;
  }
  if (s.catchup.claimed.includes(g.car.id)) return;
  s.catchup.effort += amount;
  if (s.catchup.effort >= CATCHUP_EFFORT_THRESHOLD) {
    const tier = Math.max(1, Math.min(g.bestHeld, g.tier - 1));
    s.catchup.claimed.push(g.car.id);
    s.crates.unshift({ kind: 'catchup', family: g.family, tier, source: 'catchup' });
    events.push({ type: 'catchup', family: g.family, tier });
  }
}

// ---------------- Time ----------------

/** Advance the printer and active-time counters. Only called while the game is visible. */
export function tick(s: GameState, dtS: number, now: number, lastInputAt: number, events: GameEvent[]) {
  const dt = Math.max(0, Math.min(dtS, 1)); // clamp: hidden tabs / long frames never bulk-award
  const active = now - lastInputAt < ACTIVE_IDLE_CUTOFF_MS;
  if (active) {
    s.activeS += dt;
    addEffort(s, dt, events);
  }
  const printerCrates = s.crates.filter((c) => c.source === 'printer').length;
  if (printerCrates < PRINTER_BANK_CAP) {
    s.printerS += dt;
    const interval = PRINTER_INTERVAL_S[s.upgrades.printer];
    if (s.printerS >= interval) {
      s.printerS -= interval;
      s.crates.push({ kind: 'std', source: 'printer' });
      events.push({ type: 'printer' });
    }
  }
}

export const printerInterval = (s: GameState) => PRINTER_INTERVAL_S[s.upgrades.printer];
export const mergeAllUnlocked = (s: GameState) => s.stats.races >= MERGE_ALL_UNLOCK_RACES || s.activeS >= MERGE_ALL_UNLOCK_ACTIVE_S;

// ---------------- Upgrades ----------------

/** The next rank's list price (null when maxed). */
export function upgradeListCost(s: GameState, id: UpgradeId): number | null {
  const def = UPGRADES.find((u) => u.id === id)!;
  const lvl = s.upgrades[id] ?? 0;
  return lvl < def.levels.length ? def.levels[lvl].cost : null;
}
/** Cash credit from parts contributed toward this upgrade's next rank (core/shelf.contributeParts), never more than
 *  the rank's share cap; it always leaves the price on a cash step. */
export const upgradeCreditOf = (s: GameState, id: UpgradeId): number => {
  const list = upgradeListCost(s, id);
  return list === null ? 0 : Math.max(0, Math.min(s.upgradeCredit?.[id] ?? 0, list));
};
/** What the next rank costs now: list price less contributed credit (null when maxed). */
export function upgradeCost(s: GameState, id: UpgradeId): number | null {
  const list = upgradeListCost(s, id);
  return list === null ? null : list - upgradeCreditOf(s, id);
}
/** Why the next rank is not on sale yet (null when it is): the upgrade opens later, or this rank opens with a car. */
export function upgradeLock(s: GameState, id: UpgradeId): string | null {
  const def = UPGRADES.find((u) => u.id === id)!;
  if (!upgradeShown(s, def)) return SHOWS_TEXT[def.shows ?? 'always'];
  const next = def.levels[s.upgrades[id] ?? 0];
  if (next?.opens && !s.owned.includes(next.opens)) return `Opens with the ${carById(next.opens).model}`;
  return null;
}
const SHOWS_TEXT = { always: '', quick: 'Opens after your first race win', cars3: 'Opens with your third car', cars4: 'Opens with your fourth car', cars7: 'Opens with your seventh car' } as const;

export function buyUpgrade(s: GameState, id: UpgradeId): GameEvent[] {
  const cost = upgradeCost(s, id);
  if (cost === null) return [{ type: 'invalid', reason: 'Maxed' }];
  const lock = upgradeLock(s, id);
  if (lock) return [{ type: 'invalid', reason: lock }];
  if (s.cash < cost) return [{ type: 'invalid', reason: `Need $${cost - s.cash} more` }];
  s.cash -= cost;
  s.stats.spent = (s.stats.spent ?? 0) + cost;
  s.upgrades[id] = (s.upgrades[id] ?? 0) + 1;
  if (s.upgradeCredit && s.upgradeCredit[id]) s.upgradeCredit[id] = 0; // the credit was spent on this rank
  if (id === 'grid') expandBoard(s);
  return openCrates(s);
}

/** Other good next steps beside the recommendation — a different route each (goal, trophy, medal, new event),
 *  so a player who keeps losing one race always has a parallel goal. */
export function alternatives(s: GameState, rec: RaceEvent): { e: RaceEvent; why: string }[] {
  const ok = (e: RaceEvent) => e.id !== rec.id && !e.heatOf && (eventUnlocked(s, e).ok || !!eventUnlocked(s, e).switchCar);
  const picks: RaceEvent[] = [];
  const add = (e?: RaceEvent) => { if (e && !picks.includes(e) && picks.length < 2) picks.push(e); };
  add(EVENTS.find((e) => ok(e) && !e.boss && !(s.events[e.id]?.wins) && !e.timeAttack && !e.speedTrap));
  add(EVENTS.find((e) => ok(e) && e.goals && (s.stars?.[e.id] ?? 0) !== 7));
  add(EVENTS.find((e) => ok(e) && e.trophy && !s.badges.includes(e.trophy)));
  add(EVENTS.find((e) => ok(e) && (e.timeAttack || e.speedTrap) && (s.medals?.[e.id] ?? 0) < 3));
  return picks.map((e) => ({ e, why: eventReason(s, e) }));
}

/** Long-run collection: everything earnable after the cars, and the next thing worth chasing. */
export function collection(s: GameState): { have: number; total: number; next: string } {
  const sig = ENABLED_CARS.filter((c) => SIGNATURE_FINISHES[c.id]);
  const medalEvs = EVENTS.filter((e) => e.timeAttack || e.speedTrap);
  const trophies = EVENTS.filter((e) => e.trophy);
  const starEvs = EVENTS.filter((e) => e.goals);
  const parts = [
    [s.owned.length, ENABLED_CARS.length],
    [sig.filter((c) => s.livePodiums.includes(c.id)).length, sig.length],
    [medalEvs.reduce((n, e) => n + (s.medals?.[e.id] ?? 0), 0), medalEvs.length * 3],
    [trophies.filter((e) => s.badges.includes(e.trophy!)).length, trophies.length],
    [starEvs.reduce((n, e) => n + bitCount(s.stars?.[e.id] ?? 0), 0), starEvs.length * 3],
  ];
  const have = parts.reduce((a, p) => a + p[0], 0), total = parts.reduce((a, p) => a + p[1], 0);
  let next = 'Every goal met. Chase your records and dress your cars in the Paint shop.';
  const star = starEvs.find((e) => eventUnlocked(s, e).ok && (s.stars?.[e.id] ?? 0) !== 7);
  const medal = medalEvs.find((e) => eventUnlocked(s, e).ok && (s.medals?.[e.id] ?? 0) < 3);
  const trophy = trophies.find((e) => !s.badges.includes(e.trophy!) && (eventUnlocked(s, e).ok || eventUnlocked(s, e).switchCar));
  const finish = sig.find((c) => s.owned.includes(c.id) && !s.livePodiums.includes(c.id));
  if (star) next = `Goals left on ${star.name}`;
  else if (trophy) next = `Win the ${trophy.trophy} trophy at ${trophy.name}`;
  else if (medal) { const m = s.medals?.[medal.id] ?? 0; next = `${['Bronze', 'Silver', 'Gold'][m]} at ${medal.name}`; }
  else if (finish) next = `A live top 3 in the ${finish.model} earns ${SIGNATURE_FINISHES[finish.id]!.name}`;
  return { have, total, next };
}

// ---------------- Records ----------------

/** A speed-trap event record: `bestMph` (new); `bestSpeed` is the km/h record older builds wrote. */
export type TrapRecord = EventRecord & { bestMph?: number };
/** Best speed-trap reading in mph, reading an older save's km/h record sensibly. */
export const bestTrapMph = (rec: EventRecord | undefined): number => {
  if (!rec) return 0;
  const r = rec as TrapRecord;
  return r.bestMph ?? (rec.bestSpeed ? Math.round(rec.bestSpeed / 1.609344) : 0);
};

const emptyMastery = (): CarMastery => ({ races: 0, wins: 0, podiums: 0, best: {}, perfects: 0, shiftsClean: 0, shifts: 0, topSpeed: 0 });

/** Per-car records (races, wins, best time per event, Perfects, shifts, top speed) for future masteries and levels.
 *  Heats are recorded under their own ids (`main-event:2`), so a best time always means the same course. */
export function recordMastery(s: GameState, car: CarId, e: RaceEvent, o: LeanOutcome) {
  const m = ((s.mastery ??= {})[car] ??= emptyMastery());
  m.races++;
  if (o.place === 1) m.wins++;
  if (o.place <= 3) m.podiums++;
  if (o.playerTime !== null && !e.speedTrap && (m.best[e.id] === undefined || o.playerTime < m.best[e.id])) m.best[e.id] = o.playerTime;
  m.perfects += o.perfects;
  m.shifts += o.shifts ?? 0;
  m.shiftsClean += o.shiftsClean ?? 0;
  m.topSpeed = Math.max(m.topSpeed, o.topSpeed ?? o.trapSpeed ?? 0);
}

/** Read-only summary of one car's records, for future level or mastery systems (no levels are built on it yet). */
export interface MasterySummary extends CarMastery {
  car: CarId;
  /** clean shifts / shifts (0 when none yet) */
  shiftRate: number;
  /** top speed in mph */
  topMph: number;
  /** events with a best time on this car */
  eventsRaced: number;
  winRate: number;
}
export function masteryFor(s: GameState, car: CarId): MasterySummary {
  const m = s.mastery?.[car] ?? emptyMastery();
  return {
    ...m, best: { ...m.best }, car,
    shiftRate: m.shifts ? m.shiftsClean / m.shifts : 0,
    topMph: mph(m.topSpeed),
    eventsRaced: Object.keys(m.best).length,
    winRate: m.races ? m.wins / m.races : 0,
  };
}

/** Paint shop items earned in races (they can also be bought later): granted once, the first time. */
export const EARNED_STYLE: { item: string; how: string; earned: (e: RaceEvent, car: CarId, place: number) => boolean }[] = [
  { item: 'livery:rally', how: 'A live podium with the Corvo Rally', earned: (_e, car, place) => car === 'rally' && place <= 3 },
  { item: 'livery:neon', how: 'Win a Downtown Nights event', earned: (e, _car, place) => place === 1 && (e.heatOf ? eventById(e.heatOf) : e).district === 'downtown' },
];
export function grantEarnedStyle(s: GameState, e: RaceEvent, car: CarId, place: number): string[] {
  const out: string[] = [];
  for (const r of EARNED_STYLE) {
    if (!STYLE_ITEMS.some((i) => i.id === r.item) || (s.owns ?? []).includes(r.item) || !r.earned(e, car, place)) continue;
    (s.owns ??= []).push(r.item);
    out.push(r.item);
  }
  return out;
}

/** Tune-up the active car one stage. */
export function buyTune(s: GameState, car: CarId): GameEvent[] {
  const stage = s.tune?.[car] ?? 0;
  if (!s.owned.includes(car)) return [{ type: 'invalid', reason: 'Not your car' }];
  if (stage >= TUNE_STAGES) return [{ type: 'invalid', reason: 'Fully tuned' }];
  const price = tunePrice(car, stage);
  if (s.cash < price) return [{ type: 'invalid', reason: `Need $${price - s.cash} more` }];
  s.cash -= price;
  s.stats.spent = (s.stats.spent ?? 0) + price;
  (s.tune ??= {})[car] = stage + 1;
  return [];
}

/** The Workshop shows each upgrade once it is relevant, so the early catalogue stays short. */
export function upgradeShown(s: GameState, u: UpgradeDef): boolean {
  switch (u.shows ?? 'always') {
    case 'quick': return Object.values(s.events).some((r) => r.wins > 0);
    case 'cars3': return s.owned.length >= 3;
    case 'cars4': return s.owned.length >= 4;
    case 'cars7': return s.owned.length >= 7;
    default: return true;
  }
}

/** What an upgrade does now and what its next level does, in exact numbers. */
export function upgradeEffect(s: GameState, id: UpgradeId): { now: string; next: string } {
  const lvl = s.upgrades[id] ?? 0;
  const odds = (l: number) => CRATE_TIER_ODDS[Math.min(l, CRATE_TIER_ODDS.length - 1)].map((w, i) => (w > 0 ? `${Math.round(w * 100)}% T${i + 1}` : '')).filter(Boolean).join(' · ');
  switch (id) {
    case 'printer': return { now: `Crate every ${PRINTER_INTERVAL_S[lvl]} s`, next: `every ${PRINTER_INTERVAL_S[lvl + 1] ?? PRINTER_INTERVAL_S[lvl]} s` };
    case 'crateTier': return { now: odds(lvl), next: odds(lvl + 1) };
    case 'crew': return { now: `Quick Races pay ${Math.round(QUICK_PAY_SHARE[Math.min(lvl, QUICK_PAY_SHARE.length - 1)] * 100)}%`, next: `${Math.round(QUICK_PAY_SHARE[Math.min(lvl + 1, QUICK_PAY_SHARE.length - 1)] * 100)}% of the live purse` };
    case 'nitroTank': return { now: `Bank ${nitroCapFor(lvl)} nitro`, next: `${nitroCapFor(lvl + 1)} nitro` };
    case 'lockup': {
      const hrs = (l: number) => OFFLINE_HOURS[Math.min(l, OFFLINE_HOURS.length - 1)];
      const usd = (x: number) => `$${x.toLocaleString('en-US')}`;
      return { now: `Away: up to ${usd(offlineBudget(s, lvl))} over ${hrs(lvl)} h`, next: `up to ${usd(offlineBudget(s, lvl + 1))} over ${hrs(lvl + 1)} h` };
    }
    // 1.9 Garage paths: what each rank does, from the same constants the rules read
    case 'storage': {
      const at = (l: number) => [`Shelf holds ${SHELF_SLOTS[Math.min(l, SHELF_SLOTS.length - 1)]} parts`, l >= AUTO_SHELF_RANK ? 'reward parts overflow onto it' : '', l >= SHELF_SORT_RANK ? 'one-tap store over-cap' : ''].filter(Boolean).join(' · ');
      return { now: at(lvl), next: at(lvl + 1) };
    }
    case 'workshop': {
      const disc = (l: number) => ORDER_DISCOUNT[Math.min(l, ORDER_DISCOUNT.length - 1)];
      const at = (l: number) => [disc(l) ? `Orders ${Math.round(disc(l) * 100)}% off` : 'Orders at list price',
        l >= POLISHED_ORDER_RANK ? `Polished orders (×${POLISHED_ORDER_MUL})` : '', `trade-ins ×${TRADE_RATE[Math.min(l, TRADE_RATE.length - 1)]}`].filter(Boolean).join(' · ');
      return { now: at(lvl), next: at(lvl + 1) };
    }
    case 'grid': {
      const at = (l: number) => [l >= 1 ? 'Board 6×7' : 'Board 5×6', l >= BATCH_MERGE_RANK ? 'Merge All by family' : '', l >= CHAIN_BENCH_RANK ? 'Merge All banks up to 2 nitro' : ''].filter(Boolean).join(' · ');
      return { now: at(lvl), next: at(lvl + 1) };
    }
    default: return { now: '', next: '' };
  }
}

// ---------------- Events & payouts ----------------

export function eventUnlocked(s: GameState, e: RaceEvent): { ok: boolean; why: string; switchCar?: CarId } {
  if (e.heatOf) return { ok: false, why: `Raced as part of ${eventById(e.heatOf).name}` };
  if (e.requires.car && !s.owned.includes(e.requires.car)) return { ok: false, why: `Unlock the ${carById(e.requires.car).model}` };
  if (e.requires.beatBoss && !s.bosses.includes(e.requires.beatBoss)) return { ok: false, why: `Beat ${RIVALS[e.requires.beatBoss].name}` };
  // 1.10: a series round you keep finishing on the podium no longer blocks the next one (PERSIST_PODIUMS, as for an
  // unlock race): the next round opens, and the stalled one stays there to win later (its rival reward needs the win)
  if (e.requires.afterWin && !unlockEventDone(s, e.requires.afterWin)) {
    const n = s.events[e.requires.afterWin]?.podiums ?? 0;
    return { ok: false, why: `Win ${eventById(e.requires.afterWin).name} first${n ? ` (or ${PERSIST_PODIUMS - n} more podium${PERSIST_PODIUMS - n > 1 ? 's' : ''} there)` : ''}` };
  }
  if (e.requires.rep && s.rep < e.requires.rep) return { ok: false, why: `${e.requires.rep - s.rep} more Rep` };
  if (e.requires.stars && starsIn(s) < e.requires.stars) return { ok: false, why: `${e.requires.stars - starsIn(s)} more Downtown stars` };
  if (e.carOnly && s.activeCar !== e.carOnly) return { ok: false, why: `${carById(e.carOnly).model} only`, switchCar: e.carOnly };
  return { ok: true, why: '' };
}

/** One short reason to run this event now, from the player's own situation. */
export function eventReason(s: GameState, e: RaceEvent): string {
  const u = eventUnlocked(s, e);
  if (!u.ok) return u.why;
  const g = goalStatus(s);
  if (e.knockout) {
    const n = (s.knockout?.heat ?? 0);
    const h0 = eventById(e.knockout.heats[n]);
    const opens = unlockedBy(e);
    return s.knockout ? `You're through — ${h0.name} is next (${n + 1} of ${e.knockout.heats.length}). Change cars if this course suits another.` : `${e.knockout.heats.length} heats in a row. Win the final against ${RIVALS[e.boss!.rival].name} for the ${e.boss!.reward.blueprint} paint${opens ? ` and the road to the ${opens.model}` : ''}.`;
  }
  if (e.speedTrap) {
    const m = s.medals?.[e.id] ?? 0;
    const best = bestTrapMph(s.events[e.id]);
    const star = e.district === 'downtown' && m < 3 ? ' — each medal is a Downtown star' : '';
    return m >= 3 ? `Gold won · record ${best} mph` : `${['Bronze', 'Silver', 'Gold'][m]} at ${[e.speedTrap.bronze, e.speedTrap.silver, e.speedTrap.gold][m]} mph through the gate${best ? ` · best ${best} mph` : ''}${star}`;
  }
  if (e.goals) {
    const have = s.stars?.[e.id] ?? 0;
    const left = STAR_LABELS.filter((_, k) => !(have & (1 << k)));
    if (left.length) return `Goals left: ${left.map((l) => (l === 'Under par' ? `under ${e.goals!.par.toFixed(1)} s` : l.toLowerCase())).join(' · ')} — $${starCash(e)} each, once`;
  }
  if (e.boss && !s.bosses.includes(e.boss.rival)) {
    const car = unlockedBy(e);
    return `Beat ${RIVALS[e.boss.rival].name} for the ${e.boss.reward.blueprint} paint${e.boss.rival === 'ray' ? ' and to open the Suburbs' : car && !s.owned.includes(car.id) ? ` and the road to the ${car.model}` : ''}`;
  }
  const opens = unlockedBy(e);
  if (opens && !s.owned.includes(opens.id) && !s.events[e.id]?.wins) return `Win it for +$${roundCash(e.firstClear.cash)} and the road to the ${opens.model}`;
  if (!s.events[e.id]?.wins) {
    const fam = g && !g.keystoneDone ? ` ${FAMILIES[g.family].name}` : '';
    return `First win: +$${roundCash(e.firstClear.cash)} and ${e.firstClear.crates}${fam} crates${fam ? ` toward the ${g!.car.model}` : ''}`;
  }
  const sig = SIGNATURE_FINISHES[s.activeCar];
  if (sig && !s.livePodiums.includes(s.activeCar)) return `A live top-3 earns the ${sig.name} finish for your ${carById(s.activeCar).model}`;
  const fresh = isFreshRoute(s, e) ? ` (new track bonus +${Math.ceil(e.payout.rep[0] * FRESH_ROUTE_BONUS)})` : '';
  if (g && s.rep < g.repNeed) return `Win for ${Math.ceil(e.payout.rep[0] * (fresh ? 1 + FRESH_ROUTE_BONUS : 1))} Rep${fresh} · ${g.repNeed - s.rep} more unlocks the ${g.car.model}`;
  if (fresh) return `New track bonus: +75% Rep on this event`;
  const best = s.events[e.id]?.bestTime;
  return best ? `Beat your record of ${best.toFixed(2)} s` : `Pays $${roundCash(e.payout.cash[0])} for a win`;
}

/** The car whose unlock needs a win at this event, if any. */
export const unlockedBy = (e: RaceEvent): CarClass | undefined => ENABLED_CARS.find((c) => c.unlock?.event === e.id);

export const canQuickRace = (s: GameState, e: RaceEvent) =>
  !e.boss && !e.timeAttack && !e.speedTrap && !e.knockout && !e.heatOf && (s.events[e.id]?.wins ?? 0) > 0 && eventUnlocked(s, e).ok;

export interface Payout {
  cash: number;
  rep: number;
  crates: number;
  precision: number;
  firstClear: boolean;
  boss: boolean;
  bossReward?: NonNullable<RaceEvent['boss']>['reward'];
  freshRep: number;
  /** 1.10: the clean-shift skill bonus (live only: every timed shift in the green, at least CLEAN_RACE_MIN_SHIFTS). */
  clean: number;
}

/** 1.10 Live races pay for skill twice: Perfect boosts (above) and a race with every shift clean, this share of the
 *  win purse. Quick Races never earn it, so a live race stays worth more than the crew's (README "Economy"). */
export const CLEAN_RACE_SHARE = 0.1;
export const CLEAN_RACE_MIN_SHIFTS = 3;
export const cleanRaceBonus = (e: RaceEvent) => (e.timeAttack || e.speedTrap ? 0 : roundCash(e.payout.cash[0] * CLEAN_RACE_SHARE));
const allClean = (o: { shifts?: number; shiftsClean?: number }) => (o.shifts ?? 0) >= CLEAN_RACE_MIN_SHIFTS && o.shiftsClean === o.shifts;

/** New track bonus ("fresh route" in code): +75% Rep for an event that isn't one of your last two races. */
export function isFreshRoute(s: GameState, e: RaceEvent): boolean {
  return s.stats.races >= FRESH_ROUTE_AFTER_RACES && !(s.recentEvents ?? []).includes(e.id);
}

/** Cash for one Perfect boost in this event (live only, at most two per race). */
export const perfectBonus = (e: RaceEvent) => roundCash(Math.max(PRECISION_BONUS_PER_PERFECT, e.payout.cash[0] * PERFECT_BONUS_SHARE));
/** The crew's cut of the live purse for one place, on a cash step (what the Quick Race button shows and pays). */
export const quickShare = (s: GameState) => QUICK_PAY_SHARE[Math.min(s.upgrades.crew ?? 0, QUICK_PAY_SHARE.length - 1)];
export const quickCash = (s: GameState, e: RaceEvent, place: number) => roundCash(e.payout.cash[place - 1] * quickShare(s));

/** The purse a player can see before racing: live by place, the crew's Quick Race cut, and skill bonus. */
export function purse(s: GameState, e: RaceEvent) {
  return {
    live: e.payout.cash.map(roundCash),
    quick: e.payout.cash.map((_, i) => quickCash(s, e, i + 1)),
    quickShare: quickShare(s),
    perfect: perfectBonus(e),
    /** 1.10: + this for a live race with every shift clean */
    clean: cleanRaceBonus(e),
    firstClear: !(s.events[e.id]?.wins) && !e.boss ? roundCash(e.firstClear.cash) : 0,
  };
}

export function computePayout(s: GameState, e: RaceEvent, place: number, mode: 'live' | 'quick', perfects: number, shifting: { shifts?: number; shiftsClean?: number } = {}): Payout {
  const i = place - 1;
  const base = { cash: mode === 'quick' ? quickCash(s, e, place) : roundCash(e.payout.cash[i]), rep: e.payout.rep[i], crates: e.payout.crates[i] };
  const p: Payout = { ...base, precision: 0, firstClear: false, boss: false, freshRep: 0, clean: 0 };
  if (isFreshRoute(s, e)) { p.freshRep = Math.ceil(base.rep * FRESH_ROUTE_BONUS); p.rep += p.freshRep; }
  if (mode === 'live') {
    p.precision = perfectBonus(e) * Math.min(2, perfects);
    p.cash += p.precision;
    if (allClean(shifting)) { p.clean = cleanRaceBonus(e); p.cash += p.clean; }
    const won = place === 1;
    const rec = s.events[e.id];
    if (won && !(rec && rec.wins > 0) && !e.boss && (e.firstClear.cash > 0 || e.firstClear.crates > 0)) {
      p.firstClear = true;
      p.cash += roundCash(e.firstClear.cash);
      p.crates += e.firstClear.crates;
    }
    if (won && e.boss && !s.bosses.includes(e.boss.rival)) {
      p.boss = true;
      p.bossReward = e.boss.reward;
    }
  }
  return p;
}

export function adviceText(s: GameState, o: LeanOutcome): string {
  if (o.place === 1) {
    const g = goalStatus(s);
    if (g) return g.line;
    if (!s.events['foundry-final']?.wins) return 'Take the Ironhorse to the Foundry Invitational.';
    const next = s.owned.find((id) => SIGNATURE_FINISHES[id] && !s.livePodiums.includes(id));
    if (next) return `Take the ${carById(next).model} to a live top 3 to earn its ${SIGNATURE_FINISHES[next]!.name} finish${next === 'junker' ? ' — try the Tapeback Trophy' : ''}.`;
    return 'Every finish is earned. Chase your records on each route.';
  }
  const a = o.advice;
  if (!a) return 'Upgrade in the Garage and try again.';
  const cls = carById(s.activeCar);
  const lo = computeLoadout(s);
  const fam = FAMILIES[a.family];
  const eq = lo.equipped[a.family];
  const have = eq ? eq.t : 0;
  if ((o.nitroLeft ?? 0) > 0 && o.perfects === 0) return `You finished with ${o.nitroLeft} nitro unused. Tap NITRO inside a boost zone: a Perfect boost is 1.5× stronger.`;
  const lost = a.lost > 0.05 ? ` — you lost ${a.lost.toFixed(1)} s on the ${a.segment}` : '';
  if (have < cls.cap) return `Build a T${have + 1} ${fam.name} for the ${a.segment}${lost}.`;
  if (o.perfects === 0) return `Tap NITRO inside a boost zone: a Perfect boost is 1.5× stronger${lost}.`;
  const g = goalStatus(s);
  if (g) return `${fam.name} is maxed for the ${cls.model} (T${cls.cap})${lost}. ${g.line}.`;
  return `Your ${fam.name.toLowerCase()} is maxed${lost}. Hit every boost zone for Perfect boosts.`;
}

export interface CommitInput {
  raceId: number;
  mode: 'live' | 'quick';
  outcome: LeanOutcome;
}

/** Apply a race result exactly once. Returns null if the race id is stale (double tap / reload). */
export function commitRace(s: GameState, input: CommitInput, events: GameEvent[]): LastResult | null {
  const pr = input.mode === 'quick' ? s.pendingQuick : s.pendingRace;
  if (!pr || pr.id !== input.raceId) return null;
  const e = eventById(pr.eventId);
  const o = input.outcome;
  const pay = computePayout(s, e, o.place, input.mode, o.perfects, o);
  if (input.mode === 'quick') s.pendingQuick = null;
  else s.pendingRace = null;
  s.cash += pay.cash;
  s.stats.earned = (s.stats.earned ?? 0) + pay.cash;
  s.rep += pay.rep;
  if (input.mode === 'live') s.nitro = Math.max(0, s.nitro - Math.max(0, o.nitroUsed - CREW_NITRO)); // the crew charge is used first
  const goal = goalStatus(s);
  for (let k = 0; k < pay.crates; k++) {
    const firstClearCrate = pay.firstClear && k >= e.payout.crates[o.place - 1];
    const podiumCrate = input.mode === 'live' && o.place <= 3 && k === 0;
    if (goal && !goal.keystoneDone && (firstClearCrate || podiumCrate)) {
      s.crates.push({ kind: 'targeted', family: goal.family, source: firstClearCrate ? 'firstClear' : 'race' });
    } else s.crates.push({ kind: 'std', source: 'race' });
  }
  let bossCash = 0;
  if (pay.boss && pay.bossReward && e.boss) {
    s.bosses.push(e.boss.rival);
    bossCash = pay.bossReward.cash;
    s.cash += bossCash;
    for (let k = 0; k < pay.bossReward.crates; k++) s.crates.push({ kind: 'std', source: 'boss' });
    s.blueprints.push(pay.bossReward.blueprint);
    s.badges.push(pay.bossReward.badge);
    s.stats.milestones['ray'] = Math.round(s.activeS);
  }
  const rec = (s.events[e.id] ??= { wins: 0, starts: 0, bestPlace: 4, bestTime: null });
  rec.starts++;
  rec.bestPlace = Math.min(rec.bestPlace, o.place);
  if (o.place === 1) rec.wins++;
  if (input.mode === 'live' && o.place <= 3 && !e.heatOf) rec.podiums = (rec.podiums ?? 0) + 1; // 1.9 persistence route
  const liveTime = input.mode === 'live' ? o.playerTime : null;
  const personalBest = liveTime !== null && rec.bestTime !== null && liveTime < rec.bestTime;
  if (liveTime !== null && rec.bestTime === null) rec.bestTime = liveTime;
  if (personalBest) rec.bestTime = liveTime;
  const signatureFinish = input.mode === 'live' && o.place <= 3 && SIGNATURE_FINISHES[pr.car]
    && s.owned.includes(pr.car) && !s.livePodiums.includes(pr.car) ? pr.car : undefined;
  if (signatureFinish) s.livePodiums.push(signatureFinish);
  // Time attack medals: each newly reached medal pays once, and its crates help the current craft.
  let medal: number | undefined;
  const newMedals: number[] = [];
  let medalCash = 0;
  let medalCrates = 0;
  let nextMedal: LastResult['nextMedal'] = null;
  if (e.timeAttack && input.mode === 'live') {
    const ta = e.timeAttack;
    const t = o.playerTime ?? Infinity;
    medal = t <= ta.gold ? 3 : t <= ta.silver ? 2 : t <= ta.bronze ? 1 : 0;
    const prev = s.medals[e.id] ?? 0;
    for (let m = prev + 1; m <= medal; m++) {
      newMedals.push(m);
      const r = MEDAL_REWARDS[MEDALS[m - 1]];
      medalCash += roundCash(r.cash);
      medalCrates += r.crates;
    }
    if (medal > prev) s.medals[e.id] = medal;
    s.cash += medalCash;
    const g2 = goalStatus(s);
    for (let k = 0; k < medalCrates; k++) s.crates.push(g2 && !g2.keystoneDone ? { kind: 'targeted', family: g2.family, source: 'race' } : { kind: 'std', source: 'race' });
    const best = s.medals[e.id] ?? 0;
    if (best < 3) {
      const target = [ta.bronze, ta.silver, ta.gold][best];
      nextMedal = { name: ['Bronze', 'Silver', 'Gold'][best], target, gap: Number.isFinite(t) ? t - target : target };
    }
  }
  // Event goals: a star each for a win, a live time under par and two Perfect boosts; each pays once.
  const newStars: string[] = [];
  let starPay = 0;
  if (e.goals && input.mode === 'live') {
    const bits = (o.place === 1 ? 1 : 0) | (o.playerTime !== null && o.playerTime <= e.goals.par ? 2 : 0) | (o.perfects >= 1 ? 4 : 0);
    const had = s.stars[e.id] ?? 0;
    const fresh = bits & ~had;
    for (let k = 0; k < 3; k++) if (fresh & (1 << k)) { newStars.push(STAR_LABELS[k]); starPay += starCash(e); }
    s.stars[e.id] = had | bits;
    s.cash += starPay;
  }
  // Speed trap: medals by mph through the gate; each medal pays once.
  let trapMphNow: number | undefined;
  if (e.speedTrap && input.mode === 'live' && o.trapSpeed !== undefined) {
    const st = e.speedTrap;
    trapMphNow = mph(o.trapSpeed);
    const tr = rec as TrapRecord;
    tr.bestMph = Math.max(bestTrapMph(tr), trapMphNow);
    rec.bestSpeed = Math.max(rec.bestSpeed ?? 0, Math.round(o.trapSpeed * 3.6)); // legacy km/h record, kept for old readers
    medal = trapMphNow >= st.gold ? 3 : trapMphNow >= st.silver ? 2 : trapMphNow >= st.bronze ? 1 : 0;
    const prev = s.medals[e.id] ?? 0;
    for (let m = prev + 1; m <= medal; m++) {
      newMedals.push(m);
      const r = MEDAL_REWARDS[MEDALS[m - 1]];
      medalCash += roundCash(r.cash * 2); // the speed traps are late events: medals pay double
      medalCrates += r.crates;
    }
    if (medal > prev) s.medals[e.id] = medal;
    s.cash += newMedals.length ? medalCash : 0;
    for (let k = 0; k < medalCrates; k++) s.crates.push({ kind: 'std', source: 'race' });
    const best = s.medals[e.id] ?? 0;
    if (best < 3) {
      const target = [st.bronze, st.silver, st.gold][best];
      nextMedal = { name: ['Bronze', 'Silver', 'Gold'][best], target, gap: target - trapMphNow };
    }
  }
  // Knockout: the top places of a heat go through; losing a heat ends the run, winning the final wins the event.
  let heat: LastResult['heat'];
  if (e.heatOf && input.mode === 'live') {
    const parent = eventById(e.heatOf);
    const heats = parent.knockout!.heats;
    const idx = heats.indexOf(e.id);
    const advanced = o.place <= (e.advance ?? 1);
    const last = idx === heats.length - 1;
    const prec = (s.events[parent.id] ??= { wins: 0, starts: 0, bestPlace: 4, bestTime: null });
    if (idx === 0) prec.starts++;
    const champion = advanced && last;
    if (last) prec.podiums = (prec.podiums ?? 0) + 1; // 1.9 persistence route: reaching and finishing the final
    if (champion) { prec.wins++; prec.bestPlace = 1; s.knockout = null; }
    else if (advanced) s.knockout = { heat: idx + 1 };
    else s.knockout = null;
    heat = { name: e.name, n: idx + 1, of: heats.length, advance: e.advance ?? 1, advanced, champion, next: advanced && !last ? eventById(heats[idx + 1]).name : undefined };
  }
  // Class meet trophy: a Showroom badge for the first live win.
  let trophy: string | undefined;
  if (e.trophy && input.mode === 'live' && o.place === 1 && !s.badges.includes(e.trophy)) {
    s.badges.push(e.trophy);
    trophy = e.trophy;
  }
  if (input.mode === 'live') recordMastery(s, pr.car, e, o);
  const earned = input.mode === 'live' ? grantEarnedStyle(s, e, pr.car, o.place) : [];
  s.recentEvents = [e.id, ...(s.recentEvents ?? []).filter((id) => id !== e.id)].slice(0, 2);
  s.stats.races++;
  if (o.place === 1) s.stats.wins++;
  if (!s.stats.milestones['firstRace']) s.stats.milestones['firstRace'] = Math.round(s.activeS);
  addEffort(s, RACE_EFFORT, events);
  checkUnlocks(s, events);
  openCrates(s).forEach((ev) => events.push(ev));
  const result: LastResult = {
    raceId: input.raceId, eventId: e.id, place: o.place, mode: input.mode, time: o.playerTime, gapText: o.gapText,
    cash: pay.cash + bossCash + medalCash + starPay, rep: pay.rep, crates: pay.crates + (pay.bossReward?.crates ?? 0) + medalCrates, precision: pay.precision,
    firstClear: pay.firstClear, boss: pay.boss, perfects: o.perfects, nitroUsed: input.mode === 'live' ? o.nitroUsed : 0,
    personalBest, signatureFinish, freshRep: pay.freshRep, medal, newMedals, nextMedal, trophy, newStars, heat,
    ...(trapMphNow !== undefined ? { trapMph: trapMphNow, trapKmh: Math.round(trapMphNow * 1.609344) } : {}),
    ...(earned.length ? { earnedStyle: earned } : {}),
    breakdown: [
      { label: input.mode === 'quick' ? `Crew purse · ${ordinalShort(o.place)}` : `Purse · ${ordinalShort(o.place)}`, cash: pay.cash - pay.precision - pay.clean - (pay.firstClear ? e.firstClear.cash : 0), kind: 'base' as const },
      ...(pay.precision ? [{ label: `Perfect boost${o.perfects > 1 ? 's' : ''} ×${Math.min(2, o.perfects)}`, cash: pay.precision, kind: 'skill' as const }] : []),
      ...(pay.clean ? [{ label: `Clean shifts ${o.shiftsClean}/${o.shifts}`, cash: pay.clean, kind: 'skill' as const }] : []),
      ...(pay.firstClear && e.firstClear.cash ? [{ label: 'First win', cash: e.firstClear.cash, kind: 'once' as const }] : []),
      ...(bossCash ? [{ label: `Beat ${RIVALS[e.boss!.rival].name}`, cash: bossCash, kind: 'once' as const }] : []),
      ...(medalCash ? [{ label: 'Medal', cash: medalCash, kind: 'once' as const }] : []),
      ...(starPay ? [{ label: `Goal${newStars.length > 1 ? 's' : ''}: ${newStars.join(', ')}`, cash: starPay, kind: 'once' as const }] : []),
    ],
    advice: adviceText(s, o),
    standings: o.standings,
  };
  s.lastResult = result;
  return result;
}

export function startRace(s: GameState, eventId: string, now: number): { ok: boolean; why: string; eventId: string } {
  const e = eventById(eventId);
  const u = eventUnlocked(s, e);
  if (!u.ok) return { ...u, eventId };
  // The Main Event: race the next heat (the knockout starts at heat 1 when nothing is in progress)
  const raceId = e.knockout ? e.knockout.heats[s.knockout?.heat ?? 0] : eventId;
  s.raceSeed = (Math.imul(s.raceSeed, 1664525) + 1013904223) >>> 0;
  s.pendingRace = { id: s.raceSeed, eventId: raceId, car: s.activeCar, seed: s.raceSeed, startedAt: now };
  return { ok: true, why: '', eventId: raceId };
}

/** Reserve a Quick Race. The caller simulates the outcome (no nitro) from the returned seed. */
export function reserveQuick(s: GameState, eventId: string): { ok: boolean; why: string; seed: number } {
  const e = eventById(eventId);
  if (!canQuickRace(s, e)) return { ok: false, why: 'Win this event in a live race to unlock Quick Race', seed: 0 };
  if (s.pendingQuick) return { ok: false, why: 'A Quick Race is already running', seed: 0 };
  s.raceSeed = (Math.imul(s.raceSeed, 1664525) + 1013904223) >>> 0;
  return { ok: true, why: '', seed: s.raceSeed };
}

/** Quick Race pays out once its real duration has elapsed. */
export function quickDue(s: GameState, now: number) {
  return !!s.pendingQuick && now >= s.pendingQuick.endsAt;
}

/** Recommended event for the one-tap Race button. */
export function recommendedEvent(s: GameState): RaceEvent {
  // While the crew runs a Quick Race, recommend a different event for the live race.
  const busy = s.pendingQuick?.eventId;
  const open = EVENTS.filter((e) => eventUnlocked(s, e).ok && e.id !== busy);
  if (!open.length) return eventById(busy ?? EVENTS[0].id);
  if (s.knockout) return eventById('main-event'); // a Main Event run in progress comes first
  const final = open.find((e) => e.id === 'foundry-final' && !s.events[e.id]?.wins);
  // A first clear you keep losing is spaced out between other races instead of repeated back to back.
  const struggling = (e: RaceEvent) => {
    const r = s.events[e.id];
    const recent = s.recentEvents ?? [];
    return !!r && r.starts - r.wins >= 3 && (recent.includes(e.id) || !!e.knockout?.heats.some((h) => recent.includes(h)));
  };
  if (s.activeCar === 'muscle' && final && !struggling(final)) return final;
  // 1.10: an optional first win you have finished last in three times or more (no podium yet) is not pushed again
  // while it gates nothing you are chasing: the pick moves on to races that pay Rep, and it stays in the menu
  const gates = new Set(chaseableCars(s).map((c) => c.unlock?.event).filter(Boolean) as string[]);
  const outclassed = (e: RaceEvent) => {
    const r = s.events[e.id];
    return !!r && !r.wins && r.starts >= 3 && r.bestPlace >= 4 && !e.series && !e.knockout
      && !gates.has(e.id) && !EVENTS.some((x) => x.requires.afterWin === e.id && gates.has(x.id));
  };
  // First uncleared event, else boss if unbeaten, else the best-paying open one.
  const boss = open.find((e) => e.boss && !s.bosses.includes(e.boss.rival) && !struggling(e));
  const uncleared = open.find((e) => !e.boss && !(s.events[e.id]?.wins) && !struggling(e) && !outclassed(e));
  if (uncleared && (!boss || EVENTS.indexOf(uncleared) < EVENTS.indexOf(boss))) return uncleared;
  if (boss) return boss;
  // After the main route, bring an earlier car back for a class meet it hasn't won yet.
  if (s.owned.includes('muscle')) {
    const meet = EVENTS.find((e) => e.carOnly && e.carOnly !== s.activeCar && s.owned.includes(e.carOnly) && !(s.events[e.id]?.wins)
      && eventUnlocked({ ...s, activeCar: e.carOnly }, e).ok && !struggling(e)); // a meet you keep losing is spaced out too
    if (meet) return meet;
  }
  // Downtown Nights: goals not yet met are worth more than repeat Rep, and they open the next car.
  // (the last two races are skipped, so unfinished goals rotate instead of repeating one event)
  // Once no unlock waits on stars, an event whose goals you have tried several times (often the Perfect boost goal,
  // for a player who doesn't use nitro) stops being pushed: the pick goes back to the best Rep, so the
  // recommendation never parks a player on a low purse for a goal they aren't chasing.
  const starsWanted = EVENTS.some((e) => e.requires.stars && !(s.events[e.id]?.starts) && starsIn(s) < e.requires.stars)
    || ENABLED_CARS.some((c) => c.unlock?.stars && !s.owned.includes(c.id) && starsIn(s) < c.unlock.stars);
  const starHunt = open.filter((e) => e.goals && (s.stars?.[e.id] ?? 0) !== 7 && !(s.recentEvents ?? []).includes(e.id)
    && (starsWanted || (s.events[e.id]?.starts ?? 0) < 4));
  // 1.10: while an unlock waits on stars, a Downtown speed-trap medal still to win counts too (trapStars)
  if (starsWanted) starHunt.push(...open.filter((e) => e.speedTrap && e.district === 'downtown' && (s.medals?.[e.id] ?? 0) < 3 && !(s.recentEvents ?? []).includes(e.id)));
  // 1.10: the goals you are closest to first (best finish there), and never one you have finished last in three times
  const placeAt = (e: RaceEvent) => s.events[e.id]?.bestPlace ?? 2;
  const hunt = starHunt.filter((e) => !((s.events[e.id]?.starts ?? 0) >= 3 && placeAt(e) >= 4)).sort((a, b) => placeAt(a) - placeAt(b));
  if (hunt.length) return hunt[0];
  // Repeat races: the best Rep per race, counting the Fresh route bonus, so the pick rotates between routes.
  const pool = open.filter((e) => !e.boss && !struggling(e) && (s.activeCar === 'muscle' || e.id !== 'foundry-final'));
  const value = (e: RaceEvent) => e.payout.rep[0] * (isFreshRoute(s, e) ? 1 + FRESH_ROUTE_BONUS : 1) + EVENTS.indexOf(e) * 0.01;
  return pool.sort((a, b) => value(b) - value(a))[0] ?? open[0];
}

// ---------------- Offline ----------------

const ordinalShort = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

/** How long away earnings can build up (seconds), by Lock-up level. */
export const offlineMaxS = (s: GameState) => OFFLINE_HOURS[Math.min(s.upgrades.lockup ?? 0, OFFLINE_HOURS.length - 1)] * 3600;

/** An ordinary race: one you can enter and repeat, not a rival boss, knockout, heat, time trial or speed trap. */
const ordinaryEvent = (e: RaceEvent) => !e.heatOf && !e.knockout && !e.boss && !e.timeAttack && !e.speedTrap;

/** The win purse of your best open ordinary race: the yardstick for away earnings at your stage. */
export function stagePurse(s: GameState): { cash: number; event: RaceEvent } {
  let best: RaceEvent = EVENTS[0];
  for (const e of EVENTS) {
    if (!ordinaryEvent(e)) continue;
    const u = eventUnlocked(s, e);
    if ((u.ok || u.switchCar) && e.payout.cash[0] > best.payout.cash[0]) best = e;
  }
  return { cash: roundCash(best.payout.cash[0]), event: best };
}

/** A full away claim (cash), by Lock-up level: one budget for the whole garage, never per car. */
export function offlineBudget(s: GameState, lockup = s.upgrades.lockup ?? 0): number {
  const races = OFFLINE_BUDGET_RACES[Math.min(lockup, OFFLINE_BUDGET_RACES.length - 1)];
  return floorCash(stagePurse(s).cash * races);
}

/** The one payout rule for away time: cash for `seconds` counted (linear up to the cap), on a cash step, never more
 *  than accrued. Used by accrual, the claim sheet, the Shop and the Lock-up text, so they always agree. */
export function offlinePayout(s: GameState, seconds: number): { cash: number; counted: number; capped: boolean; budget: number; maxS: number } {
  const maxS = offlineMaxS(s);
  const budget = offlineBudget(s);
  const counted = Math.max(0, Math.min(seconds, maxS));
  return { cash: floorCash(budget * (counted / maxS)), counted, capped: seconds > maxS, budget, maxS };
}

/** Average away earnings per minute (display only; payouts come from offlinePayout). */
export const offlineRate = (s: GameState) => Math.round((offlineBudget(s) / (offlineMaxS(s) / 60)) * 10) / 10;

/**
 * Accrue away time since lastSeenAt. Clamps negative elapsed time (clock rollback), caps the counted time at the
 * Lock-up hours, and stores timestamp and pending claim together, so repeated reloads, a second tab or a resumed
 * idle tab never count the same time twice. The pending cash never goes down: a claim accrued by an older build
 * is honoured as it stands (and only grows again once the shared rule pays more).
 */
export function accrueOffline(s: GameState, now: number): boolean {
  const elapsed = Math.max(0, (now - s.offline.lastSeenAt) / 1000);
  const before = s.offline.pendingCash;
  if (elapsed >= OFFLINE_MIN_S || s.offline.pendingS > 0) {
    const room = Math.max(0, offlineMaxS(s) - s.offline.pendingS);
    s.offline.awayS = (s.offline.awayS ?? s.offline.pendingS) + elapsed;
    s.offline.pendingS += Math.min(elapsed, room);
    s.offline.capped = !!s.offline.capped || elapsed > room;
    s.offline.pendingCash = Math.max(s.offline.pendingCash, offlinePayout(s, s.offline.pendingS).cash);
  }
  s.offline.lastSeenAt = Math.max(s.offline.lastSeenAt, now);
  return s.offline.pendingCash > before;
}

export function claimOffline(s: GameState): number {
  const c = s.offline.pendingCash;
  s.cash += c;
  s.offline.pendingCash = 0;
  s.offline.pendingS = 0;
  s.offline.awayS = 0;
  s.offline.capped = false;
  return c;
}

/** Called regularly while playing so active time is not counted as "away". */
export function heartbeat(s: GameState, now: number) {
  s.offline.lastSeenAt = Math.max(s.offline.lastSeenAt, now);
}

// ---------------- Spare parts: keep or recycle (Pit Stop) ----------------

export type PartUseKind = 'fit' | 'craft' | 'pair' | 'spare';
export interface PartUses {
  part: Part;
  where: 'bench' | 'rack';
  uses: { kind: PartUseKind; text: string }[];
  scrap: number;
  starred: boolean;
  /** keep: it has a use (or is starred); recycle: nothing in the garage needs it. */
  verdict: 'keep' | 'recycle';
}

/** A part is a worthwhile ingredient when it is at least an eighth of the craft (three tiers below or closer). */
const INGREDIENT_SPAN = 3;

function craftUse(s: GameState, f: Family, t: number): string | null {
  for (const c of ENABLED_CARS) {
    if (s.owned.includes(c.id) || !c.unlock || c.unlock.family !== f) continue;
    if (craftedTier(s, f) >= c.unlock.tier) continue; // already crafted: the ledger keeps it
    if (t < c.unlock.tier && t >= c.unlock.tier - INGREDIENT_SPAN) {
      const next = nextCar(s)?.id === c.id;
      return `${next ? 'Ingredient' : 'Toward a later craft'}: the T${c.unlock.tier} ${FAMILIES[f].name} for the ${c.model}${next ? '' : ` (${2 ** (t - 1)} of ${2 ** (c.unlock.tier - 1)} parts' worth)`}`;
    }
  }
  return null;
}

/** Does this part beat what a car has fitted in its family (at the car's cap)? */
const beatsFitted = (s: GameState, car: CarId, p: Pick<Part, 'f' | 't' | 'q'>) => {
  const cap = carById(car).cap;
  const have = fitted(s, car)[p.f];
  return contributionOn({ id: -1, ...p }, cap) > (have ? contributionOn(have, cap) : 0) + 1e-9;
};

/** For each owned car and family, the one bench part that is its best upgrade (ties go to the lower tier, so a
 *  high-tier part is not spent on a capped car). Returns part id → the cars it is the pick for. */
function upgradePicks(s: GameState, bench: Part[]): Map<number, CarId[]> {
  const out = new Map<number, CarId[]>();
  // the active car first, then the higher-cap cars, so a strong spare goes where it runs at full strength
  const cars = [s.activeCar, ...s.owned.filter((c) => c !== s.activeCar).sort((a, b) => carById(b).cap - carById(a).cap)];
  const taken = new Set<number>();
  for (const car of cars) {
    const cap = carById(car).cap;
    for (const f of ACTIVE_FAMILIES) {
      let best: Part | null = null;
      for (const p of bench) {
        if (p.f !== f || taken.has(p.id) || !beatsFitted(s, car, p)) continue;
        const a = contributionOn(p, cap), b = best ? contributionOn(best, cap) : -1;
        if (!best || a > b + 1e-9 || (Math.abs(a - b) < 1e-9 && p.t < best.t)) best = p;
      }
      if (best) { taken.add(best.id); out.set(best.id, [...(out.get(best.id) ?? []), car]); }
    }
  }
  return out;
}

function fitText(s: GameState, p: Part, car: CarId): string {
  const have = fitted(s, car)[p.f];
  const capped = p.t > carById(car).cap ? ` (runs at T${carById(car).cap})` : '';
  return `${have ? `Beats the T${have.t} ${FAMILIES[p.f].name}` : `Fills the empty ${FAMILIES[p.f].name} slot`} on your ${carById(car).model}${capped}`;
}

/** What each unfitted part is good for and what recycling it pays: a better fit for an owned car, an ingredient
 *  toward the next or a later craft, a pair whose merge would be useful, or the one spare that matches your best
 *  fitted part (an alternate build to swap between cars). Anything else is suggested for recycling. */
export function spareParts(s: GameState): PartUses[] {
  const bench = [
    ...s.board.map((p) => (p ? { p, where: 'bench' as const } : null)),
    ...s.tray.map((p) => (p ? { p, where: 'rack' as const } : null)),
  ].filter((x): x is { p: Part; where: 'bench' | 'rack' } => !!x);
  const fav = new Set(s.favorites ?? []);
  const bestFitted = (f: Family) => Math.max(0, ...s.owned.map((c) => fitted(s, c)[f]?.t ?? 0));
  const spareTaken = new Set<Family>();
  // the spare tag goes to the highest-quality match first, one per family
  const order = [...bench].sort((a, b) => b.p.t - a.p.t || (b.p.q === 'std' ? 0 : 1) - (a.p.q === 'std' ? 0 : 1));
  const spareIds = new Set<number>();
  for (const { p } of order) {
    if (!spareTaken.has(p.f) && p.t === bestFitted(p.f) && p.t > 0) { spareTaken.add(p.f); spareIds.add(p.id); }
  }
  const picks = upgradePicks(s, bench.map((b) => b.p));
  return bench.map(({ p, where }) => {
    const uses: PartUses['uses'] = [];
    const cars = picks.get(p.id) ?? [];
    const fit = cars.length ? fitText(s, p, cars[0]) + (cars.length > 1 ? ` (and ${cars.length - 1} more car${cars.length > 2 ? 's' : ''})` : '') : null;
    if (fit) uses.push({ kind: 'fit', text: fit });
    const craft = craftUse(s, p.f, p.t);
    if (craft) uses.push({ kind: 'craft', text: craft });
    const partner = bench.some((o) => o.p.id !== p.id && o.p.f === p.f && o.p.t === p.t) && p.t < MAX_TIER;
    const merged = { f: p.f, t: p.t + 1, q: 'std' as const };
    if (partner && !fit && !craft && (s.owned.some((c) => beatsFitted(s, c, merged)) || craftUse(s, p.f, p.t + 1)))
      uses.push({ kind: 'pair', text: `Merge it with your other T${p.t} ${FAMILIES[p.f].name}: the T${p.t + 1} is useful` });
    if (!uses.length && spareIds.has(p.id)) uses.push({ kind: 'spare', text: `Alternate build: matches your best fitted ${FAMILIES[p.f].name} (T${p.t}) — a swap that needs no unfitting` });
    const starred = fav.has(p.id);
    return { part: p, where, uses, scrap: SCRAP_VALUE[p.t] ?? 0, starred, verdict: uses.length || starred ? 'keep' : 'recycle' };
  });
}

export function equipCapNote(s: GameState): string | null {
  const lo = computeLoadout(s);
  const cls = carById(s.activeCar);
  const fams = Object.keys(lo.blocked) as Family[];
  if (!fams.length) return null;
  const f = fams[0];
  return `T${lo.blocked[f]!.t} ${FAMILIES[f].name} runs at T${cls.cap} on the ${cls.model}`;
}

export const tierCeilingNote = () => `T${MAX_TIER} is the top tier in this release`;

export function ownedCarIds(s: GameState): CarId[] {
  return ENABLED_CARS.map((c) => c.id).filter((id) => s.owned.includes(id));
}
