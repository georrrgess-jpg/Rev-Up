import { goalStatus, offlineRate } from '../core/progression';
import { carById, eventById } from '../data/tables';
import type { App } from './app';
import { durationText, h } from './dom';

/** Show the single bounded offline claim, if one is pending. */
export function maybeOfflineClaim(app: App) {
  const s = app.game.state;
  if (s.offline.pendingCash <= 0) return;
  if (s.offline.pendingCash < 60) {
    const got = app.game.claimOffline();
    app.toast(`Welcome back · +$${got} from side jobs while you were away`);
    return;
  }
  const rate = offlineRate(s);
  const cars = s.owned.map((id) => carById(id).model).join(', ');
  const goal = goalStatus(s);
  // Closing the sheet any way (backdrop, Escape, button) claims the cash — it is never lost.
  app.sheet((close) => h('div', {},
    h('h2', {}, `Welcome back · $${s.offline.pendingCash}`),
    h('p', {}, `While you were away for ${durationText(s.offline.pendingS)}, your crew rented out the ${cars} for side jobs at $${rate} a minute. Claims cover up to 8 hours. Your board was left as it was.`),
    h('div', { class: 'left-off' },
      h('div', { class: 't' }, 'Where you left off'),
      s.lastResult ? h('div', {}, `Last race: ${['1st', '2nd', '3rd', '4th'][s.lastResult.place - 1]} in ${eventById(s.lastResult.eventId).name}`) : null,
      h('div', {}, goal ? `Next: ${goal.line}` : 'Every car is collected. Earn signature finishes and records.')),
    h('button', { class: 'btn primary wide', onclick: () => close() }, `Claim $${s.offline.pendingCash}`),
  ), () => { const got = app.game.claimOffline(); if (got) app.toast(`+$${got} claimed`); });
}
