// Scripted beginner-ish player used to measure milestone times from a clean save.
// Time costs approximate a real phone session: a drag ≈1.3 s, a live race = race time + 7 s of menus.
import * as B from '../src/core/board';
import { Game } from '../src/core/game';
import { computeLoadout } from '../src/core/loadout';
import * as P from '../src/core/progression';
import { NitroPolicy, RaceSim } from '../src/core/race';
import { MemoryKV } from '../src/core/save';
import { MAX_TIER, UPGRADES, eventById, Family } from '../src/data/tables';
import type { SlotRef } from '../src/core/events';

export interface BotLog {
  milestones: Record<string, number>; // sim seconds from start
  races: number;
  quick: number;
  merges: number;
  scraps: number;
  catchups: number;
  lossRaces: number;
  log: string[];
}

export interface BotOpts {
  seed: number;
  untilCar?: string;
  maxS?: number;
  policy?: NitroPolicy;
  quickRace?: boolean;
  forceStd?: boolean;
}

const COST = { merge: 1.3, scrap: 1.5, buy: 2.5, raceOverhead: 7, quick: 5, think: 1 };

export function runBot(o: BotOpts): BotLog {
  B.luck.force = o.forceStd === false ? null : 'std';
  const kv = new MemoryKV();
  let now = 1_000_000;
  const g = new Game(kv, '/test/', now, undefined);
  g.state.rng = o.seed;
  g.state.raceSeed = o.seed * 31;
  const L: BotLog = { milestones: {}, races: 0, quick: 0, merges: 0, scraps: 0, catchups: 0, lossRaces: 0, log: [] };
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
      left -= step;
    }
  };
  g.subscribe((ev) => {
    for (const e of ev) {
      if (e.type === 'quickDone' && g.quickResult) {
        const r = g.quickResult;
        if (r.place > 1) L.lossRaces++;
        L.races++;
        if (L.log.length < 400) L.log.push(`${t.toFixed(0)}s quick ${r.eventId} P${r.place} +$${r.cash} +${r.rep}rep rep=${g.state.rep}`);
      }
      if (e.type === 'unlock') {
        L.milestones[e.car] = Math.round(t);
        L.log.push(`${t.toFixed(0)}s unlock ${e.car} (rep ${g.state.rep}, cash ${g.state.cash})`);
      }
      if (e.type === 'catchup') { L.catchups++; L.log.push(`${t.toFixed(0)}s catch-up crate ${e.family} T${e.tier}`); }
    }
  });
  const maxS = o.maxS ?? 3600;
  const goalCar = o.untilCar ?? 'muscle';

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

  const scrapJunk = (): boolean => {
    // scrap the lowest-value part not of the goal family and not equipped
    const goal = P.goalStatus(g.state);
    const lo = computeLoadout(g.state);
    const eqIds = new Set(Object.values(lo.equipped).map((p) => p!.id));
    let best: { r: SlotRef; v: number } | null = null;
    const consider = (r: SlotRef) => {
      const p = B.getPart(g.state, r);
      if (!p || eqIds.has(p.id)) return;
      let v = p.t * 10 + (p.f === goal?.family ? 100 : 0);
      // keep at most one lonely high part per family
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

  while (t < maxS && !g.state.owned.includes(goalCar as never)) {
    if (g.state.pendingReveal) { spend(4); g.finishReveal(g.state.pendingReveal, now); }
    if (g.state.crates.length && B.freeSlots(g.state) > 0) { g.openCrates(now); spend(COST.think); }
    // Merge All when available and useful
    if (P.mergeAllUnlocked(g.state) && B.hasAnyPair(g.state)) {
      const pairs = (() => { let c = 0; const s = structuredClone(g.state); while (true) { const ev = B.mergeAll(s); const n = ev.filter(e => e.type==='fuse').length; c += n; break; } return c; })();
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
    // upgrades
    let bought = false;
    for (const id of ['printer', 'crateTier', 'grid'] as const) {
      const c = P.upgradeCost(g.state, id);
      if (c !== null && g.state.cash >= c + 40) { g.buyUpgrade(id, now); bought = true; L.log.push(`${t.toFixed(0)}s upgrade ${id}`); spend(COST.buy); break; }
    }
    if (bought) continue;
    const goal = P.goalStatus(g.state);
    // scrap → targeted crate toward the keystone
    if (goal && !goal.keystoneDone && g.state.scrap >= 15) { g.buyCrate('targeted', goal.family, now); spend(COST.buy); continue; }
    if (goal && !goal.keystoneDone && g.state.cash >= 300) { g.buyCrate('cash', goal.family, now); spend(COST.buy); continue; }
    // board pressure: scrap junk when nearly full and crates waiting
    if (B.freeSlots(g.state) <= 2 && g.state.crates.length) { if (scrapJunk()) continue; }
    // race
    const ev = P.recommendedEvent(g.state);
    if (g.state.pendingQuick) { spend(1); continue; } // crew is out; keep merging as crates arrive
    if (o.quickRace !== false && P.canQuickRace(g.state, ev)) {
      g.quickRace(ev.id, now);
      L.quick++;
      spend(COST.quick);
      continue;
    }
    const setup = g.startRace(ev.id, now);
    if (!setup) { spend(1); continue; }
    const sim = new RaceSim(setup);
    const policy = o.policy ?? 'perfect';
    while (!sim.done) {
      if (policy !== 'none' && sim.charges > 0 && sim.player.nitroLeft <= 0) {
        const { active } = sim.windowState();
        if (policy === 'perfect' && active && !sim.usedWindows.has(active.segIndex)) sim.tapNitro();
      }
      sim.step();
    }
    const out = sim.outcome();
    spend((out.playerTime ?? 30) + COST.raceOverhead);
    const res = g.commitRace(g.pendingRaceId!, out, now);
    L.races++;
    if (res && res.place > 1) L.lossRaces++;
    if (!L.milestones.firstRace) L.milestones.firstRace = Math.round(t);
    if (res?.boss) L.milestones.ray = Math.round(t);
    if (L.log.length < 400) L.log.push(`${t.toFixed(0)}s race ${ev.id} P${res?.place} ${res?.gapText} +$${res?.cash} +${res?.rep}rep [${g.state.activeCar}] rep=${g.state.rep}`);
  }
  B.luck.force = null;
  void eventById; void UPGRADES;
  return L;
}
