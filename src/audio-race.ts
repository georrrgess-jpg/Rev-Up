// Race sound: the player's engine follows the live simulation frame by frame, and the race music follows the race.
// Owned by the Audio workstream; the race screen makes one RaceAudio per race and calls frame() every frame.
//
// What it reads from the sim (src/core/race.ts), per frame — RaceSim.audioState() (the Racing workstream's snapshot):
//   rpmFrac → pitch · throttle (0 in a shift cut, braking, after the line) → load, bark, pops, blow-off
//   gear (a change → upshift cut / downshift blip with crackle) · limiter → stutter · slip → tyre squeal
//   nitro → whine and whistle up · launch → an extra chirp off the line · braking at speed → a little tyre scrub
// and position / progress / nitro → music intensity. If the snapshot is missing (an older sim), the same values are
// derived from the racer (rpmFrac, cut, limiterT, braking, nitroLeft, and the launch traction sums).
import { duckEngine, isMuted, live, newEngine, noise, tone } from './audio';
import { music } from './audio-api';
import type { EngineVoice, PartLike } from './audio-engine';
import { EngineVoice as Voice, resolveEngine, runScript } from './audio-engine';
import { drivetrainFor } from './data/drivetrain';
import { RACE, trackLength, type CarId } from './data/tables';
import { segmentAt, type RaceSim, type Racer } from './core/race';
import { rivalLook } from './data/rivalCars';
import { nitroEnvelope, nitroStyleOf, type NitroSoundKind } from './ui/nitroSequence';

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));

/** The audio snapshot of one frame. */
export interface RaceAudioFrame { frac: number; throttle: number; gear: number; slip: number; nitro: boolean; limiter: boolean }

/** The subset of RaceSim.audioState() this file reads (structural, so a renamed extra field never breaks it). */
interface SimAudio { rpmFrac: number; throttle: number; gear: number; limiter: boolean; slip: number; nitro: boolean; launch: boolean; braking: boolean; v: number }

/** Wheelspin 0..1 on the launch segment, from the same traction sums the sim uses (raw turbo pull vs grip). */
export function launchSlip(sim: RaceSim, p: Racer): number {
  const seg = segmentAt(sim.track, p.x).seg;
  if (seg.type !== 'launch') return 0;
  const d = drivetrainFor(p.car);
  let accel = p.stats.accel * d.accelScale;
  if (p.nitroLeft > 0) accel += RACE.nitroAccel * p.nitroMul;
  const raw = accel * RACE.launchTurboMul;
  const traction = p.stats.grip * RACE.tractionG * d.accelScale;
  const spin = raw > traction ? (raw - traction) / raw : 0;
  return clamp(Math.max(launchChirp(p.v), spin * 2.2 * clamp(1 - p.v / 30)));
}
/** Every launch chirps for the first few metres, even without real wheelspin. */
const launchChirp = (v: number) => 0.45 * clamp(1 - v / 9);

export function readFrame(sim: RaceSim, p: Racer = sim.player): RaceAudioFrame {
  const snap = (sim as unknown as { audioState?: () => SimAudio }).audioState?.();
  if (snap) {
    return {
      frac: snap.rpmFrac, throttle: snap.throttle, gear: snap.gear, nitro: snap.nitro, limiter: snap.limiter,
      slip: clamp(Math.max(snap.slip, snap.launch ? launchChirp(snap.v) : 0, snap.braking && snap.v > 22 ? 0.22 : 0)),
    };
  }
  const scrub = p.braking && p.v > 22 ? 0.22 : 0;
  return {
    frac: sim.rpmFrac(p),
    throttle: p.cut > 0 || p.finishTime !== null ? 0 : p.braking ? 0.15 : 1,
    gear: p.gear,
    slip: Math.max(launchSlip(sim, p), scrub),
    nitro: p.nitroLeft > 0,
    limiter: p.limiterT > 0,
  };
}

/**
 * The nitro sequence's sound (Redline): an ignition per car type the moment the sim accepts a boost, then a sustained
 * layer whose level follows the same envelope as the picture (nitroEnvelope of the sim's nitroLeft), so it swells,
 * holds and dies away exactly with the boost. Combustion cars roar (low filtered rush and a rumble pitched to the
 * engine), the light-trail hybrids jet (a rising band-passed whoosh and a glassy tone), the Tempest whines (rising
 * motor tone and crackle). A Perfect boost brightens the sustain and adds its own sting: a fast gold triad
 * (C6 E6 G6 C7), pitched clear of the shift light (1320 Hz) and the boost-zone beep (988 Hz).
 */
export class NitroSound {
  private n: { src: AudioBufferSourceNode; osc: OscillatorNode; f: BiquadFilterNode; g: GainNode; base: number } | null = null;
  /** The level last set (tests read it). */
  level = 0;

  /** Ignition + sustain for a boost the sim just accepted. */
  start(car: string, perfect: boolean) {
    this.stop(0.03);
    const L = live();
    if (!L || isMuted()) return;
    const st = nitroStyleOf(car);
    try {
      ignition(st.sound, st.pitch, perfect);
      const { ctx: c, mix, noise: buf } = L;
      const t = c.currentTime;
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = c.createBiquadFilter();
      const osc = c.createOscillator();
      const og = c.createGain();
      const g = c.createGain();
      const bright = perfect ? 1.4 : 1;
      let base = 0.11;
      if (st.sound === 'roar') {
        f.type = 'lowpass'; f.frequency.value = 900 * st.pitch * bright; f.Q.value = 0.9;
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(48 * st.pitch, t); osc.frequency.linearRampToValueAtTime(64 * st.pitch * bright, t + 1.2); og.gain.value = 0.5;
      } else if (st.sound === 'jet') {
        f.type = 'bandpass'; f.frequency.setValueAtTime(900 * st.pitch, t); f.frequency.exponentialRampToValueAtTime(2400 * st.pitch * bright, t + 1.2); f.Q.value = 1.4;
        osc.type = 'triangle'; osc.frequency.setValueAtTime(520 * st.pitch, t); osc.frequency.exponentialRampToValueAtTime(880 * st.pitch * bright, t + 1.2); og.gain.value = 0.18;
        base = 0.09;
      } else {
        f.type = 'highpass'; f.frequency.value = 3200; f.Q.value = 0.7;
        osc.type = 'sine'; osc.frequency.setValueAtTime(700 * st.pitch, t); osc.frequency.exponentialRampToValueAtTime(1900 * st.pitch * bright, t + 1.4); og.gain.value = 0.55;
        base = 0.07;
      }
      g.gain.setValueAtTime(0.0001, t);
      src.connect(f); osc.connect(og).connect(f); f.connect(g).connect(mix.sfx);
      src.start(t); osc.start(t);
      this.n = { src, osc, f, g, base: base * (perfect ? 1.25 : 1) };
    } catch { this.stop(); }
  }

  /** Follow the boost envelope (0..1). */
  set(level: number) {
    this.level = level;
    const n = this.n;
    if (!n) return;
    try { n.g.gain.setTargetAtTime(Math.max(0.0001, n.base * level), n.g.context.currentTime, 0.03); } catch { /* optional */ }
  }

  /** Fade out and release (the boost ended, the line, pause-and-leave, retry, close). */
  stop(fade = 0.08) {
    this.level = 0;
    const n = this.n;
    this.n = null;
    if (!n) return;
    try {
      const t = n.g.context.currentTime;
      n.g.gain.cancelScheduledValues(t);
      n.g.gain.setTargetAtTime(0.0001, t, fade / 3);
      n.src.stop(t + fade + 0.05); n.osc.stop(t + fade + 0.05);
    } catch { /* already stopped */ }
  }

  get playing() { return !!this.n; }
}

/** The ignition: a whoomp per car type; a Perfect boost adds its sting. */
function ignition(kind: NitroSoundKind, pitch: number, perfect: boolean) {
  if (kind === 'roar') {
    noise(0.45, perfect ? 0.42 : 0.32, 0, 700 * pitch, 'lowpass');
    tone(110 * pitch, 0.32, 'sine', 0.2, 0, 42 * pitch);
    tone(70 * pitch, 0.5, 'sawtooth', 0.06, 0.02, 120 * pitch);
  } else if (kind === 'jet') {
    noise(0.6, perfect ? 0.34 : 0.26, 0, 1800 * pitch, 'bandpass');
    tone(330 * pitch, 0.5, 'triangle', 0.08, 0, 990 * pitch);
    tone(90, 0.25, 'sine', 0.14, 0, 50);
  } else {
    tone(240, 0.6, 'sawtooth', 0.05, 0, 2400);
    tone(480, 0.5, 'sine', 0.08, 0.01, 3000);
    for (let i = 0; i < 4; i++) noise(0.03, 0.18, 0.04 + i * 0.07, 5200, 'highpass'); // crackle of current
    tone(90, 0.22, 'sine', 0.12, 0, 55);
  }
  if (perfect) [1046, 1318, 1568, 2093].forEach((f, i) => tone(f, 0.28 - i * 0.03, 'sine', 0.085, 0.03 + i * 0.045));
}

export class RaceAudio {
  private v: EngineVoice | null = null;
  /** The nitro layer (ignition + sustain), driven from frame(). */
  readonly nitro = new NitroSound();
  private nitroSeen = 0;
  private lastIntensity = -1;
  private lastIntensityT = 0;
  private done = false;

  constructor(private sim: RaceSim, private fitted?: { engine?: PartLike | null; turbo?: PartLike | null }) {}

  /** Engine on, staged for the countdown (pre-launch revs), and the race arrangement. */
  start(countdownS = 2.4) {
    music.play('race');
    music.setIntensity(0.3);
    try {
      this.v = newEngine(this.sim.player.car as CarId, this.fitted?.engine, this.fitted?.turbo);
      if (!this.v) return;
      const c = this.v.c;
      const t = c.currentTime + 0.02;
      this.v.start(t);
      // staging: idle, two blips on the count, then hold the launch revs for GO
      const s = countdownS / 2.4;
      runScript(this.v, t, [[0, 0, 0.1], [0.5 * s, 0, 0.1], [0.62 * s, 0.45, 1], [0.8 * s, 0.1, 0], [1.3 * s, 0.1, 0.2], [1.42 * s, 0.5, 1], [1.6 * s, 0.25, 0.4],
        [2.0 * s, 0.58, 1], [countdownS, 0.62, 1]]);
      this.v.watched = true;
    } catch { this.stop(); }
  }

  /** Every frame while the race runs (the sim stepped this frame). */
  frame() {
    if (this.done) return;
    this.nitroFrame();
    if (!this.v || this.v.stopped) return;
    try {
      const f = readFrame(this.sim);
      this.v.set(f);
      const p = this.sim.player;
      const now = performance.now();
      if (now - this.lastIntensityT > 250) {
        this.lastIntensityT = now;
        const prog = clamp(p.x / Math.max(1, trackLength(this.sim.track)));
        const place = this.sim.standings().indexOf(p);
        const x = clamp(0.3 + 0.35 * prog + (prog > 0.85 ? 0.15 : 0) + (f.nitro ? 0.2 : 0) + (place === 0 ? 0.08 : 0));
        if (Math.abs(x - this.lastIntensity) > 0.04) { this.lastIntensity = x; music.setIntensity(x); }
      }
    } catch { this.stop(); }
  }

  /** The nitro layer from the sim's boost state: ignition on the step a boost is accepted, sustain on its envelope. */
  private nitroFrame() {
    const p = this.sim.player;
    if (this.sim.nitroUsed !== this.nitroSeen) {
      this.nitroSeen = this.sim.nitroUsed;
      if (p.nitroLeft > 0) this.nitro.start(p.car, p.nitroMul > 1);
    }
    const lvl = p.finishTime === null ? nitroEnvelope(p.nitroLeft) : 0;
    if (lvl > 0) this.nitro.set(lvl);
    else if (this.nitro.playing) this.nitro.stop();
  }

  /** The player crossed the line: lift, coast down to idle and switch off. */
  finish() {
    this.nitro.stop(0.2);
    if (!this.v || this.v.stopped || this.done) return;
    this.done = true;
    try {
      const c = this.v.c;
      const t = c.currentTime + 0.01;
      const f = clamp(this.sim.rpmFrac(this.sim.player));
      const end = runScript(this.v, t, [[0, f, 1], [0.05, f, 0], [1.4, 0.25, 0.05], [2.6, 0.02, 0.05]]);
      this.v.stop(end, 0.6);
    } catch { this.stop(); }
  }

  /** Cue-duck helper for screens that play their own timing beep. */
  duck() { duckEngine(); }

  /** Race over, left or paused for good: nothing keeps sounding. */
  stop() {
    this.nitro.stop(0.05);
    this.v?.stop(undefined, 0.3);
    this.v = null;
  }
}

/** The Tempest E4's launch-control signature: a rising four-motor whine and a crackle of current on GO. */
export function launchControlSound() {
  try {
    tone(220, 0.75, 'sawtooth', 0.07, 0, 2600);
    tone(330, 0.7, 'sine', 0.09, 0.02, 3300);
    tone(1760, 0.12, 'square', 0.04, 0.05, 880);
  } catch { /* sound is optional */ }
}

/**
 * Rival engines: the two rivals nearest the player each get their own engine voice (the same synth as the player's,
 * voiced for their car), panned by where they are on screen (ahead: right) and faded in and out with distance, so a
 * car coming past is heard before it is seen and fades as it pulls away. Always well under the player's engine
 * (at most RIVAL_LEVEL of it) on the same engine bus, so the mix, the cue ducking and the limiter stay as they are.
 */
export const RIVAL_LEVEL = 0.34;
export class RivalAudio {
  private voices = new Map<string, { v: Voice; g: GainNode; pan: StereoPannerNode; quiet: number }>();
  private stopped = false;
  constructor(private sim: RaceSim, private max = 2, private reach = 55) {}

  /** Every frame while racing (after the sim stepped). */
  frame() {
    if (this.stopped) return;
    const L = live();
    if (!L || isMuted() || L.ctx.state !== 'running') return;
    try {
      const c = L.ctx;
      const t = c.currentTime;
      const p = this.sim.player;
      const near = this.sim.racers.filter((r) => !r.isPlayer && Math.abs(r.x - p.x) < this.reach)
        .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x)).slice(0, this.max);
      const want = new Set(near.map((r) => r.id));
      for (const r of near) {
        let e = this.voices.get(r.id);
        if (!e) {
          const g = c.createGain(); g.gain.value = 0;
          const pan = c.createStereoPanner();
          g.connect(pan).connect(L.mix.engine);
          const v = new Voice(c, g, L.noise, resolveEngine(r.car, null, null, rivalLook(r.look)?.voice)); // a rival's look has its own voice
          v.start(t);
          e = { v, g, pan, quiet: 0 };
          this.voices.set(r.id, e);
        }
        e.quiet = 0;
        const dx = r.x - p.x;
        const k = clamp(1 - Math.abs(dx) / this.reach);
        e.g.gain.setTargetAtTime(RIVAL_LEVEL * k ** 1.6, t, 0.06);
        e.pan.pan.setTargetAtTime(clamp(dx / 28, -0.85, 0.85), t, 0.08);
        e.v.set({
          frac: clamp(this.sim.rpmFrac(r), 0, 1.02),
          throttle: r.finishTime !== null || r.cut > 0 || r.braking ? 0 : r.limiterT > 0 ? 0.6 : 1,
          gear: r.gear, slip: r.slip, nitro: r.nitroLeft > 0, limiter: r.limiterT > 0,
        }, t);
      }
      for (const [id, e] of this.voices) {
        if (want.has(id)) continue;
        e.g.gain.setTargetAtTime(0, t, 0.08);
        if (++e.quiet > 30) { e.v.stop(t, 0.1); this.voices.delete(id); }
        else e.v.set({ frac: 0.5, throttle: 0.5 }, t);
      }
    } catch { this.stop(); }
  }

  /** Race over or left: every rival voice fades out. */
  stop() {
    this.stopped = true;
    const L = live();
    for (const e of this.voices.values()) { try { e.g.gain.setTargetAtTime(0, L?.ctx.currentTime ?? 0, 0.1); e.v.stop(undefined, 0.3); } catch { /* gone */ } }
    this.voices.clear();
  }
  /** Rival voices sounding now (tests and the perf check). */
  get count() { return this.voices.size; }
}
