import { installLegacyLoadout } from './install';
import { sanitizeSurplus } from './projects'; // Scrap & surplus
import { cleanGhosts } from './circuit'; // 1.9 Circuit ghosts
import {
  ACTIVE_FAMILIES, BOARD_BASE, CarId, Family, NITRO_CAP, Quality, STARTER_CRATES, TRAY_SLOTS,
} from '../data/tables';

export const SAVE_VERSION = 2; // v2: parts are fitted to cars (installed) instead of auto-equipped from the bench

/** Per-car milestones, updated on every committed live race. Kept small and additive. */
export interface CarMastery {
  races: number;
  wins: number;
  podiums: number;
  /** best live time per event id */
  best: Record<string, number>;
  perfects: number;
  /** timed shifts: clean (in the green), and total attempted */
  shiftsClean: number;
  shifts: number;
  /** highest speed reached, m/s (display converts to mph) */
  topSpeed: number;
}

// ---- Rival Runs (Pit Stop): one record per run id. `claimed` is set in the same transaction that grants the prize.
export interface RivalRunRecord { tries: number; best: number | null; bestGap: number | null; done: boolean; claimed: boolean }

export interface Part {
  id: number;
  f: Family;
  t: number;
  q: Quality;
}

export type CrateKind = 'std' | 'targeted' | 'catchup';
export interface Crate {
  kind: CrateKind;
  family?: Family;
  tier?: number;
  source: 'starter' | 'printer' | 'race' | 'firstClear' | 'boss' | 'shop' | 'catchup';
  /** 1.9 Quality orders: the part arrives with this quality (Polished). */
  q?: Quality;
}

export interface EventRecord {
  wins: number;
  starts: number;
  bestPlace: number;
  bestTime: number | null;
  /** Speed trap record: km/h written by builds before 1.5 (read via progression.bestTrapMph). */
  bestSpeed?: number;
  /** Speed trap record, mph. */
  bestMph?: number;
  /** 1.9 live podiums (top 3) here; a car's unlock race also counts after progression.PERSIST_PODIUMS of them. */
  podiums?: number;
}

export interface LastResult {
  raceId: number;
  eventId: string;
  place: number;
  mode: 'live' | 'quick';
  time: number | null;
  gapText: string;
  cash: number;
  rep: number;
  crates: number;
  precision: number;
  firstClear: boolean;
  boss: boolean;
  personalBest?: boolean;
  freshRep?: number;
  /** Time attack: medal reached this run, medals newly earned, and the next target. */
  medal?: number;
  newMedals?: number[];
  nextMedal?: { name: string; target: number; gap: number } | null;
  trophy?: string;
  /** Event goals newly met this race. */
  newStars?: string[];
  /** Speed trap: km/h through the gate (kept for older readers). */
  trapKmh?: number;
  /** Speed trap: mph through the gate. */
  trapMph?: number;
  /** Paint shop items earned by this race (e.g. a livery). */
  earnedStyle?: string[];
  /** Knockout heat result. */
  heat?: { name: string; n: number; of: number; advance: number; advanced: boolean; champion: boolean; next?: string };
  signatureFinish?: CarId;
  perfects: number;
  nitroUsed: number;
  advice: string;
  standings: { name: string; time: number | null; isPlayer: boolean }[];
  /** Where the cash came from: the place purse, skill (Perfect boosts), one-time rewards. */
  breakdown?: { label: string; cash: number; kind: 'base' | 'skill' | 'once' }[];
}

export interface LeanOutcome {
  place: number;
  playerTime: number | null;
  gapText: string;
  perfects: number;
  nitroUsed: number;
  nitroLeft?: number;
  trapSpeed?: number;
  /** Timed shifting (race workstream): shifts attempted, clean ones, and the player's top speed (m/s). */
  shifts?: number;
  shiftsClean?: number;
  topSpeed?: number;
  /** The race's one actionable reason (a missed shift, boost timing, or the build). */
  coach?: { kind: 'shift' | 'boost' | 'build'; text: string; lost: number } | null;
  standings: { name: string; time: number | null; isPlayer: boolean }[];
  advice: { family: 'engine' | 'tires' | 'turbo'; segment: string; lost: number } | null;
}

export interface GameState {
  v: number;
  rev: number;
  createdAt: number;
  rng: number;
  raceSeed: number;
  nextPartId: number;
  cols: number;
  rows: number;
  board: (Part | null)[];
  tray: (Part | null)[];
  crates: Crate[];
  cash: number;
  scrap: number;
  rep: number;
  nitro: number;
  combo: { count: number; lastAt: number };
  crafted: string[]; // keystone ledger entries "family:tier"
  upgrades: { grid: number; printer: number; crateTier: number; nitroTank: number; crew: number; lockup: number;
    /** 1.9 Garage paths: Parts Shelf storage and the Workshop counter (0 in older saves, filled on load). */
    storage: number; workshop: number };
  printerS: number; // progress toward next crate in seconds
  owned: CarId[];
  activeCar: CarId;
  pendingReveal: CarId | null;
  revealed: CarId[];
  events: Record<string, EventRecord>;
  bosses: string[];
  blueprints: string[];
  badges: string[];
  paints: Partial<Record<CarId, string>>;
  /** Paint shop purchases (item ids; premium paint as `material:<kind>:<car>`) and each car's chosen style. */
  owns: string[];
  /** Tune-up stage per car (0–3). */
  tune: Partial<Record<CarId, number>>;
  /** Parts fitted to each car, one per family. A fitted part is not on the board or the spare rack. */
  installed: Partial<Record<CarId, Partial<Record<Family, Part>>>>;
  /** Per-car records for future masteries / levels (races, wins, best times, shift and nitro skill). */
  mastery: Partial<Record<CarId, CarMastery>>;
  /** Event goals met (Downtown Nights): bit 1 win, 2 under par, 4 a Perfect boost. */
  stars: Record<string, number>;
  /** The Main Event in progress: the next heat to race (0-based), or null. */
  knockout: { heat: number } | null;
  style: Partial<Record<CarId, { wheel?: string; material?: string; restore?: number; livery?: string }>>;
  livePodiums: CarId[];
  /** last two events raced (live or quick), for the Fresh route Rep bonus */
  recentEvents: string[];
  /** Best time-attack medal per event: 1 bronze, 2 silver, 3 gold (rewards paid once per medal). */
  medals: Record<string, number>;
  activeS: number;
  catchup: { goal: CarId | null; effort: number; bestTier: number; claimed: CarId[] };
  /** Away earnings. pendingS: away seconds counted (up to the cap); awayS: real seconds away in this claim;
   *  capped: the cap stopped the count. One budget for the garage (progression.offlinePayout). */
  offline: { lastSeenAt: number; pendingCash: number; pendingS: number; awayS?: number; capped?: boolean };
  /** Parts the player protects from recycling (part ids; a merged part gets a new id, so the star ends there). */
  favorites?: number[];
  // ---- Rival Runs (Pit Stop): per-run record; absent in older saves (read via core/rivalRuns.runRecord)
  rivalRuns?: Record<string, RivalRunRecord>;
  // ---- Job Board (New mechanic): optional, absent in older saves (read via core/jobs.readJobs, which repairs it)
  jobs?: import('./jobs').JobsState;
  // ---- end Job Board
  // ---- Scrap & surplus (core/projects.ts, core/fabrication.ts): optional, absent in older saves
  /** Build Sheet points and best donor quality (1 Polished, 2 Mint) per car and family. */
  builds?: Partial<Record<CarId, Partial<Record<Family, { pts: number; seal: number }>>>>;
  /** Fab bench: kits on the shelf, kits armed for the next live race, and the kits riding in the race in flight. */
  fab?: { kits: Record<string, number>; armed: string[]; inRace?: { id: number; kits: string[] } | null };
  /** Concours restoration stage per car (0–3), paid in scrap (core/projects.restoreCar). Absent in older saves. */
  concours?: Partial<Record<CarId, number>>;
  /** 1.9 Parts Shelf: storage off the merge board (over-cap and surplus parts); capacity from the storage upgrade path. */
  shelf?: (Part | null)[];
  /** 1.9 Next Goal: the goal the player picked (a car id or a goal key); unset = the recommended one. */
  goalPick?: string | null;
  /** 1.9 Car unlock stages already paid (key `${car}:${stage}`). */
  stagesPaid?: string[];
  /** 1.9 Parts contributed toward the next rank of a Garage upgrade: cash credit by upgrade id (core/shelf.ts). */
  upgradeCredit?: Partial<Record<string, number>>;
  /** 1.9 Time trials: personal-best ghost per event (compact samples of distance over time). */
  ghosts?: Record<string, { t: number; car: CarId; d: number[] }>;
  // ---- end Scrap & surplus
  settings: { muted: boolean; reducedMotion: boolean; nitroCue: boolean; /** 0..1, default 0.7 */ musicVol?: number; /** 0..1, default 1 */ sfxVol?: number; /** the intro has been seen once (repeat launches are quick) */ introSeen?: boolean };
  stats: { fusions: number; races: number; wins: number; mints: number; polished: number; scrapped: number; milestones: Record<string, number>; earned?: number; spent?: number };
  tips: Record<string, boolean>;
  pendingRace: { id: number; eventId: string; car: CarId; seed: number; startedAt: number } | null;
  /** Quick Race runs in the background for the race's real duration, then pays once. */
  pendingQuick: { id: number; eventId: string; car: CarId; startedAt: number; endsAt: number; outcome: LeanOutcome } | null;
  lastResult: LastResult | null;
  mergeAllUses: number;
}

export function emptyFamilies<T>(v: T): Record<Family, T> {
  return { engine: v, tires: v, turbo: v, transmission: v, aero: v };
}

export function newGame(now: number, seed = (now ^ 0x5eed) >>> 0): GameState {
  const cols = BOARD_BASE.cols;
  const rows = BOARD_BASE.rows;
  const s: GameState = {
    v: SAVE_VERSION,
    rev: 0,
    createdAt: now,
    rng: seed >>> 0,
    raceSeed: (seed * 7 + 13) >>> 0,
    nextPartId: 1,
    cols,
    rows,
    board: new Array(cols * rows).fill(null),
    tray: new Array(TRAY_SLOTS).fill(null),
    crates: [],
    cash: 0,
    scrap: 0,
    rep: 0,
    nitro: 0,
    combo: { count: 0, lastAt: -1e12 },
    crafted: [],
    upgrades: { grid: 0, printer: 0, crateTier: 0, nitroTank: 0, crew: 0, lockup: 0, storage: 0, workshop: 0 },
    printerS: 0,
    owned: ['junker'],
    activeCar: 'junker',
    pendingReveal: null,
    revealed: ['junker'],
    events: {},
    bosses: [],
    blueprints: [],
    badges: [],
    paints: {},
    owns: [],
    tune: {},
    installed: {},
    mastery: {},
    stars: {},
    knockout: null,
    style: {},
    livePodiums: [],
    recentEvents: [],
    medals: {},
    activeS: 0,
    catchup: { goal: null, effort: 0, bestTier: 0, claimed: [] },
    offline: { lastSeenAt: now, pendingCash: 0, pendingS: 0, awayS: 0, capped: false },
    favorites: [],
    settings: { muted: false, reducedMotion: false, nitroCue: true },
    stats: { fusions: 0, races: 0, wins: 0, mints: 0, polished: 0, scrapped: 0, milestones: {} },
    tips: {},
    pendingRace: null,
    pendingQuick: null,
    lastResult: null,
    mergeAllUses: 0,
  };
  // Opening board: an Engine pair ready to merge in the middle, two Tire pairs
  // (which become the Beater's T3 Tires keystone), and a lone Turbo.
  const put = (r: number, c: number, f: Family) => {
    s.board[r * cols + c] = { id: s.nextPartId++, f, t: 1, q: 'std' };
  };
  put(2, 1, 'engine');
  put(2, 2, 'engine');
  put(1, 0, 'tires');
  put(1, 3, 'tires');
  put(3, 4, 'tires');
  put(4, 1, 'tires');
  put(4, 3, 'turbo');
  for (let i = 0; i < STARTER_CRATES; i++) s.crates.push({ kind: 'std', source: 'starter' });
  return s;
}

// ---------------- Validation ----------------

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isPart = (p: unknown): p is Part => {
  if (p === null) return true;
  if (typeof p !== 'object') return false;
  const q = p as Part;
  return isNum(q.id) && ACTIVE_FAMILIES.includes(q.f) && isNum(q.t) && q.t >= 1 && q.t <= 10 && Number.isInteger(q.t) && ['std', 'polished', 'mint'].includes(q.q);
};

/** Returns a list of problems; empty means valid. */
export function validateState(s: unknown): string[] {
  const errs: string[] = [];
  if (!s || typeof s !== 'object') return ['not an object'];
  const g = s as GameState;
  if (g.v !== SAVE_VERSION) errs.push('version');
  for (const k of ['rev', 'rng', 'raceSeed', 'nextPartId', 'cols', 'rows', 'cash', 'scrap', 'rep', 'nitro', 'printerS', 'activeS'] as const) {
    if (!isNum(g[k])) errs.push(`field ${k}`);
  }
  if (isNum(g.cash) && g.cash < 0) errs.push('negative cash');
  if (isNum(g.scrap) && g.scrap < 0) errs.push('negative scrap');
  if (isNum(g.nitro) && (g.nitro < 0 || g.nitro > NITRO_CAP + 2)) errs.push('nitro range');
  if (!Array.isArray(g.board) || g.board.length !== g.cols * g.rows) errs.push('board size');
  else if (!g.board.every(isPart)) errs.push('board parts');
  if (!Array.isArray(g.tray) || g.tray.length !== TRAY_SLOTS || !g.tray.every(isPart)) errs.push('tray');
  if (!Array.isArray(g.crates)) errs.push('crates');
  if (!Array.isArray(g.owned) || !g.owned.includes('junker')) errs.push('owned');
  if (!Array.isArray(g.owned) || !g.owned.includes(g.activeCar)) errs.push('activeCar');
  if (!Array.isArray(g.crafted)) errs.push('crafted');
  if (!Array.isArray(g.livePodiums) || !Array.isArray(g.owned) || g.livePodiums.some((id) => !g.owned.includes(id))) errs.push('car podiums');
  if (!g.offline || !isNum(g.offline.lastSeenAt) || !isNum(g.offline.pendingCash)) errs.push('offline');
  if (g.favorites !== undefined && (!Array.isArray(g.favorites) || !g.favorites.every(isNum))) errs.push('favorites');
  if (g.shelf !== undefined && (!Array.isArray(g.shelf) || !g.shelf.every(isPart))) errs.push('shelf'); // 1.9 Parts Shelf
  if (!g.settings || typeof g.settings.muted !== 'boolean') errs.push('settings');
  if (!g.upgrades || !isNum(g.upgrades.grid)) errs.push('upgrades');
  if (!g.events || typeof g.events !== 'object') errs.push('events');
  if (!g.catchup || !Array.isArray(g.catchup.claimed)) errs.push('catchup');
  if (!g.stats || !g.stats.milestones) errs.push('stats');
  // unique part ids
  if (Array.isArray(g.board) && Array.isArray(g.tray)) {
    const fittedIds = Object.values(g.installed ?? {}).flatMap((sl) => Object.values(sl ?? {}).filter(Boolean).map((p) => (p as Part).id));
    const shelfIds = (Array.isArray(g.shelf) ? g.shelf : []).filter(Boolean).map((p) => (p as Part).id); // 1.9 Parts Shelf
    const ids = [...[...g.board, ...g.tray].filter(Boolean).map((p) => (p as Part).id), ...fittedIds, ...shelfIds];
    if (new Set(ids).size !== ids.length) errs.push('duplicate part ids');
    if (isNum(g.nextPartId) && ids.some((id) => id >= g.nextPartId)) errs.push('part id counter');
  }
  return errs;
}

/** 1.9 Circuit fields: optional, cleaned on load. The shelf keeps every well-formed part (never trimmed to the current
 *  capacity, so nothing is lost); a part id already used elsewhere (board, rack, a car) is dropped from the shelf. */
function sanitizeCircuit(m: GameState, g: Partial<GameState>) {
  const used = new Set([...m.board, ...m.tray].filter(Boolean).map((p) => (p as Part).id));
  for (const sl of Object.values(m.installed ?? {})) for (const p of Object.values(sl ?? {})) if (p) used.add((p as Part).id);
  if (Array.isArray(g.shelf)) {
    const shelf: Part[] = [];
    for (const p of g.shelf) {
      if (!p || !isPart(p) || used.has(p.id)) continue;
      used.add(p.id);
      shelf.push({ id: p.id, f: p.f, t: p.t, q: p.q });
    }
    m.shelf = shelf;
    if (shelf.length && shelf.some((p) => p.id >= m.nextPartId)) m.nextPartId = Math.max(...shelf.map((p) => p.id)) + 1;
  } else delete m.shelf;
  if (typeof g.goalPick === 'string' && g.goalPick.length < 64) m.goalPick = g.goalPick; else delete m.goalPick;
  if (Array.isArray(g.stagesPaid)) m.stagesPaid = [...new Set(g.stagesPaid.filter((k) => typeof k === 'string' && k.length < 64))];
  else delete m.stagesPaid;
  if (g.upgradeCredit && typeof g.upgradeCredit === 'object' && !Array.isArray(g.upgradeCredit)) {
    const c: Record<string, number> = {};
    for (const [k, v] of Object.entries(g.upgradeCredit)) if (isNum(v) && v > 0) c[k] = Math.floor(v);
    m.upgradeCredit = c;
  } else delete m.upgradeCredit;
}

/** Migrate older save shapes forward. Returns null when the save cannot be used. */
export function migrate(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null;
  const g = raw as Partial<GameState> & { v?: number };
  if (typeof g.v !== 'number') return null;
  if (g.v > SAVE_VERSION) return null; // from a newer build; refuse rather than corrupt
  const fromV1 = g.v < 2;
  // v1 is the first shipped schema. Future migrations: if (g.v === 1) { ...; g.v = 2 }
  // Fill optional fields added during development so partially-shaped v1 saves load.
  const base = newGame(0);
  const merged = { ...base, ...g } as GameState;
  merged.settings = { ...base.settings, ...(g.settings ?? {}) };
  merged.stats = { ...base.stats, ...(g.stats ?? {}), milestones: { ...(g.stats?.milestones ?? {}) } };
  merged.catchup = { ...base.catchup, ...(g.catchup ?? {}) };
  merged.offline = { ...base.offline, ...(g.offline ?? {}) };
  merged.upgrades = { ...base.upgrades, ...(g.upgrades ?? {}) };
  merged.tips = { ...(g.tips ?? {}) };
  merged.installed = { ...(g.installed ?? {}) };
  merged.mastery = { ...(g.mastery ?? {}) };
  merged.favorites = Array.isArray(g.favorites) ? g.favorites.filter(isNum) : [];
  // ---- Rival Runs: keep a well-formed record map, drop anything else (an older save simply has none)
  if (g.rivalRuns && typeof g.rivalRuns === 'object' && !Array.isArray(g.rivalRuns)) merged.rivalRuns = { ...g.rivalRuns };
  else delete merged.rivalRuns;
  // ---- Job Board: keep an object (core/jobs.readJobs repairs each field), drop anything else
  if (!g.jobs || typeof g.jobs !== 'object' || Array.isArray(g.jobs)) delete merged.jobs;
  sanitizeSurplus(merged); // ---- Scrap & surplus: well-formed builds and kits, or none
  sanitizeCircuit(merged, g); // ---- 1.9 Circuit: shelf, goal pick, paid stages, upgrade credit
  cleanGhosts(merged); // ---- 1.9 Circuit time-trial ghosts (core/circuit.ts): malformed ones dropped
  if (fromV1) { merged.v = SAVE_VERSION; installLegacyLoadout(merged); }
  return validateState(merged).length === 0 ? merged : null;
}
