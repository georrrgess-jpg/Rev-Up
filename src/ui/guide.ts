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
      sec('Merge',
        'Drag a part onto a matching one (same family, same tier) to make the next tier. Or tap one part, then the other.',
        'Merges in quick succession can chain into neighbours (a cascade) and build a combo.'),
      sec('Your bench',
        legend(h('span', { class: 'lg-equip', 'aria-hidden': 'true' }), 'Green bar: equipped on your current car.'),
        legend(h('span', { class: 'lg-match', 'aria-hidden': 'true' }), 'Teal ring: this part has a match on the bench.'),
        legend(h('span', { class: 'lg-dot', 'aria-hidden': 'true' }), 'Coloured dot: family — orange Engine (top speed), blue Tires (grip), green Turbo (acceleration).'),
        legend(h('span', { class: 'lg-cap', 'aria-hidden': 'true' }, 'CAP'), 'Above this car’s cap: it still fits, but runs at the cap tier.'),
        legend(h('span', { class: 'lg-q', 'aria-hidden': 'true' }, 'POL'), 'Polished parts are 15% stronger. Mint parts skip a tier when made.'),
        'Overflow holds parts when the bench is full. The Scrap press turns spare parts into scrap for crates.'),
      sec('Race and nitro',
        `Every live race includes ${CREW_NITRO} free crew nitro. Three quick merges in a row bank another charge (up to ${NITRO_CAP}).`,
        'Tap NITRO inside the amber zone for a Perfect boost — 1.5× stronger. A tap anywhere else still helps a little.',
        'Quick Race lets your crew repeat an event you have won while you keep merging. It pays the base reward.'),
      sec('Rewards',
        'Cash buys upgrades and crates. Rep unlocks new cars. Crates drop parts onto your bench. Scrap buys crates of the family you choose.'),
      sec('Words',
        'Next car: needs Rep plus one part you craft yourself (crate drops don’t count).',
        'Fresh route: extra Rep for an event you haven’t raced in your last two races.',
        'Signature finish: a paint each car earns with a live top-3 finish.',
        'Class meet: a race for one earlier car only. Time attack: beat target times for medals.'),
      h('div', { class: 'fams' },
        h('button', { class: 'btn', onclick: () => { app.game.resetTips(); close(); app.toast('Tips are back on'); } }, 'Show tips again'),
        h('button', { class: 'btn primary', onclick: close }, 'Back to the game')),
    );
  });
}
