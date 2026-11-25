import { CREW_NITRO, CarId, Family, carById } from '../data/tables';
import * as B from './board';
import type { GameEvent, SlotRef } from './events';
import { computeLoadout } from './loadout';
import * as P from './progression';
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
    const ev: GameEvent[] = [];
    P.checkUnlocks(this.state, ev);
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
  mergeAll(now = Date.now()) {
    this.input(now);
    if (!P.mergeAllUnlocked(this.state)) return [{ type: 'invalid', reason: 'Finish five races to unlock Merge All' } as GameEvent];
    return this.transact((d) => {
      const ev = B.mergeAll(d);
      ev.push(...B.openCrates(d));
      return ev;
    }, now);
  }
  buyUpgrade(id: 'grid' | 'printer' | 'crateTier', now = Date.now()) {
    this.input(now);
    return this.transact((d) => P.buyUpgrade(d, id), now);
  }
  tick(dtS: number, now = Date.now()) {
    if (this.conflict) return;
    this.settleQuick(now);
    const ev: GameEvent[] = [];
    const draft = structuredClone(this.state);
    P.tick(draft, dtS, now, this.lastInputAt, ev);
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
      const lo = computeLoadout(d, d.activeCar);
      const cls = carById(d.activeCar);
      setup = {
        eventId,
        seed: d.pendingRace!.seed,
        player: { name: 'You', car: d.activeCar, stats: lo.stats, paint: d.paints[d.activeCar] ?? cls.paint },
        nitroCharges: d.nitro + CREW_NITRO,
      };
      return [];
    }, now);
    return setup;
  }
  get pendingRaceId() { return this.state.pendingRace?.id ?? null; }
  commitRace(raceId: number, outcome: RaceOutcome, now = Date.now()): LastResult | null {
    this.input(now);
    let res: LastResult | null = null;
    this.transact((d) => {
      const ev: GameEvent[] = [];
      res = P.commitRace(d, { raceId, mode: 'live', outcome: leanOutcome(outcome) }, ev);
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
      const lo = computeLoadout(d, d.activeCar);
      const sim = new RaceSim({ eventId, seed: r.seed, player: { name: 'You', car: d.activeCar, stats: lo.stats, paint: '#fff' }, nitroCharges: 0 });
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
    this.transact((d) => { d.pendingRace = null; return []; }, now);
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
    this.transact((d) => { P.accrueOffline(d, now); return []; }, now);
  }
}

/** Crates unpack themselves whenever there is room, once the player has made a first merge. */
function autoOpen(d: GameState, events: GameEvent[]) {
  if (!d.stats.milestones.firstMerge || !d.crates.length || !B.firstFree(d)) return;
  events.push(...B.openCrates(d).filter((e) => e.type !== 'crateBlocked'));
}
