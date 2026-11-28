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
  | { kind: 'shift'; clean: number };

export type RivalPrize =
  | { kind: 'part'; family: Family; tier: number; why: string }
  | { kind: 'paint'; name: string; paint: string }
  | { kind: 'style'; id: string };

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
    opens: 'muscle',
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

export const rivalRunById = (id: string) => RIVAL_RUNS.find((r) => r.id === id);
