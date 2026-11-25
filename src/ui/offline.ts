import { offlineRate } from '../core/progression';
import { carById } from '../data/tables';
import type { App } from './app';
import { durationText, h } from './dom';

/** Show the single bounded offline claim, if one is pending. */
export function maybeOfflineClaim(app: App) {
  const s = app.game.state;
  if (s.offline.pendingCash <= 0) return;
  const rate = offlineRate(s);
  const cars = s.owned.map((id) => carById(id).name).join(', ');
  app.sheet((close) => h('div', {},
    h('h2', {}, `Welcome back · $${s.offline.pendingCash}`),
    h('p', {}, `While you were away for ${durationText(s.offline.pendingS)}, your crew rented out the ${cars} for side jobs at $${rate} a minute. Claims cover up to 8 hours. Your board was left as it was.`),
    h('button', { class: 'btn primary wide', onclick: () => { const got = app.game.claimOffline(); close(); app.toast(`+$${got} claimed`); } }, `Claim $${s.offline.pendingCash}`),
  ));
}
