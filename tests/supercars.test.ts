// Azure Riviera and T10 (master update): the three supercars' unlock ladder, each car on the course that suits it,
// T10 through every system that reads tiers, no free-value loop at any tier, scrap restoration, the purchase and
// progress data helpers, the away budget in the new chapter, and old saves loading intact.
import { describe, expect, it } from 'vitest';
import * as B from '../src/core/board';
import * as F from '../src/core/fabrication';
import { Game } from '../src/core/game';
import * as J from '../src/core/jobs';
import * as M from '../src/core/milestones';
import * as P from '../src/core/progression';
import * as PJ from '../src/core/projects';
import * as PU from '../src/core/purchases';
import { MemoryKV, encodeSave, saveKey } from '../src/core/save';
import { GameState, migrate, newGame, validateState } from '../src/core/state';
import type { LeanOutcome } from '../src/core/state';
import { DELIVER_POLISHED, DELIVER_SHARE } from '../src/data/jobs';
import { concoursCost } from '../src/data/fabrication';
import {
  CARS, CarId, DISTRICTS, ENABLED_CARS, EVENTS, MAX_TIER, PART_ORDER_PRICE, SCRAP_VALUE, TRACKS, carById, eventById,
  onCashStep, polishCost, scrapOrderCost, tunePrice,
} from '../src/data/tables';
import { emptyGame, put, at } from './helpers';
import { LADDER_BUILDS, probeEvent } from './ladder';

const T0 = 1_700_000_000_000;
const SUPER: CarId[] = ['vireo', 'mako', 'sovereign'];
const outcome = (o: Partial<LeanOutcome> = {}): LeanOutcome => ({ place: 1, playerTime: 20, gapText: '', perfects: 0, nitroUsed: 0, standings: [], advice: null, ...o });
const commit = (s: GameState, eventId: string, o: Partial<LeanOutcome> = {}) => {
  s.pendingRace = { id: 9, eventId, car: s.activeCar, seed: 9, startedAt: T0 };
  return P.commitRace(s, { raceId: 9, mode: 'live', outcome: outcome(o) }, []);
};

/** A save that owns the ladder up to `last`, every event it can enter won (rivals beaten). */
function stage(last: CarId): GameState {
  const s = emptyGame();
  const ladder = ENABLED_CARS.map((c) => c.id);
  s.owned = ladder.slice(0, ladder.indexOf(last) + 1);
  s.activeCar = last; s.revealed = [...s.owned];
  s.rep = carById(last).unlock?.rep ?? 0;
  s.stars = { 'neon-mile': 7, 'skyline-run': 7, 'stock-cup': 7 };
  for (let k = 0; k < 8; k++) for (const e of EVENTS) {
    if (e.heatOf || s.events[e.id]) continue;
    if (!P.eventUnlocked({ ...s, activeCar: e.carOnly ?? s.activeCar }, e).ok) continue;
    s.events[e.id] = { wins: 1, starts: 1, bestPlace: 1, bestTime: 20 };
    if (e.boss) s.bosses.push(e.boss.rival);
  }
  s.offline.lastSeenAt = T0;
  return s;
}

describe('the supercar ladder', () => {
  it('the three supercars are enabled in the Azure Riviera, after the Halcyon X, the Sovereign capped at T10', () => {
    const ids = ENABLED_CARS.map((c) => c.id);
    // 1.9 Circuit: the Ardent sits beside the Halcyon, the Meridian beside the Sovereign, the Tempest last
    expect(ids.slice(-8)).toEqual(['gt', 'ardent', 'proto', 'vireo', 'mako', 'meridian', 'sovereign', 'tempest']);
    expect(DISTRICTS.riviera.enabled).toBe(true);
    for (const id of SUPER) expect(carById(id).district).toBe('riviera');
    expect(carById('sovereign').cap).toBe(10);
    expect(MAX_TIER).toBe(10);
    // Rep rises along the ladder
    for (let i = 1; i < ENABLED_CARS.length; i++) expect(ENABLED_CARS[i].unlock!.rep).toBeGreaterThan(ENABLED_CARS[i - 1].unlock?.rep ?? -1);
  });

  it('each needs Rep, a crafted keystone and a won event — Rep alone never unlocks it', () => {
    for (const id of SUPER) {
      const c = CARS.find((x) => x.id === id)!;
      const s = emptyGame();
      s.owned = ENABLED_CARS.slice(0, ENABLED_CARS.indexOf(c)).map((x) => x.id);
      s.crafted = []; s.rep = c.unlock!.rep + 1;
      P.checkUnlocks(s, []);
      expect(s.owned, id).not.toContain(id);
      s.crafted.push(`${c.unlock!.family}:${c.unlock!.tier}`);
      P.checkUnlocks(s, []);
      expect(s.owned, id).not.toContain(id);
      s.events[c.unlock!.event!] = { wins: 1, starts: 1, bestPlace: 1, bestTime: 20 };
      P.checkUnlocks(s, []);
      expect(s.owned, id).toContain(id);
    }
  });

  it('the event that earns each car is raced in the car before it, and the chapter opens in order', () => {
    expect(carById('vireo').unlock!.event).toBe('summit-gala');
    expect(eventById(carById('mako').unlock!.event!).requires.car).toBe('vireo');
    expect(eventById(carById('sovereign').unlock!.event!).requires.car).toBe('mako');
    const s = stage('proto');
    for (const id of ['corniche', 'port-sprint', 'grand-riviera', 'ta-corniche', 'riviera-night']) expect(P.eventUnlocked(s, eventById(id)).ok, id).toBe(false);
    s.owned.push('vireo'); s.activeCar = 'vireo';
    expect(P.eventUnlocked(s, eventById('corniche')).ok).toBe(true);
    expect(P.eventUnlocked(s, eventById('port-sprint')).ok).toBe(false);
    s.owned.push('mako');
    expect(P.eventUnlocked(s, eventById('port-sprint')).ok).toBe(true);
    expect(P.eventUnlocked(s, eventById('grand-riviera')).ok).toBe(false);
    s.owned.push('sovereign');
    expect(P.eventUnlocked(s, eventById('grand-riviera')).ok).toBe(true);
    // rivals shift clean in the Riviera
    for (const id of ['corniche', 'port-sprint', 'grand-riviera']) expect(P.rivalShiftFor(eventById(id))).toBe('clean');
  });

  it('winning the Grand Riviera pays its rival reward once: cash, the Riviera Gold paint and the badge', () => {
    const s = stage('sovereign');
    s.bosses = s.bosses.filter((b) => b !== 'aurelia');
    delete s.events['grand-riviera'];
    const cash = s.cash;
    const r = commit(s, 'grand-riviera', { place: 1 })!;
    expect(r.boss).toBe(true);
    expect(s.blueprints).toContain('Riviera Gold');
    expect(s.badges).toContain('Riviera Champion');
    expect(s.cash - cash).toBe(r.cash);
    const again = commit(s, 'grand-riviera', { place: 1 })!;
    expect(again.boss).toBe(false);
    expect(s.badges.filter((b) => b === 'Riviera Champion').length).toBe(1);
  });

  it('each supercar is the one to beat on its own course (full builds, clean shifts, Perfect boosts)', () => {
    const t = (ev: string, i: number) => probeEvent(ev, LADDER_BUILDS[ev][i], 'clean', 'perfect', 2).time;
    // Vireo: tight and technical — clear of the Halcyon and the Mako on the Corniche Hairpins
    expect(t('corniche', 0)).toBeLessThan(t('corniche', 1) - 0.5);
    expect(t('corniche', 0)).toBeLessThan(t('corniche', 2) - 0.25);
    // Mako: the long launch and slow corners of the Port Sprint — clear of the Vireo and the Halcyon
    expect(t('port-sprint', 0)).toBeLessThan(t('port-sprint', 1) - 0.25);
    expect(t('port-sprint', 0)).toBeLessThan(t('port-sprint', 2) - 0.6);
    // Sovereign: the long, fast Grand Riviera — clear of the Mako, even on its arrival build
    expect(t('grand-riviera', 0)).toBeLessThan(t('grand-riviera', 2) - 0.2);
    expect(t('grand-riviera', 1)).toBeLessThan(t('grand-riviera', 2) - 0.8); // and far clear on a full T10 build
    // the Vireo is short of the Halcyon's top speed on a long straight (its handling line says so)
    const top = (car: CarId) => probeEvent('mesa-trap', { car, tiers: [9, 9, 9], label: '' }, 'clean', 'perfect', 1).trap;
    expect(top('vireo')).toBeLessThan(top('proto'));
    // and the Riviera tracks exist and are long enough to race
    for (const id of ['corniche', 'port', 'grand'] as const) expect(TRACKS[id].segments.reduce((a, x) => a + x.length, 0)).toBeGreaterThan(600);
  });
});

describe('T10 through every system', () => {
  it('two T9s merge into a T10 (counted as crafted); a T10 is the top and never merges', () => {
    const s = emptyGame();
    put(s, 0, 0, 'engine', 9); put(s, 0, 1, 'engine', 9);
    B.moveOrFuse(s, at(s, 0, 0), at(s, 0, 1), 0);
    expect(s.board[1]).toMatchObject({ f: 'engine', t: 10 });
    expect(B.craftedTier(s, 'engine')).toBe(10);
    put(s, 0, 0, 'engine', 10);
    const ev = B.moveOrFuse(s, at(s, 0, 0), at(s, 0, 1), 0);
    expect(ev[0]).toMatchObject({ type: 'invalid' });
    expect(B.mergeBlocker(s.board[0], s.board[1])).toMatch(/T10/);
  });

  it('orders: T9 sells only once the Sovereign is the goal or owned; T10 is never sold; crates never hold T10', () => {
    expect(B.orderMaxTier(stage('gt'))).toBe(8);
    expect(B.orderMaxTier(stage('proto'))).toBe(8); // the Vireo's keystone is T9: it is merged, not bought
    expect(B.orderMaxTier(stage('mako'))).toBe(9); // the Sovereign's T10 Engine: two bought T9s make it
    const sov = stage('sovereign');
    expect(B.orderMaxTier(sov)).toBe(9);
    sov.cash = 999999;
    expect(B.orderPart(sov, 'engine', 10)[0]).toMatchObject({ type: 'invalid' });
    sov.scrap = 999999;
    expect(B.scrapOrder(sov, 'engine', 10)[0]).toMatchObject({ type: 'invalid' });
    expect(B.orderPart(sov, 'tires', 9).some((e) => e.type === 'place')).toBe(true);
    expect(sov.cash).toBe(999999 - PART_ORDER_PRICE[9]);
    for (let i = 0; i < 200; i++) { const c = B.crateContents(sov, { kind: 'std', source: 'printer' }); expect(c.t).toBeLessThanOrEqual(3); }
    // the catch-up crate is at most one tier below the goal's keystone
    const s = stage('mako');
    s.catchup = { goal: null, effort: 0, bestTier: 0, claimed: [] };
    put(s, 0, 0, 'engine', 9);
    for (let k = 0; k < 400; k++) P.addEffort(s, 1, []);
    const cc = s.crates.find((c) => c.kind === 'catchup');
    expect(cc?.tier).toBeLessThanOrEqual(9);
  });

  it('prices that read the tier: kits, build points, tune-ups, jobs and the Keep / Recycle list handle T10', () => {
    const sov = stage('sovereign');
    expect(F.kitPrice(sov)).toBe(Math.floor(SCRAP_VALUE[10] / 2 / 5) * 5);
    expect(PJ.donorPoints({ t: 10, q: 'std' }, 'sovereign')).toBe(4);
    expect(PJ.donorPoints({ t: 9, q: 'std' }, 'sovereign')).toBe(2);
    expect(PJ.donorPoints({ t: 10, q: 'std' }, 'vireo')).toBe(8);
    for (const c of SUPER) for (let k = 0; k < 3; k++) expect(onCashStep(tunePrice(c, k))).toBe(true);
    // jobs at the Sovereign stage ask for at most T9 (a part you can still hold), and the reward part is at most T9
    for (let seed = 1; seed < 300; seed++) {
      const j = J.makeJob(sov, seed, seed);
      if (j.kind === 'deliver') { expect(j.tier!).toBeLessThanOrEqual(9); expect(onCashStep(j.cash)).toBe(true); }
    }
    expect(J.rewardPart(sov).tier).toBeLessThanOrEqual(9);
    // a spare T10 is listed with its exact scrap value
    put(sov, 0, 0, 'turbo', 10);
    expect(P.spareParts(sov).find((u) => u.part.t === 10)!.scrap).toBe(SCRAP_VALUE[10]);
    expect(validateState(sov)).toEqual([]);
  });
});

describe('no buy / recycle / order / deliver / polish loop creates value, at any tier', () => {
  it('sweeps every tier T1–T10', () => {
    for (let t = 1; t <= MAX_TIER; t++) {
      const sv = SCRAP_VALUE[t];
      // scrap order → recycle loses scrap; polish never pays back
      expect(scrapOrderCost(t), `T${t}`).toBeGreaterThan(sv);
      expect(polishCost(t) + scrapOrderCost(t)).toBeGreaterThan(sv);
      // merging two ordered parts and recycling the result loses scrap
      if (t < MAX_TIER) expect(SCRAP_VALUE[t + 1]).toBeLessThan(2 * scrapOrderCost(t));
      if (!PART_ORDER_PRICE[t]) continue; // T10 is never sold
      const price = PART_ORDER_PRICE[t];
      // cash order → delivery job: half the order price at most (Polished: 0.7×, and polish costs scrap on top)
      expect(price * DELIVER_SHARE).toBeLessThan(price);
      expect(price * DELIVER_SHARE * DELIVER_POLISHED).toBeLessThan(price);
      // cash order → recycle: scrap never turns back into cash, and a scrap re-order costs more than the recycle paid
      expect(scrapOrderCost(t)).toBeGreaterThan(sv);
      // two of a tier always cost less than the next tier (merging stays the cheap route; buying never undercuts it)
      if (PART_ORDER_PRICE[t + 1]) expect(PART_ORDER_PRICE[t + 1]).toBeGreaterThan(2 * price);
      // a T(t) scrap-ordered and delivered pays cash, but scrap can't be bought back: the loop never closes
      // (buy for cash → recycle → scrap order → deliver returns less cash than it started with)
      const cashBack = price * DELIVER_SHARE * (sv / scrapOrderCost(t));
      expect(cashBack).toBeLessThan(price);
    }
  });

  it('runs the loops through the real rules at T9 and T10 and ends poorer every time', () => {
    const s = stage('sovereign');
    s.cash = 100000; s.scrap = 5000;
    const total = () => s.cash + s.scrap; // a generous yardstick (a scrap is worth far less than $1)
    const before = total();
    B.orderPart(s, 'engine', 9);
    const p = B.allParts(s).find((x) => x.f === 'engine' && x.t === 9)!;
    B.recycleParts(s, [p.id]);
    expect(total()).toBeLessThan(before);
    const s2 = s.scrap;
    B.scrapOrder(s, 'turbo', 9);
    const q = B.allParts(s).find((x) => x.f === 'turbo' && x.t === 9)!;
    B.polishPart(s, q.id);
    B.recycleParts(s, [q.id]);
    expect(s.scrap).toBeLessThan(s2);
    // two T9 orders merged into a T10 and recycled: far less scrap than the cash spent, and less than re-ordering
    const c0 = s.cash, sc0 = s.scrap;
    B.orderPart(s, 'tires', 9); B.orderPart(s, 'tires', 9);
    const two = B.allParts(s).filter((x) => x.f === 'tires' && x.t === 9);
    const refs = two.map((x) => { const i = s.board.findIndex((y) => y?.id === x.id); return { zone: 'board' as const, i }; });
    B.moveOrFuse(s, refs[0], refs[1], 0);
    const t10 = B.allParts(s).find((x) => x.f === 'tires' && x.t === 10)!;
    B.recycleParts(s, [t10.id]);
    expect(s.cash).toBe(c0 - 2 * PART_ORDER_PRICE[9] + 20); // a T10 merge pays $20
    expect(s.scrap - sc0).toBe(SCRAP_VALUE[10]);
    expect(s.scrap - sc0).toBeLessThan(2 * scrapOrderCost(9));
  });
});

describe('Keep / Recycle preview and bulk recycle', () => {
  it('the preview shows the exact scrap a bulk recycle pays, and both skip fitted and starred parts', () => {
    const s = stage('sovereign');
    s.scrap = 0;
    const a = put(s, 0, 0, 'engine', 10), b = put(s, 0, 1, 'tires', 7), c = put(s, 0, 2, 'turbo', 3);
    B.toggleFavorite(s, b.id);
    const fittedId = s.installed.sovereign?.engine?.id ?? (() => { s.installed.sovereign = { engine: { id: s.nextPartId++, f: 'engine', t: 10, q: 'std' } }; return s.installed.sovereign.engine!.id; })();
    const ids = [a.id, b.id, c.id, fittedId, 99999];
    const pv = B.recyclePreview(s, ids);
    expect(pv).toEqual({ count: 2, scrap: SCRAP_VALUE[10] + SCRAP_VALUE[3], starred: 1, fitted: 1, missing: 1 });
    B.recycleParts(s, ids);
    expect(s.scrap).toBe(pv.scrap);
    expect(B.allParts(s).some((p) => p.id === b.id)).toBe(true);
    expect(s.installed.sovereign!.engine!.id).toBe(fittedId);
    // a second tap on the same ids adds nothing
    expect(B.recyclePreview(s, ids).scrap).toBe(0);
    B.recycleParts(s, ids);
    expect(s.scrap).toBe(pv.scrap);
  });
});

describe('Concours restoration (scrap)', () => {
  it('charges the shown scrap once per stage, in order, never cash; the third stage earns the badge once', () => {
    const s = stage('muscle');
    s.cash = 1234; s.scrap = 10000;
    for (let k = 0; k < 3; k++) {
      const info = PU.purchaseInfo(s, 'restore:muscle')!;
      expect(info.currency).toBe('scrap');
      expect(info.price).toBe(concoursCost(5, k));
      const before = s.scrap;
      expect(PJ.restoreCar(s, 'muscle')[0]).toMatchObject({ type: 'styleBought' });
      expect(s.scrap).toBe(before - info.price);
      expect(s.cash).toBe(1234);
    }
    expect(s.badges.filter((b) => b === 'Concours Ironhorse 455').length).toBe(1);
    expect(PJ.restoreCar(s, 'muscle')[0]).toMatchObject({ type: 'invalid' });
    expect(PU.purchaseInfo(s, 'restore:muscle')!.maxed).toBe(true);
  });

  it('is locked before the fourth car, refused when short, and a sink worth having late (Sovereign stages)', () => {
    const early = stage('hothatch');
    early.scrap = 9999;
    expect(PJ.restoreCar(early, 'hothatch')[0]).toMatchObject({ type: 'invalid' });
    expect(PU.purchaseInfo(early, 'restore:hothatch')!.locked).toBeTruthy();
    const s = stage('sovereign');
    s.scrap = 10;
    expect(PJ.restoreCar(s, 'sovereign')[0]).toMatchObject({ type: 'invalid', reason: expect.stringMatching(/more scrap/) });
    expect(s.concours?.sovereign ?? 0).toBe(0);
    expect([0, 1, 2].map((k) => concoursCost(10, k))).toEqual([1535, 3070, 5120]);
  });
});

describe('purchase info matches what the rules charge', () => {
  it('for every purchase on sale, buying it changes the wallet by exactly the shown price', () => {
    const s = stage('sovereign');
    s.cash = 2_000_000; s.scrap = 200_000;
    put(s, 0, 0, 'engine', 6);
    const cat = PU.purchaseCatalog(s);
    expect(cat.length).toBeGreaterThan(50);
    const buy = (g: GameState, id: string) => {
      const [k, a, b] = id.split(':');
      switch (k) {
        case 'upgrade': return P.buyUpgrade(g, a as never);
        case 'order': return B.orderPart(g, a as never, Number(b));
        case 'scrapOrder': return B.scrapOrder(g, a as never, Number(b));
        case 'crate': return B.buyCrate(g, a as never, b as never);
        case 'tune': return P.buyTune(g, a as CarId);
        case 'kit': return F.fabricate(g, a as never);
        case 'restore': return PJ.restoreCar(g, a as CarId);
      }
      return null;
    };
    let checked = 0;
    for (const item of cat.filter((x) => x.canBuy)) {
      const g = structuredClone(s);
      const ev = buy(g, item.id);
      if (!ev) continue;
      expect(ev.some((e) => e.type === 'invalid'), item.id).toBe(false);
      const spent = item.currency === 'cash' ? s.cash - g.cash : s.scrap - g.scrap;
      expect(spent, item.id).toBe(item.price);
      checked++;
    }
    expect(checked).toBeGreaterThan(40);
    // locked items say why, and buying them is refused
    const locked = PU.purchaseInfo(s, 'order:engine:10');
    expect(locked).toBeNull(); // T10 has no price: it is never sold
    const t9early = PU.purchaseInfo(stage('gt'), 'order:engine:9')!;
    expect(t9early.locked).toBeTruthy();
    expect(t9early.canBuy).toBe(false);
    const short = PU.purchaseInfo({ ...stage('muscle'), cash: 100 }, 'tune:muscle')!;
    expect(short.short).toBe(tunePrice('muscle', 0) - 100);
  });
});

describe('progress summary and the next milestone', () => {
  it('a fresh save: the Corsa Rojo, with Rep, the T3 Tires keystone and nothing else needed', () => {
    const s = newGame(T0, 1);
    const m = M.nextMilestone(s)!;
    expect(m.kind).toBe('car');
    expect(m.car).toBe('beater');
    expect(m.needs.map((n) => n.kind)).toEqual(['rep', 'keystone']);
    const sum = M.progressSummary(s);
    expect(sum.earned.rep).toBe(0);
    expect(sum.wallet).toEqual({ cash: 0, scrap: 0 });
    expect(sum.earned.cars.total).toBe(ENABLED_CARS.length);
  });

  it('after the Halcyon: the Vireo needs the Summit Gala win and says what it opens', () => {
    const s = stage('proto');
    s.bosses = s.bosses.filter((b) => b !== 'iver');
    delete s.events['summit-gala'];
    s.rep = 14000; s.crafted.push('tires:9');
    const m = M.nextMilestone(s)!;
    expect(m.car).toBe('vireo');
    const ev = m.needs.find((n) => n.kind === 'event')!;
    expect(ev).toMatchObject({ kind: 'event', event: 'summit-gala', done: false, open: true, boss: 'Anders Kvale' });
    expect(m.needs.find((n) => n.kind === 'rep')).toMatchObject({ have: 14000, need: 15000, done: false });
    expect(m.needs.find((n) => n.kind === 'keystone')).toMatchObject({ family: 'tires', tier: 9, done: true });
    expect(m.unlocks.join(' ')).toMatch(/Corniche Hairpins/);
    expect(m.ready).toBe(false);
  });

  it('the Sovereign: a T10 Engine to craft, with T9 orders open; then the Grand Riviera finale, then collection', () => {
    const s = stage('mako');
    s.crafted = s.crafted.filter((k) => !k.startsWith('engine:10'));
    // 1.9: the Meridian and the Sovereign are both open after the Mako; the Meridian is first unless you pick
    expect(P.chaseableCars(s).map((c) => c.id)).toEqual(['meridian', 'sovereign']);
    s.goalPick = 'sovereign';
    const m = M.nextMilestone(s)!;
    expect(m.car).toBe('sovereign');
    expect(m.needs.find((n) => n.kind === 'keystone')).toMatchObject({ tier: 10, orderTier: 9, done: false });
    expect(m.unlocks[0]).toMatch(/T10/);
    const all = stage('tempest');
    all.bosses = all.bosses.filter((b) => b !== 'vesna');
    const f = M.nextMilestone(all)!;
    expect(f).toMatchObject({ kind: 'finale', title: 'Launch Control' });
    all.bosses.push('vesna');
    expect(M.nextMilestone(all)?.kind ?? 'collection').toBe('collection');
    const sum = M.progressSummary(all);
    expect(sum.earned.topCarCap).toBe(10);
    expect(sum.earned.maxTier).toBe(10);
    expect(sum.ladder.at(-1)).toMatchObject({ car: 'tempest', owned: true });
  });
});

describe('away cash in the Riviera stays one bounded budget', () => {
  it('a night away pays at most two win purses — far short of a single T9 order or a Tune-up of the new cars', () => {
    for (const car of SUPER) {
      const s = stage(car);
      for (const lock of [0, 1]) {
        s.upgrades.lockup = lock;
        const t = structuredClone(s);
        P.accrueOffline(t, T0 + 24 * 3600_000);
        const purse = P.stagePurse(s).cash;
        expect(t.offline.pendingCash).toBe(P.offlineBudget(s));
        expect(t.offline.pendingCash).toBeLessThanOrEqual(2 * purse);
        expect(t.offline.pendingCash).toBeLessThan(PART_ORDER_PRICE[9] / 4);
        expect(t.offline.pendingCash).toBeLessThan(tunePrice(car, 0));
        expect(onCashStep(t.offline.pendingCash)).toBe(true);
      }
    }
  });
});

describe('old saves', () => {
  it('a pre-update Halcyon save loads with its cash, scrap, parts and cars intact, and the Vireo as its goal', () => {
    const s = stage('proto');
    s.cash = 76625; s.scrap = 3171; s.rep = 14230;
    put(s, 0, 0, 'engine', 9); put(s, 0, 1, 'turbo', 8);
    s.installed.proto = { engine: { id: s.nextPartId++, f: 'engine', t: 9, q: 'polished' }, tires: { id: s.nextPartId++, f: 'tires', t: 9, q: 'std' } };
    const raw = JSON.parse(JSON.stringify(s));
    delete raw.concours;
    const kv = new MemoryKV();
    kv.setItem(saveKey('/Rev-Up/'), encodeSave(raw));
    const g = new Game(kv, '/Rev-Up/', T0 + 1000);
    expect(g.state.cash).toBe(76625);
    expect(g.state.scrap).toBe(3171);
    expect(g.state.rep).toBe(14230);
    expect(g.state.owned).toEqual(s.owned);
    expect(B.allParts(g.state).map((p) => `${p.f}${p.t}`).sort()).toEqual(['engine9', 'turbo8']);
    expect(g.state.installed.proto?.engine).toMatchObject({ t: 9, q: 'polished' });
    expect(g.state.concours).toBeUndefined();
    expect(M.nextMilestone(g.state)?.car).toBe('vireo');
  });

  it('a malformed restoration record is cleaned, not fatal', () => {
    const s = newGame(T0, 3) as GameState & { concours: unknown };
    (s as { concours: unknown }).concours = { muscle: 7, junker: 'x', tuner: -2 };
    const m = migrate(JSON.parse(JSON.stringify(s)))!;
    expect(m).not.toBeNull();
    expect(m.concours).toEqual({ muscle: 3 });
  });
});
