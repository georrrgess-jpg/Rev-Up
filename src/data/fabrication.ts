// Scrap & surplus (data): per-car Build Sheets that permanently absorb donor parts, and the Fab bench that turns
// scrap into one-race kits armed in Pit Setup. Rules live in src/core/projects.ts and src/core/fabrication.ts.
import { SCRAP_VALUE } from './tables';
import type { Family } from './tables';

// ---------------- Build Sheets (permanent, capped) ----------------

/** Points a donor gives, by its tier relative to the car's cap (cap−1, cap, cap+1, cap+2 and above).
 *  Lower tiers are refused: they are merge fodder, not build material. */
export const BUILD_POINTS_BY_REL: Record<number, number> = { [-1]: 2, 0: 4, 1: 8, 2: 12 };
/** Quality counts extra: Polished ×1.5, Mint ×2 (rounded). */
export const BUILD_QUALITY_MUL = { std: 1, polished: 1.5, mint: 2 } as const;
/** Points to complete each stage (not cumulative): 4 stages, 60 points in all = 15 cap-tier parts per family. */
export const BUILD_STAGE_PTS = [8, 12, 16, 24];
/** The donor quality a stage needs before it can complete: stage 3 a Polished (or Mint) donor, stage 4 a Mint donor. */
export const BUILD_STAGE_SEAL = [0, 0, 1, 2];
export const BUILD_STAGE_NAMES = ['Ported', 'Balanced', 'Blueprinted', 'Mint-spec'];
/** Stat bonus per completed stage, by family (engine → top speed, tires → grip, turbo → acceleration).
 *  Capped at 4 stages: +3% top, +2% grip, +3% acceleration at most — about half a full Tune-up. */
export const BUILD_STAGE_BONUS: Partial<Record<Family, number>> = { engine: 0.0075, tires: 0.005, turbo: 0.0075 };
export const BUILD_TRACK_NAME: Partial<Record<Family, string>> = { engine: 'Engine build', tires: 'Chassis build', turbo: 'Intake build' };
/** Builds open when you own this many cars (the Ironhorse 455): the early ladder stays as tuned. */
export const BUILDS_OPEN_CARS = 4;

// ---------------- Fab bench: one-race kits from scrap ----------------

export type KitId = 'canister' | 'softs' | 'launch' | 'fuel';
export interface KitDef {
  id: KitId;
  name: string;
  icon: string;
  /** What it does, in one line. */
  effect: string;
  /** One-race effect: extra nitro charges, or a stat multiplier. */
  nitro?: number;
  stat?: 'top' | 'accel' | 'grip';
  mul?: number;
  /** Which track demand it helps (Pit Setup tags it). */
  helps: 'launch' | 'straights' | 'corners' | 'boost';
}
export const KITS: KitDef[] = [
  { id: 'canister', name: 'Nitro canister', icon: '⚡', effect: '+1 nitro charge', nitro: 1, helps: 'boost' },
  { id: 'softs', name: 'Soft compound', icon: '◎', effect: '+2% grip', stat: 'grip', mul: 1.02, helps: 'corners' },
  { id: 'launch', name: 'Launch kit', icon: '➚', effect: '+6% acceleration', stat: 'accel', mul: 1.06, helps: 'launch' },
  { id: 'fuel', name: 'Race fuel', icon: '⛽', effect: '+5% top speed', stat: 'top', mul: 1.05, helps: 'straights' },
];
export const kitById = (id: string) => KITS.find((k) => k.id === id);
/** At most this many kits on one race (a kit is worth about a Tune-up stage for that race). */
export const KITS_PER_RACE = 1;
/** At most this many of one kit on the shelf (no hoarding before a cheaper price). */
export const KIT_SHELF_MAX = 5;
/** The Fab bench opens with your fourth car (the Ironhorse 455), with the Build Sheets: the early ladder stays as tuned. */
export const FAB_OPEN_CARS = 4;
/** Kit price in scrap by your best car's cap: half the recycle value of a part of that tier, on a 5-scrap step, so
 *  one surplus part of your top class always recycles into two kits (cap 2–4: 5 · cap 5: 15 · cap 6: 30 · cap 7: 60
 *  · cap 8: 125 · cap 9: 255 · cap 10: 510). One kit a race, so the sink keeps pace with late-game surplus. */
export const kitCost = (bestCap: number) => Math.max(5, Math.floor((SCRAP_VALUE[Math.max(1, Math.min(10, bestCap))] ?? 0) / 2 / 5) * 5);

// ---------------- Concours restoration (a scrap sink for every car) ----------------

/** Three permanent stages per owned car, paid in scrap: cosmetic and collection only, never performance. The third
 *  stage earns the car's Concours badge. Priced by the car's cap so it stays a real sink late on: stage k costs
 *  CONCOURS_MUL[k] × the recycle value of a part of that cap (with a floor), on a 5-scrap step — e.g. the Ironhorse
 *  (cap 5) 50 / 100 / 160, the Halcyon (cap 9) 770 / 1,540 / 2,560, the Sovereign (cap 10) 1,540 / 3,070 / 5,120. */
export const CONCOURS_STAGES = ['Detail and polish', 'Engine bay', 'Concours'] as const;
export const CONCOURS_MUL = [1.5, 3, 5];
export const CONCOURS_FLOOR = [30, 60, 100];
/** Opens with the Build Sheets (the fourth car). */
export const CONCOURS_OPEN_CARS = 4;
export const concoursCost = (cap: number, stage: number) => {
  if (stage < 0 || stage >= CONCOURS_STAGES.length) return 0;
  const raw = Math.max(CONCOURS_FLOOR[stage], (SCRAP_VALUE[Math.max(1, Math.min(10, cap))] ?? 0) * CONCOURS_MUL[stage]);
  return Math.round(raw / 5) * 5;
};
export const concoursBadge = (model: string) => `Concours ${model}`;
