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
export const MAX_TIER = 6; // tunable — T6 opens with the Open Road chapter (Altamar GT, cap T6)
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
export const NITRO_CAP = 3; // tunable — banked charges
/** Every live race includes this many free crew charges on top of the bank (spent first). */
export const CREW_NITRO = 1;

export const MERGE_ALL_UNLOCK_ACTIVE_S = 600; // fallback if the player hasn't raced yet
export const MERGE_ALL_UNLOCK_RACES = 5;
export const MERGE_ALL_NITRO_MIN_CHAIN = 3; // longest chain needed for its single nitro charge

export const BOARD_BASE = { cols: 5, rows: 6 };
export const BOARD_EXPANDED = { cols: 6, rows: 7 };
export const TRAY_SLOTS = 4;

export type UpgradeId = 'grid' | 'printer' | 'crateTier' | 'nitroTank' | 'crew' | 'lockup';
export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  /** One line on what it is for, shown above the next level's exact effect. */
  about: string;
  levels: { cost: number; label: string }[];
  /** Shown in the Workshop once this is true, so the early catalogue stays short. */
  shows?: 'always' | 'quick' | 'cars3' | 'cars4';
}

export const PRINTER_INTERVAL_S = [20, 16, 13, 10]; // by printer level
/** Crate tier odds by crate-tier level: weights for T1..T3 */
export const CRATE_TIER_ODDS: number[][] = [
  [1, 0, 0],
  [0.75, 0.25, 0],
  [0.5, 0.45, 0.05],
  [0.25, 0.6, 0.15],
];

export const UPGRADES: UpgradeDef[] = [
  { id: 'grid', name: 'Bigger bench', about: 'More room to line up merges.', levels: [{ cost: 600, label: 'Board grows from 5×6 to 6×7 (+12 slots)' }] },
  {
    id: 'printer', name: 'Faster printer', about: 'The free crate printer in your garage.', levels: [
      { cost: 250, label: 'Crate every 16 s' },
      { cost: 750, label: 'Crate every 13 s' },
      { cost: 1600, label: 'Crate every 10 s' },
    ],
  },
  {
    id: 'crateTier', name: 'Better crates', about: 'Higher tiers in every crate you get.', levels: [
      { cost: 450, label: '25% chance of T2 parts' },
      { cost: 1200, label: 'Half T2, a few T3 parts' },
      { cost: 2400, label: 'Mostly T2, 15% T3 parts' },
    ],
  },
  {
    id: 'crew', name: 'Pit crew', about: 'Your crew runs Quick Races while you merge.', shows: 'quick', levels: [
      { cost: 900, label: 'Quick Races pay 85% of the live purse (was 70%)' },
    ],
  },
  {
    id: 'nitroTank', name: 'Nitro tank', about: 'Bank more charges from merge combos.', shows: 'cars3', levels: [
      { cost: 1500, label: 'Bank up to 4 nitro (was 3)' },
      { cost: 4800, label: 'Bank up to 5 nitro' },
    ],
  },
  {
    id: 'lockup', name: 'Lock-up', about: 'Your cars earn while you are away.', shows: 'cars4', levels: [
      { cost: 2500, label: 'Away earnings build for 12 h (was 8 h)' },
    ],
  },
];

// ---------------- Economy (one table: prices, payouts, rates) ----------------
// Prices are set in runs of play: see README "Economy". Cash buys things; Rep marks progress; scrap buys crates.
/** Order a Part: a known family and tier, by tier. Each tier costs a bit more than two of the tier below,
 *  so merging stays the cheaper route and buying is the reliable one. Keystones (a car's top tier) must be crafted. */
export const PART_ORDER_PRICE = [0, 45, 110, 260, 600, 1400, 3200, 7400];
/** Quick Race cash, as a share of the live purse for that place, by Pit crew level. */
export const QUICK_PAY_SHARE = [0.7, 0.85]; // live stays worth playing: the crew never earns the full purse
/** Each Perfect boost pays this share of the event's win purse (live, at most two). */
export const PERFECT_BONUS_SHARE = 0.1;
/** Hours of away earnings that can build up, by Lock-up level. */
export const OFFLINE_HOURS = [8, 12];
export const nitroCapFor = (tankLevel: number) => NITRO_CAP + tankLevel;

/** Paint shop: cosmetic only, never performance. Colours and wheel sets are bought once and fit any car;
 *  premium paint is bought per car; the Tapeback restoration is three staged jobs. `opens`: cars owned. */
export type StyleKind = 'paint' | 'wheel' | 'material' | 'restore';
export interface StyleItem { id: string; kind: StyleKind; name: string; price: number; value: string; opens: number; blurb: string }
export const STYLE_ITEMS: StyleItem[] = [
  { id: 'paint:safety', kind: 'paint', name: 'Safety Yellow', price: 250, value: '#f0b92a', opens: 1, blurb: 'Scrapyard crane yellow.' },
  { id: 'paint:cream', kind: 'paint', name: 'Fresh Cream', price: 250, value: '#ece2c6', opens: 1, blurb: 'A clean old-school cream.' },
  { id: 'paint:green', kind: 'paint', name: 'Racing Green', price: 250, value: '#1f5e3b', opens: 2, blurb: 'Deep green, gold-friendly.' },
  { id: 'paint:signal', kind: 'paint', name: 'Signal Red', price: 250, value: '#c8231f', opens: 2, blurb: 'Brake-light red.' },
  { id: 'paint:midnight', kind: 'paint', name: 'Midnight Blue', price: 250, value: '#1b2b57', opens: 3, blurb: 'Nearly black until the light hits it.' },
  { id: 'paint:gunmetal', kind: 'paint', name: 'Gunmetal', price: 250, value: '#4b535b', opens: 3, blurb: 'Dark grey with a blue cast.' },
  { id: 'wheel:steel', kind: 'wheel', name: 'Steelies', price: 300, value: 'steel', opens: 2, blurb: 'Plain steel wheels with lug holes.' },
  { id: 'wheel:turbine', kind: 'wheel', name: 'Turbine covers', price: 450, value: 'turbine', opens: 2, blurb: 'Period aero wheel covers.' },
  { id: 'wheel:fivespoke', kind: 'wheel', name: 'Five-spoke', price: 900, value: 'fivespoke', opens: 3, blurb: 'Sport alloys with red calipers.' },
  { id: 'wheel:dish', kind: 'wheel', name: 'Deep dish', price: 1400, value: 'dish', opens: 4, blurb: 'Polished lips, muscle-car stance.' },
  { id: 'wheel:wire', kind: 'wheel', name: 'Wire wheels', price: 2400, value: 'wire', opens: 5, blurb: 'Centre-lock wire wheels with gold calipers.' },
  { id: 'material:metallic', kind: 'material', name: 'Metallic', price: 1200, value: 'metallic', opens: 3, blurb: 'Fine flake that sparkles in the light. For this car.' },
  { id: 'material:pearl', kind: 'material', name: 'Pearl', price: 3000, value: 'pearl', opens: 4, blurb: 'Colour shifts toward pink and teal at the ends. For this car.' },
  { id: 'material:candy', kind: 'material', name: 'Candy', price: 6000, value: 'candy', opens: 5, blurb: 'Deep, glowing colour over a bright base. For this car.' },
  { id: 'restore:1', kind: 'restore', name: 'Rust repair', price: 1500, value: '1', opens: 2, blurb: 'Cut out the rust, lose the duct tape.' },
  { id: 'restore:2', kind: 'restore', name: 'Body and paint', price: 3000, value: '2', opens: 3, blurb: 'Straighten the dents; one colour door to door.' },
  { id: 'restore:3', kind: 'restore', name: 'Brightwork', price: 4500, value: '3', opens: 4, blurb: 'Chrome bumpers, a waist strip, matching headlamps.' },
];
export const styleItem = (id: string) => STYLE_ITEMS.find((i) => i.id === id);

export interface CarClass {
  id: CarId;
  name: string;
  model: string;
  district: DistrictId;
  cap: number;
  base: { top: number; accel: number; grip: number };
  /** Rep + a crafted keystone, and optionally a won event (e.g. a rival series final). */
  unlock: null | { rep: number; family: Family; tier: number; event?: string };
  enabled: boolean;
  paint: string;
  trim: string;
  blurb: string;
  offlineRate: number; // cash per minute while away
  rev: { base: number; peak: number }; // reveal sound
  /** One line on how it drives, shown in the Showroom. */
  handling?: string;
}

export type DistrictId = 'scrapyard' | 'suburbs' | 'meets' | 'trials' | 'downtown' | 'coastal' | 'riviera' | 'neon' | 'desert' | 'summit';

export const DISTRICTS: Record<DistrictId, { name: string; enabled: boolean }> = {
  scrapyard: { name: 'Scrapyard', enabled: true },
  suburbs: { name: 'Suburbs', enabled: true },
  downtown: { name: 'Downtown', enabled: false },
  coastal: { name: 'Coastal Highway', enabled: true },
  meets: { name: 'Class meets', enabled: true },
  trials: { name: 'Time attack', enabled: true },
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
    base: { top: 32, accel: 4.2, grip: 0.75 }, unlock: { rep: 70, family: 'tires', tier: 3 }, enabled: true,
    paint: '#b5452f', trim: '#3c2a24', blurb: 'A compact sedan with honest bones and a sunburnt roof.',
    offlineRate: 2, rev: { base: 65, peak: 180 },
  },
  {
    id: 'hothatch', name: 'Hot hatch', model: 'Vexa GTi', district: 'suburbs', cap: 4,
    base: { top: 36, accel: 5.0, grip: 0.84 }, unlock: { rep: 600, family: 'turbo', tier: 4 }, enabled: true,
    paint: '#e9e4d8', trim: '#d7262e', blurb: 'Short, sharp, and loud. A red pinstripe and a roof spoiler that means it.',
    offlineRate: 3, rev: { base: 80, peak: 260 },
  },
  {
    id: 'muscle', name: 'Muscle', model: 'Ironhorse 455', district: 'suburbs', cap: 5,
    base: { top: 41, accel: 5.6, grip: 0.88 }, unlock: { rep: 1850, family: 'engine', tier: 5 }, enabled: true,
    paint: '#1f3a5f', trim: '#f2b33d', blurb: 'A restored long-hood coupe with twin stripes and a V8 you can feel in your chest.',
    offlineRate: 4, rev: { base: 45, peak: 160 },
  },
  // Full campaign (data only). The hypercar is gated by reputation, a crafted T10 keystone, and the Summit Gala rival win.
  {
    id: 'tourer', name: 'Grand tourer', model: 'Altamar GT', district: 'coastal', cap: 6,
    base: { top: 46, accel: 5.7, grip: 0.97 }, unlock: { rep: 5600, family: 'engine', tier: 6, event: 'coast-crown' }, enabled: true,
    paint: '#0f6b6b', trim: '#e9d8b4', blurb: 'A long-tailed coastal grand tourer with covered lamps and a cream-leather cabin. Built for the open road.',
    offlineRate: 6, rev: { base: 70, peak: 230 }, handling: 'Fastest on long straights and fast sweepers; heavier off the line.',
  },
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
  tourer: { name: 'Riviera Pearl', paint: '#e8e2d2', stripe: '#b0862f' },
};

export const RAY_FINISH = { name: 'Ray’s Rust-Red', paint: '#a8432a' };
/** Won from Vale Moreau in the Coastal Crown; usable on any car. */
export const CROWN_FINISH = { name: 'Crown Teal', paint: '#127c8a' };
/** Blueprint finishes that any owned car can wear, by blueprint name. */
export const BLUEPRINT_FINISHES = [RAY_FINISH, CROWN_FINISH];

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
  id: 'scrapyard' | 'maple' | 'foundry' | 'harbor' | 'cliffs' | 'coast';
  name: string;
  district: DistrictId;
  segments: Segment[];
  theme: 'scrap' | 'suburb' | 'coast';
  /** Short player-facing course type and the part family it rewards. */
  course: string;
  favours: string;
}

export const TRACKS: Record<Track['id'], Track> = {
  scrapyard: {
    id: 'scrapyard', name: 'Scrapyard Strip', district: 'scrapyard', theme: 'scrap', course: 'Drag launch · one bend', favours: 'Turbo off the line',
    segments: [
      { type: 'launch', length: 80 },
      { type: 'straight', length: 150, window: [0.15, 0.5] },
      { type: 'bend', length: 90, radius: 75 },
      { type: 'straight', length: 170, window: [0.1, 0.45] },
    ],
  },
  maple: {
    id: 'maple', name: 'Maple Highway', district: 'suburbs', theme: 'suburb', course: 'Highway · long straights', favours: 'Engine top speed',
    segments: [
      { type: 'launch', length: 70 },
      { type: 'highway', length: 230, window: [0.15, 0.45] },
      { type: 'hwbend', length: 130, radius: 85 },
      { type: 'highway', length: 260, window: [0.1, 0.4] },
    ],
  },
  foundry: {
    id: 'foundry', name: 'Foundry Circuit', district: 'suburbs', theme: 'scrap', course: 'Tight bends', favours: 'Tires through the bends',
    segments: [
      { type: 'launch', length: 85 },
      { type: 'bend', length: 100, radius: 49 },
      { type: 'straight', length: 210, window: [0.12, 0.43] },
      { type: 'bend', length: 130, radius: 60 },
      { type: 'straight', length: 235, window: [0.17, 0.52] },
    ],
  },
  harbor: {
    id: 'harbor', name: 'Harbor Launch', district: 'coastal', theme: 'coast', course: 'Long launch · short sprint', favours: 'Turbo and traction off the line',
    segments: [
      { type: 'launch', length: 165 },
      { type: 'straight', length: 150, window: [0.08, 0.48] },
      { type: 'bend', length: 70, radius: 95 },
      { type: 'straight', length: 160, window: [0.12, 0.5] },
    ],
  },
  cliffs: {
    id: 'cliffs', name: 'Cliffside Esses', district: 'coastal', theme: 'coast', course: 'Esses · three tight bends', favours: 'Grip, and nitro out of each bend',
    segments: [
      { type: 'launch', length: 60 },
      { type: 'bend', length: 70, radius: 44 },
      { type: 'straight', length: 105, window: [0.04, 0.45] },
      { type: 'bend', length: 70, radius: 40 },
      { type: 'straight', length: 100, window: [0.04, 0.45] },
      { type: 'bend', length: 60, radius: 48 },
      { type: 'straight', length: 135, window: [0.04, 0.42] },
    ],
  },
  coast: {
    id: 'coast', name: 'Coast Road', district: 'coastal', theme: 'coast', course: 'Open highway · one fast sweeper', favours: 'Engine top speed',
    segments: [
      { type: 'launch', length: 75 },
      { type: 'highway', length: 330, window: [0.2, 0.45] },
      { type: 'hwbend', length: 150, radius: 150 },
      { type: 'highway', length: 340, window: [0.15, 0.4] },
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
  nell: { id: 'nell', name: 'Nell Rivet', car: 'junker', paint: '#5e7d4a', line: 'Built her Tapeback from three others. Knows every bolt.', stats: { top: 32.0, accel: 4.45, grip: 0.8 } },
  oz: { id: 'oz', name: 'Oz Kowalski', car: 'junker', paint: '#8c5a7a', line: 'Runs a tow truck by day and this by night.', stats: { top: 31.6, accel: 4.3, grip: 0.82 } },
  pip: { id: 'pip', name: 'Pip Marlowe', car: 'junker', paint: '#c48a3a', line: 'Seventeen, fearless, and still on her learner plates.', stats: { top: 31.3, accel: 4.5, grip: 0.77 } },
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
  ines: { id: 'ines', name: 'Inês Faro', car: 'beater', paint: '#4f6d8c', line: 'Keeps a logbook of every fuel stop since 1998.', stats: { top: 38.4, accel: 5.5, grip: 0.95 } },
  bram: { id: 'bram', name: 'Bram Hollis', car: 'beater', paint: '#8b7d5a', line: 'Taxi driver. Takes the racing line out of habit.', stats: { top: 38.0, accel: 5.8, grip: 0.93 } },
  otto: { id: 'otto', name: 'Otto Brandt', car: 'beater', paint: '#5d2f3a', line: 'Restores sedans nobody else wants. Then races them.', stats: { top: 38.8, accel: 5.4, grip: 0.92 } },
  zoe: { id: 'zoe', name: 'Zoe Arkwright', car: 'hothatch', paint: '#d1d63f', line: 'Hatch purist. Calls every other car "a bit much".', stats: { top: 42.2, accel: 6.9, grip: 1.2 } },
  rafa: { id: 'rafa', name: 'Rafa Soler', car: 'hothatch', paint: '#2b8a5a', line: 'Left-foot braker. Never seems to lift.', stats: { top: 41.8, accel: 7.2, grip: 1.16 } },
  kit: { id: 'kit', name: 'Kit Navarro', car: 'hothatch', paint: '#c2462e', line: 'Grew up on these roads. Knows every apex.', stats: { top: 42.5, accel: 6.8, grip: 1.24 } },
  mara: { id: 'mara', name: 'Mara Quint', car: 'muscle', paint: '#3d3a6b', line: 'Drag-strip veteran. Wins most races in the first 100 m.', stats: { top: 50.0, accel: 8.75, grip: 1.22 } },
  dane: { id: 'dane', name: 'Dane Okoro', car: 'muscle', paint: '#7c2d2d', line: 'Hill-climb champion. Brakes later than anyone.', stats: { top: 50.6, accel: 8.2, grip: 1.42 } },
  lux: { id: 'lux', name: 'Lux Ferrin', car: 'tourer', paint: '#9a9fa8', line: 'Collects grand tourers. Races them on weekends.', stats: { top: 52.0, accel: 8.1, grip: 1.3 } },
  vale: { id: 'vale', name: 'Vale Moreau', car: 'tourer', paint: '#16233a', line: 'Owns the coast road. Drives the only Altamar anyone has seen.', stats: { top: 53.6, accel: 8.6, grip: 1.38 }, boss: true },
  sol: { id: 'sol', name: 'Sol Ortega', car: 'muscle', paint: '#264653', line: 'Quiet, precise, already in fifth gear.', stats: { top: 44.0, accel: 6.6, grip: 1.0 } },
};

export interface RaceEvent {
  id: string;
  name: string;
  district: DistrictId;
  track: Track['id'];
  rivals: string[]; // three rivals; a time attack has none
  payout: { cash: number[]; rep: number[]; crates: number[] }; // by placement 1..4
  firstClear: { cash: number; crates: number };
  requires: { rep?: number; car?: CarId; beatBoss?: string; afterWin?: string };
  /** Class-limited invitational: only this car may enter. */
  carOnly?: CarId;
  boss?: { rival: string; reward: { cash: number; crates: number; blueprint: string; badge: string } };
  /** Staged rival series: rounds open one at a time as each is won. */
  series?: { id: string; name: string; round: number; of: number };
  /** Replayable time target: no rivals, medals at these finish times (seconds). */
  timeAttack?: { bronze: number; silver: number; gold: number };
  /** Class meet trophy badge, awarded on the first win. */
  trophy?: string;
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
    payout: { cash: [140, 100, 75, 56], rep: [24, 16, 12, 9], crates: [1, 1, 0, 0] }, firstClear: { cash: 120, crates: 3 },
    requires: { beatBoss: 'ray' }, blurb: 'Sprinklers, speed bumps, and a long on-ramp.',
  },
  {
    id: 'maple-mile', name: 'Maple Mile', district: 'suburbs', track: 'maple', rivals: ['priya', 'hank', 'sol'],
    payout: { cash: [200, 140, 105, 80], rep: [32, 22, 16, 12], crates: [1, 1, 1, 0] }, firstClear: { cash: 180, crates: 3 },
    requires: { beatBoss: 'ray', rep: 330 }, blurb: 'Top-speed country. Engines rule the highway.',
  },
  {
    id: 'tapeback-trophy', name: 'Tapeback Trophy', district: 'scrapyard', track: 'scrapyard', rivals: ['nell', 'oz', 'pip'], carOnly: 'junker',
    payout: { cash: [120, 85, 62, 46], rep: [14, 10, 8, 6], crates: [2, 1, 1, 0] }, firstClear: { cash: 150, crates: 3 },
    requires: { car: 'beater' }, blurb: 'Tapebacks only. Bring your first car back for a grudge match.',
  },
  {
    id: 'foundry-final', name: 'Foundry Invitational', district: 'suburbs', track: 'foundry', rivals: ['hank', 'sol', 'priya'],
    payout: { cash: [240, 175, 130, 96], rep: [36, 26, 19, 15], crates: [3, 2, 1, 1] },
    firstClear: { cash: 280, crates: 4 },
    requires: { beatBoss: 'ray', car: 'muscle' }, blurb: 'Tight bends test your grip. Save nitro for the exits.',
  },
  // ---- Open Road chapter: the Coastal Crown rival series (opens after the Foundry Invitational)
  {
    id: 'harbor-launch', name: 'Harbor Launch', district: 'coastal', track: 'harbor', rivals: ['mara', 'dane', 'lux'],
    series: { id: 'crown', name: 'Coastal Crown', round: 1, of: 3 },
    payout: { cash: [300, 210, 160, 120], rep: [44, 32, 24, 18], crates: [2, 1, 1, 1] }, firstClear: { cash: 350, crates: 4 },
    requires: { afterWin: 'foundry-final' }, blurb: 'Round 1 of the Coastal Crown. A long launch off the harbor wall rewards turbo and traction.',
  },
  {
    id: 'cliff-esses', name: 'Cliffside Esses', district: 'coastal', track: 'cliffs', rivals: ['dane', 'lux', 'mara'],
    series: { id: 'crown', name: 'Coastal Crown', round: 2, of: 3 },
    payout: { cash: [330, 230, 170, 130], rep: [48, 34, 26, 20], crates: [2, 1, 1, 1] }, firstClear: { cash: 400, crates: 4 },
    requires: { afterWin: 'harbor-launch' }, blurb: 'Round 2. Three tight bends above the sea: grip, then nitro out of each exit.',
  },
  {
    id: 'coast-crown', name: 'Coastal Crown', district: 'coastal', track: 'coast', rivals: ['lux', 'dane', 'vale'],
    series: { id: 'crown', name: 'Coastal Crown', round: 3, of: 3 },
    payout: { cash: [360, 250, 185, 140], rep: [52, 36, 28, 22], crates: [3, 2, 1, 1] }, firstClear: { cash: 0, crates: 0 },
    requires: { afterWin: 'cliff-esses' },
    boss: { rival: 'vale', reward: { cash: 600, crates: 5, blueprint: 'Crown Teal', badge: 'Coastal Crown' } },
    blurb: 'Final round on the open Coast Road. Beat Vale Moreau to earn the right to an Altamar GT.',
  },
  // ---- Class meets: earlier cars come back off the shelf
  {
    id: 'corsa-club', name: 'Corsa Club Run', district: 'meets', track: 'maple', rivals: ['ines', 'bram', 'otto'], carOnly: 'beater', trophy: 'Sedan Club',
    payout: { cash: [190, 135, 100, 75], rep: [26, 18, 14, 10], crates: [2, 1, 1, 0] }, firstClear: { cash: 260, crates: 3 },
    requires: { car: 'hothatch' }, blurb: 'Corsa Rojos only, on the highway. A tuned sedan needs a strong engine here.',
  },
  {
    id: 'hatch-attack', name: 'Hatch Attack', district: 'meets', track: 'cliffs', rivals: ['zoe', 'rafa', 'kit'], carOnly: 'hothatch', trophy: 'Hatch Hero',
    payout: { cash: [260, 185, 140, 105], rep: [34, 24, 18, 14], crates: [2, 1, 1, 0] }, firstClear: { cash: 340, crates: 3 },
    requires: { afterWin: 'harbor-launch' }, blurb: 'Vexa GTis only, through the cliff esses. Nimble beats powerful here.',
  },
  // ---- Time attack: beat the clock on courses you know (no rivals, medals pay once)
  {
    id: 'ta-strip', name: 'Strip Time Attack', district: 'trials', track: 'scrapyard', rivals: [], timeAttack: { bronze: 17.4, silver: 14.6, gold: 13.1 },
    payout: { cash: [40, 40, 40, 40], rep: [6, 6, 6, 6], crates: [0, 0, 0, 0] }, firstClear: { cash: 0, crates: 0 },
    requires: { beatBoss: 'ray' }, blurb: 'Solo run on Scrapyard Strip. Launch hard and hit both windows.',
  },
  {
    id: 'ta-maple', name: 'Highway Time Attack', district: 'trials', track: 'maple', rivals: [], timeAttack: { bronze: 20.6, silver: 18.4, gold: 16.6 },
    payout: { cash: [50, 50, 50, 50], rep: [8, 8, 8, 8], crates: [0, 0, 0, 0] }, firstClear: { cash: 0, crates: 0 },
    requires: { car: 'hothatch' }, blurb: 'Solo run on Maple Highway. Top speed and two clean boosts.',
  },
  {
    id: 'ta-cliffs', name: 'Esses Time Attack', district: 'trials', track: 'cliffs', rivals: [], timeAttack: { bronze: 22.3, silver: 21.5, gold: 19.9 },
    payout: { cash: [60, 60, 60, 60], rep: [10, 10, 10, 10], crates: [0, 0, 0, 0] }, firstClear: { cash: 0, crates: 0 },
    requires: { afterWin: 'harbor-launch' }, blurb: 'Solo run through Cliffside Esses. Every bend exit counts.',
  },
];

/** Medal rewards for time attack, each paid once per event. */
export const MEDALS = ['bronze', 'silver', 'gold'] as const;
export type Medal = (typeof MEDALS)[number];
export const MEDAL_REWARDS: Record<Medal, { cash: number; crates: number }> = {
  bronze: { cash: 120, crates: 1 },
  silver: { cash: 240, crates: 2 },
  gold: { cash: 450, crates: 3 },
};

export const eventById = (id: string): RaceEvent => {
  const e = EVENTS.find((x) => x.id === id);
  if (!e) throw new Error(`Unknown event ${id}`);
  return e;
};

/** Rep bonus for racing an event that wasn't one of your last two (nudges variety instead of one-race grinding). */
export const FRESH_ROUTE_BONUS = 0.75;
export const FRESH_ROUTE_AFTER_RACES = 3;
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
