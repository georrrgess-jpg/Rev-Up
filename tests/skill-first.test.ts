// Skill-first racing: shifting is the skill that separates a good run from a poor one.
// Four comparable races per course (same event, seed, nitro policy and launch): a modestly weaker build with clean
// shifts must finish ahead of the stronger build with poor shifts, and the stronger build must still beat the weaker
// one when both shift clean. Prints the finish times. "Modestly weaker" = the same car with its Engine and Turbo one
// tier lower (Tires unchanged); "poor" = every upshift late, a beat on the limiter (the `ordinary` policy).
//
// The gearbox-setup experiment (forgiving vs performance windows, a human-like tapper) prints with PROBE=1.
import { describe, expect, it } from 'vitest';
import { RaceSim, SHIFT, ShiftPolicy } from '../src/core/race';
import { makeRng } from '../src/core/rng';
import { rivalShiftFor } from '../src/core/progression';
import { Build, buildStats } from './ladder';
import { CarId, carById, eventById } from '../src/data/tables';
import { DRIVETRAINS, GearboxId } from '../src/data/drivetrain';

const SEED = 101;

function race(eventId: string, b: Build, shift: ShiftPolicy) {
  const e = eventById(eventId);
  const sim = new RaceSim({
    eventId, seed: SEED, player: { name: 'p', car: b.car, stats: buildStats(b, e.partCap), paint: '#fff', perfectMul: carById(b.car).perfectMul },
    nitroCharges: 2, shift, rivalShift: rivalShiftFor(e), analysis: false, launch: 'perfect',
  });
  while (!sim.done) {
    if (sim.charges > 0 && sim.player.nitroLeft <= 0 && sim.player.finishTime === null) {
      const { active } = sim.windowState();
      if (active && !sim.usedWindows.has(active.segIndex)) sim.tapNitro(); // Perfect boosts, the same in all four
    }
    sim.step();
  }
  const o = sim.outcome();
  return { time: o.playerTime!, place: o.place, shifts: o.shifts ?? 0 };
}

/** Course type, event and car (cap tier = the full build), early cars to late. */
const ROWS: [string, string, CarId][] = [
  ['launch', 'yard-sprint', 'junker'],
  ['launch', 'harbor-launch', 'muscle'],
  ['launch', 'launch-final', 'tempest'],
  ['technical', 'cliff-esses', 'muscle'],
  ['technical', 'neon-mile', 'tuner'],
  ['technical', 'canyon-stage', 'rally'],
  ['technical', 'corniche', 'vireo'],
  ['fast', 'cul-de-sac', 'hothatch'],
  ['fast', 'coast-crown', 'tourer'],
  ['fast', 'midnight-run', 'super'],
  ['fast', 'summit-1000', 'gt'],
  ['fast', 'summit-gala', 'proto'],
  ['fast', 'grand-riviera', 'sovereign'],
];

describe('skill-first racing: four comparable races', () => {
  it('a weaker build with clean shifts beats a stronger one with poor shifts; parts still matter at equal timing', () => {
    const checks: (() => void)[] = [];
    const lines = ['course     event           car        build hi · lo            lo+clean   lo+poor  hi+clean   hi+poor  parts Δ  timing Δ'];
    for (const [kind, ev, car] of ROWS) {
      const t = carById(car).cap;
      const hi: Build = { car, tiers: [t, t, t], label: 'higher' };
      const lo: Build = { car, tiers: [t - 1, t, t - 1], label: 'lower' };
      const lc = race(ev, lo, 'clean'), lp = race(ev, lo, 'ordinary'), hc = race(ev, hi, 'clean'), hp = race(ev, hi, 'ordinary');
      const f = (r: { time: number; place: number }) => `${r.time.toFixed(2)} P${r.place}`.padStart(9);
      const bl = `E${t}/G${t}/T${t} · E${t - 1}/G${t}/T${t - 1}`;
      lines.push(`${kind.padEnd(10)} ${ev.padEnd(15)} ${car.padEnd(10)} ${bl.padEnd(24)} ${f(lc)} ${f(lp)} ${f(hc)} ${f(hp)}  ${(lc.time - hc.time).toFixed(2).padStart(6)}  ${(hp.time - hc.time).toFixed(2).padStart(6)}`);
      checks.push(() => {
        // the weaker build driven clean finishes ahead of the stronger build driven poorly
        expect(lc.time, `${ev} ${car}: lower+clean vs higher+poor`).toBeLessThan(hp.time - 0.03);
        // better parts still make a measurable difference when both shift equally well
        expect(hc.time, `${ev} ${car}: higher+clean vs lower+clean`).toBeLessThan(lc.time - 0.04);
        expect(hp.time, `${ev} ${car}: higher+poor vs lower+poor`).toBeLessThan(lp.time - 0.04);
        // poor shifting costs momentum, but leaves room to recover (no more than ~7% of the race)
        expect(hp.time / hc.time, `${ev} ${car}`).toBeLessThan(1.07);
      });
    }
    console.log(lines.join('\n'));
    for (const c of checks) c();
  });

  it('a missed shift costs more than a late one; neither stalls the car', () => {
    for (const [, ev, car] of ROWS) {
      const t = carById(car).cap;
      const hi: Build = { car, tiers: [t, t, t], label: '' };
      const c = race(ev, hi, 'clean').time, l = race(ev, hi, 'ordinary').time, m = race(ev, hi, 'missed').time;
      expect(l, ev).toBeGreaterThan(c);
      expect(m, ev).toBeGreaterThan(l);
      expect(m / c, ev).toBeLessThan(1.1);
    }
    // the bog is bounded: it lifts within SHIFT.bogS and never takes all the pull
    expect(SHIFT.bogS).toBeLessThanOrEqual(1.5);
    for (const d of Object.values(DRIVETRAINS)) expect((d.poorShift ?? 1) * SHIFT.bog.missed + SHIFT.bogTurbo * 0.8).toBeLessThan(1);
  });
});

/** A human-like tapper: taps SHIFT `mean` ± jitter seconds after the cue turns green (seeded). */
function human(eventId: string, b: Build, mean: number, gearbox: GearboxId, seed: number) {
  const e = eventById(eventId);
  const rng = makeRng(seed);
  const sim = new RaceSim({ eventId, seed: SEED, solo: true, player: { name: 'p', car: b.car, stats: buildStats(b, e.partCap), paint: '#fff', perfectMul: carById(b.car).perfectMul, gearbox }, nitroCharges: 2, shift: 'manual', analysis: false, launch: 'perfect' });
  let seen = -1, at = Infinity;
  while (!sim.done) {
    if (sim.charges > 0 && sim.player.nitroLeft <= 0) {
      const { active } = sim.windowState();
      if (active && !sim.usedWindows.has(active.segIndex)) sim.tapNitro();
    }
    const a = sim.attempt;
    if (a.cue === 'green' && a.id !== seen) { seen = a.id; at = sim.t + Math.max(0.12, mean + (rng() + rng() + rng() - 1.5) * 0.12); }
    if (sim.t >= at) { at = Infinity; sim.tapShift(); }
    sim.step();
  }
  const o = sim.outcome();
  return { t: o.playerTime!, clean: o.shiftsClean!, n: o.shifts! };
}

describe.skipIf(!process.env.PROBE)('gearbox setup experiment (prints)', () => {
  it('forgiving / standard / performance windows for tappers of different reaction times', () => {
    const rows: [string, CarId][] = [['yard-sprint', 'junker'], ['harbor-launch', 'muscle'], ['coast-crown', 'tourer'], ['midnight-run', 'super'], ['summit-gala', 'proto'], ['corniche', 'vireo']];
    const out: string[] = [];
    for (const [ev, car] of rows) {
      const t = carById(car).cap;
      const hi: Build = { car, tiers: [t, t, t], label: '' };
      for (const mean of [0.2, 0.3, 0.4, 0.5]) {
        const cells = (['forgiving', 'standard', 'performance'] as GearboxId[]).map((g) => {
          let s = 0, c = 0, n = 0;
          for (let k = 1; k <= 5; k++) { const r = human(ev, hi, mean, g, k); s += r.t; c += r.clean; n += r.n; }
          return `${g.slice(0, 4)} ${(s / 5).toFixed(2)} (${c}/${n} clean)`;
        });
        out.push(`${ev.padEnd(14)} ${car.padEnd(8)} react ${mean.toFixed(2)} s  ${cells.join('  ')}`);
      }
    }
    console.log(out.join('\n'));
  }, 120_000);
});
