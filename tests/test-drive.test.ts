// 1.10 Test & Compare and race report: a test run is a fixed, rivals-free slice of a real track with no nitro and
// nothing paid or spent; the candidate is fitted virtually (the save never moves); the probe's numbers are the sim's;
// a better part measures better; the comparison and its verdict follow the data; "what changed since your last run"
// names real deltas; rivals' race craft is deterministic per seed and balance-neutral; a grip tip needs corner data.
import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from '../src/core/state';
import * as TD from '../src/core/testDrive';
import { CRAFT, RaceSim } from '../src/core/race';
import { compareRuns, summarize } from '../src/core/runReport';
import { statsFor } from '../src/core/loadout';
import { mph } from '../src/core/units';
import { CARS, CarId, Family, TIER_STAT, carById } from '../src/data/tables';
import type { Part } from '../src/core/state';
import { decidingRivalTime } from './ladder';
import { explainFinish } from '../src/core/circuit';
import { rivalShiftFor } from '../src/core/progression';
import { eventById } from '../src/data/tables';

function corsa(): GameState {
  const s = newGame(1, 42);
  s.owned.push('beater'); s.activeCar = 'beater';
  s.installed.beater = { engine: { id: 900, f: 'engine', t: 2, q: 'std' }, tires: { id: 901, f: 'tires', t: 2, q: 'std' }, turbo: { id: 902, f: 'turbo', t: 2, q: 'std' } };
  s.board[0] = { id: 903, f: 'tires', t: 3, q: 'std' };
  s.nextPartId = 1000;
  return s;
}

describe('Test & Compare', () => {
  it('every car has a course: a slice of a real track, rivals-free, no nitro, a named bend that is a bend', () => {
    expect(TD.checkCourses()).toEqual([]);
    for (const c of CARS.filter((x) => x.enabled)) {
      const s = newGame(1); s.owned.push(c.id);
      const setup = TD.testSetup(s, c.id, 'current', null);
      const sim = new RaceSim(setup);
      expect(sim.racers.length).toBe(1);
      expect(sim.windows.length).toBe(0);
      expect(setup.nitroCharges).toBe(0);
      expect(sim.length).toBeLessThan(900);
    }
  });

  it('the slice: a T3 Tires on the Corsa Rojo at the Scrapyard strip is quicker, mostly through Crusher Bend', () => {
    const s = corsa();
    const before = JSON.stringify(s);
    const c = TD.defaultCandidate(s, 'beater')!;
    expect(c).toMatchObject({ family: 'tires', tier: 3, source: 'bench', partId: 903 });
    for (const shift of ['clean', 'ordinary', 'missed'] as const) {
      const a = TD.simulateSide(s, 'beater', 'current', null, shift), b = TD.simulateSide(s, 'beater', 'candidate', c, shift);
      expect(b.time, shift).toBeLessThan(a.time - 0.1);
      expect(b.exit, shift).toBeGreaterThan(a.exit);
      expect(b.launch, shift).toBeLessThanOrEqual(a.launch);
      // deterministic: the same run twice gives the same numbers
      expect(TD.simulateSide(s, 'beater', 'candidate', c, shift)).toEqual(b);
    }
    // nothing in the save moved: no part fitted, no cash, nitro or races
    expect(JSON.stringify(s)).toBe(before);
  });

  it('candidates: owned parts first, then virtual fits to craft (pair on the bench) or order (Shop price)', () => {
    const s = corsa();
    const tires = TD.candidatesFor(s, 'beater', 'tires');
    expect(tires[0].source).toBe('bench');
    const eng = TD.candidatesFor(s, 'beater', 'engine');
    expect(eng.some((c) => c.source === 'order' && c.tier === 3 && (c.price ?? 0) > 0)).toBe(true);
    s.board[1] = { id: 904, f: 'engine', t: 2, q: 'std' }; s.board[2] = { id: 905, f: 'engine', t: 2, q: 'std' };
    expect(TD.candidatesFor(s, 'beater', 'engine').find((c) => c.tier === 3)?.source).toBe('craft');
    // a virtual fit never exceeds the car's cap
    for (const f of ['engine', 'tires', 'turbo'] as Family[]) for (const c of TD.candidatesFor(s, 'beater', f)) if (c.source === 'craft' || c.source === 'order') expect(c.tier).toBeLessThanOrEqual(carById('beater').cap);
  });

  it('the probe reads the sim: launch split, bend exit and top speed match a hand-run of the same course', () => {
    const s = corsa();
    const setup = TD.testSetup(s, 'beater', 'current', null, 'clean');
    const sim = new RaceSim(setup);
    const course = TD.courseFor('beater');
    const probe = new TD.TestProbe(course, sim.track);
    let top = 0;
    while (!sim.done && sim.player.finishTime === null) { sim.step(); probe.observe(sim); if (sim.player.finishTime === null) top = Math.max(top, mph(sim.player.v)); }
    const m = probe.result(sim);
    expect(m.top).toBe(top);
    expect(m.time).toBeCloseTo(sim.player.finishTime!, 3);
    expect(m.exit).toBe(mph(sim.player.splitV![course.bend]));
    expect(m.launch).toBeGreaterThan(0);
    expect(m.launch).toBeLessThan(m.time);
    expect(m.shifts).toBeGreaterThan(0);
  });

  it('compare rows and verdict follow the numbers; the saved result is the last per car', () => {
    const s = corsa();
    const c = TD.defaultCandidate(s, 'beater')!;
    const course = TD.courseFor('beater');
    const a = TD.simulateSide(s, 'beater', 'current', null, 'clean'), b = TD.simulateSide(s, 'beater', 'candidate', c, 'clean');
    const rows = TD.compareRows(course, a, b);
    expect(rows.map((r) => r.key)).toEqual(['launch', 'exit', 'top', 'time', 'cleanShifts']);
    expect(rows.find((r) => r.key === 'time')!.better).toBe(true);
    expect(rows.find((r) => r.key === 'exit')!.label).toContain(course.bendName);
    expect(TD.verdict(c, { a, b }, course)).toMatch(/quicker/);
    expect(TD.verdict(c, { a: b, b: a }, course)).toMatch(/slower/);
    TD.saveTestRun(s, 'beater', course, a, b, c, 123);
    TD.saveTestRun(s, 'beater', course, b, a, c, 456);
    expect(s.testRuns!.beater!.at).toBe(456);
    expect(Object.keys(s.testRuns!)).toEqual(['beater']);
  });

  it('usual shifting comes from the car\'s record', () => {
    const s = corsa();
    expect(TD.usualShift(s, 'beater').policy).toBe('ordinary');
    s.mastery.beater = { races: 5, wins: 1, podiums: 2, best: {}, perfects: 0, shiftsClean: 18, shifts: 20, topSpeed: 30 };
    expect(TD.usualShift(s, 'beater').policy).toBe('clean');
    s.mastery.beater.shiftsClean = 3;
    expect(TD.usualShift(s, 'beater').policy).toBe('missed');
  });
});

const full = (car: CarId) => {
  const t = Math.min(carById(car).cap, TIER_STAT.length - 1);
  return statsFor(car, { engine: { id: 1, f: 'engine', t, q: 'std' }, tires: { id: 2, f: 'tires', t, q: 'std' }, turbo: { id: 3, f: 'turbo', t, q: 'std' } } as Partial<Record<Family, Part>>);
};

describe('race report and rivals', () => {
  it('what changed since the last run: real deltas, a headline naming the biggest mover', () => {
    const run = (shift: 'clean' | 'missed') => {
      const sim = new RaceSim({ eventId: 'cliff-esses', seed: 9, player: { name: 'You', car: 'tourer', stats: full('tourer'), paint: '#fff' }, nitroCharges: 0, shift, analysis: false });
      return sim.finish();
    };
    const slow = summarize(run('missed')), quick = summarize(run('clean'));
    const ch = compareRuns(quick, slow, null)!;
    expect(ch.against).toBe('last');
    expect(ch.rows[0].label).toBe('Time');
    expect(ch.rows[0].better).toBe(true);
    expect(ch.headline).toMatch(/quicker than your last run/);
    expect(ch.rows.find((r) => r.label === 'Clean shifts')?.better).toBe(true);
    // no last run: against the best saved before the race
    const vsBest = compareRuns(quick, null, quick.time! + 0.3)!;
    expect(vsBest.headline).toMatch(/New best by 0.30 s/);
    expect(compareRuns(quick, null, null)).toBeNull();
    // a different car's last run is not compared
    expect(compareRuns(quick, { ...slow, car: 'muscle' }, null)).toBeNull();
  });

  it('rival race craft: deterministic per seed, varied across seeds, and off in one-on-one races', () => {
    const mk = (seed: number, ev = 'yard-sprint') => new RaceSim({ eventId: ev, seed, player: { name: 'p', car: 'junker', stats: full('junker'), paint: '#fff' }, nitroCharges: 0, analysis: false });
    const a = mk(5).racers.map((r) => JSON.stringify(r.craft)), b = mk(5).racers.map((r) => JSON.stringify(r.craft));
    expect(a).toEqual(b);
    const launches = new Set<number>(), lates = new Set<boolean>();
    for (let seed = 1; seed < 40; seed++) for (const r of mk(seed).racers) if (r.craft) { launches.add(r.craft.launch); lates.add(r.craft.late); }
    expect(launches.size).toBe(3);
    expect(lates.size).toBe(2);
    // the knockout final is one-on-one: no launch lottery, no late braking
    for (let seed = 1; seed < 10; seed++) for (const r of mk(seed, 'main-event:3').racers) if (r.craft) expect(r.craft).toMatchObject({ launch: 1, late: false });
    // stats are drawn as before the craft existed (its own random stream)
    expect(mk(5).racers.map((r) => r.stats)).toEqual(mk(5).racers.map((r) => r.stats));
  });

  it('rival race craft is balance-neutral: the deciding rival\'s time moves by under 0.06 s on any ladder event, ~0 on average', () => {
    const saved = { ...CRAFT };
    const ids = ['yard-sprint', 'rusty-ray', 'foundry-final', 'cliff-esses', 'neon-mile', 'canyon-stage', 'summit-1000', 'port-sprint'];
    const on = ids.map((id) => decidingRivalTime(id, 8));
    Object.assign(CRAFT, { badLaunchP: 0, greatLaunchP: 0, lateP: 0, defendP: 0 });
    const off = ids.map((id) => decidingRivalTime(id, 8));
    Object.assign(CRAFT, saved);
    const d = on.map((x, i) => x - off[i]);
    for (const [i, x] of d.entries()) expect(Math.abs(x), ids[i]).toBeLessThan(0.06);
    expect(Math.abs(d.reduce((a, x) => a + x, 0) / d.length)).toBeLessThan(0.02);
  }, 60_000);

  it('a grip tip needs the corner data: a lower grip stat alone, with equal exit speeds, suggests no tyres', () => {
    const st = statsFor('ardent', { engine: { id: 1, f: 'engine', t: 8, q: 'std' }, tires: { id: 2, f: 'tires', t: 6, q: 'std' }, turbo: { id: 3, f: 'turbo', t: 8, q: 'std' } } as Partial<Record<Family, Part>>);
    let tipped = 0, checked = 0;
    for (let seed = 101; seed < 112; seed++) {
      const sim = new RaceSim({ eventId: 'esplanade-gp', seed, player: { name: 'p', car: 'ardent', stats: st, paint: '#fff', perfectMul: carById('ardent').perfectMul }, nitroCharges: 2, shift: 'clean', rivalShift: rivalShiftFor(eventById('esplanade-gp')) });
      const o = sim.finish();
      if (o.place === 1) continue;
      const x = explainFinish(o);
      if (x.suggestion.action?.family === 'tires') { tipped++; expect(x.suggestion.text).toMatch(/Try more grip for the .*(hairpin|bend).* \(out at \d+ mph/); }
      // the same race with the corner exits made equal: the grip tip goes
      const me = o.standings.find((r) => r.isPlayer)!, foe = o.standings[o.standings.indexOf(me) - 1];
      foe.splitV = [...me.splitV!];
      expect(explainFinish(o).suggestion.action?.family).not.toBe('tires');
      checked++;
    }
    expect(checked).toBeGreaterThan(3);
    expect(tipped).toBeGreaterThan(0);
  });
});
