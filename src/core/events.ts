import type { CarId, Family, Quality } from '../data/tables';

export interface SlotRef {
  zone: 'board' | 'tray';
  i: number;
}

/** Resolved gameplay events. Animations and sounds follow these, never the other way round. */
export type GameEvent =
  | { type: 'move'; from: SlotRef; to: SlotRef }
  | { type: 'fuse'; at: SlotRef; consumed: SlotRef; family: Family; fromTier: number; tier: number; q: Quality; chain: number; skipped: boolean }
  | { type: 'combo'; count: number }
  | { type: 'nitro'; total: number; source: 'combo' | 'mergeAll' }
  | { type: 'nitroFull' }
  | { type: 'cash'; amount: number; reason: string }
  | { type: 'keystone'; family: Family; tier: number }
  | { type: 'place'; at: SlotRef; family: Family; tier: number; source: string }
  | { type: 'crateBlocked' }
  | { type: 'scrap'; at: SlotRef; value: number }
  | { type: 'favorite'; id: number; on: boolean }
  | { type: 'polish'; id: number; family: Family; tier: number; cost: number }
  | { type: 'offline'; amount: number }
  | { type: 'unlock'; car: CarId }
  | { type: 'catchup'; family: Family; tier: number }
  | { type: 'printer' }
  | { type: 'quickDone' }
  | { type: 'invalid'; reason: string }
  | { type: 'mergeAll'; fusions: number; longest: number }
  | { type: 'styleBought'; item: string; car: CarId }
  | { type: 'install'; car: CarId; family: Family; partId: number; from: SlotRef; outgoingId: number | null }
  | { type: 'uninstall'; car: CarId; family: Family; partId: number; to: SlotRef }
  | { type: 'move-fit'; fromCar: CarId; toCar: CarId; family: Family; partId: number; outgoingId: number | null }
  // ---- Job Board (New mechanic; core/jobs.ts)
  | { type: 'job'; id: number; title: string; cash: number; xp: number; streak: number }
  | { type: 'jobNew'; count: number; first: boolean }
  | { type: 'jobDeliver'; id: number; at: SlotRef; family: Family; tier: number }
  | { type: 'jobSkip'; id: number }
  | { type: 'jobStreak'; streak: number }
  | { type: 'garageLevel'; level: number; reward: string }
  // ---- end Job Board
  // ---- Scrap & surplus: Build Sheet donations and Fab bench kits (core/projects.ts, core/fabrication.ts)
  | { type: 'donate'; id: number; car: CarId; family: Family; tier: number; q: Quality; pts: number; stage: number; stageUp: boolean }
  | { type: 'fabricate'; kit: string; cost: number }
  | { type: 'armKit'; kit: string; on: boolean }
  | { type: 'kitsUsed'; kits: string[] };
  // ---- end Scrap & surplus

export const sameRef = (a: SlotRef, b: SlotRef) => a.zone === b.zone && a.i === b.i;
