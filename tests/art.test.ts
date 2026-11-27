import { describe, expect, it } from 'vitest';
import { ART_CARS, FACTORY_LOOKS, PLATFORM_CARS, _geometryForTest, carLengthM, serviceZoneAt, serviceZones } from '../src/render/car';
import { CARS, ENABLED_CARS } from '../src/data/tables';

describe('vehicle art', () => {
  it('draws every enabled car with its own body', () => {
    for (const c of ENABLED_CARS) expect(ART_CARS as readonly string[]).toContain(c.id);
    for (const id of ['vireo', 'mako', 'sovereign']) expect(ART_CARS as readonly string[]).toContain(id);
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
    expect(new Set(['vireo', 'mako', 'sovereign', 'super', 'proto'].map((id) => carLengthM(id))).size).toBe(5);
    expect(sig.size).toBeGreaterThan(8);
  });

  it('finds a front fascia near the nose for every car', () => {
    for (const id of ART_CARS) {
      const g = _geometryForTest(id);
      expect(g.front.length).toBeGreaterThan(0);
      for (const p of g.front) expect(p.x).toBeGreaterThan(carLengthM(id) * 0.6);
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
        const mid = ['super', 'proto', 'vireo', 'sovereign'].includes(id);
        const ec = z.engine.x + z.engine.w / 2;
        expect(mid ? ec < x + w * 0.5 : ec > x + w * 0.5).toBe(true);
        if (hood) expect(z.engine.y).toBeLessThan(serviceZones(id, x, y, w, 0).engine.y);
        expect(serviceZoneAt(z, ec, z.engine.y + z.engine.h / 2)).toBe('engine');
        expect(serviceZoneAt(z, z.wheels[0].x + z.wheels[0].w / 2, z.wheels[0].y + z.wheels[0].h / 2)).toBe('wheels');
        expect(serviceZoneAt(z, -50, -50)).toBe(null);
      }
    }
  });
});
