// Rev Up — data tables. All tuning knobs live here so rules stay data-driven.
// Values marked "tunable" are referenced by the playthrough test and README.

export type Family = 'engine' | 'tires' | 'turbo' | 'transmission' | 'aero';
export type Quality = 'std' | 'polished' | 'mint';
export type CarId =
  | 'junker' | 'beater' | 'hothatch' | 'muscle'
  // Post-MVP ladder (data only, disabled):
  | 'tourer' | 'rally' | 'gt' | 'super' | 'proto' | 'hyper';

export interface FamilyDef {
  id: Family;
  name: string;
  plural: string;
  stat: 'top' | 'accel' | 'grip' | 'shift' | 'downforce';
  statLabel: string;
  active: boolean;
  color: string;
}

export const FAMILIES: Record<Family, FamilyDef> = {
  engine: { id: 'engine', name: 'Engine', plural: 'Engines', stat: 'top', statLabel: 'Top speed', active: true, color: '#e8743b' },
  tires: { id: 'tires', name: 'Tires', plural: 'Tires', stat: 'grip', statLabel: 'Grip', active: true, color: '#5fa8d3' },
  turbo: { id: 'turbo', name: 'Turbo', plural: 'Turbos', stat: 'accel', statLabel: 'Acceleration', active: true, color: '#8bc34a' },
  // Expansion families: modelled, not yet in drops.
  transmission: { id: 'transmission', name: 'Transmission', plural: 'Transmissions', stat: 'shift', statLabel: 'Shift', active: false, color: '#b388eb' },
  aero: { id: 'aero', name: 'Aero', plural: 'Aero kits', stat: 'downforce', statLabel: 'Downforce', active: false, color: '#f2c14e' },
};

export const ACTIVE_FAMILIES: Family[] = (Object.keys(FAMILIES) as Family[]).filter((f) => FAMILIES[f].active);

/** Highest tier reachable in this release (data supports T10). */
export const MAX_TIER = 5; // tunable
export const DATA_MAX_TIER = 10;

/** Stat contribution of a part by tier (index = tier). */
export const TIER_STAT = [0, 10, 24, 42, 64, 90, 120, 155, 195, 240, 290];
export const QUALITY_BONUS = 1.15; // Polished (and Mint) add 15% to the part's contribution.
export const QUALITY_ODDS = { mint: 0.02, polished: 0.10 }; // remainder (88%) standard

/** Scrap value per tier. Must stay well under crate cost so crate recycling never profits. */
export const SCRAP_VALUE = [0, 1, 3, 7, 15, 32, 64, 128, 256, 512, 1024];
export const CRATE_SCRAP_COST = 10; // tunable
export const TARGETED_CRATE_SCRAP_COST = 15; // tunable
export const TARGETED_CRATE_CASH_COST = 70; // tunable — repeatable cash route

export const MERGE_CASH = (tier: number) => tier * 2; // reward per fusion
export const COMBO_WINDOW_MS = 2000;
export const COMBO_NITRO_EVERY = 3;
export const NITRO_CAP = 3; // tunable

export const MERGE_ALL_UNLOCK_ACTIVE_S = 600; // fallback if the player hasn't raced yet
export const MERGE_ALL_UNLOCK_RACES = 5;
export const MERGE_ALL_NITRO_MIN_CHAIN = 3; // longest chain needed for its single nitro charge

export const BOARD_BASE = { cols: 5, rows: 6 };
export const BOARD_EXPANDED = { cols: 6, rows: 7 };
export const TRAY_SLOTS = 4;

export interface UpgradeDef {
  id: 'grid' | 'printer' | 'crateTier';
  name: string;
  levels: { cost: number; label: string }[];
}

export const PRINTER_INTERVAL_S = [20, 16, 13, 10]; // by printer level
/** Crate tier odds by crate-tier level: weights for T1..T3 */
export const CRATE_TIER_ODDS: number[][] = [
  [1, 0, 0],
  [0.65, 0.35, 0],
  [0.35, 0.55, 0.1],
  [0.1, 0.65, 0.25],
];

export const UPGRADES: UpgradeDef[] = [
  { id: 'grid', name: 'Bigger bench', levels: [{ cost: 600, label: 'Expand the board to 6×7' }] },
  {
    id: 'printer', name: 'Faster printer', levels: [
      { cost: 150, label: 'Crate every 16 s' },
      { cost: 480, label: 'Crate every 13 s' },
      { cost: 1100, label: 'Crate every 10 s' },
    ],
  },
  {
    id: 'crateTier', name: 'Better crates', levels: [
      { cost: 250, label: '35% chance of T2 parts' },
      { cost: 750, label: 'More T2, some T3 parts' },
      { cost: 1600, label: 'Mostly T2, 25% T3 parts' },
    ],
  },
];

export interface CarClass {
  id: CarId;
  name: string;
  model: string;
  district: DistrictId;
  cap: number;
  base: { top: number; accel: number; grip: number };
  unlock: null | { rep: number; family: Family; tier: number };
  enabled: boolean;
  paint: string;
  trim: string;
  blurb: string;
  offlineRate: number; // cash per minute while away
  rev: { base: number; peak: number }; // reveal sound
}

export type DistrictId = 'scrapyard' | 'suburbs' | 'downtown' | 'coastal' | 'riviera' | 'neon' | 'desert' | 'summit';

export const DISTRICTS: Record<DistrictId, { name: string; enabled: boolean }> = {
  scrapyard: { name: 'Scrapyard', enabled: true },
  suburbs: { name: 'Suburbs', enabled: true },
  downtown: { name: 'Downtown', enabled: false },
  coastal: { name: 'Coastal Highway', enabled: false },
  riviera: { name: 'Azure Riviera', enabled: false },
  neon: { name: 'Neon Skyline', enabled: false },
  desert: { name: 'Desert Proving Ground', enabled: false },
  summit: { name: 'Summit Gala', enabled: false },
};

export const CARS: CarClass[] = [
  {
    id: 'junker', name: 'Junker', model: 'Tapeback 1.1', district: 'scrapyard', cap: 2,
    base: { top: 29, accel: 3.6, grip: 0.68 }, unlock: null, enabled: true,
    paint: '#9a8f7a', trim: '#5b5346', blurb: 'A taped-up scrapyard hatchback. One door is a different color. It runs.',
    offlineRate: 1, rev: { base: 55, peak: 140 },
  },
  {
    id: 'beater', name: 'Beater', model: 'Corsa Rojo', district: 'scrapyard', cap: 3,
    base: { top: 32, accel: 4.2, grip: 0.75 }, unlock: { rep: 45, family: 'tires', tier: 3 }, enabled: true,
    paint: '#b5452f', trim: '#3c2a24', blurb: 'A compact sedan with honest bones and a sunburnt roof.',
    offlineRate: 2, rev: { base: 65, peak: 180 },
  },
  {
    id: 'hothatch', name: 'Hot hatch', model: 'Vexa GTi', district: 'suburbs', cap: 4,
    base: { top: 36, accel: 5.0, grip: 0.84 }, unlock: { rep: 265, family: 'turbo', tier: 4 }, enabled: true,
    paint: '#e9e4d8', trim: '#d7262e', blurb: 'Short, sharp, and loud. A red pinstripe and a roof spoiler that means it.',
    offlineRate: 3, rev: { base: 80, peak: 260 },
  },
  {
    id: 'muscle', name: 'Muscle', model: 'Ironhorse 455', district: 'suburbs', cap: 5,
    base: { top: 41, accel: 5.6, grip: 0.88 }, unlock: { rep: 850, family: 'engine', tier: 5 }, enabled: true,
    paint: '#1f3a5f', trim: '#f2b33d', blurb: 'A restored long-hood coupe with twin stripes and a V8 you can feel in your chest.',
    offlineRate: 4, rev: { base: 45, peak: 160 },
  },
  // Full campaign (data only). The hypercar is gated by reputation, a crafted T10 keystone, and the Summit Gala rival win.
  { id: 'tourer', name: 'Grand tourer', model: '—', district: 'downtown', cap: 6, base: { top: 45, accel: 6, grip: 0.9 }, unlock: { rep: 800, family: 'transmission', tier: 6 }, enabled: false, paint: '#555', trim: '#999', blurb: '', offlineRate: 5, rev: { base: 60, peak: 200 } },
  { id: 'rally', name: 'Rally', model: '—', district: 'coastal', cap: 7, base: { top: 48, accel: 6.5, grip: 0.95 }, unlock: { rep: 1400, family: 'aero', tier: 7 }, enabled: false, paint: '#555', trim: '#999', blurb: '', offlineRate: 6, rev: { base: 60, peak: 200 } },
  { id: 'gt', name: 'GT', model: '—', district: 'riviera', cap: 8, base: { top: 52, accel: 7, grip: 1 }, unlock: { rep: 2200, family: 'engine', tier: 8 }, enabled: false, paint: '#555', trim: '#999', blurb: '', offlineRate: 7, rev: { base: 60, peak: 200 } },
  { id: 'super', name: 'Supercar', model: '—', district: 'neon', cap: 9, base: { top: 56, accel: 7.5, grip: 1.05 }, unlock: { rep: 3200, family: 'turbo', tier: 9 }, enabled: false, paint: '#555', trim: '#999', blurb: '', offlineRate: 8, rev: { base: 60, peak: 200 } },
  { id: 'proto', name: 'Prototype', model: '—', district: 'desert', cap: 10, base: { top: 60, accel: 8, grip: 1.1 }, unlock: { rep: 4500, family: 'aero', tier: 10 }, enabled: false, paint: '#555', trim: '#999', blurb: '', offlineRate: 9, rev: { base: 60, peak: 200 } },
  { id: 'hyper', name: 'Hypercar', model: 'One-of-one', district: 'summit', cap: 10, base: { top: 64, accel: 8.5, grip: 1.15 }, unlock: { rep: 6000, family: 'engine', tier: 10 }, enabled: false, paint: '#555', trim: '#999', blurb: 'Requires the Summit Gala rival win.', offlineRate: 10, rev: { base: 60, peak: 200 } },
];

export const ENABLED_CARS = CARS.filter((c) => c.enabled);
export const SIGNATURE_FINISHES: Partial<Record<CarId, { name: string; paint: string; stripe: string }>> = {
  junker: { name: 'Petrol Blue', paint: '#237481', stripe: '#e6b366' },
  beater: { name: 'Creamline', paint: '#d2b58b', stripe: '#394252' },
  hothatch: { name: 'Apex Violet', paint: '#6247a4', stripe: '#9ee3c9' },
  muscle: { name: 'Midnight Bronze', paint: '#70442d', stripe: '#f3c975' },
};

export const RAY_FINISH = { name: 'Ray’s Rust-Red', paint: '#a8432a' };

export function finishStripe(car: CarId, paint: string | undefined): string | undefined {
  const finish = SIGNATURE_FINISHES[car];
  return finish && finish.paint === paint ? finish.stripe : undefined;
}

export const carById = (id: CarId): CarClass => {
  const c = CARS.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown car ${id}`);
  return c;
};

/** Effective stat mapping from summed part contribution to physics. */
export const STAT_SCALE = { top: 0.12, accel: 0.034, grip: 0.0055 };

// ---------------- Tracks ----------------
export type SegmentType = 'launch' | 'straight' | 'bend' | 'highway' | 'hwbend';
export interface Segment {
  type: SegmentType;
  length: number; // meters
  radius?: number; // bends
  window?: [number, number]; // nitro window as fraction of segment
}
export interface Track {
  id: 'scrapyard' | 'maple' | 'foundry';
  name: string;
  district: DistrictId;
  segments: Segment[];
  theme: 'scrap' | 'suburb';
}

export const TRACKS: Record<Track['id'], Track> = {
  scrapyard: {
    id: 'scrapyard', name: 'Scrapyard Strip', district: 'scrapyard', theme: 'scrap',
    segments: [
      { type: 'launch', length: 80 },
      { type: 'straight', length: 150, window: [0.15, 0.5] },
      { type: 'bend', length: 90, radius: 75 },
      { type: 'straight', length: 170, window: [0.1, 0.45] },
    ],
  },
  maple: {
    id: 'maple', name: 'Maple Highway', district: 'suburbs', theme: 'suburb',
    segments: [
      { type: 'launch', length: 70 },
      { type: 'highway', length: 230, window: [0.15, 0.45] },
      { type: 'hwbend', length: 130, radius: 85 },
      { type: 'highway', length: 260, window: [0.1, 0.4] },
    ],
  },
  foundry: {
    id: 'foundry', name: 'Foundry Circuit', district: 'suburbs', theme: 'scrap',
    segments: [
      { type: 'launch', length: 85 },
      { type: 'bend', length: 100, radius: 49 },
      { type: 'straight', length: 210, window: [0.12, 0.43] },
      { type: 'bend', length: 130, radius: 60 },
      { type: 'straight', length: 235, window: [0.17, 0.52] },
    ],
  },
};

export const trackLength = (t: Track) => t.segments.reduce((a, s) => a + s.length, 0);

// ---------------- Rivals & events ----------------
export interface Rival {
  id: string;
  name: string;
  car: CarId;
  paint: string;
  line: string; // personality
  stats: { top: number; accel: number; grip: number }; // physics values
  boss?: boolean;
}

export const RIVALS: Record<string, Rival> = {
  gus: { id: 'gus', name: 'Gus Grimm', car: 'junker', paint: '#7d8c8f', line: 'Learned to drive in a forklift. Still brakes like one.', stats: { top: 29.6, accel: 3.75, grip: 0.7 } },
  dex: { id: 'dex', name: 'Dex', car: 'junker', paint: '#6f7f5a', line: 'Drives everything like it’s stolen. It usually is.', stats: { top: 30.5, accel: 3.9, grip: 0.72 } },
  mo: { id: 'mo', name: 'Mo Patch', car: 'junker', paint: '#8a6d9e', line: 'Fixes cars with chewing gum and optimism.', stats: { top: 31.2, accel: 4.0, grip: 0.73 } },
  lina: { id: 'lina', name: 'Lina Sparks', car: 'beater', paint: '#3f7f8c', line: 'Welder by day. Faster by night.', stats: { top: 32.4, accel: 4.4, grip: 0.76 } },
  tug: { id: 'tug', name: 'Tug', car: 'beater', paint: '#7a5c3a', line: 'Tows cars for a living. Doesn’t like being towed.', stats: { top: 33.6, accel: 4.6, grip: 0.8 } },
  bolt: { id: 'bolt', name: 'Bolt Okafor', car: 'beater', paint: '#4a6b3a', line: 'Never loses a launch. Sometimes loses the bend.', stats: { top: 33.2, accel: 5.2, grip: 0.78 } },
  ray: { id: 'ray', name: 'Rusty Ray', car: 'beater', paint: '#a0522d', line: 'Runs the Scrapyard. His car is mostly rust and grudges.', stats: { top: 35.0, accel: 5.3, grip: 0.86 }, boss: true },
  june: { id: 'june', name: 'June Hale', car: 'hothatch', paint: '#2d6a4f', line: 'Commutes at race pace. Waves as she passes.', stats: { top: 37.2, accel: 5.4, grip: 0.9 } },
  priya: { id: 'priya', name: 'Priya Vance', car: 'hothatch', paint: '#c9a227', line: 'Spreadsheet tuner. Knows your gear ratios.', stats: { top: 39.0, accel: 5.9, grip: 0.95 } },
  hank: { id: 'hank', name: 'Hank “Two-Tone”', car: 'muscle', paint: '#6b2737', line: 'His coupe has two colors and zero patience.', stats: { top: 42.0, accel: 6.2, grip: 0.96 } },
  sol: { id: 'sol', name: 'Sol Ortega', car: 'muscle', paint: '#264653', line: 'Quiet, precise, already in fifth gear.', stats: { top: 44.0, accel: 6.6, grip: 1.0 } },
};

export interface RaceEvent {
  id: string;
  name: string;
  district: DistrictId;
  track: Track['id'];
  rivals: [string, string, string];
  payout: { cash: number[]; rep: number[]; crates: number[] }; // by placement 1..4
  firstClear: { cash: number; crates: number };
  requires: { rep?: number; car?: CarId; beatBoss?: string };
  boss?: { rival: string; reward: { cash: number; crates: number; blueprint: string; badge: string } };
  blurb: string;
}

export const EVENTS: RaceEvent[] = [
  {
    id: 'yard-sprint', name: 'Yard Sprint', district: 'scrapyard', track: 'scrapyard', rivals: ['gus', 'dex', 'mo'],
    payout: { cash: [55, 40, 30, 22], rep: [10, 7, 5, 4], crates: [1, 1, 0, 0] }, firstClear: { cash: 40, crates: 2 },
    requires: {}, blurb: 'Loose gravel, short straights. A good first race.',
  },
  {
    id: 'crusher-run', name: 'Crusher Run', district: 'scrapyard', track: 'scrapyard', rivals: ['lina', 'tug', 'bolt'],
    payout: { cash: [90, 65, 48, 36], rep: [15, 10, 8, 6], crates: [1, 1, 1, 0] }, firstClear: { cash: 70, crates: 2 },
    requires: { rep: 20 }, blurb: 'Past the car crusher. Launches decide it.',
  },
  {
    id: 'rusty-ray', name: 'Rusty Ray', district: 'scrapyard', track: 'scrapyard', rivals: ['tug', 'bolt', 'ray'],
    payout: { cash: [130, 90, 65, 48], rep: [22, 15, 11, 8], crates: [2, 1, 1, 0] }, firstClear: { cash: 0, crates: 0 },
    requires: { car: 'beater' },
    boss: { rival: 'ray', reward: { cash: 200, crates: 4, blueprint: 'Ray’s Rust-Red', badge: 'Scrapyard King' } },
    blurb: 'Beat the king of the Scrapyard to open the Suburbs.',
  },
  {
    id: 'cul-de-sac', name: 'Cul-de-sac Dash', district: 'suburbs', track: 'maple', rivals: ['bolt', 'june', 'priya'],
    payout: { cash: [140, 100, 75, 56], rep: [24, 16, 12, 9], crates: [2, 1, 1, 0] }, firstClear: { cash: 120, crates: 3 },
    requires: { beatBoss: 'ray' }, blurb: 'Sprinklers, speed bumps, and a long on-ramp.',
  },
  {
    id: 'maple-mile', name: 'Maple Mile', district: 'suburbs', track: 'maple', rivals: ['priya', 'hank', 'sol'],
    payout: { cash: [200, 140, 105, 80], rep: [32, 22, 16, 12], crates: [2, 1, 1, 1] }, firstClear: { cash: 180, crates: 3 },
    requires: { beatBoss: 'ray', rep: 330 }, blurb: 'Top-speed country. Engines rule the highway.',
  },
  {
    id: 'foundry-final', name: 'Foundry Invitational', district: 'suburbs', track: 'foundry', rivals: ['hank', 'sol', 'priya'],
    payout: { cash: [240, 175, 130, 96], rep: [36, 26, 19, 15], crates: [3, 2, 1, 1] },
    firstClear: { cash: 280, crates: 4 },
    requires: { beatBoss: 'ray', car: 'muscle' }, blurb: 'Tight bends test your grip. Save nitro for the exits.',
  },
];

export const eventById = (id: string): RaceEvent => {
  const e = EVENTS.find((x) => x.id === id);
  if (!e) throw new Error(`Unknown event ${id}`);
  return e;
};

export const PRECISION_BONUS_PER_PERFECT = 8; // cash per perfect nitro (live only)
export const PRECISION_BONUS_CAP = 16; // two windows per track

// ---------------- Nitro & race sim ----------------
export const RACE = {
  dt: 1 / 60,
  safetyCutoffS: 45,
  nitroDurationS: 1.6,
  nitroAccel: 3.6, // m/s² added during ordinary nitro
  nitroTopMul: 0.14, // +14% top speed during ordinary nitro
  perfectMul: 1.5,
  rivalVariance: 0.012, // ±1.2% seeded variance
  launchTurboMul: 1.45,
  tractionG: 9.81 * 0.82,
  wheelspinKeep: 0.1,
  highwayTopMul: 1.06,
};

// ---------------- Progression safeguards ----------------
export const CATCHUP_EFFORT_THRESHOLD = 150; // active seconds + race completions × RACE_EFFORT
export const RACE_EFFORT = 15;
export const ACTIVE_IDLE_CUTOFF_MS = 45_000; // no input for this long → time no longer counts as active

export const OFFLINE_MAX_S = 8 * 3600;
export const OFFLINE_MIN_S = 120;

export const STARTER_CRATES = 3;
