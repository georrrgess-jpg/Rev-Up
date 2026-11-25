import { describe, expect, it } from 'vitest';
import { RaceSim, runRace } from '../src/core/race';
import { statsFor } from '../src/core/loadout';
import { CarId, EVENTS, Family, TRACKS, trackLength } from '../src/data/tables';
import type { Part } from '../src/core/state';

const build = (car: CarId, e: number, ti: number, tu: number) => {
  const eq: Partial<Record<Family, Part>> = {};
  if (e) eq.engine = { id: 1, f: 'engine', t: e, q: 'std' };
  if (ti) eq.tires = { id: 2, f: 'tires', t: ti, q: 'std' };
  if (tu) eq.turbo = { id: 3, f: 'turbo', t: tu, q: 'std' };
  return statsFor(car, eq);
};
const setup = (eventId: string, stats: ReturnType<typeof build>, n = 0, seed = 11, car: CarId = 'junker') =>
  ({ eventId, seed, player: { name: 'You', car, stats, paint: '#fff' }, nitroCharges: n });

describe('race simulation', () => {
  it('is deterministic for the same lineup and seed', () => {
    const a = runRace(setup('yard-sprint', build('junker', 1, 1, 1), 3), 'perfect');
    const b = runRace(setup('yard-sprint', build('junker', 1, 1, 1), 3), 'perfect');
    expect(a.playerTime).toBe(b.playerTime);
    expect(a.standings.map((r) => r.name)).toEqual(b.standings.map((r) => r.name));
  });

  it('normal races finish near 20 seconds for the intended car', () => {
    const pairs: [string, CarId, number][] = [['yard-sprint', 'junker', 1], ['crusher-run', 'junker', 2], ['rusty-ray', 'beater', 3], ['cul-de-sac', 'hothatch', 3], ['maple-mile', 'muscle', 4]];
    for (const [ev, car, t] of pairs) {
      const o = runRace(setup(ev, build(car, t, t, t), 0, 3, car));
      expect(o.playerTime!).toBeGreaterThan(16);
      expect(o.playerTime!).toBeLessThan(25);
      expect(o.cutoff).toBe(false);
    }
  });

  it('a meaningful upgrade reliably helps (same seed)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const weak = runRace(setup('crusher-run', build('junker', 1, 1, 1), 0, seed));
      const strong = runRace(setup('crusher-run', build('junker', 2, 2, 2), 0, seed));
      expect(strong.playerTime!).toBeLessThan(weak.playerTime! - 0.5);
      expect(strong.place).toBeLessThanOrEqual(weak.place);
    }
  });

  it('perfect nitro beats mistimed nitro, which beats no nitro', () => {
    const s = build('junker', 2, 2, 2);
    const none = runRace(setup('crusher-run', s, 0));
    const late = runRace(setup('crusher-run', s, 3), 'late');
    const perfect = runRace(setup('crusher-run', s, 3), 'perfect');
    expect(perfect.perfects).toBe(2);
    expect(late.perfects).toBe(0);
    expect(late.playerTime!).toBeLessThan(none.playerTime!);
    expect(perfect.playerTime!).toBeLessThan(late.playerTime! - 0.2);
    // and it changes the result in a close event
    expect(none.place).toBeGreaterThan(perfect.place);
  });

  it('engines matter more on the highway, turbos off the launch, tires through the bend', () => {
    const base = build('beater', 2, 2, 2);
    const split = (stats: typeof base, ev: string) => {
      const sim = new RaceSim(setup(ev, stats, 0, 5, 'beater'));
      sim.finish();
      const s = sim.player.splits;
      return s.map((t, i) => t - (s[i - 1] ?? 0));
    };
    const b0 = split(base, 'maple-mile');
    const eng = split(build('beater', 3, 2, 2), 'maple-mile');
    const tur = split(build('beater', 2, 2, 3), 'maple-mile');
    const tir = split(build('beater', 2, 3, 2), 'maple-mile');
    // segment 0 launch, 1 highway, 2 highway bend, 3 highway
    const gain = (x: number[], i: number) => b0[i] - x[i];
    expect(gain(tur, 0)).toBeGreaterThan(gain(eng, 0));
    expect(gain(eng, 3)).toBeGreaterThan(gain(tur, 3));
    expect(gain(tir, 2)).toBeGreaterThan(gain(eng, 2));
    expect(gain(tir, 0)).toBeGreaterThan(0); // traction on launch
  });

  it('reports a real gap and standings', () => {
    const o = runRace(setup('yard-sprint', build('junker', 0, 0, 0)));
    expect(o.place).toBeGreaterThan(1);
    expect(o.gapText).toMatch(/^\d+\.\d s behind first$/);
    const first = o.standings[0].finishTime!;
    expect(Number(o.gapText.split(' ')[0])).toBeCloseTo(o.playerTime! - first, 1);
    expect(o.advice).not.toBeNull();
  });

  it('nitro taps are limited by banked charges and a no-nitro run is always allowed', () => {
    const sim = new RaceSim(setup('yard-sprint', build('junker', 1, 1, 1), 1));
    for (let k = 0; k < 120; k++) sim.step();
    expect(sim.tapNitro()).not.toBe('empty');
    for (let k = 0; k < 200; k++) sim.step();
    expect(sim.tapNitro()).toBe('empty');
    const o = sim.finish();
    expect(o.nitroUsed).toBe(1);
    expect(runRace(setup('yard-sprint', build('junker', 1, 1, 1), 0)).nitroUsed).toBe(0);
  });

  it('tracks have the expected length and both have nitro windows', () => {
    for (const t of Object.values(TRACKS)) {
      expect(trackLength(t)).toBeGreaterThan(400);
      expect(t.segments.filter((s) => s.window).length).toBeGreaterThanOrEqual(2);
    }
    expect(EVENTS.length).toBeGreaterThanOrEqual(5);
  });
});
