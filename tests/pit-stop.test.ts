// Pit Setup and Rival Runs (Pit Stop update).
import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { computeLoadout } from '../src/core/loadout';
import { hintFor, ownedPartIds, pitSlots, trackDemands } from '../src/core/pitSetup';
import { RaceSim, runRace } from '../src/core/race';
import * as RR from '../src/core/rivalRuns';
import { MemoryKV, encodeSave, saveKey } from '../src/core/save';
import { GameState, Part, newGame } from '../src/core/state';
import { BLUEPRINT_FINISHES, CarId, Family } from '../src/data/tables';
import { KIT_FINISH } from '../src/data/rivalRuns';
import { emptyGame, put } from './helpers';

const T0 = 1_700_000_000_000;
const fit = (s: GameState, car: CarId, f: Family, t: number): Part => {
  const p: Part = { id: s.nextPartId++, f, t, q: 'std' };
  ((s.installed ??= {})[car] ??= {})[f] = p;
  return p;
};
const gameFrom = (s: GameState, kv = new MemoryKV()) => {
  kv.setItem(saveKey('/t/'), encodeSave(s));
  return { g: new Game(kv, '/t/', T0), kv };
};

describe('Pit Setup', () => {
  it('reads launch, straights and corners from the track', () => {
    const harbor = Object.fromEntries(trackDemands('harbor').map((d) => [d.key, d.share]));
    const cliffs = Object.fromEntries(trackDemands('cliffs').map((d) => [d.key, d.share]));
    const coast = Object.fromEntries(trackDemands('coast').map((d) => [d.key, d.share]));
    expect(harbor.launch).toBeGreaterThan(cliffs.launch);
    expect(cliffs.corners).toBeGreaterThan(coast.corners);
    expect(coast.straights).toBeGreaterThan(cliffs.straights);
    for (const id of ['scrapyard', 'maple', 'summit'] as const) expect(trackDemands(id).reduce((a, d) => a + d.share, 0)).toBeCloseTo(1, 6);
  });

  it('a swap from the bench changes the build the race actually loads', () => {
    const s = emptyGame(3);
    s.owned = ['junker', 'beater']; s.activeCar = 'beater'; s.revealed = ['junker', 'beater'];
    fit(s, 'beater', 'engine', 1); fit(s, 'beater', 'tires', 2); fit(s, 'beater', 'turbo', 1);
    put(s, 0, 0, 'engine', 3);
    put(s, 0, 1, 'turbo', 2);
    const { g } = gameFrom(s);
    const before = computeLoadout(g.state, 'beater').stats;
    const slots = pitSlots(g.state, 'beater');
    const eng = slots.find((x) => x.family === 'engine')!;
    expect(eng.options[0].src.part.t).toBe(3);
    expect(eng.options[0].words.join(' ')).toMatch(/mph top speed/);
    const src = eng.options[0].src;
    expect('at' in src).toBe(true);
    if ('at' in src) g.installPart('beater', src.at);
    const setup = g.startRace('yard-sprint', T0 + 1000)!;
    expect(setup.player.car).toBe('beater');
    expect(setup.player.stats.top).toBeGreaterThan(before.top);
    expect(setup.player.stats).toEqual(computeLoadout(g.state, 'beater').stats);
    // and the sim races that build
    const sim = new RaceSim(setup);
    expect(sim.player.stats.top).toBeCloseTo(setup.player.stats.top, 9);
    // the outgoing T1 engine went to the cell the T3 came from
    expect(g.state.board[0]).toMatchObject({ f: 'engine', t: 1 });
  });

  it('never duplicates equipment: a part fitted elsewhere moves, it is not copied', () => {
    const s = emptyGame(4);
    s.owned = ['junker', 'beater', 'hothatch']; s.activeCar = 'hothatch'; s.revealed = [...s.owned];
    fit(s, 'beater', 'tires', 3); fit(s, 'hothatch', 'tires', 1); fit(s, 'junker', 'engine', 2);
    put(s, 0, 0, 'tires', 2);
    const { g } = gameFrom(s);
    const ids0 = ownedPartIds(g.state).sort();
    const tires = pitSlots(g.state, 'hothatch').find((x) => x.family === 'tires')!;
    // best first: the Corsa's T3, then the bench T2; the part already fitted here is never offered
    expect(tires.options.map((o) => o.src.part.t)).toEqual([3, 2]);
    expect(tires.options.some((o) => o.src.part.id === tires.current!.id)).toBe(false);
    const src = tires.options[0].src;
    expect('car' in src && src.car).toBe('beater');
    if ('car' in src) g.movePartBetweenCars(src.car, 'tires', 'hothatch');
    const ids1 = ownedPartIds(g.state).sort();
    expect(ids1).toEqual(ids0);
    expect(new Set(ids1).size).toBe(ids1.length);
    expect(g.state.installed.hothatch!.tires!.t).toBe(3);
    expect(g.state.installed.beater!.tires!.t).toBe(1); // the swap sent the old one back the other way
    // recommended twice: still no new or lost part
    g.fitRecommended('hothatch'); g.fitRecommended('hothatch');
    expect(ownedPartIds(g.state).sort()).toEqual(ids0);
  });

  it('points at the exact merge, else the exact Workshop order, when nothing owned helps', () => {
    const s = emptyGame(5);
    s.owned = ['junker', 'beater']; s.activeCar = 'beater';
    fit(s, 'beater', 'turbo', 1);
    put(s, 1, 0, 'turbo', 1); put(s, 1, 2, 'turbo', 1);
    const turbo = pitSlots(s, 'beater').find((x) => x.family === 'turbo')!;
    expect(turbo.options).toEqual([]);
    expect(turbo.hint).toMatchObject({ kind: 'merge', family: 'turbo', tier: 2 });
    const s2 = emptyGame(5);
    s2.owned = ['junker', 'beater']; s2.activeCar = 'beater';
    const cur = fit(s2, 'beater', 'turbo', 2);
    const h = hintFor(s2, 'beater', 'turbo', cur, 3);
    expect(h).toMatchObject({ kind: 'order', family: 'turbo', tier: 3 });
  });

  it('respects a stock race cap: a part above the cap is not an upgrade there', () => {
    const s = emptyGame(6);
    s.owned = ['junker', 'beater', 'hothatch', 'muscle']; s.activeCar = 'muscle';
    fit(s, 'muscle', 'engine', 4);
    put(s, 0, 0, 'engine', 5);
    expect(pitSlots(s, 'muscle', 4).find((x) => x.family === 'engine')!.options).toEqual([]);
    expect(pitSlots(s, 'muscle').find((x) => x.family === 'engine')!.options.length).toBe(1);
  });
});

describe('Rival Runs', () => {
  const owning = (cars: CarId[], seed = 7) => {
    const s = emptyGame(seed);
    s.owned = cars; s.revealed = [...cars]; s.activeCar = cars[cars.length - 1];
    return s;
  };

  it('three distinct runs, each with a car rule, an objective and a prize', () => {
    expect(RR.RIVAL_RUNS.length).toBeGreaterThanOrEqual(3);
    expect(new Set(RR.RIVAL_RUNS.map((r) => r.objective.kind)).size).toBe(3);
    expect(RR.RIVAL_RUNS.some((r) => r.partCap)).toBe(true);
    expect(RR.RIVAL_RUNS.some((r) => r.nitro === 0)).toBe(true);
    expect(BLUEPRINT_FINISHES.some((b) => b.name === KIT_FINISH.name)).toBe(true);
  });

  it('opens by progress and only takes its eligible cars', () => {
    const s = owning(['junker']);
    const pip = RR.rivalRunById('rr-pip-launch')!;
    expect(RR.runOpen(s, pip)).toBe(false);
    expect(RR.startRivalRun(s, pip.id, 'junker', T0)).toMatchObject({ ok: false });
    s.owned.push('beater');
    expect(RR.runOpen(s, pip)).toBe(true);
    expect(RR.eligibleCars(s, pip)).toEqual(['junker']);
    expect(RR.startRivalRun(s, pip.id, 'beater', T0)).toMatchObject({ ok: false });
    expect(RR.startRivalRun(s, pip.id, 'junker', T0)).toMatchObject({ ok: true });
    expect(RR.runsToShow(owning(['junker'])).map((x) => x.open)).toEqual([false]);
  });

  it('applies the run’s constraint to the race: car, part cap without Tune-ups, nitro', () => {
    const s = owning(['junker', 'beater', 'hothatch', 'muscle', 'tourer']);
    for (const f of ['engine', 'tires', 'turbo'] as Family[]) fit(s, 'muscle', f, 5);
    s.tune.muscle = 3; s.nitro = 3;
    const { g } = gameFrom(s);
    const setup = g.startRivalRun('rr-kit-apex', 'muscle', T0 + 5)!;
    expect(setup).toBeTruthy();
    expect(g.state.activeCar).toBe('tourer'); // a Rival Run never changes your active car
    expect(setup.player.car).toBe('muscle');
    expect(setup.player.stats).toEqual(computeLoadout(g.state, 'muscle', undefined, 3).stats);
    expect(setup.player.stats.top).toBeLessThan(computeLoadout(g.state, 'muscle').stats.top);
    expect(setup.nitroCharges).toBe(3);
    const sim = new RaceSim(setup);
    expect(sim.charges).toBe(3);
    expect(sim.player.stats.grip).toBeCloseTo(computeLoadout(g.state, 'muscle', undefined, 3).stats.grip, 9);
    g.abandonRace();
    const sol = g.startRivalRun('rr-sol-shift', 'hothatch', T0 + 6)!;
    expect(sol.nitroCharges).toBe(0);
    expect(new RaceSim(sol).charges).toBe(0);
    expect(g.startRivalRun('rr-sol-shift', 'muscle', T0 + 7)).toBeNull();
  });

  it('judges the objective on the sim: a clean, boosted Tapeback beats Tilly off the line and pays a T3 Turbo once', () => {
    const s = owning(['junker', 'beater']);
    for (const f of ['engine', 'tires', 'turbo'] as Family[]) fit(s, 'junker', f, 2);
    const { g, kv } = gameFrom(s);
    const nitro0 = g.state.nitro;
    const setup = g.startRivalRun('rr-pip-launch', 'junker', T0 + 10)!;
    const out = runRace({ ...setup }, 'perfect', 'clean');
    const id = g.pendingRaceId!;
    const last = g.commitRace(id, out, T0 + 20)!;
    expect(last).toBeTruthy();
    expect(g.rivalRunResult!.judgement.met).toBe(true);
    expect(g.rivalRunResult!.judgement.launchGap!).toBeGreaterThan(0);
    expect(g.rivalRunResult!.prized).toBe(true);
    const turbos = () => [...g.state.board, ...g.state.tray].filter((p) => p?.f === 'turbo' && p.t === 3).length + g.state.crates.filter((c) => c.family === 'turbo' && c.tier === 3).length;
    expect(turbos()).toBe(1);
    expect(g.state.cash).toBe(0);
    expect(g.state.nitro).toBe(nitro0); // banked nitro untouched
    // a second commit of the same race (rapid taps) does nothing
    expect(g.commitRace(id, out, T0 + 21)).toBeNull();
    expect(turbos()).toBe(1);
    // meeting it again: best kept, prize not paid twice
    const again = g.startRivalRun('rr-pip-launch', 'junker', T0 + 30)!;
    g.commitRace(g.pendingRaceId!, runRace(again, 'perfect', 'clean'), T0 + 40);
    expect(g.rivalRunResult!.prized).toBe(false);
    expect(turbos()).toBe(1);
    expect(RR.runRecord(g.state, 'rr-pip-launch')).toMatchObject({ tries: 2, done: true, claimed: true });
    // persists across a reload
    const g2 = new Game(kv, '/t/', T0 + 60_000);
    expect(RR.runRecord(g2.state, 'rr-pip-launch')).toMatchObject({ tries: 2, claimed: true });
    expect(RR.runRecord(g2.state, 'rr-pip-launch').best).toBeCloseTo(RR.runRecord(g.state, 'rr-pip-launch').best!, 9);
  });

  it('a missed objective records the try and suggests the fix the data supports', () => {
    const s = owning(['junker', 'beater']);
    for (const f of ['engine', 'tires', 'turbo'] as Family[]) fit(s, 'junker', f, 2);
    const { g } = gameFrom(s);
    const setup = g.startRivalRun('rr-pip-launch', 'junker', T0 + 10)!;
    g.commitRace(g.pendingRaceId!, runRace(setup, 'none', 'missed'), T0 + 20);
    const r = g.rivalRunResult!;
    expect(r.judgement.met).toBe(false);
    expect(r.prized).toBe(false);
    expect(r.suggestion).toMatch(/SHIFT|shift/);
    expect(RR.runRecord(g.state, 'rr-pip-launch')).toMatchObject({ tries: 1, claimed: false });
  });

  it('the paint prize lands in blueprints once; the livery prize is owned once', () => {
    const s = owning(['junker']);
    const ev: never[] = [];
    RR.grantPrize(s, { kind: 'paint', name: KIT_FINISH.name, paint: KIT_FINISH.paint }, ev);
    RR.grantPrize(s, { kind: 'paint', name: KIT_FINISH.name, paint: KIT_FINISH.paint }, ev);
    expect(s.blueprints.filter((b) => b === KIT_FINISH.name).length).toBe(1);
    RR.grantPrize(s, { kind: 'style', id: 'livery:checker' }, ev);
    RR.grantPrize(s, { kind: 'style', id: 'livery:checker' }, ev);
    expect(s.owns.filter((x) => x === 'livery:checker').length).toBe(1);
  });

  it('a full bench queues the part prize as a crate instead of losing it', () => {
    const s = owning(['junker', 'beater']);
    s.board = s.board.map(() => ({ id: s.nextPartId++, f: 'engine', t: 1, q: 'std' }));
    s.tray = s.tray.map(() => ({ id: s.nextPartId++, f: 'engine', t: 1, q: 'std' }));
    RR.grantPrize(s, { kind: 'part', family: 'turbo', tier: 3, why: '' }, []);
    expect(s.crates).toContainEqual(expect.objectContaining({ kind: 'targeted', family: 'turbo', tier: 3 }));
  });

  it('a save from before Rival Runs loads with empty records and can claim a prize', () => {
    const kv = new MemoryKV();
    const old = newGame(T0) as unknown as Record<string, unknown>;
    Object.assign(old, { owned: ['junker', 'beater'], revealed: ['junker', 'beater'] });
    delete old.rivalRuns;
    kv.setItem(saveKey('/t/'), encodeSave(old as never));
    const g = new Game(kv, '/t/', T0);
    expect(g.load.status).toBe('loaded');
    expect(RR.runRecord(g.state, 'rr-pip-launch')).toEqual({ tries: 0, best: null, bestGap: null, done: false, claimed: false });
    expect(RR.runsToShow(g.state)[0]).toMatchObject({ open: true });
    // malformed field from a hand-edited save does not break loading
    const bad = { ...g.state, rivalRuns: 'nope' } as unknown as GameState;
    kv.setItem(saveKey('/t2/'), encodeSave(bad));
    const g2 = new Game(kv, '/t2/', T0);
    expect(RR.runRecord(g2.state, 'rr-kit-apex').claimed).toBe(false);
  });
});
