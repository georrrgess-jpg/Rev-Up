// Race result card. Owned by the mobile UX workstream; the race screen passes extra rows (e.g. shift telemetry).
// Cash (spending money) and Rep (earned progress, never spent) are shown apart: what this race paid, where Rep
// now stands against the next threshold, and — separately — any craft or race win the next car still needs.
import * as P from '../core/progression';
import type { LastResult } from '../core/state';
import { DISTRICTS, FAMILIES, MEDAL_REWARDS, styleItem, RIVALS, SIGNATURE_FINISHES, carById, eventById } from '../data/tables';
import type { App } from './app';
import { repMilestones } from './app';
import { fitStatus } from './benefit';
import { fmt, h, ordinal } from './dom';
import { openFitParts } from './fit';
import * as RR from '../core/rivalRuns';
import type { RaceView } from './raceMenu';
import { openRivalBrief } from './rivalRuns';
import { jobsResultBlock } from './jobs';
import { currentGoal, explainFinish, hintFor, type GoalAction } from './contracts';
import { runGoalAction } from './goalCard';

const MEDAL_NAMES = ['', 'Bronze', 'Silver', 'Gold'];
const MEDAL_KEYS = ['', 'bronze', 'silver', 'gold'] as const;
/** The speed trap reports km/h until the stage-2 sim change; players only ever see mph. */

export interface ResultOpts {
  onClose: () => void;
  onRetry: (eventId: string) => void;
  /** Extra rows from the race screen (shift timing, speed), placed above the standings. */
  extras?: HTMLElement[];
}

export function resultCard(app: App, r: LastResult, o: ResultOpts): HTMLElement {
  const rr = app.game.rivalRunResult;
  if (rr && rr.raceId === r.raceId) return rivalRunCard(app, r, rr, o);
  const game = app.game;
  const s = game.state;
  const ev = eventById(r.eventId);
  const pills: HTMLElement[] = [
    h('span', { class: 'chip cash' }, `+$${r.cash}`, h('small', {}, ' cash')),
    h('span', { class: 'chip rep' }, `+${r.rep} Rep`),
  ];
  if (r.crates) pills.push(h('span', { class: 'chip' }, `📦 ${r.crates} crate${r.crates > 1 ? 's' : ''}`));
  if (r.perfects) pills.push(h('span', { class: 'chip nitro' }, r.precision && r.perfects > 2 ? `Perfect ×${r.perfects} (2 paid, +$${r.precision})` : `Perfect ×${r.perfects}${r.precision ? ` (+$${r.precision})` : ''}`));
  if (r.firstClear) pills.push(h('span', { class: 'chip', style: 'color:var(--gold)' }, 'First win bonus'));
  const g = P.goalStatus(s);
  const finish = r.signatureFinish ? SIGNATURE_FINISHES[r.signatureFinish] : undefined;
  if (r.personalBest) pills.push(h('span', { class: 'chip best' }, 'Personal best'));
  if (r.freshRep) pills.push(h('span', { class: 'chip rep' }, `New track bonus +${r.freshRep} Rep`));
  const nextLabel = s.pendingReveal ? 'Car unlocked' : 'Next step';
  const nextText = s.pendingReveal ? `The ${carById(s.pendingReveal).model} is ready to reveal.` : r.advice;
  const tierCls = r.boss || r.heat?.champion ? ' big' : s.pendingReveal ? ' big car' : r.newMedals?.length || r.trophy || r.newStars?.length || r.signatureFinish ? ' reward' : '';

  // Rep: before → now against the nearest threshold, and what that threshold opens.
  const before = Math.max(0, s.rep - r.rep);
  const ms = repMilestones(s)[0];
  const prevMs = ms ? Math.max(0, ...repMilestones({ ...s, rep: -1 }).filter((m) => m.rep <= before).map((m) => m.rep)) : 0;
  const repBlock = h('div', { class: 'rep-progress' },
    h('div', { class: 'rp-line' }, h('b', {}, 'Rep '), h('span', { class: 'num' }, `${fmt(before)} → ${fmt(s.rep)}`),
      ms ? h('span', { class: 'rp-next' }, ` · ${fmt(ms.rep - s.rep)} more for ${ms.what}`) : h('span', { class: 'rp-next' }, ' · every Rep threshold reached')),
    ms ? h('div', { class: 'bar' }, h('i', { style: `width:${Math.round(Math.min(1, (s.rep - prevMs) / Math.max(1, ms.rep - prevMs)) * 100)}%` })) : null);
  // The other requirements are not Rep: list them on their own so a player never waits on Rep alone.
  const other = g && !s.pendingReveal ? [
    !g.keystoneDone ? `Craft a T${g.tier} ${FAMILIES[g.family].name} (merge it yourself)` : '',
    g.event && !g.eventDone ? `Win ${eventById(g.event).name}` : '',
  ].filter(Boolean) : [];
  const fs = fitStatus(s);
  const canFit = fs.empty.length > 0 || fs.better.length > 0;

  // ---- one compact reward block: every reward as a chip, the explanations behind one tap
  const chips: HTMLElement[] = [...pills];
  const notes: (HTMLElement | null)[] = [];
  if (r.boss && ev.boss) {
    chips.unshift(h('span', { class: 'chip boss' }, `${RIVALS[ev.boss.rival].name} beaten`));
    notes.push(h('p', { class: 'boss' }, h('b', {}, `${RIVALS[ev.boss.rival].name} is beaten.`), ({ ray: ' The Suburbs are open.', vale: ' The coast road is yours.', nova: ' Downtown is yours.', sable: ' The canyon is yours.', iver: ' The summit is yours — the whole ladder is beaten.' } as Record<string, string>)[ev.boss.rival] ?? '', ` Signature blueprint: ${ev.boss.reward.blueprint} paint (apply it in the Showroom) and the “${ev.boss.reward.badge}” badge.`));
  }
  if (r.newMedals?.length) {
    chips.push(h('span', { class: 'chip medal' }, h('span', { class: `medal-ico m${r.newMedals[r.newMedals.length - 1]}`, 'aria-hidden': 'true' }), `${r.newMedals.map((m) => MEDAL_NAMES[m]).join(' + ')}`));
    notes.push(h('p', {}, `${r.newMedals.map((m) => MEDAL_NAMES[m]).join(' + ')} medal: ${r.newMedals.map((m) => `+$${MEDAL_REWARDS[MEDAL_KEYS[m] as 'gold'].cash}`).join(' · ')}, paid once.`));
  }
  if (r.newStars?.length) {
    chips.push(h('span', { class: 'chip star' }, `★ ${r.newStars.length} goal${r.newStars.length > 1 ? 's' : ''}`));
    notes.push(h('p', {}, `New goals: ${r.newStars.join(', ')} · ${P.starsIn(s, ev.district)} ${DISTRICTS[ev.district].name} star${P.starsIn(s, ev.district) === 1 ? '' : 's'}.`));
  }
  if (r.trophy) { chips.push(h('span', { class: 'chip trophy' }, `🏆 ${r.trophy}`)); notes.push(h('p', {}, 'Class trophy added to the Showroom.')); }
  if (r.earnedStyle?.length) {
    chips.push(h('span', { class: 'chip style' }, `🎨 ${r.earnedStyle.map((id) => styleItem(id)?.name ?? id).join(', ')}`));
    notes.push(h('p', {}, 'Earned style: apply it in the Showroom Paint shop.'));
  }
  if (finish) { chips.push(h('span', { class: 'chip style' }, h('span', { class: 'swatch', style: `--paint:${finish.paint}` }), finish.name)); notes.push(h('p', {}, `${finish.name}: signature finish unlocked in the Showroom.`)); }
  if (ev.id === 'foundry-final' && r.firstClear) chips.push(h('span', { class: 'chip trophy' }, 'Campaign finale won'));
  if (r.nextMedal) notes.push(h('p', {}, (r.trapMph ?? r.trapKmh) ? `${r.nextMedal.name} at ${r.nextMedal.target} mph — ${Math.max(0, Math.round(r.nextMedal.gap))} mph to find.` : `${r.nextMedal.name} at ${r.nextMedal.target.toFixed(2)} s${r.time ? ` — ${Math.max(0, r.nextMedal.gap).toFixed(2)} s to find` : ''}.`));
  if (r.breakdown && r.breakdown.length > 1) notes.push(h('div', { class: 'breakdown', 'aria-label': 'Cash breakdown' },
    ...r.breakdown.map((b) => h('div', { class: `bd ${b.kind}` }, h('span', {}, b.label), h('span', { class: 'num' }, `+$${b.cash}`)))));
  if (r.firstClear) notes.push(h('p', { class: 'quick-open' }, 'Quick Race is now open for this event: your crew can race it while you merge.'));
  if (other.length) notes.push(h('div', { class: 'still-needed' }, h('small', {}, `Also needed for the ${g!.car.model}`), ...other.map((t) => h('div', {}, t))));
  if (s.stats.races <= 2) notes.push(h('p', {}, 'Cash is spending money for the Shop. Rep is never spent: it builds up and opens new races and cars.'));
  const realNotes = notes.filter((x): x is HTMLElement => !!x);
  const rewards = h('div', { class: 'rewards' },
    h('div', { class: 'pays' }, ...chips),
    repBlock,
    realNotes.length ? h('details', { class: 'reward-more' }, h('summary', {}, 'Reward details'), ...realNotes) : null);

  // ---- why it went that way, and the one next step (Racing's explanation when available, else the advice)
  const why = explainFinish(r);
  let next: { label: string; sub?: string; run: () => void } | null = null;
  const close = () => o.onClose();
  if (s.pendingReveal) next = { label: 'Reveal car', sub: carById(s.pendingReveal).model, run: close };
  else if (why?.suggestion.action) { const a = why.suggestion.action; next = { label: a.label, run: () => { close(); runGoalAction(app, a); } }; }
  else if (canFit) next = { label: 'Fit parts', sub: fs.empty.length ? `${fs.empty.length} empty slot${fs.empty.length > 1 ? 's' : ''}` : `better ${fs.better.map((f) => FAMILIES[f].name).join(' and ')} waiting`, run: () => { close(); openFitParts(app); } };
  else {
    const goal = currentGoal(s);
    const a: GoalAction | undefined = goal?.action;
    if (goal && a && !(a.kind === 'race' && a.eventId === r.eventId)) next = { label: a.label, sub: goal.missing, run: () => { close(); runGoalAction(app, a); } };
  }
  // the race screen's own coach line already says what to try: no second copy of it
  // (1.10: the race's own "why" row — splits, exit speeds and one suggestion — counts too: notices never stack)
  const coached = !why && !s.pendingReveal && !!o.extras?.some((x) => x.classList.contains('race-coach') || x.classList.contains('cx-why') || !!x.querySelector?.('.race-coach, .cx-why'));
  const advice = why ? why.suggestion.text : s.pendingReveal ? nextText : r.advice || hintFor(s, 'results')?.text || nextText;

  const card = h('div', { class: `card${tierCls}`, role: 'dialog', 'aria-label': 'Race result' },
    h('div', { class: `place${r.place === 1 ? ' p1' : ''}` }, ev.speedTrap ? (r.medal ? `${MEDAL_NAMES[r.medal]} run` : 'Run complete') : ev.timeAttack ? (r.medal ? `${MEDAL_NAMES[r.medal]} time` : 'Run complete') : r.place === 1 ? 'You won!' : `${ordinal(r.place)} place`),
    h('div', { class: 'gap' }, h('span', { class: 'gap-main' }, why?.headline ?? r.gapText), h('span', { class: 'gap-sub' }, `${ev.name}${r.time ? ` · ${r.time.toFixed(2)} s` : ''}${why?.headline ? ` · ${r.gapText}` : ''}`)),
    (r.trapMph ?? r.trapKmh) ? h('div', { class: 'trap' }, h('span', { class: 'num' }, `${r.trapMph ?? Math.round((r.trapKmh ?? 0) / 1.609344)}`), h('small', {}, 'mph through the gate')) : null,
    r.heat ? h('div', { class: `heat-result${r.heat.champion ? ' champ' : r.heat.advanced ? ' through' : ' out'}` },
      r.heat.champion ? `Main Event champion!` : r.heat.advanced ? `Through! Next: ${r.heat.next}` : `Knocked out in ${r.heat.name}. Change cars, build, and start again from heat 1.`) : null,
    rewards,
    // the next step and the buttons right under the rewards, so they are in reach without scrolling
    coached ? null : h('div', { class: 'next' }, h('small', {}, nextLabel), advice),
    next ? h('button', { class: 'btn primary wide next-act', onclick: next.run }, h('span', { class: 'stack' }, next.label, next.sub ? h('small', {}, next.sub) : null)) : null,
    h('div', { class: 'btns' },
      s.pendingReveal ? null : h('button', { class: `btn${next ? '' : ' primary'}`, onclick: () => { close(); app.go('garage'); } }, 'Back to Garage'),
      !s.pendingReveal ? h('button', { class: 'btn', onclick: () => o.onRetry(r.eventId) }, 'Race again') : null),
    why?.reasons.length ? h('ul', { class: 'why-list' }, ...why.reasons.slice(0, 3).map((t) => h('li', {}, t))) : null,
    o.extras?.length ? h('div', { class: 'extras' }, ...o.extras) : null,
    jobsResultBlock(app, r.raceId),
    h('div', { class: 'standing' }, ...r.standings.map((st, i) => h('div', { class: st.isPlayer ? 'me' : '' }, `${i + 1}. ${st.name}${st.time ? ` — ${st.time.toFixed(2)} s` : ''}`))),
  );
  return card;
}

/** Rival Run result: objective met or not (with the numbers that decided it), the prize the first time, best
 *  results, the one suggestion the race data supports, and a one-tap retry with the same car. */
function rivalRunCard(app: App, r: LastResult, rr: RR.RivalRunResult, o: ResultOpts): HTMLElement {
  const run = RR.rivalRunById(rr.runId)!;
  const rec = RR.runRecord(app.game.state, run.id);
  const j = rr.judgement;
  const who = RR.rivalName(run).split(' ')[0];
  const facts: string[] = [];
  if (j.gap !== null) facts.push(j.gap >= 0 ? `Beat ${who} by ${RR.secs(j.gap)} s` : `${RR.secs(j.gap)} s behind ${who}`);
  if (run.objective.kind === 'launch' && j.launchGap !== null) facts.push(j.launchGap > 0 ? `Led the launch by ${RR.secs(j.launchGap)} s` : j.launchGap > -run.objective.within ? `Level out of the launch (${RR.secs(j.launchGap)} s)` : `${RR.secs(j.launchGap)} s behind out of the launch`);
  if (run.objective.kind === 'shift') facts.push(`${j.clean} clean shift${j.clean === 1 ? '' : 's'} (${run.objective.clean} needed)${j.missed ? ` · ${j.missed} missed` : ''}`);
  const race = app.views.race as RaceView;
  const retry = () => { o.onClose(); race.startRivalRun(run.id, rr.car); };
  return h('div', { class: `card rr-result${j.met ? ' reward' : ''}`, role: 'dialog', 'aria-label': 'Rival Run result' },
    h('div', { class: `place${j.met ? ' p1' : ''}` }, j.met ? 'Objective met!' : 'Not this time'),
    h('div', { class: 'gap' }, h('span', { class: 'gap-main' }, `${run.name} · ${RR.rivalName(run)}`), h('span', { class: 'gap-sub' }, `${run.goal}${r.time ? ` · ${r.time.toFixed(2)} s` : ''}`)),
    h('div', { class: 'rr-facts-line' }, ...facts.map((t) => h('span', { class: 'chip' }, t)), rr.newBest && !rr.firstTry ? h('span', { class: 'chip best' }, 'Personal best') : null),
    // buttons right under the verdict so a retry is one tap without scrolling, even on a small phone
    h('div', { class: 'btns' },
      h('button', { class: 'btn primary', onclick: retry }, 'Retry'),
      h('button', { class: 'btn', onclick: () => { o.onClose(); openRivalBrief(app, run.id, (id, car) => race.startRivalRun(id, car), rr.car); } }, 'Car & parts'),
      h('button', { class: 'btn', onclick: () => o.onClose() }, 'Done')),
    rr.prized ? h('div', { class: 'finish-earned' }, h('span', { 'aria-hidden': 'true' }, run.prize.kind === 'part' ? '🔧' : '🎨'), h('div', {}, h('strong', {}, RR.prizeText(run.prize)), h('div', {}, RR.prizeDetail(run.prize))))
      : rec.claimed ? h('p', { class: 'explain' }, `Prize already won (${RR.prizeText(run.prize)}). Replay for a better time.`)
      : h('p', { class: 'explain' }, `Prize waiting: ${RR.prizeText(run.prize)} — paid once, the first time you meet the objective.`),
    h('p', { class: 'explain rr-best' }, `Best ${rec.best !== null ? `${rec.best.toFixed(2)} s` : '—'}${rec.bestGap !== null ? ` · best margin ${rec.bestGap >= 0 ? '+' : '−'}${Math.abs(rec.bestGap).toFixed(2)} s` : ''} · ${rec.tries} ${rec.tries === 1 ? 'try' : 'tries'}`),
    jobsResultBlock(app, r.raceId),
    rr.suggestion ? h('p', { class: 'race-coach rr-suggest' }, h('b', {}, 'Try · '), rr.suggestion) : null,
    o.extras?.length ? h('div', { class: 'extras' }, ...o.extras) : null,
    h('div', { class: 'standing' }, ...r.standings.map((st, i) => h('div', { class: st.isPlayer ? 'me' : '' }, `${i + 1}. ${st.name}${st.time ? ` — ${st.time.toFixed(2)} s` : ''}`))),
  );
}
