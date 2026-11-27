// Rev Up — per-car drivetrain: gearing, tach and the calibration that turns a car's stat line into believable speed.
// Owned by the race workstream (docs/CONTRACTS.md). Car stats (top / accel / grip) are D's tables; this file says
// how each car turns them into motion, how many gears it has, where the green shift band sits on its tach and
// how far its speedometer reads.
import type { CarId } from './tables';

export interface Drivetrain {
  /** Speed at the redline in each gear, as a fraction of the car's calibrated top speed. The last gear is tall
   *  enough that the car runs out of road (drag), not revs; the first is long enough to make a launch. */
  gears: number[];
  /** Tach: idle and redline rpm (display and sound only; the sim works in fractions of the redline). */
  idle: number;
  redline: number;
  /** Green shift band as fractions of the redline. Shifting inside it lands the next gear in the power. */
  band: [number, number];
  /** Seconds the green shift window stays open on every upshift (the window's low edge is set from how fast this
   *  car's needle climbs in that gear, so a quick first gear gets a wider arc and a slow top gear the plain band). */
  windowS?: number;
  /** Seconds on the limiter before the box shifts itself when the player misses (default SHIFT.autoDelay). A quick
   *  sequential box with short gears gives up sooner, so a car with many shifts never piles up misses. */
  autoS?: number;
  /** Engine pull below the power band as a share of peak (default 0.72): a turbo midrange keeps pulling when you
   *  short-shift, a peaky engine bogs. */
  lowPull?: number;
  /** Seconds of torque cut for a clean shift (a sequential box is quicker than a tired H-pattern). */
  shiftS: number;
  /** Speedometer full scale (mph). Grows with the car. */
  gaugeMph: number;
  /** Calibration of a car's stat line into the sim's physical units (metres, m/s): the physical top speed is
   *  stats.top × topScale and the low-speed pull stats.accel × accelScale. Tuned so full builds reach the
   *  roster benchmarks (docs/CONTRACTS.md) while races keep their length (~12–25 s). */
  topScale: number;
  accelScale: number;
  /** How the pull fades toward top speed (aero drag against power): higher keeps pulling hard until close to the
   *  top. Default 2. */
  pullExp?: number;
}

/** Display / reference values for the roster at full build (docs/CONTRACTS.md). */
export const BENCHMARK_MPH: Partial<Record<CarId, number>> = {
  junker: 85, beater: 105, hothatch: 130, muscle: 150, tourer: 165, tuner: 140, super: 205, rally: 150, gt: 190, proto: 225, vireo: 230, mako: 240, sovereign: 255, ardent: 200, meridian: 250, tempest: 270,
};

export const DRIVETRAINS: Record<CarId, Drivetrain> = {
  // Tapeback 1.1: a tired four-speed. Slow shifts, narrow band, it bogs if you short-shift.
  junker: { windowS: 0.5, gears: [0.36, 0.58, 0.82, 1.3], idle: 850, redline: 6200, band: [0.8, 0.95], shiftS: 0.06, gaugeMph: 100, topScale: 0.925, accelScale: 1.225 },
  // Corsa Rojo: five-speed sedan box, honest and forgiving.
  beater: { windowS: 0.5, gears: [0.3, 0.48, 0.66, 0.86, 1.3], idle: 800, redline: 6500, band: [0.78, 0.95], shiftS: 0.055, gaugeMph: 120, topScale: 1.075, accelScale: 0.95 },
  // Vexa GTi: short-geared five-speed that wants to live near the limiter.
  hothatch: { windowS: 0.5, gears: [0.29, 0.46, 0.63, 0.82, 1.3], idle: 900, redline: 7400, band: [0.82, 0.96], shiftS: 0.045, gaugeMph: 150, topScale: 1.225, accelScale: 0.875 },
  // Ironhorse 455: big V8, long gears, low redline. Fewer shifts, each one matters.
  muscle: { gears: [0.33, 0.54, 0.77, 1.3], idle: 700, redline: 5800, band: [0.76, 0.94], shiftS: 0.06, gaugeMph: 170, topScale: 1.225, accelScale: 0.9 },
  // Altamar GT: long-legged five-speed grand tourer, tall top gear.
  tourer: { gears: [0.3, 0.47, 0.65, 0.86, 1.3], idle: 750, redline: 6800, band: [0.78, 0.95], shiftS: 0.045, gaugeMph: 190, topScale: 1.1, accelScale: 0.95, pullExp: 2.5 },
  // Kestrel 1600: a screaming four that lives high on the tach; a narrow band, quick shifts.
  tuner: { gears: [0.44, 0.66, 0.86, 1.3], idle: 1100, redline: 9000, band: [0.86, 0.97], shiftS: 0.035, gaugeMph: 160, topScale: 0.925, accelScale: 1.175 },
  // Lumen RS: six-speed dual clutch; quick shifts, wide band.
  super: { gears: [0.28, 0.43, 0.58, 0.74, 0.92, 1.3], idle: 1000, redline: 9200, band: [0.8, 0.96], shiftS: 0.025, gaugeMph: 240, topScale: 1.625, accelScale: 0.8 },
  // Corvo Rally: five-speed AWD gearing; quick to its (modest) top speed.
  rally: { gears: [0.36, 0.56, 0.76, 0.96, 1.3], idle: 950, redline: 7800, band: [0.8, 0.95], shiftS: 0.035, gaugeMph: 170, topScale: 1.08, accelScale: 0.95, pullExp: 3 },
  // Strata GTR: five-speed sequential endurance box.
  gt: { gears: [0.32, 0.5, 0.67, 0.84, 1.3], idle: 1000, redline: 8600, band: [0.82, 0.96], shiftS: 0.025, gaugeMph: 220, topScale: 1.2, accelScale: 0.8, pullExp: 2.5 },
  // Halcyon X: six-speed paddle box with the narrowest band in the game — the hardest car to master.
  proto: { gears: [0.3, 0.48, 0.64, 0.79, 0.93, 1.3], idle: 1200, redline: 11000, band: [0.88, 0.97], shiftS: 0.02, gaugeMph: 260, topScale: 1.29, accelScale: 0.8, pullExp: 2.6 },
  // 1.8 supercars (placeholders; the progression and racing agents tune these).
  // Vireo 9R: a light, screaming V10 with short, close gears: the needle flies, the band sits high on the tach, shifts
  // come thick and fast and the box is quick to cover a miss (short limiter grace) — rewards a sharp thumb.
  vireo: { gears: [0.25, 0.37, 0.49, 0.61, 0.74, 0.88, 1.3], idle: 1400, redline: 11400, band: [0.86, 0.975], shiftS: 0.016, autoS: 0.3, lowPull: 0.82, gaugeMph: 260, topScale: 1.22, accelScale: 0.82, pullExp: 2.5 },
  // Mako TT: twin-turbo V8 with a fat midrange: the widest band of the supercars and pull well below it, so a short
  // shift barely hurts and it shoves hard out of every corner; a lower redline and wider-spaced gears.
  mako: { gears: [0.31, 0.49, 0.65, 0.8, 0.94, 1.3], idle: 900, redline: 7800, band: [0.68, 0.95], shiftS: 0.025, lowPull: 0.9, gaugeMph: 270, topScale: 1.3, accelScale: 1.12, pullExp: 2.3 },
  // Sovereign: the long-legged flagship V12 hybrid: six tall gears that each pull for a long time (fewer shifts, each
  // one worth more), the highest top speed in the game and the biggest speedometer.
  sovereign: { gears: [0.33, 0.5, 0.66, 0.81, 0.95, 1.3], idle: 900, redline: 8800, band: [0.8, 0.96], shiftS: 0.018, gaugeMph: 290, topScale: 1.34, accelScale: 0.95, pullExp: 2.7 },
  // 1.9 Circuit supercars (placeholders; the Racing agent tunes gearing, Progression tunes topScale/accelScale).
  // Ardent Spyder: a featherweight open-top track car; short gears, a screaming four, the best grip-to-weight.
  ardent: { gears: [0.34, 0.5, 0.65, 0.8, 0.94, 1.3], idle: 1200, redline: 9800, band: [0.84, 0.97], shiftS: 0.022, gaugeMph: 220, topScale: 1.12, accelScale: 1.0, pullExp: 2.4 },
  // Meridian LT: a long-tail highway missile; tall gears, the best top end for its tier.
  meridian: { gears: [0.3, 0.46, 0.61, 0.76, 0.9, 1.3], idle: 850, redline: 8200, band: [0.8, 0.96], shiftS: 0.02, gaugeMph: 280, topScale: 1.38, accelScale: 0.8, pullExp: 2.8 },
  // Tempest E4: quad-motor electric flagship; a violent launch, a three-speed box (two shifts), silent top end.
  tempest: { gears: [0.42, 0.72, 1.3], idle: 600, redline: 14000, band: [0.82, 0.97], shiftS: 0.015, gaugeMph: 300, topScale: 1.4, accelScale: 0.9, pullExp: 2.6 },
  // Legacy placeholder id kept for old data.
  hyper: { gears: [0.25, 0.38, 0.5, 0.62, 0.75, 0.9, 1.3], idle: 1000, redline: 9200, band: [0.8, 0.96], shiftS: 0.025, gaugeMph: 260, topScale: 1.625, accelScale: 0.8 },
};

export const drivetrainFor = (car: CarId): Drivetrain => DRIVETRAINS[car] ?? DRIVETRAINS.beater;
