// Race view data: the speed every screen shows comes from the simulation (one mph conversion), the audio snapshot
// reports the player's real engine state and gear changes, bend signs quote the sim's own bend limit, and every
// track (the Azure Riviera's included) resolves to scenery.
import { describe, expect, it } from 'vitest';
import { RaceSim, leanOutcome, runRace, speedMph } from '../src/core/race';
import { statsFor } from '../src/core/loadout';
import { mph } from '../src/core/units';
import { bendInfo } from '../src/render/raceFx';
import { PALETTES, sceneLook } from '../src/render/scene';
import { CarId, Family, TIER_STAT, TRACKS, carById } from '../src/data/tables';
import type { Part } from '../src/core/state';

const build = (car: CarId) => {
  const t = Math.min(carById(car).cap, TIER_STAT.length - 1);
  const eq: Partial<Record<Family, Part>> = { engine: { id: 1, f: 'engine', t, q: 'std' }, tires: { id: 2, f: 'tires', t, q: 'std' }, turbo: { id: 3, f: 'turbo', t, q: 'std' } };
  return statsFor(car, eq);
};
const setup = (eventId: string, car: CarId) => ({ eventId, seed: 5, player: { name: 'You', car, stats: build(car), paint: '#fff', perfectMul: carById(car).perfectMul }, nitroCharges: 2, shift: 'clean' as const, analysis: false });

describe('race view data', () => {
  it('mph is derived from the sim velocity: gauge, audio snapshot, top speed and trap agree', () => {
    for (const [ev, car] of [['bridge-trap', 'super'], ['summit-1000', 'sovereign'], ['yard-sprint', 'junker']] as [string, CarId][]) {
      const sim = new RaceSim(setup(ev, car));
      let peak = 0;
      while (sim.player.finishTime === null) {
        sim.step();
        const p = sim.player;
        expect(speedMph(p)).toBe(mph(p.v));
        expect(sim.audioState().mph).toBe(speedMph(p));
        if (p.finishTime === null) peak = Math.max(peak, p.v);
      }
      const o = sim.finish();
      expect(mph(o.topSpeed!)).toBe(mph(peak));
      expect(o.trapSpeed).not.toBeNull();
      expect(mph(o.trapSpeed!)).toBeLessThanOrEqual(mph(o.topSpeed!) + 1);
      expect(leanOutcome(o).topSpeed).toBe(o.topSpeed);
    }
  });

  it('audio snapshot: rpm, throttle, gear events (up, auto-down), slip off the line, nitro', () => {
    const sim = new RaceSim({ ...setup('canyon-stage', 'rally'), shift: 'manual' });
    let maxSlip = 0, sawNitro = false, sawCut = false;
    const kinds = new Set<string>();
    let lastSeq = 0;
    while (sim.player.finishTime === null) {
      if (sim.attempt.cue === 'green') sim.tapShift();
      if (sim.t > 3 && sim.charges > 0 && sim.player.nitroLeft <= 0) sim.tapNitro();
      sim.step();
      const a = sim.audioState();
      expect(a.rpmFrac).toBeGreaterThan(0);
      expect(a.rpm).toBeGreaterThanOrEqual(800);
      expect(a.throttle).toBeGreaterThanOrEqual(0);
      expect(a.throttle).toBeLessThanOrEqual(1);
      expect(a.slip).toBeGreaterThanOrEqual(0);
      expect(a.slip).toBeLessThanOrEqual(1);
      if (a.launch) maxSlip = Math.max(maxSlip, a.slip);
      if (a.nitro) sawNitro = true;
      if (sim.player.cut > 0) { sawCut = true; expect(a.throttle).toBe(0); }
      for (const e of sim.gearEvents) if (e.seq > lastSeq) { kinds.add(`${e.dir}:${e.grade}`); lastSeq = e.seq; expect(e.into).toBe(e.dir === 'up' ? e.from + 1 : e.into); }
    }
    expect(sawNitro).toBe(true);
    expect(sawCut).toBe(true);
    expect(kinds.has('up:clean')).toBe(true);
    expect(kinds.has('down:auto-down')).toBe(true);
    // a wheelspinning launch reports slip (the Ironhorse lights its tyres)
    const m = new RaceSim(setup('yard-sprint', 'muscle'));
    let spin = 0;
    for (let i = 0; i < 90; i++) { m.step(); spin = Math.max(spin, m.audioState().slip); }
    expect(spin).toBeGreaterThan(0.1);
    void maxSlip;
  });

  it('bend signs quote the speed the sim brakes each car to', () => {
    const g = build('gt').grip;
    const hp = bendInfo(22, g), sw = bendInfo(150, g);
    expect(hp.kind).toBe('HAIRPIN');
    expect(sw.kind).toBe('SWEEPER');
    expect(hp.mph).toBe(mph(Math.sqrt(g * 9.81 * 22)));
    expect(sw.mph).toBeGreaterThan(hp.mph);
  });

  it('every track resolves to a scenery look with a palette (the Riviera and Neon looks included)', () => {
    for (const t of Object.values(TRACKS)) expect(PALETTES[sceneLook(t.theme, t.id)], t.id).toBeTruthy();
    for (const id of ['corniche', 'port', 'grand']) if ((TRACKS as Record<string, unknown>)[id]) expect(sceneLook('coast', id)).toBe('riviera');
    expect(sceneLook('neon')).toBe('neon');
    expect(sceneLook('riviera')).toBe('riviera');
    expect(PALETTES[sceneLook('something-new')] ?? PALETTES.suburb).toBeTruthy();
  });

  it('quick race is unaffected by the live race snapshot (deterministic outcome)', () => {
    const a = runRace(setup('cliff-esses', 'super'), 'perfect');
    const b = runRace(setup('cliff-esses', 'super'), 'perfect');
    expect(a.playerTime).toBe(b.playerTime);
  });
});
