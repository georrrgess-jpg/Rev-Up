// Pit Stop: surplus parts and scrap (Keep / Recycle, scrap orders, polish) and the bounded away budget.
import { describe, expect, it } from 'vitest';
import * as B from '../src/core/board';
import { Game } from '../src/core/game';
import * as P from '../src/core/progression';
import { MemoryKV, encodeSave, saveKey } from '../src/core/save';
import { GameState, newGame, validateState } from '../src/core/state';
import { CarId, ENABLED_CARS, EVENTS, OFFLINE_MAX_S, SCRAP_VALUE, eventById, floorCash, onCashStep, polishCost, scrapOrderCost } from '../src/data/tables';
import { at, emptyGame, put } from './helpers';

const T0 = 1_700_000_000_000;
const H = 3600_000;
const scope = '/Rev-Up/';

/** Fill every bench and rack cell with T1 Turbos. */
function fillAll(s: GameState) {
  s.board = s.board.map(() => ({ id: s.nextPartId++, f: 'turbo' as const, t: 1, q: 'std' as const }));
  s.tray = s.tray.map(() => ({ id: s.nextPartId++, f: 'turbo' as const, t: 1, q: 'std' as const }));
}

/** A save at a stage of the ladder: the cars up to `last`, every earlier event won and its rival beaten. */
function stage(last: CarId): GameState {
  const s = emptyGame();
  const ladder = ENABLED_CARS.map((c) => c.id);
  s.owned = ladder.slice(0, ladder.indexOf(last) + 1);
  s.activeCar = last;
  s.revealed = [...s.owned];
  s.rep = ENABLED_CARS[ladder.indexOf(last)].unlock?.rep ?? 0;
  for (const e of EVENTS) {
    if (e.heatOf) continue;
    const ok = P.eventUnlocked({ ...s, activeCar: e.carOnly ?? s.activeCar }, e).ok;
    if (!ok) continue;
    s.events[e.id] = { wins: 1, starts: 1, bestPlace: 1, bestTime: 20 };
    if (e.boss) s.bosses.push(e.boss.rival);
  }
  // a second pass opens series rounds and rival-gated events won in the first pass
  for (let k = 0; k < 6; k++) for (const e of EVENTS) {
    if (e.heatOf || s.events[e.id]) continue;
    if (P.eventUnlocked({ ...s, activeCar: e.carOnly ?? s.activeCar }, e).ok) { s.events[e.id] = { wins: 1, starts: 1, bestPlace: 1, bestTime: 20 }; if (e.boss) s.bosses.push(e.boss.rival); }
  }
  s.offline.lastSeenAt = T0;
  return s;
}

const away = (s: GameState, ms: number) => { const t = structuredClone(s); P.accrueOffline(t, T0 + ms); return t.offline; };

describe('scrap: orders, polish, recycling', () => {
  it('buy → recycle always returns less scrap than the order cost, at every tier sold', () => {
    for (let t = 1; t <= 8; t++) {
      expect(scrapOrderCost(t)).toBeGreaterThan(SCRAP_VALUE[t]);
      expect(polishCost(t)).toBeGreaterThan(0);
    }
    const s = emptyGame();
    s.owned = ['junker', 'beater', 'hothatch', 'muscle']; s.activeCar = 'muscle';
    s.scrap = 1000;
    const ev = B.scrapOrder(s, 'engine', 4);
    expect(ev.some((e) => e.type === 'place')).toBe(true);
    expect(s.scrap).toBe(1000 - scrapOrderCost(4));
    const p = B.allParts(s).find((x) => x.f === 'engine' && x.t === 4)!;
    B.recycleParts(s, [p.id]);
    expect(s.scrap).toBe(1000 - scrapOrderCost(4) + SCRAP_VALUE[4]);
    expect(s.scrap).toBeLessThan(1000);
    // a polished part recycles for the same as a standard one: polish never pays back
    B.scrapOrder(s, 'tires', 3);
    const q = B.allParts(s).find((x) => x.f === 'tires')!;
    const before = s.scrap;
    B.polishPart(s, q.id);
    expect(s.scrap).toBe(before - polishCost(3));
    expect(B.allParts(s).find((x) => x.id === q.id)!.q).toBe('polished');
    expect(B.polishPart(s, q.id)[0]).toMatchObject({ type: 'invalid' });
    B.recycleParts(s, [q.id]);
    expect(s.scrap).toBe(before - polishCost(3) + SCRAP_VALUE[3]);
  });

  it('rapid taps, repeated recycles and reloads never duplicate scrap or parts', () => {
    const kv = new MemoryKV();
    const g = new Game(kv, scope, T0);
    g.transact((d) => { d.board = d.board.map(() => null); d.crates = []; d.scrap = scrapOrderCost(2) * 2 + 1; d.stats.milestones.firstMerge = 1; return []; }, T0);
    const parts = () => B.allParts(g.state).length;
    // five taps with money for two: two parts, two charges, three refusals
    const results = [1, 2, 3, 4, 5].map((k) => g.scrapOrder('tires', 2, T0 + k));
    expect(results.filter((ev) => ev.some((e) => e.type === 'place')).length).toBe(2);
    expect(g.state.scrap).toBe(1);
    expect(parts()).toBe(2);
    const ids = B.allParts(g.state).map((p) => p.id);
    g.recycleParts(ids, T0 + 10);
    const after = g.state.scrap;
    expect(after).toBe(1 + 2 * SCRAP_VALUE[2]);
    // the same ids again (a double tap) add nothing
    expect(g.recycleParts(ids, T0 + 11)[0]).toMatchObject({ type: 'invalid' });
    expect(g.state.scrap).toBe(after);
    // reload: the wallet and bench are exactly as committed
    const g2 = new Game(kv, scope, T0 + 20);
    expect(g2.state.scrap).toBe(after);
    expect(B.allParts(g2.state).length).toBe(0);
  });

  it('a full bench queues the ordered part (charged once) and it arrives when room opens', () => {
    const s = emptyGame();
    s.owned = ['junker', 'beater', 'hothatch', 'muscle']; s.activeCar = 'muscle';
    fillAll(s);
    s.scrap = 100;
    const n = B.allParts(s).length;
    const ev = B.scrapOrder(s, 'engine', 3);
    expect(ev.some((e) => e.type === 'crateBlocked')).toBe(true);
    expect(s.scrap).toBe(100 - scrapOrderCost(3));
    expect(s.crates[0]).toMatchObject({ kind: 'targeted', family: 'engine', tier: 3 });
    expect(B.allParts(s).length).toBe(n);
    B.recycleParts(s, [s.board[0]!.id]);
    B.openCrates(s);
    expect(s.board[0]).toMatchObject({ f: 'engine', t: 3 });
    expect(s.crates.length).toBe(0);
  });

  it('starred and fitted parts are never recycled, in bulk or one by one', () => {
    const s = emptyGame();
    const a = put(s, 0, 0, 'engine', 1);
    const b = put(s, 0, 1, 'engine', 1);
    const fittedPart = { id: s.nextPartId++, f: 'tires' as const, t: 2, q: 'std' as const };
    s.installed.junker = { tires: fittedPart };
    B.toggleFavorite(s, a.id);
    expect(s.favorites).toEqual([a.id]);
    expect(B.scrapPart(s, at(s, 0, 0))[0]).toMatchObject({ type: 'invalid' });
    const ev = B.recycleParts(s, [a.id, b.id, fittedPart.id]);
    expect(ev.filter((e) => e.type === 'scrap').length).toBe(1);
    expect(s.board[0]?.id).toBe(a.id);
    expect(s.installed.junker?.tires?.id).toBe(fittedPart.id);
    expect(s.scrap).toBe(SCRAP_VALUE[1]);
    expect(validateState(s)).toEqual([]);
  });

  it('Keep / Recycle: an upgrade and an alternate build are kept, unused parts are suggested, a star protects', () => {
    const s = emptyGame();
    s.owned = ['junker', 'beater']; s.activeCar = 'beater';
    s.crafted = ['engine:9', 'tires:9', 'turbo:9']; // every craft done: no ingredient uses
    s.installed = {
      junker: { engine: { id: s.nextPartId++, f: 'engine', t: 2, q: 'std' }, tires: { id: s.nextPartId++, f: 'tires', t: 2, q: 'std' }, turbo: { id: s.nextPartId++, f: 'turbo', t: 2, q: 'std' } },
      beater: { engine: { id: s.nextPartId++, f: 'engine', t: 2, q: 'std' }, tires: { id: s.nextPartId++, f: 'tires', t: 3, q: 'std' }, turbo: { id: s.nextPartId++, f: 'turbo', t: 3, q: 'std' } },
    };
    const up = put(s, 0, 0, 'engine', 3); // beats the Corsa's T2 Engine
    const alt = put(s, 0, 2, 'tires', 3); // matches the best fitted Tires: a swap
    const junk = put(s, 0, 3, 'tires', 1);
    const list = P.spareParts(s);
    const by = (id: number) => list.find((u) => u.part.id === id)!;
    expect(by(up.id).uses[0].kind).toBe('fit');
    expect(by(alt.id).uses.map((u) => u.kind)).toEqual(['spare']);
    expect(by(junk.id).verdict).toBe('recycle');
    expect(by(junk.id).scrap).toBe(SCRAP_VALUE[1]);
    B.toggleFavorite(s, junk.id);
    expect(P.spareParts(s).find((u) => u.part.id === junk.id)!.verdict).toBe('keep');
  });

  it('Keep / Recycle: an ingredient toward the next or a later craft is kept', () => {
    const s = emptyGame();
    s.owned = ['junker', 'beater']; s.activeCar = 'beater'; s.crafted = ['tires:3'];
    const next = put(s, 0, 0, 'turbo', 2); // the Vexa GTi needs a crafted T4 Turbo
    const later = put(s, 0, 1, 'engine', 3); // the Ironhorse needs a crafted T5 Engine later
    const list = P.spareParts(s);
    expect(list.find((u) => u.part.id === next.id)!.uses.find((u) => u.kind === 'craft')!.text).toMatch(/^Ingredient/);
    expect(list.find((u) => u.part.id === later.id)!.uses.find((u) => u.kind === 'craft')!.text).toMatch(/later craft/);
  });

  it('car unlocks still need the merge: orders stop below the keystone and ordered parts never count as crafted', () => {
    const kv = new MemoryKV();
    const g = new Game(kv, scope, T0);
    g.transact((d) => { d.board = d.board.map(() => null); d.crates = []; d.rep = 500; d.scrap = 500; d.stats.milestones.firstMerge = 1; return []; }, T0);
    // the Corsa Rojo needs a crafted T3 Tires: the counter sells up to T2
    expect(B.orderMaxTier(g.state)).toBe(2);
    expect(g.scrapOrder('tires', 3, T0 + 1)[0]).toMatchObject({ type: 'invalid' });
    g.scrapOrder('tires', 2, T0 + 2);
    g.scrapOrder('tires', 2, T0 + 3);
    expect(g.state.crafted).not.toContain('tires:3');
    expect(g.state.owned).not.toContain('beater');
    // the player merges the two ordered T2s: that is the craft
    const refs = g.state.board.map((p, i) => (p?.f === 'tires' && p.t === 2 ? i : -1)).filter((i) => i >= 0);
    g.move({ zone: 'board', i: refs[0] }, { zone: 'board', i: refs[1] }, T0 + 4);
    expect(g.state.crafted).toContain('tires:3');
    expect(g.state.owned).toContain('beater');
  });
});

describe('away earnings: one bounded budget', () => {
  const stages: [string, CarId][] = [['early', 'beater'], ['mid', 'tourer'], ['late', 'proto']];

  it('1 h / 8 h / 24 h at early, mid and late saves stay within 1–2 ordinary race purses', () => {
    const rows: string[] = [];
    for (const [name, car] of stages) {
      const s = stage(car);
      const purse = P.stagePurse(s);
      const [h1, h8, h24] = [1, 8, 24].map((hr) => away(s, hr * H));
      rows.push(`${name.padEnd(5)} ${purse.event.name.padEnd(22)} purse $${purse.cash}  1 h $${h1.pendingCash}  8 h $${h8.pendingCash}  24 h $${h24.pendingCash}${h24.capped ? ' (cap)' : ''}`);
      expect(h8.pendingCash).toBe(P.offlineBudget(s));
      expect(h8.pendingCash).toBeGreaterThanOrEqual(purse.cash);
      expect(h8.pendingCash).toBeLessThanOrEqual(2 * purse.cash);
      expect(h24.pendingCash).toBe(h8.pendingCash); // the cap: time past 8 h is not counted
      expect(h24.capped).toBe(true);
      expect(h8.capped).toBe(false);
      expect(h1.pendingCash).toBeLessThanOrEqual(Math.ceil(h8.pendingCash / 8));
      for (const o of [h1, h8, h24]) expect(onCashStep(o.pendingCash)).toBe(true);
    }
    console.log(rows.join('\n'));
  });

  it('owning more cars never adds to it: the claim follows your best open race, not your car count', () => {
    const s = stage('tourer');
    const more = structuredClone(s);
    more.owned = [...s.owned, 'tuner', 'super', 'rally'];
    for (const g of [s, more]) expect(away(g, 8 * H).pendingCash).toBe(floorCash(P.stagePurse(g).cash * 1.5));
    // the old rule paid $1/min per car-rate unit: 8 cars would have earned 52 × 480 = $24,960 a night
    expect(away(more, 8 * H).pendingCash).toBeLessThanOrEqual(2 * P.stagePurse(more).cash);
  });

  it('Lock-up: its text matches the budget it pays', () => {
    const s = stage('muscle');
    s.cash = 99999;
    const fx = P.upgradeEffect(s, 'lockup');
    expect(fx.now).toContain(`$${P.offlineBudget(s, 0).toLocaleString('en-US')}`);
    expect(fx.next).toContain(`$${P.offlineBudget(s, 1).toLocaleString('en-US')}`);
    P.buyUpgrade(s, 'lockup');
    expect(P.offlineMaxS(s)).toBe(12 * 3600);
    expect(away(s, 24 * H).pendingCash).toBe(P.offlineBudget(s));
    expect(P.offlineBudget(s)).toBeLessThanOrEqual(2 * P.stagePurse(s).cash);
  });

  it('repeated reloads and a second claim never pay the same time twice', () => {
    const kv = new MemoryKV();
    kv.setItem(saveKey(scope), encodeSave({ ...stage('tourer'), rev: 1 }));
    const a = new Game(kv, scope, T0 + 8 * H);
    const c1 = a.state.offline.pendingCash;
    expect(c1).toBe(P.offlineBudget(a.state));
    for (let k = 1; k <= 5; k++) expect(new Game(kv, scope, T0 + 8 * H + k * 1000).state.offline.pendingCash).toBe(c1);
    const g = new Game(kv, scope, T0 + 8 * H + 9000);
    const cash0 = g.state.cash;
    expect(g.claimOffline(T0 + 8 * H + 10_000)).toBe(c1);
    expect(g.claimOffline(T0 + 8 * H + 11_000)).toBe(0);
    const g2 = new Game(kv, scope, T0 + 8 * H + 12_000);
    expect(g2.state.cash).toBe(cash0 + c1);
    expect(g2.state.offline.pendingCash).toBe(0);
  });

  it('two tabs: only one claim lands; the stale tab is refused', () => {
    const kv = new MemoryKV();
    kv.setItem(saveKey(scope), encodeSave({ ...stage('beater'), rev: 1 }));
    const a = new Game(kv, scope, T0 + 8 * H);
    const b = new Game(kv, scope, T0 + 8 * H + 500); // a second tab opened on the same save
    const c = a.state.offline.pendingCash;
    const base = a.state.cash;
    b.claimOffline(T0 + 8 * H + 1000);
    a.claimOffline(T0 + 8 * H + 2000); // the older tab: its write is refused (revision check)
    expect(a.conflict).toBe(true);
    expect(new Game(kv, scope, T0 + 8 * H + 3000).state.cash).toBe(base + c);
  });

  it('an idle tab that slept while visible earns one bounded claim, then nothing more', () => {
    const kv = new MemoryKV();
    kv.setItem(saveKey(scope), encodeSave({ ...stage('beater'), rev: 1 }));
    const g = new Game(kv, scope, T0);
    const seen: number[] = [];
    g.subscribe((ev) => ev.forEach((e) => e.type === 'offline' && seen.push(e.amount)));
    g.tick(1, T0 + 1000);
    g.tick(1, T0 + 10 * H); // timers stopped overnight; the next tick sees the gap
    expect(seen).toEqual([P.offlineBudget(g.state)]);
    expect(g.state.offline.capped).toBe(true);
    g.tick(1, T0 + 10 * H + 1000);
    g.resume(T0 + 10 * H + 2000); // the page also reports visible: nothing is counted twice
    expect(g.state.offline.pendingCash).toBe(P.offlineBudget(g.state));
    expect(new Game(kv, scope, T0 + 10 * H + 3000).state.offline.pendingCash).toBe(P.offlineBudget(g.state));
  });

  it('a returning late-game save: a pending claim from the old rule is honoured, not cut, and not stacked', () => {
    const kv = new MemoryKV();
    const old = stage('proto') as unknown as Record<string, unknown>;
    // 1.5: 10 cars × $72/min for 8 h, already accrued before this update
    old.offline = { lastSeenAt: T0, pendingCash: 34550, pendingS: OFFLINE_MAX_S };
    delete old.favorites;
    kv.setItem(saveKey(scope), encodeSave({ ...(old as unknown as GameState), rev: 1 }));
    const g = new Game(kv, scope, T0 + 30 * H);
    expect(g.state.offline.pendingCash).toBe(34550);
    const cash0 = g.state.cash;
    expect(g.claimOffline(T0 + 30 * H + 1000)).toBe(34550);
    expect(g.state.cash).toBe(cash0 + 34550);
    // the next night pays the bounded budget
    g.saveNow(T0 + 30 * H + 2000);
    const g2 = new Game(kv, scope, T0 + 54 * H);
    expect(g2.state.offline.pendingCash).toBe(P.offlineBudget(g2.state));
    expect(P.offlineBudget(g2.state)).toBeLessThanOrEqual(2 * P.stagePurse(g2.state).cash);
  });
});

describe('saves', () => {
  it('a v2 save from before Pit Stop (no favorites, no away details) loads with defaults', () => {
    const kv = new MemoryKV();
    const old = newGame(T0) as unknown as Record<string, unknown>;
    delete old.favorites;
    old.offline = { lastSeenAt: T0, pendingCash: 0, pendingS: 0 };
    old.scrap = 77;
    kv.setItem(saveKey(scope), encodeSave(old as never));
    const g = new Game(kv, scope, T0 + 1000);
    expect(g.load.status).toBe('loaded');
    expect(g.state.favorites).toEqual([]);
    expect(g.state.scrap).toBe(77);
    expect(validateState(g.state)).toEqual([]);
    // and the new fields round-trip
    const p = B.allParts(g.state)[0];
    g.toggleFavorite(p.id, T0 + 2000);
    expect(new Game(kv, scope, T0 + 3000).state.favorites).toEqual([p.id]);
  });
  it('a v1 save still migrates', () => {
    const kv = new MemoryKV();
    const old = newGame(T0) as unknown as Record<string, unknown>;
    old.v = 1; delete old.installed; delete old.mastery; delete old.favorites;
    kv.setItem(saveKey(scope), encodeSave(old as never));
    const g = new Game(kv, scope, T0 + 1000);
    expect(g.load.status).toBe('loaded');
    expect(g.state.favorites).toEqual([]);
  });
  it('scrap prices are whole numbers and the event yardstick is an ordinary race', () => {
    for (let t = 1; t <= 9; t++) expect(Number.isInteger(scrapOrderCost(t)) && Number.isInteger(polishCost(t))).toBe(true);
    const e = P.stagePurse(stage('proto')).event;
    expect(e.boss || e.knockout || e.timeAttack || e.speedTrap).toBeFalsy();
    expect(eventById(e.id)).toBe(e);
  });
});
