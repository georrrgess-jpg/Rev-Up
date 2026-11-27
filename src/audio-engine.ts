// Engine synthesizer: one EngineVoice per running engine (race, preview, reveal, ignition).
// Owned by the Audio workstream. Works on any BaseAudioContext, so tests render it offline.
//
// Graph:  firing osc (per-car PeriodicWave) + sub-order osc → cam-lope AM → drive → shaper → exhaust low-pass
//         → two body resonances → level → shift envelope → out → destination
//         intake noise → band-pass → level · turbo whistle, motor whine → out · tyre squeal → destination
// Pitch follows the car's real tach (drivetrain idle / redline) and cylinder count. Every parameter is scheduled at
// an explicit time, so a live race calls set() each frame and a preview schedules its whole rev script at once.
import { carById, type CarId } from './data/tables';
import { drivetrainFor } from './data/drivetrain';
import { engineFor, type EngineSpec } from './audio-voices';

export type PartQuality = 'std' | 'polished' | 'mint';
export interface PartLike { t: number; q?: PartQuality }

export interface ResolvedEngine extends EngineSpec {
  car: string;
  idle: number;
  redline: number;
  /** Engine upgrade 0..1.2 (fitted engine tier against the car's cap, plus quality). */
  u: number;
  /** Turbo upgrade 0..1.2. */
  ut: number;
}

export interface EngineInput {
  /** Engine speed as a fraction of the redline. */
  frac: number;
  /** 0 = off the throttle (shift cut, lift, braking), 1 = flat out. */
  throttle: number;
  gear?: number;
  /** Tyre slip 0..1 (launch wheelspin, burnout, scrub). */
  slip?: number;
  nitro?: boolean;
  limiter?: boolean;
}

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const hash = (s: string, k: number) => {
  let h = 2166136261 ^ k;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
};

/** How upgraded a part is for this car: 0 stock (nothing fitted) … 1 at the car's cap, a little more for Polished / Mint. */
export function upgradeLevel(car: string, part?: PartLike | null): number {
  if (!part || part.t <= 0) return 0;
  let cap = 10;
  try { cap = carById(car as CarId)?.cap ?? 10; } catch { /* unknown id */ }
  const base = clamp(part.t / Math.max(1, cap));
  const bonus = part.q === 'mint' ? 0.16 : part.q === 'polished' ? 0.08 : 0;
  return Math.min(1.2, base + bonus);
}

/** The voice of this car with this engine (and turbo) fitted. Upgrades add harmonics, cam lope, crackle and whistle. */
export function resolveEngine(car: string, engine?: PartLike | null, turbo?: PartLike | null): ResolvedEngine {
  const base = engineFor(car);
  const d = drivetrainFor(car as CarId);
  const u = upgradeLevel(car, engine);
  const ut = upgradeLevel(car, turbo);
  const turboLevel = (base.turbo ?? 0) * (1 + 0.4 * u) + 0.45 * ut * (base.turbo ? 0.5 : 1);
  return {
    ...base,
    car, idle: d.idle, redline: d.redline, u, ut,
    tilt: base.tilt - 0.4 * u,
    drive: base.drive * (1 + 1.1 * u),
    lope: Math.min(0.75, base.lope + 0.22 * u * (base.cyl >= 6 ? 1 : 0.6)),
    crackle: Math.min(1.2, (base.crackle ?? 0) + 0.7 * u),
    rasp: base.rasp * (1 + 0.6 * u),
    cut: [base.cut[0] * (1 + 0.35 * u), base.cut[1] * (1 + 0.8 * u)],
    turbo: turboLevel,
    turboHz: base.turboHz ?? [2400 + 800 * ut, 5000 + 1200 * ut],
    gain: base.gain * (1 + 0.12 * u),
  };
}

/** Firing frequency (Hz) at a fraction of the redline. */
export const firingHz = (e: { idle: number; redline: number; cyl: number }, frac: number) =>
  (Math.max(e.idle, frac * e.redline) / 60) * (e.cyl / 2);

function firingWave(c: BaseAudioContext, e: ResolvedEngine): PeriodicWave {
  const N = 40;
  const real = new Float32Array(N + 1);
  const imag = new Float32Array(N + 1);
  for (let k = 1; k <= N; k++) {
    const a = k ** -Math.max(0.35, e.tilt) * (k % 2 ? 1 + e.odd : 1) * (0.7 + 0.6 * hash(e.car, k));
    imag[k] = a;
  }
  return c.createPeriodicWave(real, imag);
}

function shaperCurve(k: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  return curve;
}

type Src = AudioScheduledSourceNode;

export class EngineVoice {
  readonly e: ResolvedEngine;
  /** Context time of the last set() (or the end of a scheduled script): the watchdog stops a voice nobody drives. */
  lastSet = 0;
  /** Live voices (race) are watched; scripted ones stop themselves. */
  watched = false;
  stopped = false;
  onStop: (() => void) | null = null;
  private srcs = new Set<Src>();
  private main: OscillatorNode;
  private sub: OscillatorNode;
  private lfo: OscillatorNode;
  private turboOsc: OscillatorNode;
  private whineOsc: OscillatorNode;
  private squealOsc: OscillatorNode;
  private vib: OscillatorNode;
  private noiseSrc: AudioBufferSourceNode;
  private sqNoise: AudioBufferSourceNode;
  private subG: GainNode;
  private am: GainNode;
  private lfoG: GainNode;
  private pre: GainNode;
  private lp: BiquadFilterNode;
  private raspG: GainNode;
  private level: GainNode;
  private shiftG: GainNode;
  private out: GainNode;
  private turboG: GainNode;
  private whineG: GainNode;
  private squealG: GainNode;
  private lastGear = -1;
  private lastThr = 1;
  private lastT = -1;
  private boost = 0;
  private blipT = -9;
  private blipAmt = 0;
  private endAt = Infinity;

  constructor(readonly c: BaseAudioContext, dest: AudioNode, private noise: AudioBuffer, e: ResolvedEngine) {
    this.e = e;
    const osc = (type: OscillatorType, f: number) => { const o = c.createOscillator(); o.type = type; o.frequency.value = f; return o; };
    const gain = (v: number) => { const g = c.createGain(); g.gain.value = v; return g; };
    const f0 = firingHz(e, 0);
    this.main = c.createOscillator();
    this.main.setPeriodicWave(firingWave(c, e));
    this.main.frequency.value = f0;
    this.sub = osc('triangle', f0 * e.subRatio);
    this.subG = gain(e.sub);
    this.am = gain(1 - e.lope);
    this.lfo = osc('sine', clamp(f0 * e.lopeRatio, 2, 40));
    this.lfoG = gain(e.lope);
    this.pre = gain(0.6);
    const shaper = c.createWaveShaper();
    shaper.curve = shaperCurve(e.drive);
    shaper.oversample = 'none';
    this.lp = c.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.Q.value = e.q;
    this.lp.frequency.value = e.cut[0];
    let tail: AudioNode = this.lp;
    // an upgraded engine has more bite: a presence lift that grows with the engine tier
    for (const [hz, db, q] of [...e.formants, [1800, 6 * e.u, 0.8] as [number, number, number]]) {
      const p = c.createBiquadFilter();
      p.type = 'peaking'; p.frequency.value = hz; p.gain.value = db; p.Q.value = q;
      tail.connect(p); tail = p;
    }
    this.level = gain(0);
    this.shiftG = gain(1);
    this.out = gain(e.gain * 0.32);
    const mainG = gain(1);
    this.main.connect(mainG).connect(this.pre);
    this.sub.connect(this.subG).connect(this.am); // the burble stays clean (driving it would only muddy the bass)
    this.pre.connect(shaper).connect(this.am);
    this.lfo.connect(this.lfoG).connect(this.am.gain);
    // drive first, cam lope after it (so a hard-driven engine keeps its lope)
    this.am.connect(this.lp);
    tail.connect(this.level);
    this.level.connect(this.shiftG).connect(this.out).connect(dest);
    // intake / mechanical noise
    this.noiseSrc = c.createBufferSource();
    this.noiseSrc.buffer = noise; this.noiseSrc.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = e.raspHz; bp.Q.value = 0.8;
    this.raspG = gain(0);
    this.noiseSrc.connect(bp).connect(this.raspG).connect(this.level);
    // turbo whistle and motor whine sit outside the shift envelope (they spin down, not cut)
    this.turboOsc = osc('sine', e.turboHz![0]);
    this.turboG = gain(0);
    this.turboOsc.connect(this.turboG).connect(this.out);
    this.whineOsc = osc('sine', f0 * (e.whineRatio ?? 6));
    this.whineG = gain(0);
    this.whineOsc.connect(this.whineG).connect(this.out);
    // tyre squeal: a wobbling tone plus filtered hiss
    this.squealOsc = osc('triangle', 1050);
    this.vib = osc('sine', 6.5);
    const vibG = gain(45);
    this.vib.connect(vibG).connect(this.squealOsc.frequency);
    this.sqNoise = c.createBufferSource();
    this.sqNoise.buffer = noise; this.sqNoise.loop = true; this.sqNoise.loopStart = 0.31;
    const sqBp = c.createBiquadFilter(); sqBp.type = 'bandpass'; sqBp.frequency.value = 2700; sqBp.Q.value = 3;
    const sqToneG = gain(0.6), sqNoiseG = gain(0.9);
    this.squealG = gain(0);
    this.squealOsc.connect(sqToneG).connect(this.squealG);
    this.sqNoise.connect(sqBp).connect(sqNoiseG).connect(this.squealG);
    this.squealG.connect(dest);
    for (const s of [this.main, this.sub, this.lfo, this.turboOsc, this.whineOsc, this.squealOsc, this.vib, this.noiseSrc, this.sqNoise]) {
      this.srcs.add(s);
      s.addEventListener('ended', () => this.srcs.delete(s));
    }
  }

  start(t = this.c.currentTime) {
    for (const s of this.srcs) s.start(t);
    this.lastSet = t;
    this.level.gain.setValueAtTime(0, t);
    this.level.gain.setTargetAtTime(0.6, t, 0.05);
    return this;
  }

  /** Follow the engine at context time t (call each frame, or ahead of time for a scripted rev). */
  set(s: EngineInput, t = this.c.currentTime) {
    if (this.stopped || t >= this.endAt) return;
    const e = this.e;
    const dt = this.lastT < 0 ? 0.016 : clamp(t - this.lastT, 0, 0.5);
    this.lastT = t;
    this.lastSet = Math.max(this.lastSet, t);
    const thr = clamp(s.throttle);
    if (s.gear !== undefined) {
      if (this.lastGear >= 0 && s.gear > this.lastGear) this.upshift(t);
      else if (this.lastGear >= 0 && s.gear < this.lastGear) this.downshift(t);
      this.lastGear = s.gear;
    }
    const sinceBlip = t - this.blipT;
    const blip = sinceBlip >= 0 && sinceBlip < 0.6 ? this.blipAmt * Math.min(1, sinceBlip / 0.05) * Math.exp(-Math.max(0, sinceBlip - 0.05) / 0.1) : 0;
    const fr = clamp(s.frac + blip, 0, 1.05);
    const f0 = firingHz(e, fr);
    const tc = 0.022;
    this.main.frequency.setTargetAtTime(f0, t, tc);
    this.sub.frequency.setTargetAtTime(f0 * e.subRatio, t, tc);
    this.lfo.frequency.setTargetAtTime(clamp(f0 * e.lopeRatio, 2, 40), t, 0.05);
    const depth = Math.min(0.85, e.lope * (1 - clamp(fr)) ** 1.5 * (1 - 0.4 * thr));
    this.am.gain.setTargetAtTime(1 - depth, t, 0.05);
    this.lfoG.gain.setTargetAtTime(depth, t, 0.05);
    this.subG.gain.setTargetAtTime(e.sub * (1 - 0.6 * clamp(fr)), t, 0.05);
    this.pre.gain.setTargetAtTime(0.45 + 0.9 * thr, t, 0.03);
    const cam = e.vtec && fr > e.vtec ? 1.5 : 1;
    this.lp.frequency.setTargetAtTime(lerp(e.cut[0], e.cut[1], clamp(fr)) * (0.5 + 0.5 * thr) * cam, t, 0.03);
    this.raspG.gain.setTargetAtTime(e.rasp * (0.15 + 0.85 * thr) * (0.3 + 0.7 * clamp(fr)) * cam * 0.5, t, 0.03);
    const stutter = s.limiter ? (Math.floor(t * 30) % 2 ? 0.5 : 1) : 1;
    this.level.gain.setTargetAtTime((0.55 + 0.45 * thr) * (0.75 + 0.35 * clamp(fr)) * stutter, t, s.limiter ? 0.006 : 0.03);
    if (e.misfire && thr < 0.5 && Math.random() < e.misfire * 0.12 * (1 - clamp(fr)) * (dt / 0.016)) this.dip(t, 0.15, 0.045);
    // turbo: spools with load, whistles, and dumps on the lift
    const spool = thr * clamp(fr);
    this.boost += (spool - this.boost) * (1 - Math.exp(-dt / (spool > this.boost ? 0.45 : 0.12)));
    const tb = e.turbo ?? 0;
    if (tb > 0) {
      this.turboOsc.frequency.setTargetAtTime(lerp(e.turboHz![0], e.turboHz![1], this.boost), t, 0.08);
      this.turboG.gain.setTargetAtTime(tb * this.boost ** 2 * 0.06 * (s.nitro ? 1.3 : 1), t, 0.06);
    }
    const lifted = this.lastThr > 0.6 && thr < 0.3;
    if (lifted && tb > 0 && this.boost > 0.3) this.blowOff(t);
    else if (lifted && (e.crackle ?? 0) > 0 && fr > 0.4) this.pops(t + 0.04, 1 + Math.round(2 * (e.crackle ?? 0)));
    this.lastThr = thr;
    if (e.whine) {
      this.whineOsc.frequency.setTargetAtTime(Math.min(9000, f0 * (e.whineRatio ?? 6)), t, tc);
      this.whineG.gain.setTargetAtTime(e.whine * 0.03 * (0.3 + 0.7 * clamp(fr)) * (0.4 + 0.6 * thr) * (s.nitro ? 1.8 : 1), t, 0.05);
    }
    const slip = clamp(s.slip ?? 0);
    this.squealG.gain.setTargetAtTime(0.1 * slip ** 1.2, t, slip > 0.05 ? 0.03 : 0.08);
    this.squealOsc.frequency.setTargetAtTime(950 + 350 * slip, t, 0.1);
  }

  /** Ignition cut, a bark, a blow-off on turbo cars and a crackle on hot engines. */
  upshift(t: number) {
    this.dip(t, 0.28, 0.06);
    this.burst(t, 0.05, 0.22, 420, 'lowpass');
    if ((this.e.turbo ?? 0) > 0.25 && this.boost > 0.3) this.blowOff(t + 0.01);
    if ((this.e.crackle ?? 0) > 0) this.pops(t + 0.03, 1 + Math.round(3 * (this.e.crackle ?? 0)));
  }

  /** Throttle blip on a downshift: a short rev flare and an overrun crackle. */
  downshift(t: number) {
    this.blipT = t;
    this.blipAmt = 0.22;
    this.burst(t, 0.04, 0.12, 900, 'bandpass');
    if ((this.e.crackle ?? 0) > 0) this.pops(t + 0.16, 2 + Math.round(2 * (this.e.crackle ?? 0)));
  }

  /** A rev flare at time t (for scripted revs and the pre-launch). */
  blip(t: number, amt = 0.25) { this.blipT = t; this.blipAmt = amt; }

  private dip(t: number, to: number, hold: number) {
    const g = this.shiftG.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(to, t, 0.006);
    g.setTargetAtTime(1, t + hold, 0.03);
  }

  private track(s: Src, end: number) {
    this.srcs.add(s);
    s.addEventListener('ended', () => this.srcs.delete(s));
    s.stop(Math.min(end, this.endAt));
  }

  private burst(t: number, dur: number, vol: number, hz: number, type: BiquadFilterType) {
    if (this.stopped || t >= this.endAt) return;
    const c = this.c;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = hz;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.out);
    src.start(t, Math.random() * 0.5);
    this.track(src, t + dur + 0.02);
  }

  /** Overrun pops: n short, low bangs spread over a third of a second. */
  pops(t: number, n: number) {
    const lvl = 0.35 + 0.35 * clamp(this.e.crackle ?? 0, 0, 1.2) + 0.2 * this.e.u;
    for (let i = 0; i < n; i++) this.burst(t + Math.random() * 0.32, 0.02 + Math.random() * 0.03, lvl * (0.6 + 0.4 * Math.random()), 600 + Math.random() * 900, 'lowpass');
  }

  /** Turbo blow-off: a falling whoosh (Mako) or a chattering flutter (Vexa). */
  blowOff(t: number) {
    if (this.stopped || t >= this.endAt) return;
    const c = this.c;
    const lvl = 0.12 + 0.18 * clamp(this.e.turbo ?? 0, 0, 1.2) * this.boost;
    this.boost *= 0.3;
    if (this.e.flutter) { for (let k = 0; k < 6; k++) this.burst(t + k * 0.038, 0.028, lvl * (1 - k * 0.12), 2600, 'bandpass'); return; }
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4;
    f.frequency.setValueAtTime(3600, t);
    f.frequency.exponentialRampToValueAtTime(800, t + 0.3);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(lvl, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    src.connect(f).connect(g).connect(this.out);
    src.start(t, Math.random() * 0.4);
    this.track(src, t + 0.36);
  }

  /** Fade out and stop every source (nothing keeps sounding). */
  stop(t = this.c.currentTime, release = 0.2) {
    const end = t + release + 0.05;
    if (this.stopped && end >= this.endAt) return; // an earlier stop (e.g. stopPreview cutting a scripted rev) wins
    const again = this.stopped;
    this.stopped = true;
    this.endAt = end;
    for (const g of [this.out.gain, this.squealG.gain]) { g.cancelScheduledValues(t); g.setTargetAtTime(0, t, Math.max(0.01, release / 4)); }
    for (const s of this.srcs) { try { s.stop(end); } catch { /* not started or already stopped */ } }
    if (again) return;
    this.main.addEventListener('ended', () => { try { this.out.disconnect(); this.squealG.disconnect(); } catch { /* gone */ } });
    this.onStop?.();
  }

  /** Sources not yet ended (for tests). */
  get liveSources() { return this.srcs.size; }
}

/** A keyframe of a scripted rev: [seconds, rpm fraction, throttle, slip?]. Linear in between. */
export type RevKey = [number, number, number, number?];

/** Schedule a whole rev script at 60 Hz starting at t0; returns its end time. */
export function runScript(v: EngineVoice, t0: number, keys: RevKey[], step = 1 / 60): number {
  const end = keys[keys.length - 1][0];
  let k = 0;
  for (let s = 0; s <= end + 1e-6; s += step) {
    while (k < keys.length - 2 && s > keys[k + 1][0]) k++;
    const a = keys[k], b = keys[Math.min(k + 1, keys.length - 1)];
    const w = b[0] > a[0] ? clamp((s - a[0]) / (b[0] - a[0])) : 1;
    v.set({ frac: lerp(a[1], b[1], w), throttle: lerp(a[2], b[2], w), slip: lerp(a[3] ?? 0, b[3] ?? 0, w) }, t0 + s);
  }
  v.lastSet = t0 + end;
  return t0 + end;
}

/** The Mechanic Shop / reveal rev: idle, a quick blip, a long pull to near the limiter, lift with crackle, settle. */
export function showcaseRev(seconds = 2.6): RevKey[] {
  const s = seconds / 2.6;
  return [
    [0, 0.0, 0.1], [0.35 * s, 0.0, 0.1], [0.45 * s, 0.42, 1], [0.6 * s, 0.12, 0], [0.75 * s, 0.1, 0.2],
    [1.55 * s, 0.93, 1], [1.7 * s, 0.95, 1], [1.8 * s, 0.6, 0], [2.3 * s, 0.08, 0.05], [2.6 * s, 0.02, 0.05],
  ];
}
