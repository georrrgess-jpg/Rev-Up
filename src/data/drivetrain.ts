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
  /** Seconds of torque cut for a clean shift (a sequential box is quicker than a tired H-pattern). */
  shiftS: number;
  /** Speedometer full scale (mph). Grows with the car. */
  gaugeMph: number;
  /** Calibration of a car's stat line into the sim's physical units (metres, m/s): the physical top speed is
   *  stats.top × topScale and the low-speed pull stats.accel × accelScale. Tuned so full builds reach the
   *  roster benchmarks (docs/CONTRACTS.md) while races keep their length (~12–25 s). */
  topScale: number;
  accelScale: number;
}

/** Display / reference values for the roster at full build (docs/CONTRACTS.md). */
export const BENCHMARK_MPH: Partial<Record<CarId, number>> = {
  junker: 85, beater: 105, hothatch: 130, muscle: 150, tourer: 165, tuner: 140, super: 205, rally: 150, gt: 190, proto: 225,
};

export const DRIVETRAINS: Record<CarId, Drivetrain> = {
  // Tapeback 1.1: a tired four-speed. Slow shifts, narrow band, it bogs if you short-shift.
  junker: { gears: [0.36, 0.58, 0.82, 1.3], idle: 850, redline: 6200, band: [0.8, 0.95], shiftS: 0.06, gaugeMph: 100, topScale: 0.925, accelScale: 1.275 },
  // Corsa Rojo: five-speed sedan box, honest and forgiving.
  beater: { gears: [0.3, 0.48, 0.66, 0.86, 1.3], idle: 800, redline: 6500, band: [0.78, 0.95], shiftS: 0.055, gaugeMph: 120, topScale: 1.075, accelScale: 0.975 },
  // Vexa GTi: short-geared five-speed that wants to live near the limiter.
  hothatch: { gears: [0.29, 0.46, 0.63, 0.82, 1.3], idle: 900, redline: 7400, band: [0.82, 0.96], shiftS: 0.045, gaugeMph: 150, topScale: 1.225, accelScale: 0.875 },
  // Ironhorse 455: big V8, long gears, low redline. Fewer shifts, each one matters.
  muscle: { gears: [0.33, 0.54, 0.77, 1.3], idle: 700, redline: 5800, band: [0.76, 0.94], shiftS: 0.06, gaugeMph: 170, topScale: 1.225, accelScale: 0.925 },
  // Altamar GT: long-legged five-speed grand tourer, tall top gear.
  tourer: { gears: [0.3, 0.47, 0.65, 0.86, 1.3], idle: 750, redline: 6800, band: [0.78, 0.95], shiftS: 0.045, gaugeMph: 190, topScale: 1.175, accelScale: 0.925 },
  // Kestrel 1600: a screaming four that lives high on the tach; a narrow band, quick shifts.
  tuner: { gears: [0.44, 0.66, 0.86, 1.3], idle: 1100, redline: 9000, band: [0.86, 0.97], shiftS: 0.035, gaugeMph: 160, topScale: 0.95, accelScale: 1.15 },
  // Lumen RS: six-speed dual clutch; quick shifts, wide band.
  super: { gears: [0.28, 0.43, 0.58, 0.74, 0.92, 1.3], idle: 1000, redline: 9200, band: [0.8, 0.96], shiftS: 0.025, gaugeMph: 240, topScale: 1.65, accelScale: 0.8 },
  // Corvo Rally: five-speed AWD gearing; quick to its (modest) top speed.
  rally: { gears: [0.36, 0.56, 0.76, 0.96, 1.3], idle: 950, redline: 7800, band: [0.8, 0.95], shiftS: 0.035, gaugeMph: 170, topScale: 0.85, accelScale: 1.325 },
  // Strata GTR: five-speed sequential endurance box.
  gt: { gears: [0.32, 0.5, 0.67, 0.84, 1.3], idle: 1000, redline: 8600, band: [0.82, 0.96], shiftS: 0.025, gaugeMph: 220, topScale: 1.05, accelScale: 1.025 },
  // Halcyon X: six-speed paddle box with the narrowest band in the game — the hardest car to master.
  proto: { gears: [0.3, 0.48, 0.64, 0.79, 0.93, 1.3], idle: 1200, redline: 11000, band: [0.88, 0.97], shiftS: 0.02, gaugeMph: 260, topScale: 1.025, accelScale: 1.025 },
  // Legacy placeholder id kept for old data.
  hyper: { gears: [0.25, 0.38, 0.5, 0.62, 0.75, 0.9, 1.3], idle: 1000, redline: 9200, band: [0.8, 0.96], shiftS: 0.025, gaugeMph: 260, topScale: 1.65, accelScale: 0.8 },
};

export const drivetrainFor = (car: CarId): Drivetrain => DRIVETRAINS[car] ?? DRIVETRAINS.beater;
