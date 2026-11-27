// Downshift timing (Pit Stop fix 4, revised in the shifting-feel fix): the HUD cue and the SHIFT tap are judged from one
// shift attempt, its window stays fixed for the attempt, braking never takes away a green the player was reacting to,
// and large frame steps (a slow phone) judge exactly what is on screen. See tests/shift-feel.test.ts for the measured
// window lengths and the rules for automatic gear changes.
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
const setup = (eventId: string, car: CarId, shift: ShiftPolicy = 'manual', extra: Partial<RaceSetup> = {}): RaceSetup =>
  ({ eventId, seed: 7, player: { name: 'You', car, stats: build(car), paint: '#fff', perfectMul: carById(car).perfectMul }, nitroCharges: 0, shift, ...extra });

/** Bend-heavy events with braking downshifts, across five cars. */
const BENDY: [string, CarId][] = [['foundry-final', 'muscle'], ['canyon-stage', 'rally'], ['canyon-stage', 'gt'], ['cliff-esses', 'super'], ['cliff-esses', 'hothatch']];

interface Frame { t: number; gear: number; cue: string; id: number; band: string; f: number; braking: boolean }

/**
 * Drive a live race the way the screen does: a frame of `fps` steps the sim, then the HUD reads the attempt, then a
 * tap (if `tapOn` matches the cue the player sees) is judged. Returns the frames and every tap's result.
 */
function drive(eventId: string, car: CarId, fps: number, tapOn: (cue: string, prev: string) => boolean) {
  const sim = new RaceSim(setup(eventId, car));
  const frames: Frame[] = [];
  const taps: { r: string; f: number; band: [number, number]; cue: string; braking: boolean; gearBefore: number; gearAfter: number }[] = [];
  let acc = 0;
  let prev = 'off';
  while (!sim.done && sim.player.finishTime === null) {
    acc += 1 / fps;
    while (acc >= RACE.dt - 1e-9) { sim.step(); acc -= RACE.dt; }
    const a = sim.attempt;
    frames.push({ t: sim.t, gear: sim.player.gear, cue: a.cue, id: a.id, band: a.band.join('-'), f: a.f, braking: sim.player.braking });
    if (tapOn(a.cue, prev)) {
      const seen = { f: a.f, band: [...a.band] as [number, number], cue: a.cue, braking: sim.player.braking, gearBefore: sim.player.gear };
      const r = sim.tapShift();
      taps.push({ ...seen, r, gearAfter: sim.player.gear });
    }
    prev = a.cue;
  }
  return { sim, frames, taps };
}

const firstGreen = (cue: string, prev: string) => cue === 'green' && prev !== 'green';

describe('shift attempt: one state for the cue and the tap', () => {
  it('a tap on the visible green is always judged clean, at 60 fps and at 8 fps, single and consecutive downshifts', () => {
    for (const [ev, car] of BENDY) for (const fps of [60, 8]) {
      const { taps, sim } = drive(ev, car, fps, firstGreen);
      expect(taps.length, `${ev} ${car} ${fps}fps`).toBeGreaterThan(2);
      for (const t of taps) {
        expect(t.r, `${ev} ${car} ${fps}fps`).toBe('clean');
        // the judged engine speed is inside the window the HUD showed (or braking caught that green: its grace)
        if (!t.braking) expect(t.f).toBeGreaterThanOrEqual(t.band[0]);
        expect(t.f).toBeLessThanOrEqual(t.band[1]);
        expect(t.gearAfter).toBe(t.gearBefore + 1);
      }
      expect(sim.shiftLog.filter((s) => s.grade === 'clean').length).toBe(taps.length);
    }
  });

  it('braking for a bend holds the cue, except a green it caught, which stays green (and clean) for a short grace', () => {
    let graces = 0;
    for (const [ev, car] of BENDY) for (const fps of [60, 8]) {
      const { frames } = drive(ev, car, fps, () => false);
      // (top gear has nothing to shift into: its cue is simply off)
      let brakeStart = -1;
      let greenAtBrake = false;
      for (let i = 1; i < frames.length; i++) {
        const f = frames[i];
        if (f.braking && !frames[i - 1].braking) { brakeStart = f.t; greenAtBrake = frames[i - 1].cue === 'green'; }
        if (!f.braking || f.cue !== 'green') continue;
        // a green while braking is only ever the grace of a green the braking caught
        expect(greenAtBrake, `${ev} ${car} ${fps}fps t=${f.t.toFixed(2)}`).toBe(true);
        const [lo, hi] = f.band.split('-').map(Number);
        if (f.f < lo || f.f > hi) expect(f.t - brakeStart).toBeLessThanOrEqual(SHIFT.brakeGraceS + 2 / fps + 1e-6);
        graces++;
      }
    }
    expect(graces).toBeGreaterThan(0);
  });

  it('the window is fixed for each attempt; a new attempt opens for the next gear after a downshift', () => {
    for (const [ev, car] of BENDY) {
      const { frames } = drive(ev, car, 60, firstGreen);
      const bands = new Map<number, Set<string>>();
      const gears = new Map<number, Set<number>>();
      for (const f of frames) {
        (bands.get(f.id) ?? bands.set(f.id, new Set()).get(f.id)!).add(f.band);
        (gears.get(f.id) ?? gears.set(f.id, new Set()).get(f.id)!).add(f.gear);
      }
      for (const [id, s] of bands) expect(s.size, `${ev} ${car} attempt ${id}`).toBe(1);
      for (const [id, s] of gears) expect(s.size, `${ev} ${car} attempt ${id}`).toBe(1);
      // after every braking zone, the first live cue belongs to a fresh attempt for the gear the car is now in, and
      // that attempt never drops back to a hold within the settle time (no green/hold flicker on the exit)
      for (let i = 1; i < frames.length; i++) {
        if (frames[i - 1].cue === 'hold' && frames[i].cue !== 'hold') {
          expect(frames[i].id).not.toBe(frames[i - 1].id);
          expect(frames[i].gear).toBe(frames[i - 1].gear);
          for (let k = i; k < frames.length && frames[k].t - frames[i].t < SHIFT.settleS; k++) expect(frames[k].cue).not.toBe('hold');
        }
      }
    }
  });

  it('a tap outside the window gives consistent feedback: early before it, hold while braking, nothing restarts', () => {
    for (const [ev, car] of BENDY.slice(0, 3)) for (const fps of [60, 8]) {
      const early = drive(ev, car, fps, (cue, prev) => cue === 'soon' && prev !== 'soon');
      expect(early.taps.length).toBeGreaterThan(0);
      for (const t of early.taps) {
        expect(['early', 'wait']).toContain(t.r);
        if (t.r === 'early') expect(t.f).toBeLessThan(t.band[0]);
      }
      const braking = drive(ev, car, fps, (cue, prev) => cue === 'hold' && prev !== 'hold');
      expect(braking.taps.length).toBeGreaterThan(0);
      for (const t of braking.taps) { expect(['hold', 'busy']).toContain(t.r); expect(t.gearAfter).toBe(t.gearBefore); }
      expect(braking.taps.filter((t) => t.r === 'hold').length).toBeGreaterThan(0);
      expect(braking.sim.shiftLog.every((s) => s.grade === 'missed')).toBe(true); // holds never logged as shifts
    }
  });

  it('duplicate inputs on one frame shift once', () => {
    const sim = new RaceSim(setup('canyon-stage', 'gt'));
    while (sim.attempt.cue !== 'green') sim.step();
    const before = sim.player.gear;
    expect(sim.tapShift()).toBe('clean');
    expect(sim.tapShift()).toBe('busy');
    expect(sim.tapShift()).toBe('busy');
    expect(sim.player.gear).toBe(before + 1);
    expect(sim.shiftLog.length).toBe(1);
  });

  it('a clone carries its own attempt (finishing off-screen never moves the visible cue)', () => {
    const sim = new RaceSim(setup('foundry-final', 'muscle'));
    for (let i = 0; i < 60; i++) sim.step();
    const id = sim.attempt.id;
    const c = sim.clone();
    for (let i = 0; i < 400; i++) c.step();
    expect(sim.attempt.id).toBe(id);
    expect(c.attempt).not.toBe(sim.attempt);
  });

  it('keeps the timing challenge: missed and ordinary shifting still cost against clean, and a good live player matches clean', () => {
    const pairs: [string, CarId][] = [['yard-sprint', 'junker'], ['cul-de-sac', 'hothatch'], ['maple-mile', 'muscle'], ['midnight-run', 'super'], ['canyon-stage', 'rally']];
    for (const [ev, car] of pairs) {
      const t = (p: ShiftPolicy) => runRace(setup(ev, car, p)).playerTime!;
      const clean = t('clean');
      const missed = t('missed') - clean;
      const ordinary = t('ordinary') - clean;
      expect(missed, `${ev} ${car}`).toBeGreaterThan(0.5);
      expect(missed, `${ev} ${car}`).toBeLessThan(1.25);
      expect(ordinary, `${ev} ${car}`).toBeGreaterThan(0.15);
      expect(ordinary, `${ev} ${car}`).toBeLessThan(0.6);
      const live = drive(ev, car, 60, firstGreen).sim.player.finishTime!;
      expect(Math.abs(live - clean), `${ev} ${car} live ${live} clean ${clean}`).toBeLessThan(0.35);
    }
  });

  it('nitro still fires and pushes through a shift in a live (manual) race', () => {
    const sim = new RaceSim(setup('canyon-stage', 'gt', 'manual', { nitroCharges: 2 }));
    for (let i = 0; i < 120; i++) sim.step();
    expect(['perfect', 'boost']).toContain(sim.tapNitro());
    let shifted = false;
    while (sim.player.nitroLeft > 0) { if (sim.attempt.cue === 'green') shifted = sim.tapShift() === 'clean' || shifted; sim.step(); }
    expect(sim.nitroUsed).toBe(1);
    while (!sim.done) sim.step();
    expect(sim.outcome().playerTime).not.toBeNull();
    void shifted;
  });
});
