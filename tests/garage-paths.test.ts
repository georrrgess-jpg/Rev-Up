// 1.9 Circuit (Progression): Next Goal, unlock stages with real payouts, the persistence route, the Parts Shelf and its
// surplus uses, Garage upgrade paths, and old saves loading intact.
import { describe, expect, it } from 'vitest';
import * as B from '../src/core/board';
import { Game } from '../src/core/game';
import * as G from '../src/core/goals';
import * as P from '../src/core/progression';
import * as SH from '../src/core/shelf';
import { MemoryKV, encodeSave, saveKey } from '../src/core/save';
import { GameState, migrate, validateState } from '../src/core/state';
import type { LeanOutcome } from '../src/core/state';
import {
  CONTRIBUTE_CASH_PER_SCRAP, ENABLED_CARS, EVENTS, PART_ORDER_PRICE, SCRAP_VALUE, roundCash, SHELF_SLOTS, UPGRADES, carById, onCashStep, scrapOrderCost,
} from '../src/data/tables';
import { at, emptyGame, put } from './helpers';

const T0 = 1_700_000_000_000;
const outcome = (o: Partial<LeanOutcome> = {}): LeanOutcome => ({ place: 1, playerTime: 20, gapText: '', perfects: 0, nitroUsed: 0, standings: [], advice: null, ...o });
const commit = (s: GameState, eventId: string, o: Partial<LeanOutcome> = {}) => {
  s.pendingRace = { id: 9, eventId, car: s.activeCar, seed: 9, startedAt: T0 };
  return P.commitRace(s, { raceId: 9, mode: 'live', outcome: outcome(o) }, []);
};

/** A save that owns the ladder up to `last` (branch cars before it included), every enterable event won. */
function stage(last: string): GameState {
  const s = emptyGame();
  const ladder = ENABLED_CARS.map((c) => c.id);
  s.owned = ladder.slice(0, ladder.indexOf(last as never) + 1);
  s.activeCar = last as never; s.revealed = [...s.owned];
  s.rep = carById(last as never).unlock?.rep ?? 0;
  s.stars = { 'neon-mile': 7, 'skyline-run': 7, 'stock-cup': 7 };
  for (let k = 0; k < 8; k++) for (const e of EVENTS) {
    if (e.heatOf || s.events[e.id]) continue;
    if (!P.eventUnlocked({ ...s, activeCar: e.carOnly ?? s.activeCar }, e).ok) continue;
    s.events[e.id] = { wins: 1, starts: 1, bestPlace: 1, bestTime: 20 };
    if (e.boss) s.bosses.push(e.boss.rival);
  }
  for (const c of s.owned) { const u = carById(c).unlock; if (u) for (let t = 2; t <= u.tier; t++) if (!s.crafted.includes(`${u.family}:${t}`)) s.crafted.push(`${u.family}:${t}`); }
  s.stagesPaid = ENABLED_CARS.filter((c) => s.owned.includes(c.id)).flatMap((c) => P.carStages(c).map((d) => d.key));
  return s;
}

describe('the ladder: branches and the three Circuit supercars', () => {
  it('the Ardent opens beside the Halcyon, the Meridian beside the Sovereign, the Tempest last', () => {
    expect(P.chaseableCars(stage('gt')).map((c) => c.id)).toEqual(['ardent', 'proto']);
    expect(P.chaseableCars(stage('mako')).map((c) => c.id)).toEqual(['meridian', 'sovereign']);
    const sov = stage('sovereign');
    expect(P.chaseableCars(sov).map((c) => c.id)).toEqual(['tempest']);
    for (const id of ['ardent', 'meridian', 'tempest'] as const) {
      const c = carById(id);
      expect(c.enabled).toBe(true);
      expect(c.handling).toBeTruthy();
    }
    expect(carById('tempest').cap).toBe(10);
    // Launch Control, the Tempest's own final, needs the Tempest and pays a rival reward
    const lf = EVENTS.find((e) => e.id === 'launch-final')!;
    expect(lf.requires.car).toBe('tempest');
    expect(lf.boss?.reward.cash).toBeGreaterThan(0);
  });

  it('an unlocked branch car does not block the other: both unlock when ready, in any order', () => {
    const s = stage('gt');
    s.rep = 14000; s.crafted.push('turbo:8', 'turbo:9');
    s.events['summit-1000'] = { wins: 1, starts: 1, bestPlace: 1, bestTime: 30 };
    const ev: never[] = [];
    P.checkUnlocks(s, ev);
    expect(s.owned).toEqual(expect.arrayContaining(['ardent', 'proto']));
  });

  it('the goal pick decides which branch car the garage works toward', () => {
    const s = stage('gt');
    expect(P.nextCar(s)!.id).toBe('ardent');
    s.goalPick = 'proto';
    expect(P.nextCar(s)!.id).toBe('proto');
    expect(P.goalStatus(s)!.car.id).toBe('proto');
    s.goalPick = 'vireo'; // not chaseable yet: ignored
    expect(P.nextCar(s)!.id).toBe('ardent');
  });
});

describe('Next Goal', () => {
  it('lists every chaseable car and a challenge, with the documented shape', () => {
    const s = stage('gt');
    const opts = G.goalOptions(s);
    expect(opts.map((g) => g.key)).toEqual(expect.arrayContaining(['ardent', 'proto']));
    for (const g of opts) {
      expect(typeof g.title).toBe('string');
      expect(g.why.length).toBeGreaterThan(10);
      expect(g.reward.length).toBeGreaterThan(5);
      expect(g.progress).toBeGreaterThanOrEqual(0);
      expect(g.progress).toBeLessThanOrEqual(1);
      expect(g.action.label.length).toBeGreaterThan(3);
      expect(Array.isArray(g.stages)).toBe(true);
    }
    const ardent = opts.find((g) => g.key === 'ardent')!;
    expect(ardent.why).toMatch(/tight|technical|light/i); // strengths before you invest
    expect(ardent.stages.at(-1)!.label).toMatch(/Ardent Spyder/);
    expect(opts.filter((g) => g.recommended)).toHaveLength(1);
  });

  it('pickGoal sets and clears the pick through the Game; an unknown key changes nothing', () => {
    const kv = new MemoryKV();
    kv.setItem(saveKey('/g/'), encodeSave(stage('gt')));
    const g = new Game(kv, '/g/', T0);
    g.pickGoal('proto', T0);
    expect(g.state.goalPick).toBe('proto');
    expect(G.currentGoal(g.state)!.key).toBe('proto');
    const ev = g.pickGoal('tempest', T0);
    expect(ev[0].type).toBe('invalid');
    expect(g.state.goalPick).toBe('proto');
    g.pickGoal(null, T0);
    expect(G.currentGoal(g.state)!.recommended).toBe(true);
  });

  it('recommends the missing piece: an affordable order, then the race it needs, then Rep', () => {
    const s = stage('gt');
    s.goalPick = 'proto';
    s.crafted = s.crafted.filter((k) => !k.startsWith('turbo:8') && !k.startsWith('turbo:9'));
    s.cash = 100_000;
    expect(G.currentGoal(s)!.action).toMatchObject({ kind: 'order', family: 'turbo', tier: 8, currency: 'cash' });
    s.cash = 0; s.scrap = 0;
    expect(G.currentGoal(s)!.action.kind).toBe('race');
    s.crafted.push('turbo:9');
    delete s.events['summit-1000'];
    expect(G.currentGoal(s)!.action).toMatchObject({ kind: 'race', eventId: 'summit-1000' });
  });

  it('offers an alternative when the target race has stalled', () => {
    const s = stage('gt');
    s.goalPick = 'proto';
    s.crafted.push('turbo:8', 'turbo:9');
    s.events['summit-1000'] = { wins: 0, starts: 3, bestPlace: 4, bestTime: 30 };
    s.cash = 50_000;
    const g = G.currentGoal(s)!;
    expect(g.action).toMatchObject({ kind: 'race', eventId: 'summit-1000' });
    expect(g.alt).toBeTruthy();
    expect(g.alt!.kind).not.toBe('race');
  });

  it('hints vary by screen', () => {
    const s = stage('gt');
    s.cash = 100_000;
    s.crafted = s.crafted.filter((k) => !k.startsWith('turbo:8'));
    const lines = (['garage', 'race', 'shop', 'results', 'showroom'] as const).map((k) => G.hintFor(s, k).text);
    expect(new Set(lines).size).toBe(lines.length);
  });
});

describe('unlock stages pay real things, once', () => {
  it('the halfway Rep stage hands over a keystone ingredient; the keystone stage a free Tune-up', () => {
    const s = stage('gt');
    s.stagesPaid = s.stagesPaid!.filter((k) => !k.startsWith('proto:') && !k.startsWith('ardent:'));
    s.crafted = s.crafted.filter((k) => !k.startsWith('turbo:8') && !k.startsWith('turbo:9'));
    const half = P.carStages(carById('proto')).find((d) => d.id === 'half')!;
    s.rep = (half.test as { rep: number }).rep;
    const tuneBefore = s.tune.gt ?? 0;
    P.checkUnlocks(s, []);
    expect(s.stagesPaid).toContain('proto:half');
    expect(B.allParts(s).some((p) => p.f === 'turbo' && p.t === 7)).toBe(true);
    s.crafted.push('turbo:8', 'turbo:9');
    P.checkUnlocks(s, []);
    expect(s.stagesPaid).toContain('proto:key');
    expect(s.tune.gt ?? 0).toBeGreaterThan(tuneBefore);
    const n = s.stagesPaid!.length;
    P.checkUnlocks(s, []);
    expect(s.stagesPaid!.length).toBe(n); // nothing pays twice
  });

  it('every major car from the Vexa on has stages, each with a reward the UI can name', () => {
    for (const c of ENABLED_CARS.filter((x) => (x.unlock?.rep ?? 0) >= 500)) {
      const st = P.carStages(c);
      expect(st.length, c.id).toBeGreaterThanOrEqual(2);
      for (const d of st) expect(P.stageRewardText(stage('junker'), d.reward).length, d.key).toBeGreaterThan(3);
    }
  });

  it('stages are not back-paid when an older save loads', () => {
    const s = stage('gt');
    s.stagesPaid = undefined as never;
    s.rep = 20000;
    const kv = new MemoryKV();
    kv.setItem(saveKey('/o/'), encodeSave(s));
    const g = new Game(kv, '/o/', T0);
    expect(g.state.stagesPaid ?? []).toEqual([]);
    expect(g.state.cash).toBe(s.cash);
  });

  it('persistence: three live podiums in a car\'s unlock race count as done (the rival reward still needs the win)', () => {
    const s = stage('gt');
    s.goalPick = 'proto';
    s.crafted.push('turbo:8', 'turbo:9');
    s.rep = 20000;
    delete s.events['summit-1000'];
    for (let k = 0; k < 2; k++) commit(s, 'summit-1000', { place: 2 });
    expect(s.owned).not.toContain('proto');
    expect(P.goalStatus(s)!.line).toMatch(/1 more podium/);
    commit(s, 'summit-1000', { place: 3 });
    expect(s.owned).toContain('proto');
  });
});

describe('the Parts Shelf', () => {
  it('stores and returns parts; nothing is duplicated; a full shelf refuses without changing anything', () => {
    const s = emptyGame();
    const a = put(s, 0, 0, 'engine', 4);
    expect(SH.storePart(s, at(s, 0, 0))).toEqual([]);
    expect(s.board[0]).toBeNull();
    expect(B.shelfParts(s).map((p) => p.id)).toEqual([a.id]);
    expect(validateState(s)).toEqual([]);
    for (let i = 1; i < SHELF_SLOTS[0]; i++) { put(s, 0, i % s.cols, 'tires', 1); SH.storePart(s, at(s, 0, i % s.cols)); }
    const extra = put(s, 2, 0, 'turbo', 2);
    const before = structuredClone(s);
    expect(SH.storePart(s, at(s, 2, 0))[0].type).toBe('invalid');
    expect(s).toEqual(before);
    expect(B.getPart(s, at(s, 2, 0))!.id).toBe(extra.id);
    // back to the bench
    const ev = SH.unstorePart(s, a.id);
    expect(ev[0]).toMatchObject({ type: 'place', family: 'engine', tier: 4 });
    expect(B.allParts(s).filter((p) => p.id === a.id)).toHaveLength(1);
    expect(B.shelfParts(s).some((p) => p.id === a.id)).toBe(false);
  });

  it('moving back needs room; a duplicate id on load is dropped from the shelf', () => {
    const s = emptyGame();
    const p = put(s, 0, 0, 'engine', 3);
    SH.storePart(s, at(s, 0, 0));
    s.board = s.board.map(() => ({ id: s.nextPartId++, f: 'tires', t: 1, q: 'std' }));
    s.tray = s.tray.map(() => ({ id: s.nextPartId++, f: 'tires', t: 1, q: 'std' }));
    expect(SH.unstorePart(s, p.id)[0].type).toBe('invalid');
    const raw = JSON.parse(JSON.stringify(s)) as GameState;
    raw.shelf = [...raw.shelf!, { ...raw.board[0]! }];
    const m = migrate(raw)!;
    expect(m).not.toBeNull();
    expect(B.shelfParts(m).map((x) => x.id)).toEqual([p.id]);
  });

  it('earliest car and over-cap detection', () => {
    const s = stage('rally');
    expect(SH.earliestCarFor({ t: 8 }).id).toBe('rally');
    expect(SH.earliestCarFor({ t: 10 }).id).toBe('sovereign');
    s.activeCar = 'muscle';
    expect(SH.isOverCap(s, { f: 'tires', t: 7 })).toBe(true);
    expect(SH.isOverCap(s, { f: 'tires', t: 5 })).toBe(false);
    expect(SH.earliestCarText(s, { t: 10 })).toMatch(/not yours yet/);
  });

  it('Storage rank 2 shelves reward parts that find no room; printer crates keep waiting', () => {
    const s = stage('muscle');
    s.upgrades.storage = 2;
    s.board = s.board.map(() => ({ id: s.nextPartId++, f: 'tires', t: 1, q: 'std' }));
    s.tray = s.tray.map(() => ({ id: s.nextPartId++, f: 'tires', t: 1, q: 'std' }));
    s.cash = 10_000;
    B.orderPart(s, 'engine', 4);
    expect(B.shelfParts(s).some((p) => p.f === 'engine' && p.t === 4)).toBe(true);
    s.crates.push({ kind: 'std', source: 'printer' });
    B.openCrates(s);
    expect(s.crates).toHaveLength(1);
    expect(validateState(s)).toEqual([]);
  });
});

describe('surplus uses: exact previews, protected parts, no loops', () => {
  it('trade: the preview is what the action does; starred parts are never used', () => {
    const s = stage('rally');
    s.shelf = [];
    const ids: number[] = [];
    for (let i = 0; i < 4; i++) { const p = put(s, 0, i, 'engine', 7); ids.push(p.id); }
    const star = put(s, 1, 0, 'engine', 7);
    s.favorites = [star.id];
    const pv = SH.tradePreview(s, [...ids, star.id], 'tires', 7);
    expect(pv.used).not.toContain(star.id);
    expect(pv.value).toBe(4 * SCRAP_VALUE[7]);
    expect(pv.cost).toBe(scrapOrderCost(7));
    expect(pv.ok).toBe(true);
    const scrapBefore = s.scrap;
    SH.tradeParts(s, [...ids, star.id], 'tires', 7);
    expect(B.allParts(s).some((p) => p.id === star.id)).toBe(true);
    expect(B.allParts(s).filter((p) => ids.includes(p.id))).toHaveLength(0);
    expect(B.allParts(s).some((p) => p.f === 'tires' && p.t === 7)).toBe(true);
    expect(s.scrap).toBe(scrapBefore);
    expect(s.crafted).toEqual(stage('rally').crafted); // crafted credit untouched
  });

  it('trade never loops: the traded part is worth less back than what went in, at every tier and rate', () => {
    for (const rank of [0, 3]) for (let t = 1; t <= 9; t++) {
      const s = stage('sovereign');
      s.upgrades.workshop = rank;
      const inValue = scrapOrderCost(t); // the least that buys a T(t)
      const backAsScrap = SCRAP_VALUE[t];
      const backAsTrade = SH.tradeValue(s, { t });
      expect(backAsScrap).toBeLessThan(inValue / SH.tradeRate(s) + 1e-9);
      expect(backAsTrade).toBeLessThan(inValue);
    }
  });

  it('trading a part for the same part or a worse one is refused', () => {
    const s = stage('rally');
    const p = put(s, 0, 0, 'engine', 7);
    put(s, 0, 1, 'engine', 7);
    expect(SH.tradePreview(s, [p.id, s.board[1]!.id], 'engine', 7).ok).toBe(false);
  });

  it('contribute: the price stays on a cash step, at most half comes from parts, and buying parts to fund it loses', () => {
    const s = stage('rally');
    s.upgrades.storage = 2; // next rank $9,000
    const ids: number[] = [];
    for (let i = 0; i < 5; i++) ids.push(put(s, 0, i, 'turbo', 6).id);
    const pv = SH.contributePreview(s, ids, 'storage');
    expect(pv.ok).toBe(true);
    expect(onCashStep(pv.priceAfter)).toBe(true);
    expect(pv.priceBefore - pv.priceAfter).toBeLessThanOrEqual(pv.raw);
    SH.contributeParts(s, ids, 'storage');
    expect(P.upgradeCost(s, 'storage')).toBe(pv.priceAfter);
    // the cap: half the list price at most
    for (let i = 0; i < 6; i++) ids.push(put(s, 1, i % s.cols, 'turbo', 9).id);
    const big = SH.contributePreview(s, ids.slice(5), 'storage');
    expect(big.priceAfter).toBeGreaterThanOrEqual(UPGRADES.find((u) => u.id === 'storage')!.levels[2].cost / 2);
    // the credit is spent with the rank
    s.cash = 100_000;
    P.buyUpgrade(s, 'storage');
    expect(s.upgradeCredit?.storage ?? 0).toBe(0);
    // no part bought for cash credits more than it cost
    for (let t = 1; t <= 9; t++) expect(SCRAP_VALUE[t] * CONTRIBUTE_CASH_PER_SCRAP).toBeLessThan(PART_ORDER_PRICE[t] * 0.8);
  });

  it('recycle toward an order: recycles and orders in one tap once the scrap covers it', () => {
    const s = stage('rally');
    s.scrap = scrapOrderCost(5) - SCRAP_VALUE[6];
    const p = put(s, 0, 0, 'engine', 6);
    const pv = SH.recycleTowardPreview(s, [p.id], 'tires', 5);
    expect(pv.orders).toBe(true);
    SH.recycleToward(s, [p.id], 'tires', 5);
    expect(s.scrap).toBe(0);
    expect(B.allParts(s).some((x) => x.f === 'tires' && x.t === 5)).toBe(true);
  });
});

describe('Garage upgrade paths', () => {
  it('later ranks are staggered through the campaign and say what opens them', () => {
    const s = stage('beater');
    s.upgrades.storage = 1;
    expect(P.upgradeLock(s, 'storage')).toMatch(/Ironhorse/);
    s.cash = 100_000;
    expect(P.buyUpgrade(s, 'storage')[0]).toMatchObject({ type: 'invalid' });
    const late = UPGRADES.flatMap((u) => u.levels.filter((l) => l.opens === 'vireo'));
    expect(late.length).toBeGreaterThanOrEqual(2); // something worth buying in the Riviera
    for (const u of UPGRADES) for (const l of u.levels) expect(onCashStep(l.cost), `${u.id} ${l.cost}`).toBe(true);
  });

  it('every rank says what it does now and next', () => {
    const s = stage('sovereign');
    for (const u of UPGRADES) for (let l = 0; l < u.levels.length; l++) {
      s.upgrades[u.id] = l;
      const fx = P.upgradeEffect(s, u.id);
      expect(fx.next, `${u.id} ${l}`).not.toBe(fx.now);
    }
  });

  it('Workshop ranks discount orders on a cash step and sell Polished parts', () => {
    const s = stage('rally');
    expect(B.orderPrice(s, 6)).toBe(PART_ORDER_PRICE[6]);
    s.upgrades.workshop = 1;
    expect(B.orderPrice(s, 6)).toBe(roundCash(PART_ORDER_PRICE[6] * 0.9));
    expect(B.orderPart(s, 'engine', 5, true)[0].type).toBe('invalid');
    s.upgrades.workshop = 2;
    s.cash = 10_000;
    B.orderPart(s, 'engine', 5, true);
    expect(B.allParts(s).some((p) => p.f === 'engine' && p.t === 5 && p.q === 'polished')).toBe(true);
    for (let t = 1; t <= 9; t++) { s.upgrades.workshop = 4; expect(onCashStep(B.orderPrice(s, t, true))).toBe(true); }
  });

  it('Batch merge merges one family only', () => {
    const s = emptyGame();
    put(s, 0, 0, 'engine', 1); put(s, 0, 2, 'engine', 1);
    put(s, 2, 0, 'tires', 1); put(s, 2, 2, 'tires', 1);
    s.upgrades.grid = 2;
    B.mergeAll(s, 'engine');
    expect(B.allParts(s).filter((p) => p.f === 'tires' && p.t === 1)).toHaveLength(2);
    expect(B.allParts(s).filter((p) => p.f === 'engine' && p.t === 2)).toHaveLength(1);
  });
});

describe('old saves', () => {
  it('a pre-1.9 save keeps cash, scrap, parts, cars and crafted credit, and gets empty new fields', () => {
    const s = stage('proto');
    const old = JSON.parse(JSON.stringify(s)) as Record<string, unknown> & { upgrades: Record<string, number> };
    for (const k of ['shelf', 'goalPick', 'stagesPaid', 'upgradeCredit']) Reflect.deleteProperty(old, k);
    Reflect.deleteProperty(old.upgrades, 'storage'); Reflect.deleteProperty(old.upgrades, 'workshop');
    old.cash = 12345; old.scrap = 678;
    const m = migrate(old)!;
    expect(m).not.toBeNull();
    expect(m.v).toBe(2);
    expect(m.cash).toBe(12345);
    expect(m.scrap).toBe(678);
    expect(m.owned).toEqual(s.owned);
    expect(m.crafted).toEqual(s.crafted);
    expect(m.upgrades.storage).toBe(0);
    expect(m.upgrades.workshop).toBe(0);
    expect(m.shelf).toBeUndefined();
    expect(B.shelfCap(m)).toBe(SHELF_SLOTS[0]);
  });
});
