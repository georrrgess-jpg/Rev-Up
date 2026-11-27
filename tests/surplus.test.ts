// Scrap & surplus: Build Sheets (donated parts → permanent, capped car builds) and the Fab bench (scrap → one-race
// kits armed in Pit Setup). Sinks, caps, no loops, no duplication, persistence across reload, old saves, and the
// pacing guard (time to each car with a player who donates and races with kits).
import { describe, expect, it } from 'vitest';
import * as B from '../src/core/board';
import * as F from '../src/core/fabrication';
import { Game } from '../src/core/game';
import { computeLoadout } from '../src/core/loadout';
import * as P from '../src/core/progression';
import * as PJ from '../src/core/projects';
import { runRace } from '../src/core/race';
import { MemoryKV, encodeSave, saveKey } from '../src/core/save';
import { GameState, Part, migrate, newGame, validateState } from '../src/core/state';
import { BUILD_STAGE_BONUS, KITS_PER_RACE, KIT_SHELF_MAX, kitCost } from '../src/data/fabrication';
import { CarId, Family, PART_ORDER_PRICE, SCRAP_VALUE, carById, scrapOrderCost } from '../src/data/tables';
import { PLAYERS, runBot } from './bot';
import { emptyGame, put } from './helpers';

const T0 = 1_700_000_000_000;
const gameFrom = (s: GameState, kv = new MemoryKV()) => {
  kv.setItem(saveKey('/t/'), encodeSave(s));
  return { g: new Game(kv, '/t/', T0), kv };
};
const fit = (s: GameState, car: CarId, f: Family, t: number): Part => {
  const p: Part = { id: s.nextPartId++, f, t, q: 'std' };
  ((s.installed ??= {})[car] ??= {})[f] = p;
  return p;
};
function garage(cars: CarId[]): GameState {
  const s = emptyGame(5);
  s.owned = cars; s.activeCar = cars[cars.length - 1]; s.revealed = [...cars];
  s.stats.milestones.firstMerge = 1;
  s.stats.races = 3;
  return s;
}
const ids = (s: GameState) => [...s.board, ...s.tray].filter(Boolean).map((p) => p!.id);

describe('Build Sheets', () => {
  it('points depend on the tier against the car cap and on quality; low tiers are refused', () => {
    // Ironhorse cap 5
    expect(PJ.donorPoints({ t: 3, q: 'std' }, 'muscle')).toBe(0);
    expect(PJ.donorPoints({ t: 4, q: 'std' }, 'muscle')).toBe(2);
    expect(PJ.donorPoints({ t: 5, q: 'std' }, 'muscle')).toBe(4);
    expect(PJ.donorPoints({ t: 6, q: 'std' }, 'muscle')).toBe(8);
    expect(PJ.donorPoints({ t: 9, q: 'std' }, 'muscle')).toBe(12); // capped at cap+2
    expect(PJ.donorPoints({ t: 5, q: 'polished' }, 'muscle')).toBe(6);
    expect(PJ.donorPoints({ t: 5, q: 'mint' }, 'muscle')).toBe(8);
  });

  it('stage 3 needs a Polished donor and stage 4 a Mint one; the bonus is capped', () => {
    const s = garage(['junker', 'beater', 'hothatch', 'muscle']);
    const car = 'hothatch'; // cap 4
    const give = (t: number, q: Part['q']) => { const p = put(s, 0, 0, 'engine', t, q); const ev = PJ.donatePart(s, p.id, car); expect(ev[0].type).toBe('donate'); };
    for (let i = 0; i < 9; i++) give(4, 'std'); // 36 pts: enough for three stages, but no seal
    expect(PJ.stageOf(PJ.trackOf(s, car, 'engine'))).toBe(2);
    expect(PJ.trackView(s, car, 'engine').sealNeed).toBe(1);
    give(4, 'polished');
    expect(PJ.stageOf(PJ.trackOf(s, car, 'engine'))).toBe(3);
    for (let i = 0; i < 3; i++) give(5, 'std'); // 42 + 24 → fills the points (60)
    expect(PJ.trackOf(s, car, 'engine').pts).toBe(PJ.BUILD_MAX_PTS);
    expect(PJ.stageOf(PJ.trackOf(s, car, 'engine'))).toBe(3);
    // a standard donor would be wasted now: refused, and the part stays
    const std = put(s, 0, 1, 'engine', 6, 'std');
    expect(PJ.donatePart(s, std.id, car)[0].type).toBe('invalid');
    expect(s.board[1]).not.toBeNull();
    give(4, 'mint');
    expect(PJ.stageOf(PJ.trackOf(s, car, 'engine'))).toBe(4);
    const more = put(s, 0, 2, 'engine', 6, 'mint');
    expect(PJ.donatePart(s, more.id, car)[0].type).toBe('invalid'); // complete
    // cap: every track complete → +3% top, +3% accel, +2% grip at most
    for (const f of ['tires', 'turbo'] as const) s.builds![car]![f] = { pts: PJ.BUILD_MAX_PTS, seal: 2 };
    const m = PJ.buildMul(s, car);
    expect(m.top).toBeCloseTo(1 + 4 * BUILD_STAGE_BONUS.engine!, 9);
    expect(m.top).toBeLessThanOrEqual(1.03 + 1e-9);
    expect(m.accel).toBeLessThanOrEqual(1.03 + 1e-9);
    expect(m.grip).toBeLessThanOrEqual(1.02 + 1e-9);
    expect(PJ.buildLevel(s, car)).toBe(PJ.BUILD_LEVEL_MAX);
  });

  it('a build raises the race stats, except in a stock-class race', () => {
    const s = garage(['junker', 'beater', 'hothatch', 'muscle']);
    fit(s, 'hothatch', 'engine', 4); fit(s, 'hothatch', 'tires', 4); fit(s, 'hothatch', 'turbo', 4);
    const before = computeLoadout(s, 'hothatch').stats;
    const stock = computeLoadout(s, 'hothatch', undefined, 3).stats;
    (s.builds ??= {}).hothatch = { engine: { pts: 20, seal: 0 } }; // stage 2
    const after = computeLoadout(s, 'hothatch').stats;
    expect(after.top / before.top).toBeCloseTo(1 + 2 * BUILD_STAGE_BONUS.engine!, 9);
    expect(after.grip).toBe(before.grip);
    expect(computeLoadout(s, 'hothatch', undefined, 3).stats).toEqual(stock);
  });

  it('a donated part is gone exactly once: repeat taps, fitted parts and other cars change nothing', () => {
    const s = garage(['junker', 'beater', 'hothatch', 'muscle']);
    const p = put(s, 1, 1, 'turbo', 5, 'polished');
    const fitted = fit(s, 'hothatch', 'turbo', 4);
    const { g } = gameFrom(s);
    const n0 = ids(g.state).length;
    expect(g.donatePart(p.id, 'hothatch')[0].type).toBe('donate');
    const pts = PJ.trackOf(g.state, 'hothatch', 'turbo').pts;
    expect(g.donatePart(p.id, 'hothatch')[0].type).toBe('invalid');
    expect(g.donatePart(p.id, 'beater')[0].type).toBe('invalid');
    expect(PJ.trackOf(g.state, 'hothatch', 'turbo').pts).toBe(pts);
    expect(g.state.builds?.beater).toBeUndefined();
    expect(ids(g.state).length).toBe(n0 - 1);
    // fitted parts are not on the bench: can't be donated
    expect(g.donatePart(fitted.id, 'hothatch')[0].type).toBe('invalid');
    expect(g.state.installed.hothatch!.turbo!.id).toBe(fitted.id);
    expect(validateState(g.state)).toEqual([]);
  });

  it('bulk donation skips starred parts, gives each part to its best car and never double-counts', () => {
    const s = garage(['junker', 'beater', 'hothatch', 'muscle']);
    const a = put(s, 0, 0, 'engine', 5);
    const b = put(s, 0, 1, 'engine', 6, 'mint');
    const c = put(s, 0, 2, 'tires', 1); // only the Tapeback takes a T1, and its Chassis build is complete
    (s.builds ??= {}).junker = { tires: { pts: PJ.BUILD_MAX_PTS, seal: 2 } };
    s.favorites = [b.id];
    const ev = PJ.donateBest(s, [a.id, a.id, b.id, c.id]);
    expect(ev.filter((e) => e.type === 'donate').length).toBe(1);
    expect(s.board[2]).toMatchObject({ id: c.id });
    expect(s.board[1]).toMatchObject({ id: b.id });
    // the racing car (the Ironhorse, cap 5) takes the T5 Engine: 4 pts, though the Corsa would score it 12
    expect(PJ.trackOf(s, 'muscle', 'engine').pts).toBe(4);
    expect(PJ.trackOf(s, 'beater', 'engine').pts).toBe(0);
    // a part the racing car can't take goes to the fastest car that can
    const low = put(s, 0, 3, 'turbo', 3);
    PJ.donateBest(s, [low.id]);
    expect(PJ.trackOf(s, 'hothatch', 'turbo').pts).toBe(2);
  });

  it('a donation never makes the keystone: the next car still needs the merge', () => {
    const s = garage(['junker', 'beater', 'hothatch', 'muscle']);
    s.rep = 99999;
    s.events['coast-crown'] = { wins: 1, starts: 1, bestPlace: 1, bestTime: 20 };
    const ord = put(s, 0, 0, 'engine', 6); // the Altamar keystone tier, but not merged by you
    const { g } = gameFrom(s);
    expect(g.donatePart(ord.id, 'muscle')[0].type).toBe('donate');
    expect(g.state.crafted.includes('engine:6')).toBe(false);
    expect(g.state.owned.includes('tourer')).toBe(false);
  });

  it('no loop: donating returns no cash or scrap, so buy → donate is a pure sink', () => {
    const s = garage(['junker', 'beater', 'hothatch', 'muscle']);
    s.cash = 5000; s.scrap = 500;
    const { g } = gameFrom(s);
    g.orderPart('engine', 4);
    const p = B.allParts(g.state).find((x) => x.f === 'engine' && x.t === 4)!;
    const cash = g.state.cash, scrap = g.state.scrap;
    expect(cash).toBe(5000 - PART_ORDER_PRICE[4]);
    g.donatePart(p.id, 'muscle');
    expect(g.state.cash).toBe(cash);
    expect(g.state.scrap).toBe(scrap);
    // a scrap order donated: the points cost scrapOrderCost and give nothing back
    g.scrapOrder('engine', 4);
    const q = B.allParts(g.state).find((x) => x.f === 'engine' && x.t === 4)!;
    g.donatePart(q.id, 'muscle');
    expect(g.state.scrap).toBe(scrap - scrapOrderCost(4));
  });

  it('a full bench: donating frees the cell and the next queued crate opens there (no duplication)', () => {
    const s = garage(['junker', 'beater', 'hothatch', 'muscle']);
    s.board = s.board.map(() => ({ id: s.nextPartId++, f: 'turbo' as const, t: 1, q: 'std' as const }));
    s.tray = s.tray.map(() => ({ id: s.nextPartId++, f: 'turbo' as const, t: 1, q: 'std' as const }));
    s.board[0] = { id: s.nextPartId++, f: 'engine', t: 4, q: 'std' };
    s.crates = [{ kind: 'targeted', family: 'tires', tier: 2, source: 'shop' }];
    const { g } = gameFrom(s);
    g.donatePart(g.state.board[0]!.id, 'hothatch');
    expect(g.state.crates.length).toBe(0);
    expect(g.state.board[0]).toMatchObject({ f: 'tires', t: 2 });
    expect(validateState(g.state)).toEqual([]);
  });
});

describe('Fab bench', () => {
  it('kits cost scrap by your best car’s class and the shelf is capped', () => {
    expect(kitCost(2)).toBe(5);
    expect(kitCost(5)).toBe(15);
    expect(kitCost(7)).toBe(60);
    expect(kitCost(9)).toBe(255);
    const s = garage(['junker', 'beater', 'hothatch']);
    s.scrap = 100;
    expect(F.fabricate(s, 'canister')[0].type).toBe('invalid'); // opens with the Ironhorse
    s.owned.push('muscle');
    expect(F.kitPrice(s)).toBe(kitCost(5));
    s.scrap = 1000;
    for (let i = 0; i < KIT_SHELF_MAX; i++) expect(F.fabricate(s, 'softs')[0].type).toBe('fabricate');
    expect(F.fabricate(s, 'softs')[0].type).toBe('invalid');
    expect(F.kitCount(s, 'softs')).toBe(KIT_SHELF_MAX);
    expect(s.scrap).toBe(1000 - KIT_SHELF_MAX * kitCost(5));
    // one surplus part of your top class recycles into exactly two kits (never more), at every class
    for (let cap = 2; cap <= 9; cap++) expect(Math.floor(Math.max(SCRAP_VALUE[cap], 10) / kitCost(cap))).toBeGreaterThanOrEqual(2);
    for (let cap = 5; cap <= 9; cap++) expect(Math.floor(SCRAP_VALUE[cap] / kitCost(cap))).toBe(2);
  });

  it('armed kits apply to the next live race and are used once, when it is committed', () => {
    const s = garage(['junker', 'beater', 'hothatch', 'muscle']);
    s.activeCar = 'beater';
    fit(s, 'beater', 'engine', 2); fit(s, 'beater', 'tires', 2); fit(s, 'beater', 'turbo', 2);
    s.scrap = 500; s.nitro = 2;
    const { g, kv } = gameFrom(s);
    g.fabricate('softs'); g.fabricate('canister'); g.fabricate('fuel');
    g.armKit('softs', true); g.armKit('canister', true); // one kit a race: arming another replaces it
    expect(F.armedKits(g.state).map((k) => k.id)).toEqual(['canister']);
    expect(F.armedKits(g.state).length).toBe(KITS_PER_RACE);
    g.armKit('canister', false);
    expect(F.armedKits(g.state)).toEqual([]);
    g.armKit('softs', true);
    const base = computeLoadout(g.state, 'beater').stats;
    const setup = g.startRace('yard-sprint', T0 + 1000)!;
    expect(setup.player.stats.grip).toBeCloseTo(base.grip * 1.02, 9);
    expect(setup.player.stats.top).toBeCloseTo(base.top, 9);
    expect(setup.nitroCharges).toBe(2 + 1); // bank + crew
    // abandon: nothing is used
    g.abandonRace(T0 + 2000);
    expect(F.kitCount(g.state, 'softs')).toBe(1);
    // reload mid-race: nothing is used either
    g.startRace('yard-sprint', T0 + 3000);
    const g2 = new Game(kv, '/t/', T0 + 4000);
    expect(F.kitCount(g2.state, 'softs')).toBe(1);
    // a committed race uses it once; the other kits stay on the shelf
    const st = g2.startRace('yard-sprint', T0 + 5000)!;
    const id = g2.pendingRaceId!;
    const out = runRace(st, 'perfect', 'clean');
    expect(g2.commitRace(id, out, T0 + 30_000)).not.toBeNull();
    expect(F.kitCount(g2.state, 'softs')).toBe(0);
    expect(F.kitCount(g2.state, 'canister')).toBe(1);
    expect(F.kitCount(g2.state, 'fuel')).toBe(1);
    expect(g2.state.fab!.armed).toEqual([]);
    expect(g2.commitRace(id, out, T0 + 31_000)).toBeNull();
    expect(F.kitCount(g2.state, 'softs')).toBe(0);
    // the next race carries no kits
    const next = g2.startRace('yard-sprint', T0 + 40_000)!;
    expect(next.player.stats).toEqual(computeLoadout(g2.state, 'beater').stats);
  });

  it('a Nitro canister is spent before the bank: using it costs no banked charge', () => {
    const s = garage(['junker', 'beater', 'hothatch', 'muscle']);
    s.activeCar = 'beater';
    fit(s, 'beater', 'engine', 2); fit(s, 'beater', 'tires', 2); fit(s, 'beater', 'turbo', 2);
    s.nitro = 1; s.scrap = 100;
    const { g } = gameFrom(s);
    g.fabricate('canister'); g.armKit('canister', true);
    const st = g.startRace('yard-sprint', T0 + 1000)!;
    expect(st.nitroCharges).toBe(3);
    const out = runRace(st, 'early', 'clean');
    const used = Math.min(2, out.nitroUsed); // crew + canister
    g.commitRace(g.pendingRaceId!, out, T0 + 30_000);
    if (out.nitroUsed <= 2) expect(g.state.nitro).toBe(1);
    else expect(g.state.nitro).toBe(Math.max(0, 1 - (out.nitroUsed - used)));
    // and without a canister the same use takes from the bank
    const s2 = garage(['junker', 'beater', 'hothatch', 'muscle']);
    s2.activeCar = 'beater'; s2.nitro = 1;
    const k = new Game(new MemoryKV(), '/u/', T0, s2);
    const st2 = k.startRace('yard-sprint', T0 + 1000)!;
    const out2 = { ...runRace(st2, 'early', 'clean'), nitroUsed: 2 };
    k.commitRace(k.pendingRaceId!, out2, T0 + 30_000);
    expect(k.state.nitro).toBe(0);
  });

  it('Quick Races never use kits', () => {
    const s = garage(['junker', 'beater', 'hothatch', 'muscle']);
    s.activeCar = 'beater'; s.scrap = 100;
    s.events['yard-sprint'] = { wins: 1, starts: 1, bestPlace: 1, bestTime: 20 };
    const { g } = gameFrom(s);
    g.fabricate('fuel'); g.armKit('fuel', true);
    g.quickRace('yard-sprint', T0 + 1000);
    g.tick(1, T0 + 10 * 60_000);
    expect(F.kitCount(g.state, 'fuel')).toBe(1);
    expect(F.armedKits(g.state).length).toBe(1);
  });

  it('grantItem (for other systems) respects the shelf cap; unknown ids add nothing', () => {
    const s = garage(['junker', 'beater', 'hothatch', 'muscle']);
    expect(F.grantItem(s, 'launch', 3)).toBe(3);
    expect(F.grantItem(s, 'launch', 9)).toBe(KIT_SHELF_MAX - 3);
    expect(F.grantItem(s, 'scrap', 25)).toBe(25);
    expect(s.scrap).toBe(25);
    expect(F.grantItem(s, 'bogus' as F.ItemId, 2)).toBe(0);
    expect(F.ITEM_IDS).toContain('canister');
  });

  it('no loop: scrap → kit → nothing returns, and recycling a bought part never pays for the kit it funds', () => {
    const s = garage(['junker', 'beater', 'hothatch', 'muscle']);
    s.scrap = 0; s.cash = 100_000;
    const { g } = gameFrom(s);
    // buy the best sold part for cash, recycle it: the scrap is far less than one kit at this class ... and cash is gone
    const t = B.orderMaxTier(g.state);
    g.orderPart('engine', t);
    const p = B.allParts(g.state).find((x) => x.t === t)!;
    g.recycleParts([p.id]);
    expect(g.state.scrap).toBe(SCRAP_VALUE[t]);
    expect(g.state.cash).toBe(100_000 - PART_ORDER_PRICE[t]);
    // a kit made from scrap can't be turned back into scrap or cash
    g.state.scrap; const before = { cash: g.state.cash };
    if (g.state.scrap >= F.kitPrice(g.state)) g.fabricate('fuel');
    expect(g.state.cash).toBe(before.cash);
  });
});

describe('saves', () => {
  it('builds and kits persist across a reload', () => {
    const s = garage(['junker', 'beater', 'hothatch', 'muscle']);
    const p = put(s, 0, 0, 'tires', 4, 'mint');
    s.scrap = 300;
    const { g, kv } = gameFrom(s);
    g.donatePart(p.id, 'hothatch');
    g.fabricate('launch'); g.armKit('launch', true);
    const g2 = new Game(kv, '/t/', T0 + 60_000);
    expect(PJ.trackOf(g2.state, 'hothatch', 'tires')).toEqual({ pts: 8, seal: 2 });
    expect(F.kitCount(g2.state, 'launch')).toBe(1);
    expect(F.armedKits(g2.state).map((k) => k.id)).toEqual(['launch']);
  });

  it('an older save without the fields loads with none; malformed fields are cleaned, not fatal', () => {
    const old = newGame(T0) as GameState & Record<string, unknown>;
    delete old.builds; delete old.fab;
    const m = migrate(JSON.parse(JSON.stringify(old)))!;
    expect(m).not.toBeNull();
    expect(m.builds).toBeUndefined();
    expect(PJ.buildLevel(m, 'junker')).toBe(0);
    expect(F.armedKits(m)).toEqual([]);
    const bad = { ...JSON.parse(JSON.stringify(old)), builds: { muscle: { engine: { pts: 'x' }, tires: { pts: 9999, seal: 7 }, aero: { pts: 4 } } }, fab: { kits: { softs: -3, fuel: 2 }, armed: [1, 'fuel'], inRace: 'no' } };
    const c = migrate(bad)!;
    expect(c).not.toBeNull();
    expect(c.builds!.muscle).toEqual({ tires: { pts: PJ.BUILD_MAX_PTS, seal: 2 } });
    expect(c.fab).toEqual({ kits: { fuel: 2 }, armed: ['fuel'], inRace: null });
    expect(validateState(c)).toEqual([]);
  });
});

describe('pacing with Build Sheets and kits (simulation)', () => {
  it('a player who donates surplus and races with kits does not reach the cars much sooner', () => {
    /** A player who recycles every surplus part (already possible in 1.6) and, with `sinks`, first donates what a
     *  build takes and arms a Nitro canister (the strongest kit) whenever scrap allows — the most a player can squeeze from the new sinks. */
    const run = (sinks: boolean) => {
      let step = 0;
      const used = { donated: 0, kits: 0, recycled: 0 };
      const L = runBot({
        ...PLAYERS.mixed, seed: 1, untilCar: 'proto', maxS: 3 * 3600,
        onStep: (g) => {
          if (step++ % 5) return;
          const surplus = () => P.spareParts(g.state).filter((u) => u.verdict === 'recycle').map((u) => u.part.id);
          if (sinks && PJ.buildsOpen(g.state) && surplus().length) used.donated += g.donateBest(surplus()).filter((e) => e.type === 'donate').length;
          if (surplus().length) used.recycled += g.recycleParts(surplus()).filter((e) => e.type === 'scrap').length;
          if (sinks && F.fabOpen(g.state) && F.armedKits(g.state).length < 1) {
            for (const k of ['canister'] as const) {
              if (F.kitCount(g.state, k) === 0 && g.state.scrap >= F.kitPrice(g.state)) { g.fabricate(k); used.kits++; }
              if (F.kitCount(g.state, k) > 0) g.armKit(k, true);
            }
          }
        },
      });
      return { L, used };
    };
    const base = runBot({ ...PLAYERS.mixed, seed: 1, untilCar: 'proto', maxS: 3 * 3600 });
    const ctrl = run(false);
    const full = run(true);
    const cars: CarId[] = ['beater', 'hothatch', 'muscle', 'tourer', 'tuner', 'super', 'rally', 'gt', 'proto'];
    const rows = cars.map((c) => `${carById(c).model.padEnd(14)} ${String(base.milestones[c]).padStart(6)} s  ${String(ctrl.L.milestones[c]).padStart(6)} s  ${String(full.L.milestones[c]).padStart(6)} s  ${(((full.L.milestones[c]! / ctrl.L.milestones[c]!) - 1) * 100).toFixed(1)}%`);
    console.log(`time to each car (mixed player): bot as is · recycles surplus · + donates and arms kits (${full.used.donated} donated, ${full.used.recycled} recycled, ${full.used.kits} kits)\n${rows.join('\n')}`);
    for (const c of cars) {
      expect(full.L.milestones[c]).toBeGreaterThan(0);
      expect(full.L.milestones[c]!).toBeGreaterThanOrEqual(ctrl.L.milestones[c]! * 0.9); // the new sinks: at most 10% sooner
    }
  }, 180_000);
});
