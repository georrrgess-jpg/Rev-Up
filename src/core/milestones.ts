// Progress you have earned, and the next milestone — pure data for the Garage goal card, the Race menu and the
// Showroom to render. Earned progress (Rep, Garage Level, stars, cars, tiers) is never spent and never goes down;
// spendable balances (cash, scrap) are reported separately so the UI can label them apart.
import {
  CarClass, CarId, DISTRICTS, DistrictId, ENABLED_CARS, EVENTS, FAMILIES, Family, MAX_TIER, RIVALS, carById, eventById,
} from '../data/tables';
import { allParts, craftedTier, orderMaxTier } from './board';
import { levelInfo, jobsUnlocked } from './jobs';
import { carAfter, carStages, chaseable, collection, eventUnlocked, goalStatus, nextCar, starsIn, unlockEventDone, unlockEventText } from './progression';
import type { GameState } from './state';

/** One thing still needed for a milestone. `done` items stay in the list (ticked), so the card reads as a checklist. */
export type MilestoneNeed =
  | { kind: 'rep'; have: number; need: number; done: boolean; text: string }
  | {
    kind: 'keystone'; family: Family; familyName: string; tier: number; done: boolean;
    /** best tier of that family on the bench or rack right now (0: none) */
    bestHeld: number;
    /** T1-equivalents held below the keystone tier toward the merge, and how many it takes (2^(tier-1)) */
    have: number; need: number;
    /** the highest tier the parts counter sells for this family (the keystone itself is always a merge) */
    orderTier: number;
    text: string;
  }
  | {
    kind: 'event'; event: string; eventName: string; done: boolean;
    /** can it be raced now (with a car switch if `switchCar`)? `why` says what opens it when not */
    open: boolean; why: string; switchCar?: CarId; boss?: string;
    text: string;
  }
  | { kind: 'stars'; have: number; need: number; district: DistrictId; done: boolean; text: string };

export interface Milestone {
  /** 'car': the next car on the ladder · 'finale': every car owned, the last rival not yet beaten · 'collection':
   *  everything won; the next collection goal */
  kind: 'car' | 'finale' | 'collection';
  /** the car this milestone unlocks (kind 'car') */
  car?: CarId;
  title: string; // "Vireo 9R" / "Grand Riviera" / "Collection"
  /** class and district of the car, e.g. "Supercar · Azure Riviera" */
  subtitle: string;
  /** what reaching it gives you, most important first, in plain words with numbers */
  unlocks: string[];
  /** what you still need (and what is already done) */
  needs: MilestoneNeed[];
  ready: boolean;
  /** 0..1, the same measure as the goal card bar */
  progress: number;
  /** one line: what is still missing, or that it is ready */
  line: string;
}

export interface ProgressSummary {
  /** Earned progress: never spent, never lost. */
  earned: {
    rep: number;
    garage: { open: boolean; level: number; xp: number; xpLevel: number; xpNext: number };
    /** event goal stars, in all and in the district that unlocks things (Downtown Nights) */
    stars: { have: number; total: number; downtown: number };
    cars: { owned: number; total: number };
    /** car tiers: your best car's part cap (the highest tier your parts run at) */
    topCarCap: number;
    /** part tiers: the highest tier you have crafted in any family, and the game's top tier */
    topCraftedTier: number;
    maxTier: number;
    /** the highest tier the parts counter sells now (cash or scrap) */
    orderTier: number;
  };
  /** Spendable balances. */
  wallet: { cash: number; scrap: number };
  /** One sentence each, for a "what do these mean" sheet. */
  glossary: { rep: string; level: string; carTier: string; partTier: string; cash: string; scrap: string };
  next: Milestone | null;
  /** the cars after the next one, in order, with their requirements in short (for a ladder view) */
  ladder: {
    car: CarId; model: string; cap: number; district: string; owned: boolean; needs: string;
    /** 1.9: how it drives (its strengths, shown before you invest), the car it opens after, whether you can chase it
     *  now, and how many unlock stages pay on the way */
    handling: string; after: CarId | null; chaseable: boolean; stages: number;
  }[];
}

const carNeedsShort = (c: CarClass) => {
  const u = c.unlock;
  if (!u) return 'Starter car';
  return [`${u.rep.toLocaleString('en-US')} Rep`, `crafted T${u.tier} ${FAMILIES[u.family].name}`, ...(u.event ? [`win ${eventById(u.event).name}`] : []), ...(u.stars ? [`${u.stars} stars`] : [])].join(' · ');
};

/** What owning this car opens: its part cap, the events it opens and the district. */
function carUnlocks(s: GameState, c: CarClass): string[] {
  const out: string[] = [];
  const cap = Math.max(...s.owned.map((id) => carById(id).cap));
  out.push(c.cap > cap ? `T${c.cap} parts run at full strength (your best car stops at T${cap})` : `Runs parts up to T${c.cap}`);
  if (c.handling) out.push(c.handling);
  const opens = EVENTS.filter((e) => !e.heatOf && e.requires.car === c.id);
  if (opens.length) out.push(`Opens ${opens.map((e) => e.name).join(', ')}`);
  const district = DISTRICTS[c.district];
  if (!s.owned.some((id) => carById(id).district === c.district) && district?.enabled) out.push(`Your first car in ${district.name}`);
  return out;
}

/**
 * The next milestone and exactly what it still needs.
 *
 * Shape (see `Milestone`): `{ kind, car?, title, subtitle, unlocks: string[], needs: MilestoneNeed[], ready, progress,
 * line }`. Needs are, in order: `rep` (have / need), `keystone` (family, tier, best held, ingredients have / need, the
 * highest tier you can order), `event` (the race to win: open now or what opens it), `stars` (Downtown stars).
 * With every car owned it is the unbeaten finale boss (kind 'finale'), then the next collection goal.
 */
export function nextMilestone(s: GameState): Milestone | null {
  const car = nextCar(s);
  const g = goalStatus(s);
  if (car && car.unlock && g) {
    const u = car.unlock;
    const fam = FAMILIES[u.family];
    const needs: MilestoneNeed[] = [];
    const repDone = s.rep >= u.rep;
    needs.push({ kind: 'rep', have: Math.min(s.rep, u.rep), need: u.rep, done: repDone, text: repDone ? `${u.rep.toLocaleString('en-US')} Rep` : `${(u.rep - s.rep).toLocaleString('en-US')} more Rep (${s.rep.toLocaleString('en-US')} / ${u.rep.toLocaleString('en-US')})` });
    const ing = allParts(s).filter((p) => p.f === u.family && p.t < u.tier).reduce((n, p) => n + 2 ** (p.t - 1), 0);
    const keyDone = craftedTier(s, u.family) >= u.tier;
    const orderTier = Math.min(orderMaxTier(s), u.tier - 1);
    needs.push({
      kind: 'keystone', family: u.family, familyName: fam.name, tier: u.tier, done: keyDone, bestHeld: g.bestHeld,
      have: Math.min(ing, 2 ** (u.tier - 1)), need: 2 ** (u.tier - 1), orderTier,
      text: keyDone ? `T${u.tier} ${fam.name} crafted` : `Craft a T${u.tier} ${fam.name} — merge two T${u.tier - 1}s (best held: ${g.bestHeld ? `T${g.bestHeld}` : 'none'}; T${orderTier} can be ordered)`,
    });
    if (u.event) {
      const e = eventById(u.event);
      const done = unlockEventDone(s, e.id); // 1.9: a win, or the persistence route
      const un = eventUnlocked(s, e);
      const boss = e.boss ? RIVALS[e.boss.rival].name : undefined;
      needs.push({ kind: 'event', event: e.id, eventName: e.name, done, open: un.ok || !!un.switchCar, why: un.ok ? '' : un.why, ...(un.switchCar ? { switchCar: un.switchCar } : {}), ...(boss ? { boss } : {}),
        text: done ? ((s.events[e.id]?.wins ?? 0) > 0 ? `Won ${e.name}` : `${e.name}: podiums enough`) : `${unlockEventText(s, e.id)}${boss ? ` (beat ${boss})` : ''}${un.ok || un.switchCar ? '' : ` — ${un.why}`}` });
    }
    if (u.stars) {
      const have = starsIn(s);
      needs.push({ kind: 'stars', have: Math.min(have, u.stars), need: u.stars, district: 'downtown', done: have >= u.stars, text: have >= u.stars ? `${u.stars} Downtown stars` : `${u.stars - have} more Downtown star${u.stars - have > 1 ? 's' : ''} (${have} / ${u.stars})` });
    }
    const ready = needs.every((n) => n.done);
    return {
      kind: 'car', car: car.id, title: car.model, subtitle: `${car.name} · ${DISTRICTS[car.district]?.name ?? car.district}`,
      unlocks: carUnlocks(s, car), needs, ready, progress: g.progress, line: g.line,
    };
  }
  // every car owned: the last unbeaten rival boss (the flagship final), then collection
  const finale = [...EVENTS].reverse().find((e) => e.boss && !e.heatOf && !s.bosses.includes(e.boss.rival));
  if (finale) {
    const un = eventUnlocked(s, finale);
    const boss = RIVALS[finale.boss!.rival].name;
    const r = finale.boss!.reward;
    return {
      kind: 'finale', title: finale.name, subtitle: `Rival · ${boss}`,
      unlocks: [`$${r.cash.toLocaleString('en-US')} and ${r.crates} crates`, `The ${r.blueprint} paint for any car`, `The ${r.badge} badge`],
      needs: [{ kind: 'event', event: finale.id, eventName: finale.name, done: false, open: un.ok || !!un.switchCar, why: un.ok ? '' : un.why, ...(un.switchCar ? { switchCar: un.switchCar } : {}), boss, text: `Beat ${boss} in ${finale.name}` }],
      ready: false, progress: 0, line: `Beat ${boss} in ${finale.name}`,
    };
  }
  const c = collection(s);
  if (c.have >= c.total) return null;
  return { kind: 'collection', title: 'Collection', subtitle: `${c.have} of ${c.total}`, unlocks: [], needs: [], ready: false, progress: c.total ? c.have / c.total : 1, line: c.next };
}

/**
 * Everything the Garage shows about progress, earned and spendable kept apart.
 * Shape: see `ProgressSummary` — `{ earned: { rep, garage: { open, level, xp, xpLevel, xpNext }, stars: { have, total,
 * downtown }, cars: { owned, total }, topCarCap, topCraftedTier, maxTier, orderTier }, wallet: { cash, scrap },
 * glossary, next: Milestone | null, ladder: { car, model, cap, district, owned, needs }[] }`.
 */
export function progressSummary(s: GameState): ProgressSummary {
  const li = levelInfo(s);
  const starEvs = EVENTS.filter((e) => e.goals);
  const bits = (b: number) => (b & 1) + ((b >> 1) & 1) + ((b >> 2) & 1);
  const topCarCap = Math.max(...s.owned.map((id) => carById(id).cap));
  return {
    earned: {
      rep: s.rep,
      garage: { open: jobsUnlocked(s), level: li.level, xp: li.xp, xpLevel: li.from, xpNext: li.to },
      stars: { have: starEvs.reduce((n, e) => n + bits(s.stars?.[e.id] ?? 0), 0), total: starEvs.length * 3, downtown: starsIn(s) },
      cars: { owned: ENABLED_CARS.filter((c) => s.owned.includes(c.id)).length, total: ENABLED_CARS.length },
      topCarCap,
      topCraftedTier: Math.max(0, ...(['engine', 'tires', 'turbo'] as Family[]).map((f) => craftedTier(s, f))),
      maxTier: MAX_TIER,
      orderTier: orderMaxTier(s),
    },
    wallet: { cash: s.cash, scrap: s.scrap },
    glossary: {
      rep: 'Rep is earned by racing and never spent: it opens races and cars.',
      level: 'Garage Level rises with every job you clear on the Job Board; each level has a named reward.',
      carTier: `A car's tier is the highest part tier it can use (your best car: T${topCarCap}). Better parts fit, but run at that tier.`,
      partTier: `Part tiers go from T1 to T${MAX_TIER}; two parts of one tier merge into the next. A new car's keystone part must be merged by you.`,
      cash: 'Cash is spent in the Shop: parts, upgrades, Tune-ups and the Paint shop.',
      scrap: 'Scrap comes from recycling parts and is spent on scrap orders, polish, kits and restoration. It never turns back into cash.',
    },
    next: nextMilestone(s),
    ladder: ENABLED_CARS.filter((c) => c.unlock).map((c) => ({ car: c.id, model: c.model, cap: c.cap, district: DISTRICTS[c.district]?.name ?? c.district, owned: s.owned.includes(c.id), needs: carNeedsShort(c),
      handling: c.handling ?? c.blurb, after: carAfter(c), chaseable: chaseable(s, c), stages: carStages(c).length })),
  };
}
