import { describe, expect, it } from 'vitest';
import * as B from '../src/core/board';
import { Game } from '../src/core/game';
import * as I from '../src/core/install';
import { computeLoadout, contributionOn, statsFor } from '../src/core/loadout';
import { MemoryKV } from '../src/core/save';
import { GameState, Part } from '../src/core/state';
import { ACTIVE_FAMILIES, Family, carById } from '../src/data/tables';
import { emptyGame, put } from './helpers';

const T0 = 1_700_000_000_000;

/** Every part id wherever it lives: bench, spare rack, and every car's slots. */
const allIds = (s: GameState) => [...B.allParts(s), ...I.installedParts(s)].map((p) => p.id).sort((a, b) => a - b);
const expectNoDuplicates = (s: GameState) => {
  const ids = allIds(s);
  expect(new Set(ids).size).toBe(ids.length);
};
const part = (s: GameState, f: Family, t: number, q: Part['q'] = 'std'): Part => ({ id: s.nextPartId++, f, t, q });
/** Fill every empty bench and spare-rack cell with T1 turbos. */
const fillBench = (s: GameState) => {
  s.board = s.board.map((p) => p ?? part(s, 'turbo', 1));
  s.tray = s.tray.map((p) => p ?? part(s, 'turbo', 1));
};

describe('install, swap and remove', () => {
  it('fitting a part takes it off the bench and frees its cell; ids and crafted credit are untouched', () => {
    const s = emptyGame();
    s.crafted = ['engine:2'];
    const p = put(s, 1, 2, 'engine', 2);
    const before = allIds(s);
    const ev = I.installPart(s, 'junker', { zone: 'board', i: 1 * s.cols + 2 });
    expect(ev[0]).toMatchObject({ type: 'install', partId: p.id, outgoingId: null });
    expect(s.board[1 * s.cols + 2]).toBeNull();
    expect(s.installed.junker?.engine).toEqual(p);
    expect(allIds(s)).toEqual(before);
    expect(s.crafted).toEqual(['engine:2']);
    expect(I.locatePart(s, p.id)).toEqual({ car: 'junker', family: 'engine' });
  });

  it('a swap on a completely full bench is atomic: the outgoing part takes the incoming part\'s cell', () => {
    const s = emptyGame();
    put(s, 0, 0, 'engine', 1);
    I.installPart(s, 'junker', { zone: 'board', i: 0 });
    const newer = put(s, 3, 3, 'engine', 2);
    fillBench(s);
    expect(B.freeSlots(s)).toBe(0);
    const old = s.installed.junker!.engine!;
    const before = allIds(s);
    const at = { zone: 'board' as const, i: 3 * s.cols + 3 };
    const ev = I.installPart(s, 'junker', at);
    expect(ev[0]).toMatchObject({ type: 'install', partId: newer.id, outgoingId: old.id, from: at });
    expect(B.getPart(s, at)).toEqual(old);
    expect(s.installed.junker!.engine).toEqual(newer);
    expect(allIds(s)).toEqual(before);
    expectNoDuplicates(s);
  });

  it('removing with no free cell changes nothing and explains how to make room', () => {
    const s = emptyGame();
    put(s, 0, 0, 'tires', 2);
    I.installPart(s, 'junker', { zone: 'board', i: 0 });
    fillBench(s);
    const snap = JSON.stringify(s);
    const ev = I.removePart(s, 'junker', 'tires');
    expect(ev).toHaveLength(1);
    expect(ev[0].type).toBe('invalid');
    expect(ev[0].type === 'invalid' && ev[0].reason).toMatch(/merge a pair or scrap a part/);
    expect(JSON.stringify(s)).toBe(snap);
  });

  it('a Game removal on a full bench keeps the saved setup intact', () => {
    const g = new Game(new MemoryKV(), '/t/', T0, emptyGame());
    const s = g.state;
    s.board[0] = part(s, 'engine', 2);
    g.installPart('junker', { zone: 'board', i: 0 }, T0);
    fillBench(g.state);
    const snap = JSON.stringify(g.state.installed);
    const ev = g.removePart('junker', 'engine', undefined, T0);
    expect(ev[0].type).toBe('invalid');
    expect(JSON.stringify(g.state.installed)).toBe(snap);
    expect(B.freeSlots(g.state)).toBe(0);
  });

  it('removal goes to the first free cell (bench before spare rack), or to a chosen empty cell', () => {
    const s = emptyGame();
    put(s, 0, 0, 'turbo', 3);
    I.installPart(s, 'junker', { zone: 'board', i: 0 });
    fillBench(s);
    s.tray[2] = null;
    const ev = I.removePart(s, 'junker', 'turbo');
    expect(ev[0]).toMatchObject({ type: 'uninstall', to: { zone: 'tray', i: 2 } });
    expect(B.getPart(s, { zone: 'tray', i: 2 })?.t).toBe(3);
    // to a chosen cell: refused when occupied, lands exactly there when empty
    I.installPart(s, 'junker', { zone: 'tray', i: 2 });
    expect(I.removePart(s, 'junker', 'turbo', { zone: 'board', i: 5 })[0].type).toBe('invalid');
    s.board[5] = null;
    I.removePart(s, 'junker', 'turbo', { zone: 'board', i: 5 });
    expect(B.getPart(s, { zone: 'board', i: 5 })?.t).toBe(3);
    expect(s.installed.junker?.turbo).toBeUndefined();
    expectNoDuplicates(s);
  });

  it('refuses unowned cars, empty cells and inactive families without changing anything', () => {
    const s = emptyGame();
    put(s, 0, 0, 'engine', 2);
    s.board[1] = part(s, 'aero', 2);
    const snap = JSON.stringify(s);
    expect(I.installPart(s, 'beater', { zone: 'board', i: 0 })[0].type).toBe('invalid');
    expect(I.installPart(s, 'junker', { zone: 'board', i: 9 })[0].type).toBe('invalid');
    expect(I.installPart(s, 'junker', { zone: 'board', i: 1 })[0].type).toBe('invalid');
    expect(I.removePart(s, 'junker', 'engine')[0].type).toBe('invalid');
    expect(JSON.stringify(s)).toBe(snap);
  });
});

describe('moving parts between cars', () => {
  it('swaps slots atomically, never needs a bench cell, and never duplicates', () => {
    const s = emptyGame();
    s.owned.push('beater');
    put(s, 0, 0, 'engine', 3);
    put(s, 0, 1, 'engine', 1);
    I.installPart(s, 'beater', { zone: 'board', i: 0 });
    I.installPart(s, 'junker', { zone: 'board', i: 1 });
    fillBench(s);
    const t3 = s.installed.beater!.engine!, t1 = s.installed.junker!.engine!;
    const ev = I.movePartBetweenCars(s, 'beater', 'engine', 'junker');
    expect(ev[0]).toMatchObject({ type: 'move-fit', partId: t3.id, outgoingId: t1.id });
    expect(s.installed.junker!.engine).toEqual(t3);
    expect(s.installed.beater!.engine).toEqual(t1);
    // into an empty slot: the source slot empties
    put(s, 0, 0, 'tires', 2); // (overwrites a filler; fine for this check)
    s.installed.beater!.tires = part(s, 'tires', 2);
    I.movePartBetweenCars(s, 'beater', 'tires', 'junker');
    expect(s.installed.beater!.tires).toBeUndefined();
    expect(s.installed.junker!.tires?.t).toBe(2);
    expectNoDuplicates(s);
  });

  it('fitFrom refuses a stale source (the part moved since the list was built)', () => {
    const s = emptyGame();
    s.owned.push('beater');
    const p = put(s, 0, 0, 'engine', 2);
    const src = { at: { zone: 'board' as const, i: 0 }, part: p };
    B.moveOrFuse(s, { zone: 'board', i: 0 }, { zone: 'board', i: 3 }, 0);
    const snap = JSON.stringify(s);
    expect(I.fitFrom(s, 'junker', src)[0].type).toBe('invalid');
    expect(JSON.stringify(s)).toBe(snap);
    expect(I.fitFrom(s, 'junker', { at: { zone: 'board', i: 3 }, part: p })[0].type).toBe('install');
    expect(I.fitFrom(s, 'junker', { car: 'junker', part: p })[0].type).toBe('invalid');
  });

  it('lists candidates from the bench, the spare rack and other cars, strongest on this car first', () => {
    const s = emptyGame();
    s.owned.push('beater', 'hothatch');
    put(s, 0, 0, 'tires', 1);
    put(s, 0, 1, 'tires', 4); // above the Corsa's T3 cap: ties with a T3 there
    s.tray[0] = part(s, 'tires', 3);
    s.installed.hothatch = { tires: part(s, 'tires', 2, 'polished') };
    const c = I.fitCandidates(s, 'beater', 'tires');
    expect(c.map((x) => x.part.t)).toEqual([3, 4, 2, 1]); // T3 and T4 tie at the cap: the lower tier first
    expect('car' in c[2] && c[2].car).toBe('hothatch');
  });
});

describe('recommended fit', () => {
  it('fills empty slots from the bench; ties keep what is fitted; parts above the cap run at the cap', () => {
    const s = emptyGame();
    put(s, 0, 0, 'engine', 2);
    put(s, 0, 1, 'engine', 4);
    put(s, 0, 2, 'turbo', 1);
    I.fitRecommended(s, 'junker'); // Tapeback cap T2: the T2 and T4 tie, so the T2 goes in and the T4 stays free
    expect(s.installed.junker).toMatchObject({ engine: { t: 2 }, turbo: { t: 1 } });
    expect(Object.keys(I.recommendedFit(s, 'junker'))).toEqual([]);
    // a manual swap to the T4 is allowed and runs at the cap tier: same stats
    const st = computeLoadout(s, 'junker').stats;
    I.installPart(s, 'junker', { zone: 'board', i: 1 });
    expect(computeLoadout(s, 'junker').blocked.engine?.t).toBe(4);
    expect(computeLoadout(s, 'junker').stats.top).toBeCloseTo(st.top, 9);
    expect(I.recommendedFit(s, 'junker').engine).toBeUndefined(); // tie: keep what is fitted
  });

  it('a Polished part beats a standard one of the same tier', () => {
    const s = emptyGame();
    put(s, 0, 0, 'tires', 2);
    put(s, 0, 1, 'tires', 2, 'polished');
    expect(I.recommendedFit(s, 'junker').tires?.part.q).toBe('polished');
  });

  it('takes a part from another car only when strictly better than anything on the bench', () => {
    const s = emptyGame();
    s.owned.push('beater', 'hothatch');
    s.activeCar = 'hothatch';
    s.installed.beater = { engine: part(s, 'engine', 4) }; // runs at T3 on the Corsa
    put(s, 0, 0, 'engine', 4);
    let r = I.recommendedFit(s, 'hothatch').engine!;
    expect('at' in r).toBe(true); // a bench T4 ties with the Corsa's T4: the bench part
    s.board[0] = null;
    put(s, 0, 0, 'engine', 3);
    r = I.recommendedFit(s, 'hothatch').engine!;
    expect('car' in r && r.car).toBe('beater');
    const before = allIds(s);
    I.fitRecommended(s, 'hothatch');
    expect(s.installed.hothatch?.engine?.t).toBe(4);
    expect(s.installed.beater?.engine).toBeUndefined();
    expect(allIds(s)).toEqual(before);
  });

  it('the recommended fit is never worse than the current build, on every owned car', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const s = emptyGame(seed);
      s.owned = ['junker', 'beater', 'hothatch', 'muscle'];
      let r = seed * 7919;
      const rnd = () => ((r = (r * 1103515245 + 12345) >>> 0) / 2 ** 32);
      const fams: Family[] = ['engine', 'tires', 'turbo'];
      for (let i = 0; i < s.board.length; i++) if (rnd() < 0.6) s.board[i] = part(s, fams[Math.floor(rnd() * 3)], 1 + Math.floor(rnd() * 6), rnd() < 0.1 ? 'polished' : 'std');
      for (const car of s.owned) I.fitRecommended(s, car);
      const before = allIds(s);
      for (const car of s.owned) {
        const st = computeLoadout(s, car).stats;
        const prev = I.previewRecommended(s, car);
        I.fitRecommended(s, car);
        const after = computeLoadout(s, car).stats;
        expect(after.top).toBeGreaterThanOrEqual(st.top - 1e-9);
        expect(after.accel).toBeGreaterThanOrEqual(st.accel - 1e-9);
        expect(after.grip).toBeGreaterThanOrEqual(st.grip - 1e-9);
        expect(after.top).toBeCloseTo(prev.after.top, 9);
      }
      expect(allIds(s)).toEqual(before);
      expectNoDuplicates(s);
    }
  });
});

describe('merging and scrapping never touch fitted parts', () => {
  it('Merge All, crate drops and scrap work only on the bench', () => {
    const s = emptyGame();
    put(s, 0, 0, 'engine', 2);
    I.installPart(s, 'junker', { zone: 'board', i: 0 });
    const fittedBefore = JSON.stringify(s.installed);
    put(s, 1, 0, 'engine', 2);
    put(s, 1, 1, 'engine', 1);
    put(s, 2, 1, 'engine', 1);
    B.mergeAll(s);
    B.scrapPart(s, { zone: 'board', i: 1 * s.cols });
    expect(JSON.stringify(s.installed)).toBe(fittedBefore);
    expect(B.hasAnyPair(s)).toBe(false);
    expectNoDuplicates(s);
  });

  it('bench parts that beat a car\'s fitted part are flagged as upgrades', () => {
    const s = emptyGame();
    s.owned.push('beater');
    const t1 = put(s, 0, 0, 'turbo', 1);
    expect(I.upgradesFor(s, t1)).toEqual(['junker', 'beater']); // the active car first
    I.installPart(s, 'junker', { zone: 'board', i: 0 });
    const t3 = put(s, 0, 1, 'turbo', 3);
    expect(I.upgradesFor(s, t3)).toEqual(['junker', 'beater']);
    const st = I.slotStatus(s, 'junker');
    expect(st.better).toEqual(['turbo']);
    expect(st.empty).toEqual(['engine', 'tires']);
  });
});

describe('v1 → v2 migration: the exact v1 auto-equip', () => {
  /** v1's rule (pre-v2 loadout.ts): strongest at the cap; ties → lower tier, then lower id; board then tray. */
  const v1Pick = (s: GameState) => {
    const cap = carById(s.activeCar).cap;
    const eq: Partial<Record<Family, Part>> = {};
    for (const p of B.allParts(s)) {
      const cur = eq[p.f];
      if (!cur) { eq[p.f] = p; continue; }
      const a = contributionOn(p, cap), b = contributionOn(cur, cap);
      if (a > b || (a === b && (p.t < cur.t || (p.t === cur.t && p.id < cur.id)))) eq[p.f] = p;
    }
    return eq;
  };

  it('fits exactly the parts v1 equipped, keeps every part once, and keeps the stats (randomized saves)', () => {
    const cars = ['junker', 'beater', 'hothatch', 'muscle', 'tourer'] as const;
    for (let seed = 1; seed <= 40; seed++) {
      const s = emptyGame(seed);
      let r = seed * 104729;
      const rnd = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 2 ** 32);
      s.owned = [...cars];
      s.activeCar = cars[seed % cars.length];
      // shuffled ids so "lower id" ties are exercised, parts in the tray too
      const ids = Array.from({ length: 60 }, (_, i) => i + 1).sort(() => rnd() - 0.5);
      let k = 0;
      const mk = (): Part => ({ id: ids[k++], f: ACTIVE_FAMILIES[Math.floor(rnd() * 3)], t: 1 + Math.floor(rnd() * 6), q: rnd() < 0.15 ? 'polished' : rnd() < 0.05 ? 'mint' : 'std' });
      for (let i = 0; i < s.board.length; i++) if (rnd() < 0.5) s.board[i] = mk();
      for (let i = 0; i < s.tray.length; i++) if (rnd() < 0.5) s.tray[i] = mk();
      s.nextPartId = 100;
      s.installed = {};
      const want = v1Pick(s);
      const v1Stats = statsFor(s.activeCar, want);
      const before = allIds(s);
      I.installLegacyLoadout(s);
      const got = s.installed[s.activeCar] ?? {};
      for (const f of ACTIVE_FAMILIES) expect(got[f]?.id).toBe(want[f]?.id);
      const v2 = computeLoadout(s, s.activeCar).stats;
      expect(v2.top).toBeCloseTo(v1Stats.top, 9);
      expect(v2.accel).toBeCloseTo(v1Stats.accel, 9);
      expect(v2.grip).toBeCloseTo(v1Stats.grip, 9);
      expect(allIds(s)).toEqual(before);
      for (const c of cars) if (c !== s.activeCar) expect(s.installed[c]).toBeUndefined();
      // running it again never moves anything
      const snap = JSON.stringify(s);
      I.installLegacyLoadout(s);
      expect(JSON.stringify(s)).toBe(snap);
    }
  });
});
