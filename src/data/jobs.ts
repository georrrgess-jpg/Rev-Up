// Job Board tuning (the "one more round" mechanic): three short rotating jobs that refill on a timer, pay at once,
// and feed a Garage Level with a visible next reward, plus a streak for clearing jobs back to back.
// All numbers in one place; rules live in src/core/jobs.ts. Owned by the New mechanic workstream.

/** The board opens after this many race finishes (merge → fit → race is learned first), or with a second car. */
export const JOBS_UNLOCK_RACES = 3;
/** Job slots on a new board; the Garage Level 3 reward adds one. */
export const JOB_SLOTS = 3;
export const JOB_SLOTS_MAX = 4;
/** An empty slot refills after this long, while playing or away (one job per slot, so time away is bounded). */
export const JOB_REFILL_S = 240;
/** With the Garage Level 6 reward (Quick turnaround). */
export const JOB_REFILL_FAST_S = 180;
/** Skipping a job frees its slot sooner than clearing does not: a short wait, and the streak is untouched. */
export const JOB_SKIP_S = 60;

/** Streak: each job cleared adds 1; pay rises 10% per step above the first, up to +50%. */
export const STREAK_STEP = 0.1;
export const STREAK_MAX_BONUS = 0.5;
/** Active play (never time away) with an open job and no clear: the streak eases down one step, never to a wipe of
 *  anything earned. */
export const STREAK_IDLE_S = 600;

/** Cash per job as a share of the win purse of your best open ordinary race (progression.stagePurse). */
export const JOB_PAY: Record<JobKind, number> = {
  merge: 0.4,
  deliver: 0.4, // floor; parts pay by tier (DELIVER_SHARE of the order price)
  win: 0.5,
  shifts: 0.45,
  perfects: 0.45,
  classic: 0.6,
};
/** The smallest job payout. */
export const JOB_PAY_MIN = 25;
/** A delivered part pays this share of its order price (always less than ordering it, so buy → deliver loses),
 *  and Polished parts (which can't be bought for cash) pay DELIVER_POLISHED × that. */
export const DELIVER_SHARE = 0.5;
export const DELIVER_POLISHED = 1.4;

export type JobKind = 'merge' | 'deliver' | 'win' | 'shifts' | 'perfects' | 'classic';
/** How often each kind is drawn (when it is possible at your stage). */
export const JOB_WEIGHT: Record<JobKind, number> = { merge: 3, deliver: 4, win: 3, shifts: 2, perfects: 2, classic: 2 };

/** Garage XP needed to reach a level: L2 at 3, L3 at 7, L4 at 12 … (each level asks one more than the last). */
export const xpFor = (level: number) => (level <= 1 ? 0 : ((level - 1) * (level + 4)) / 2);

export type LevelReward =
  | { kind: 'crates'; crates: number; scrap: number }
  | { kind: 'slot' }
  | { kind: 'refill' }
  | { kind: 'style'; style: 'livery' | 'wheel' | 'paint' }
  | { kind: 'badge'; badge: string; crates: number }
  | { kind: 'part' };

/** The first ten levels by hand; beyond, a repeating pattern (a Polished part every third level). */
export const LEVEL_REWARDS: Record<number, LevelReward> = {
  2: { kind: 'crates', crates: 2, scrap: 20 },
  3: { kind: 'slot' },
  4: { kind: 'style', style: 'livery' },
  5: { kind: 'badge', badge: 'Trusted Garage', crates: 3 },
  6: { kind: 'refill' },
  7: { kind: 'part' },
  8: { kind: 'style', style: 'wheel' },
  9: { kind: 'crates', crates: 3, scrap: 60 },
  10: { kind: 'badge', badge: 'Master Garage', crates: 4 },
};
export function levelReward(level: number): LevelReward {
  const r = LEVEL_REWARDS[level];
  if (r) return r;
  if (level % 3 === 1) return { kind: 'part' };
  if (level % 5 === 0) return { kind: 'style', style: 'paint' };
  return { kind: 'crates', crates: 3, scrap: 20 + level * 5 };
}
