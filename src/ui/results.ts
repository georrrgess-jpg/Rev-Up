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

  const card = h('div', { class: `card${tierCls}`, role: 'dialog', 'aria-label': 'Race result' },
    h('div', { class: `place${r.place === 1 ? ' p1' : ''}` }, ev.speedTrap ? (r.medal ? `${MEDAL_NAMES[r.medal]} run` : 'Run complete') : ev.timeAttack ? (r.medal ? `${MEDAL_NAMES[r.medal]} time` : 'Run complete') : r.place === 1 ? 'You won!' : `${ordinal(r.place)} place`),
    h('div', { class: 'gap' }, h('span', { class: 'gap-main' }, r.gapText), h('span', { class: 'gap-sub' }, `${ev.name}${r.time ? ` · ${r.time.toFixed(2)} s` : ''}`)),
    r.boss && ev.boss ? h('div', { class: 'boss' }, h('b', {}, `${RIVALS[ev.boss.rival].name} is beaten.`), ({ ray: ' The Suburbs are open.', vale: ' The coast road is yours.', nova: ' Downtown is yours.', sable: ' The canyon is yours.', iver: ' The summit is yours — the whole ladder is beaten.' } as Record<string, string>)[ev.boss.rival] ?? '', ` Signature blueprint: ${ev.boss.reward.blueprint} paint (apply it in the Showroom) and the “${ev.boss.reward.badge}” badge.`) : null,
    r.newMedals?.length ? h('div', { class: 'finish-earned medal' }, h('span', { class: `medal-ico m${r.newMedals[r.newMedals.length - 1]}`, 'aria-hidden': 'true' }), h('div', {}, h('strong', {}, `${r.newMedals.map((m) => MEDAL_NAMES[m]).join(' + ')} medal`), h('div', {}, r.newMedals.map((m) => `+$${MEDAL_REWARDS[MEDAL_KEYS[m] as 'gold'].cash}`).join(' · ') + ' · paid once'))) : null,
    r.nextMedal ? h('p', { class: 'explain' }, (r.trapMph ?? r.trapKmh) ? `${r.nextMedal.name} at ${r.nextMedal.target} mph — ${Math.max(0, Math.round(r.nextMedal.gap))} mph to find.` : `${r.nextMedal.name} at ${r.nextMedal.target.toFixed(2)} s${r.time ? ` — ${Math.max(0, r.nextMedal.gap).toFixed(2)} s to find` : ''}.`) : null,
    r.newStars?.length ? h('div', { class: 'finish-earned stars-earned' }, h('span', { class: 'star-ico', 'aria-hidden': 'true' }, '★'), h('div', {}, h('strong', {}, `${r.newStars.length} new goal${r.newStars.length > 1 ? 's' : ''}: ${r.newStars.join(', ')}`), h('div', {}, `${P.starsIn(s, ev.district)} ${DISTRICTS[ev.district].name} star${P.starsIn(s, ev.district) === 1 ? '' : 's'}`))) : null,
    (r.trapMph ?? r.trapKmh) ? h('div', { class: 'trap' }, h('span', { class: 'num' }, `${r.trapMph ?? Math.round((r.trapKmh ?? 0) / 1.609344)}`), h('small', {}, 'mph through the gate')) : null,
    r.earnedStyle?.length ? h('div', { class: 'finish-earned' }, h('span', { 'aria-hidden': 'true' }, '🎨'), h('div', {}, h('strong', {}, r.earnedStyle.map((id) => styleItem(id)?.name ?? id).join(', ')), h('div', {}, 'Earned — apply it in the Showroom Paint shop'))) : null,
    r.heat ? h('div', { class: `heat-result${r.heat.champion ? ' champ' : r.heat.advanced ? ' through' : ' out'}` },
      r.heat.champion ? `Main Event champion!` : r.heat.advanced ? `Through! Next: ${r.heat.next}` : `Knocked out in ${r.heat.name}. Change cars, build, and start again from heat 1.`) : null,
    r.trophy ? h('div', { class: 'finish-earned' }, h('span', { class: 'trophy-ico', 'aria-hidden': 'true' }, '🏆'), h('div', {}, h('strong', {}, r.trophy), h('div', {}, 'Class trophy added to the Showroom'))) : null,
    h('div', { class: 'pays' }, ...pills),
    r.breakdown && r.breakdown.length > 1 ? h('div', { class: 'breakdown', 'aria-label': 'Cash breakdown' },
      ...r.breakdown.map((b) => h('div', { class: `bd ${b.kind}` }, h('span', {}, b.label), h('span', { class: 'num' }, `+$${b.cash}`)))) : null,
    repBlock,
    other.length ? h('div', { class: 'still-needed' }, h('small', {}, `Also needed for the ${g!.car.model}`), ...other.map((t) => h('div', {}, t))) : null,
    s.stats.races <= 2 ? h('p', { class: 'explain' }, 'Cash is spending money for the Shop. Rep is never spent: it builds up and opens new races and cars.') : null,
    finish ? h('div', { class: 'finish-earned' }, h('span', { class: 'swatch', style: `--paint:${finish.paint}` }), h('div', {}, h('strong', {}, finish.name), h('div', {}, 'Signature finish unlocked in the Showroom'))) : null,
    ev.id === 'foundry-final' && r.firstClear ? h('div', { class: 'finish-earned' }, 'Campaign finale won') : null,
    o.extras?.length ? h('div', { class: 'extras' }, ...o.extras) : null,
    h('div', { class: 'standing' }, ...r.standings.map((st, i) => h('div', { class: st.isPlayer ? 'me' : '' }, `${i + 1}. ${st.name}${st.time ? ` — ${st.time.toFixed(2)} s` : ''}`))),
    h('button', { class: 'next', onclick: () => { o.onClose(); if (!s.pendingReveal) app.go('garage'); } }, h('small', {}, nextLabel), nextText,
      g && !s.pendingReveal ? h('div', { class: 'bar' }, h('i', { style: `width:${Math.round(g.progress * 100)}%` })) : null),
    r.firstClear ? h('p', { class: 'pay quick-open' }, 'Quick Race is now open for this event: your crew can race it while you merge.') : null,
    canFit && !s.pendingReveal ? h('button', { class: 'btn wide fit-cta', onclick: () => { o.onClose(); openFitParts(app); } },
      fs.empty.length ? `Fit parts · ${fs.empty.length} empty slot${fs.empty.length > 1 ? 's' : ''}` : `Fit parts · better ${fs.better.map((f) => FAMILIES[f].name).join(' and ')} on your bench`) : null,
    h('div', { class: 'btns' },
      s.pendingReveal
        ? h('button', { class: 'btn primary', onclick: () => o.onClose() }, 'Reveal car')
        : h('button', { class: 'btn primary', onclick: () => { o.onClose(); app.go('garage'); } }, 'Back to Garage'),
      !s.pendingReveal ? h('button', { class: 'btn', onclick: () => o.onRetry(r.eventId) }, 'Race again') : null),
  );
  return card;
}
