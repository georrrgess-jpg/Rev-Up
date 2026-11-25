// The Shop: order parts, scrap crates, tune-ups and garage upgrades. Owned by the mobile UX workstream.
import { sfx } from '../audio';
import * as B from '../core/board';
import * as P from '../core/progression';
import { ACTIVE_FAMILIES, CRATE_SCRAP_COST, FAMILIES, Family, PART_ORDER_PRICE, TARGETED_CRATE_SCRAP_COST, TUNE_STAGES, UPGRADES, tunePrice, carById } from '../data/tables';
import { familyIcon } from '../render/parts';
import type { App } from './app';
import { fmt, h } from './dom';


export function openShop(app: App, focusFamily?: Family) {
  const game = app.game;
  let fam: Family | null = focusFamily ?? null;
  let tier = 0;
  app.sheet((close) => {
    const body = h('div', { class: 'workshop' });
    const build = () => {
      const s = game.state;
      const g = P.goalStatus(s);
      const maxT = B.orderMaxTier(s);
      const goalFam = g && !g.keystoneDone ? g.family : null;
      fam ??= goalFam ?? 'engine';
      // default tier: the one that feeds the goal craft (two of these make the next), else the highest sold
      if (!tier || tier > maxT) tier = goalFam === fam && g ? Math.max(1, Math.min(maxT, g.tier - 1)) : maxT;
      const price = PART_ORDER_PRICE[tier];
      const short = price - s.cash;
      const famBtn = (f: Family) => h('button', {
        class: `btn fam-pick${f === fam ? ' on' : ''}`, 'aria-pressed': String(f === fam),
        onclick: () => { fam = f; tier = 0; build(); },
      }, h('span', { html: familyIcon(f), 'aria-hidden': 'true' }), FAMILIES[f].name, f === goalFam ? h('small', {}, 'goal') : null);
      const tierBtn = (t: number) => h('button', {
        class: `btn sm tier-pick${t === tier ? ' on' : ''}`, 'aria-pressed': String(t === tier),
        onclick: () => { tier = t; build(); },
      }, h('b', {}, `T${t}`), h('small', { class: 'num' }, `$${fmt(PART_ORDER_PRICE[t])}`));
      const upgrades = UPGRADES.filter((u) => P.upgradeShown(s, u)).map((u) => {
        const lvl = s.upgrades[u.id] ?? 0;
        const next = u.levels[lvl];
        const fx = P.upgradeEffect(s, u.id);
        return h('div', { class: 'row up-row' },
          h('div', { class: 'grow' },
            h('div', { class: 't' }, u.name, u.levels.length > 1 ? h('span', { class: 'lvl' }, ` ${lvl}/${u.levels.length}`) : null),
            h('div', { class: 'd' }, next ? h('span', {}, fx.now, h('span', { class: 'arrow', 'aria-hidden': 'true' }, ' → '), h('b', {}, fx.next)) : h('span', {}, `${fx.now} · fully upgraded`))),
          next ? h('button', {
            class: `btn sm${s.cash < next.cost ? ' off' : ' primary'}`,
            'aria-label': `${u.name}: ${next.label}, $${next.cost}`,
            onclick: () => { if (s.cash >= next.cost) { game.buyUpgrade(u.id); sfx.cash(); } else app.toast(`Need $${fmt(next.cost - s.cash)} more for ${u.name}`); build(); },
          }, s.cash < next.cost ? h('span', { class: 'stack' }, `$${fmt(next.cost)}`, h('small', {}, `$${fmt(next.cost - s.cash)} more`)) : `$${fmt(next.cost)}`) : h('span', { class: 'd done' }, '✓'));
      });
      const away = P.offlineRate(s);
      body.replaceChildren(
        h('button', { class: 'btn sm close', onclick: close }, 'Close'),
        h('h2', {}, 'Shop'),
        h('p', { class: 'wallet' }, h('span', { class: 'chip cash' }, `$${fmt(s.cash)}`), h('span', { class: 'chip scrap' }, `${fmt(s.scrap)} scrap`), h('span', { class: 'd' }, 'Cash buys parts and upgrades; scrap buys crates.')),
        h('h3', {}, 'Order a part'),
        h('p', { class: 'd' }, goalFam && g
          ? `Your ${g.car.model} needs a crafted T${g.tier} ${FAMILIES[goalFam].name}: two T${g.tier - 1}s make one. Ordered parts arrive on your bench; the craft is yours.`
          : `A known part, straight to your bench. Up to T${maxT} (your best car's top tier is crafted).`),
        h('div', { class: 'fams' }, ...ACTIVE_FAMILIES.map(famBtn)),
        h('div', { class: 'tiers' }, ...Array.from({ length: maxT }, (_, k) => tierBtn(k + 1))),
        h('button', {
          class: `btn order-btn${short > 0 ? ' off' : ' primary'}`,
          onclick: () => {
            if (short > 0) { app.toast(`Need $${fmt(short)} more for a T${tier} ${FAMILIES[fam!].name}`); return; }
            const ev = game.orderPart(fam!, tier);
            if (ev.some((e) => e.type === 'place')) app.toast(`T${tier} ${FAMILIES[fam!].name} is on your bench`);
            else if (!ev.some((e) => e.type === 'invalid')) app.toast(`T${tier} ${FAMILIES[fam!].name} is first in the crate queue — make room on the bench`);
            build();
          },
        }, short > 0 ? h('span', { class: 'stack' }, `Order T${tier} ${FAMILIES[fam].name} · $${fmt(price)}`, h('small', {}, `$${fmt(short)} more`)) : `Order T${tier} ${FAMILIES[fam].name} · $${fmt(price)}`),
        h('h3', {}, `Tune-up · ${carById(s.activeCar).model}`),
        (() => {
          const stage = s.tune?.[s.activeCar] ?? 0;
          const price = tunePrice(s.activeCar, stage);
          return h('div', { class: 'row up-row' },
            h('div', { class: 'grow' },
              h('div', { class: 't' }, `Stage ${Math.min(stage + 1, TUNE_STAGES)} of ${TUNE_STAGES}`),
              h('div', { class: 'd' }, stage < TUNE_STAGES ? h('span', {}, `+${stage * 2}% speed, acceleration and grip`, h('span', { class: 'arrow', 'aria-hidden': 'true' }, ' → '), h('b', {}, `+${(stage + 1) * 2}%`)) : `+${stage * 2}% · fully tuned`)),
            stage < TUNE_STAGES ? h('button', {
              class: `btn sm${s.cash < price ? ' off' : ' primary'}`,
              onclick: () => { if (s.cash >= price) { game.buyTune(s.activeCar); sfx.cash(); app.toast(`${carById(s.activeCar).model} tuned to stage ${stage + 1}`); } else app.toast(`Need $${fmt(price - s.cash)} more for the tune-up`); build(); },
            }, s.cash < price ? h('span', { class: 'stack' }, `$${fmt(price)}`, h('small', {}, `$${fmt(price - s.cash)} more`)) : `$${fmt(price)}`) : h('span', { class: 'd done' }, '✓'));
        })(),
        h('p', { class: 'd' }, 'For each car. Skill saves you the money: Perfect boosts gain more than a full tune.'),
        h('h3', {}, 'Scrap crates'),
        h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 't' }, 'Mystery crate'), h('div', { class: 'd' }, 'One part, any family, tier by your crate level')),
          h('button', { class: `btn sm${s.scrap < CRATE_SCRAP_COST ? ' off' : ''}`, onclick: () => { game.buyCrate('std'); build(); } }, `${CRATE_SCRAP_COST} scrap`)),
        h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 't' }, `${FAMILIES[fam].name} crate`), h('div', { class: 'd' }, `${fam === 'engine' ? 'An' : 'A'} ${FAMILIES[fam].name.toLowerCase()} part, tier by your crate level`)),
          h('button', { class: `btn sm${s.scrap < TARGETED_CRATE_SCRAP_COST ? ' off' : ''}`, onclick: () => { game.buyCrate('targeted', fam!); build(); } }, `${TARGETED_CRATE_SCRAP_COST} scrap`)),
        h('h3', {}, 'Upgrades'),
        ...upgrades,
        h('h3', {}, 'While you are away'),
        h('p', { class: 'd' }, `Your ${s.owned.length} car${s.owned.length > 1 ? 's' : ''} earn $${away} a minute while the game is closed, for up to ${P.offlineMaxS(s) / 3600} h ($${fmt(away * P.offlineMaxS(s) / 60)}). Each new car adds to the rate.`),
      );
    };
    build();
    return body;
  });
}
