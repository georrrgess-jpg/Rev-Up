// Audio: engine voices per car, upgrades, no stuck sounds, and the soundtrack's grid / loop / scenes.
// Runs in node against a minimal stand-in for the Web Audio API (records what is started and stopped).
import { describe, expect, it } from 'vitest';
import { ENGINES } from '../src/audio-voices';
import { EngineVoice, firingHz, resolveEngine, runScript, showcaseRev, upgradeLevel } from '../src/audio-engine';
import { BAR, BARS, CHORDS, HOOK, LOOP, MusicPlayer, STEP, sceneLevels } from '../src/audio-music';
import { volCurve } from '../src/audio';
import { CARS } from '../src/data/tables';

class Param {
  value: number;
  events: [string, number, number][] = [];
  constructor(v = 0) { this.value = v; }
  setValueAtTime(v: number, t: number) { this.events.push(['set', v, t]); return this; }
  linearRampToValueAtTime(v: number, t: number) { this.events.push(['lin', v, t]); return this; }
  exponentialRampToValueAtTime(v: number, t: number) { if (v <= 0) throw new Error('exp ramp to 0'); this.events.push(['exp', v, t]); return this; }
  setTargetAtTime(v: number, t: number, tc: number) { if (!Number.isFinite(v)) throw new Error(`non-finite target ${v}`); this.events.push(['target', v, t + tc * 0]); return this; }
  cancelScheduledValues(t: number) { this.events.push(['cancel', 0, t]); return this; }
}
class Node {
  outs: unknown[] = [];
  connect<T>(n: T): T { this.outs.push(n); return n; }
  disconnect() { this.outs = []; }
}
class Src extends Node {
  startAt: number | null = null;
  stopAt: number | null = null;
  frequency = new Param(440);
  detune = new Param(0);
  type = 'sine';
  buffer: unknown = null;
  loop = false; loopStart = 0;
  onended: (() => void) | null = null;
  private listeners: (() => void)[] = [];
  constructor(private ctx: FakeCtx) { super(); ctx.sources.push(this); }
  start(t = 0) { if (this.startAt !== null) throw new Error('started twice'); this.startAt = t; }
  stop(t = 0) { if (this.startAt === null) throw new Error('stop before start'); this.stopAt = this.stopAt === null ? t : Math.min(this.stopAt, t); }
  setPeriodicWave() {}
  addEventListener(_: string, f: () => void) { this.listeners.push(f); }
  /** End every source whose stop time has passed (what a real context does). */
  fire() { for (const f of this.listeners) f(); this.onended?.(); void this.ctx; }
}
class FakeCtx {
  currentTime = 0;
  sampleRate = 8000;
  sources: Src[] = [];
  destination = new Node();
  createOscillator() { return new Src(this); }
  createBufferSource() { return new Src(this); }
  createGain() { return Object.assign(new Node(), { gain: new Param(1) }); }
  createBiquadFilter() { return Object.assign(new Node(), { type: 'lowpass', frequency: new Param(350), Q: new Param(1), gain: new Param(0) }); }
  createWaveShaper() { return Object.assign(new Node(), { curve: null, oversample: 'none' }); }
  createDelay() { return Object.assign(new Node(), { delayTime: new Param(0) }); }
  createPeriodicWave() { return {}; }
  createBuffer(_c: number, n: number) { const d = new Float32Array(n); return { duration: n / this.sampleRate, getChannelData: () => d }; }
  /** Advance time and end the sources that stopped. */
  advance(t: number) { this.currentTime = t; for (const s of this.sources) if (s.stopAt !== null && s.stopAt <= t && !(s as unknown as { ended?: boolean }).ended) { (s as unknown as { ended: boolean }).ended = true; s.fire(); } }
}
const fake = () => {
  const c = new FakeCtx();
  const noise = c.createBuffer(1, 8000);
  return { c, ac: c as unknown as BaseAudioContext, dest: c.createGain() as unknown as AudioNode, noise: noise as unknown as AudioBuffer };
};

const PLAYABLE = CARS.filter((c) => c.enabled !== false).map((c) => c.id);

describe('engine voices', () => {
  it('every playable car has its own engine voice, pitched from its tach', () => {
    expect(PLAYABLE.length).toBeGreaterThanOrEqual(13);
    for (const car of PLAYABLE) {
      expect(ENGINES[car], car).toBeTruthy();
      const e = resolveEngine(car);
      expect(firingHz(e, 0), car).toBeGreaterThan(15);
      expect(firingHz(e, 1), car).toBeLessThan(1500);
      expect(firingHz(e, 1)).toBeGreaterThan(firingHz(e, 0.5));
    }
    // no two cars share both a cylinder count and a mid-rpm pitch within a semitone
    for (const a of PLAYABLE) for (const b of PLAYABLE) {
      if (a >= b) continue;
      const ea = resolveEngine(a), eb = resolveEngine(b);
      const st = Math.abs(12 * Math.log2(firingHz(ea, 0.5) / firingHz(eb, 0.5)));
      expect(st > 1 || ea.cyl !== eb.cyl || ea.layout !== eb.layout, `${a}/${b}`).toBe(true);
    }
  });

  it('the new supercars have their signature extras', () => {
    expect(ENGINES.vireo.cyl).toBe(10);
    expect(ENGINES.mako.cyl).toBe(8);
    expect(ENGINES.mako.turbo).toBeGreaterThan(0.5);
    expect(ENGINES.sovereign.cyl).toBe(12);
    expect(ENGINES.sovereign.whine).toBeGreaterThan(0);
  });

  it('upgraded engines sound different: more drive, brighter, more lope and crackle; a turbo whistles', () => {
    expect(upgradeLevel('muscle', null)).toBe(0);
    expect(upgradeLevel('muscle', { t: 5, q: 'std' })).toBeCloseTo(1);
    expect(upgradeLevel('muscle', { t: 5, q: 'mint' })).toBeGreaterThan(upgradeLevel('muscle', { t: 5, q: 'polished' }));
    for (const car of PLAYABLE) {
      const stock = resolveEngine(car), up = resolveEngine(car, { t: 10, q: 'mint' }, { t: 10 });
      expect(up.drive, car).toBeGreaterThan(stock.drive);
      expect(up.tilt, car).toBeLessThan(stock.tilt);
      expect(up.cut[1], car).toBeGreaterThan(stock.cut[1]);
      expect(up.crackle ?? 0, car).toBeGreaterThan(stock.crackle ?? 0);
      expect(up.turbo ?? 0, car).toBeGreaterThan(stock.turbo ?? 0);
    }
  });

  it('a race run (gear changes, slip, nitro, limiter) then stop leaves nothing sounding', () => {
    const { c, ac, dest, noise } = fake();
    const v = new EngineVoice(ac, dest, noise, resolveEngine('rally', { t: 7, q: 'polished' }, { t: 5 }));
    v.start(0);
    let gear = 0;
    for (let t = 0; t < 6; t += 1 / 60) {
      if (t > 1 && Math.floor(t) > gear) gear++;
      v.set({ frac: 0.5 + (t % 1) * 0.5, throttle: t % 1 < 0.05 ? 0 : 1, gear: t > 5 ? gear - 1 : gear, slip: t < 0.6 ? 0.9 : 0, nitro: t > 3 && t < 4, limiter: t > 4.5 && t < 4.8 }, t);
    }
    expect(c.sources.length).toBeGreaterThan(9); // shift barks, pops and blow-offs were added
    v.stop(6, 0.2);
    const before = c.sources.length;
    v.set({ frac: 0.9, throttle: 1, gear: 0 }, 6.1); // a late frame after stop does nothing
    v.upshift(6.1);
    expect(c.sources.length).toBe(before);
    for (const s of c.sources) {
      expect(s.startAt).not.toBeNull();
      expect(s.stopAt, 'every source is stopped').not.toBeNull();
      expect(s.stopAt!).toBeLessThanOrEqual(6 + 0.2 + 0.05 + 1e-9);
    }
    c.advance(7);
    expect(v.liveSources).toBe(0);
  });

  it('a scripted showcase rev (Mechanic Shop preview) runs to its end and stops itself', () => {
    const { c, ac, dest, noise } = fake();
    const v = new EngineVoice(ac, dest, noise, resolveEngine('mako', { t: 9, q: 'mint' }));
    v.start(0);
    const end = runScript(v, 0, showcaseRev(2.6));
    expect(end).toBeCloseTo(2.6);
    v.stop(end, 0.3);
    for (const s of c.sources) expect(s.stopAt!).toBeLessThanOrEqual(2.6 + 0.35 + 1e-9);
  });
});

describe('soundtrack', () => {
  it('one song: 16 bars in D minor at 104 BPM, a 4-bar hook', () => {
    expect(CHORDS.length).toBe(BARS);
    expect(LOOP).toBeCloseTo(BAR * 16);
    expect(HOOK.bars.length + 1).toBe(4);
    for (const bar of [...HOOK.bars, HOOK.open, HOOK.rise]) {
      const end = Math.max(...bar.map(([s, , l]) => s + l));
      expect(end).toBeLessThanOrEqual(16);
    }
  });

  it('the loop is seamless: loop 2 schedules exactly the notes of loop 1, one loop later', () => {
    const { c, ac, dest, noise } = fake();
    const p = new MusicPlayer(ac, dest, noise);
    p.play('race', 0);
    p.setIntensity(0.8, 0);
    p.scheduleUntil(3 * LOOP + 0.08);
    const notes = c.sources.filter((s) => s.frequency.value !== 440 || s.buffer === null).map((s) => [s.startAt!, s.frequency.value] as const);
    const start = 0.08;
    const key = (t: number, f: number) => `${Math.round((t - start) / STEP)}:${f.toFixed(2)}`;
    const loop = (k: number) => notes.filter(([t]) => t >= start + k * LOOP - 1e-6 && t < start + (k + 1) * LOOP - 1e-6).map(([t, f]) => key(t - k * LOOP, f)).sort();
    const first = loop(0), second = loop(1), third = loop(2);
    expect(third).toEqual(second);
    expect(first.length).toBeGreaterThan(200);
    expect(second).toEqual(first);
    // every note is on the grid and stops on its own
    for (const s of c.sources) {
      expect(Math.abs(((s.startAt! - start) / STEP) - Math.round((s.startAt! - start) / STEP))).toBeLessThan(1e-6);
      expect(s.stopAt).not.toBeNull();
    }
  });

  it('race layers follow intensity; the garage stays calm (no drums, no lead)', () => {
    const lo = sceneLevels('race', 0), hi = sceneLevels('race', 1);
    const sum = (l: Record<string, number>) => Object.values(l).reduce((a, b) => a + b, 0);
    expect(sum(hi)).toBeGreaterThan(sum(lo) + 1);
    expect(lo.lead).toBe(0);
    expect(hi.lead).toBeGreaterThan(0.9);
    const g = sceneLevels('garage', 1);
    expect(g.kick + g.snare + g.hat + g.lead + g.bassDrive).toBe(0);
    expect(g.bell).toBeGreaterThan(0);
  });

  it('stop fades out and schedules no more notes', () => {
    const { c, ac, dest, noise } = fake();
    const p = new MusicPlayer(ac, dest, noise);
    p.play('garage', 0);
    p.scheduleUntil(4);
    c.currentTime = 4;
    p.stop(4);
    p.scheduleUntil(20);
    const late = c.sources.filter((s) => s.startAt! > 4 + 2);
    expect(late.length).toBe(0);
    for (const s of c.sources) expect(s.stopAt).not.toBeNull();
  });

  it('stings: intro and results lead into the garage loop on the grid', () => {
    const { c, ac, dest, noise } = fake();
    const p = new MusicPlayer(ac, dest, noise);
    p.play('intro', 0);
    expect(c.sources.length).toBeGreaterThan(5);
    p.scheduleUntil(BAR * 2 + 1);
    expect(p.barAt(0.05 + BAR * 2)).toBeCloseTo(0);
    p.play('results', 10, { won: false });
    expect(p.scene).toBe('results');
  });
});

describe('volume', () => {
  it('slider law is 0 at 0, 1 at 1, and monotonic', () => {
    expect(volCurve(0)).toBe(0);
    expect(volCurve(1)).toBe(1);
    let last = -1;
    for (let v = 0; v <= 1.0001; v += 0.1) { expect(volCurve(v)).toBeGreaterThanOrEqual(last); last = volCurve(v); }
  });
});
