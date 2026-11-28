// 1.10 Redline: the Redline Series (a five-step late-game challenge chain) and its reward, the Kestrel 1600 R; the
// slow-stretch milestones (Foundry Sprint, star routes, series persistence); the clean-shift live bonus; save cleaning
// for the 1.10 optional fields. Deterministic (seeded sims), ~10 s.
import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import * as G from '../src/core/goals';
import { statsFor } from '../src/core/loadout';
import * as P from '../src/core/progression';
import { RaceSim, type RaceOutcome } from '../src/core/race';
import * as RR from '../src/core/rivalRuns';
import { MemoryKV, decodeSave, encodeSave } from '../src/core/save';
import { GameState, Part, migrate, newGame, validateState } from '../src/core/state';
import { mph } from '../src/core/units';
import { DRIVETRAINS } from '../src/data/drivetrain';
import { REDLINE_FINISH } from '../src/data/rivalRuns';
import { BLUEPRINT_FINISHES, CarId, ENABLED_CARS, EVENTS, SERIES_EVENTS, carById, eventById } from '../src/data/tables';
import { ART_CARS } from '../src/render/car';
import { emptyGame } from './helpers';

type Shift = 'clean' | 'ordinary' | 'missed';
const LADDER: CarId[] = ENABLED_CARS.filter((c) => !c.earnedBy).map((c) => c.id);

/** A garage that owns every ladder car up to `upTo`, with `car` fitted at the given tiers. */
function garage(upTo: CarId, fits: Partial<Record<CarId, [number, number, number]>> = {}): GameState {
  const s = emptyGame(5);
  s.owned = LADDER.slice(0, LADDER.indexOf(upTo) + 1);
  s.revealed = [...s.owned];
  s.activeCar = upTo;
  for (const [car, [e, t, u]] of Object.entries(fits) as [CarId, [number, number, number]][]) {
    const mk = (f: Part['f'], tier: number): Part => ({ id: s.nextPartId++, f, t: tier, q: 'std' });
    s.installed[car] = { engine: mk('engine', e), tires: mk('tires', t), turbo: mk('turbo', u) };
  }
  return s;
}
const clearTo = (s: GameState, step: number) => {
  s.rivalRuns = {};
  for (const r of RR.REDLINE_RUNS) if (r.series!.step < step) s.rivalRuns[r.id] = { tries: 1, best: 30, bestGap: 0.1, done: true, claimed: true };
};
/** Drive a Rival Run's setup with a shift policy and Perfect boosts (or none). */
function drive(s: GameState, runId: string, car: CarId, shift: Shift, nitro: 'perfect' | 'none' = 'perfect', seed = 1): { o: RaceOutcome; met: boolean; ahead: boolean } {
  const st = structuredClone(s);
  st.raceSeed = seed;
  const r = RR.startRivalRun(st, runId, car, 0);
  if (!r.ok) throw new Error(r.why);
  const sim = new RaceSim({ ...r.setup, shift, launch: 'perfect', analysis: true });
  while (!sim.done) {
    if (nitro === 'perfect' && sim.charges > 0 && sim.player.nitroLeft <= 0 && sim.player.finishTime === null) {
      const { active } = sim.windowState();
      if (active && !sim.usedWindows.has(active.segIndex)) sim.tapNitro();
    }
    sim.step();
  }
  const o = sim.outcome();
  const j = RR.judge(RR.rivalRunById(runId)!, o);
  return { o, met: j.met, ahead: j.ahead };
}
const wins = (n: number, f: (seed: number) => boolean) => Array.from({ length: n }, (_, i) => f(i + 1)).filter(Boolean).length;

describe('Redline Series: data and rules', () => {
  it('is five connected steps, each a different skill or build choice, with a usable prize and the car last', () => {
    const steps = RR.REDLINE_RUNS;
    expect(steps.map((r) => r.series!.step)).toEqual([1, 2, 3, 4, 5]);
    for (let i = 1; i < steps.length; i++) expect(steps[i].after).toBe(steps[i - 1].id);
    // clean shifts, the launch, a part cap (build choice), Perfect boosts, then all of it in the final
    expect(steps.map((r) => r.objective.kind)).toEqual(['shift', 'launch', 'beat', 'boost', 'shift']);
    expect(steps[2].partCap).toBe(6);
    expect(steps.map((r) => r.prize.kind)).toEqual(['paint', 'part', 'tune', 'part', 'car']);
    expect(steps[4].prize).toEqual({ kind: 'car', car: 'kestrelr' });
    expect(BLUEPRINT_FINISHES.some((b) => b.name === REDLINE_FINISH.name)).toBe(true);
    // the fields are never listed, recommended or paid as ordinary races
    for (const e of SERIES_EVENTS) { expect(EVENTS).not.toContain(e); expect(eventById(e.id)).toBe(e); }
    // one-off Rival Runs and the chain are shown separately
    expect(RR.runsToShow(garage('tempest')).some(({ run }) => run.series)).toBe(false);
  });

  it('shows the reward and every step up front, opens with the Strata GTR and goes one step at a time', () => {
    const early = garage('super');
    expect(RR.redlineView(early).visible).toBe(false);
    const rally = garage('rally');
    const v0 = RR.redlineView(rally);
    expect(v0.visible).toBe(true);
    expect(v0.open).toBe(false);
    expect(v0.lockedWhy).toMatch(/Strata GTR/);
    expect(v0.reward.model).toBe('Kestrel 1600 R');
    expect(v0.steps.every((x) => x.prize.length > 3)).toBe(true);
    const s = garage('gt');
    let v = RR.redlineView(s);
    expect(v.open).toBe(true);
    expect(v.next?.id).toBe('rl-1');
    expect(v.steps[1].open).toBe(false);
    expect(v.steps[1].why).toMatch(/Shakedown/);
    expect(RR.startRivalRun(structuredClone(s), 'rl-2', 'rally', 0)).toMatchObject({ ok: false });
    clearTo(s, 3);
    v = RR.redlineView(s);
    expect(v.done).toBe(2);
    expect(v.next?.id).toBe('rl-3');
    // a goal option beside the cars (recommended only once no car is left to chase)
    const goal = G.goalOptions(s).find((g) => g.key === 'series:redline')!;
    expect(goal.action).toMatchObject({ kind: 'run', runId: 'rl-3' });
    expect(goal.stages).toHaveLength(5);
    expect(goal.recommended).toBe(false);
  });

  it('is earnable with skill and the right build, and not with missed shifts', () => {
    const s = garage('proto', { tuner: [6, 6, 6], rally: [8, 8, 8], gt: [8, 8, 8], ardent: [8, 8, 8], proto: [9, 9, 9], tourer: [6, 6, 6], super: [7, 7, 7] });
    const rows: string[] = [];
    const res = new Map<string, number>();
    const check = (step: number, run: string, car: CarId, shift: Shift, nitro: 'perfect' | 'none' = 'perfect') => {
      const k = `${run} ${car} ${shift}/${nitro}`;
      if (!res.has(k)) {
        clearTo(s, step);
        res.set(k, wins(3, (seed) => drive(s, run, car, shift, nitro, seed).met));
        rows.push(`${k}: ${res.get(k)}/3`);
      }
      return res.get(k)!;
    };
    // measure every row first, so a failure prints the whole table
    for (const [st, run, car, sh, ni] of [[1, 'rl-1', 'tuner', 'clean'], [1, 'rl-1', 'tuner', 'missed'], [2, 'rl-2', 'rally', 'clean'], [2, 'rl-2', 'gt', 'missed'],
      [3, 'rl-3', 'rally', 'clean'], [3, 'rl-3', 'tourer', 'clean'], [3, 'rl-3', 'super', 'clean'], [4, 'rl-4', 'proto', 'clean'], [4, 'rl-4', 'gt', 'clean'], [4, 'rl-4', 'ardent', 'clean'], [4, 'rl-4', 'proto', 'clean', 'none'],
      [5, 'rl-5', 'ardent', 'clean'], [5, 'rl-5', 'proto', 'clean'], [5, 'rl-5', 'gt', 'clean'], [5, 'rl-5', 'proto', 'missed']] as [number, string, CarId, Shift, ('perfect' | 'none')?][]) check(st, run, car, sh, ni);
    console.log(rows.join('\n'));
    // 1 Shakedown: clean shifts in the Kestrel 1600; a missed-shift run never meets it
    expect(check(1, 'rl-1', 'tuner', 'clean')).toBeGreaterThanOrEqual(2);
    expect(check(1, 'rl-1', 'tuner', 'missed')).toBe(0);
    // 2 Hole Shot: a clean launch in the Corvo or the Strata
    expect(check(2, 'rl-2', 'rally', 'clean')).toBeGreaterThanOrEqual(2);
    expect(check(2, 'rl-2', 'gt', 'missed')).toBe(0);
    // 3 Stock R: the base car decides it under the T6 cap — the Altamar and the Lumen lose, the Corvo wins
    expect(check(3, 'rl-3', 'rally', 'clean')).toBeGreaterThanOrEqual(2);
    expect(check(3, 'rl-3', 'tourer', 'clean')).toBe(0);
    expect(check(3, 'rl-3', 'super', 'clean')).toBe(0);
    // 4 Apex Hunt: two Perfect boosts; no nitro never meets it
    expect(check(4, 'rl-4', 'proto', 'clean')).toBeGreaterThanOrEqual(2);
    expect(check(4, 'rl-4', 'ardent', 'clean')).toBeGreaterThanOrEqual(2); // the corner car at T8 does it too
    expect(check(4, 'rl-4', 'gt', 'clean')).toBe(0);
    expect(check(4, 'rl-4', 'proto', 'clean', 'none')).toBe(0);
    // 5 Final: Kit's R needs the Ardent or the Halcyon driven clean; the Strata at T8 is not enough, missed never
    expect(check(5, 'rl-5', 'ardent', 'clean')).toBeGreaterThanOrEqual(2);
    expect(check(5, 'rl-5', 'proto', 'clean')).toBeGreaterThanOrEqual(2);
    expect(check(5, 'rl-5', 'gt', 'clean')).toBe(0);
    expect(check(5, 'rl-5', 'proto', 'missed')).toBe(0);
  });

  it('pays each prize once (through the Game), and the final hands over the Kestrel 1600 R with a reveal', () => {
    const kv = new MemoryKV();
    const g = new Game(kv, '/test/', 1_000_000);
    const fresh = garage('proto', { tuner: [6, 6, 6], rally: [8, 8, 8], gt: [8, 8, 8], ardent: [8, 8, 8], proto: [9, 9, 9] });
    g.transact((d) => { Object.assign(d, structuredClone(fresh), { rev: d.rev }); return []; }, 1_000_000);
    const run = (id: string, car: CarId) => {
      const setup = g.startRivalRun(id, car, 1_000_001)!;
      expect(setup).toBeTruthy();
      const sim = new RaceSim({ ...setup, shift: 'clean', launch: 'perfect', analysis: true });
      while (!sim.done) {
        if (sim.charges > 0 && sim.player.nitroLeft <= 0 && sim.player.finishTime === null) { const { active } = sim.windowState(); if (active && !sim.usedWindows.has(active.segIndex)) sim.tapNitro(); }
        sim.step();
      }
      return g.commitRace(setup.seed, sim.outcome(), 1_000_002);
    };
    const tuneBefore = g.state.tune.rally ?? 0;
    for (const [id, car] of [['rl-1', 'tuner'], ['rl-2', 'rally'], ['rl-3', 'rally'], ['rl-4', 'proto']] as [string, CarId][]) {
      for (let k = 0; k < 4 && !RR.runRecord(g.state, id).claimed; k++) run(id, car);
      expect(RR.runRecord(g.state, id).claimed, id).toBe(true);
    }
    expect(g.state.blueprints).toContain(REDLINE_FINISH.name);
    expect(g.state.tune.rally ?? 0).toBe(tuneBefore + 1); // Stock R: a free Tune-up stage for the car raced
    const paints = g.state.blueprints.length;
    run('rl-1', 'tuner'); // a replay pays nothing more
    expect(g.state.blueprints.length).toBe(paints);
    for (let k = 0; k < 4 && !g.state.owned.includes('kestrelr'); k++) run('rl-5', 'proto');
    expect(g.state.owned).toContain('kestrelr');
    expect(g.state.pendingReveal).toBe('kestrelr');
    expect(g.state.activeCar).toBe('kestrelr');
    expect(Object.keys(g.state.installed.kestrelr ?? {}).length).toBeGreaterThan(0); // arrives with parts fitted
    const owned = g.state.owned.length;
    run('rl-5', 'proto');
    expect(g.state.owned.length).toBe(owned);
    expect(RR.redlineView(g.state).reward.owned).toBe(true);
    expect(G.goalOptions(g.state).some((x) => x.key === 'series:redline')).toBe(false);
    // and the save keeps it
    const back = decodeSave(encodeSave(g.state))!;
    expect(back.owned).toContain('kestrelr');
  });
});

describe('Kestrel 1600 R: an earned car with its own role', () => {
  it('is drawn, geared and voiced, never on the Rep ladder or a next-car goal', () => {
    const c = carById('kestrelr');
    expect(c.enabled).toBe(true);
    expect(c.unlock).toBeNull();
    expect(c.earnedBy).toBe('redline');
    expect(ART_CARS as readonly string[]).toContain('kestrelr');
    expect(DRIVETRAINS.kestrelr.gears.length).toBe(6);
    const s = garage('tempest');
    expect(P.chaseableCars(s).map((x) => x.id)).not.toContain('kestrelr');
    expect(P.nextCar(s)).toBeNull();
  });

  it('wins hairpins, street circuits and stock-class races at T9, and has the lowest top end of the late cars', () => {
    const cars: CarId[] = ['ardent', 'proto', 'vireo', 'mako', 'meridian', 'sovereign', 'tempest', 'kestrelr'];
    const time = (car: CarId, id: string) => {
      const ev = eventById(id);
      const cap = Math.min(carById(car).cap, ev.partCap ?? 99, 9);
      const eq = { engine: { id: 1, f: 'engine' as const, t: cap, q: 'std' as const }, tires: { id: 2, f: 'tires' as const, t: cap, q: 'std' as const }, turbo: { id: 3, f: 'turbo' as const, t: cap, q: 'std' as const } };
      const sim = new RaceSim({ eventId: id, seed: 3, player: { name: 'p', car, stats: statsFor(car, eq, Math.min(carById(car).cap, ev.partCap ?? 99)), paint: '#fff', perfectMul: carById(car).perfectMul }, nitroCharges: 2, shift: 'clean', launch: 'perfect', rivalShift: 'clean', analysis: false });
      while (!sim.done) { const { active } = sim.windowState(); if (active && sim.charges > 0 && sim.player.nitroLeft <= 0 && !sim.usedWindows.has(active.segIndex) && sim.player.finishTime === null) sim.tapNitro(); sim.step(); }
      const o = sim.outcome();
      return { t: o.playerTime ?? 99, top: mph(o.topSpeed ?? 0) };
    };
    for (const id of ['corniche', 'esplanade-gp', 'stock-cup']) {
      const r = time('kestrelr', id).t;
      for (const c of cars.filter((x) => x !== 'kestrelr')) expect(r, `${id} vs ${c}`).toBeLessThan(time(c, id).t);
    }
    // the long straights belong to the others
    const t9 = cars.filter((c) => carById(c).cap >= 9); // (the T8 Ardent tops out lower still)
    const tops = t9.map((c) => time(c, 'causeway-run').top);
    expect(Math.min(...tops)).toBe(tops[t9.indexOf('kestrelr')]);
    expect(time('kestrelr', 'grand-riviera').t).toBeGreaterThan(time('mako', 'grand-riviera').t);
  });
});

describe('1.10 slow stretches: milestones and other ways forward', () => {
  it('the Vexa GTi gets the Foundry Sprint, whose first win is an Ironhorse stage (a T4 Engine)', () => {
    const e = eventById('foundry-sprint');
    expect(e.requires.car).toBe('hothatch');
    const s = garage('hothatch');
    s.bosses = ['ray'];
    expect(P.eventUnlocked(s, e).ok).toBe(true);
    const st = P.carStages(carById('muscle')).find((d) => d.id === 'sprint')!;
    expect(st.reward.part).toEqual({ family: 'engine', tier: 4 });
    // Fifth Gear (a Vexa-only Rival Run) now opens with the Vexa itself
    expect(RR.runOpen(s, RR.rivalRunById('rr-sol-shift')!)).toBe(true);
    // the Corvo's long Rep stretch gets one too: win the Midnight Run → a free Tune-up stage
    expect(P.carStages(carById('rally')).find((d) => d.id === 'midnight')?.reward.tune).toBe(true);
  });

  it('a series round you keep finishing on the podium opens the next round (the stalled one stays to win)', () => {
    const s = garage('muscle');
    s.events['foundry-final'] = { wins: 1, starts: 1, bestPlace: 1, bestTime: 20 };
    const cliffs = eventById('cliff-esses');
    s.events['harbor-launch'] = { wins: 0, starts: 2, bestPlace: 2, bestTime: 20, podiums: 2 };
    expect(P.eventUnlocked(s, cliffs).ok).toBe(false);
    expect(P.eventUnlocked(s, cliffs).why).toMatch(/1 more podium/);
    s.events['harbor-launch'].podiums = 3;
    expect(P.eventUnlocked(s, cliffs).ok).toBe(true);
  });

  it('Bridge Speed Trap medals count as Downtown stars (a road to the Kestrel for a top-speed build)', () => {
    const s = garage('tourer');
    expect(P.starsIn(s)).toBe(0);
    s.medals['bridge-trap'] = 2;
    expect(P.starsIn(s)).toBe(2);
    expect(P.trapStars(s)).toBe(2);
    s.stars['neon-mile'] = 1;
    expect(P.starsIn(s)).toBe(3);
  });

  it('live races with every shift clean pay a skill bonus the crew never earns; the breakdown still sums', () => {
    const s = garage('hothatch');
    s.bosses = ['ray'];
    const e = eventById('maple-mile');
    const live = P.computePayout(s, e, 1, 'live', 0, { shifts: 5, shiftsClean: 5 });
    const sloppy = P.computePayout(s, e, 1, 'live', 0, { shifts: 5, shiftsClean: 4 });
    const quick = P.computePayout(s, e, 1, 'quick', 0, { shifts: 5, shiftsClean: 5 });
    expect(live.clean).toBe(P.cleanRaceBonus(e));
    expect(live.cash - sloppy.cash).toBe(P.cleanRaceBonus(e));
    expect(quick.clean).toBe(0);
    expect(P.purse(s, e).clean).toBe(P.cleanRaceBonus(e));
    s.pendingRace = { id: 9, eventId: e.id, car: 'hothatch', seed: 9, startedAt: 0 };
    const cash0 = s.cash;
    const r = P.commitRace(s, { raceId: 9, mode: 'live', outcome: { place: 1, playerTime: 18, gapText: '', perfects: 0, nitroUsed: 0, shifts: 4, shiftsClean: 4, standings: [], advice: null } }, [])!;
    expect(r.breakdown!.some((b) => /Clean shifts 4\/4/.test(b.label))).toBe(true);
    expect(r.breakdown!.reduce((a, b) => a + b.cash, 0)).toBe(s.cash - cash0);
  });
});

describe('1.10 saves', () => {
  const envelope = (g: Partial<GameState>) => migrate(JSON.parse(JSON.stringify(g)));
  it('keeps well-formed onboarding, Test & Compare runs and light effects, and drops malformed ones', () => {
    const s = newGame(0);
    s.cash = 1234; s.scrap = 56; s.crafted = ['tires:3'];
    const good = envelope({ ...s, onboard: { step: 'race', at: 5, skipped: true }, testRuns: { junker: { at: 1, event: 'yard-sprint', a: { launch: 1.2 }, b: { launch: 1.1 }, parts: 'T2 Engine' } }, settings: { ...s.settings, lightFx: true } })!;
    expect(good.onboard).toEqual({ step: 'race', at: 5, skipped: true });
    expect(good.testRuns?.junker?.a.launch).toBe(1.2);
    expect(good.settings.lightFx).toBe(true);
    expect(good.cash).toBe(1234);
    const bad = envelope({ ...s, onboard: 'race' as never, testRuns: { junker: { at: 'x', event: 3, a: [], b: null, parts: 1 } } as never, settings: { ...s.settings, lightFx: 'yes' as never, musicVol: 7 } })!;
    expect(bad).not.toBeNull();
    expect(bad.onboard).toBeUndefined();
    expect(bad.testRuns).toEqual({});
    expect(bad.settings.lightFx).toBeUndefined();
    expect(bad.settings.musicVol).toBeUndefined();
    expect(validateState(bad)).toEqual([]);
    const partial = envelope({ ...s, testRuns: { junker: { at: 1, event: 'yard-sprint', a: { launch: 1, bad: NaN as never, worse: 'x' as never }, b: {}, parts: '' } } })!;
    expect(partial.testRuns?.junker?.a).toEqual({ launch: 1 });
  });

  it('an older save (no 1.10 fields, a Rival Run record from 1.6) keeps everything and starts the series fresh', () => {
    const s = garage('gt', { gt: [8, 8, 7] });
    s.cash = 40_000; s.scrap = 900; s.crafted = ['engine:8', 'tires:8'];
    s.rivalRuns = { 'rr-kit-apex': { tries: 3, best: 20.1, bestGap: 0.2, done: true, claimed: true } };
    s.ghosts = { 'glacier-pass': { t: 21.4, car: 'gt', d: [0, 10, 30] } };
    const raw = JSON.parse(JSON.stringify(s));
    delete raw.onboard; delete raw.testRuns; delete raw.settings.lightFx;
    const m = migrate(raw)!;
    expect(m.cash).toBe(40_000);
    expect(m.scrap).toBe(900);
    expect(m.crafted).toEqual(['engine:8', 'tires:8']);
    expect(m.installed.gt?.engine?.t).toBe(8);
    expect(m.ghosts?.['glacier-pass']?.t).toBe(21.4);
    expect(RR.runRecord(m, 'rr-kit-apex').claimed).toBe(true);
    expect(RR.redlineView(m).next?.id).toBe('rl-1');
    expect(m.onboard).toBeUndefined();
  });
});
