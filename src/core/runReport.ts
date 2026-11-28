// Rev Up — what changed since your last run (race workstream, 1.10 Redline). A finished race is summarised (time,
// launch split, top speed, clean shifts, boosts) and compared with the previous run of the same event in this
// session, or else with the personal best saved before this race. Pure; the result card draws the rows.
import type { RaceOutcome } from './race';
import { mph } from './units';

export interface RunSummary {
  eventId: string;
  car: string;
  time: number | null;
  /** Seconds to the end of the launch segment. */
  launch: number | null;
  top: number;
  clean: number;
  shifts: number;
  perfects: number;
  nitroUsed: number;
  place: number;
}

export function summarize(o: RaceOutcome): RunSummary {
  const me = o.standings.find((r) => r.isPlayer);
  return {
    eventId: o.eventId ?? '', car: me?.car ?? '', time: o.playerTime, launch: me?.splits[0] ?? null, top: mph(o.topSpeed ?? 0),
    clean: o.shiftsClean ?? 0, shifts: o.shifts ?? 0, perfects: o.perfects, nitroUsed: o.nitroUsed, place: o.place,
  };
}

export interface ChangeRow { label: string; now: string; was: string; delta: string; better: boolean | null }
export interface RunChanges { against: 'last' | 'best'; rows: ChangeRow[]; headline: string }

const sg = (x: number, d: number) => `${x > 0 ? '+' : x < 0 ? '−' : '±'}${Math.abs(x).toFixed(d)}`;

/**
 * What changed against the previous run of this event (same car), or against the personal best when there is no
 * previous run this session. Rows only for measures that moved; a headline that names the biggest one.
 */
export function compareRuns(cur: RunSummary, last: RunSummary | null, bestBefore: number | null): RunChanges | null {
  if (cur.time === null) return null;
  const rows: ChangeRow[] = [];
  if (last && last.eventId === cur.eventId && last.car === cur.car && last.time !== null) {
    const dt = cur.time - last.time;
    rows.push({ label: 'Time', now: `${cur.time.toFixed(2)} s`, was: `${last.time.toFixed(2)} s`, delta: `${sg(dt, 2)} s`, better: Math.abs(dt) < 0.005 ? null : dt < 0 });
    if (cur.launch !== null && last.launch !== null && Math.abs(cur.launch - last.launch) >= 0.01)
      rows.push({ label: 'Launch', now: `${cur.launch.toFixed(2)} s`, was: `${last.launch.toFixed(2)} s`, delta: `${sg(cur.launch - last.launch, 2)} s`, better: cur.launch < last.launch });
    if (cur.top !== last.top) rows.push({ label: 'Top speed', now: `${cur.top} mph`, was: `${last.top} mph`, delta: `${sg(cur.top - last.top, 0)} mph`, better: cur.top > last.top });
    if (cur.clean !== last.clean || cur.shifts !== last.shifts) rows.push({ label: 'Clean shifts', now: `${cur.clean}/${cur.shifts}`, was: `${last.clean}/${last.shifts}`, delta: '', better: cur.clean / Math.max(1, cur.shifts) > last.clean / Math.max(1, last.shifts) ? true : cur.clean / Math.max(1, cur.shifts) < last.clean / Math.max(1, last.shifts) ? false : null });
    if (cur.perfects !== last.perfects || cur.nitroUsed !== last.nitroUsed) rows.push({ label: 'Perfect boosts', now: `${cur.perfects}`, was: `${last.perfects}`, delta: '', better: cur.perfects > last.perfects ? true : cur.perfects < last.perfects ? false : null });
    const moved = rows.slice(1).filter((r) => r.better !== null);
    const lead = moved.find((r) => r.better === (dt < 0)) ?? moved[0];
    const headline = Math.abs(dt) < 0.005 ? 'Same time as your last run' : `${Math.abs(dt).toFixed(2)} s ${dt < 0 ? 'quicker' : 'slower'} than your last run${lead ? ` — ${lead.label.toLowerCase()} ${lead.was} → ${lead.now}` : ''}`;
    return { against: 'last', rows, headline };
  }
  if (bestBefore !== null && bestBefore > 0) {
    const dt = cur.time - bestBefore;
    rows.push({ label: 'Time', now: `${cur.time.toFixed(2)} s`, was: `${bestBefore.toFixed(2)} s`, delta: `${sg(dt, 2)} s`, better: Math.abs(dt) < 0.005 ? null : dt < 0 });
    return { against: 'best', rows, headline: dt < -0.005 ? `New best by ${Math.abs(dt).toFixed(2)} s` : `${dt.toFixed(2)} s off your best here` };
  }
  return null;
}
