// Scripted player used to measure milestone times from a clean save, through the real Game API.
// Time costs approximate a real phone session: a drag ≈1.3 s, a live race = race time + 7 s of menus.
//
// Player models (docs: README "Balance"):
//   shift  'clean' every upshift in the green · 'ordinary' a beat late on the limiter · 'mixed' alternates the two
//          race by race · 'missed' never taps SHIFT (the gearbox's automatic fallback every time)
//   policy 'perfect' nitro inside each boost zone · 'mixed' every other race just after the zone · 'none' never
// The bot fits the recommended parts before every race (the Fit Parts one-tap fit), as a player would.
import * as B from '../src/core/board';
import { Game } from '../src/core/game';
import { computeLoadout } from '../src/core/loadout';
import { fitRecommended as fitRec } from '../src/core/install';
import * as P from '../src/core/progression';
import { NitroPolicy, RaceSim, ShiftPolicy } from '../src/core/race';
import { MemoryKV } from '../src/core/save';
import { ACTIVE_FAMILIES, CarId, MAX_TIER, PART_ORDER_PRICE, TUNE_STAGES, UPGRADES, carById, eventById, Family, tunePrice, RaceEvent } from '../src/data/tables';
import type { SlotRef } from '../src/core/events';

export interface BotLog {
  milestones: Record<string, number>; // sim seconds from start
  races: number;
  quick: number;
  merges: number;
  scraps: number;
  catchups: number;
  lossRaces: number;
  /** time when the first live race was launched (finish is milestones.firstRace) */
  firstLaunch: number;
  /** seconds with enough Rep for the next car but its keystone still missing */
  stuckOnIngredients: number;
  /** seconds with nothing useful to do (waiting on the printer or the crew) */
  waiting: number;
  perEvent: Record<string, number>;
  /** live starts and live wins per event */
  liveStarts: Record<string, number>;
  liveWins: Record<string, number>;
  /** longest run of the same event back to back (live or quick) */
  maxRepeat: number;
  /** longest run of live losses on one event before its first win */
  maxLossStreak: number;
  /** races (live + quick) when each car unlocked */
  racesAt: Record<string, number>;
  log: string[];
}

export type BotShift = 'clean' | 'ordinary' | 'mixed' | 'missed';

export interface BotOpts {
  seed: number;
  untilCar?: string;
  /** Stop when this event has been won live (e.g. the Halcyon's finale). */
  untilWin?: string;
  maxS?: number;
  policy?: NitroPolicy | 'mixed';
  shift?: BotShift;
  quickRace?: boolean;
  forceStd?: boolean;
  /** Order goal ingredients from the parts counter (default true). */
  buyParts?: boolean;
  /** Buy Tune-ups when losing (always on for the no-nitro player). */
  tune?: boolean;
  /** Called before every bot decision (audits: cash timelines, save snapshots). */
  onStep?: (g: Game, t: number) => void;
}

const COST = { merge: 1.3, scrap: 1.5, buy: 2.5, raceOverhead: 7, quick: 5, think: 1 };

/** Race one live setup to the finish with a nitro policy (the bot's thumbs). */
function drive(sim: RaceSim, policy: NitroPolicy) {
  while (!sim.done) {
    if (policy !== 'none' && sim.charges > 0 && sim.player.nitroLeft <= 0 && sim.player.finishTime === null) {
      const { active } = sim.windowState();
      if (policy === 'perfect' && active && !sim.usedWindows.has(active.segIndex)) sim.tapNitro();
      if (policy === 'late' && !active && sim.windows.some((w) => sim.player.x > w.end && sim.player.x < w.end + 25)) sim.tapNitro();
    }
    sim.step();
  }
  return sim.outcome();
}

export function runBot(o: BotOpts): BotLog {
  B.luck.force = o.forceStd === false ? null : 'std';
  const kv = new MemoryKV();
  let now = 1_000_000;
  const g = new Game(kv, '/test/', now, undefined);
  g.state.rng = o.seed;
  g.state.raceSeed = o.seed * 31;
  const L: BotLog = { milestones: {}, races: 0, quick: 0, merges: 0, scraps: 0, catchups: 0, lossRaces: 0, firstLaunch: 0, stuckOnIngredients: 0, waiting: 0, perEvent: {}, liveStarts: {}, liveWins: {}, maxRepeat: 0, maxLossStreak: 0, racesAt: {}, log: [] };
  let lastEvent = '';
  let repeat = 0;
  const lossStreak: Record<string, number> = {};
  const countEvent = (id: string) => {
    L.perEvent[id] = (L.perEvent[id] ?? 0) + 1;
    repeat = id === lastEvent ? repeat + 1 : 1;
    lastEvent = id;
    L.maxRepeat = Math.max(L.maxRepeat, repeat);
  };
  let t = 0;
  const spend = (dt: number) => {
    // advance the clock one second at a time so the printer and catch-up see real active play
    let left = dt;
    while (left > 0) {
      const step = Math.min(1, left);
      now += step * 1000;
      t += step;
      g.input(now);
      g.tick(step, now);
      const gs = P.goalStatus(g.state);
      if (gs && !gs.keystoneDone && g.state.rep >= gs.repNeed) L.stuckOnIngredients += step;
      left -= step;
    }
  };
  const log = (line: string) => { if (L.log.length < 1500) L.log.push(line); };
  g.subscribe((ev) => {
    for (const e of ev) {
      if (e.type === 'quickDone' && g.quickResult) {
        const r = g.quickResult;
        if (r.place > 1) L.lossRaces++;
        L.races++;
        log(`${t.toFixed(0)}s quick ${r.eventId} P${r.place} +$${r.cash} +${r.rep}rep rep=${g.state.rep}`);
      }
      if (e.type === 'unlock') {
        L.milestones[e.car] = Math.round(t);
        L.racesAt[e.car] = L.races;
        log(`${t.toFixed(0)}s unlock ${e.car} (rep ${g.state.rep}, cash ${g.state.cash})`);
      }
      if (e.type === 'catchup') { L.catchups++; log(`${t.toFixed(0)}s catch-up crate ${e.family} T${e.tier}`); }
      if (e.type === 'keystone' && ((e.family === 'tires' && e.tier === 3) || (e.family === 'turbo' && e.tier === 4) || (e.family === 'engine' && e.tier === 5)) && !L.milestones['key-' + e.family]) L.milestones['key-' + e.family] = Math.round(t);
      if (e.type === 'keystone' && e.tier >= 6 && !L.milestones[`t${e.tier}-` + e.family]) L.milestones[`t${e.tier}-` + e.family] = Math.round(t);
    }
  });
  const maxS = o.maxS ?? 3600;
  const goalCar = o.untilCar ?? 'muscle';
  const done = () => (o.untilWin ? (g.state.events[o.untilWin]?.wins ?? 0) > 0 : g.state.owned.includes(goalCar as never));

  const findPair = (): [SlotRef, SlotRef] | null => {
    const refs: { r: SlotRef; f: Family; t: number }[] = [];
    g.state.board.forEach((p, i) => p && refs.push({ r: { zone: 'board', i }, f: p.f, t: p.t }));
    g.state.tray.forEach((p, i) => p && refs.push({ r: { zone: 'tray', i }, f: p.f, t: p.t }));
    const goal = P.goalStatus(g.state);
    // goal family first, then low tiers
    refs.sort((a, b) => (Number(b.f === goal?.family) - Number(a.f === goal?.family)) || a.t - b.t);
    for (let x = 0; x < refs.length; x++) for (let y = x + 1; y < refs.length; y++) {
      const a = refs[x], b = refs[y];
      if (a.f === b.f && a.t === b.t && a.t < MAX_TIER) {
        // drop tray parts onto board parts
        return a.r.zone === 'tray' ? [a.r, b.r] : [b.r, a.r];
      }
    }
    return null;
  };

  /** A fitted part that would pair with a lone bench part of the same family and tier comes off the car to merge. */
  const unfitForPair = (): boolean => {
    if (B.freeSlots(g.state) < 1) return false;
    const bench = B.allParts(g.state);
    for (const car of g.state.owned) {
      for (const f of ACTIVE_FAMILIES) {
        const p = g.state.installed?.[car]?.[f];
        if (!p || p.t >= MAX_TIER) continue;
        const twins = bench.filter((q) => q.f === f && q.t === p.t).length;
        if (twins === 1) { g.removePart(car, f, undefined, now); spend(COST.merge); return true; }
      }
    }
    return false;
  };

  const scrapJunk = (): boolean => {
    // scrap the lowest-value bench part, keeping the goal family
    const goal = P.goalStatus(g.state);
    let best: { r: SlotRef; v: number } | null = null;
    const consider = (r: SlotRef) => {
      const p = B.getPart(g.state, r);
      if (!p) return;
      const v = p.t * 10 + (p.f === goal?.family ? 100 : 0);
      if (!best || v < best.v) best = { r, v };
    };
    g.state.board.forEach((_, i) => consider({ zone: 'board', i }));
    g.state.tray.forEach((_, i) => consider({ zone: 'tray', i }));
    if (!best) return false;
    g.scrap((best as { r: SlotRef }).r, now);
    L.scraps++;
    spend(COST.scrap);
    return true;
  };

  /** For an open course, race the owned car that is fastest there (a player reads the course type). */
  const pickCar = (ev: RaceEvent) => {
    const raced = ev.knockout ? eventById(ev.knockout.heats[g.state.knockout?.heat ?? 0]) : ev;
    const topCap = Math.max(...g.state.owned.map((c) => carById(c).cap));
    const cands = g.state.owned.filter((c) => carById(c).cap >= topCap - 2);
    if (cands.length < 2) return;
    let pick = g.state.activeCar, bestT = Infinity;
    for (const car of cands) {
      const trial = structuredClone(g.state); fitRec(trial, car);
      const lo = computeLoadout(trial, car, undefined, raced.partCap ?? ev.partCap);
      const probe = new RaceSim({ eventId: raced.id, seed: 7, player: { name: 'p', car, stats: lo.stats, paint: '#fff', perfectMul: carById(car).perfectMul }, nitroCharges: 2, shift: 'clean', rivalShift: P.rivalShiftFor(raced), analysis: false });
      drive(probe, 'perfect');
      const tt = raced.speedTrap ? -(probe.trapSpeed ?? 0) : (probe.player.finishTime ?? 99);
      if (tt < bestT) { bestT = tt; pick = car; }
    }
    if (pick !== g.state.activeCar) g.setActiveCar(pick, now);
  };

  while (t < maxS && !done()) {
    o.onStep?.(g, t);
    if (g.state.pendingReveal) { spend(4); g.finishReveal(g.state.pendingReveal, now); }
    if (g.state.crates.length && B.freeSlots(g.state) > 0) { g.openCrates(now); spend(COST.think); }
    // Merge All when available and useful
    if (P.mergeAllUnlocked(g.state) && B.hasAnyPair(g.state)) {
      const pairs = B.mergeAll(structuredClone(g.state)).filter((e) => e.type === 'fuse').length;
      if (pairs >= 3) { g.mergeAll(now); L.merges += pairs; spend(COST.buy); continue; }
    }
    const pair = findPair();
    if (pair) {
      g.move(pair[0], pair[1], now);
      L.merges++;
      if (!L.milestones.firstMerge) L.milestones.firstMerge = Math.round(t + COST.merge);
      spend(COST.merge);
      continue;
    }
    if (g.state.owned.length >= 2 && unfitForPair()) continue;
    // upgrades
    let bought = false;
    for (const u of UPGRADES) {
      if (!P.upgradeShown(g.state, u)) continue;
      const c = P.upgradeCost(g.state, u.id);
      if (c !== null && g.state.cash >= c + 40) { g.buyUpgrade(u.id, now); bought = true; log(`${t.toFixed(0)}s upgrade ${u.id} $${c}`); spend(COST.buy); break; }
    }
    if (bought) continue;
    if (o.policy === 'none' || o.tune) {
      const car = g.state.activeCar;
      const st = g.state.tune?.[car] ?? 0;
      if (st < TUNE_STAGES && g.state.cash >= tunePrice(car, st) + 100 && L.lossRaces > 2) { g.buyTune(car, now); log(`${t.toFixed(0)}s tune ${car} ${st + 1} $${tunePrice(car, st)}`); spend(COST.buy); continue; }
    }
    const goal = P.goalStatus(g.state);
    // scrap → targeted crate toward the keystone
    if (goal && !goal.keystoneDone && g.state.scrap >= 15) { g.buyCrate('targeted', goal.family, now); spend(COST.buy); continue; }
    if (goal && !goal.keystoneDone && o.buyParts !== false) {
      const tt = Math.min(B.orderMaxTier(g.state), goal.tier - 1);
      const price = PART_ORDER_PRICE[tt];
      const have = [...g.state.board, ...g.state.tray].filter((q) => q && q.f === goal.family && q.t === tt).length;
      if (have < 2 && g.state.cash >= price + 200 && B.freeSlots(g.state) > 0) { g.orderPart(goal.family, tt, now); log(`${t.toFixed(0)}s order ${goal.family} T${tt} $${price}`); spend(COST.buy); continue; }
    }
    // board pressure: scrap junk when nearly full and crates waiting
    if (B.freeSlots(g.state) <= 2 && g.state.crates.length) { if (scrapJunk()) continue; }
    // race
    const ev = P.recommendedEvent(g.state);
    if (o.quickRace !== false && !g.state.pendingQuick && P.canQuickRace(g.state, ev)) {
      g.fitRecommended(g.state.activeCar, now);
      g.quickRace(ev.id, now);
      countEvent(ev.id);
      L.quick++;
      spend(COST.quick);
      continue;
    }
    // class meets: take the earlier car out, then go back to the best car
    const sw = P.eventUnlocked(g.state, ev).switchCar;
    const home = g.state.activeCar;
    if (sw) g.setActiveCar(sw, now);
    else if (!ev.carOnly) pickCar(ev);
    g.fitRecommended(g.state.activeCar, now); // the Fit Parts view's one-tap recommended fit
    const setup = g.startRace(ev.id, now);
    if (!setup) { g.setActiveCar(home, now); L.waiting += 1; spend(1); continue; }
    if (!ev.knockout || (g.state.knockout?.heat ?? 0) === 0) countEvent(ev.id); // a knockout's heats are one attempt
    if (!L.firstLaunch) L.firstLaunch = Math.round(t);
    // 'mixed' models a human: every other race the boost lands just after the window, and the shifts a beat late
    const shift: ShiftPolicy = o.shift === 'mixed' ? (L.races % 2 ? 'ordinary' : 'clean') : (o.shift ?? 'ordinary');
    const policy: NitroPolicy = o.policy === 'mixed' ? (L.races % 2 ? 'late' : 'perfect') : (o.policy ?? 'perfect');
    const raced = eventById(setup.eventId);
    const sim = new RaceSim({ ...setup, shift, rivalShift: P.rivalShiftFor(raced), analysis: false });
    const out = drive(sim, policy);
    spend((out.playerTime ?? 30) + COST.raceOverhead);
    const wonBefore = (g.state.events[ev.id]?.wins ?? 0) > 0;
    const res = g.commitRace(g.pendingRaceId!, out, now);
    const car = g.state.activeCar;
    g.setActiveCar(g.state.owned.includes(home) ? home : car, now);
    if (g.state.pendingReveal) g.setActiveCar(g.state.pendingReveal, now);
    L.races++;
    L.liveStarts[raced.id] = (L.liveStarts[raced.id] ?? 0) + 1;
    if (res?.place === 1) L.liveWins[raced.id] = (L.liveWins[raced.id] ?? 0) + 1;
    if (res && res.place > 1) L.lossRaces++;
    if (!wonBefore && !ev.timeAttack && !ev.speedTrap) {
      const lostHeat = ev.knockout ? !!res?.heat && !res.heat.advanced : (res?.place ?? 1) > 1;
      lossStreak[ev.id] = lostHeat ? (lossStreak[ev.id] ?? 0) + 1 : 0;
      L.maxLossStreak = Math.max(L.maxLossStreak, lossStreak[ev.id]);
    }
    if (!L.milestones.firstRace) L.milestones.firstRace = Math.round(t);
    if (res?.boss) L.milestones[`boss-${raced.boss?.rival}`] = Math.round(t);
    if (res?.boss && raced.boss?.rival === 'ray') L.milestones.ray = Math.round(t);
    if (res?.place === 1 && !L.milestones[`win-${ev.id}`]) L.milestones[`win-${ev.id}`] = Math.round(t);
    const lo2 = computeLoadout(g.state, car, undefined, raced.partCap);
    log(`${t.toFixed(0)}s race ${raced.id} P${res?.place} ${res?.gapText} +$${res?.cash} +${res?.rep}rep [${car} E${lo2.equipped.engine?.t ?? 0}T${lo2.equipped.tires?.t ?? 0}U${lo2.equipped.turbo?.t ?? 0} tune${g.state.tune?.[car] ?? 0} ${shift}/${policy} nitro${setup.nitroCharges} perf${out.perfects}] rep=${g.state.rep} $${g.state.cash}`);
  }
  B.luck.force = null;
  return L;
}

export const fmtMin = (s: number | undefined) => (s ? `${(s / 60).toFixed(1)}m` : '—');
export type { CarId };
