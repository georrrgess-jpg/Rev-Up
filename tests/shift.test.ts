import { describe, expect, it } from 'vitest';
import { RaceOutcome, RaceSetup, RaceSim, SHIFT, ShiftPolicy, coachFor, leanOutcome, runRace, speedMph } from '../src/core/race';
import { statsFor } from '../src/core/loadout';
import { mph } from '../src/core/units';
import { BENCHMARK_MPH, DRIVETRAINS, drivetrainFor } from '../src/data/drivetrain';
import { CarId, Family, RACE, TIER_STAT, carById } from '../src/data/tables';
import type { Part } from '../src/core/state';

const ROSTER: CarId[] = ['junker', 'beater', 'hothatch', 'muscle', 'tourer', 'tuner', 'super', 'rally', 'gt', 'proto'];
const build = (car: CarId, t = Math.min(carById(car).cap, TIER_STAT.length - 1)) => {
  const eq: Partial<Record<Family, Part>> = {};
  eq.engine = { id: 1, f: 'engine', t, q: 'std' };
  eq.tires = { id: 2, f: 'tires', t, q: 'std' };
  eq.turbo = { id: 3, f: 'turbo', t, q: 'std' };
  return statsFor(car, eq);
};
const setup = (eventId: string, car: CarId, shift: ShiftPolicy, n = 0, extra: Partial<RaceSetup> = {}): RaceSetup =>
  ({ eventId, seed: 7, player: { name: 'You', car, stats: build(car), paint: '#fff', perfectMul: carById(car).perfectMul }, nitroCharges: n, shift, ...extra });
const PAIRS: [string, CarId][] = [['yard-sprint', 'junker'], ['rusty-ray', 'beater'], ['cul-de-sac', 'hothatch'], ['maple-mile', 'muscle'], ['coast-crown', 'tourer'], ['neon-mile', 'tuner'], ['midnight-run', 'super']];

describe('timed shifting', () => {
  it('every roster car has gearing, a tach and a gauge that grows with the car', () => {
    for (const id of ROSTER) {
      const d = DRIVETRAINS[id];
      expect(d.gears.length).toBeGreaterThanOrEqual(4);
      for (let i = 1; i < d.gears.length; i++) expect(d.gears[i]).toBeGreaterThan(d.gears[i - 1]);
      expect(d.band[0]).toBeLessThan(d.band[1]);
      expect(d.band[1]).toBeLessThan(1);
      expect(d.redline).toBeGreaterThan(d.idle);
      expect(d.gaugeMph).toBeGreaterThanOrEqual(BENCHMARK_MPH[id]!);
    }
    const ladder: CarId[] = ['junker', 'beater', 'hothatch', 'muscle', 'tourer', 'super', 'proto'];
    for (let i = 1; i < ladder.length; i++) expect(DRIVETRAINS[ladder[i]].gaugeMph).toBeGreaterThan(DRIVETRAINS[ladder[i - 1]].gaugeMph);
  });

  it('clean shifting beats ordinary, which beats missed shifts (same seed, build and rivals)', () => {
    for (const [ev, car] of PAIRS) {
      const t = (p: ShiftPolicy) => runRace(setup(ev, car, p)).playerTime!;
      const clean = t('clean'), ordinary = t('ordinary'), missed = t('missed');
      expect(clean, `${ev} ${car}`).toBeLessThan(ordinary);
      expect(ordinary, `${ev} ${car}`).toBeLessThan(missed);
      expect(missed - clean, `${ev} ${car}`).toBeGreaterThan(0.25); // it matters
      expect(missed / clean, `${ev} ${car}`).toBeLessThan(1.1); // but a missed input is forgiven, not a stall
    }
  });

  it('the automatic fallback never stalls: a live race with no input still finishes, on the limiter only briefly', () => {
    for (const [ev, car] of PAIRS) {
      const sim = new RaceSim(setup(ev, car, 'manual'));
      let worst = 0;
      while (!sim.done) { sim.step(); worst = Math.max(worst, sim.player.limiterT); }
      const o = sim.outcome();
      expect(o.cutoff).toBe(false);
      expect(o.playerTime).not.toBeNull();
      expect(worst).toBeLessThanOrEqual(SHIFT.autoDelay + 2 * RACE.dt);
      expect(o.shifts).toBeGreaterThan(0);
      expect(o.shiftsClean).toBe(0);
      expect(o.shiftLog!.every((s) => s.grade === 'missed')).toBe(true);
    }
  });

  it('a tap grades the shift by where the needle is', () => {
    const sim = new RaceSim(setup('yard-sprint', 'junker', 'manual'));
    expect(sim.tapShift()).toBe('busy'); // not before the start
    sim.step();
    while (sim.shiftCue() !== 'green') sim.step();
    expect(sim.tapShift()).toBe('clean');
    expect(sim.player.gear).toBe(1);
    expect(sim.tapShift()).toBe('busy'); // mid-shift
    while (sim.rpmFrac(sim.player) < SHIFT.minTap + 0.02 || sim.player.cut > 0) sim.step();
    for (let k = 0; k < 20; k++) sim.step();
    expect(sim.tapShift()).toBe('early');
    while (sim.shiftCue() !== 'late') sim.step();
    expect(sim.tapShift()).toBe('late');
  });

  it('Quick Race and the bot keep working: no input means automatic, ordinary-quality shifts', () => {
    const sim = new RaceSim({ eventId: 'crusher-run', seed: 3, player: { name: 'You', car: 'junker', stats: build('junker'), paint: '#fff' }, nitroCharges: 0 });
    const o = sim.finish();
    expect(o.playerTime).toBeGreaterThan(12);
    expect(o.playerTime).toBeLessThan(25);
    expect(o.shiftLog!.every((s) => s.grade === 'late')).toBe(true);
    const lean = leanOutcome(o);
    expect(lean.shifts).toBe(o.shifts);
    expect(lean.shiftsClean).toBe(0);
    expect(lean.topSpeed).toBe(o.topSpeed);
  });

  it('the displayed mph is the simulated velocity converted once, and the top speed matches telemetry', () => {
    for (const [ev, car] of PAIRS) {
      const sim = new RaceSim(setup(ev, car, 'clean', 2));
      let shown = 0;
      while (sim.player.finishTime === null) {
        const { active } = sim.windowState();
        if (active && sim.charges > 0 && sim.player.nitroLeft <= 0 && !sim.usedWindows.has(active.segIndex)) sim.tapNitro();
        sim.step();
        if (sim.player.finishTime === null) {
          expect(speedMph(sim.player)).toBe(Math.round(sim.player.v * 2.23694));
          shown = Math.max(shown, speedMph(sim.player));
        }
      }
      const o = sim.finish();
      expect(mph(o.topSpeed!)).toBe(shown);
      expect(mph(leanOutcome(o).topSpeed!)).toBe(shown);
      // speed and engine speed are separate: the tach falls on every upshift while the speedometer keeps climbing
      expect(o.shiftLog!.length).toBeGreaterThan(1);
    }
  });

  it('full builds reach believable class speeds (contract benchmarks, Coast Road, Perfect boosts)', () => {
    const tune = 1 + 3 * 0.02;
    for (const car of ['junker', 'beater', 'hothatch', 'muscle', 'tourer', 'tuner', 'super'] as CarId[]) {
      const st = build(car);
      const sim = new RaceSim({ eventId: 'coast-crown', seed: 3, player: { name: 'p', car, stats: { top: st.top * tune, accel: st.accel * tune, grip: st.grip * tune }, paint: '#fff', perfectMul: carById(car).perfectMul }, nitroCharges: 2, shift: 'clean' });
      while (sim.player.finishTime === null) {
        const { active } = sim.windowState();
        if (active && sim.charges > 0 && sim.player.nitroLeft <= 0 && !sim.usedWindows.has(active.segIndex)) sim.tapNitro();
        sim.step();
      }
      const top = mph(sim.player.peak);
      expect(Math.abs(top / BENCHMARK_MPH[car]! - 1), `${car} ${top} mph`).toBeLessThan(0.05);
      expect(top).toBeLessThan(drivetrainFor(car).gaugeMph);
    }
  });

  it('the practice race keeps the shift cue out of the boost zones', () => {
    const sim = new RaceSim({ ...setup('yard-sprint', 'junker', 'manual', 2), windowScale: 1.6 });
    let firstCue = -1, firstZone = -1;
    while (!sim.done) {
      const cue = sim.shiftCue();
      const zone = sim.windowState().active;
      if (cue !== 'off' && firstCue < 0) firstCue = sim.t;
      if (zone && firstZone < 0) firstZone = sim.t;
      if (zone && !sim.usedWindows.has(zone.segIndex)) expect(cue).toBe('off');
      if (sim.boostZoneNear()) expect(cue).toBe('off');
      if (cue === 'green') sim.tapShift();
      if (zone && !sim.usedWindows.has(zone.segIndex) && sim.charges > 0 && sim.player.nitroLeft <= 0 && sim.t > firstZone + 0.3) sim.tapNitro();
      sim.step();
    }
    expect(firstCue).toBeGreaterThan(0);
    expect(firstCue).toBeLessThan(firstZone - 1);
    const o = sim.outcome();
    expect(o.perfects).toBeGreaterThan(0);
    expect(o.shiftsClean).toBeGreaterThan(0);
  });

  it('losses are actionable: the analysis measures shift and boost losses against the same race', () => {
    const missed = runRace(setup('yard-sprint', 'junker', 'missed', 2), 'none');
    expect(missed.shiftLoss!).toBeGreaterThan(0.3);
    expect(missed.boostLoss!).toBeGreaterThan(0.2);
    const clean = runRace(setup('yard-sprint', 'junker', 'clean', 2), 'perfect');
    expect(clean.shiftLoss!).toBeLessThan(0.02);
    expect(clean.boostLoss!).toBeLessThan(0.05);
    // a missed shift is named, with the gear
    const base: RaceOutcome = { ...missed, place: 2, perfects: 1, nitroUsed: 2, shiftLoss: 0.6, boostLoss: 0.1 };
    const worst = missed.shiftLog![1];
    const c = coachFor(base, 0.4, worst)!;
    expect(c.kind).toBe('shift');
    expect(c.text).toMatch(/missed the shift into (2nd|3rd|4th)/);
    // late boosts
    expect(coachFor({ ...base, shiftLoss: 0.05, boostLoss: 0.5 }, 0.3, null)!.kind).toBe('boost');
    // when skill would not have closed the gap, it is the build
    const b = coachFor({ ...base, shiftLoss: 0.1, boostLoss: 0.1, advice: { family: 'tires', segment: 'bend', lost: 0.8 } }, 2.5, null)!;
    expect(b.kind).toBe('build');
    expect(b.text).toMatch(/Tires/);
  });
});
