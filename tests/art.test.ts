import { describe, expect, it } from 'vitest';
import { ART_CARS, FACTORY_LOOKS, MID_ENGINE_CARS, PLATFORM_CARS, _geometryForTest, carAnchors, carLengthM, serviceZoneAt, serviceZones } from '../src/render/car';
import { ENGINES } from '../src/audio-voices';
import { REVEAL_SIGNATURE_CARS } from '../src/render/revealFx';
import { CARS, ENABLED_CARS } from '../src/data/tables';

describe('vehicle art', () => {
  it('draws every enabled car with its own body', () => {
    for (const c of ENABLED_CARS) expect(ART_CARS as readonly string[]).toContain(c.id);
    for (const id of ['vireo', 'mako', 'sovereign', 'ardent', 'meridian', 'tempest']) expect(ART_CARS as readonly string[]).toContain(id);
  });

  it('keeps the factory looks in step with the tables', () => {
    for (const id of PLATFORM_CARS) {
      const c = CARS.find((x) => x.id === id)!;
      expect(FACTORY_LOOKS[id]).toEqual({ paint: c.paint, trim: c.trim });
    }
  });

  it('gives every car a distinct length / wheelbase silhouette', () => {
    const sig = new Set(ART_CARS.map((id) => `${carLengthM(id)}`));
    // a few classic cars share lengths, but no two of the supercars do
    const supers = ['vireo', 'mako', 'sovereign', 'super', 'proto', 'ardent', 'meridian', 'tempest'];
    expect(new Set(supers.map((id) => carLengthM(id))).size).toBe(supers.length);
    expect(sig.size).toBeGreaterThan(8);
  });

  it('finds a front fascia near the nose for every car', () => {
    for (const id of ART_CARS) {
      const g = _geometryForTest(id);
      expect(g.front.length).toBeGreaterThan(0);
      // every fascia point sits at the nose (a zero-length arch edge once counted as front-facing)
      for (const p of g.front) expect(p.x, id).toBeGreaterThan(carLengthM(id) * 0.85);
    }
  });

  it('returns service zones inside the body, wheels on the ground', () => {
    for (const id of ART_CARS) {
      const x = 10, y = 300, w = 400;
      for (const hood of [0, 1]) {
        const z = serviceZones(id, x, y, w, hood);
        const { body } = z;
        expect(body.w).toBeGreaterThan(w * 0.95);
        for (const wh of z.wheels) {
          expect(wh.y + wh.h).toBeGreaterThan(y - 1);
          expect(wh.x).toBeGreaterThan(body.x - 1);
          expect(wh.x + wh.w).toBeLessThan(body.x + body.w + 1);
        }
        expect(z.wheels[0].x).toBeLessThan(z.wheels[1].x);
        // the engine box is where the hood is: over the front wheel on front-engined cars, behind the cabin otherwise
        const mid = MID_ENGINE_CARS.includes(id);
        const ec = z.engine.x + z.engine.w / 2;
        expect(mid ? ec < x + w * 0.5 : ec > x + w * 0.5).toBe(true);
        if (hood) expect(z.engine.y).toBeLessThan(serviceZones(id, x, y, w, 0).engine.y);
        expect(serviceZoneAt(z, ec, z.engine.y + z.engine.h / 2)).toBe('engine');
        expect(serviceZoneAt(z, z.wheels[0].x + z.wheels[0].w / 2, z.wheels[0].y + z.wheels[0].h / 2)).toBe('wheels');
        expect(serviceZoneAt(z, -50, -50)).toBe(null);
      }
    }
  });

  it('gives the Circuit supercars their own identities', () => {
    for (const id of ['ardent', 'meridian', 'tempest']) {
      expect(PLATFORM_CARS).toContain(id);
      expect(FACTORY_LOOKS[id]).toEqual({ paint: CARS.find((c) => c.id === id)!.paint, trim: CARS.find((c) => c.id === id)!.trim });
      expect(MID_ENGINE_CARS).toContain(id);
      expect(REVEAL_SIGNATURE_CARS).toContain(id);
      const a = carAnchors(id, 0, 100, 400);
      expect(a.front.x).toBeGreaterThan(a.rear.x);
      expect(a.nose.x).toBeGreaterThan(a.front.x);
      expect(a.roofY).toBeLessThan(a.sillY);
    }
    // the open-top Ardent has no side glass and the lowest roofline; the Meridian has the longest wheelbase
    expect(_geometryForTest('ardent').glass.length).toBe(0);
    const wb = (id: string) => { const a = carAnchors(id, 0, 0, carLengthM(id)); return a.front.x - a.rear.x; };
    for (const id of ART_CARS) if (id !== 'meridian') expect(wb('meridian')).toBeGreaterThan(wb(id));
    expect(carLengthM('meridian')).toBeGreaterThan(carLengthM('sovereign'));
  });

  it('voices the Circuit supercars: a screaming four, a smooth V12, an electric with no burble', () => {
    expect(ENGINES.ardent.cyl).toBe(4);
    expect(ENGINES.ardent.vtec).toBeGreaterThan(0);
    expect(ENGINES.meridian.cyl).toBe(12);
    expect(ENGINES.meridian.lope).toBe(0);
    const t = ENGINES.tempest;
    expect(t.whine).toBeGreaterThan(0.5);
    expect(t.turbo).toBeGreaterThan(0);
    expect(t.sub + t.lope + (t.crackle ?? 0) + (t.misfire ?? 0)).toBe(0);
  });
});
