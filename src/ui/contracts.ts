// One small adapter over the Circuit Update contracts that other workstreams are building in parallel:
//  - Progression: src/core/goals.ts (goalOptions, currentGoal, hintFor), game.pickGoal, src/core/shelf.ts (isOverCap,
//    earliestCarFor, store/return game methods) and src/ui/shelf.ts (openShelf).
//  - Racing: competitionSummary(s) and explainFinish(result) (src/core/competition.ts or src/core/race.ts).
// Each one is picked up from its module when it exists; until then a plain fallback built from today's rules keeps
// every screen working. When the lead integrates, these globs can become static imports without touching callers.
import * as B from '../core/board';
import * as P from '../core/progression';
import * as CX from '../core/circuit';
import type { SlotRef } from '../core/events';
import type { Game } from '../core/game';
import type { App } from './app';
import type { GameState, LastResult, Part } from '../core/state';
import { EVENTS, FAMILIES, RIVALS, carById, eventById, type CarId, type Family } from '../data/tables';

// ---------------------------------------------------------------- types (from the contract)

export type GoalAction = { label: string } & (
  | { kind: 'race'; eventId: string }
  | { kind: 'craft'; family: Family; tier: number }
  | { kind: 'order'; family: Family; tier: number; currency: 'cash' | 'scrap' | string }
  | { kind: 'workshop'; area: string }
  | { kind: 'merge' }
  | { kind: 'shelf' }
  | { kind: 'upgrade'; id: string });

export interface Goal {
  key: string;
  title: string;
  car?: CarId | string;
  why: string;
  reward: string;
  missing: string;
  progress: number;
  stages: { label: string; done: boolean; reward?: string }[];
  sessionMilestone?: string | null | { label: string; done?: boolean };
  action: GoalAction;
  alt?: GoalAction;
}

export interface CompetitionSummary {
  ladder?: { position: number; total: number; label?: string };
  nextRival?: { name: string; eventId?: string; prize?: string; ready?: boolean };
  series?: { name: string; round: number; of: number; points?: number; leader?: string } | null;
  ghost?: { eventId?: string; best?: number; ghost?: number; text?: string } | null;
}

export interface FinishExplanation { headline: string; reasons: string[]; suggestion: { text: string; action?: GoalAction } }

type Mod = Record<string, unknown>;
const fn = <T>(mods: Record<string, Mod>, name: string): T | undefined => {
  for (const m of Object.values(mods)) if (typeof m[name] === 'function') return m[name] as T;
  return undefined;
};

// Modules that may or may not exist yet (empty objects when they do not).
const goalsMod = import.meta.glob<Mod>('../core/goals.ts', { eager: true });
const shelfCore = import.meta.glob<Mod>('../core/shelf.ts', { eager: true });
const compMods = import.meta.glob<Mod>(['../core/competition.ts', '../core/race.ts', '../core/rivalRuns.ts'], { eager: true });

// ---------------------------------------------------------------- goals

/** The goal the Garage leads with: Progression's chosen goal, or the next car's next requirement. */
export function currentGoal(s: GameState): Goal | null {
  const f = fn<(s: GameState) => Goal | null>(goalsMod, 'currentGoal');
  if (f) { try { return f(s); } catch (err) { console.warn('currentGoal failed', err); } }
  return fallbackGoal(s);
}

/** Every goal the player may switch to ("Change goal"). */
export function goalOptions(s: GameState): Goal[] {
  const f = fn<(s: GameState) => Goal[]>(goalsMod, 'goalOptions');
  if (f) { try { return f(s); } catch (err) { console.warn('goalOptions failed', err); } }
  const g = fallbackGoal(s);
  return g ? [g] : [];
}

export const canPickGoal = (game: Game) => typeof (game as unknown as Mod).pickGoal === 'function';
export function pickGoal(game: Game, key: string | null) {
  const f = (game as unknown as Mod).pickGoal as ((k: string | null) => unknown) | undefined;
  return f?.call(game, key);
}

/** The one contextual hint for a screen (null: nothing to say there), so the same hint never repeats across
 *  screens. Without Progression's hintFor every screen stays quiet and the Garage's goal card carries the goal. */
export function hintFor(s: GameState, screen: 'garage' | 'race' | 'shop' | 'results' | 'showroom'): { text: string; action?: GoalAction } | null {
  const f = fn<(s: GameState, screen: string) => string | { text: string; action?: GoalAction } | null>(goalsMod, 'hintFor');
  if (!f) return null;
  try { const r = f(s, screen); return !r ? null : typeof r === 'string' ? { text: r } : r; } catch { return null; }
}

/** The next car's requirements as a contract Goal (before src/core/goals.ts lands). */
function fallbackGoal(s: GameState): Goal | null {
  const g = P.goalStatus(s);
  if (!g) return null;
  const fam = FAMILIES[g.family];
  const pairTier = g.tier - 1;
  const haveCraftPair = B.allParts(s).filter((p) => p.f === g.family && p.t === pairTier).length >= 2;
  const ev = g.event ? eventById(g.event) : null;
  const evOpen = ev ? P.eventUnlocked(s, ev).ok : false;
  const rec = P.recommendedEvent(s);
  let action: GoalAction;
  let missing: string;
  if (!g.keystoneDone) {
    missing = `Craft a T${g.tier} ${fam.name}`;
    action = haveCraftPair
      ? { kind: 'craft', family: g.family, tier: g.tier, label: `Merge T${pairTier} ${fam.plural}` }
      : { kind: 'order', family: g.family, tier: Math.max(1, pairTier), currency: 'cash', label: `Order ${fam.plural}` };
  } else if (ev && !g.eventDone && evOpen) {
    missing = `Win ${ev.name}`;
    action = { kind: 'race', eventId: ev.id, label: `Race ${ev.name}` };
  } else if (s.rep < g.repNeed) {
    missing = `${(g.repNeed - s.rep).toLocaleString('en-US')} more Rep`;
    action = { kind: 'race', eventId: rec.id, label: `Race ${rec.name}` };
  } else {
    missing = ev && !g.eventDone ? `Win ${ev.name}` : 'Nearly there';
    action = { kind: 'race', eventId: rec.id, label: `Race ${rec.name}` };
  }
  const stages = [
    { label: `Craft T${g.tier} ${fam.name}`, done: g.keystoneDone },
    ...(ev ? [{ label: `Win ${ev.name}`, done: g.eventDone }] : []),
    { label: `${g.repNeed.toLocaleString('en-US')} Rep`, done: s.rep >= g.repNeed },
  ];
  return {
    key: `car:${g.car.id}`, title: g.car.model, car: g.car.id, why: g.car.blurb,
    reward: `The ${g.car.model} · parts to T${g.car.cap}`, missing, progress: g.progress, stages, action,
    sessionMilestone: null,
  };
}

// ---------------------------------------------------------------- Parts Shelf

/** True when the part is above the active car's cap (it would fit but run capped): offer Store. */
export function isOverCap(s: GameState, part: Part): boolean {
  const f = fn<(s: GameState, p: Part) => boolean>(shelfCore, 'isOverCap');
  if (f) { try { return f(s, part); } catch { /* fall through */ } }
  return part.t > carById(s.activeCar).cap;
}

/** The first car that runs this part at full strength ("for the Strata GTR"), if any is known. */
export function earliestCarFor(part: Part): string | null {
  const f = fn<(p: Part) => CarId | { id: CarId } | null>(shelfCore, 'earliestCarFor');
  if (!f) return null;
  try { const c = f(part); const id = typeof c === 'string' ? c : c?.id; return id ? carById(id).model : null; } catch { return null; }
}

const STORE_METHODS = ['storePart', 'shelfPart', 'storeOnShelf', 'toShelf'];
/** Whether the game can store a bench part on the Parts Shelf (Progression's method has landed). */
export const canStore = (game: Game) => STORE_METHODS.some((m) => typeof (game as unknown as Mod)[m] === 'function');
export function storePart(game: Game, at: SlotRef): unknown {
  for (const m of STORE_METHODS) {
    const f = (game as unknown as Mod)[m];
    if (typeof f === 'function') return (f as (r: SlotRef) => unknown).call(game, at);
  }
  return null;
}

/** Open the Parts Shelf (src/ui/shelf.ts) — or the spares list until it exists. */
export async function openShelfOr(app: App) {
  const mods = import.meta.glob<Mod>('./shelf.ts');
  const load = Object.values(mods)[0];
  if (load) {
    const m = await load();
    const open = m.openShelf as ((a: typeof app) => unknown) | undefined;
    if (open) { open(app); return; }
  }
  (await import('./spares')).openSpares(app);
}

// ---------------------------------------------------------------- competition

export function competitionSummary(s: GameState): CompetitionSummary | null {
  // Racing's Circuit summary (src/core/circuit.ts), mapped onto the Race menu's strip
  try {
    const c = CX.competitionSummary(s);
    const n = c.ladder.next;
    const tr = c.trials.filter((t) => t.best != null).sort((a, b) => b.medal - a.medal)[0];
    return {
      ladder: { position: c.ladder.position, total: c.ladder.of, label: 'Rival ladder' },
      nextRival: n ? { name: n.name, eventId: n.event, prize: n.prize, ready: n.open } : undefined,
      series: { name: c.series.name, round: Math.min(c.series.rounds.length, c.series.wins + (c.series.next ? 1 : 0)), of: c.series.rounds.length, points: c.series.points },
      ghost: tr ? { eventId: tr.event, best: tr.best ?? undefined, text: `${tr.name} ${tr.best!.toFixed(2)} s${tr.nextMedal ? ` · ${tr.nextMedal.name} ${tr.nextMedal.target.toFixed(1)} s` : ''}` } : null,
    };
  } catch (err) { console.warn('competitionSummary failed', err); }
  // fallback: the rival ladder (one boss per district) and the next rival you can challenge
  const bosses = EVENTS.filter((e) => e.boss && !e.heatOf);
  const beaten = bosses.filter((e) => s.bosses.includes(e.boss!.rival));
  const next = bosses.find((e) => !s.bosses.includes(e.boss!.rival));
  if (!bosses.length) return null;
  const ok = next ? P.eventUnlocked(s, next) : null;
  return {
    ladder: { position: beaten.length, total: bosses.length, label: 'Rivals beaten' },
    nextRival: next ? { name: RIVALS[next.boss!.rival].name, eventId: next.id, prize: `${next.boss!.reward.blueprint} paint · $${next.boss!.reward.cash.toLocaleString('en-US')}`, ready: !!ok?.ok } : undefined,
    series: null,
    ghost: null,
  };
}

export function explainFinish(r: LastResult): FinishExplanation | null {
  const f = fn<(r: LastResult) => FinishExplanation | null>(compMods, 'explainFinish');
  if (f) { try { return f(r); } catch (err) { console.warn('explainFinish failed', err); } }
  return null;
}
