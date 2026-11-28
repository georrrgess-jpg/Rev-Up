// Regression: no tap can change gear before the green shift window opens (the player-reported "shift right after GO,
// before the green bar appears"). A tap while the light is off or still filling is a fumble: no gear change, and a
// short guard means mashing SHIFT never reaches the next gear sooner than a player who waits for green.
import { describe, expect, it } from 'vitest';
import { RaceSetup, RaceSim } from '../src/core/race';
import { statsFor } from '../src/core/loadout';
import { CarId, Family, TIER_STAT, carById, ENABLED_CARS } from '../src/data/tables';
import type { Part } from '../src/core/state';

const build = (car: CarId) => {
  const t = Math.min(carById(car).cap, TIER_STAT.length - 1);
  const eq: Partial<Record<Family, Part>> = { engine: { id: 1, f: 'engine', t, q: 'std' }, tires: { id: 2, f: 'tires', t, q: 'std' }, turbo: { id: 3, f: 'turbo', t, q: 'std' } };
  return statsFor(car, eq);
};
const setup = (eventId: string, car: CarId): RaceSetup =>
  ({ eventId, seed: 3, player: { name: 'You', car, stats: build(car), paint: '#fff', perfectMul: carById(car).perfectMul }, nitroCharges: 0, shift: 'manual', analysis: false });
const EVENTS: [string, CarId][] = [
  ['yard-sprint', 'junker'], ['cul-de-sac', 'beater'], ['maple-mile', 'hothatch'], ['foundry-final', 'muscle'], ['cliff-esses', 'super'],
  ['canyon-stage', 'rally'], ['summit-1000', 'proto'], ['summit-1000', 'vireo'], ['launch-final', 'tempest'],
];
const DT = 1 / 60;

describe('no shift before the green window', () => {
  it('a tap on every frame before green, from GO onwards, never changes gear (every car, launch included)', () => {
    const cars = ENABLED_CARS.map((c) => c.id as CarId);
    for (const car of cars) {
      const sim = new RaceSim(setup('yard-sprint', car));
      let firstGreen = -1;
      while (sim.t < 4 && firstGreen < 0) {
        const gear = sim.player.gear;
        if (sim.attempt.cue === 'green' || sim.attempt.cue === 'late') { firstGreen = sim.t; break; }
        const r = sim.tapShift();
        expect(sim.player.gear, `${car} t=${sim.t.toFixed(2)} cue=${sim.attempt.cue} r=${r}`).toBe(gear);
        expect(['wait', 'busy', 'hold', 'top']).toContain(r);
        sim.step(DT);
      }
      expect(firstGreen, `${car}: the first window opens`).toBeGreaterThan(0);
    }
  });

  it('through a whole race, a gear only goes up on a tap while the cue shows green (or past it, late)', () => {
    for (const [ev, car] of EVENTS) {
      const sim = new RaceSim(setup(ev, car));
      let ups = 0;
      while (sim.player.finishTime === null && sim.t < 90) {
        const before = sim.player.gear, cue = sim.attempt.cue;
        const r = sim.tapShift(); // mash every frame
        if (sim.player.gear > before) { ups++; expect(['green', 'late'], `${ev} ${car} t=${sim.t.toFixed(2)} ${r}`).toContain(cue); }
        sim.step(DT);
      }
      expect(ups, `${ev} ${car}`).toBeGreaterThan(0);
    }
  });

  it('mashing SHIFT is never faster than tapping once on green', () => {
    for (const [ev, car] of EVENTS) {
      const mash = new RaceSim(setup(ev, car)), calm = new RaceSim(setup(ev, car));
      let greenAt = -1;
      while ((mash.player.finishTime === null || calm.player.finishTime === null) && mash.t < 90) {
        if (mash.player.finishTime === null) mash.tapShift();
        if (calm.player.finishTime === null) {
          if (calm.attempt.cue === 'green') { if (greenAt < 0) greenAt = calm.t; if (calm.t - greenAt >= 0.12) { calm.tapShift(); greenAt = -1; } } else greenAt = -1;
        }
        mash.step(DT); calm.step(DT);
      }
      expect(mash.player.finishTime!, `${ev} ${car}: mash ${mash.player.finishTime} vs calm ${calm.player.finishTime}`).toBeGreaterThanOrEqual(calm.player.finishTime! - 0.02);
    }
  });
});
