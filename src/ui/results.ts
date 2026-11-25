// Race result card. Owned by the mobile UX workstream; the race screen passes extra rows (e.g. shift telemetry).
import * as P from '../core/progression';
import type { LastResult } from '../core/state';
import { MEDAL_REWARDS, RIVALS, SIGNATURE_FINISHES, carById, eventById } from '../data/tables';
import type { App } from './app';
import { h, ordinal } from './dom';

const MEDAL_NAMES = ['', 'Bronze', 'Silver', 'Gold'];
const MEDAL_KEYS = ['', 'bronze', 'silver', 'gold'] as const;

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
      h('span', { class: 'chip cash' }, `+$${r.cash}`),
      h('span', { class: 'chip rep' }, `+${r.rep} Rep`),
    ];
    if (r.crates) pills.push(h('span', { class: 'chip' }, `📦 ${r.crates} crate${r.crates > 1 ? 's' : ''}`));
    if (r.perfects) pills.push(h('span', { class: 'chip nitro' }, `Perfect ×${r.perfects}${r.precision ? ` (+$${r.precision})` : ''}`));
    if (r.firstClear) pills.push(h('span', { class: 'chip', style: 'color:var(--gold)' }, 'First win bonus'));
    const g = P.goalStatus(s);
    const finish = r.signatureFinish ? SIGNATURE_FINISHES[r.signatureFinish] : undefined;
    if (r.personalBest) pills.push(h('span', { class: 'chip best' }, 'Personal best'));
    if (r.freshRep) pills.push(h('span', { class: 'chip rep' }, `New track bonus +${r.freshRep} Rep`));
    const nextLabel = s.pendingReveal ? 'Car unlocked' : 'Next step';
    const nextText = s.pendingReveal ? `The ${carById(s.pendingReveal).model} is ready to reveal.` : r.advice;
    const tierCls = r.boss || r.heat?.champion ? ' big' : s.pendingReveal ? ' big car' : r.newMedals?.length || r.trophy || r.newStars?.length || r.signatureFinish ? ' reward' : '';
    const card = h('div', { class: `card${tierCls}`, role: 'dialog', 'aria-label': 'Race result' },
      h('div', { class: `place${r.place === 1 ? ' p1' : ''}` }, ev.speedTrap ? (r.medal ? `${['', 'Bronze', 'Silver', 'Gold'][r.medal]} run` : 'Run complete') : ev.timeAttack ? (r.medal ? `${['', 'Bronze', 'Silver', 'Gold'][r.medal]} time` : 'Run complete') : r.place === 1 ? 'You won!' : `${ordinal(r.place)} place`),
      h('div', { class: 'gap' }, h('span', { class: 'gap-main' }, r.gapText), h('span', { class: 'gap-sub' }, `${ev.name}${r.time ? ` · ${r.time.toFixed(2)} s` : ''}`)),
      r.boss && ev.boss ? h('div', { class: 'boss' }, h('b', {}, `${RIVALS[ev.boss.rival].name} is beaten.`), ({ ray: ' The Suburbs are open.', vale: ' The coast road is yours.', nova: ' Downtown is yours.' } as Record<string, string>)[ev.boss.rival] ?? '', ` Signature blueprint: ${ev.boss.reward.blueprint} paint (apply it in the Showroom) and the “${ev.boss.reward.badge}” badge.`) : null,
      r.newMedals?.length ? h('div', { class: 'finish-earned medal' }, h('span', { class: `medal-ico m${r.newMedals[r.newMedals.length - 1]}`, 'aria-hidden': 'true' }), h('div', {}, h('strong', {}, `${r.newMedals.map((m) => MEDAL_NAMES[m]).join(' + ')} medal`), h('div', {}, r.newMedals.map((m) => `+$${MEDAL_REWARDS[MEDAL_KEYS[m] as 'gold'].cash}`).join(' · ') + ' · paid once'))) : null,
      r.nextMedal ? h('p', { class: 'explain' }, r.trapKmh ? `${r.nextMedal.name} at ${r.nextMedal.target} km/h — ${Math.max(0, r.nextMedal.gap)} km/h to find.` : `${r.nextMedal.name} at ${r.nextMedal.target.toFixed(2)} s${r.time ? ` — ${Math.max(0, r.nextMedal.gap).toFixed(2)} s to find` : ''}.`) : null,
      r.newStars?.length ? h('div', { class: 'finish-earned stars-earned' }, h('span', { class: 'star-ico', 'aria-hidden': 'true' }, '★'), h('div', {}, h('strong', {}, `${r.newStars.length} new goal${r.newStars.length > 1 ? 's' : ''}: ${r.newStars.join(', ')}`), h('div', {}, `${P.starsIn(s)} Downtown stars`))) : null,
      r.trapKmh ? h('div', { class: 'trap' }, h('span', { class: 'num' }, `${r.trapKmh}`), h('small', {}, 'km/h through the gate')) : null,
      r.heat ? h('div', { class: `heat-result${r.heat.champion ? ' champ' : r.heat.advanced ? ' through' : ' out'}` },
        r.heat.champion ? `Main Event champion!` : r.heat.advanced ? `Through! Next: ${r.heat.next}` : `Knocked out in ${r.heat.name}. Change cars, build, and start again from heat 1.`) : null,
      r.trophy ? h('div', { class: 'finish-earned' }, h('span', { class: 'trophy-ico', 'aria-hidden': 'true' }, '🏆'), h('div', {}, h('strong', {}, r.trophy), h('div', {}, 'Class trophy added to the Showroom'))) : null,
      h('div', { class: 'pays' }, ...pills),
      r.breakdown && r.breakdown.length > 1 ? h('div', { class: 'breakdown', 'aria-label': 'Cash breakdown' },
        ...r.breakdown.map((b) => h('div', { class: `bd ${b.kind}` }, h('span', {}, b.label), h('span', { class: 'num' }, `+$${b.cash}`)))) : null,
      s.stats.races <= 1 ? h('p', { class: 'explain' }, 'Cash buys upgrades and crates · Rep unlocks new cars · Crates drop parts onto your bench.') : null,
      finish ? h('div', { class: 'finish-earned' }, h('span', { class: 'swatch', style: `--paint:${finish.paint}` }), h('div', {}, h('strong', {}, finish.name), h('div', {}, 'Signature finish unlocked in the Showroom'))) : null,
      ev.id === 'foundry-final' && r.firstClear ? h('div', { class: 'finish-earned' }, 'Campaign finale won') : null,
      ...(o.extras ?? []),
      h('div', { class: 'standing' }, ...r.standings.map((st, i) => h('div', { class: st.isPlayer ? 'me' : '' }, `${i + 1}. ${st.name}${st.time ? ` — ${st.time.toFixed(2)} s` : ''}`))),
      h('button', { class: 'next', onclick: () => { o.onClose(); if (!s.pendingReveal) app.go('garage'); } }, h('small', {}, nextLabel), nextText,
        g && !s.pendingReveal ? h('div', { class: 'bar' }, h('i', { style: `width:${Math.round(g.progress * 100)}%` })) : null),
      r.firstClear ? h('p', { class: 'pay', style: 'margin:-4px 0 10px' }, 'Quick Race is now available for this event.') : null,
      h('div', { class: 'btns' },
        s.pendingReveal
          ? h('button', { class: 'btn primary', onclick: () => o.onClose() }, 'Reveal car')
          : h('button', { class: 'btn primary', onclick: () => { o.onClose(); app.go('garage'); } }, 'Back to Garage'),
        !s.pendingReveal ? h('button', { class: 'btn', onclick: () => o.onRetry(r.eventId) }, 'Race again') : null),
    );
  return card;
}
