import { allParts, canFuse, freeSlots, hasAnyPair } from './board';
import { computeLoadout } from './loadout';
import { goalStatus, mergeAllUnlocked } from './progression';
import type { GameState } from './state';

/**
 * Teach-through-play steps, derived purely from game state so finishing actions out of order or reloading
 * mid-step is always safe. Returns the one step to coach now, or null.
 * Core beats resolve themselves by play; contextual tips end when the player taps "Got it" (tips[id]).
 */
export type TutorialStep =
  | 'merge' | 'race1' | 'craftGoal' | 'shop' | 'goalCard'
  | 'nitroBank' | 'overflow' | 'scrap' | 'mergeAll' | 'cap';

export function hasPairOf(s: GameState, family?: string): boolean {
  const parts = allParts(s);
  for (let a = 0; a < parts.length; a++) for (let b = a + 1; b < parts.length; b++) {
    if ((!family || parts[a].f === family) && canFuse(parts[a], parts[b])) return true;
  }
  return false;
}

export function tutorialStep(s: GameState): TutorialStep | null {
  if (s.tips.skipGuide) return null;
  if (!s.stats.milestones.firstMerge && hasPairOf(s)) return 'merge';
  if (s.stats.races === 0 && !s.pendingQuick) return 'race1';
  const g = goalStatus(s);
  if (g && !g.keystoneDone && !s.tips.craftGoal && hasPairOf(s, g.family)) return 'craftGoal';
  if (s.stats.races >= 1 && !s.tips.shop && g && !g.keystoneDone && s.cash >= 70) return 'shop';
  if (s.stats.races >= 1 && !s.tips.goalCard) return 'goalCard';
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
    for (const id of ['craftGoal', 'shop', 'goalCard'] as const) s.tips[id] = true;
  }
}
