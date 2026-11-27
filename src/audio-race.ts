// Race sound: the player's engine follows the live simulation frame by frame, and the race music follows the race.
// Owned by the Audio workstream; the race screen makes one RaceAudio per race and calls frame() every frame.
//
// What it reads from the sim (src/core/race.ts), per frame — RaceSim.audioState() (the Racing workstream's snapshot):
//   rpmFrac → pitch · throttle (0 in a shift cut, braking, after the line) → load, bark, pops, blow-off
//   gear (a change → upshift cut / downshift blip with crackle) · limiter → stutter · slip → tyre squeal
//   nitro → whine and whistle up · launch → an extra chirp off the line · braking at speed → a little tyre scrub
// and position / progress / nitro → music intensity. If the snapshot is missing (an older sim), the same values are
// derived from the racer (rpmFrac, cut, limiterT, braking, nitroLeft, and the launch traction sums).
import { duckEngine, newEngine } from './audio';
import { music } from './audio-api';
import type { EngineVoice, PartLike } from './audio-engine';
import { runScript } from './audio-engine';
import { drivetrainFor } from './data/drivetrain';
import { RACE, trackLength, type CarId } from './data/tables';
import { segmentAt, type RaceSim, type Racer } from './core/race';

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

export class RaceAudio {
  private v: EngineVoice | null = null;
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
    if (!this.v || this.v.stopped || this.done) return;
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

  /** The player crossed the line: lift, coast down to idle and switch off. */
  finish() {
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
    this.v?.stop(undefined, 0.3);
    this.v = null;
  }
}
