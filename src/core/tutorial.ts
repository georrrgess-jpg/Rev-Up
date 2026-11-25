import { allParts, canFuse, freeSlots, hasAnyPair } from './board';
import { fitted, recommendedFit } from './install';
import { computeLoadout } from './loadout';
import { goalStatus, mergeAllUnlocked } from './progression';
import { ACTIVE_FAMILIES, PART_ORDER_PRICE } from '../data/tables';
import type { GameState } from './state';

/**
 * Teach-through-play steps, derived purely from game state so finishing actions out of order or reloading
 * mid-step is always safe. Returns the one step to coach now, or null.
 *
 * The first session, in order (each beat resolves itself by play; "Got it" ends the ones that only explain):
 *   goal      — the next car and why you want it (Got it, or any merge)
 *   merge     — merge one matching pair (teaches tiers: two T1s make a T2)
 *   fit       — parts don't fit themselves: fit the new part to your car (ends when the car has a part fitted)
 *   race1     — one race
 *   spend     — use the payout in the Shop (ends on the first purchase, or Got it)
 *   goalCard  — the exact remaining requirements for the next car (Got it)
 * Then contextual tips, each shown once when first met: craftGoal, betterPart, nitroBank, overflow (spare rack),
 * scrap, mergeAll, cap.
 */
export type TutorialStep =
  | 'goal' | 'merge' | 'fit' | 'race1' | 'spend' | 'goalCard'
  | 'craftGoal' | 'betterPart' | 'nitroBank' | 'overflow' | 'scrap' | 'mergeAll' | 'cap'
  /** @deprecated kept so older callers compile; the Shop beat is now 'spend'. */
  | 'shop';

/** Beginner beats: a returning save never sees these. */
export const BEGINNER_STEPS = ['goal', 'fit', 'spend', 'goalCard', 'craftGoal', 'shop'] as const;

export function hasPairOf(s: GameState, family?: string): boolean {
  const parts = allParts(s);
  for (let a = 0; a < parts.length; a++) for (let b = a + 1; b < parts.length; b++) {
    if ((!family || parts[a].f === family) && canFuse(parts[a], parts[b])) return true;
  }
  return false;
}

/** Nothing fitted on the active car yet, and a part on the bench that could go on. */
export function hasEmptyCar(s: GameState): boolean {
  const slots = fitted(s, s.activeCar);
  return ACTIVE_FAMILIES.every((f) => !slots[f]) && allParts(s).some((p) => ACTIVE_FAMILIES.includes(p.f));
}

/** A part on the bench (not on another car) would make the active car faster. */
export function benchUpgradeWaiting(s: GameState): boolean {
  const rec = recommendedFit(s, s.activeCar);
  return Object.values(rec).some((src) => !!src && 'at' in src);
}

export function tutorialStep(s: GameState): TutorialStep | null {
  if (s.tips.skipGuide) return null;
  const merged = !!s.stats.milestones.firstMerge;
  const raced = s.stats.races > 0 || !!s.pendingQuick;
  if (!s.tips.goal && !merged && !raced) return 'goal';
  if (!merged && hasPairOf(s)) return 'merge';
  if (!s.tips.fit && !raced && hasEmptyCar(s)) return 'fit';
  if (!raced) return 'race1';
  const g = goalStatus(s);
  if (!s.tips.spend && !(s.stats.spent ?? 0) && s.cash >= PART_ORDER_PRICE[1]) return 'spend';
  if (!s.tips.goalCard) return 'goalCard';
  if (g && !g.keystoneDone && !s.tips.craftGoal && hasPairOf(s, g.family)) return 'craftGoal';
  if (!s.tips.betterPart && benchUpgradeWaiting(s)) return 'betterPart';
  if (s.nitro > 0 && !s.tips.nitroBank) return 'nitroBank';
  if (s.tray.some(Boolean) && !s.tips.overflow) return 'overflow';
  if (freeSlots(s) === 0 && !s.tips.scrap) return 'scrap';
  if (mergeAllUnlocked(s) && hasAnyPair(s) && !s.tips.mergeAll) return 'mergeAll';
  if (Object.keys(computeLoadout(s).blocked).length && !s.tips.cap) return 'cap';
  return null;
}

/** Tips that only make sense to a brand-new player: a returning save marks them done on load. */
export function settleTutorialForExistingSave(s: GameState) {
  if (s.stats.races >= 3 || s.owned.length > 1) {
    for (const id of BEGINNER_STEPS) s.tips[id] = true;
  }
}
