import {
  ACTIVE_IDLE_CUTOFF_MS, CATCHUP_EFFORT_THRESHOLD, CarClass, CarId, ENABLED_CARS, EVENTS, FAMILIES, Family,
  MAX_TIER, MERGE_ALL_UNLOCK_ACTIVE_S, MERGE_ALL_UNLOCK_RACES, OFFLINE_MAX_S, OFFLINE_MIN_S, PRECISION_BONUS_CAP, PRECISION_BONUS_PER_PERFECT,
  PRINTER_INTERVAL_S, RACE_EFFORT, MEDALS, MEDAL_REWARDS, CREW_NITRO, FRESH_ROUTE_AFTER_RACES, FRESH_ROUTE_BONUS, RaceEvent, SIGNATURE_FINISHES, UPGRADES, carById, eventById,
} from '../data/tables';
import { allParts, craftedTier, expandBoard, openCrates } from './board';
import type { GameEvent } from './events';
import { computeLoadout } from './loadout';
import type { GameState, LastResult, LeanOutcome } from './state';

export const PRINTER_BANK_CAP = 10; // printer pauses with this many unopened printer crates

// ---------------- Goals ----------------

export function nextCar(s: GameState): CarClass | null {
  return ENABLED_CARS.find((c) => !s.owned.includes(c.id)) ?? null;
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

export function goalStatus(s: GameState): GoalStatus | null {
  const car = nextCar(s);
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
  const eventDone = !u.event || (s.events[u.event]?.wins ?? 0) > 0;
  const keyPart = keystoneDone ? 1 : Math.min(0.95, craftedTier(s, u.family) / u.tier);
  const progress = u.event ? (repFrac + keyPart + (eventDone ? 1 : 0)) / 3 : (repFrac + keyPart) / 2;
  const fam = FAMILIES[u.family];
  const parts: string[] = [];
  if (!keystoneDone) parts.push(`Craft T${u.tier} ${fam.name}`);
  if (!eventDone) parts.push(`Win the ${eventById(u.event!).name}`);
  if (s.rep < u.rep) parts.push(`${u.rep - s.rep} more Rep`);
  const line = parts.length ? `${parts.join(' · ')} to unlock the ${car.model}` : `The ${car.model} is ready`;
  return { car, repHave, repNeed: u.rep, family: u.family, tier: u.tier, keystoneDone, bestHeld, keyProgress: keyFrac, progress, line, event: u.event ?? null, eventDone };
}

/** Grant any newly satisfied cars. Ownership is committed before any reveal animation. */
export function checkUnlocks(s: GameState, events: GameEvent[]) {
  for (;;) {
    const car = nextCar(s);
    if (!car || !car.unlock) return;
    const ev = car.unlock.event;
    if (s.rep >= car.unlock.rep && craftedTier(s, car.unlock.family) >= car.unlock.tier && (!ev || (s.events[ev]?.wins ?? 0) > 0)) {
      s.owned.push(car.id);
      s.activeCar = car.id;
      s.pendingReveal ??= car.id;
      s.stats.milestones[car.id] = Math.round(s.activeS);
      events.push({ type: 'unlock', car: car.id });
    } else return;
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

export function upgradeCost(s: GameState, id: 'grid' | 'printer' | 'crateTier'): number | null {
  const def = UPGRADES.find((u) => u.id === id)!;
  const lvl = s.upgrades[id];
  return lvl < def.levels.length ? def.levels[lvl].cost : null;
}

export function buyUpgrade(s: GameState, id: 'grid' | 'printer' | 'crateTier'): GameEvent[] {
  const cost = upgradeCost(s, id);
  if (cost === null) return [{ type: 'invalid', reason: 'Maxed' }];
  if (s.cash < cost) return [{ type: 'invalid', reason: `Need $${cost - s.cash} more` }];
  s.cash -= cost;
  s.upgrades[id]++;
  if (id === 'grid') expandBoard(s);
  return openCrates(s);
}

// ---------------- Events & payouts ----------------

export function eventUnlocked(s: GameState, e: RaceEvent): { ok: boolean; why: string; switchCar?: CarId } {
  if (e.requires.car && !s.owned.includes(e.requires.car)) return { ok: false, why: `Unlock the ${carById(e.requires.car).model}` };
  if (e.requires.beatBoss && !s.bosses.includes(e.requires.beatBoss)) return { ok: false, why: 'Beat Rusty Ray to open the Suburbs' };
  if (e.requires.afterWin && !(s.events[e.requires.afterWin]?.wins)) return { ok: false, why: `Win ${eventById(e.requires.afterWin).name} first` };
  if (e.requires.rep && s.rep < e.requires.rep) return { ok: false, why: `${e.requires.rep - s.rep} more Rep` };
  if (e.carOnly && s.activeCar !== e.carOnly) return { ok: false, why: `${carById(e.carOnly).model} only`, switchCar: e.carOnly };
  return { ok: true, why: '' };
}

/** One short reason to run this event now, from the player's own situation. */
export function eventReason(s: GameState, e: RaceEvent): string {
  const u = eventUnlocked(s, e);
  if (!u.ok) return u.why;
  const g = goalStatus(s);
  if (e.boss && !s.bosses.includes(e.boss.rival)) return `Beat Rusty Ray for his ${e.boss.reward.blueprint} paint and to open the Suburbs`;
  if (!s.events[e.id]?.wins) {
    const fam = g && !g.keystoneDone ? ` ${FAMILIES[g.family].name}` : '';
    return `First win: +$${e.firstClear.cash} and ${e.firstClear.crates}${fam} crates${fam ? ` toward the ${g!.car.model}` : ''}`;
  }
  const sig = SIGNATURE_FINISHES[s.activeCar];
  if (sig && !s.livePodiums.includes(s.activeCar)) return `A live top-3 earns the ${sig.name} finish for your ${carById(s.activeCar).model}`;
  const fresh = isFreshRoute(s, e) ? ` (Fresh route +${Math.ceil(e.payout.rep[0] * FRESH_ROUTE_BONUS)})` : '';
  if (g && s.rep < g.repNeed) return `Win for ${Math.ceil(e.payout.rep[0] * (fresh ? 1 + FRESH_ROUTE_BONUS : 1))} Rep${fresh} · ${g.repNeed - s.rep} more unlocks the ${g.car.model}`;
  if (fresh) return `Fresh route: +75% Rep on this event`;
  const best = s.events[e.id]?.bestTime;
  return best ? `Beat your record of ${best.toFixed(2)} s` : `Pays $${e.payout.cash[0]} for a win`;
}

export const canQuickRace = (s: GameState, e: RaceEvent) =>
  !e.boss && !e.timeAttack && (s.events[e.id]?.wins ?? 0) > 0 && eventUnlocked(s, e).ok;

export interface Payout {
  cash: number;
  rep: number;
  crates: number;
  precision: number;
  firstClear: boolean;
  boss: boolean;
  bossReward?: NonNullable<RaceEvent['boss']>['reward'];
  freshRep: number;
}

/** Fresh route: +50% Rep for an event that isn't one of your last two races. */
export function isFreshRoute(s: GameState, e: RaceEvent): boolean {
  return s.stats.races >= FRESH_ROUTE_AFTER_RACES && !(s.recentEvents ?? []).includes(e.id);
}

export function computePayout(s: GameState, e: RaceEvent, place: number, mode: 'live' | 'quick', perfects: number): Payout {
  const i = place - 1;
  const base = { cash: e.payout.cash[i], rep: e.payout.rep[i], crates: e.payout.crates[i] };
  const p: Payout = { ...base, precision: 0, firstClear: false, boss: false, freshRep: 0 };
  if (isFreshRoute(s, e)) { p.freshRep = Math.ceil(base.rep * FRESH_ROUTE_BONUS); p.rep += p.freshRep; }
  if (mode === 'live') {
    p.precision = Math.min(PRECISION_BONUS_CAP, perfects * PRECISION_BONUS_PER_PERFECT);
    p.cash += p.precision;
    const won = place === 1;
    const rec = s.events[e.id];
    if (won && !(rec && rec.wins > 0) && !e.boss) {
      p.firstClear = true;
      p.cash += e.firstClear.cash;
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
  const lost = a.lost > 0.05 ? ` — you lost ${a.lost.toFixed(1)} s there` : '';
  if (have < cls.cap) return `Build a T${have + 1} ${fam.name} for the ${a.segment}${lost}.`;
  if (o.perfects === 0) return `Tap nitro inside the amber windows: a Perfect boost is 1.5× stronger${lost}.`;
  const g = goalStatus(s);
  if (g) return `${fam.name} is maxed for the ${cls.model} (T${cls.cap})${lost}. ${g.line}.`;
  return `Your ${fam.name.toLowerCase()} is maxed${lost}. Hit every amber window for Perfect boosts.`;
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
  const pay = computePayout(s, e, o.place, input.mode, o.perfects);
  if (input.mode === 'quick') s.pendingQuick = null;
  else s.pendingRace = null;
  s.cash += pay.cash;
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
      medalCash += r.cash;
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
  // Class meet trophy: a Showroom badge for the first live win.
  let trophy: string | undefined;
  if (e.trophy && input.mode === 'live' && o.place === 1 && !s.badges.includes(e.trophy)) {
    s.badges.push(e.trophy);
    trophy = e.trophy;
  }
  s.recentEvents = [e.id, ...(s.recentEvents ?? []).filter((id) => id !== e.id)].slice(0, 2);
  s.stats.races++;
  if (o.place === 1) s.stats.wins++;
  if (!s.stats.milestones['firstRace']) s.stats.milestones['firstRace'] = Math.round(s.activeS);
  addEffort(s, RACE_EFFORT, events);
  checkUnlocks(s, events);
  openCrates(s).forEach((ev) => events.push(ev));
  const result: LastResult = {
    raceId: input.raceId, eventId: e.id, place: o.place, mode: input.mode, time: o.playerTime, gapText: o.gapText,
    cash: pay.cash + bossCash + medalCash, rep: pay.rep, crates: pay.crates + (pay.bossReward?.crates ?? 0) + medalCrates, precision: pay.precision,
    firstClear: pay.firstClear, boss: pay.boss, perfects: o.perfects, nitroUsed: input.mode === 'live' ? o.nitroUsed : 0,
    personalBest, signatureFinish, freshRep: pay.freshRep, medal, newMedals, nextMedal, trophy,
    advice: adviceText(s, o),
    standings: o.standings,
  };
  s.lastResult = result;
  return result;
}

export function startRace(s: GameState, eventId: string, now: number): { ok: boolean; why: string } {
  const e = eventById(eventId);
  const u = eventUnlocked(s, e);
  if (!u.ok) return u;
  s.raceSeed = (Math.imul(s.raceSeed, 1664525) + 1013904223) >>> 0;
  s.pendingRace = { id: s.raceSeed, eventId, car: s.activeCar, seed: s.raceSeed, startedAt: now };
  return { ok: true, why: '' };
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
  const final = open.find((e) => e.id === 'foundry-final' && !s.events[e.id]?.wins);
  if (s.activeCar === 'muscle' && final) return final;
  // A first clear you keep losing is spaced out between other races instead of repeated back to back.
  const struggling = (e: RaceEvent) => {
    const r = s.events[e.id];
    return !!r && r.starts - r.wins >= 3 && (s.recentEvents ?? []).includes(e.id);
  };
  // First uncleared event, else boss if unbeaten, else the best-paying open one.
  const boss = open.find((e) => e.boss && !s.bosses.includes(e.boss.rival) && !struggling(e));
  const uncleared = open.find((e) => !e.boss && !(s.events[e.id]?.wins) && !struggling(e));
  if (uncleared && (!boss || EVENTS.indexOf(uncleared) < EVENTS.indexOf(boss))) return uncleared;
  if (boss) return boss;
  // After the main route, bring an earlier car back for a class meet it hasn't won yet.
  if (s.owned.includes('muscle')) {
    const meet = EVENTS.find((e) => e.carOnly && e.carOnly !== s.activeCar && s.owned.includes(e.carOnly) && !(s.events[e.id]?.wins)
      && eventUnlocked({ ...s, activeCar: e.carOnly }, e).ok);
    if (meet) return meet;
  }
  // Repeat races: the best Rep per race, counting the Fresh route bonus, so the pick rotates between routes.
  const pool = open.filter((e) => !e.boss && !struggling(e) && (s.activeCar === 'muscle' || e.id !== 'foundry-final'));
  const value = (e: RaceEvent) => e.payout.rep[0] * (isFreshRoute(s, e) ? 1 + FRESH_ROUTE_BONUS : 1) + EVENTS.indexOf(e) * 0.01;
  return pool.sort((a, b) => value(b) - value(a))[0] ?? open[0];
}

// ---------------- Offline ----------------

export const offlineRate = (s: GameState) => s.owned.reduce((a, id) => a + carById(id).offlineRate, 0);

/**
 * Accrue offline cash for the time since lastSeenAt. Clamps negative elapsed time (clock rollback),
 * caps the total pending claim at 8 hours, and stores timestamp and pending claim together.
 */
export function accrueOffline(s: GameState, now: number) {
  const elapsed = Math.max(0, (now - s.offline.lastSeenAt) / 1000);
  const room = Math.max(0, OFFLINE_MAX_S - s.offline.pendingS);
  const counted = Math.min(elapsed, room);
  if (elapsed >= OFFLINE_MIN_S || s.offline.pendingS > 0) {
    s.offline.pendingS += counted;
    s.offline.pendingCash = Math.floor((s.offline.pendingS / 60) * offlineRate(s));
  }
  s.offline.lastSeenAt = Math.max(s.offline.lastSeenAt, now);
}

export function claimOffline(s: GameState): number {
  const c = s.offline.pendingCash;
  s.cash += c;
  s.offline.pendingCash = 0;
  s.offline.pendingS = 0;
  return c;
}

/** Called regularly while playing so active time is not counted as "away". */
export function heartbeat(s: GameState, now: number) {
  s.offline.lastSeenAt = Math.max(s.offline.lastSeenAt, now);
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
