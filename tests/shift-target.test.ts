// Steady shift target (the "downshift wobble / the target moves" report): the green arc the HUD draws is the shift
// attempt's window, and it never moves while a player could be aiming at it — not inside an attempt, not when nitro
// fires, not across a braking zone with its downshift, and the next upshift's window is fixed from its first frame.
// Clean and missed shifting on the same car and event keep a clear, recoverable gap.
import { describe, expect, it } from 'vitest';
import { RaceSetup, RaceSim, SHIFT, ShiftPolicy, runRace } from '../src/core/race';
import { statsFor } from '../src/core/loadout';
import { CarId, Family, RACE, TIER_STAT, carById } from '../src/data/tables';
import type { Part } from '../src/core/state';

const build = (car: CarId) => {
  const t = Math.min(carById(car).cap, TIER_STAT.length - 1);
  const eq: Partial<Record<Family, Part>> = { engine: { id: 1, f: 'engine', t, q: 'std' }, tires: { id: 2, f: 'tires', t, q: 'std' }, turbo: { id: 3, f: 'turbo', t, q: 'std' } };
  return statsFor(car, eq);
};
const setup = (eventId: string, car: CarId, shift: ShiftPolicy = 'manual', nitroCharges = 0): RaceSetup =>
  ({ eventId, seed: 7, player: { name: 'You', car, stats: build(car), paint: '#fff', perfectMul: carById(car).perfectMul }, nitroCharges, shift, analysis: false });

/** Bend-heavy events (consecutive braking zones) across old and new cars, the three supercars included. */
const CASES: [string, CarId][] = [
  ['canyon-stage', 'rally'], ['canyon-stage', 'gt'], ['cliff-esses', 'super'], ['cliff-esses', 'hothatch'], ['foundry-final', 'muscle'],
  ['summit-1000', 'proto'], ['summit-1000', 'vireo'], ['summit-1000', 'mako'], ['summit-1000', 'sovereign'], ['canyon-stage', 'sovereign'],
];

interface Frame { t: number; gear: number; cue: string; id: number; band: string; f: number; braking: boolean }

/** A live race as the screen runs it: frames of `fps`, Perfect nitro when charged, a tap `react` s after each green. */
function drive(ev: string, car: CarId, fps: number, nitro: number, react = 0.2) {
  const sim = new RaceSim(setup(ev, car, 'manual', nitro));
  const frames: Frame[] = [];
  let acc = 0, now = 0, tapAt = -1, seen = -1;
  while (!sim.done && sim.player.finishTime === null) {
    acc += 1 / fps; now += 1 / fps;
    if (sim.charges > 0 && sim.player.nitroLeft <= 0) { const { active } = sim.windowState(); if (active && !sim.usedWindows.has(active.segIndex)) sim.tapNitro(); }
    while (acc >= RACE.dt - 1e-9) { sim.step(); acc -= RACE.dt; }
    const a = sim.attempt;
    frames.push({ t: sim.t, gear: sim.player.gear, cue: a.cue, id: a.id, band: a.band.join('-'), f: a.f, braking: sim.player.braking });
    if (a.cue === 'green' && tapAt < 0 && a.id !== seen) { tapAt = now + react; seen = a.id; }
    if (tapAt >= 0 && now >= tapAt) { sim.tapShift(); tapAt = -1; }
  }
  return { sim, frames };
}

describe('steady shift target', () => {
  it('the arc never moves inside an attempt, nor while a braking zone changes down; the next window is fixed from its first frame', () => {
    let zonesWithDown = 0, backToBack = 0;
    for (const [ev, car] of CASES) for (const nitro of [0, 2]) for (const fps of [60, 15]) {
      const { frames, sim } = drive(ev, car, fps, nitro);
      const at = (f: Frame) => `${ev} ${car} n${nitro} ${fps}fps t=${f.t.toFixed(2)}`;
      // one band per attempt, from its first frame to its last
      const bandOf = new Map<number, string>();
      for (const f of frames) {
        const b = bandOf.get(f.id);
        if (b === undefined) bandOf.set(f.id, f.band);
        else expect(f.band, at(f)).toBe(b);
      }
      // a hold (braking, or settling after the downshift) keeps the arc exactly where it was when the hold began,
      // through every gear change inside it
      let lastDownZoneEnd = -9;
      for (let i = 1; i < frames.length; i++) {
        if (frames[i].cue !== 'hold' || frames[i - 1].cue === 'hold') continue;
        const start = frames[i - 1].band;
        let k = i, downs = 0;
        for (; k < frames.length && frames[k].cue === 'hold'; k++) {
          expect(frames[k].band, at(frames[k])).toBe(start);
          if (frames[k].gear < frames[k - 1].gear) downs++;
        }
        expect(downs, `${at(frames[i])}: one gear change per braking zone`).toBeLessThanOrEqual(1);
        if (downs) {
          zonesWithDown++;
          if (frames[i].t - lastDownZoneEnd < 6) backToBack++;
          lastDownZoneEnd = frames[Math.min(k, frames.length - 1)].t;
          // the next upshift starts below its window: soon (or off) before green, never an instant green
          if (k < frames.length) expect(frames[k].cue, at(frames[k])).not.toBe('green');
        }
      }
      // no flicker: once a green goes, it does not come back for the same gear within a quarter second
      for (let i = 1; i < frames.length; i++) {
        if (frames[i - 1].cue !== 'green' || frames[i].cue === 'green') continue;
        for (let k = i + 1; k < frames.length && frames[k].t - frames[i].t < 0.25; k++)
          if (frames[k].gear === frames[i].gear) expect(frames[k].cue, at(frames[k])).not.toBe('green');
      }
      // and every tapped shift on that steady green landed clean
      const graded = sim.shiftLog.filter((s) => s.grade !== 'assist');
      expect(graded.length).toBeGreaterThan(2);
      expect(graded.filter((s) => s.grade !== 'clean').map((s) => s.grade), `${ev} ${car} n${nitro} ${fps}fps`).toEqual([]);
    }
    expect(zonesWithDown).toBeGreaterThan(20);
    expect(backToBack, 'consecutive braking zones with downshifts are exercised').toBeGreaterThan(3);
  });

  it('nitro fired while the needle approaches the window does not move it', () => {
    let checked = 0;
    for (const [ev, car] of CASES) {
      const sim = new RaceSim(setup(ev, car, 'manual', 3));
      let fired = 0;
      while (!sim.done && sim.player.finishTime === null && fired < 3) {
        sim.step();
        if (sim.attempt.cue === 'soon' && sim.player.nitroLeft <= 0 && sim.charges > 0) {
          const before = sim.attempt.band.join('-'), id = sim.attempt.id;
          sim.tapNitro();
          fired++;
          sim.step();
          if (sim.attempt.id === id) { expect(sim.attempt.band.join('-'), `${ev} ${car}`).toBe(before); checked++; }
        }
      }
    }
    expect(checked).toBeGreaterThan(5);
  });

  it('clean and missed shifts on the same car and event: a meaningful, recoverable gap', () => {
    const pairs: [string, CarId][] = [['canyon-stage', 'rally'], ['cliff-esses', 'super'], ['summit-1000', 'vireo'], ['summit-1000', 'mako'], ['summit-1000', 'sovereign'], ['yard-sprint', 'junker']];
    for (const [ev, car] of pairs) {
      const t = (p: ShiftPolicy) => runRace(setup(ev, car, p)).playerTime!;
      const clean = t('clean'), early = t('early'), missed = t('missed');
      expect(missed - clean, `${ev} ${car} missed`).toBeGreaterThan(0.2);
      expect(missed - clean, `${ev} ${car} missed`).toBeLessThan(1.4);
      expect(early - clean, `${ev} ${car} early`).toBeGreaterThan(0.05);
      // a live player who taps on the visible green matches the clean reference
      const live = drive(ev, car, 60, 0).sim.player.finishTime!;
      expect(Math.abs(live - clean), `${ev} ${car} live`).toBeLessThan(0.35);
    }
  });

  it('one missed shift costs about one shift, then the next window opens as usual (recoverable)', () => {
    for (const [ev, car] of [['summit-1000', 'mako'], ['maple-mile', 'hothatch'], ['yard-sprint', 'junker'], ['summit-1000', 'vireo']] as [string, CarId][]) {
      const sim = new RaceSim(setup(ev, car, 'manual'));
      let skipped = false, attempt = -1;
      const after: string[] = [];
      while (!sim.done && sim.player.finishTime === null) {
        sim.step();
        const a = sim.attempt;
        if (a.cue === 'green' && a.id !== attempt) {
          attempt = a.id;
          if (!skipped && sim.player.gear === 1) { skipped = true; continue; } // miss the 2→3 shift on purpose
          sim.tapShift();
          if (skipped) after.push(sim.lastShift!.grade);
        }
      }
      const grades = sim.shiftLog.map((s) => s.grade);
      expect(grades.filter((g) => g === 'missed').length, `${ev} ${car}`).toBe(1);
      expect(after.length).toBeGreaterThan(0);
      expect(after.every((g) => g === 'clean'), `${ev} ${car} ${after}`).toBe(true);
      const clean = runRace(setup(ev, car, 'clean')).playerTime!;
      const lost = sim.player.finishTime! - clean;
      expect(lost, `${ev} ${car}`).toBeGreaterThan(0.08);
      expect(lost, `${ev} ${car}`).toBeLessThan(0.6);
    }
  });

  it('a hold always ends with a fresh attempt for the gear the car is in (SHIFT rules unchanged)', () => {
    expect(SHIFT.downPerZone).toBeGreaterThanOrEqual(1);
    const { frames } = drive('canyon-stage', 'rally', 60, 0);
    for (let i = 1; i < frames.length; i++) if (frames[i - 1].cue === 'hold' && frames[i].cue !== 'hold') {
      expect(frames[i].id).not.toBe(frames[i - 1].id);
      expect(frames[i].gear).toBe(frames[i - 1].gear);
    }
  });
});
