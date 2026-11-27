import { allParts, canFuse, freeSlots, hasAnyPair, orderMaxTier, orderPrice } from './board';
import { fitted, recommendedFit } from './install';
import { computeLoadout } from './loadout';
import { goalStatus, mergeAllUnlocked, upgradeCost, upgradeLock, upgradeShown } from './progression';
import { ACTIVE_FAMILIES, FAMILIES, Family, TUNE_STAGES, UPGRADES, UpgradeId, carById, tunePrice } from '../data/tables';
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
  if (!s.tips.spend && !(s.stats.spent ?? 0) && bestBuy(s).affordable) return 'spend';
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

// ---------------- Best buy (the Shop's recommendation, and whether the 'spend' beat has anything to teach) ----

/** Ingredients toward a crafted tier, in T1 units: 2^(t-1) per bench part below the target tier. */
export function ingredients(s: GameState, f: Family, tier: number): { have: number; need: number } {
  const have = allParts(s).filter((p) => p.f === f && p.t < tier).reduce((n, p) => n + 2 ** (p.t - 1), 0);
  return { have, need: 2 ** (tier - 1) };
}

export type BuyPick =
  | { kind: 'order'; fam: Family; tier: number; price: number; title: string; why: string }
  | { kind: 'tune'; price: number; title: string; why: string }
  | { kind: 'upgrade'; id: UpgradeId; price: number; title: string; why: string };

/** The one purchase that helps most now — goal ingredients, then a part that makes the active car faster, then a
 *  tune-up, then garage upgrades — affordable first; otherwise the cheapest of them to save up for. */
export function bestBuy(s: GameState): { pick: BuyPick | null; affordable: boolean } {
  const g = goalStatus(s);
  const maxT = orderMaxTier(s);
  const car = carById(s.activeCar);
  const options: BuyPick[] = [];
  if (g && !g.keystoneDone) {
    const fam = FAMILIES[g.family];
    const { have, need } = ingredients(s, g.family, g.tier);
    if (have < need) for (let t = Math.min(maxT, g.tier - 1); t >= 1; t--) {
      const add = 2 ** (t - 1);
      if (add > need - have && t > 1) continue; // never overshoot: buy what closes the gap
      options.push({
        kind: 'order', fam: g.family, tier: t, price: orderPrice(s, t), title: `T${t} ${fam.name}`,
        why: `Toward the T${g.tier} ${fam.name} the ${g.car.model} needs: ingredients ${have}/${need} → ${Math.min(need, have + add)}/${need}. You still merge it yourself.`,
      });
    }
  }
  // a part that makes the car you race faster: above what is fitted and on the bench, within the car's limit
  const slots = fitted(s, s.activeCar);
  const parts: BuyPick[] = [];
  for (const f of ACTIVE_FAMILIES) {
    if (g && !g.keystoneDone && f === g.family && ingredients(s, f, g.tier).have >= ingredients(s, f, g.tier).need) continue; // merge them up instead
    const held = Math.max(slots[f]?.t ?? 0, ...allParts(s).filter((p) => p.f === f).map((p) => p.t));
    for (let t = Math.min(car.cap, maxT); t > held; t--) {
      parts.push({ kind: 'order', fam: f, tier: t, price: orderPrice(s, t), title: `T${t} ${FAMILIES[f].name}`,
        why: `Fit it to your ${car.model} for more ${FAMILIES[f].statLabel.toLowerCase()} (yours: ${slots[f] ? `T${slots[f]!.t}` : 'empty slot'}).` });
    }
  }
  options.push(...parts.sort((a, b) => (a.kind === 'order' && b.kind === 'order' ? b.tier - a.tier : 0)));
  const stage = s.tune?.[s.activeCar] ?? 0;
  if (stage < TUNE_STAGES) options.push({ kind: 'tune', price: tunePrice(s.activeCar, stage), title: `Tune-up stage ${stage + 1}`, why: `+2% speed, acceleration and grip for your ${car.model}.` });
  for (const u of UPGRADES) {
    if (!upgradeShown(s, u) || upgradeLock(s, u.id)) continue;
    const next = u.levels[s.upgrades[u.id] ?? 0];
    const cost = upgradeCost(s, u.id);
    if (next && cost !== null) options.push({ kind: 'upgrade', id: u.id, price: cost, title: u.name, why: next.label });
  }
  const can = options.find((o) => o.price <= s.cash);
  if (can) return { pick: can, affordable: true };
  return { pick: options.slice().sort((a, b) => a.price - b.price)[0] ?? null, affordable: false };
}

/** Tips that only make sense to a brand-new player: a returning save marks them done on load. */
export function settleTutorialForExistingSave(s: GameState) {
  if (s.stats.races >= 3 || s.owned.length > 1) {
    for (const id of BEGINNER_STEPS) s.tips[id] = true;
  }
}
