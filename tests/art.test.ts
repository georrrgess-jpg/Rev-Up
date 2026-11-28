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

// ---------------------------------------------------------------- opponent-only cars
import { RIVAL_ART_IDS, drawCar } from '../src/render/car';
import { RIVAL_LOOKS, artOf, rivalCarModel } from '../src/data/rivalCars';
import { EVENTS, RIVALS } from '../src/data/tables';

/** A 2D context that accepts every call (gradients included) and counts fills, so drawing can run under Node. */
function fakeCtx() {
  let fills = 0;
  const grad = { addColorStop() {} };
  const target: Record<string, unknown> = { fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, font: '', filter: 'none' };
  const ctx = new Proxy(target, {
    get(t, k: string) {
      if (k in t) return t[k];
      if (k === 'fill') return () => { fills++; };
      if (k.startsWith('create')) return () => grad;
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'getTransform') return () => ({ a: 1, b: 0 });
      return () => undefined;
    },
    set(t, k: string, v) { t[k] = v; return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fills: () => fills };
}

describe('opponent-only cars', () => {
  it('has around twenty original designs, each drawn with its own body, model name and length', () => {
    expect(RIVAL_ART_IDS.length).toBeGreaterThanOrEqual(14);
    for (const id of RIVAL_ART_IDS) {
      const lk = RIVAL_LOOKS[id];
      expect(lk, id).toBeTruthy();
      expect(lk.model.length, id).toBeGreaterThan(3);
      expect(lk.L, id).toBe(carLengthM(id));
      expect(ART_CARS as readonly string[]).not.toContain(id);
      for (const o of [{ detail: true, headlights: 1 }, { detail: false, nitro: 1.2, brake: true, blur: 0.8 }, { silhouette: true }]) {
        const f = fakeCtx();
        drawCar(f.ctx, id, 0, 300, 400, { paint: lk.paint, trim: lk.trim, ...o });
        expect(f.fills(), id).toBeGreaterThan(10);
      }
      const g = _geometryForTest(id);
      expect(g.front.length, id).toBeGreaterThan(0);
      const a = carAnchors(id, 0, 100, 400);
      expect(a.nose.x).toBeGreaterThan(a.front.x);
      expect(ENGINES[lk.voice], `${id} voice ${lk.voice}`).toBeTruthy();
    }
    // every design has a different length / wheelbase signature from the roster and from each other
    const sig = (id: string) => { const a = carAnchors(id, 0, 0, carLengthM(id)); return `${carLengthM(id)}|${(a.front.x - a.rear.x).toFixed(2)}`; };
    const all = [...ART_CARS, ...RIVAL_ART_IDS].map(sig);
    expect(all.filter((s, i) => all.indexOf(s) !== i)).toEqual([]);
  });

  it('every look has a model, a length matching its body and a class; roster builds draw their roster body', () => {
    for (const lk of Object.values(RIVAL_LOOKS)) {
      expect(lk.model, lk.id).toBeTruthy();
      expect(lk.L, lk.id).toBe(carLengthM(lk.art));
      expect(ENGINES[lk.voice], lk.id).toBeTruthy();
      if (!RIVAL_ART_IDS.includes(lk.id)) expect(lk.art).toBe(lk.car);
    }
  });

  it('every rival look exists and belongs to the rival’s own performance class (balance unchanged)', () => {
    for (const r of Object.values(RIVALS)) {
      if (!r.look) continue;
      const lk = RIVAL_LOOKS[r.look];
      expect(lk, `${r.id} → ${r.look}`).toBeTruthy();
      expect(lk.car, r.id).toBe(r.car);
      expect(rivalCarModel(r)).toBe(lk.model);
    }
  });

  it('no race puts two rivals in the same-looking car, and the early races show three different bodies', () => {
    for (const e of EVENTS) {
      const looks = e.rivals.map((id) => RIVALS[id].look ?? RIVALS[id].car);
      expect(new Set(looks).size, `${e.id}: ${looks.join(', ')}`).toBe(looks.length);
    }
    for (const id of ['yard-sprint', 'crusher-run', 'rusty-ray', 'cul-de-sac', 'maple-mile', 'foundry-final', 'harbor-launch', 'cliff-esses', 'coast-crown']) {
      const e = EVENTS.find((x) => x.id === id)!;
      const bodies = e.rivals.map((r) => artOf(RIVALS[r]));
      expect(new Set(bodies).size, `${id}: ${bodies.join(', ')}`).toBe(3);
      // and none of them is the roster car the player has at that stage
      expect(bodies.filter((b) => b === 'junker').length, id).toBe(0);
    }
  });
});
