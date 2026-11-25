import { describe, expect, it } from 'vitest';
import * as B from '../src/core/board';
import { Game } from '../src/core/game';
import * as P from '../src/core/progression';
import * as S from '../src/core/style';
import { MemoryKV, encodeSave, saveKey } from '../src/core/save';
import { newGame } from '../src/core/state';
import type { GameState, LeanOutcome } from '../src/core/state';
import { EVENTS, MEDAL_REWARDS, MERGE_CASH, PART_ORDER_PRICE, SCRAP_VALUE, STYLE_ITEMS, TARGETED_CRATE_CASH_COST, TUNE_STAGES, UPGRADES, CARS, cashStep, eventById, floorCash, nitroCapFor, onCashStep, roundCash, tunePrice } from '../src/data/tables';
import { emptyGame } from './helpers';

const T0 = 1_700_000_000_000;
const outcome = (o: Partial<LeanOutcome> = {}): LeanOutcome => ({ place: 1, playerTime: 20, gapText: '', perfects: 0, nitroUsed: 0, standings: [], advice: null, ...o });
const commit = (s: GameState, eventId: string, o: Partial<LeanOutcome> = {}, mode: 'live' | 'quick' = 'live') => {
  if (mode === 'live') s.pendingRace = { id: 7, eventId, car: s.activeCar, seed: 7, startedAt: T0 };
  else s.pendingQuick = { id: 7, eventId, car: s.activeCar, startedAt: T0, endsAt: T0, outcome: outcome(o) };
  return P.commitRace(s, { raceId: 7, mode, outcome: outcome(o) }, []);
};
const late = (): GameState => {
  const s = emptyGame();
  s.owned = ['junker', 'beater', 'hothatch', 'muscle', 'tourer'];
  s.activeCar = 'tourer';
  s.rep = 2400; s.cash = 0;
  return s;
};

describe('Order a Part', () => {
  it('sells a known family and tier, straight to the bench, for the listed price', () => {
    const s = emptyGame();
    s.cash = 500;
    const ev = B.orderPart(s, 'tires', 2);
    expect(ev.some((e) => e.type === 'place')).toBe(true);
    expect(s.cash).toBe(500 - PART_ORDER_PRICE[2]);
    expect(B.allParts(s)).toEqual([expect.objectContaining({ f: 'tires', t: 2 })]);
  });
  it('refuses when short of cash or above the sold tier, changing nothing', () => {
    const s = emptyGame();
    s.cash = PART_ORDER_PRICE[2] - 1;
    expect(B.orderPart(s, 'engine', 2)[0]).toMatchObject({ type: 'invalid', reason: 'Need $1 more' });
    s.cash = 99999;
    const max = B.orderMaxTier(s);
    expect(B.orderPart(s, 'engine', max + 1)[0].type).toBe('invalid');
    expect(s.cash).toBe(99999);
    expect(B.allParts(s)).toHaveLength(0);
  });
  it('always sells the tier below the next car’s keystone, and never the keystone itself', () => {
    const s = late();
    // next car is the Kestrel (crafted T6 Tires): T5 parts are sold, T6 is a craft
    expect(B.orderMaxTier(s)).toBe(5);
    s.cash = 2 * PART_ORDER_PRICE[5];
    B.orderPart(s, 'tires', 5); B.orderPart(s, 'tires', 5);
    expect(B.craftedTier(s, 'tires')).toBeLessThan(6);
  });
  it('is no money loop: buying, merging and scrapping always returns less than it cost', () => {
    for (let t = 1; t < PART_ORDER_PRICE.length; t++) {
      const mergedBack = (t + 1) * 2; // MERGE_CASH for one fusion
      expect(SCRAP_VALUE[t + 1] ?? 0).toBeLessThan(PART_ORDER_PRICE[t]); // scrap never converts to cash anyway
      expect(PART_ORDER_PRICE[t + 1] ?? Infinity).toBeGreaterThan(2 * PART_ORDER_PRICE[t]); // merging two is the cheaper route
      expect(mergedBack).toBeLessThan(PART_ORDER_PRICE[t]);
    }
  });
});

describe('upgrades show their exact effect and pay off', () => {
  it('Nitro tank raises the bank cap and Lock-up the away hours', () => {
    const s = late();
    s.cash = 99999;
    expect(P.upgradeEffect(s, 'nitroTank')).toEqual({ now: 'Bank 3 nitro', next: '4 nitro' });
    P.buyUpgrade(s, 'nitroTank');
    expect(nitroCapFor(s.upgrades.nitroTank)).toBe(4);
    expect(P.offlineMaxS(s)).toBe(8 * 3600);
    P.buyUpgrade(s, 'lockup');
    expect(P.offlineMaxS(s)).toBe(12 * 3600);
    expect(P.buyUpgrade(s, 'lockup')[0]).toMatchObject({ type: 'invalid', reason: 'Maxed' });
  });
  it('short cash says how much more', () => {
    const s = emptyGame();
    s.cash = 100;
    expect(P.buyUpgrade(s, 'printer')[0]).toMatchObject({ type: 'invalid', reason: 'Need $150 more' });
  });
});

describe('payouts: every place pays, live beats the crew, and the breakdown adds up', () => {
  it('Quick Race pays 70% of the live purse, 85% with the Pit crew', () => {
    const s = emptyGame();
    const e = eventById('crusher-run');
    expect(P.computePayout(s, e, 1, 'quick', 0).cash).toBe(roundCash(e.payout.cash[0] * 0.7));
    s.upgrades.crew = 1;
    expect(P.computePayout(s, e, 1, 'quick', 0).cash).toBe(roundCash(e.payout.cash[0] * 0.85));
    expect(P.computePayout(s, e, 4, 'live', 0).cash).toBeGreaterThan(0);
  });
  it('the result breakdown sums to the cash paid', () => {
    const s = emptyGame();
    s.owned = ['junker', 'beater']; s.activeCar = 'beater';
    const before = s.cash;
    const r = commit(s, 'crusher-run', { place: 1, perfects: 2 })!;
    expect(r.breakdown!.reduce((a, b) => a + b.cash, 0)).toBe(r.cash);
    expect(s.cash - before).toBe(r.cash);
    expect(r.breakdown!.map((b) => b.kind)).toEqual(['base', 'skill', 'once']);
  });
  it('a time attack with no first-win money shows no first-win bonus', () => {
    const s = emptyGame();
    s.owned = ['junker', 'beater']; s.activeCar = 'beater';
    expect(commit(s, 'ta-strip', { place: 1, playerTime: 30 })!.firstClear).toBe(false);
  });
});

describe('Paint shop', () => {
  it('charges once; colours and wheels fit every car, premium paint is per car', () => {
    const s = late();
    s.cash = 10000;
    S.buyStyle(s, 'paint:signal', 'muscle');
    expect(s.paints.muscle).toBe('#c8231f');
    const after = s.cash;
    S.buyStyle(s, 'paint:signal', 'beater'); // owned: applies free
    expect(s.cash).toBe(after);
    expect(s.paints.beater).toBe('#c8231f');
    S.buyStyle(s, 'material:pearl', 'muscle');
    S.buyStyle(s, 'material:pearl', 'tourer'); // per car: charged again
    expect(s.cash).toBe(after - 2 * 3000);
    expect(s.style.tourer?.material).toBe('pearl');
  });
  it('restores the Tapeback one stage at a time, and refuses when short', () => {
    const s = late();
    s.cash = 1499;
    expect(S.buyStyle(s, 'restore:1', 'junker')[0]).toMatchObject({ type: 'invalid', reason: 'Need $1 more' });
    expect(S.buyStyle(s, 'restore:2', 'junker')[0].type).toBe('invalid'); // not before stage 1
    s.cash = 10000;
    S.buyStyle(s, 'restore:1', 'junker');
    S.buyStyle(s, 'restore:2', 'junker');
    expect(s.style.junker?.restore).toBe(2);
    expect(S.buyStyle(s, 'restore:1', 'beater')[0].type).toBe('invalid'); // Tapeback only
  });
  it('spending everything on looks never blocks racing or merging', () => {
    const g = new Game(new MemoryKV(), '/t/', T0);
    g.transact((d) => { d.cash = 250; d.stats.races = 1; return []; }, T0);
    g.buyStyle('paint:safety', 'junker', T0);
    expect(g.state.cash).toBe(0);
    expect(g.startRace('yard-sprint', T0 + 1000)).not.toBeNull();
  });
});

describe('Downtown Nights rules', () => {
  it('event goals pay once each and count as stars', () => {
    const s = late();
    const e = eventById('neon-mile');
    const r1 = commit(s, 'neon-mile', { place: 1, playerTime: e.goals!.par - 0.1, perfects: 1 })!;
    expect(r1.newStars).toEqual(['Win', 'Under par', 'A Perfect boost']);
    expect(P.starsIn(s)).toBe(3);
    const cash = s.cash;
    const r2 = commit(s, 'neon-mile', { place: 1, playerTime: e.goals!.par - 0.1, perfects: 2 })!;
    expect(r2.newStars).toEqual([]);
    expect(s.cash - cash).toBe(r2.cash); // only the race purse this time
    expect(r2.breakdown!.some((b) => b.label.startsWith('Goal'))).toBe(false);
  });
  it('the Coastal Crown win brings the Altamar GT without a Rep grind', () => {
    const s = late();
    s.owned = ['junker', 'beater', 'hothatch', 'muscle']; s.activeCar = 'muscle';
    s.crafted = ['tires:3', 'turbo:4', 'engine:5', 'engine:6'];
    s.rep = 2290;
    commit(s, 'coast-crown', { place: 1 });
    expect(s.owned).toContain('tourer');
  });
  it('The Main Event: top places go through, a loss starts again from heat 1, the final win counts once', () => {
    const s = late();
    s.owned.push('tuner');
    s.stars = { 'neon-mile': 7, 'skyline-run': 3 };
    expect(P.eventUnlocked(s, eventById('main-event')).ok).toBe(true);
    expect(P.startRace(s, 'main-event', T0).eventId).toBe('main-event:1');
    let r = P.commitRace(s, { raceId: s.pendingRace!.id, mode: 'live', outcome: outcome({ place: 3 }) }, [])!;
    expect(r.heat).toMatchObject({ advanced: true, n: 1 });
    expect(P.startRace(s, 'main-event', T0).eventId).toBe('main-event:2');
    r = P.commitRace(s, { raceId: s.pendingRace!.id, mode: 'live', outcome: outcome({ place: 3 }) }, [])!;
    expect(r.heat).toMatchObject({ advanced: false });
    expect(s.knockout).toBeNull();
    expect(P.startRace(s, 'main-event', T0).eventId).toBe('main-event:1');
    for (const id of ['main-event:1', 'main-event:2', 'main-event:3']) {
      if (s.pendingRace?.eventId !== id) P.startRace(s, 'main-event', T0);
      r = P.commitRace(s, { raceId: s.pendingRace!.id, mode: 'live', outcome: outcome({ place: 1 }) }, [])!;
    }
    expect(r.heat?.champion).toBe(true);
    expect(s.events['main-event'].wins).toBe(1);
    expect(s.blueprints).toContain('Main Event Neon');
    expect(P.canQuickRace(s, eventById('main-event'))).toBe(false);
  });
  it('the speed trap scores mph, and each medal pays once', () => {
    const s = late();
    const e = eventById('bridge-trap');
    const ms = (mph: number) => mph / 2.23694;
    const r = commit(s, 'bridge-trap', { place: 1, trapSpeed: ms(e.speedTrap!.silver + 1) })! as ReturnType<typeof commit> & { trapMph?: number };
    expect(r.trapMph).toBe(e.speedTrap!.silver + 1);
    expect(r.newMedals).toEqual([1, 2]);
    expect(r.nextMedal).toMatchObject({ name: 'Gold', target: e.speedTrap!.gold, gap: e.speedTrap!.gold - e.speedTrap!.silver - 1 });
    const again = commit(s, 'bridge-trap', { place: 1, trapSpeed: ms(e.speedTrap!.silver + 2) })!;
    expect(again.newMedals).toEqual([]);
    expect(P.bestTrapMph(s.events['bridge-trap'])).toBe(e.speedTrap!.silver + 2);
    expect(P.eventReason(s, e)).toContain(`${e.speedTrap!.gold} mph`);
  });
  it('an older save’s km/h speed-trap record reads as mph', () => {
    const s = late();
    s.events['bridge-trap'] = { wins: 1, starts: 1, bestPlace: 1, bestTime: null, bestSpeed: 241 };
    expect(P.bestTrapMph(s.events['bridge-trap'])).toBe(150);
    s.medals['bridge-trap'] = 1;
    const r = commit(s, 'bridge-trap', { place: 1, trapSpeed: 140 / 2.23694 })!;
    expect(r.newMedals).toEqual([]);
    expect(P.bestTrapMph(s.events['bridge-trap'])).toBe(150); // a slower run keeps the converted record
  });
  it('the Stock Cup runs every part at T4 on any car', async () => {
    const { computeLoadout } = await import('../src/core/loadout');
    const s = late();
    s.installed = { tourer: { engine: { id: 900, f: 'engine', t: 6, q: 'std' } } };
    expect(computeLoadout(s, 'tourer', undefined, 4).stats.top).toBeLessThan(computeLoadout(s, 'tourer').stats.top);
  });
});

describe('Tune-up', () => {
  it('adds 2% per stage up to three, priced per car, and never applies in the Stock Cup', async () => {
    const { computeLoadout } = await import('../src/core/loadout');
    const s = late();
    s.installed = { tourer: { engine: { id: 900, f: 'engine', t: 6, q: 'std' } } };
    const base = computeLoadout(s, 'tourer').stats.top;
    s.cash = 100000;
    P.buyTune(s, 'tourer'); P.buyTune(s, 'tourer');
    expect(computeLoadout(s, 'tourer').stats.top).toBeCloseTo(base * 1.04, 5);
    P.buyTune(s, 'tourer');
    expect(P.buyTune(s, 'tourer')[0]).toMatchObject({ type: 'invalid', reason: 'Fully tuned' });
    expect(computeLoadout(s, 'tourer', undefined, 4).stats.top).toBeLessThan(base);
  });
});

describe('existing players', () => {
  it('a large 1.3 balance and owned upgrades load unchanged, with the new fields filled', () => {
    const kv = new MemoryKV();
    const old = newGame(T0) as unknown as Record<string, unknown>;
    Object.assign(old, { cash: 36564, scrap: 412, owned: ['junker', 'beater', 'hothatch', 'muscle', 'tourer'], activeCar: 'tourer', upgrades: { grid: 1, printer: 3, crateTier: 3 }, paints: { muscle: '#70442d' } });
    delete old.owns; delete old.style; delete old.stars; delete old.knockout;
    kv.setItem(saveKey('/t/'), encodeSave(old as never));
    const g = new Game(kv, '/t/', T0);
    expect(g.state.cash).toBe(36564);
    expect(g.state.upgrades).toMatchObject({ grid: 1, printer: 3, crateTier: 3, crew: 0, nitroTank: 0, lockup: 0 });
    expect(g.state.paints.muscle).toBe('#70442d');
    expect(g.state.owns).toEqual([]);
    expect(g.state.knockout).toBeNull();
    // and there is something worth buying: the Paint shop and the new upgrades
    expect(S.shopItems(g.state, 'tourer').length).toBeGreaterThan(10);
    expect(P.upgradeCost(g.state, 'nitroTank')).toBeGreaterThan(0);
  });
});

describe('cash steps: $5 up to $100, $10 up to $1,000, $50 above', () => {
  const steps = (xs: number[]) => xs.filter((x) => !onCashStep(x));
  it('rounds to the step of the amount', () => {
    expect([36, 38.5, 99, 102, 996, 1020, 1234].map(roundCash)).toEqual([35, 40, 100, 100, 1000, 1000, 1250]);
    expect([cashStep(100), cashStep(101), cashStep(1000), cashStep(1001)]).toEqual([5, 10, 10, 50]);
    expect([99, 104, 1049].map(floorCash)).toEqual([95, 100, 1000]);
  });
  it('every price in the tables is on a step', () => {
    expect(steps(PART_ORDER_PRICE.slice(1))).toEqual([]);
    expect(steps(UPGRADES.flatMap((u) => u.levels.map((l) => l.cost)))).toEqual([]);
    expect(steps(STYLE_ITEMS.map((i) => i.price))).toEqual([]);
    expect(steps(CARS.filter((c) => c.enabled).flatMap((c) => Array.from({ length: TUNE_STAGES }, (_, k) => tunePrice(c.id, k))))).toEqual([]);
    expect(onCashStep(TARGETED_CRATE_CASH_COST)).toBe(true);
    expect(steps(Object.values(MEDAL_REWARDS).flatMap((m) => [m.cash, m.cash * 2]))).toEqual([]);
    expect(steps([2, 3, 4, 5, 6, 7, 8, 9].map(MERGE_CASH))).toEqual([]);
  });
  it('every payout is on a step, and the preview equals what is paid', () => {
    for (const e of EVENTS) {
      expect(steps([...e.payout.cash, e.firstClear.cash, e.boss?.reward.cash ?? 0])).toEqual([]);
      for (const crew of [0, 1]) {
        const s = emptyGame();
        s.upgrades.crew = crew;
        const pv = P.purse(s, e);
        expect(steps([...pv.live, ...pv.quick, pv.perfect, pv.firstClear, P.starCash(e)])).toEqual([]);
        for (let place = 1; place <= 4; place++) {
          expect(P.computePayout(s, e, place, 'quick', 0).cash).toBe(pv.quick[place - 1]);
          const live = P.computePayout(s, e, place, 'live', 2);
          const once = live.firstClear ? pv.firstClear : 0;
          expect(live.cash).toBe(pv.live[place - 1] + 2 * pv.perfect + once);
        }
      }
    }
  });
  it('an early Quick Race pays a round amount ($35 or $40, never $36)', () => {
    const s = emptyGame();
    const q = P.purse(s, eventById('yard-sprint')).quick[0];
    expect([35, 40]).toContain(q);
  });
  it('a live race’s wallet change equals its breakdown, and every line is on a step', () => {
    const s = late();
    s.owned.push('tuner', 'super');
    s.activeCar = 'super';
    const r = commit(s, 'midnight-run', { place: 1, perfects: 2, playerTime: 1 })!;
    expect(steps(r.breakdown!.map((b) => b.cash))).toEqual([]);
    expect(r.breakdown!.reduce((a, b) => a + b.cash, 0)).toBe(r.cash);
    expect(s.cash).toBe(r.cash);
  });
  it('away earnings are paid on a step, never more than accrued', () => {
    const s = emptyGame();
    s.owned = ['junker', 'beater'];
    s.offline.lastSeenAt = T0;
    P.accrueOffline(s, T0 + 37 * 60_000);
    expect(s.offline.pendingCash).toBe(110); // 37 min × $3/min = $111 → $110
    expect(onCashStep(P.claimOffline(s))).toBe(true);
  });
  it('the first race plus its merges affords a useful part (a T2 order)', () => {
    const e = eventById('yard-sprint');
    expect(P.purse(emptyGame(), e).live[0] + e.firstClear.cash).toBeGreaterThanOrEqual(PART_ORDER_PRICE[2]);
  });
  it('preserves balances: an off-step wallet is never rounded', () => {
    const s = late();
    s.cash = 36564;
    commit(s, 'neon-mile', { place: 4 });
    expect(s.cash % 5).toBe((36564 + P.purse(s, eventById('neon-mile')).live[3]) % 5);
  });
});

describe('endgame unlocks and earned style', () => {
  it('each new car needs Rep, a crafted keystone and a won event — Rep alone never unlocks it', () => {
    for (const id of ['rally', 'gt', 'proto'] as const) {
      const c = CARS.find((x) => x.id === id)!;
      expect(c.enabled).toBe(true);
      expect(c.unlock?.event).toBeTruthy();
      const s = emptyGame();
      s.owned = CARS.filter((x) => x.enabled && CARS.indexOf(x) < CARS.indexOf(c)).map((x) => x.id);
      s.rep = c.unlock!.rep + 1;
      P.checkUnlocks(s, []);
      expect(s.owned).not.toContain(id);
      s.crafted.push(`${c.unlock!.family}:${c.unlock!.tier}`);
      P.checkUnlocks(s, []);
      expect(s.owned).not.toContain(id);
      s.events[c.unlock!.event!] = { wins: 1, starts: 1, bestPlace: 1, bestTime: 20 };
      P.checkUnlocks(s, []);
      expect(s.owned).toContain(id);
    }
  });
  it('a Corvo Rally podium earns the Rally livery and a Downtown win the Neon livery, once each', () => {
    const s = late();
    s.owned.push('tuner', 'super', 'rally');
    s.activeCar = 'rally';
    const r = commit(s, 'dust-stage', { place: 3 })! as ReturnType<typeof commit> & { earnedStyle?: string[] };
    expect(r.earnedStyle).toEqual(['livery:rally']);
    expect(s.owns).toContain('livery:rally');
    s.activeCar = 'tourer';
    commit(s, 'neon-mile', { place: 1 });
    expect(s.owns).toContain('livery:neon');
    expect(s.owns.filter((x) => x.startsWith('livery:'))).toHaveLength(2);
    expect(S.applyStyle(s, 'livery:rally', 'junker')).toEqual([]);
    expect(S.carStyle(s, 'junker').livery).toBe('rally');
  });
  it('per-car mastery records stay current and are readable through masteryFor', () => {
    const s = late();
    commit(s, 'neon-mile', { place: 1, playerTime: 22.5, shifts: 5, shiftsClean: 4, topSpeed: 50, perfects: 1 });
    commit(s, 'neon-mile', { place: 2, playerTime: 22.9, shifts: 5, shiftsClean: 2, topSpeed: 52 });
    const m = P.masteryFor(s, 'tourer');
    expect(m).toMatchObject({ races: 2, wins: 1, podiums: 2, perfects: 1, shifts: 10, shiftsClean: 6, eventsRaced: 1, topMph: 116 });
    expect(m.best['neon-mile']).toBe(22.5);
    expect(m.shiftRate).toBeCloseTo(0.6);
    expect(P.masteryFor(s, 'proto').races).toBe(0);
  });
});
