import { goalStatus, offlineMaxS, offlinePayout, stagePurse } from '../core/progression';
import { OFFLINE_BUDGET_RACES, eventById } from '../data/tables';
import type { App } from './app';
import { durationText, fmt, h } from './dom';

let open = false;

/** Show the single bounded offline claim, if one is pending: the exact return bonus, the time counted, and
 *  whether the cap applied. Closing the sheet any way claims it once (Game.claimOffline zeroes it in one step). */
export function maybeOfflineClaim(app: App) {
  const s = app.game.state;
  if (s.offline.pendingCash <= 0 || open) return;
  const cash = s.offline.pendingCash;
  const counted = s.offline.pendingS;
  const away = Math.max(counted, s.offline.awayS ?? counted);
  const capped = !!s.offline.capped || away > offlineMaxS(s) + 1;
  const full = offlinePayout(s, offlineMaxS(s)).cash;
  const honoured = cash > offlinePayout(s, counted).cash; // a claim accrued by an older build, kept as it was
  if (cash < 60 && !capped) {
    const got = app.game.claimOffline();
    if (got) app.toast(`Welcome back · +$${fmt(got)} from side jobs while you were away`);
    return;
  }
  const yard = stagePurse(s);
  const goal = goalStatus(s);
  open = true;
  app.sheet((close) => h('div', { class: 'offline-claim' },
    h('h2', {}, `Welcome back · +$${fmt(cash)}`),
    h('p', {}, `Your crew did side jobs while you were away for ${durationText(away)}.`),
    h('ul', { class: 'facts' },
      h('li', {}, `Return bonus: $${fmt(cash)}${honoured ? ' (earned before this update, paid in full)' : ''}`),
      h('li', {}, capped ? `Cap reached: ${durationText(offlineMaxS(s))} counted of ${durationText(away)} — the most a claim pays is $${fmt(full)}` : `${durationText(counted)} counted · a full ${durationText(offlineMaxS(s))} claim pays $${fmt(full)}`),
      h('li', {}, `One budget for the garage: ${OFFLINE_BUDGET_RACES[Math.min(s.upgrades.lockup ?? 0, OFFLINE_BUDGET_RACES.length - 1)]}× the $${fmt(yard.cash)} win purse at ${yard.event.name}, your best open race. More cars don't add to it.`)),
    h('div', { class: 'left-off' },
      h('div', { class: 't' }, 'Where you left off'),
      s.lastResult ? h('div', {}, `Last race: ${['1st', '2nd', '3rd', '4th'][s.lastResult.place - 1]} in ${eventById(s.lastResult.eventId).name}`) : null,
      h('div', {}, goal ? `Next: ${goal.line}` : 'Every car is collected. Earn signature finishes and records.')),
    h('button', { class: 'btn primary wide', onclick: () => close() }, `Claim $${fmt(cash)}`),
  ), () => { open = false; const got = app.game.claimOffline(); if (got) app.toast(`+$${fmt(got)} claimed`); });
}
