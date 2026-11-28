import * as P from '../core/progression';
import { CREW_NITRO, NITRO_CAP } from '../data/tables';
import type { App } from './app';
import { h } from './dom';

/** Short, replayable "How to play" guide: the bench legend, nitro, rewards, and the game's words. */
export function openGuide(app: App) {
  app.sheet((close) => {
    const sec = (title: string, ...lines: (string | HTMLElement)[]) => h('section', { class: 'guide-sec' }, h('h3', {}, title), ...lines.map((l) => (typeof l === 'string' ? h('p', {}, l) : l)));
    const legend = (mark: HTMLElement, text: string) => h('div', { class: 'legend-row' }, mark, h('span', {}, text));
    return h('div', { class: 'guide' },
      h('button', { class: 'btn sm close', onclick: close }, 'Close'),
      h('h2', {}, 'How to play'),
      // 1.10 the first session in five lines, and a coached race to practise shifting and nitro again
      h('section', { class: 'guide-sec refresher' }, h('h3', {}, 'Quick refresher'),
        h('ol', {},
          h('li', {}, 'Merge two matching parts (same family and tier) into the next tier.'),
          h('li', {}, 'Fit parts to your car: Engine = top speed, Tires = grip, Turbo = acceleration.'),
          h('li', {}, 'Race: tap SHIFT on green, then NITRO in the amber boost zone.'),
          h('li', {}, 'Rep opens cars and is never spent. Cash buys parts. Scrap orders exact parts.'),
          h('li', {}, 'The goal card names the next car, what it still needs, and has the button to it.')),
        h('button', { class: 'btn wide', onclick: () => {
          app.game.transact((d) => { d.tips['fr:practice'] = true; return []; });
          close();
          (app.views.race as unknown as { startLive(id: string): void }).startLive(P.recommendedEvent(app.game.state).id);
        } }, 'Practise a coached race')),
      sec('Merge',
        'Drag a part onto a matching one (same family, same tier) to make the next tier. Or tap one part, then the other.',
        'Merges in quick succession can chain into neighbours (a cascade) and build a combo.'),
      sec('Your bench',
        legend(h('span', { class: 'lg-match', 'aria-hidden': 'true' }), 'Teal ring: this part has a match on the bench.'),
        legend(h('span', { class: 'lg-dot', 'aria-hidden': 'true' }), 'Coloured dot: family — orange Engine (top speed), blue Tires (grip), green Turbo (acceleration).'),
        legend(h('span', { class: 'lg-cap', 'aria-hidden': 'true' }, 'CAP'), 'Above this car’s part limit: it still fits, but runs at the limit tier.'),
        legend(h('span', { class: 'lg-q', 'aria-hidden': 'true' }, 'POL'), 'Polished parts are 15% stronger. Mint parts skip a tier when made.'),
        'The spare rack holds parts when the bench is full. The scrap press turns parts you don’t need into scrap for crates.'),
      sec('Fit parts',
        'Parts don’t fit themselves. Each car has one slot per part family: Engine, Tires, Turbo. Open Fit parts (tap the strip of slots above the bench) to fit, swap or remove a part, or tap Fit recommended.',
        'A fitted part leaves the bench and powers only that car; it can’t be merged or scrapped until you take it off. Taking a part off needs a free bench cell.'),
      sec('Race, shifting and nitro',
        'Shift has its own button: shift on the cue to keep full acceleration. Too early or late costs a little speed; miss it and the car shifts itself on the limiter.',
        `Every live race includes ${CREW_NITRO} free crew nitro. Three quick merges in a row bank another charge (up to ${NITRO_CAP}).`,
        'Tap NITRO inside a boost zone (amber on the road) for a Perfect boost — 1.5× stronger. A tap anywhere else still helps a little.',
        'Quick Race lets your crew repeat an event you have won while you keep merging. It pays the base reward.'),
      sec('Cash, Rep and scrap',
        'Cash is spending money: parts from the Shop (a known family and tier), tune-ups, garage upgrades, and looks in the Paint shop. Rep is earned progress: every race adds it, nothing spends it, and thresholds open races and cars (tap Rep in the top bar to see the next one). Scrap, from parts you recycle, orders the exact part you pick in the Workshop, or polishes one.',
        'Every live place pays. Before a race you see each place’s purse, the Perfect bonus and any first-win money; after it, where every dollar came from. Quick Races pay your crew 70% of the purse (85% with the Pit crew).',
        'Paint shop (Showroom → a car): colours and wheel sets fit every car once bought; premium paint is per car; the Tapeback can be restored in three stages. Looks only — never performance.'),
      sec('Words',
        'Next car: needs Rep plus one part you craft yourself (crate drops don’t count); some also need a race win. Tap the Next car card for exactly what is left.',
        'New track bonus: +75% Rep for an event you haven’t raced in your last two races.',
        'Signature finish: a paint each car earns with a live top-3 finish.',
        'Class meet: a race for one earlier car only. Time attack: beat target times for medals.',
        'Downtown Nights: each event has three goals — win, beat the par time, land a Perfect boost — and each goal pays once and earns a star. Stars open the Kestrel 1600 and The Main Event.',
        'Speed trap: scored on your speed through the gate. Stock Cup: every part runs as T4, so the lighter car wins. The Main Event: three heats in a row — top places go through, and you can change cars between heats.'),
      h('div', { class: 'fams' },
        h('button', { class: 'btn', onclick: () => { app.game.resetTips(); close(); app.toast('Tips are back on'); } }, 'Show tips again'),
        h('button', { class: 'btn primary', onclick: close }, 'Back to the game')),
    );
  });
}
