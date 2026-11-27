// Rev Up — the Circuit update's competition data (owned by the Racing and competition workstream): three new
// courses, the rival ladder (named opponents, the car each drives, where they are fast and why, and the prize for
// beating them), the Heritage Cup class series that brings earlier cars back, personal-best ghost time trials, and the
// skill milestones that pay once. Pure data with type-only imports, so src/data/tables.ts can spread it into its
// tables without an import cycle (TRACKS, RIVALS and EVENTS each take one marked spread line).
import type { CarId, Family, RaceEvent, Rival, Track } from './tables';

// ---------------------------------------------------------------- courses

/** Track ids added by this file (cast to Track['id'] so the shared union in tables.ts stays as it is). */
export type CircuitTrackId = 'esplanade' | 'causeway' | 'airstrip';
const T = (id: CircuitTrackId) => id as unknown as Track['id'];

/**
 * Three courses with different demands: the Esplanade asks for grip (two chicanes and a hairpin, nothing longer than
 * 120 m), the Causeway for top speed (two half-kilometre straights over the lagoon) and the Airfield for the launch
 * (a 250 m standing start where traction and acceleration decide it, then one taxiway turn).
 */
export const CIRCUIT_TRACKS: Record<CircuitTrackId, Track> = {
  esplanade: {
    id: T('esplanade'), name: 'Harbour Esplanade', district: 'riviera', theme: 'coast',
    course: 'Street circuit · two chicanes and a hairpin', favours: 'Grip and a light car through every corner',
    segments: [
      { type: 'launch', length: 70 },
      { type: 'bend', length: 50, radius: 30 },
      { type: 'straight', length: 95, window: [0.05, 0.45] },
      { type: 'bend', length: 45, radius: 21 },
      { type: 'straight', length: 75 },
      { type: 'bend', length: 40, radius: 33 },
      { type: 'straight', length: 110, window: [0.05, 0.42] },
      { type: 'bend', length: 45, radius: 27 },
      { type: 'straight', length: 120, window: [0.04, 0.4] },
    ],
  },
  causeway: {
    id: T('causeway'), name: 'Lagoon Causeway', district: 'riviera', theme: 'coast',
    course: 'Causeway · two long straights over the water, one fast kink', favours: 'Top speed: tall gears and a strong engine',
    segments: [
      { type: 'launch', length: 80 },
      { type: 'highway', length: 480, window: [0.1, 0.36] },
      { type: 'hwbend', length: 150, radius: 650 },
      { type: 'highway', length: 520, window: [0.08, 0.34] },
    ],
  },
  airstrip: {
    id: T('airstrip'), name: 'Airfield Sprint', district: 'desert', theme: 'desert',
    course: 'Runway drag · a 250 m launch, one taxiway turn', favours: 'The launch: traction and acceleration off the line',
    segments: [
      { type: 'launch', length: 250 },
      { type: 'straight', length: 200, window: [0.06, 0.45] },
      { type: 'bend', length: 60, radius: 60 },
      { type: 'highway', length: 300, window: [0.06, 0.4] },
    ],
  },
};

// ---------------------------------------------------------------- rivals

/** A ladder opponent's identity: where they are fast and why (shown on the ladder and in race briefs). */
export interface RivalProfile { strength: string; home: string }

/** New rivals (and returning characters with new cars or builds). Stats are the event's final pace. */
export const CIRCUIT_RIVALS: Record<string, Rival> = {
  // ---- Esplanade Grand Prix (Ardent Spyder rung)
  mika: { id: 'mika', name: 'Mika Sorel', car: 'ardent', paint: '#ff5a1f', line: 'Has driven the Esplanade’s chicanes a thousand times in her head. Never touches a kerb.', stats: { top: 71.0, accel: 14.6, grip: 2.68 } },
  pia: { id: 'pia', name: 'Pia Lund', car: 'ardent', paint: '#f4f1e6', line: 'Club racer with a carbon tub and a notebook of braking points.', stats: { top: 70.0, accel: 14.2, grip: 2.6 } },
  anouk2: { id: 'anouk2', name: 'Anouk Vidal', car: 'vireo', paint: '#f2f0e6', line: 'Brought her Vireo down from the Corniche. Brakes where everyone else lifts.', stats: { top: 78.0, accel: 15.0, grip: 2.55 } },
  // ---- Causeway Run (Meridian LT rung)
  lorne: { id: 'lorne', name: 'Lorne Halvard', car: 'meridian', paint: '#1f4fc4', line: 'Runs the causeway at dawn to beat the fishing boats out. Hasn’t lifted since the bridge opened.', stats: { top: 91.0, accel: 15.6, grip: 2.5 } },
  teo2: { id: 'teo2', name: 'Teo Marchand', car: 'mako', paint: '#3a3f47', line: 'Twin turbos, a longer top gear, the same one speed: all of it.', stats: { top: 84.0, accel: 16.2, grip: 2.5 } },
  aurelia2: { id: 'aurelia2', name: 'Aurelia Stern', car: 'sovereign', paint: '#0d0d12', line: 'Lost the Grand Riviera to you. Wants it back over open water.', stats: { top: 86.0, accel: 16.0, grip: 2.65 } },
  // ---- Circuit Crown (Tempest E4 rung, the final)
  zara: { id: 'zara', name: 'Zara Quell', car: 'tempest', paint: '#e8f6ff', line: 'Wrote the Tempest’s launch map herself. Has never been beaten to the first marker.', stats: { top: 93.0, accel: 19.6, grip: 3.0 }, boss: true },
  lorne2: { id: 'lorne2', name: 'Lorne Halvard', car: 'meridian', paint: '#1f4fc4', line: 'Followed you inland. On a runway the Meridian’s tall gears still pull.', stats: { top: 89.0, accel: 15.6, grip: 2.6 } },
  mika2: { id: 'mika2', name: 'Mika Sorel', car: 'ardent', paint: '#ff5a1f', line: 'Light enough to launch hard, brave enough to take the taxiway flat.', stats: { top: 74.0, accel: 16.2, grip: 2.85 } },
  // ---- Heritage Cup rounds for the Kestrel and the Corvo
  kai2: { id: 'kai2', name: 'Kai Mercer', car: 'tuner', paint: '#20c4c4', line: 'Moved his Kestrel to the coast. The chicanes feel like home.', stats: { top: 50.0, accel: 9.3, grip: 1.8 } },
  ozzy2: { id: 'ozzy2', name: 'Ozzy Lin', car: 'tuner', paint: '#8cff3a', line: 'Lime-green Kestrel, louder laugh, softer tyres.', stats: { top: 50.5, accel: 9.6, grip: 1.76 } },
  odin2: { id: 'odin2', name: 'Odin Pike', car: 'tuner', paint: '#ff7a1a', line: 'Took the Kestrel back out of the desert. It still has sand in the vents.', stats: { top: 51.0, accel: 9.4, grip: 1.72 } },
  tomas2: { id: 'tomas2', name: 'Tomás Reyes', car: 'rally', paint: '#c23b22', line: 'Gravel champion on tarmac for once. Launches like the ground is loose anyway.', stats: { top: 55.0, accel: 12.4, grip: 2.25 } },
  yara2: { id: 'yara2', name: 'Yara Bell', car: 'rally', paint: '#e0d4b8', line: 'Counts the runway lights out loud. Shifts on the seventh.', stats: { top: 55.5, accel: 12.0, grip: 2.3 } },
  wren2: { id: 'wren2', name: 'Wren Calloway', car: 'rally', paint: '#3c7d4f', line: 'Never lifts on a crest; the taxiway turn is just a flat crest.', stats: { top: 56.0, accel: 12.6, grip: 2.2 } },
};

/** Where each ladder rival is fast, and why (shown on the ladder; read against the course demands). */
export const RIVAL_PROFILES: Record<string, RivalProfile> = {
  ray: { strength: 'Launches: a heavy right foot and a short first gear', home: 'Scrapyard Strip' },
  vale: { strength: 'Long straights: the Altamar’s tall top gear', home: 'Coast Road' },
  nova: { strength: 'Boosts: her Lumen’s Surge makes Perfect boosts hit harder', home: 'Skyline Run' },
  sable: { strength: 'Hairpins on loose rock: AWD grip and a brutal exit', home: 'Red Canyon' },
  iver: { strength: 'Everywhere: the Halcyon’s twin, and she never misses a shift', home: 'Summit Circuit' },
  aurelia: { strength: 'Top speed: the other Sovereign, calm over 250 mph', home: 'Grand Riviera' },
  vesna: { strength: 'Starts: she has never lost a launch off the quay', home: 'Harbor Launch' },
  mika: { strength: 'Chicanes and hairpins: the lightest car and the most grip on the grid', home: 'Harbour Esplanade' },
  lorne: { strength: 'The straights: tall gears, the best top end of its tier', home: 'Lagoon Causeway' },
  zara: { strength: 'The launch: four motors, instant torque and her own launch map', home: 'Airfield Sprint' },
};

// ---------------------------------------------------------------- prizes

export type CircuitPrize =
  | { kind: 'part'; family: Family; tier: number; why: string }
  | { kind: 'paint'; name: string; paint: string }
  | { kind: 'cash'; cash: number; crates?: number }
  | { kind: 'badge'; name: string; cash?: number };

/** Rival and series paints: any car can wear them in the Showroom once earned (added to the blueprint finishes). */
export const CIRCUIT_FINISHES = {
  heritage: { name: 'Heritage Green', paint: '#1f5a3e' },
  volt: { name: 'Circuit Volt', paint: '#5ef2ff' },
  esplanade: { name: 'Esplanade Orange', paint: '#ff5a1f' },
};

// ---------------------------------------------------------------- the rival ladder

export interface LadderRung {
  /** Base rival id (RIVALS key). */
  rival: string;
  /** Event where the rival is beaten (a knockout counts through its parent). */
  event: string;
  /** Prize for beating them the first time; null when the event's own boss reward is the prize. */
  prize: CircuitPrize | null;
}

/**
 * Ten rungs: the champions of the main route (approachable at the bottom, every one a boss with its own reward), the
 * two Circuit rivals on the new courses, the campaign's last boss, and Zara Quell at the top. Branches mean some rungs
 * open side by side; the position is how many rungs are beaten, and the next rung is the first open one not yet beaten.
 */
export const LADDER: LadderRung[] = [
  { rival: 'ray', event: 'rusty-ray', prize: null },
  { rival: 'vale', event: 'coast-crown', prize: null },
  { rival: 'nova', event: 'main-event', prize: null },
  { rival: 'sable', event: 'rally-final', prize: null },
  { rival: 'mika', event: 'esplanade-gp', prize: { kind: 'paint', name: CIRCUIT_FINISHES.esplanade.name, paint: CIRCUIT_FINISHES.esplanade.paint } },
  { rival: 'iver', event: 'summit-gala', prize: null },
  { rival: 'lorne', event: 'causeway-run', prize: { kind: 'part', family: 'turbo', tier: 9, why: 'a T9 Turbo for any car that runs T9' } },
  { rival: 'aurelia', event: 'grand-riviera', prize: null },
  { rival: 'vesna', event: 'launch-final', prize: null },
  { rival: 'zara', event: 'circuit-crown', prize: null },
];

// ---------------------------------------------------------------- Heritage Cup (class series)

/** Points by best place in each round (1st..4th). */
export const SERIES_POINTS = [10, 6, 3, 1];

export interface SeriesPrize { wins: number; prize: CircuitPrize; text: string }

export const HERITAGE = {
  id: 'heritage',
  name: 'Heritage Cup',
  /** Rounds, oldest car first: each is a class-limited event (only that car may enter). */
  rounds: ['tapeback-trophy', 'corsa-club', 'hatch-attack', 'ironhorse-revival', 'altamar-tour', 'kestrel-chicane', 'riviera-night', 'corvo-airfield'],
  prizes: [
    { wins: 3, prize: { kind: 'paint', name: CIRCUIT_FINISHES.heritage.name, paint: CIRCUIT_FINISHES.heritage.paint }, text: 'Heritage Green paint' },
    { wins: 5, prize: { kind: 'cash', cash: 3000, crates: 3 }, text: '$3,000 and 3 crates' },
    { wins: 8, prize: { kind: 'badge', name: 'Heritage Champion', cash: 6000 }, text: '“Heritage Champion” badge and $6,000' },
  ] as SeriesPrize[],
};

// ---------------------------------------------------------------- skill milestones (each pays once)

export type MilestoneId = 'perfect-launch' | 'clean-sweep' | 'flawless' | 'ghost-beaten' | 'launch-control' | 'giant-killer';
export interface CircuitMilestone { id: MilestoneId; name: string; text: string; prize: CircuitPrize; prizeText: string }

export const MILESTONES: CircuitMilestone[] = [
  { id: 'perfect-launch', name: 'Perfect launch', text: 'Clean first shift and first out of the launch', prize: { kind: 'cash', cash: 150, crates: 1 }, prizeText: '$150 and a crate' },
  { id: 'clean-sweep', name: 'Clean sweep', text: 'Win with every shift clean (4 or more)', prize: { kind: 'cash', cash: 400, crates: 2 }, prizeText: '$400 and 2 crates' },
  { id: 'flawless', name: 'Flawless', text: 'Win with every shift clean and two Perfect boosts', prize: { kind: 'cash', cash: 1000, crates: 3 }, prizeText: '$1,000 and 3 crates' },
  { id: 'ghost-beaten', name: 'Faster than yourself', text: 'Beat your own ghost in a time trial', prize: { kind: 'cash', cash: 300, crates: 1 }, prizeText: '$300 and a crate' },
  { id: 'launch-control', name: 'Launch control', text: 'Hit the Tempest E4’s launch control on GO', prize: { kind: 'cash', cash: 500, crates: 2 }, prizeText: '$500 and 2 crates' },
  { id: 'giant-killer', name: 'Giant killer', text: 'Win a Heritage Cup round against a car that outguns yours on paper (more top speed and acceleration)', prize: { kind: 'paint', name: 'Giant Killer Red', paint: '#b3122e' }, prizeText: 'Giant Killer Red paint' },
];

// ---------------------------------------------------------------- events

const pay = (cash: number[], rep: number[], crates: number[]) => ({ cash, rep, crates });

/** Circuit events, spread into EVENTS (tables.ts). Pace is already in the rivals' stats (see tests/circuit.test.ts). */
export const CIRCUIT_EVENTS: RaceEvent[] = [
  // ---- the rival ladder's three Circuit rungs (each opens with the car that suits it)
  {
    id: 'esplanade-gp', name: 'Esplanade Grand Prix', district: 'riviera', track: T('esplanade'), rivals: ['anouk2', 'pia', 'mika'],
    payout: pay([1600, 1100, 820, 620], [140, 98, 70, 52], [4, 3, 2, 1]), firstClear: { cash: 2000, crates: 5 },
    requires: { car: 'ardent' }, goals: { par: 20.4 },
    blurb: 'Two chicanes and a hairpin along the harbour wall. Mika Sorel’s Ardent is the lightest thing here; out-brake her or out-boost her.',
  },
  {
    id: 'causeway-run', name: 'Causeway Run', district: 'riviera', track: T('causeway'), rivals: ['teo2', 'aurelia2', 'lorne'],
    payout: pay([1800, 1250, 900, 680], [150, 105, 75, 56], [5, 3, 2, 1]), firstClear: { cash: 2200, crates: 5 },
    requires: { car: 'meridian' }, goals: { par: 16.6 },
    blurb: 'A kilometre of causeway over the lagoon and one fast kink. Lorne Halvard’s Meridian has the tallest gears in the field: shift clean and save a Perfect boost for the second straight.',
  },
  {
    id: 'circuit-crown', name: 'Circuit Crown', district: 'riviera', track: T('airstrip'), rivals: ['lorne2', 'mika2', 'zara'],
    payout: pay([2200, 1500, 1100, 820], [180, 125, 88, 66], [5, 3, 2, 1]), firstClear: { cash: 0, crates: 0 },
    requires: { car: 'tempest', afterWin: 'launch-final' }, goals: { par: 12.7 },
    boss: { rival: 'zara', reward: { cash: 6000, crates: 6, blueprint: CIRCUIT_FINISHES.volt.name, badge: 'Circuit Champion' } },
    blurb: 'The top of the rival ladder: a runway drag against Zara Quell’s Tempest. A 250 m launch decides most of it — hit launch control on GO, then shift on every green.',
  },
  // ---- Heritage Cup rounds for cars with no class meet yet
  {
    id: 'kestrel-chicane', name: 'Kestrel Chicane Cup', district: 'meets', track: T('esplanade'), rivals: ['kai2', 'ozzy2', 'odin2'], carOnly: 'tuner', trophy: 'Chicane Cup',
    payout: pay([560, 400, 300, 220], [44, 30, 22, 16], [3, 2, 1, 0]), firstClear: { cash: 900, crates: 3 },
    requires: { car: 'gt' }, blurb: 'Kestrel 1600s only, through the Esplanade chicanes. Light, grippy and quick to rev: this is the course the Kestrel was built for.',
  },
  {
    id: 'corvo-airfield', name: 'Corvo Airfield Dash', district: 'meets', track: T('airstrip'), rivals: ['tomas2', 'yara2', 'wren2'], carOnly: 'rally', trophy: 'Airfield Dash',
    payout: pay([760, 540, 400, 300], [56, 40, 28, 20], [3, 2, 1, 0]), firstClear: { cash: 1200, crates: 3 },
    requires: { car: 'vireo' }, blurb: 'Corvo Rallys only, on the runway. All-wheel drive off a 250 m standing start: launch clean or don’t bother.',
  },
  // ---- ghost time trials on the new courses (every time attack keeps a personal-best ghost)
  {
    id: 'ta-esplanade', name: 'Esplanade Time Trial', district: 'trials', track: T('esplanade'), rivals: [], timeAttack: { bronze: 19.6, silver: 19.3, gold: 19.1 },
    payout: pay([170, 170, 170, 170], [18, 18, 18, 18], [0, 0, 0, 0]), firstClear: { cash: 0, crates: 0 },
    requires: { car: 'vireo' }, blurb: 'One run along the harbour against your own ghost. Two chicanes, one hairpin, three clean exits.',
  },
  {
    id: 'ta-causeway', name: 'Causeway Time Trial', district: 'trials', track: T('causeway'), rivals: [], timeAttack: { bronze: 17.3, silver: 15.9, gold: 15.6 },
    payout: pay([170, 170, 170, 170], [18, 18, 18, 18], [0, 0, 0, 0]), firstClear: { cash: 0, crates: 0 },
    requires: { car: 'vireo' }, blurb: 'Flat out over the lagoon against your own ghost. Top speed, clean shifts, two Perfect boosts.',
  },
  {
    id: 'ta-airstrip', name: 'Airfield Time Trial', district: 'trials', track: T('airstrip'), rivals: [], timeAttack: { bronze: 15.2, silver: 14.4, gold: 14.1 },
    payout: pay([170, 170, 170, 170], [18, 18, 18, 18], [0, 0, 0, 0]), firstClear: { cash: 0, crates: 0 },
    requires: { car: 'vireo' }, blurb: 'A runway sprint against your own ghost. Most of the time is won or lost in the first 250 m.',
  },
];

/**
 * Rival pace per Circuit event (difficulty knob, like RIVAL_PACE in tables.ts): each event's rivals race their stats
 * above × this. Every Circuit rival races one event only, so the scale is applied here, once, at load. Tuned with
 * `PROBE=1 npx vitest run tests/circuit.test.ts -t tuner` against the input targets in that test.
 */
export const CIRCUIT_PACE: Record<string, number> = {
  'kestrel-chicane': 1.090,
  'corvo-airfield': 1.127,
  'esplanade-gp': 0.957,
  'causeway-run': 0.904,
  'circuit-crown': 1.006,
};
for (const e of CIRCUIT_EVENTS) {
  const k = CIRCUIT_PACE[e.id] ?? 1;
  if (k === 1) continue;
  for (const id of e.rivals) {
    const r = CIRCUIT_RIVALS[id];
    if (r) r.stats = { top: +(r.stats.top * k).toFixed(3), accel: +(r.stats.accel * k).toFixed(3), grip: +(r.stats.grip * k).toFixed(4) };
  }
}

// ---------------------------------------------------------------- Tempest launch control

/** The Tempest E4's signature launch: tap SHIFT (LAUNCH) on GO. */
export const LAUNCH_CONTROL = {
  /** Cars with a launch-control mechanic. */
  cars: ['tempest'] as CarId[],
  /** A tap this close to GO (seconds, either side) is a perfect launch. */
  windowS: 0.22,
  /** Traction multiplier while the launch map runs (the launch segment). */
  traction: 1.22,
  /** Extra pull (share of the car's acceleration) through the launch segment. */
  pull: 0.06,
};
