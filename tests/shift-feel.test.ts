// Shifting feel (the "random downshift / little time to switch" report): measured on real events for every car in
// src/data/drivetrain.ts. The green window stays open long enough for a human to react on every upshift, the box only
// changes gear by itself under real braking (once the revs have fallen well below the lower gear's window) or after a
// clear grace on the limiter, and a human-speed tap at 30 fps or on a stuttering phone lands clean.
import { describe, expect, it } from 'vitest';
import { RaceSetup, RaceSim, SHIFT, ShiftPolicy } from '../src/core/race';
import { statsFor } from '../src/core/loadout';
import { DRIVETRAINS } from '../src/data/drivetrain';
import { CarId, Family, RACE, TIER_STAT, carById } from '../src/data/tables';
import type { Part } from '../src/core/state';

const CARS = Object.keys(DRIVETRAINS) as CarId[];
const FIRST_THREE: CarId[] = ['junker', 'beater', 'hothatch'];
const statCar = (car: CarId): CarId => (car === 'hyper' ? 'super' : car); // the legacy id has no shop build
const build = (car: CarId) => {
  const c = statCar(car);
  const t = Math.min(carById(c).cap, TIER_STAT.length - 1);
  const eq: Partial<Record<Family, Part>> = { engine: { id: 1, f: 'engine', t, q: 'std' }, tires: { id: 2, f: 'tires', t, q: 'std' }, turbo: { id: 3, f: 'turbo', t, q: 'std' } };
  return statsFor(c, eq);
};
const setup = (eventId: string, car: CarId, shift: ShiftPolicy = 'manual', nitroCharges = 0): RaceSetup =>
  ({ eventId, seed: 7, player: { name: 'You', car, stats: build(car), paint: '#fff', perfectMul: carById(statCar(car)).perfectMul }, nitroCharges, shift, analysis: false });
/** A straight sprint, a bend-heavy course and a long mixed one. */
const EVENTS = ['yard-sprint', 'cliff-esses', 'canyon-stage', 'summit-1000'];

/** Steps a manual race with no SHIFT taps (Perfect nitro when charged), calling `each` after every step. */
function drive(eventId: string, car: CarId, nitro: number, each: (sim: RaceSim, prev: { gear: number; braking: boolean; nitro: boolean; v: number; t: number }) => void) {
  const sim = new RaceSim(setup(eventId, car, 'manual', nitro));
  const p = sim.player;
  while (!sim.done && p.finishTime === null) {
    if (sim.charges > 0 && p.nitroLeft <= 0) { const { active } = sim.windowState(); if (active && !sim.usedWindows.has(active.segIndex)) sim.tapNitro(); }
    const prev = { gear: p.gear, braking: p.braking, nitro: p.nitroLeft > 0, v: p.v, t: sim.t };
    sim.step();
    each(sim, prev);
  }
  return sim;
}

describe('shifting feel', () => {
  it('the green window stays open ≥ 0.40 s on every upshift, every car and gear (≥ 0.45 s for the first three cars)', () => {
    const fails: string[] = [];
    const seen = new Map<CarId, Set<number>>();
    for (const car of CARS) for (const ev of EVENTS) for (const nitro of [0, 2]) {
      let start = -1;
      drive(ev, car, nitro, (sim) => {
        const green = sim.shiftCue() === 'green';
        if (green && start < 0) start = sim.t;
        if (!green && start >= 0) {
          const s = sim.t - start;
          const g = sim.attempt.gear;
          if (sim.player.finishTime === null) {
            (seen.get(car) ?? seen.set(car, new Set()).get(car)!).add(g);
            const need = FIRST_THREE.includes(car) ? 0.45 : 0.4;
            if (s < need - 1e-9) fails.push(`${car} ${ev} gear ${g + 1}${nitro ? ' nitro' : ''}: ${(s * 1000).toFixed(0)} ms`);
          }
          start = -1;
        }
      });
    }
    expect(fails).toEqual([]);
    // every upshift was measured for every car (the last one below top only where a course is long enough to reach it)
    for (const car of CARS) for (let g = 0; g < (car === 'hyper' ? 3 : DRIVETRAINS[car].gears.length - 2); g++) // (the legacy 7-speed tops out early)
      expect(seen.get(car)?.has(g), `${car} gear ${g + 1}`).toBe(true);
  });

  it('no gear change the player did not ask for while accelerating, cruising a bend or boosting; downshifts only under braking, spaced, signalled', () => {
    let downs = 0;
    for (const car of CARS) for (const ev of EVENTS) for (const nitro of [0, 2]) {
      let lastChange = -9, zone = 0, lastBrake = -9;
      let lastDownShown: unknown = null;
      drive(ev, car, nitro, (sim, prev) => {
        const p = sim.player;
        if (prev.braking) lastBrake = prev.t;
        if (prev.t - lastBrake > SHIFT.zoneGapS) zone = 0;
        if (p.gear < prev.gear) {
          downs++;
          const at = `${car} ${ev} t=${sim.t.toFixed(2)}`;
          expect(prev.braking, at).toBe(true); // really slowing for a bend (not held at its limit, not accelerating)
          expect(p.v, at).toBeLessThan(prev.v + 1e-9);
          expect(prev.nitro, at).toBe(false);
          // one rev-matched change per braking zone, straight into the gear the bend needs (no saw-tooth of single drops)
          expect(prev.gear - p.gear, at).toBeLessThanOrEqual(SHIFT.downPerZone);
          expect(prev.t - lastChange, at).toBeGreaterThanOrEqual(SHIFT.downGapS - 1e-9);
          expect(++zone, at).toBe(1);
          // it lands below the new gear's window, so the next upshift gets its whole window (no instant green)
          expect(sim.attempt.f, at).toBeLessThan(sim.shiftWindow()[0]);
          // and the HUD gets a notice of it
          expect(sim.lastDown, at).not.toBe(lastDownShown);
          expect(sim.lastDown!.into).toBe(p.gear);
          lastDownShown = sim.lastDown;
        }
        if (p.gear !== prev.gear) lastChange = prev.t;
      });
    }
    expect(downs).toBeGreaterThan(10); // the braking case is exercised
  });

  it('hysteresis: after a downshift the cue waits, then the new gear climbs through soon before green', () => {
    for (const car of ['rally', 'proto', 'super', 'gt'] as CarId[]) for (const ev of ['canyon-stage', 'summit-1000']) {
      let downAt = -1;
      let sawSoon = false;
      drive(ev, car, 0, (sim, prev) => {
        if (sim.player.gear < prev.gear) { downAt = sim.t; sawSoon = false; }
        if (downAt < 0) return;
        const cue = sim.shiftCue();
        if (sim.t - downAt < SHIFT.settleS - RACE.dt - 1e-9) expect(cue, `${car} ${ev}`).toBe('off');
        if (cue === 'soon') sawSoon = true;
        if (cue === 'green' && !sim.player.braking) { expect(sawSoon, `${car} ${ev} t=${sim.t.toFixed(2)}`).toBe(true); downAt = -1; }
      });
    }
  });

  it('past the window the car sits on the limiter (red, losing pull) for a clear grace before the box shifts itself', () => {
    for (const car of CARS) {
      const sim = new RaceSim(setup('yard-sprint', car, 'manual'));
      let lateFor = 0;
      let checked = 0;
      while (!sim.done && sim.player.finishTime === null) {
        const before = sim.shiftLog.length;
        const late = sim.shiftCue() === 'late';
        sim.step();
        if (sim.shiftLog.length > before) {
          expect(sim.shiftLog[before].grade).toBe('missed');
          expect(lateFor, car).toBeGreaterThanOrEqual(DRIVETRAINS[car].autoS ?? SHIFT.autoDelay); // late light plus the limiter grace
          checked++;
          lateFor = 0;
        } else lateFor = late || sim.shiftCue() === 'late' ? lateFor + RACE.dt : 0;
      }
      expect(checked, car).toBeGreaterThan(0);
    }
    // a tap while the light is red is a late shift (still quicker than waiting for the box)
    const sim = new RaceSim(setup('yard-sprint', 'junker', 'manual'));
    while (sim.shiftCue() !== 'late') sim.step();
    for (let i = 0; i < 10; i++) sim.step();
    expect(sim.player.limiterT).toBeGreaterThan(0);
    expect(sim.tapShift()).toBe('late');
  });

  it('a human-speed tap (250 ms after green) lands clean at 30 fps and on a stuttering phone (100 ms frames)', () => {
    for (const car of CARS) for (const ev of EVENTS) for (const frameS of [1 / 30, 0.1]) {
      const sim = new RaceSim(setup(ev, car, 'manual'));
      let acc = 0, now = 0, tapAt = -1, attempt = -1;
      while (!sim.done && sim.player.finishTime === null) {
        acc += frameS; now += frameS;
        while (acc >= RACE.dt - 1e-9) { sim.step(); acc -= RACE.dt; }
        // the player sees this frame; a tap scheduled from a green they saw lands on a later frame
        if (sim.shiftCue() === 'green' && tapAt < 0 && sim.attempt.id !== attempt) { tapAt = now + 0.25; attempt = sim.attempt.id; }
        if (tapAt >= 0 && now >= tapAt) { sim.tapShift(); tapAt = -1; }
      }
      const log = sim.shiftLog.filter((s) => s.grade !== 'assist');
      expect(log.length, `${car} ${ev}`).toBeGreaterThan(DRIVETRAINS[car].gears.length <= 3 ? 0 : 1); // a three-speed EV (Tempest) shifts once on a short sprint
      expect(log.map((s) => s.grade).filter((g) => g !== 'clean'), `${car} ${ev} ${frameS}s frames`).toEqual([]);
    }
  });
});
