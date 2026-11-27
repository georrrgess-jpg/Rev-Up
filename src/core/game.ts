import * as I from './install';
import { eventById } from '../data/tables';
import * as S from './style';
import type { UpgradeId } from '../data/tables';
import { CREW_NITRO, CarId, Family, OFFLINE_MIN_S, carById } from '../data/tables';
import * as B from './board';
import type { GameEvent, SlotRef } from './events';
import { computeLoadout } from './loadout';
import * as P from './progression';
import * as RR from './rivalRuns';
import * as F from './fabrication'; // Scrap & surplus
import * as PJ from './projects'; // Scrap & surplus
import * as J from './jobs'; // Job Board (New mechanic)
import * as G from './goals'; // 1.9 Next Goal
import * as SH from './shelf'; // 1.9 Parts Shelf
import { settleTutorialForExistingSave } from './tutorial';
import { RaceOutcome, RaceSetup, RaceSim, leanOutcome } from './race';
import { KV, LoadResult, loadGame, writeGame } from './save';
import type { GameState, LastResult } from './state';

export type Listener = (events: GameEvent[], s: GameState) => void;

/**
 * Transactional wrapper: each action runs on a draft copy, commits only if it
 * completes, then persists once. UI subscribes to resolved events.
 */
export class Game {
  state: GameState;
  readonly load: LoadResult;
  conflict = false;
  lastInputAt: number;
  private listeners = new Set<Listener>();
  private lastSave = 0;
  onConflict?: () => void;

  constructor(private kv: KV, private scope: string, now: number, initial?: GameState) {
    this.load = initial ? { state: initial, status: 'loaded' } : loadGame(kv, scope, now);
    this.state = this.load.state;
    this.lastInputAt = now;
    // A race in flight at reload is abandoned: no payout, no charges spent.
    this.state.pendingRace = null;
    P.accrueOffline(this.state, now);
    J.settleJobs(this.state, now, []); // Job Board: refills due while away (one job per slot, clock clamped)
    settleTutorialForExistingSave(this.state);
    const ev: GameEvent[] = [];
    P.checkUnlocks(this.state, ev, false); // 1.9: unlock stages pay in the next transaction, never on load
    this.persist(now);
    this.settleQuick(now);
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private persist(now: number) {
    if (this.conflict) return false;
    P.heartbeat(this.state, now);
    const r = writeGame(this.kv, this.scope, this.state);
    if (r === 'conflict') {
      this.conflict = true;
      this.onConflict?.();
      return false;
    }
    this.lastSave = now;
    return r === 'ok';
  }

  transact(fn: (d: GameState) => GameEvent[] | void, now = Date.now()): GameEvent[] {
    if (this.conflict) return [{ type: 'invalid', reason: 'Rev Up is open in another tab' }];
    const draft = structuredClone(this.state);
    const events = fn(draft) || [];
    if (events.length === 1 && events[0].type === 'invalid') {
      this.emit(events);
      return events;
    }
    P.checkUnlocks(draft, events);
    autoOpen(draft, events);
    this.state = draft;
    this.persist(now);
    this.emit(events);
    return events;
  }

  emit(events: GameEvent[]) {
    for (const l of this.listeners) l(events, this.state);
  }

  input(now = Date.now()) { this.lastInputAt = now; }

  // ---------- Garage ----------
  move(from: SlotRef, to: SlotRef, now = Date.now()) {
    this.input(now);
    return this.transact((d) => {
      const ev = B.moveOrFuse(d, from, to, now);
      if (ev.some((e) => e.type === 'fuse')) {
        if (!d.stats.milestones.firstMerge) d.stats.milestones.firstMerge = Math.max(1, Math.round(d.activeS));
        J.onMerges(d, ev.filter((e) => e.type === 'fuse').length, now, ev); // Job Board
        ev.push(...B.openCrates(d));
      }
      return ev;
    }, now);
  }
  scrap(at: SlotRef, now = Date.now()) {
    this.input(now);
    return this.transact((d) => {
      const ev = B.scrapPart(d, at);
      ev.push(...B.openCrates(d));
      return ev;
    }, now);
  }
  openCrates(now = Date.now()) {
    this.input(now);
    return this.transact((d) => B.openCrates(d), now);
  }
  buyCrate(kind: 'std' | 'targeted' | 'cash', family?: Family, now = Date.now()) {
    this.input(now);
    return this.transact((d) => B.buyCrate(d, kind, family), now);
  }
  /** Merge every pair; `family` (Bench rank 2, Batch merge) merges that family only. */
  mergeAll(now = Date.now(), family?: Family) {
    this.input(now);
    if (!P.mergeAllUnlocked(this.state)) return [{ type: 'invalid', reason: 'Finish five races to unlock Merge All' } as GameEvent];
    return this.transact((d) => {
      const ev = B.mergeAll(d, family);
      J.onMerges(d, ev.filter((e) => e.type === 'fuse').length, now, ev); // Job Board
      ev.push(...B.openCrates(d));
      return ev;
    }, now);
  }
  /** Order a part for cash; `polished` (Workshop rank 2) delivers it Polished for 1.5× (price: B.orderPrice). */
  orderPart(family: Family, tier: number, now = Date.now(), polished = false) {
    this.input(now);
    return this.transact((d) => B.orderPart(d, family, tier, polished), now);
  }
  // ---- 1.9 Next Goal (core/goals.ts) and the Parts Shelf (core/shelf.ts)
  /** Pick the goal to chase (a key from goals.goalOptions: a car id or 'challenge:<event>'), or null for the
   *  recommendation. An unknown key changes nothing. */
  pickGoal(key: string | null, now = Date.now()) {
    if (key !== null && !G.canPickGoal(this.state, key)) return [{ type: 'invalid', reason: 'That goal is not open yet' } as GameEvent];
    return this.transact((d) => { d.goalPick = key; return []; }, now);
  }
  /** Move a bench / rack part onto the shelf (refused when the shelf is full). */
  storePart(from: SlotRef, now = Date.now()) {
    this.input(now);
    return this.transact((d) => { const ev = SH.storePart(d, from); if (!(ev.length === 1 && ev[0].type === 'invalid')) ev.push(...B.openCrates(d)); return ev; }, now);
  }
  /** Store several bench / rack parts by id (as many as fit). */
  storeParts(ids: number[], now = Date.now()) {
    this.input(now);
    return this.transact((d) => { const ev = SH.storeParts(d, ids); if (!(ev.length === 1 && ev[0].type === 'invalid')) ev.push(...B.openCrates(d)); return ev; }, now);
  }
  /** Parts Shelf rank 3: every over-cap bench part onto the shelf. */
  storeOverCap(now = Date.now()) {
    this.input(now);
    return this.transact((d) => { const ev = SH.storeOverCap(d); if (!(ev.length === 1 && ev[0].type === 'invalid')) ev.push(...B.openCrates(d)); return ev; }, now);
  }
  /** Move a shelf part back to the bench (first free cell, or `to`). Refused when there is no room. */
  unstorePart(id: number, to?: SlotRef, now = Date.now()) {
    this.input(now);
    return this.transact((d) => SH.unstorePart(d, id, to), now);
  }
  /** Trade surplus parts (shelf, bench or rack; never fitted or starred) for one part of a known family and tier. */
  tradeParts(ids: number[], family: Family, tier: number, now = Date.now()) {
    this.input(now);
    return this.transact((d) => { const ev = SH.tradeParts(d, ids, family, tier); if (!(ev.length === 1 && ev[0].type === 'invalid')) ev.push(...B.openCrates(d)); return ev; }, now);
  }
  /** Contribute surplus parts as credit toward a Garage upgrade's next rank. */
  contributeParts(ids: number[], id: UpgradeId, now = Date.now()) {
    this.input(now);
    return this.transact((d) => { const ev = SH.contributeParts(d, ids, id); if (!(ev.length === 1 && ev[0].type === 'invalid')) ev.push(...B.openCrates(d)); return ev; }, now);
  }
  /** Recycle surplus parts and place the chosen scrap order once the scrap covers it (one transaction). */
  recycleToward(ids: number[], family: Family, tier: number, now = Date.now()) {
    this.input(now);
    return this.transact((d) => { const ev = SH.recycleToward(d, ids, family, tier); if (!(ev.length === 1 && ev[0].type === 'invalid')) ev.push(...B.openCrates(d)); return ev; }, now);
  }
  // ---- end 1.9
  // ---------- Workshop: scrap (Pit Stop) ----------
  /** Order a chosen family and tier for scrap (exact cost: scrapOrderCost). */
  scrapOrder(family: Family, tier: number, now = Date.now()) {
    this.input(now);
    return this.transact((d) => B.scrapOrder(d, family, tier), now);
  }
  /** Polish a standard part (bench, rack or fitted) for scrap. */
  polishPart(id: number, now = Date.now()) {
    this.input(now);
    return this.transact((d) => B.polishPart(d, id), now);
  }
  /** Recycle several unfitted, unstarred parts in one transaction. */
  recycleParts(ids: number[], now = Date.now()) {
    this.input(now);
    return this.transact((d) => {
      const ev = B.recycleParts(d, ids);
      if (ev.length === 1 && ev[0].type === 'invalid') return ev;
      ev.push(...B.openCrates(d));
      return ev;
    }, now);
  }
  // ---- Scrap & surplus: Build Sheets (core/projects.ts) and the Fab bench (core/fabrication.ts)
  /** Donate a bench / rack part to a car's Build Sheet (gone for good; a repeat tap finds nothing). */
  donatePart(id: number, car: CarId, now = Date.now()) {
    this.input(now);
    return this.transact((d) => {
      const ev = PJ.donatePart(d, id, car);
      if (ev.length === 1 && ev[0].type === 'invalid') return ev;
      ev.push(...B.openCrates(d));
      return ev;
    }, now);
  }
  /** Donate several bench / rack parts, each to its best build (one transaction). */
  donateBest(ids: number[], now = Date.now()) {
    this.input(now);
    return this.transact((d) => {
      const ev = PJ.donateBest(d, ids);
      if (ev.length === 1 && ev[0].type === 'invalid') return ev;
      ev.push(...B.openCrates(d));
      return ev;
    }, now);
  }
  /** Make one race-day kit for scrap. */
  fabricate(kit: F.KitId, now = Date.now()) {
    this.input(now);
    return this.transact((d) => F.fabricate(d, kit), now);
  }
  /** Arm / disarm a kit for the next live race. */
  armKit(kit: F.KitId, on: boolean, now = Date.now()) {
    return this.transact((d) => F.armKit(d, kit, on), now);
  }
  // ---- end Scrap & surplus
  // ---- Job Board (New mechanic; rules in core/jobs.ts)
  /** Hand in a spare part for a delivery job; pays at once, exactly once (the slot must still hold this job). */
  deliverJob(jobId: number, partId?: number, now = Date.now()) {
    this.input(now);
    return this.transact((d) => {
      const ev = J.deliverJob(d, jobId, now, partId);
      if (ev.length === 1 && ev[0].type === 'invalid') return ev;
      ev.push(...B.openCrates(d));
      return ev;
    }, now);
  }
  /** Skip a job: its slot refills after a short wait; the streak stays. */
  skipJob(jobId: number, now = Date.now()) {
    this.input(now);
    return this.transact((d) => J.skipJob(d, jobId, now), now);
  }
  // ---- end Job Board
  toggleFavorite(id: number, now = Date.now()) {
    return this.transact((d) => B.toggleFavorite(d, id), now);
  }
  buyStyle(itemId: string, car: CarId, now = Date.now()) {
    this.input(now);
    return this.transact((d) => S.buyStyle(d, itemId, car), now);
  }
  applyStyle(itemId: string | null, car: CarId, kind?: 'wheel' | 'material' | 'livery', now = Date.now()) {
    return this.transact((d) => S.applyStyle(d, itemId, car, kind), now);
  }
  installPart(car: CarId, from: SlotRef, now = Date.now()) {
    this.input(now);
    return this.transact((d) => I.installPart(d, car, from), now);
  }
  removePart(car: CarId, family: Family, to?: SlotRef, now = Date.now()) {
    this.input(now);
    return this.transact((d) => I.removePart(d, car, family, to), now);
  }
  movePartBetweenCars(fromCar: CarId, family: Family, toCar: CarId, now = Date.now()) {
    this.input(now);
    return this.transact((d) => I.movePartBetweenCars(d, fromCar, family, toCar), now);
  }
  fitRecommended(car: CarId = this.state.activeCar, now = Date.now()) {
    this.input(now);
    return this.transact((d) => I.fitRecommended(d, car), now);
  }
  buyTune(car: CarId, now = Date.now()) {
    this.input(now);
    return this.transact((d) => P.buyTune(d, car), now);
  }
  buyUpgrade(id: UpgradeId, now = Date.now()) {
    this.input(now);
    return this.transact((d) => P.buyUpgrade(d, id), now);
  }
  tick(dtS: number, now = Date.now()) {
    if (this.conflict) return;
    this.settleQuick(now);
    const ev: GameEvent[] = [];
    const draft = structuredClone(this.state);
    // A visible tab whose timers stopped (the device slept without hiding the page) counts that gap as away time
    // once, through the same bounded rule as a reload; a running tab keeps lastSeenAt current, so nothing else counts.
    if (now - draft.offline.lastSeenAt >= OFFLINE_MIN_S * 1000 && P.accrueOffline(draft, now)) ev.push({ type: 'offline', amount: draft.offline.pendingCash });
    P.tick(draft, dtS, now, this.lastInputAt, ev);
    J.tickJobs(draft, dtS, now, this.lastInputAt, ev); // Job Board: refills and the streak
    if (ev.some((e) => e.type === "printer")) autoOpen(draft, ev);
    if (ev.length) {
      P.checkUnlocks(draft, ev);
      this.state = draft;
      this.persist(now);
      this.emit(ev);
    } else {
      this.state = draft;
      if (now - this.lastSave > 10_000) this.persist(now);
    }
  }

  // ---------- Race ----------
  startRace(eventId: string, now = Date.now()): RaceSetup | null {
    this.input(now);
    let setup: RaceSetup | null = null;
    this.transact((d) => {
      const r = P.startRace(d, eventId, now);
      if (!r.ok) return [{ type: 'invalid', reason: r.why }];
      const raced = eventById(r.eventId);
      const lo = computeLoadout(d, d.activeCar, undefined, raced.partCap ?? eventById(raced.heatOf ?? raced.id).partCap);
      const cls = carById(d.activeCar);
      setup = {
        eventId: r.eventId,
        seed: d.pendingRace!.seed,
        player: { name: 'You', car: d.activeCar, stats: lo.stats, paint: d.paints[d.activeCar] ?? cls.paint, perfectMul: cls.perfectMul },
        nitroCharges: d.nitro + CREW_NITRO,
        rivalShift: P.rivalShiftFor(raced), // tuned per event: clean rivals from the Coastal Highway on
        windowScale: d.stats.races === 0 ? 1.6 : 1, // the first race is practice: wider windows
      };
      setup = F.applyKits(d, d.pendingRace!.id, setup!); // ---- Scrap & surplus: armed Fab bench kits ride in this race
      return [];
    }, now);
    return setup;
  }
  get pendingRaceId() { return this.state.pendingRace?.id ?? null; }
  commitRace(raceId: number, outcome: RaceOutcome, now = Date.now()): LastResult | null {
    if (this.rivalRace?.id === raceId) return this.commitRivalRun(raceId, outcome, now); // Rival Runs hook
    this.input(now);
    let res: LastResult | null = null;
    this.transact((d) => {
      const ev: GameEvent[] = [];
      const nitroBefore = d.nitro; // Scrap & surplus: canister charges never come out of the bank
      const jobCar = d.pendingRace?.car ?? d.activeCar; // Job Board
      res = P.commitRace(d, { raceId, mode: 'live', outcome: leanOutcome(outcome) }, ev);
      if (res) J.onRace(d, J.raceSummary(raceId, outcome, jobCar, (res as LastResult).eventId), now, ev); // Job Board: in the race's single-use commit
      if (res) ev.push(...F.consumeKits(d, raceId, nitroBefore, outcome.nitroUsed ?? 0));
      return ev;
    }, now);
    return res;
  }
  /** Start a background Quick Race: same simulation, no nitro, pays its base payout after its real duration. */
  quickRace(eventId: string, now = Date.now()): GameEvent[] {
    this.input(now);
    return this.transact((d) => {
      const r = P.reserveQuick(d, eventId);
      if (!r.ok) return [{ type: 'invalid', reason: r.why }];
      const lo = computeLoadout(d, d.activeCar, undefined, eventById(eventId).partCap);
      const sim = new RaceSim({ eventId, seed: r.seed, player: { name: 'You', car: d.activeCar, stats: lo.stats, paint: '#fff' }, nitroCharges: 0, rivalShift: P.rivalShiftFor(eventById(eventId)) });
      const out = sim.finish();
      const dur = (out.playerTime ?? sim.t) * 1000;
      d.pendingQuick = { id: r.seed, eventId, car: d.activeCar, startedAt: now, endsAt: now + dur, outcome: leanOutcome(out) };
      return [];
    }, now);
  }
  quickResult: LastResult | null = null;
  private settleQuick(now: number) {
    const q = this.state.pendingQuick;
    if (!q) return;
    // Resolve when due, or immediately if the clock moved backwards past the start.
    if (now < q.endsAt && now >= q.startedAt) return;
    this.transact((d) => {
      const ev: GameEvent[] = [];
      this.quickResult = P.commitRace(d, { raceId: q.id, mode: 'quick', outcome: q.outcome }, ev);
      ev.push({ type: 'quickDone' });
      return ev;
    }, now);
  }
  abandonRace(now = Date.now()) {
    this.rivalRace = null;
    this.transact((d) => { d.pendingRace = null; return []; }, now);
  }

  // ---- Rival Runs (Pit Stop; rules in core/rivalRuns.ts) ----
  /** The Rival Run being driven (in memory only: a race in flight at reload is abandoned anyway). */
  private rivalRace: { id: number; run: string } | null = null;
  /** Name of the Rival Run being driven, for the race header (null in an ordinary race). */
  get rivalRunName(): string | null { return this.rivalRace ? RR.runName(this.rivalRace.run) : null; }
  /** The last committed Rival Run, for the result card. */
  rivalRunResult: RR.RivalRunResult | null = null;
  /** Start a Rival Run with `car`: the run's car rule, part cap and nitro are applied to the setup. */
  startRivalRun(runId: string, car: CarId, now = Date.now()): RaceSetup | null {
    this.input(now);
    let setup: RaceSetup | null = null;
    this.transact((d) => {
      const r = RR.startRivalRun(d, runId, car, now);
      if (!r.ok) return [{ type: 'invalid', reason: r.why }];
      setup = r.setup;
      return [];
    }, now);
    const st = setup as RaceSetup | null;
    this.rivalRace = st ? { id: st.seed, run: runId } : null;
    return st;
  }
  private commitRivalRun(raceId: number, outcome: RaceOutcome, now: number): LastResult | null {
    this.input(now);
    const run = this.rivalRace!.run;
    this.rivalRace = null;
    let last: LastResult | null = null;
    this.transact((d) => {
      const ev: GameEvent[] = [];
      const r = RR.commitRivalRun(d, raceId, run, outcome, ev);
      if (r) J.onRace(d, J.raceSummary(raceId, outcome, r.result.car, r.last.eventId, true), now, ev); // Job Board: shifts and Perfects count
      if (r) { this.rivalRunResult = r.result; last = r.last; }
      return ev;
    }, now);
    return last;
  }

  // ---------- Cars ----------
  finishReveal(car: CarId, now = Date.now()) {
    this.transact((d) => {
      if (d.pendingReveal !== car) return [];
      if (!d.revealed.includes(car)) d.revealed.push(car);
      d.pendingReveal = d.owned.find((id) => !d.revealed.includes(id)) ?? null;
      return [];
    }, now);
  }
  setActiveCar(car: CarId, now = Date.now()) {
    this.transact((d) => {
      if (d.owned.includes(car)) d.activeCar = car;
      return [];
    }, now);
  }
  setPaint(car: CarId, paint: string | null, now = Date.now()) {
    this.transact((d) => {
      if (!d.owned.includes(car)) return [];
      if (paint) d.paints[car] = paint;
      else delete d.paints[car];
      return [];
    }, now);
  }

  // ---------- Misc ----------
  claimOffline(now = Date.now()) {
    let amount = 0;
    this.transact((d) => {
      amount = P.claimOffline(d);
      return amount ? [{ type: 'cash', amount, reason: 'offline' }] : [];
    }, now);
    return amount;
  }
  setSetting<K extends keyof GameState['settings']>(k: K, v: GameState['settings'][K]) {
    this.transact((d) => { d.settings[k] = v; return []; });
  }
  /** Replay the guide: contextual tips show again; progress-based beats stay derived from state. */
  resetTips(now = Date.now()) {
    this.transact((d) => { d.tips = { crates: !!d.tips.crates }; return []; }, now);
  }
  markTip(id: string) {
    if (this.state.tips[id]) return;
    this.transact((d) => { d.tips[id] = true; return []; });
  }
  replaceState(s: GameState, now = Date.now()) {
    // Import: adopt the save but keep our revision ahead of storage.
    s.rev = Math.max(s.rev, this.state.rev);
    s.pendingRace = null;
    s.pendingQuick = null;
    this.state = s;
    P.heartbeat(s, now);
    this.persist(now);
    this.emit([]);
  }
  saveNow(now = Date.now()) { this.persist(now); }
  /** Called when the page becomes visible again: accrue any away time as an offline claim. */
  resume(now = Date.now()) {
    if (this.conflict) return;
    this.transact((d) => { P.accrueOffline(d, now); const ev: GameEvent[] = []; J.settleJobs(d, now, ev); return ev; }, now); // + Job Board refills
  }
}

/** Crates unpack themselves whenever there is room, once the player has made a first merge. */
function autoOpen(d: GameState, events: GameEvent[]) {
  if (!d.stats.milestones.firstMerge || !d.crates.length || !B.firstFree(d)) return;
  events.push(...B.openCrates(d).filter((e) => e.type !== 'crateBlocked'));
}
