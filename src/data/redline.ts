// Rev Up — the Redline Series (1.10; Progression workstream): a five-step late-game challenge chain that ends in an
// original earned car, the Kestrel 1600 R. Each step is a Rival Run (rules in src/core/rivalRuns.ts, steps in
// src/data/rivalRuns.ts) on its own field, asking for a different skill or build choice: clean shifts, the launch,
// the right base car under a part cap, Perfect boosts, then all of it against the car you are racing for.
//
// The series' fields are kept out of EVENTS on purpose: they are never listed in the Race menu, recommended, used as
// the away-earnings yardstick or offered as jobs. Only `eventById` sees them (tables.ts takes one marked line), so
// the race, HUD, scenery and results work as for any event. Pure data with type-only imports (no import cycle).
import type { RaceEvent, Rival } from './tables';

/** Kit Navarro, the Redline Series boss, drives the prototype of the car you are racing for. */
export const REDLINE_RIVALS: Record<string, Rival> = {
  'kit-r': { id: 'kit-r', name: 'Kit Navarro', car: 'kestrelr', paint: '#c2462e', line: 'Built the Kestrel R in her mother’s garage. Hand it to her and she will hand you the keys to the second one.', stats: { top: 74.0, accel: 15.2, grip: 2.62 }, boss: true },
  'sol-r': { id: 'sol-r', name: 'Sol Ortega', car: 'gt', look: 'rv-aster', paint: '#264653', line: 'Still in fifth gear. Now in a GT car.', stats: { top: 70.5, accel: 12.6, grip: 2.25 } },
  'priya-r': { id: 'priya-r', name: 'Priya Nair', car: 'ardent', look: 'rv-wisp', paint: '#c9a227', line: 'Brought a spreadsheet and an Ardent. Knows your gear ratios.', stats: { top: 68.0, accel: 13.0, grip: 2.4 } },
};

const NO_PAY = { cash: [0, 0, 0, 0], rep: [0, 0, 0, 0], crates: [0, 0, 0, 0] };
const step = (e: Omit<RaceEvent, 'payout' | 'firstClear' | 'requires' | 'district'>): RaceEvent =>
  ({ ...e, district: 'summit', payout: NO_PAY, firstClear: { cash: 0, crates: 0 }, requires: {}, rivalShift: 'clean' });

/** The five fields, in step order. Tracks are existing courses; rivals are the usual ones plus the three above. */
export const REDLINE_EVENTS: RaceEvent[] = [
  step({ id: 'rl-shakedown', name: 'Redline 1 · Shakedown', track: 'downtown', rivals: ['jules', 'kai', 'ozzy'],
    blurb: 'The Neon Mile in the car the R is built from. Four corners, every shift counts.' }),
  step({ id: 'rl-holeshot', name: 'Redline 2 · Hole Shot', track: 'dunes', rivals: ['odin', 'yara', 'tomas'],
    blurb: 'Gravel and a long loose launch against rally cars that leave like catapults.' }),
  step({ id: 'rl-stock', name: 'Redline 3 · Stock R', track: 'skyline', rivals: ['mina', 'rhea', 'ozzy'],
    blurb: 'Every part runs as T6: the base car decides it. Sweepers, then a tight exit.' }),
  step({ id: 'rl-apex', name: 'Redline 4 · Apex Hunt', track: 'pass', rivals: ['mirelle', 'kenji', 'nova3'],
    blurb: 'Three fast sweepers above the snow line. The boost zones sit on each exit.' }),
  step({ id: 'rl-final', name: 'Redline Final', track: 'summit', rivals: ['sol-r', 'priya-r', 'kit-r'],
    blurb: 'The full Summit Circuit against Kit Navarro in the Kestrel 1600 R prototype.' }),
];
