// Rival Runs in the Race menu: a compact section of short challenges against recurring rivals, and a brief sheet
// before each run (eligible cars, objective, rule, guaranteed prize, best results). Owned by the Pit Setup &
// Rival Runs workstream.
import { rivalCarModel } from '../data/rivalCars';
import './css/pit.css';
import './css/redline.css'; // 1.10 Redline Series card (Progression)
import * as RR from '../core/rivalRuns';
import type { RivalRun } from '../data/rivalRuns';
import { computeLoadout } from '../core/loadout';
import { mph } from '../core/units';
import { CarId, RIVALS, TRACKS, carById, eventById } from '../data/tables';
import type { App } from './app';
import { h } from './dom';
import { openFitParts } from './fit';

export type StartRun = (runId: string, car: CarId) => void;

const bestLine = (app: App, run: RivalRun) => {
  const r = RR.runRecord(app.game.state, run.id);
  if (!r.tries) return 'Not tried yet';
  const gap = r.bestGap === null ? '' : r.bestGap >= 0 ? ` · beat ${RR.rivalName(run).split(' ')[0]} by ${r.bestGap.toFixed(2)} s` : ` · closest ${Math.abs(r.bestGap).toFixed(2)} s behind`;
  return `Best ${r.best !== null ? `${r.best.toFixed(2)} s` : '—'}${gap} · ${r.tries} ${r.tries === 1 ? 'try' : 'tries'}`;
};

/** 1.10 Redline Series (Progression workstream): one connected card — the reward car and its role up front, all five
 *  steps with their prizes, what is done, and one button for the next step. Shown above the Rival Runs. */
export function redlineSection(app: App, start: StartRun): HTMLElement | null {
  const s = app.game.state;
  const v = RR.redlineView(s);
  if (!v.visible) return null;
  const next = v.next;
  const car = next ? RR.defaultCar(s, next) : null;
  return h('section', { class: `redline-series${v.reward.owned ? ' done' : ''}`, 'aria-label': 'Redline Series', 'data-series': 'redline' },
    h('div', { class: 'feat-label' }, 'Redline Series', h('span', { class: 'rr-count' }, ` · ${v.done}/${v.of} steps`)),
    h('div', { class: 'rl-reward' },
      h('b', {}, v.reward.owned ? `✓ ${v.reward.model} earned` : `Reward: the ${v.reward.model}`),
      h('small', {}, `T${v.reward.cap} cap · ${v.reward.role}`)),
    h('ol', { class: 'rl-steps' }, ...v.steps.map((st) => h('li', { class: `rl-step${st.done ? ' done' : st.current ? ' current' : st.open ? '' : ' locked'}`, 'data-run': st.run.id },
      h('span', { class: 'rl-n', 'aria-hidden': 'true' }, st.done ? '✓' : String(st.step)),
      h('span', { class: 'rl-txt' },
        h('b', {}, st.run.name), ` · ${RR.rivalName(st.run)}`,
        h('small', {}, st.current || st.open ? st.run.goal : st.why ?? ''),
        h('small', { class: 'rl-prize' }, `${st.done ? 'Won' : 'Prize'}: ${st.prize}${st.tries && !st.done ? ` · ${st.tries} ${st.tries === 1 ? 'try' : 'tries'}` : ''}`)),
      st.open ? h('button', { class: 'btn sm', 'aria-label': `${st.run.name} details`, onclick: () => openRivalBrief(app, st.run.id, start) }, st.done ? 'Replay' : 'Details') : null))),
    v.lockedWhy ? h('p', { class: 'rr-intro' }, `🔒 ${v.lockedWhy}. Optional and at your own pace: every step can be retried, and each prize pays once.`)
      : next && car ? h('button', { class: 'btn primary rl-go', onclick: () => start(next.id, car) },
        h('span', { class: 'stack' }, `Step ${next.series!.step} · ${next.name}`, h('small', {}, `${carById(car).model} · ${RR.prizeText(next.prize)}`)))
        : next ? h('p', { class: 'rr-intro' }, `Step ${next.series!.step} takes the ${next.cars.map((c) => carById(c).model).slice(0, 3).join(', ')}…`) : null);
}

/** The Race menu section: open runs (unclaimed first), then the next locked one with what opens it. */
export function rivalRunsSection(app: App, start: StartRun): HTMLElement | null {
  const s = app.game.state;
  const list = RR.runsToShow(s);
  const series = redlineSection(app, start); // 1.10 Redline: the chain sits above the one-off runs
  if (!list.length) return series;
  const solo = RR.RIVAL_RUNS.filter((r) => !r.series);
  const claimed = solo.filter((r) => RR.runRecord(s, r.id).claimed).length;
  const sec = h('section', { class: 'rival-runs', 'aria-label': 'Rival Runs' },
    h('div', { class: 'feat-label' }, 'Rival Runs', h('span', { class: 'rr-count' }, ` · ${claimed}/${solo.length} prizes`)),
    h('p', { class: 'rr-intro' }, 'Short duels with a car rule. Optional, replay any time; each prize pays once.'),
    ...list.map(({ run, open }) => {
      const rec = RR.runRecord(s, run.id);
      const car = RR.defaultCar(s, run);
      return h('div', { class: `rr-card${open ? '' : ' locked'}${rec.claimed ? ' done' : ''}`, 'data-run': run.id },
        h('div', { class: 'rr-main' },
          h('div', { class: 'rr-name' }, h('b', {}, run.name), ` · ${RR.rivalName(run)}`),
          h('div', { class: 'rr-goal' }, run.goal),
          h('div', { class: 'rr-meta' }, run.rule),
          h('div', { class: 'rr-prize' }, rec.claimed ? `✓ ${RR.prizeText(run.prize)} won · ` : `Prize: ${RR.prizeText(run.prize)} · `, open ? bestLine(app, run) : `🔒 ${RR.lockedText(run)}`)),
        open ? h('div', { class: 'rr-btns' },
          h('button', { class: 'btn sm', onclick: () => openRivalBrief(app, run.id, start) }, 'Details'),
          car ? h('button', { class: 'btn sm primary-lite', onclick: () => start(run.id, car) }, rec.tries ? 'Retry' : 'Start') : null) : null);
    }));
  return series ? h('div', { class: 'rr-wrap' }, series, sec) : sec;
}

/** Before the run: the rival, the course, eligible cars (pick one), objective, rule, prize and best results. */
export function openRivalBrief(app: App, runId: string, start: StartRun, pick?: CarId) {
  const run = RR.rivalRunById(runId);
  if (!run) return;
  app.sheet((close) => {
    const body = h('div', { class: 'pit rr-brief' });
    let chosen: CarId | null = pick && RR.eligibleCars(app.game.state, run).includes(pick) ? pick : RR.defaultCar(app.game.state, run);
    const build = () => {
      const s = app.game.state;
      const rec = RR.runRecord(s, run.id);
      const ev = eventById(run.event);
      const rv = RIVALS[run.rival];
      const cars = run.cars.map((c) => {
        const own = s.owned.includes(c);
        const lo = own ? computeLoadout(s, c, undefined, run.partCap).stats : null;
        return h('button', {
          class: `rr-car${c === chosen ? ' on' : ''}${own ? '' : ' off'}`, disabled: !own, 'aria-pressed': c === chosen ? 'true' : 'false',
          onclick: () => { chosen = c; build(); },
        }, h('b', {}, carById(c).model), h('small', {}, own && lo ? `${mph(lo.top)} mph · accel ${lo.accel.toFixed(1)} · grip ${lo.grip.toFixed(2)}${run.partCap ? ` at T${run.partCap}` : ''}` : 'Not owned'));
      });
      const fact = (k: string, v: string) => h('div', { class: 'fact' }, h('small', {}, k), h('span', {}, v));
      body.replaceChildren(
        h('button', { class: 'btn sm close', onclick: close }, 'Close'),
        h('h2', {}, `${run.name} · ${rv?.name ?? run.rival}`),
        h('p', { class: 'rr-taunt' }, run.taunt),
        h('div', { class: 'rr-facts' },
          fact('Objective', run.goal),
          rv ? fact(`${rv.name.split(' ')[0]}’s car`, rivalCarModel(rv)) : null,
          fact('Course', `${TRACKS[ev.track].name} · ${TRACKS[ev.track].course}`),
          fact('Rules', run.rule),
          fact('Prize', rec.claimed ? `${RR.prizeText(run.prize)} — already yours` : `${RR.prizeText(run.prize)}, guaranteed the first time you meet the objective. ${RR.prizeDetail(run.prize)}`),
          fact('Your best', bestLine(app, run))),
        h('h3', {}, 'Eligible cars'),
        h('div', { class: 'rr-cars' }, ...cars),
        h('div', { class: 'pit-actions' },
          chosen ? h('button', { class: 'btn', onclick: () => { const c = chosen!; close(); openFitParts(app, c, undefined, { onClose: () => openRivalBrief(app, runId, start, c) }); } }, h('span', { class: 'stack' }, 'Fit parts', h('small', {}, carById(chosen).model))) : null,
          h('button', { class: `btn primary${chosen ? '' : ' off'}`, disabled: !chosen, onclick: () => { if (!chosen) return; close(); start(run.id, chosen); } },
            h('span', { class: 'stack' }, rec.tries ? 'Retry run' : 'Start run', h('small', {}, `${run.nitro ? `${run.nitro} nitro` : 'no nitro'} · no cash or Rep`)))),
      );
    };
    build();
    return body;
  });
}
