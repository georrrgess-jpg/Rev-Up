// The race cluster's model (race workstream, 1.10 Redline): per-car dressing, the speedometer range, the shift-window
// marker (shape and words, from the one shift attempt a SHIFT tap is judged on) and the acceleration sweep. Pure: no
// DOM, so the rules are unit-tested (tests/race-cluster.test.ts); src/ui/raceGauge.ts draws them.
import type { CarId } from '../data/tables';
import { RACE, carById } from '../data/tables';
import { drivetrainFor } from '../data/drivetrain';
import { mph as toMph } from '../core/units';
import type { RacerStats, ShiftAttempt } from '../core/race';

export type ShiftCue = 'off' | 'soon' | 'green' | 'late';
/** The acceleration sweep shows the speed gained over this many seconds. */
export const GAIN_S = 0.6;


export type ClusterTier = 'starter' | 'sport' | 'pro' | 'flagship';
export interface ClusterStyle {
  tier: ClusterTier;
  /** Per-car accent (bezel, speed sweep, gear box). */
  accent: string;
  /** Face name shown small under the mph ("RPM ×1000" on sport and up). */
  face: 'plain' | 'numerals' | 'led' | 'gold' | 'volt';
}

const ACCENT: Partial<Record<CarId, string>> = {
  junker: '#ffb347', beater: '#ffb347', hothatch: '#ff6b6b',
  muscle: '#ff8f3a', tourer: '#5fd7c8', tuner: '#ffd23f', rally: '#7fe08a',
  super: '#b98cff', gt: '#4fb8ff', proto: '#ff4fd8', vireo: '#9dff5c', mako: '#ff7a45', ardent: '#ffcf5c', meridian: '#7cc8ff',
  sovereign: '#f3cf7a', tempest: '#5ef2ff',
};
const TIER: Partial<Record<CarId, ClusterTier>> = {
  junker: 'starter', beater: 'starter', hothatch: 'starter',
  muscle: 'sport', tourer: 'sport', tuner: 'sport', rally: 'sport',
  super: 'pro', gt: 'pro', proto: 'pro', vireo: 'pro', mako: 'pro', ardent: 'pro', meridian: 'pro',
  sovereign: 'flagship', tempest: 'flagship',
};

/** How a car's cluster is dressed (the layout never changes). */
export function clusterStyle(car: CarId): ClusterStyle {
  const tier = TIER[car] ?? 'sport';
  const face: ClusterStyle['face'] = car === 'sovereign' ? 'gold' : car === 'tempest' ? 'volt' : tier === 'starter' ? 'plain' : tier === 'sport' ? 'numerals' : 'led';
  return { tier, accent: ACCENT[car] ?? '#8fd3ff', face };
}

/** Speedometer full scale (mph) for this race: the car's top speed on a highway with a Perfect boost's extra reach
 *  (measured runs peak at most ~1.17× the highway top), rounded up to the next 20 and never below 60. Fixed for the
 *  race, so the sweep never rescales when nitro fires; sized from this build, so an early car's dial is not mostly
 *  empty and a big build never pins it. */
export function gaugeRange(car: CarId, stats: RacerStats, perfectMul = carById(car).perfectMul ?? RACE.perfectMul): number {
  const d = drivetrainFor(car);
  const vmax = stats.top * d.topScale * RACE.highwayTopMul * (1 + RACE.nitroTopMul * perfectMul);
  return Math.max(60, Math.ceil(toMph(vmax) / 20) * 20);
}

/** What the shift window looks like this frame — shape and words as well as colour, from the one shift attempt the
 *  SHIFT tap is judged on:
 *  - `none`: no window (top gear, mid-shift, the launch, a boost zone in the practice race).
 *  - `outline`: the window is coming (amber, hollow brackets) — a tap now is early.
 *  - `bracket`: green, filled and bracketed, labelled SHIFT — a tap now is clean.
 *  - `late`: past the window, red, labelled LATE — a tap now is late (the box shifts itself soon).
 *  - `held`: braking (or settling after a downshift): the window stays where it was, dimmed and dashed, BRAKING. */
export type MarkerShape = 'none' | 'outline' | 'bracket' | 'late' | 'held';
export interface ShiftMarker { shape: MarkerShape; band: [number, number]; label: '' | 'SHIFT' | 'LATE' | 'BRAKING' | 'LAUNCH' }

export function shiftMarker(a: Pick<ShiftAttempt, 'cue' | 'band'>, cue: ShiftCue, opts: { launchArmed?: boolean; topGear?: boolean } = {}): ShiftMarker {
  const band: [number, number] = [a.band[0], a.band[1]];
  if (opts.launchArmed) return { shape: cue === 'green' ? 'bracket' : cue === 'soon' ? 'outline' : 'none', band, label: cue === 'green' ? 'LAUNCH' : '' };
  if (a.cue === 'hold' && !opts.topGear) return { shape: 'held', band, label: 'BRAKING' };
  if (cue === 'green') return { shape: 'bracket', band, label: 'SHIFT' };
  if (cue === 'late') return { shape: 'late', band, label: 'LATE' };
  if (cue === 'soon') return { shape: 'outline', band, label: '' };
  return { shape: 'none', band, label: '' };
}

/** Speed gained over the last GAIN_S seconds (mph, ≥ 0): the acceleration sweep. Samples are [time s, mph]. */
export function speedGain(samples: [number, number][], now: number, mphNow: number): number {
  let ref = mphNow;
  for (const [t, v] of samples) if (t >= now - GAIN_S) { ref = v; break; }
  return Math.max(0, mphNow - ref);
}

