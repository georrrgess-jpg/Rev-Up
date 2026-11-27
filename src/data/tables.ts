// Rev Up — data tables. All tuning knobs live here so rules stay data-driven.
// Values marked "tunable" are referenced by the playthrough test and README.

export type Family = 'engine' | 'tires' | 'turbo' | 'transmission' | 'aero';
export type Quality = 'std' | 'polished' | 'mint';
export type CarId =
  | 'junker' | 'beater' | 'hothatch' | 'muscle' | 'tourer' | 'tuner' | 'super' | 'rally' | 'gt' | 'proto'
  // 1.8 supercars (after the Halcyon X): nimble high-revver, punchy twin-turbo, flagship
  | 'vireo' | 'mako' | 'sovereign'
  // Legacy placeholder id (never enabled; kept so old data still type-checks):
  | 'hyper';

// ---------------- Cash steps ----------------
/** The step a cash amount lands on: $5 up to $100, $10 up to $1,000, $50 above (docs/CONTRACTS.md). */
export const cashStep = (x: number) => (Math.abs(x) <= 100 ? 5 : Math.abs(x) <= 1000 ? 10 : 50);
/** Round a computed price or payout to its step (nearest). Every rule that makes a cash amount goes through this,
 *  so the preview, the payout and the wallet always agree. */
export const roundCash = (x: number) => {
  if (!Number.isFinite(x) || x <= 0) return 0;
  const r = Math.round(x / cashStep(x)) * cashStep(x);
  return Math.round(r / cashStep(r)) * cashStep(r); // re-check across a boundary (e.g. 1,020 → 1,000)
};
/** Round down to a step (away earnings: never pay more than accrued). */
export const floorCash = (x: number) => {
  if (!Number.isFinite(x) || x <= 0) return 0;
  let r = Math.floor(x / cashStep(x)) * cashStep(x);
  if (r % cashStep(r)) r = Math.floor(r / cashStep(r)) * cashStep(r);
  return r;
};
export const onCashStep = (x: number) => x >= 0 && Number.isInteger(x) && x % cashStep(x) === 0;

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

/** Highest tier reachable in this release. T8 opens with the Corvo Rally and Strata GTR, T9 with the Halcyon X,
 *  and T10 with the Sovereign (the flagship, cap T10): two T9s merge into a T10 once you hold them, and the
 *  Sovereign's keystone is a crafted T10 Engine. T10 is never sold (orders stop one tier below the top). */
export const MAX_TIER = 10; // tunable
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

export const MERGE_CASH = (tier: number) => roundCash(tier * 2); // reward per fusion: $5 for T2–T3 … $20 for T9 (T1 never results)
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
  shows?: 'always' | 'quick' | 'cars3' | 'cars4' | 'cars7';
}

export const PRINTER_INTERVAL_S = [20, 16, 13, 10, 8]; // by printer level
/** Crate tier odds by crate-tier level: weights for T1..T3 */
export const CRATE_TIER_ODDS: number[][] = [
  [1, 0, 0],
  [0.75, 0.25, 0],
  [0.5, 0.45, 0.05],
  [0.25, 0.6, 0.15],
  [0.15, 0.5, 0.35], // late: a third T3 parts
];

export const UPGRADES: UpgradeDef[] = [
  { id: 'grid', name: 'Bigger bench', about: 'More room to line up merges.', levels: [{ cost: 600, label: 'Board grows from 5×6 to 6×7 (+12 slots)' }] },
  {
    id: 'printer', name: 'Faster printer', about: 'The free crate printer in your garage.', levels: [
      { cost: 250, label: 'Crate every 16 s' },
      { cost: 750, label: 'Crate every 13 s' },
      { cost: 1600, label: 'Crate every 10 s' },
      { cost: 4000, label: 'Crate every 8 s' },
    ],
  },
  {
    id: 'crateTier', name: 'Better crates', about: 'Higher tiers in every crate you get.', levels: [
      { cost: 450, label: '25% chance of T2 parts' },
      { cost: 1200, label: 'Half T2, a few T3 parts' },
      { cost: 2400, label: 'Mostly T2, 15% T3 parts' },
      { cost: 6000, label: 'Half T2, 35% T3 parts' },
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
      { cost: 2500, label: 'Away earnings: a full claim is 2 race purses over 12 h (was 1.5 over 8 h)' },
    ],
  },
];

// ---------------- Economy (one table: prices, payouts, rates) ----------------
// Prices are set in runs of play: see README "Economy". Cash buys things; Rep marks progress; scrap buys crates.
/** Order a Part: a known family and tier, by tier. Each tier costs a bit more than two of the tier below,
 *  so merging stays the cheaper route and buying is the reliable one. Keystones (a car's top tier) must be crafted. */
export const PART_ORDER_PRICE = [0, 40, 90, 220, 520, 1200, 2800, 6500, 15000, 32000]; // T2 $90: affordable after the first race; T9 sells once the Sovereign is the goal
/** Quick Race cash, as a share of the live purse for that place, by Pit crew level. */
export const QUICK_PAY_SHARE = [0.7, 0.85]; // live stays worth playing: the crew never earns the full purse
/** Each Perfect boost pays this share of the event's win purse (live, at most two). */
export const PERFECT_BONUS_SHARE = 0.1;
/** Hours of away earnings that can build up, by Lock-up level. */
export const OFFLINE_HOURS = [8, 12];
/** Away earnings: one budget for the whole garage (owning more cars never adds to it). A full claim is worth this
 *  many win purses of your best open ordinary race, by Lock-up level, building evenly over OFFLINE_HOURS.
 *  1.5 purses funds the next part order or two without skipping the next car (README "Away earnings"). */
export const OFFLINE_BUDGET_RACES = [1.5, 2];
/** Workshop scrap orders: a part of the family and tier you pick, for scrap. Twice its recycle value, so
 *  buy → recycle always loses and merging stays the cheaper route (two T(n) make a T(n+1)). */
export const scrapOrderCost = (tier: number) => (SCRAP_VALUE[tier] ?? 0) * 2;
/** Workshop polish: a standard part becomes Polished (+15%, the same bonus as a lucky merge) for scrap.
 *  1.5× its recycle value (rounded up); the polish is lost when the part is merged, recycling pays the same. */
export const polishCost = (tier: number) => Math.ceil((SCRAP_VALUE[tier] ?? 0) * 1.5);
export const nitroCapFor = (tankLevel: number) => NITRO_CAP + tankLevel;
/** Tune-up: up to three stages per car, each +2% top speed, acceleration and grip. The cash route to a competitive
 *  car for players who don't land Perfect boosts; skilled players can save the money. Not used in the Stock Cup. */
export const TUNE_STAGES = 3;
export const TUNE_STEP = 0.02;
export const TUNE_PRICE: Partial<Record<CarId, number>> = { junker: 120, beater: 260, hothatch: 600, muscle: 1300, tourer: 2200, tuner: 2200, super: 3600, rally: 4500, gt: 5500, proto: 7000, vireo: 8000, mako: 9000, sovereign: 11000 };
/** Stage 0→1, 1→2, 2→3: ×1, ×1.6, ×2.2 of the car's base, on a cash step (Tapeback $120 / $190 / $260). */
export const tunePrice = (car: CarId, stage: number) => roundCash((TUNE_PRICE[car] ?? 1000) * (1 + stage * 0.6));

/** Paint shop: cosmetic only, never performance. Colours and wheel sets are bought once and fit any car;
 *  premium paint is bought per car; the Tapeback restoration is three staged jobs. `opens`: cars owned. */
export type StyleKind = 'paint' | 'wheel' | 'material' | 'restore' | 'livery';
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
  { id: 'wheel:gravel', kind: 'wheel', name: 'Gravel wheels', price: 1800, value: 'gravel', opens: 7, blurb: 'Tough white rally wheels with chunky tyres.' },
  { id: 'wheel:race', kind: 'wheel', name: 'Race wheels', price: 3000, value: 'race', opens: 8, blurb: 'Centre-lock forged race wheels and big brakes.' },
  { id: 'material:matte', kind: 'material', name: 'Matte', price: 1500, value: 'matte', opens: 4, blurb: 'A flat, satin finish with no shine at all. For this car.' },
  { id: 'material:flip', kind: 'material', name: 'Colour flip', price: 7000, value: 'flip', opens: 7, blurb: 'Shifts hue as the light moves over it. For this car.' },
  { id: 'material:chrome', kind: 'material', name: 'Chrome', price: 8000, value: 'chrome', opens: 8, blurb: 'A mirror finish over the paint colour. For this car.' },
  // Liveries: graphics over the paint, bought (or earned) once and fit every car.
  { id: 'livery:stripes', kind: 'livery', name: 'Twin stripes', price: 400, value: 'stripes', opens: 2, blurb: 'Two bold stripes nose to tail.' },
  { id: 'livery:sweep', kind: 'livery', name: 'Side sweep', price: 400, value: 'sweep', opens: 2, blurb: 'One tapered stripe that kicks up over the rear wheel.' },
  { id: 'livery:number', kind: 'livery', name: 'Race number', price: 600, value: 'number', opens: 3, blurb: 'A door roundel with your number and a sun strip.' },
  { id: 'livery:checker', kind: 'livery', name: 'Checker fade', price: 900, value: 'checker', opens: 4, blurb: 'A chequered flag that fades along the flank.' },
  { id: 'livery:twotone', kind: 'livery', name: 'Two-tone', price: 900, value: 'twotone', opens: 4, blurb: 'A contrasting lower body under a fine pinstripe.' },
  { id: 'livery:flames', kind: 'livery', name: 'Flames', price: 1500, value: 'flames', opens: 5, blurb: 'Hot-rod flames licking back from the front wheel.' },
  { id: 'livery:neon', kind: 'livery', name: 'Neon line', price: 2500, value: 'neon', opens: 6, blurb: 'Glowing lines along the shoulder and sill. Earned by winning a Downtown Nights event.' },
  { id: 'livery:rally', kind: 'livery', name: 'Rally slash', price: 2000, value: 'rally', opens: 7, blurb: 'Diagonal slashes and a door number panel. Earned by a podium in the Corvo Rally.' },
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
  unlock: null | { rep: number; family: Family; tier: number; event?: string; stars?: number };
  /** Perfect boosts on this car hit harder than the usual 1.5× (the Lumen RS's Surge). */
  perfectMul?: number;
  enabled: boolean;
  paint: string;
  trim: string;
  blurb: string;
  offlineRate: number; // legacy (1.4–1.5 per-car away rate); away earnings now use one garage budget (OFFLINE_BUDGET_RACES)
  rev: { base: number; peak: number }; // reveal sound
  /** One line on how it drives, shown in the Showroom. */
  handling?: string;
}

export type DistrictId = 'scrapyard' | 'suburbs' | 'meets' | 'trials' | 'downtown' | 'coastal' | 'riviera' | 'neon' | 'desert' | 'summit';

export const DISTRICTS: Record<DistrictId, { name: string; enabled: boolean }> = {
  scrapyard: { name: 'Scrapyard', enabled: true },
  suburbs: { name: 'Suburbs', enabled: true },
  downtown: { name: 'Downtown Nights', enabled: true },
  coastal: { name: 'Coastal Highway', enabled: true },
  meets: { name: 'Class meets', enabled: true },
  trials: { name: 'Time attack', enabled: true },
  riviera: { name: 'Azure Riviera', enabled: true },
  neon: { name: 'Neon Skyline', enabled: false },
  desert: { name: 'Desert Proving Ground', enabled: true },
  summit: { name: 'The Summit', enabled: true },
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
  {
    id: 'tourer', name: 'Grand tourer', model: 'Altamar GT', district: 'coastal', cap: 6,
    base: { top: 46, accel: 5.7, grip: 0.97 }, unlock: { rep: 2300, family: 'engine', tier: 6, event: 'coast-crown' }, enabled: true,
    paint: '#0f6b6b', trim: '#e9d8b4', blurb: 'A long-tailed coastal grand tourer with covered lamps and a cream-leather cabin. Built for the open road.',
    offlineRate: 6, rev: { base: 70, peak: 230 }, handling: 'Fastest on long straights and fast sweepers; heavier off the line.',
  },
  {
    id: 'tuner', name: 'Lightweight', model: 'Kestrel 1600', district: 'downtown', cap: 6,
    base: { top: 40, accel: 7.0, grip: 1.25 }, unlock: { rep: 2700, family: 'tires', tier: 6, stars: 3 }, enabled: true,
    paint: '#efc12c', trim: '#1b1d21', blurb: 'A stripped, high-revving coupe built for the city. Thin glass, no carpet, all corner.',
    offlineRate: 7, rev: { base: 95, peak: 320 }, handling: 'Best off the line and through tight corners; runs out of top end on highways.',
  },
  {
    id: 'super', name: 'Hypercar', model: 'Lumen RS', district: 'downtown', cap: 7,
    base: { top: 50, accel: 6.8, grip: 0.95 }, unlock: { rep: 2800, family: 'turbo', tier: 7, event: 'main-event' }, enabled: true, perfectMul: 1.7,
    paint: '#1a1430', trim: '#b9a6ff', blurb: 'A low, hybrid hypercar with a light-bar face and a violet Surge trail. Won, not bought.',
    offlineRate: 9, rev: { base: 85, peak: 300 }, handling: 'Fastest car on any highway; its Surge makes Perfect boosts 1.7× instead of 1.5×. Heavier in tight corners than the Kestrel.',
  },
  // ---- Endgame: the Desert Proving Ground and the Summit (Rep + a crafted keystone + a won series or event each)
  {
    id: 'rally', name: 'Rally', model: 'Corvo Rally', district: 'desert', cap: 8,
    base: { top: 41, accel: 8.4, grip: 1.25 }, unlock: { rep: 6000, family: 'tires', tier: 8, event: 'canyon-qualifier' }, enabled: true,
    paint: '#1f62c9', trim: '#f5c518', blurb: 'A short, tough AWD rally coupe: roof scoop, a four-lamp light pod, mud flaps. Built to be thrown at gravel.',
    offlineRate: 11, rev: { base: 75, peak: 270 }, handling: 'All-wheel drive: the hardest launches and the best grip on loose, tight bends. Quick to its top speed, then it tops out (~150 mph).',
  },
  {
    id: 'gt', name: 'Endurance GT', model: 'Strata GTR', district: 'summit', cap: 8,
    base: { top: 50, accel: 6.6, grip: 1.45 }, unlock: { rep: 9500, family: 'engine', tier: 8, event: 'rally-final' }, enabled: true,
    paint: '#d5dade', trim: '#d6202a', blurb: 'A wide endurance racer with a splitter, a swan-neck wing and race numbers. Built to run flat out for hours.',
    offlineRate: 13, rev: { base: 70, peak: 260 }, handling: 'Aero grip: the fastest car through fast sweepers, strong at speed (~200 mph on a long straight, fully built). Softer off the line than the Corvo.',
  },
  {
    id: 'proto', name: 'Prototype', model: 'Halcyon X', district: 'summit', cap: 9,
    base: { top: 54, accel: 7.4, grip: 1.36 }, unlock: { rep: 14000, family: 'turbo', tier: 9, event: 'summit-1000' }, enabled: true,
    paint: '#1d4e6b', trim: '#36f0d0', blurb: 'A closed-cockpit prototype with a shark fin and a light blade. The fastest thing in the game, and the hardest to drive well.',
    offlineRate: 16, rev: { base: 90, peak: 340 }, handling: 'The highest top speed (~225 mph on a long straight, fully built) and strong everywhere, with the narrowest shift light in the game: missed shifts cost it the most.',
  },
  // ---- Azure Riviera (after the Summit Gala): three supercars, each won on the course that suits the one before
  // it. Rep + a crafted keystone + a won event, like the rest. The Vireo is the Summit Gala's prize; the Mako is won
  // in the Vireo on the Corniche Hairpins; the Sovereign in the Mako on the Port Sprint, then the Grand Riviera.
  {
    id: 'vireo', name: 'Supercar', model: 'Vireo 9R', district: 'riviera', cap: 9,
    base: { top: 50, accel: 7.0, grip: 1.72 }, unlock: { rep: 15000, family: 'tires', tier: 9, event: 'summit-gala' }, enabled: true,
    paint: '#e23c2e', trim: '#f4f1ea', blurb: 'A short, light mid-engine coupe with a screaming V10 and a glass engine cover. It wants the limiter.',
    offlineRate: 16, rev: { base: 110, peak: 380 }, handling: 'Nimble and high-revving: the quickest change of direction in the game; wins the tight, technical courses. Short of the Halcyon on a long straight.',
  },
  {
    id: 'mako', name: 'Supercar', model: 'Mako TT', district: 'riviera', cap: 9,
    base: { top: 51, accel: 8.6, grip: 1.24 }, unlock: { rep: 18500, family: 'engine', tier: 9, event: 'corniche' }, enabled: true,
    paint: '#1c2a24', trim: '#c7f23a', blurb: 'A wide, angry twin-turbo coupe with side gills and quad exits. All shove, all the time.',
    offlineRate: 17, rev: { base: 70, peak: 280 }, handling: 'Twin-turbo punch: the hardest launch and pull out of slow corners and short straights; heavier through long sweepers.',
  },
  {
    id: 'sovereign', name: 'Flagship', model: 'Sovereign', district: 'riviera', cap: 10,
    base: { top: 58, accel: 8.4, grip: 1.36 }, unlock: { rep: 23000, family: 'engine', tier: 10, event: 'port-sprint' }, enabled: true,
    paint: '#f1ece2', trim: '#c9a24a', blurb: 'The flagship: a long, low V12 hybrid with a blade of light front and rear. The car the whole garage builds toward.',
    offlineRate: 18, rev: { base: 80, peak: 320 }, handling: 'The only car that runs T10 parts: the fastest in the game and calm at any speed; its long wheelbase gives up a little in the tightest hairpins.',
  },
  { id: 'hyper', name: 'Hypercar', model: 'One-of-one', district: 'summit', cap: 10, base: { top: 64, accel: 8.5, grip: 1.15 }, unlock: { rep: 99999, family: 'engine', tier: 10 }, enabled: false, paint: '#555', trim: '#999', blurb: 'Legacy placeholder (never enabled).', offlineRate: 10, rev: { base: 60, peak: 200 } },
];

export const ENABLED_CARS = CARS.filter((c) => c.enabled);
export const SIGNATURE_FINISHES: Partial<Record<CarId, { name: string; paint: string; stripe: string }>> = {
  junker: { name: 'Petrol Blue', paint: '#237481', stripe: '#e6b366' },
  beater: { name: 'Creamline', paint: '#d2b58b', stripe: '#394252' },
  hothatch: { name: 'Apex Violet', paint: '#6247a4', stripe: '#9ee3c9' },
  muscle: { name: 'Midnight Bronze', paint: '#70442d', stripe: '#f3c975' },
  tourer: { name: 'Riviera Pearl', paint: '#e8e2d2', stripe: '#b0862f' },
  tuner: { name: 'Street Orange', paint: '#e8641c', stripe: '#1b1d21' },
  super: { name: 'Afterglow', paint: '#3a1d6e', stripe: '#ff5fb8' },
  rally: { name: 'Sandstorm', paint: '#d9a441', stripe: '#1f62c9' },
  gt: { name: 'Le Mans Night', paint: '#14181f', stripe: '#f2c94c' },
  proto: { name: 'Aurora', paint: '#0c1a2a', stripe: '#9b7bff' },
  vireo: { name: 'Rosso Lacets', paint: '#9e1b22', stripe: '#f4f1ea' },
  mako: { name: 'Deep Reef', paint: '#0f4a52', stripe: '#c7f23a' },
  sovereign: { name: 'Royal Ink', paint: '#141a3a', stripe: '#d8b45a' },
};

export const RAY_FINISH = { name: 'Ray’s Rust-Red', paint: '#a8432a' };
/** Won from Vale Moreau in the Coastal Crown; usable on any car. */
export const CROWN_FINISH = { name: 'Crown Teal', paint: '#127c8a' };
/** Won from Nova Sato in The Main Event; usable on any car. */
export const MAIN_EVENT_FINISH = { name: 'Main Event Neon', paint: '#e2337a' };
/** Won from Sable Dunn in the Canyon Rally final; usable on any car. */
export const RALLY_FINISH = { name: 'Canyon Ochre', paint: '#c2652a' };
/** Won from Iver Kaas in the Summit Gala, the grand finale; usable on any car. */
export const SUMMIT_FINISH = { name: 'Summit Ice', paint: '#bfe6f2' };
/** Won from Aurelia Stern in the Grand Riviera, the flagship final; usable on any car. */
export const RIVIERA_FINISH = { name: 'Riviera Gold', paint: '#c9a24a' };
/** Blueprint finishes that any owned car can wear, by blueprint name. */
export const BLUEPRINT_FINISHES = [RAY_FINISH, CROWN_FINISH, MAIN_EVENT_FINISH, RALLY_FINISH, SUMMIT_FINISH, RIVIERA_FINISH];

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
  id: 'scrapyard' | 'maple' | 'foundry' | 'harbor' | 'cliffs' | 'coast' | 'downtown' | 'bridge' | 'skyline' | 'dunes' | 'canyon' | 'mesa' | 'pass' | 'summit'
    | 'corniche' | 'port' | 'grand';
  name: string;
  district: DistrictId;
  segments: Segment[];
  theme: 'scrap' | 'suburb' | 'foundry' | 'coast' | 'night' | 'desert' | 'summit'; // desert/summit: Overhaul endgame (docs/CONTRACTS.md)
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
    id: 'foundry', name: 'Foundry Circuit', district: 'suburbs', theme: 'foundry', course: 'Tight bends', favours: 'Tires through the bends',
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
  downtown: {
    id: 'downtown', name: 'Neon Mile', district: 'downtown', theme: 'night', course: 'Street circuit · four tight corners', favours: 'Grip and acceleration out of each corner',
    segments: [
      { type: 'launch', length: 70 },
      { type: 'bend', length: 60, radius: 30 },
      { type: 'straight', length: 120, window: [0.06, 0.42] },
      { type: 'bend', length: 55, radius: 26 },
      { type: 'straight', length: 110, window: [0.06, 0.42] },
      { type: 'bend', length: 60, radius: 34 },
      { type: 'straight', length: 140, window: [0.06, 0.4] },
    ],
  },
  bridge: {
    id: 'bridge', name: 'Harbor Bridge', district: 'downtown', theme: 'night', course: 'Bridge drag · speed trap at the far end', favours: 'Engine top speed and a well-timed boost',
    segments: [
      { type: 'launch', length: 90 },
      { type: 'highway', length: 420, window: [0.1, 0.42] },
      { type: 'highway', length: 120 },
    ],
  },
  skyline: {
    id: 'skyline', name: 'Skyline Run', district: 'downtown', theme: 'night', course: 'Expressway · sweepers, then a tight exit', favours: 'Top speed, then grip at the end',
    segments: [
      { type: 'launch', length: 80 },
      { type: 'highway', length: 300, window: [0.15, 0.45] },
      { type: 'hwbend', length: 120, radius: 120 },
      { type: 'straight', length: 160, window: [0.1, 0.45] },
      { type: 'bend', length: 60, radius: 40 },
      { type: 'highway', length: 240, window: [0.1, 0.4] },
    ],
  },
  // ---- Desert Proving Ground (theme desert): loose gravel launches and tight canyon bends
  dunes: {
    id: 'dunes', name: 'Dune Wash', district: 'desert', theme: 'desert', course: 'Rally sprint · loose launch, two gravel bends', favours: 'Traction off the line and grip in the bends',
    segments: [
      { type: 'launch', length: 120 },
      { type: 'straight', length: 170, window: [0.1, 0.45] },
      { type: 'bend', length: 70, radius: 36 },
      { type: 'straight', length: 160, window: [0.06, 0.42] },
      { type: 'bend', length: 60, radius: 30 },
      { type: 'straight', length: 140, window: [0.06, 0.42] },
    ],
  },
  canyon: {
    id: 'canyon', name: 'Red Canyon Stage', district: 'desert', theme: 'desert', course: 'Rally stage · four hairpins on loose rock', favours: 'Grip, and acceleration out of every hairpin',
    segments: [
      { type: 'launch', length: 90 },
      { type: 'bend', length: 60, radius: 26 },
      { type: 'straight', length: 130, window: [0.05, 0.42] },
      { type: 'bend', length: 55, radius: 22 },
      { type: 'straight', length: 120, window: [0.05, 0.42] },
      { type: 'bend', length: 60, radius: 30 },
      { type: 'straight', length: 110 },
      { type: 'bend', length: 50, radius: 25 },
      { type: 'straight', length: 150, window: [0.05, 0.4] },
    ],
  },
  mesa: {
    id: 'mesa', name: 'Mesa Flats', district: 'desert', theme: 'desert', course: 'Salt-flat highway · one long sweeper', favours: 'Engine top speed and a late boost',
    segments: [
      { type: 'launch', length: 80 },
      { type: 'highway', length: 380, window: [0.12, 0.4] },
      { type: 'hwbend', length: 150, radius: 170 },
      { type: 'highway', length: 320, window: [0.1, 0.38] },
    ],
  },
  // ---- The Summit (theme summit): fast mountain sweepers and the grand-finale circuit
  pass: {
    id: 'pass', name: 'Glacier Pass', district: 'summit', theme: 'summit', course: 'Mountain pass · three fast sweepers', favours: 'Grip at speed: aero through the sweepers',
    segments: [
      { type: 'launch', length: 80 },
      { type: 'highway', length: 220, window: [0.12, 0.45] },
      { type: 'hwbend', length: 140, radius: 110 },
      { type: 'highway', length: 160 },
      { type: 'hwbend', length: 130, radius: 95 },
      { type: 'straight', length: 140, window: [0.05, 0.45] },
      { type: 'hwbend', length: 120, radius: 130 },
      { type: 'highway', length: 200 },
    ],
  },
  summit: {
    id: 'summit', name: 'Summit Circuit', district: 'summit', theme: 'summit', course: 'Full mountain circuit · sweepers, hairpins and three straights', favours: 'Everything: top speed, grip and clean shifts',
    segments: [
      { type: 'launch', length: 80 },
      { type: 'highway', length: 300, window: [0.12, 0.42] },
      { type: 'hwbend', length: 140, radius: 120 },
      { type: 'straight', length: 150 },
      { type: 'bend', length: 70, radius: 45 },
      { type: 'highway', length: 260, window: [0.08, 0.4] },
      { type: 'hwbend', length: 130, radius: 100 },
      { type: 'straight', length: 160 },
      { type: 'bend', length: 60, radius: 38 },
      { type: 'highway', length: 280, window: [0.08, 0.38] },
    ],
  },
  // ---- Azure Riviera (drawn with the coast scene until it has its own): one course per supercar's strength
  corniche: {
    id: 'corniche', name: 'Corniche Hairpins', district: 'riviera', theme: 'coast', course: 'Cliff road · five tight hairpins, short straights', favours: 'Grip and quick direction changes',
    segments: [
      { type: 'launch', length: 70 },
      { type: 'bend', length: 55, radius: 24 },
      { type: 'straight', length: 95, window: [0.05, 0.45] },
      { type: 'bend', length: 50, radius: 20 },
      { type: 'straight', length: 85, window: [0.05, 0.45] },
      { type: 'bend', length: 55, radius: 26 },
      { type: 'straight', length: 80 },
      { type: 'bend', length: 50, radius: 22 },
      { type: 'straight', length: 75 },
      { type: 'bend', length: 45, radius: 21 },
      { type: 'straight', length: 120, window: [0.05, 0.4] },
    ],
  },
  port: {
    id: 'port', name: 'Port Sprint', district: 'riviera', theme: 'coast', course: 'Harbour streets · a long launch, slow corners, short straights', favours: 'Acceleration: the launch and every corner exit',
    segments: [
      { type: 'launch', length: 185 },
      { type: 'straight', length: 110, window: [0.05, 0.5] },
      { type: 'bend', length: 50, radius: 44 },
      { type: 'straight', length: 115, window: [0.04, 0.48] },
      { type: 'bend', length: 50, radius: 42 },
      { type: 'straight', length: 100 },
      { type: 'bend', length: 45, radius: 46 },
      { type: 'straight', length: 130, window: [0.04, 0.45] },
    ],
  },
  grand: {
    id: 'grand', name: 'Grand Riviera', district: 'riviera', theme: 'coast', course: 'Coast boulevard · three long straights, two fast sweepers', favours: 'Top speed, and nerve through the fast sweepers',
    segments: [
      { type: 'launch', length: 80 },
      { type: 'highway', length: 380, window: [0.12, 0.4] },
      { type: 'hwbend', length: 160, radius: 170 },
      { type: 'highway', length: 340, window: [0.1, 0.38] },
      { type: 'hwbend', length: 150, radius: 150 },
      { type: 'highway', length: 400, window: [0.08, 0.36] },
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
  kai: { id: 'kai', name: 'Kai Mercer', car: 'tuner', paint: '#20c4c4', line: 'Lives on the Neon Mile. Brakes later than anyone.', stats: { top: 50.5, accel: 9.6, grip: 1.75 } },
  rhea: { id: 'rhea', name: 'Rhea Volk', car: 'tourer', paint: '#c0185b', line: 'Drives a black-cherry Altamar like it owes her money.', stats: { top: 55.0, accel: 9.0, grip: 1.55 } },
  jules: { id: 'jules', name: 'Jules Ortega', car: 'hothatch', paint: '#ffb000', line: 'Night courier. Knows every shortcut and takes none of them.', stats: { top: 49.5, accel: 9.8, grip: 1.6 } },
  mina: { id: 'mina', name: 'Mina Hart', car: 'muscle', paint: '#3b5bff', line: 'Electric-blue Ironhorse, rebuilt twice.', stats: { top: 56.5, accel: 9.2, grip: 1.5 } },
  ozzy: { id: 'ozzy', name: 'Ozzy Lin', car: 'tuner', paint: '#8cff3a', line: 'Lime-green Kestrel and a laugh you hear over the engine.', stats: { top: 52.0, accel: 10.2, grip: 1.82 } },
  stock1: { id: 'stock1', name: 'Dex', car: 'beater', paint: '#5b6f8c', line: 'Back from the Scrapyard for the Stock Cup.', stats: { top: 47.0, accel: 8.6, grip: 1.5 } },
  stock2: { id: 'stock2', name: 'June', car: 'hothatch', paint: '#3e8e5a', line: 'Her Vexa on stock parts is still a Vexa.', stats: { top: 47.5, accel: 8.9, grip: 1.56 } },
  stock3: { id: 'stock3', name: 'Mara', car: 'muscle', paint: '#8c2f2f', line: 'Stock Ironhorse; all torque, no manners.', stats: { top: 49.0, accel: 8.4, grip: 1.45 } },
  nova: { id: 'nova', name: 'Nova Sato', car: 'super', paint: '#e2337a', line: 'Runs The Main Event. Drives the only other Lumen in the city.', stats: { top: 61.8, accel: 11.0, grip: 1.78 }, boss: true },
  nova2: { id: 'nova2', name: 'Nova Sato', car: 'super', paint: '#e2337a', line: 'Back for a rematch on the bridge, Lumen against Lumen.', stats: { top: 68.0, accel: 11.4, grip: 1.75 } },
  vale: { id: 'vale', name: 'Vale Moreau', car: 'tourer', paint: '#16233a', line: 'Owns the coast road. Drives the only Altamar anyone has seen.', stats: { top: 53.6, accel: 8.6, grip: 1.38 }, boss: true },
  sol: { id: 'sol', name: 'Sol Ortega', car: 'muscle', paint: '#264653', line: 'Quiet, precise, already in fifth gear.', stats: { top: 44.0, accel: 6.6, grip: 1.0 } },
  // ---- Desert Proving Ground
  tomas: { id: 'tomas', name: 'Tomás Reyes', car: 'rally', paint: '#c23b22', line: 'Three-time desert champion. Reads gravel like a newspaper.', stats: { top: 56.0, accel: 12.0, grip: 2.2 } },
  yara: { id: 'yara', name: 'Yara Bell', car: 'rally', paint: '#e0d4b8', line: 'Co-drove for ten years, then bought the car.', stats: { top: 55.0, accel: 12.4, grip: 2.25 } },
  odin: { id: 'odin', name: 'Odin Pike', car: 'tuner', paint: '#ff7a1a', line: 'Brought a city Kestrel to the desert. It mostly works.', stats: { top: 54.0, accel: 11.4, grip: 1.95 } },
  wren: { id: 'wren', name: 'Wren Calloway', car: 'rally', paint: '#3c7d4f', line: 'Never lifts on a crest. Has the dents to prove it.', stats: { top: 58.0, accel: 12.8, grip: 2.35 } },
  sable: { id: 'sable', name: 'Sable Dunn', car: 'rally', paint: '#2b2b2b', line: 'Runs the Canyon Rally. Her Corvo is older than you and faster than anything.', stats: { top: 60.0, accel: 13.6, grip: 2.45 }, boss: true },
  // class meets for older cars
  hank2: { id: 'hank2', name: 'Hank “Two-Tone”', car: 'muscle', paint: '#6b2737', line: 'Rebuilt his Ironhorse for the salt flats. Still no patience.', stats: { top: 56.0, accel: 10.6, grip: 1.5 } },
  mara2: { id: 'mara2', name: 'Mara Quint', car: 'muscle', paint: '#3d3a6b', line: 'Brought the drag-strip Ironhorse out of retirement.', stats: { top: 55.0, accel: 11.0, grip: 1.45 } },
  sol2: { id: 'sol2', name: 'Sol Ortega', car: 'muscle', paint: '#264653', line: 'Already in fifth gear. Always.', stats: { top: 56.5, accel: 10.4, grip: 1.5 } },
  lux2: { id: 'lux2', name: 'Lux Ferrin', car: 'tourer', paint: '#9a9fa8', line: 'Drove his Altamar up the mountain for the view. And the trophy.', stats: { top: 60.0, accel: 10.8, grip: 1.75 } },
  vale2: { id: 'vale2', name: 'Vale Moreau', car: 'tourer', paint: '#16233a', line: 'Wants her coast road back. Settles for the pass.', stats: { top: 61.0, accel: 10.6, grip: 1.8 } },
  rhea2: { id: 'rhea2', name: 'Rhea Volk', car: 'tourer', paint: '#c0185b', line: 'Black-cherry Altamar, new tyres, same grudge.', stats: { top: 60.5, accel: 11.0, grip: 1.72 } },
  // ---- The Summit
  mirelle: { id: 'mirelle', name: 'Mirelle Aubert', car: 'gt', paint: '#1c4fa0', line: 'Endurance pro. Does her fastest lap in the last hour.', stats: { top: 68.0, accel: 12.2, grip: 2.2 } },
  kenji: { id: 'kenji', name: 'Kenji Mori', car: 'gt', paint: '#f2f2f2', line: 'Aero engineer. Talks about downforce at dinner.', stats: { top: 69.0, accel: 11.8, grip: 2.25 } },
  nova3: { id: 'nova3', name: 'Nova Sato', car: 'super', paint: '#e2337a', line: 'Came up the mountain for one more race against you.', stats: { top: 70.0, accel: 12.4, grip: 1.85 } },
  bex: { id: 'bex', name: 'Bex Ardent', car: 'gt', paint: '#ff9e1b', line: 'Team orange. Never pits, never smiles.', stats: { top: 70.5, accel: 12.6, grip: 2.3 } },
  iver: { id: 'iver', name: 'Iver Kaas', car: 'proto', paint: '#f4f4f4', line: 'Built the Halcyon’s twin. Hosts the Summit Gala and has never lost it.', stats: { top: 78.0, accel: 14.6, grip: 2.5 }, boss: true },
  // ---- Azure Riviera
  ilse: { id: 'ilse', name: 'Ilse Brandvold', car: 'proto', paint: '#2f8fd6', line: 'Brought her Halcyon down from the Summit. Hates hairpins, wins them anyway.', stats: { top: 80.0, accel: 15.0, grip: 2.55 } },
  anouk: { id: 'anouk', name: 'Anouk Vidal', car: 'vireo', paint: '#f2f0e6', line: 'Grew up above the Corniche. Brakes where everyone else lifts.', stats: { top: 79.0, accel: 15.5, grip: 2.65 } },
  ravi: { id: 'ravi', name: 'Ravi Castellane', car: 'vireo', paint: '#1d6b4a', line: 'A test driver who never got the memo that testing is over.', stats: { top: 78.5, accel: 15.2, grip: 2.6 } },
  dario: { id: 'dario', name: 'Dario Belmonte', car: 'mako', paint: '#e8c547', line: 'Runs the port at night. His Mako launches like a dropped anchor in reverse.', stats: { top: 82.0, accel: 15.8, grip: 2.5 } },
  teo: { id: 'teo', name: 'Teo Marchand', car: 'mako', paint: '#3a3f47', line: 'Twin turbos, twin exhausts, one speed: all of it.', stats: { top: 82.5, accel: 16.0, grip: 2.55 } },
  iver2: { id: 'iver2', name: 'Iver Kaas', car: 'proto', paint: '#f4f4f4', line: 'Lost the Gala to you. Followed you down to the sea for a rematch.', stats: { top: 82.0, accel: 15.3, grip: 2.6 } },
  aurelia: { id: 'aurelia', name: 'Aurelia Stern', car: 'sovereign', paint: '#0d0d12', line: 'Hosts the Grand Riviera from the only other Sovereign. Has never seen anyone’s tail lights.', stats: { top: 90.0, accel: 17.0, grip: 2.85 }, boss: true },
};

export interface RaceEvent {
  id: string;
  name: string;
  district: DistrictId;
  track: Track['id'];
  rivals: string[]; // three rivals; a time attack has none
  payout: { cash: number[]; rep: number[]; crates: number[] }; // by placement 1..4
  firstClear: { cash: number; crates: number };
  requires: { rep?: number; car?: CarId; beatBoss?: string; afterWin?: string; stars?: number };
  /** Class-limited invitational: only this car may enter. */
  carOnly?: CarId;
  boss?: { rival: string; reward: { cash: number; crates: number; blueprint: string; badge: string } };
  /** Staged rival series: rounds open one at a time as each is won. */
  series?: { id: string; name: string; round: number; of: number };
  /** Replayable time target: no rivals, medals at these finish times (seconds). */
  timeAttack?: { bronze: number; silver: number; gold: number };
  /** Class meet trophy badge, awarded on the first win. */
  trophy?: string;
  /** Event goals (Downtown Nights): a star each for a win, a live time under par, and a Perfect boost. Each pays once. */
  goals?: { par: number };
  /** Rival shift quality: 'ordinary' (a beat late, the default) early on, 'clean' from the Coastal Crown onward. */
  rivalShift?: 'ordinary' | 'clean';
  /** Speed trap: scored on mph through the gate at the end of the course; medals at these speeds. */
  speedTrap?: { bronze: number; silver: number; gold: number };
  /** Stock class: every part runs at most this tier, on any car. */
  partCap?: number;
  /** Knockout: these heat events in order; the top `advance` places of each heat go through. */
  knockout?: { heats: string[] };
  /** A heat of a knockout (not listed on its own). */
  heatOf?: string;
  advance?: number;
  blurb: string;
}

export const EVENTS: RaceEvent[] = [
  {
    id: 'yard-sprint', name: 'Yard Sprint', district: 'scrapyard', track: 'scrapyard', rivals: ['gus', 'dex', 'mo'],
    payout: { cash: [55, 40, 30, 20], rep: [10, 7, 5, 4], crates: [1, 1, 0, 0] }, firstClear: { cash: 40, crates: 2 },
    requires: {}, blurb: 'Loose gravel, short straights. A good first race.',
  },
  {
    id: 'crusher-run', name: 'Crusher Run', district: 'scrapyard', track: 'scrapyard', rivals: ['lina', 'tug', 'bolt'],
    payout: { cash: [90, 65, 50, 35], rep: [15, 10, 8, 6], crates: [1, 1, 1, 0] }, firstClear: { cash: 70, crates: 2 },
    requires: { rep: 20 }, blurb: 'Past the car crusher. Launches decide it.',
  },
  {
    id: 'rusty-ray', name: 'Rusty Ray', district: 'scrapyard', track: 'scrapyard', rivals: ['tug', 'bolt', 'ray'],
    payout: { cash: [130, 90, 65, 50], rep: [22, 15, 11, 8], crates: [2, 1, 1, 0] }, firstClear: { cash: 0, crates: 0 },
    requires: { car: 'beater' },
    boss: { rival: 'ray', reward: { cash: 200, crates: 4, blueprint: 'Ray’s Rust-Red', badge: 'Scrapyard King' } },
    blurb: 'Beat the king of the Scrapyard to open the Suburbs.',
  },
  {
    id: 'cul-de-sac', name: 'Cul-de-sac Dash', district: 'suburbs', track: 'maple', rivals: ['bolt', 'june', 'priya'],
    payout: { cash: [140, 100, 75, 55], rep: [24, 16, 12, 9], crates: [1, 1, 0, 0] }, firstClear: { cash: 120, crates: 3 },
    requires: { beatBoss: 'ray' }, blurb: 'Sprinklers, speed bumps, and a long on-ramp.',
  },
  {
    id: 'maple-mile', name: 'Maple Mile', district: 'suburbs', track: 'maple', rivals: ['priya', 'hank', 'sol'],
    payout: { cash: [200, 140, 100, 80], rep: [32, 22, 16, 12], crates: [1, 1, 1, 0] }, firstClear: { cash: 180, crates: 3 },
    requires: { beatBoss: 'ray', rep: 330 }, blurb: 'Top-speed country. Engines rule the highway.',
  },
  {
    id: 'tapeback-trophy', name: 'Tapeback Trophy', district: 'scrapyard', track: 'scrapyard', rivals: ['nell', 'oz', 'pip'], carOnly: 'junker',
    payout: { cash: [120, 85, 60, 45], rep: [14, 10, 8, 6], crates: [2, 1, 1, 0] }, firstClear: { cash: 150, crates: 3 },
    requires: { car: 'beater' }, blurb: 'Tapebacks only. Bring your first car back for a grudge match.',
  },
  {
    id: 'foundry-final', name: 'Foundry Invitational', district: 'suburbs', track: 'foundry', rivals: ['hank', 'sol', 'priya'],
    payout: { cash: [240, 180, 130, 95], rep: [36, 26, 19, 15], crates: [3, 2, 1, 1] },
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
    payout: { cash: [360, 250, 180, 140], rep: [52, 36, 28, 22], crates: [3, 2, 1, 1] }, firstClear: { cash: 0, crates: 0 },
    requires: { afterWin: 'cliff-esses' },
    boss: { rival: 'vale', reward: { cash: 600, crates: 5, blueprint: 'Crown Teal', badge: 'Coastal Crown' } },
    blurb: 'Final round on the open Coast Road. Beat Vale Moreau to earn the right to an Altamar GT.',
  },
  // ---- Class meets: earlier cars come back off the shelf
  {
    id: 'corsa-club', name: 'Corsa Club Run', district: 'meets', track: 'maple', rivals: ['ines', 'bram', 'otto'], carOnly: 'beater', trophy: 'Sedan Club',
    payout: { cash: [190, 140, 100, 75], rep: [26, 18, 14, 10], crates: [2, 1, 1, 0] }, firstClear: { cash: 260, crates: 3 },
    requires: { car: 'hothatch' }, blurb: 'Corsa Rojos only, on the highway. A tuned sedan needs a strong engine here.',
  },
  {
    id: 'hatch-attack', name: 'Hatch Attack', district: 'meets', track: 'cliffs', rivals: ['zoe', 'rafa', 'kit'], carOnly: 'hothatch', trophy: 'Hatch Hero',
    payout: { cash: [260, 180, 140, 100], rep: [34, 24, 18, 14], crates: [2, 1, 1, 0] }, firstClear: { cash: 340, crates: 3 },
    requires: { afterWin: 'harbor-launch' }, blurb: 'Vexa GTis only, through the cliff esses. Nimble beats powerful here.',
  },
  // ---- Time attack: beat the clock on courses you know (no rivals, medals pay once)
  {
    id: 'ta-strip', name: 'Strip Time Attack', district: 'trials', track: 'scrapyard', rivals: [], timeAttack: { bronze: 16.4, silver: 15.9, gold: 15.5 },
    payout: { cash: [40, 40, 40, 40], rep: [6, 6, 6, 6], crates: [0, 0, 0, 0] }, firstClear: { cash: 0, crates: 0 },
    requires: { beatBoss: 'ray' }, blurb: 'Solo run on Scrapyard Strip. Launch hard and hit both windows.',
  },
  {
    id: 'ta-maple', name: 'Highway Time Attack', district: 'trials', track: 'maple', rivals: [], timeAttack: { bronze: 18.8, silver: 18.4, gold: 17.9 },
    payout: { cash: [50, 50, 50, 50], rep: [8, 8, 8, 8], crates: [0, 0, 0, 0] }, firstClear: { cash: 0, crates: 0 },
    requires: { car: 'hothatch' }, blurb: 'Solo run on Maple Highway. Top speed and two clean boosts.',
  },
  {
    id: 'ta-cliffs', name: 'Esses Time Attack', district: 'trials', track: 'cliffs', rivals: [], timeAttack: { bronze: 20.6, silver: 20.3, gold: 20.0 },
    payout: { cash: [60, 60, 60, 60], rep: [10, 10, 10, 10], crates: [0, 0, 0, 0] }, firstClear: { cash: 0, crates: 0 },
    requires: { afterWin: 'harbor-launch' }, blurb: 'Solo run through Cliffside Esses. Every bend exit counts.',
  },
  // ---------------- Downtown Nights (after the Altamar GT) ----------------
  {
    id: 'neon-mile', name: 'Neon Mile', district: 'downtown', track: 'downtown', rivals: ['jules', 'kai', 'rhea'],
    payout: { cash: [420, 300, 220, 160], rep: [60, 42, 30, 22], crates: [3, 2, 1, 1] }, firstClear: { cash: 500, crates: 3 },
    requires: { car: 'tourer' }, goals: { par: 23.1 },
    blurb: 'A night street circuit under shop signs. Four corners; the Altamar is wide for them.',
  },
  {
    id: 'bridge-trap', name: 'Bridge Speed Trap', district: 'downtown', track: 'bridge', rivals: [],
    payout: { cash: [90, 90, 90, 90], rep: [12, 12, 12, 12], crates: [0, 0, 0, 0] }, firstClear: { cash: 0, crates: 0 },
    requires: { car: 'tourer' }, speedTrap: { bronze: 150, silver: 195, gold: 208 },
    blurb: 'One run across the harbor bridge. Scored on your speed through the gate, not your time.',
  },
  {
    id: 'stock-cup', name: 'Stock Cup', district: 'downtown', track: 'downtown', rivals: ['stock1', 'stock2', 'stock3'],
    payout: { cash: [380, 270, 200, 150], rep: [40, 28, 20, 15], crates: [2, 1, 1, 0] }, firstClear: { cash: 450, crates: 2 },
    requires: { afterWin: 'neon-mile' }, partCap: 4, trophy: 'Stock Cup', goals: { par: 23.4 },
    blurb: 'Every part runs as T4 at most, on any car. The base car decides it: light and grippy wins the corners.',
  },
  {
    id: 'skyline-run', name: 'Skyline Run', district: 'downtown', track: 'skyline', rivals: ['mina', 'rhea', 'ozzy'],
    payout: { cash: [480, 340, 250, 190], rep: [66, 46, 33, 25], crates: [3, 2, 1, 1] }, firstClear: { cash: 600, crates: 3 },
    requires: { afterWin: 'neon-mile' }, goals: { par: 24.1 },
    blurb: 'Expressway sweepers into one tight exit ramp. Top speed first, then grip.',
  },
  {
    id: 'main-event', name: 'The Main Event', district: 'downtown', track: 'skyline', rivals: ['nova'],
    payout: { cash: [900, 0, 0, 0], rep: [120, 0, 0, 0], crates: [4, 0, 0, 0] }, firstClear: { cash: 0, crates: 0 },
    requires: { car: 'tuner', stars: 4 }, knockout: { heats: ['main-event:1', 'main-event:2', 'main-event:3'] },
    boss: { rival: 'nova', reward: { cash: 1500, crates: 6, blueprint: 'Main Event Neon', badge: 'Main Event Champion' } },
    blurb: 'Three heats, one night. Top 3 go through the street heat, top 2 through the bridge, then a final against Nova Sato. Change cars between heats.',
  },
  {
    id: 'main-event:1', name: 'Heat 1 · Street', district: 'downtown', track: 'downtown', rivals: ['kai', 'ozzy', 'jules'], heatOf: 'main-event', advance: 3,
    payout: { cash: [260, 200, 150, 90], rep: [24, 18, 14, 8], crates: [1, 1, 0, 0] }, firstClear: { cash: 0, crates: 0 }, requires: {},
    blurb: 'Neon Mile. Top 3 go through.',
  },
  {
    id: 'main-event:2', name: 'Heat 2 · Bridge', district: 'downtown', track: 'bridge', rivals: ['rhea', 'mina'], heatOf: 'main-event', advance: 2,
    payout: { cash: [300, 220, 120, 0], rep: [28, 20, 10, 0], crates: [1, 1, 0, 0] }, firstClear: { cash: 0, crates: 0 }, requires: {},
    blurb: 'Harbor Bridge drag. Top 2 go through.',
  },
  {
    id: 'main-event:3', name: 'Final · Skyline', district: 'downtown', track: 'skyline', rivals: ['nova'], heatOf: 'main-event', advance: 1,
    payout: { cash: [900, 300, 0, 0], rep: [120, 30, 0, 0], crates: [4, 1, 0, 0] }, firstClear: { cash: 0, crates: 0 }, requires: {},
    boss: { rival: 'nova', reward: { cash: 1500, crates: 6, blueprint: 'Main Event Neon', badge: 'Main Event Champion' } },
    blurb: 'Skyline Run, one on one with Nova Sato.',
  },
  {
    id: 'midnight-run', name: 'Midnight Run', district: 'downtown', track: 'bridge', rivals: ['nova2', 'rhea', 'mina'],
    payout: { cash: [700, 500, 360, 260], rep: [80, 56, 40, 30], crates: [4, 3, 2, 1] }, firstClear: { cash: 1000, crates: 4 },
    requires: { car: 'super' }, goals: { par: 11.8 },
    blurb: 'Bridge drag at 2 a.m. against the fastest cars in the city. Where a Surge-boosted Lumen belongs.',
  },
  // ---------------- Desert Proving Ground (after the Lumen RS): the Corvo Rally and the Canyon Rally ----------------
  {
    id: 'canyon-qualifier', name: 'Canyon Qualifier', district: 'desert', track: 'dunes', rivals: ['odin', 'yara', 'tomas'],
    payout: { cash: [600, 430, 320, 240], rep: [70, 50, 36, 26], crates: [3, 2, 1, 1] }, firstClear: { cash: 800, crates: 4 },
    requires: { car: 'super' }, goals: { par: 21.9 },
    blurb: 'Gravel, two loose bends, and rally cars that launch like catapults. Win it to earn a Corvo Rally.',
  },
  {
    id: 'mesa-trap', name: 'Mesa Speed Trap', district: 'desert', track: 'mesa', rivals: [],
    payout: { cash: [150, 150, 150, 150], rep: [16, 16, 16, 16], crates: [0, 0, 0, 0] }, firstClear: { cash: 0, crates: 0 },
    requires: { car: 'super' }, speedTrap: { bronze: 185, silver: 200, gold: 215 },
    blurb: 'Salt flats and a gate at the far end. Scored on your speed through it — bring your fastest car.',
  },
  {
    id: 'dust-stage', name: 'Stage 1 · Dune Wash', district: 'desert', track: 'dunes', rivals: ['tomas', 'yara', 'wren'],
    series: { id: 'rally', name: 'Canyon Rally', round: 1, of: 3 },
    payout: { cash: [700, 500, 370, 280], rep: [80, 56, 40, 30], crates: [3, 2, 1, 1] }, firstClear: { cash: 900, crates: 4 },
    requires: { car: 'rally' }, blurb: 'Round 1 of the Canyon Rally. A loose launch and two gravel bends: all-wheel drive pays here.',
  },
  {
    id: 'canyon-stage', name: 'Stage 2 · Red Canyon', district: 'desert', track: 'canyon', rivals: ['wren', 'tomas', 'yara'],
    series: { id: 'rally', name: 'Canyon Rally', round: 2, of: 3 },
    payout: { cash: [760, 540, 400, 300], rep: [86, 60, 44, 32], crates: [3, 2, 1, 1] }, firstClear: { cash: 1000, crates: 4 },
    requires: { afterWin: 'dust-stage' }, blurb: 'Round 2. Four hairpins on loose rock: grip in, acceleration out, nitro on the exits.',
  },
  {
    id: 'rally-final', name: 'Canyon Rally Final', district: 'desert', track: 'canyon', rivals: ['wren', 'tomas', 'sable'],
    series: { id: 'rally', name: 'Canyon Rally', round: 3, of: 3 },
    payout: { cash: [820, 580, 430, 320], rep: [92, 64, 46, 34], crates: [4, 2, 1, 1] }, firstClear: { cash: 0, crates: 0 },
    requires: { afterWin: 'canyon-stage' },
    boss: { rival: 'sable', reward: { cash: 2500, crates: 6, blueprint: 'Canyon Ochre', badge: 'Canyon Rally Champion' } },
    blurb: 'The final stage against Sable Dunn. Win it to be offered a seat in a Strata GTR.',
  },
  {
    id: 'ironhorse-revival', name: 'Ironhorse Revival', district: 'meets', track: 'mesa', rivals: ['hank2', 'mara2', 'sol2'], carOnly: 'muscle', trophy: 'Salt Flat Legend',
    payout: { cash: [520, 370, 280, 210], rep: [46, 32, 24, 18], crates: [3, 2, 1, 0] }, firstClear: { cash: 900, crates: 3 },
    requires: { car: 'rally' }, blurb: 'Ironhorse 455s only, flat out across the salt. A T5 V8 with every boost still has a chance.',
  },
  {
    id: 'ta-canyon', name: 'Canyon Time Attack', district: 'trials', track: 'canyon', rivals: [], timeAttack: { bronze: 26.6, silver: 26.1, gold: 25.9 },
    payout: { cash: [120, 120, 120, 120], rep: [14, 14, 14, 14], crates: [0, 0, 0, 0] }, firstClear: { cash: 0, crates: 0 },
    requires: { car: 'rally' }, blurb: 'Solo run through Red Canyon. Four hairpins, four clean exits.',
  },
  // ---------------- The Summit (after the Strata GTR): endurance racing and the grand finale ----------------
  {
    id: 'glacier-pass', name: 'Glacier Pass', district: 'summit', track: 'pass', rivals: ['mirelle', 'kenji', 'nova3'],
    payout: { cash: [900, 640, 480, 360], rep: [96, 68, 48, 36], crates: [4, 2, 1, 1] }, firstClear: { cash: 1200, crates: 4 },
    requires: { car: 'gt' }, goals: { par: 22.9 },
    blurb: 'Three fast sweepers above the snow line. Aero grip is worth more than horsepower here.',
  },
  {
    id: 'summit-1000', name: 'Summit 1000', district: 'summit', track: 'summit', rivals: ['bex', 'kenji', 'mirelle'],
    payout: { cash: [1000, 720, 540, 400], rep: [104, 72, 52, 40], crates: [4, 3, 2, 1] }, firstClear: { cash: 1500, crates: 5 },
    requires: { afterWin: 'glacier-pass' }, goals: { par: 34.0 },
    blurb: 'The endurance classic: the full Summit Circuit against the GT teams. Win it and the Halcyon X is yours to build.',
  },
  {
    id: 'altamar-tour', name: 'Altamar Grand Tour', district: 'meets', track: 'pass', rivals: ['lux2', 'vale2', 'rhea2'], carOnly: 'tourer', trophy: 'Grand Tourer',
    payout: { cash: [600, 430, 320, 240], rep: [50, 36, 26, 20], crates: [3, 2, 1, 0] }, firstClear: { cash: 1000, crates: 3 },
    requires: { car: 'gt' }, blurb: 'Altamar GTs only, over Glacier Pass. The coastal tourer was made for roads like this.',
  },
  {
    id: 'ta-summit', name: 'Summit Time Attack', district: 'trials', track: 'summit', rivals: [], timeAttack: { bronze: 32.2, silver: 31.6, gold: 31.2 },
    payout: { cash: [150, 150, 150, 150], rep: [16, 16, 16, 16], crates: [0, 0, 0, 0] }, firstClear: { cash: 0, crates: 0 },
    requires: { car: 'gt' }, blurb: 'One lap of the Summit Circuit, alone. The record board every car can chase.',
  },
  {
    id: 'summit-gala', name: 'Summit Gala', district: 'summit', track: 'summit', rivals: ['sable', 'nova3', 'iver'],
    payout: { cash: [1500, 1000, 750, 550], rep: [150, 100, 70, 50], crates: [5, 3, 2, 1] }, firstClear: { cash: 0, crates: 0 },
    requires: { car: 'proto' }, goals: { par: 32.0 },
    boss: { rival: 'iver', reward: { cash: 6000, crates: 8, blueprint: 'Summit Ice', badge: 'Summit Champion' } },
    blurb: 'The grand finale. Every champion you have beaten, and Iver Kaas in the other Halcyon. Clean shifts or nothing. Win it for an invitation to the Riviera — and a Vireo 9R.',
  },
  // ---------------- Azure Riviera (after the Summit Gala): the supercars, one course for each ----------------
  {
    id: 'corniche', name: 'Corniche Hairpins', district: 'riviera', track: 'corniche', rivals: ['ilse', 'anouk', 'ravi'],
    payout: { cash: [1300, 920, 690, 520], rep: [120, 84, 60, 46], crates: [4, 3, 2, 1] }, firstClear: { cash: 1600, crates: 5 },
    requires: { car: 'vireo' }, goals: { par: 25.4 },
    blurb: 'Five hairpins on the cliff road. The Vireo changes direction quicker than anything; a Halcyon is too long for it. Win it to be offered a Mako TT.',
  },
  {
    id: 'ta-corniche', name: 'Corniche Time Attack', district: 'trials', track: 'corniche', rivals: [], timeAttack: { bronze: 25.7, silver: 25.2, gold: 24.9 },
    payout: { cash: [160, 160, 160, 160], rep: [18, 18, 18, 18], crates: [0, 0, 0, 0] }, firstClear: { cash: 0, crates: 0 },
    requires: { car: 'vireo' }, blurb: 'Solo run down the Corniche. Five hairpins, five clean exits.',
  },
  {
    id: 'riviera-night', name: 'Lumen Riviera Night', district: 'meets', track: 'grand', rivals: ['nova3', 'lux2', 'mina'], carOnly: 'super', trophy: 'Riviera Surge',
    payout: { cash: [900, 640, 480, 360], rep: [70, 50, 36, 26], crates: [3, 2, 1, 0] }, firstClear: { cash: 1400, crates: 3 },
    requires: { car: 'vireo' }, blurb: 'Lumen RSs only, flat out down the coast boulevard at night. A Surge boost on a long straight is still the fastest thing here.',
  },
  {
    id: 'port-sprint', name: 'Port Sprint', district: 'riviera', track: 'port', rivals: ['dario', 'teo', 'iver2'],
    payout: { cash: [1400, 1000, 750, 560], rep: [128, 90, 64, 48], crates: [4, 3, 2, 1] }, firstClear: { cash: 1800, crates: 5 },
    requires: { car: 'mako' }, goals: { par: 18.1 },
    blurb: 'A long launch off the quay and three slow corners between the yachts. Twin-turbo shove wins it. Win it to be offered the Sovereign.',
  },
  {
    id: 'grand-riviera', name: 'Grand Riviera', district: 'riviera', track: 'grand', rivals: ['anouk', 'teo', 'aurelia'],
    payout: { cash: [1800, 1250, 900, 680], rep: [170, 115, 80, 60], crates: [5, 3, 2, 1] }, firstClear: { cash: 0, crates: 0 },
    requires: { car: 'sovereign' }, goals: { par: 20.5 },
    boss: { rival: 'aurelia', reward: { cash: 8000, crates: 8, blueprint: 'Riviera Gold', badge: 'Riviera Champion' } },
    blurb: 'The flagship final: three long straights and two fast sweepers along the sea, against Aurelia Stern in the other Sovereign. Bring the T10 engine and clean shifts.',
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

/**
 * Rival pace per event (difficulty knob): every non-boss rival in an event races a copy of its personality with these
 * stats × pace, so one character can return in a later event at a different pace without touching earlier ones.
 * A boss is scaled in place (it races only its own event). Tuned with `tests/tune-ladder.test.ts` against the
 * shift × nitro targets in `tests/ladder.ts` (missed / ordinary / clean inputs at the build a player brings).
 */
export const RIVAL_PACE: Record<string, number> = {
  'yard-sprint': 0.992,
  'crusher-run': 0.991,
  'tapeback-trophy': 1.011,
  'corsa-club': 1.011,
  'rusty-ray': 1.031,
  'cul-de-sac': 0.953,
  'maple-mile': 1.020,
  'foundry-final': 1.330,
  'hatch-attack': 0.986,
  'harbor-launch': 0.949,
  'cliff-esses': 0.976,
  'coast-crown': 0.971,
  'neon-mile': 0.952,
  'stock-cup': 1.002,
  'skyline-run': 0.967,
  'main-event:1': 1.200,
  'main-event:2': 0.980,
  'main-event:3': 0.972,
  'midnight-run': 0.932,
  'canyon-qualifier': 0.839,
  'dust-stage': 0.990,
  'canyon-stage': 1.007,
  'rally-final': 0.968,
  'ironhorse-revival': 0.910,
  'glacier-pass': 1.094,
  'summit-1000': 1.069,
  'altamar-tour': 0.931,
  'summit-gala': 1.054,
  corniche: 1.074,
  'riviera-night': 0.985,
  'port-sprint': 0.926,
  'grand-riviera': 0.949,
};
const scaleStats = (st: Rival['stats'], k: number) => ({ top: +(st.top * k).toFixed(3), accel: +(st.accel * k).toFixed(3), grip: +(st.grip * k).toFixed(4) });
for (const e of EVENTS) {
  if (e.knockout) continue; // the knockout's heats race; the parent only names its boss
  const k = RIVAL_PACE[e.id] ?? 1;
  e.rivals = e.rivals.map((id) => {
    const r = RIVALS[id];
    if (e.boss?.rival === id) { if (k !== 1) r.stats = scaleStats(r.stats, k); return id; }
    const nid = `${id}@${e.id}`;
    RIVALS[nid] = { ...r, id: nid, stats: scaleStats(r.stats, k), boss: undefined };
    return nid;
  });
}

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
