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
  | { type: 'move-fit'; fromCar: CarId; toCar: CarId; family: Family; partId: number; outgoingId: number | null };

export const sameRef = (a: SlotRef, b: SlotRef) => a.zone === b.zone && a.i === b.i;
