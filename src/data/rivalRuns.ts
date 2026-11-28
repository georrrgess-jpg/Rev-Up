// Rival Runs (Pit Stop update): short, optional, replayable challenges against recurring rivals that ask you to
// bring an older car or a different setup. Each reuses an existing event's track and field (so the race, controls,
// HUD and scenery are the normal ones) and adds a car rule, an optional part cap / nitro rule and one objective
// against one named rival. Each pays one guaranteed prize, once. Owned by the Pit Setup & Rival Runs workstream.
import { BLUEPRINT_FINISHES, CarId, Family } from './tables';

export type RivalObjective =
  /** Be level (within `within` s) or ahead of the rival at the end of the launch segment, and finish ahead. */
  | { kind: 'launch'; within: number }
  /** Finish ahead of the rival. */
  | { kind: 'beat' }
  /** Finish ahead of the rival with at least `clean` clean shifts and no missed shift. */
  | { kind: 'shift'; clean: number }
  /** 1.10: finish ahead of the rival with at least `perfects` Perfect boosts. */
  | { kind: 'boost'; perfects: number };

export type RivalPrize =
  | { kind: 'part'; family: Family; tier: number; why: string }
  | { kind: 'paint'; name: string; paint: string }
  | { kind: 'style'; id: string }
  /** 1.10: a free Tune-up stage for the car you raced (its cash price when it is fully tuned). */
  | { kind: 'tune' }
  /** 1.10: a car of your own (the Redline Series' Kestrel 1600 R). */
  | { kind: 'car'; car: CarId };

export interface RivalRun {
  id: string;
  name: string;
  /** Base rival id (RIVALS key before the per-event suffix). */
  rival: string;
  /** Existing event whose track and field the run reuses. */
  event: string;
  /** Cars allowed, oldest first. */
  cars: CarId[];
  /** Every part runs at most this tier (and Tune-ups are off), as in the Stock Cup. */
  partCap?: number;
  /** Nitro charges for the run (banked nitro is never spent on a Rival Run). */
  nitro: number;
  /** Rival shift quality for this run. */
  rivalShift?: 'ordinary' | 'clean';
  objective: RivalObjective;
  /** One line for the card: what to do. */
  goal: string;
  /** The rule in one line (cars, cap, nitro). */
  rule: string;
  prize: RivalPrize;
  /** Opens when this car is owned. */
  opens: CarId;
  /** The rival's challenge line. */
  taunt: string;
  /** 1.10: a step of a challenge chain (the Redline Series): shown as one connected card, not with the Rival Runs. */
  series?: { id: 'redline'; step: number; of: number };
  /** 1.10: this run opens once that run's prize is won (the chain's previous step). */
  after?: string;
}

/** Kit Navarro's rival paint: earned only from her Rival Run; any car can wear it in the Showroom. */
export const KIT_FINISH = { name: 'Kit’s Apex Red', paint: '#c2462e' };
// Rival paints join the Showroom's blueprint finishes (additive; the list is read wherever blueprints are shown).
if (!BLUEPRINT_FINISHES.some((b) => b.name === KIT_FINISH.name)) BLUEPRINT_FINISHES.push(KIT_FINISH);

export const RIVAL_RUNS: RivalRun[] = [
  {
    id: 'rr-pip-launch', name: 'Launch Duel', rival: 'pip', event: 'tapeback-trophy',
    cars: ['junker'], nitro: 1, rivalShift: 'clean', objective: { kind: 'launch', within: 0.05 },
    goal: 'Match Tilly off the line (level or ahead after the launch), then beat her to the line',
    rule: 'Tapeback 1.1 only · 1 nitro · Tilly shifts clean',
    prize: { kind: 'part', family: 'turbo', tier: 3, why: 'two of them merge into the Vexa GTi’s T4 Turbo' },
    opens: 'beater',
    taunt: '“Still driving the taped one? Bet you can’t even beat me off the line.”',
  },
  {
    id: 'rr-sol-shift', name: 'Fifth Gear', rival: 'sol', event: 'maple-mile',
    cars: ['hothatch'], nitro: 0, rivalShift: 'clean', objective: { kind: 'shift', clean: 4 },
    goal: 'Beat Sol down the Maple Highway with 4 clean shifts and none missed',
    rule: 'Vexa GTi only · no nitro — shifting only · Sol shifts clean',
    prize: { kind: 'style', id: 'livery:checker' },
    opens: 'hothatch', // 1.10: was the Ironhorse — a Vexa-only run now opens with the Vexa, inside the long Vexa stretch
    taunt: '“No nitro, no excuses. Just you, the gearbox and the long road.”',
  },
  {
    id: 'rr-kit-apex', name: 'Apex Duel', rival: 'kit', event: 'hatch-attack',
    cars: ['muscle'], partCap: 3, nitro: 3, objective: { kind: 'beat' },
    goal: 'Beat Kit through the Cliffside Esses',
    rule: 'Ironhorse 455 only · every part runs at T3 · no Tune-ups · 3 nitro',
    prize: { kind: 'paint', name: KIT_FINISH.name, paint: KIT_FINISH.paint },
    opens: 'tourer',
    taunt: '“Big engines are for people who can’t corner. Show me that Ironhorse can.”',
  },
];

// ---- 1.10 Redline Series (Progression workstream): five connected steps, each a different skill or build choice,
// each with a prize you can use at once, ending in an original earned car. Fields: src/data/redline.ts.
/** Won in step 1 of the Redline Series; any car can wear it. */
export const REDLINE_FINISH = { name: 'Redline Red', paint: '#d4162a' };
if (!BLUEPRINT_FINISHES.some((b) => b.name === REDLINE_FINISH.name)) BLUEPRINT_FINISHES.push(REDLINE_FINISH);
/** The Redline Series' car and why it is worth driving (shown on the series card before you start). */
export const REDLINE_CAR: CarId = 'kestrelr';
const LATE: CarId[] = ['gt', 'ardent', 'proto', 'vireo', 'mako', 'meridian', 'sovereign', 'tempest', 'kestrelr'];
const RL = (step: number) => ({ id: 'redline' as const, step, of: 5 });
RIVAL_RUNS.push(
  {
    id: 'rl-1', name: 'Shakedown', rival: 'kai', event: 'rl-shakedown', series: RL(1),
    cars: ['tuner'], nitro: 2, rivalShift: 'clean', objective: { kind: 'shift', clean: 3 },
    goal: 'Beat Hiro round the Neon Mile in your Kestrel 1600 with 3 clean shifts and none missed',
    rule: 'Kestrel 1600 only (its T6 cap) · 2 nitro · rivals shift clean',
    prize: { kind: 'paint', name: REDLINE_FINISH.name, paint: REDLINE_FINISH.paint },
    opens: 'gt',
    taunt: '“Kit says you want her R. Show me the car it started as can still corner.”',
  },
  {
    id: 'rl-2', name: 'Hole Shot', rival: 'tomas', event: 'rl-holeshot', series: RL(2), after: 'rl-1',
    cars: ['rally', ...LATE], nitro: 2, rivalShift: 'clean', objective: { kind: 'launch', within: 0.05 },
    goal: 'Leave the line level with Tomás or ahead (after the launch), then beat him to the flag',
    rule: 'Any car from the Corvo Rally on · 2 nitro · rally cars launch hard on gravel',
    prize: { kind: 'part', family: 'turbo', tier: 8, why: 'fit it to a T8 car, or merge two toward the Halcyon X’s T9 Turbo' },
    opens: 'gt',
    taunt: '“On gravel the race is over in the first hundred metres. Usually mine.”',
  },
  {
    id: 'rl-3', name: 'Stock R', rival: 'ozzy', event: 'rl-stock', series: RL(3), after: 'rl-2',
    cars: ['tourer', 'tuner', 'super', 'rally', ...LATE], partCap: 6, nitro: 2, rivalShift: 'clean', objective: { kind: 'beat' },
    goal: 'Beat Reggie down the Skyline Run with every part at T6 — pick the base car that suits it',
    rule: 'Any car from the Altamar GT on · every part runs at T6 · no Tune-ups · 2 nitro',
    prize: { kind: 'tune' },
    opens: 'gt',
    taunt: '“Same parts for everyone. Now we find out who bought the right car.”',
  },
  {
    id: 'rl-4', name: 'Apex Hunt', rival: 'kenji', event: 'rl-apex', series: RL(4), after: 'rl-3',
    cars: LATE, nitro: 2, rivalShift: 'clean', objective: { kind: 'boost', perfects: 2 },
    goal: 'Beat Kenji through Glacier Pass with 2 Perfect boosts (fire inside each boost zone)',
    rule: 'Any car from the Strata GTR on · 2 nitro · the boost zones sit on the sweeper exits',
    prize: { kind: 'part', family: 'tires', tier: 9, why: 'T9 grip for the Halcyon X or any Riviera car — and the Kestrel R’s cap' },
    opens: 'gt',
    taunt: '“Downforce is free speed. Nitro in the wrong place is just noise.”',
  },
  {
    id: 'rl-5', name: 'Redline Final', rival: 'kit-r', event: 'rl-final', series: RL(5), after: 'rl-4',
    cars: LATE, nitro: 2, rivalShift: 'clean', objective: { kind: 'shift', clean: 5 },
    goal: 'Beat Kit’s Kestrel 1600 R round the Summit Circuit with 5 clean shifts and none missed',
    rule: 'Any car from the Strata GTR on · 2 nitro · everyone shifts clean',
    prize: { kind: 'car', car: REDLINE_CAR },
    opens: 'gt',
    taunt: '“Beat the R and it’s yours. I’ll build another. I always do.”',
  },
);
// ---- end 1.10 Redline

export const rivalRunById = (id: string) => RIVAL_RUNS.find((r) => r.id === id);
