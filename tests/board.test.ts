import * as I from '../src/core/install';
import { describe, expect, it } from 'vitest';
import * as B from '../src/core/board';
import { computeLoadout, scrapImpact } from '../src/core/loadout';
import { newGame } from '../src/core/state';
import { CRATE_SCRAP_COST, MAX_TIER, NITRO_CAP, SCRAP_VALUE, TARGETED_CRATE_SCRAP_COST } from '../src/data/tables';
import { at, emptyGame, put, seedForRoll } from './helpers';

const STD = () => seedForRoll(0.5, 1); // standard roll
const count = (s: ReturnType<typeof emptyGame>) => B.allParts(s).length;

describe('opening board', () => {
  it('has a matching pair ready to merge immediately', () => {
    const s = newGame(0, 42);
    const e1 = s.board[2 * s.cols + 1]!;
    const e2 = s.board[2 * s.cols + 2]!;
    expect(B.canFuse(e1, e2)).toBe(true);
    const ev = B.moveOrFuse(s, at(s, 2, 1), at(s, 2, 2), 1000);
    expect(ev.some((e) => e.type === 'fuse')).toBe(true);
  });
});

describe('fusion', () => {
  it('two same family+tier parts become one higher tier part in the destination', () => {
    const s = emptyGame();
    s.rng = STD();
    put(s, 0, 0, 'engine', 1);
    put(s, 0, 2, 'engine', 1);
    const ev = B.moveOrFuse(s, at(s, 0, 0), at(s, 0, 2), 0);
    expect(s.board[0]).toBeNull();
    expect(s.board[2]).toMatchObject({ f: 'engine', t: 2, q: 'std' });
    expect(ev.filter((e) => e.type === 'fuse')).toHaveLength(1);
    expect(s.crafted).toContain('engine:2');
  });

  it('quality never blocks a match', () => {
    const s = emptyGame();
    put(s, 0, 0, 'tires', 2, 'polished');
    put(s, 0, 2, 'tires', 2, 'mint');
    expect(B.canFuse(s.board[0], s.board[2])).toBe(true);
  });

  it('rejects different families, tiers, and the ceiling tier, leaving the board untouched', () => {
    const s = emptyGame();
    put(s, 0, 0, 'engine', 1);
    put(s, 0, 1, 'tires', 1);
    put(s, 1, 0, 'engine', 2);
    put(s, 2, 0, 'turbo', MAX_TIER);
    put(s, 2, 1, 'turbo', MAX_TIER);
    const snap = JSON.stringify(s.board);
    expect(B.moveOrFuse(s, at(s, 0, 0), at(s, 0, 1), 0)[0].type).toBe('invalid');
    expect(B.moveOrFuse(s, at(s, 0, 0), at(s, 1, 0), 0)[0].type).toBe('invalid');
    expect(B.moveOrFuse(s, at(s, 2, 0), at(s, 2, 1), 0)[0].type).toBe('invalid');
    expect(JSON.stringify(s.board)).toBe(snap);
  });

  it('moves into an empty slot and into the tray', () => {
    const s = emptyGame();
    put(s, 0, 0, 'engine', 1);
    B.moveOrFuse(s, at(s, 0, 0), { zone: 'tray', i: 2 }, 0);
    expect(s.tray[2]).toMatchObject({ f: 'engine' });
    expect(s.board[0]).toBeNull();
  });

  it('resolves a four-step cascade with stable neighbor order and conserves parts', () => {
    const s = emptyGame();
    s.rng = STD();
    // Drop T1 onto T1 at (2,2); neighbors T2 up, T3 right, T4 down, T5? no (ceiling). Chain: T1+T1→T2, +T2→T3, +T3→T4, +T4→T5
    put(s, 2, 0, 'engine', 1);
    put(s, 2, 2, 'engine', 1);
    put(s, 1, 2, 'engine', 2); // up
    put(s, 2, 3, 'engine', 3); // right
    put(s, 3, 2, 'engine', 4); // down
    // Force standard rolls for every fusion
    const before = count(s);
    const ev: ReturnType<typeof B.moveOrFuse> = [];
    // re-seed before each roll is impossible mid-chain; instead search a seed with 4 standard rolls
    for (let seed = 1; ; seed++) {
      const t = structuredClone(s);
      t.rng = seed;
      const e = B.moveOrFuse(t, at(t, 2, 0), at(t, 2, 2), 0);
      const fuses = e.filter((x) => x.type === 'fuse');
      if (fuses.every((f) => f.type === 'fuse' && f.q === 'std')) {
        Object.assign(s, t);
        ev.push(...e);
        break;
      }
    }
    const fuses = ev.filter((e) => e.type === 'fuse');
    expect(fuses).toHaveLength(4);
    expect(fuses.map((f) => (f.type === 'fuse' ? f.tier : 0))).toEqual([2, 3, 4, 5]);
    expect(s.board[2 * s.cols + 2]).toMatchObject({ f: 'engine', t: 5 });
    expect(count(s)).toBe(before - 4);
    expect(s.crafted).toEqual(expect.arrayContaining(['engine:2', 'engine:3', 'engine:4', 'engine:5']));
  });

  it('Polished roll adds 15% to the part contribution', () => {
    const s = emptyGame();
    s.rng = seedForRoll(0.02, 0.12);
    put(s, 0, 0, 'turbo', 1);
    put(s, 0, 1, 'turbo', 1);
    B.moveOrFuse(s, at(s, 0, 0), at(s, 0, 1), 0);
    const p = s.board[1]!;
    expect(p).toMatchObject({ t: 2, q: 'polished' });
    const lo = computeLoadout(s);
    const base = computeLoadout({ ...s, board: s.board.map((x) => (x ? { ...x, q: 'std' as const } : x)) });
    expect(lo.stats.accel - 3.6).toBeCloseTo((base.stats.accel - 3.6) * 1.15, 5);
  });

  it('Mint skips a tier and logs the crossed keystone tier', () => {
    const s = emptyGame();
    s.rng = seedForRoll(0, 0.02);
    put(s, 0, 0, 'tires', 2);
    put(s, 0, 1, 'tires', 2);
    const ev = B.moveOrFuse(s, at(s, 0, 0), at(s, 0, 1), 0);
    expect(s.board[1]).toMatchObject({ t: 4, q: 'mint' });
    expect(ev.find((e) => e.type === 'fuse')).toMatchObject({ skipped: true });
    expect(s.crafted).toEqual(expect.arrayContaining(['tires:3', 'tires:4']));
  });

  it('Mint at the ceiling lands at the ceiling and keeps Mint identity', () => {
    const s = emptyGame();
    s.rng = seedForRoll(0, 0.02);
    put(s, 0, 0, 'engine', MAX_TIER - 1);
    put(s, 0, 1, 'engine', MAX_TIER - 1);
    B.moveOrFuse(s, at(s, 0, 0), at(s, 0, 1), 0);
    expect(s.board[1]).toMatchObject({ t: MAX_TIER, q: 'mint' });
  });

  it('crate drops never mark a keystone crafted', () => {
    const s = emptyGame();
    s.crates.push({ kind: 'targeted', family: 'tires', tier: 3, source: 'race' });
    B.openCrates(s);
    expect(s.crafted).toHaveLength(0);
  });
});

describe('combo and nitro', () => {
  const pairs = (s: ReturnType<typeof emptyGame>, n: number) => {
    const fams = ['engine', 'tires', 'turbo'] as const; // alternate so results never cascade
    for (let k = 0; k < n; k++) {
      put(s, k, 0, fams[k % 3], 1);
      put(s, k, 2, fams[k % 3], 1);
    }
  };
  it('banks a nitro charge at combo 3 and 6 within the window', () => {
    const s = emptyGame();
    pairs(s, 6);
    for (let k = 0; k < 6; k++) B.moveOrFuse(s, at(s, k, 0), at(s, k, 2), k * 1500);
    expect(s.combo.count).toBe(6);
    expect(s.nitro).toBe(2);
  });
  it('a pause beyond the two-second window resets the combo', () => {
    const s = emptyGame();
    pairs(s, 3);
    B.moveOrFuse(s, at(s, 0, 0), at(s, 0, 2), 0);
    B.moveOrFuse(s, at(s, 1, 0), at(s, 1, 2), 1900);
    B.moveOrFuse(s, at(s, 2, 0), at(s, 2, 2), 1900 + 2001);
    expect(s.combo.count).toBe(1);
    expect(s.nitro).toBe(0);
  });
  it('respects the nitro cap', () => {
    const s = emptyGame();
    s.nitro = NITRO_CAP;
    pairs(s, 3);
    let full = false;
    for (let k = 0; k < 3; k++) full = B.moveOrFuse(s, at(s, k, 0), at(s, k, 2), k * 100).some((e) => e.type === 'nitroFull') || full;
    expect(s.nitro).toBe(NITRO_CAP);
    expect(full).toBe(true);
  });
});

describe('full board, overflow, crates and scrap', () => {
  it('fills board first, then overflow, then keeps crates banked', () => {
    const s = emptyGame();
    const slots = s.cols * s.rows + s.tray.length;
    for (let k = 0; k < slots + 3; k++) s.crates.push({ kind: 'std', source: 'printer' });
    const ev = B.openCrates(s);
    expect(s.board.every(Boolean)).toBe(true);
    expect(s.tray.every(Boolean)).toBe(true);
    expect(s.crates).toHaveLength(3);
    expect(ev.at(-1)?.type).toBe('crateBlocked');
    const places = ev.filter((e) => e.type === 'place');
    expect(places[0]).toMatchObject({ at: { zone: 'board', i: 0 } });
    expect(places.at(-1)).toMatchObject({ at: { zone: 'tray', i: 3 } });
  });

  it('scrap press works on a full board and tray, and frees room for a waiting crate', () => {
    const s = emptyGame();
    const slots = s.cols * s.rows + s.tray.length;
    for (let k = 0; k < slots + 1; k++) s.crates.push({ kind: 'std', source: 'printer' });
    B.openCrates(s);
    const p = s.tray[0]!;
    B.scrapPart(s, { zone: 'tray', i: 0 });
    expect(s.scrap).toBe(SCRAP_VALUE[p.t]);
    B.scrapPart(s, { zone: 'board', i: 5 });
    B.openCrates(s);
    expect(s.crates).toHaveLength(0);
  });

  it('crate recycling is never profitable at any crate tier', () => {
    for (let lvl = 0; lvl < 4; lvl++) {
      const s = emptyGame(lvl + 3);
      s.upgrades.crateTier = lvl;
      let scrapBack = 0;
      const N = 400;
      for (let k = 0; k < N; k++) {
        s.crates.push({ kind: 'std', source: 'shop' });
        B.openCrates(s);
        const i = s.board.findIndex(Boolean);
        scrapBack += SCRAP_VALUE[s.board[i]!.t];
        s.board[i] = null;
      }
      expect(scrapBack / N).toBeLessThan(CRATE_SCRAP_COST);
      expect(scrapBack / N).toBeLessThan(TARGETED_CRATE_SCRAP_COST);
    }
  });

  it('targeted crate shows its family before purchase and delivers it', () => {
    const s = emptyGame();
    s.scrap = 20;
    B.buyCrate(s, 'targeted', 'turbo');
    expect(B.allParts(s)[0].f).toBe('turbo');
    expect(s.scrap).toBe(20 - TARGETED_CRATE_SCRAP_COST);
  });

  it('fitted parts are off the bench, so they cannot be scrapped or merged away', () => {
    const s = emptyGame();
    put(s, 0, 0, 'engine', 2);
    put(s, 0, 1, 'engine', 1);
    I.installPart(s, 'junker', { zone: 'board', i: 0 });
    expect(s.board[0]).toBeNull();
    expect(B.allParts(s).map((p) => p.t)).toEqual([1]);
    expect(scrapImpact(s, s.board[1]!.id)).toBeNull();
  });

  it('recommends the strongest part; parts above the cap fit but run at the cap tier', () => {
    const s = emptyGame();
    s.owned.push('beater');
    put(s, 0, 0, 'tires', 3);
    put(s, 0, 1, 'tires', 2);
    expect(computeLoadout(s, 'junker').equipped.tires).toBeUndefined(); // nothing fitted yet
    expect(I.recommendedFit(s, 'junker').tires?.part.t).toBe(2); // tie at the T2 cap: the lower part, the T3 stays free
    I.fitRecommended(s, 'junker');
    const lo = computeLoadout(s, 'junker');
    expect(lo.equipped.tires?.t).toBe(2);
    expect(lo.blocked.tires).toBeUndefined();
    expect(I.recommendedFit(s, 'beater').tires?.part.t).toBe(3);
    // swap the T3 in: the T2 goes back to the T3's cell, and the Tapeback runs the T3 at its T2 cap
    I.installPart(s, 'junker', { zone: 'board', i: 0 });
    const only = computeLoadout(s, 'junker');
    expect(only.equipped.tires?.t).toBe(3);
    expect(s.board[0]?.t).toBe(2);
    expect(only.blocked.tires?.t).toBe(3);
    expect(only.stats.grip).toBeCloseTo(lo.stats.grip, 9);
  });

  it('removing a part needs a free cell; a full bench keeps the car as it was and says how to make room', () => {
    const s = emptyGame();
    put(s, 0, 0, 'engine', 2);
    I.installPart(s, 'junker', { zone: 'board', i: 0 });
    for (let i = 0; i < s.board.length; i++) s.board[i] = { id: s.nextPartId++, f: 'turbo', t: 1, q: 'std' };
    for (let i = 0; i < s.tray.length; i++) s.tray[i] = { id: s.nextPartId++, f: 'turbo', t: 1, q: 'std' };
    const ev = I.removePart(s, 'junker', 'engine');
    expect(ev[0]).toMatchObject({ type: 'invalid' });
    expect(s.installed.junker?.engine?.t).toBe(2);
    s.board[3] = null;
    I.removePart(s, 'junker', 'engine');
    expect(B.getPart(s, { zone: 'board', i: 3 })?.t).toBe(2);
    expect(s.installed.junker?.engine).toBeUndefined();
  });

  it('expanding the bench keeps parts in place', () => {
    const s = emptyGame();
    put(s, 5, 4, 'engine', 2);
    B.expandBoard(s);
    expect(s.cols).toBe(6);
    expect(s.board[5 * 6 + 4]).toMatchObject({ f: 'engine', t: 2 });
  });
});

describe('Merge All', () => {
  it('resolves deterministically in one pass with normal rules, conserving parts, one nitro max', () => {
    const mk = () => {
      const s = emptyGame(9);
      s.rng = 12345;
      for (let k = 0; k < 8; k++) put(s, Math.floor(k / 5), k % 5, 'engine', 1);
      for (let k = 0; k < 4; k++) put(s, 2, k, 'tires', 1);
      put(s, 3, 0, 'turbo', 1);
      s.tray[0] = { id: s.nextPartId++, f: 'turbo', t: 1, q: 'std' };
      return s;
    };
    const a = mk();
    const b = mk();
    const before = B.allParts(a).length;
    const ea = B.mergeAll(a);
    B.mergeAll(b);
    expect(JSON.stringify(a.board)).toBe(JSON.stringify(b.board));
    const fusions = ea.filter((e) => e.type === 'fuse').length;
    expect(B.allParts(a).length).toBe(before - fusions);
    expect(B.hasAnyPair(a)).toBe(false);
    expect(a.nitro).toBeLessThanOrEqual(1);
    expect(a.crafted).toContain('engine:4');
  });
});
