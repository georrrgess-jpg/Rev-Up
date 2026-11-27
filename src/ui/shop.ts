// The Shop, grouped by purpose: Parts (order a part, tune-up) · Crates · Garage (upgrades) · Style (looks, fitted
// in the Mechanic Shop) · Scrap (kits, builds, scrap orders, polish, Keep / Recycle). Every item says what it is,
// its exact price and currency, what it does for you, and what still locks it. A "Best buy" card on top picks the
// purchase that helps the next car most; the Mechanic Shop card opens the service bay. Owned by the Mechanic Shop
// workstream.
import './css/mechanic.css';
import { sfx } from '../audio';
import * as B from '../core/board';
import { computeLoadout } from '../core/loadout';
import * as P from '../core/progression';
import type { GameState, Part } from '../core/state';
import { mph } from '../core/units';
import {
  ACTIVE_FAMILIES, CRATE_SCRAP_COST, CRATE_TIER_ODDS, FAMILIES, Family, PART_ORDER_PRICE, TARGETED_CRATE_SCRAP_COST,
  TUNE_STAGES, UPGRADES, UpgradeId, carById, tunePrice, CarId, OFFLINE_BUDGET_RACES, QUALITY_BONUS, SCRAP_VALUE, polishCost,
  scrapOrderCost, TARGETED_CRATE_CASH_COST, MAX_TIER,
} from '../data/tables';
import { MATERIAL, familyIcon, metalFor } from '../render/parts';
import * as S from '../core/style';
import { STYLE_ITEMS } from '../data/tables';
import { openMechanic } from './mechanic';
import { purchaseInfo } from '../core/purchases';
import { restoreInfo } from '../core/projects';
import type { App } from './app';
import { bestBuy, ingredients } from '../core/tutorial';
import { partGain, statDelta } from './benefit';
import { openSpares } from './spares';
import { openBuilds } from './projects'; // Scrap & surplus
import { fabBench } from './fabrication'; // Scrap & surplus
import * as PJ from '../core/projects'; // Scrap & surplus
import { fmt, h } from './dom';

export type ShopTab = 'parts' | 'crates' | 'garage' | 'style' | 'scrap';

/** What each upgrade is for, so different upgrades read differently at a glance. */
/** When a hidden upgrade appears, in words. */
const SHOWS_WHEN = { always: '', quick: 'Opens after your first race win', cars3: 'Opens with your third car', cars4: 'Opens with your fourth car', cars7: 'Opens with your seventh car' } as const;

const UPGRADE_LOOK: Record<UpgradeId, { icon: string; kind: string }> = {
  grid: { icon: '▦', kind: 'Bench space' },
  printer: { icon: '⎙', kind: 'Free crates' },
  crateTier: { icon: '⬆', kind: 'Crate quality' },
  crew: { icon: '⚑', kind: 'Quick Race pay' },
  nitroTank: { icon: '⚡', kind: 'Race nitro' },
  lockup: { icon: '⌂', kind: 'Away earnings' },
};

/** The Shop's recommendation; the same rule decides whether the guide's "spend" beat has anything to show. */
export const shopPick = bestBuy;
/** The parts counter never sells the top tier (it is always a craft). */
const MAX_SOLD = MAX_TIER - 1;

function tuneGain(s: GameState): string {
  const car = s.activeCar;
  const before = computeLoadout(s, car).stats;
  const trial = structuredClone(s);
  (trial.tune ??= {})[car] = (s.tune?.[car] ?? 0) + 1;
  const after = computeLoadout(trial, car).stats;
  const d = mph(after.top) - mph(before.top);
  return `+2% speed, acceleration and grip${d > 0 ? ` (+${d} mph)` : ''}`;
}

export interface ShopOpts {
  /** Open on this tier's order (clamped to what is sold). */
  tier?: number;
  /** 'parts' (cash orders), 'scrap' (scrap orders, polish, Keep / Recycle), 'garage', 'style'; 'cash' = 'parts'. */
  tab?: ShopTab | 'cash';
  /** Called once when the sheet closes, however it closes (Pit Setup returns to the selected event). */
  onDone?: () => void;
}

/** Open the Shop / Workshop. The third argument is a tab (as before) or options. Returns a function that closes it. */
export function openShop(app: App, focusFamily?: Family, opts: ShopTab | ShopOpts = 'parts'): () => void {
  const o: ShopOpts = typeof opts === 'string' ? { tab: opts } : opts ?? {};
  const game = app.game;
  let fam: Family | null = focusFamily ?? null;
  let tier = o.tier ?? 0;
  let sTier = o.tier ?? 0; // the scrap order's tier
  let tab: ShopTab = o.tab === 'cash' || !o.tab ? 'parts' : o.tab;
  return app.sheet((close) => {
    const body = h('div', { class: 'workshop' });
    const build = () => {
      const s = game.state;
      const g = P.goalStatus(s);
      const car = carById(s.activeCar);
      const maxT = B.orderMaxTier(s);
      const goalFam = g && !g.keystoneDone ? g.family : null;
      // open on the best buy's part when it is an order (else the goal family), so the panel agrees with the card
      const first = shopPick(s).pick;
      const firstOrder = first && first.kind === 'order' ? first : null;
      fam ??= goalFam ?? firstOrder?.fam ?? 'engine';
      if (!tier && firstOrder && firstOrder.fam === fam) tier = firstOrder.tier;
      // default tier: the one that feeds the goal craft (two of these make the next), else the highest sold
      if (!tier || tier > maxT) tier = goalFam === fam && g ? Math.max(1, Math.min(maxT, g.tier - 1)) : maxT;
      const need = (cost: number) => (s.cash >= cost ? null : h('small', { class: 'short' }, `$${fmt(cost - s.cash)} more`));
      const buyBtn = (cost: number, label: string, onBuy: () => void, aria: string) => h('button', {
        class: `btn sm buy${s.cash < cost ? ' off' : ' primary'}`, 'aria-label': aria,
        onclick: () => { if (s.cash >= cost) { onBuy(); sfx.cash(); } else app.toast(`Need $${fmt(cost - s.cash)} more`); build(); },
      }, h('span', { class: 'stack' }, label, need(cost)));

      // ---- Best buy: one recommendation tied to the next car (the guide points here on the first visit)
      const { pick, affordable } = shopPick(s);
      const runPick = () => {
        if (!pick) return;
        if (pick.kind === 'order') { fam = pick.fam; tier = pick.tier; tab = 'parts'; doOrder(pick.fam, pick.tier); }
        else if (pick.kind === 'tune') game.buyTune(s.activeCar);
        else game.buyUpgrade(pick.id);
      };
      const best = pick ? h('section', { class: `best-buy${affordable ? '' : ' saving'}`, 'data-coach': 'shop-pick',
        'data-coach-text': affordable ? `Best buy: ${pick.title} for $${fmt(pick.price)}. ${pick.why}` : `Save up: ${pick.title} costs $${fmt(pick.price)}.` },
        h('div', { class: 'bb-label' }, affordable ? 'Best buy now' : 'Save up for'),
        h('div', { class: 'bb-row' },
          h('div', { class: 'grow' }, h('div', { class: 't' }, pick.title), h('div', { class: 'd' }, pick.why)),
          buyBtn(pick.price, `$${fmt(pick.price)}`, runPick, `Buy ${pick.title} for $${pick.price}`))) : null;

      const doOrder = (f: Family, t: number) => {
        const ev = game.orderPart(f, t);
        if (ev.some((e) => e.type === 'place')) app.toast(`T${t} ${FAMILIES[f].name} is on your bench`);
        else if (!ev.some((e) => e.type === 'invalid')) app.toast(`T${t} ${FAMILIES[f].name} is first in the crate queue — make room on the bench`);
      };

      const tabBtn = (id: ShopTab, label: string) => h('button', {
        class: `seg${tab === id ? ' on' : ''}`, role: 'tab', 'aria-selected': String(tab === id),
        onclick: () => { tab = id; build(); body.scrollIntoView?.({ block: 'start' }); },
      }, label);

      // ---- Parts
      const parts = () => {
        const price = PART_ORDER_PRICE[tier];
        const gain = partGain(s, s.activeCar, { f: fam!, t: tier, q: 'std' });
        const goalLine = goalFam === fam && g ? (() => {
          const { have, need: n } = ingredients(s, fam!, g.tier);
          const add = tier < g.tier ? 2 ** (tier - 1) : 0;
          if (have >= n) return `For the ${g.car.model}: you already hold enough ${FAMILIES[fam!].plural} to craft the T${g.tier} — merge them up, no purchase needed.`;
          return add ? `For the ${g.car.model}: ingredients for a T${g.tier} ${FAMILIES[fam!].name} ${have}/${n} → ${Math.min(n, have + add)}/${n}. Merge them yourself — that counts as the craft.` : null;
        })() : null;
        const famBtn = (f: Family) => h('button', {
          class: `btn fam-pick${f === fam ? ' on' : ''}`, 'aria-pressed': String(f === fam),
          onclick: () => { fam = f; tier = 0; build(); },
        }, h('span', { html: familyIcon(f), 'aria-hidden': 'true' }), FAMILIES[f].name, h('small', {}, f === goalFam ? 'Goal' : FAMILIES[f].statLabel));
        const tierBtn = (t: number) => h('button', {
          class: `btn sm tier-pick metal${t === tier ? ' on' : ''}`, 'aria-pressed': String(t === tier), style: `--metal:${metalFor(t)}`,
          'aria-label': `T${t} ${MATERIAL[t]}, $${PART_ORDER_PRICE[t]}`,
          onclick: () => { tier = t; build(); },
        }, h('b', {}, `T${t}`), h('small', { class: 'mat' }, MATERIAL[t]), h('small', { class: 'num' }, `$${fmt(PART_ORDER_PRICE[t])}`));
        const stage = s.tune?.[s.activeCar] ?? 0;
        const tPrice = purchaseInfo(s, `tune:${s.activeCar}`)?.price ?? tunePrice(s.activeCar, stage);
        return [
          h('h3', {}, 'Order a part'),
          h('p', { class: 'd' }, `A part you choose, delivered to your bench. Fit it to a car or merge it. Sold up to T${maxT}; the next car's own part must be crafted.`),
          h('div', { class: 'fams' }, ...ACTIVE_FAMILIES.map(famBtn)),
          h('div', { class: 'tiers' }, ...Array.from({ length: maxT }, (_, k) => tierBtn(k + 1)),
            maxT < MAX_SOLD ? h('div', { class: 'tier-lock', 'aria-label': `T${maxT + 1} and up: merge them on the bench` }, h('b', {}, `T${maxT + 1}+`), h('small', {}, 'merge only')) : null),
          h('div', { class: 'item' },
            h('div', { class: 'item-head' }, h('span', { class: 'item-ico', html: familyIcon(fam!), 'aria-hidden': 'true' }),
              h('div', { class: 'grow' }, h('div', { class: 't' }, `T${tier} ${FAMILIES[fam!].name}`), h('div', { class: 'd' }, `${MATERIAL[tier]} · ${FAMILIES[fam!].statLabel} part · guaranteed family and tier`)),
              h('span', { class: 'price num' }, `$${fmt(price)}`)),
            h('ul', { class: 'facts' },
              h('li', { class: gain.better ? 'up' : '' }, gain.text),
              goalLine ? h('li', { class: 'goal-fact' }, goalLine) : null),
            buyBtn(price, `Order T${tier} ${FAMILIES[fam!].name} · $${fmt(price)}`, () => doOrder(fam!, tier), `Order a T${tier} ${FAMILIES[fam!].name} for $${price}`)),
          h('h3', {}, `Tune-up · ${car.model}`),
          h('div', { class: 'row up-row' },
            h('span', { class: 'up-ico', 'aria-hidden': 'true' }, '⚙'),
            h('div', { class: 'grow' },
              h('div', { class: 't' }, stage < TUNE_STAGES ? `Stage ${stage + 1} of ${TUNE_STAGES}` : 'Fully tuned'),
              h('div', { class: 'd' }, stage < TUNE_STAGES ? `${tuneGain(s)}. This car only; now +${stage * 2}%.` : `+${stage * 2}% speed, acceleration and grip`)),
            stage < TUNE_STAGES ? buyBtn(tPrice, `$${fmt(tPrice)}`, () => { game.buyTune(s.activeCar); app.toast(`${car.model} tuned to stage ${stage + 1}`); }, `Tune-up stage ${stage + 1} for $${tPrice}`) : h('span', { class: 'd done' }, '✓')),
          h('div', { class: 'row scrap-link' }, h('span', { class: 'up-ico', 'aria-hidden': 'true' }, '♻'),
            h('div', { class: 'grow' }, h('div', { class: 't' }, `Scrap · ${fmt(s.scrap)}`), h('div', { class: 'd' }, 'Race-day kits, Build Sheets, a chosen part or a polish — and sort your spares.')),
            h('button', { class: 'btn sm', onclick: () => { tab = 'scrap'; build(); } }, 'Scrap tab')),
        ];
      };

      // ---- Scrap workshop: order a chosen part, polish a part, sort spares, crates (all paid in scrap)
      const scrapTab = () => {
        if (!sTier || sTier > maxT) sTier = tier && tier <= maxT ? tier : maxT;
        const cost = scrapOrderCost(sTier);
        const back = SCRAP_VALUE[sTier];
        const gain = partGain(s, s.activeCar, { f: fam!, t: sTier, q: 'std' });
        const full = !B.firstFree(s);
        const scrapBtn = (price: number, label: string, onBuy: () => void, aria: string) => h('button', {
          class: `btn sm buy${s.scrap < price ? ' off' : ' primary'}`, 'aria-label': aria,
          onclick: () => { if (game.state.scrap >= price) { onBuy(); sfx.cash(); } else app.toast(`Need ${fmt(price - game.state.scrap)} more scrap`); build(); },
        }, h('span', { class: 'stack' }, label, s.scrap < price ? h('small', { class: 'short' }, `${fmt(price - s.scrap)} more`) : null));
        const famBtn = (f: Family) => h('button', {
          class: `btn fam-pick${f === fam ? ' on' : ''}`, 'aria-pressed': String(f === fam),
          onclick: () => { fam = f; build(); },
        }, h('span', { html: familyIcon(f), 'aria-hidden': 'true' }), FAMILIES[f].name, h('small', {}, f === goalFam ? 'Goal' : FAMILIES[f].statLabel));
        const tierBtn = (t: number) => h('button', {
          class: `btn sm tier-pick metal${t === sTier ? ' on' : ''}`, 'aria-pressed': String(t === sTier), style: `--metal:${metalFor(t)}`,
          'aria-label': `T${t} ${MATERIAL[t]}, ${scrapOrderCost(t)} scrap`,
          onclick: () => { sTier = t; build(); },
        }, h('b', {}, `T${t}`), h('small', { class: 'mat' }, MATERIAL[t]), h('small', { class: 'num' }, `${fmt(scrapOrderCost(t))} scrap`));
        const goalLine = goalFam === fam && g ? (() => {
          const { have, need: n } = ingredients(s, fam!, g.tier);
          const add = sTier < g.tier ? 2 ** (sTier - 1) : 0;
          return add && have < n ? `For the ${g.car.model}: ingredients ${have}/${n} → ${Math.min(n, have + add)}/${n}. You still merge the T${g.tier} yourself — that is the craft.` : null;
        })() : null;
        const doScrapOrder = () => {
          const ev = game.scrapOrder(fam!, sTier);
          if (ev.some((e) => e.type === 'place')) app.toast(`T${sTier} ${FAMILIES[fam!].name} is on your bench · −${cost} scrap`);
          else if (!ev.some((e) => e.type === 'invalid')) app.toast(`T${sTier} ${FAMILIES[fam!].name} is first in the crate queue — make room on the bench`);
        };
        // Polish: fitted parts first (active car, then the others), then useful spares
        const spares = P.spareParts(s);
        type Cand = { part: Part; car: CarId | null; label: string };
        const cands: Cand[] = [];
        const cars = [s.activeCar, ...s.owned.filter((c) => c !== s.activeCar).reverse()];
        for (const c of cars) for (const f of ACTIVE_FAMILIES) {
          const p = s.installed?.[c]?.[f];
          if (p && p.q === 'std') cands.push({ part: p, car: c, label: `Fitted to your ${carById(c).model}` });
        }
        for (const u of spares) if (u.part.q === 'std' && u.uses.some((x) => x.kind === 'fit' || x.kind === 'spare')) cands.push({ part: u.part, car: null, label: u.uses[0].text });
        const polishRow = (c: Cand) => {
          const pc = polishCost(c.part.t);
          const car = c.car ?? s.activeCar;
          const trial = structuredClone(s);
          const before = computeLoadout(s, car).stats;
          if (c.car) trial.installed[c.car]![c.part.f]!.q = 'polished';
          else ((trial.installed[car] ??= {})[c.part.f] = { ...c.part, q: 'polished' });
          const after = computeLoadout(trial, car).stats;
          const d = statDelta(c.part.f, before, after);
          return h('div', { class: 'row polish-row' }, h('span', { class: 'up-ico', html: familyIcon(c.part.f), 'aria-hidden': 'true' }),
            h('div', { class: 'grow' }, h('div', { class: 't' }, `T${c.part.t} ${FAMILIES[c.part.f].name} → Polished`),
              h('div', { class: 'd' }, `${c.label}${c.car && d && !d.startsWith('no') ? ` · ${d}` : ''}`)),
            scrapBtn(pc, `${fmt(pc)} scrap`, () => { const ev = game.polishPart(c.part.id); if (ev.some((e) => e.type === 'polish')) app.toast(`T${c.part.t} ${FAMILIES[c.part.f].name} polished · −${pc} scrap`); }, `Polish the T${c.part.t} ${FAMILIES[c.part.f].name} for ${pc} scrap`));
        };
        const toRecycle = spares.filter((u) => u.verdict === 'recycle');
        return [
          h('p', { class: 'd' }, `Scrap comes from recycling spare parts (you have ${fmt(s.scrap)}). It never turns into cash.`),
          // ---- Scrap & surplus: Build Sheets (spare parts → permanent car builds) and the Fab bench (scrap → race kits)
          h('div', { class: 'uses-strip' },
            h('button', { class: 'btn', onclick: () => openBuilds(app, s.activeCar, build) }, h('span', { class: 'stack' }, `Build Sheet · ${PJ.buildLevel(s, s.activeCar)}/${PJ.BUILD_LEVEL_MAX}`, h('small', {}, PJ.buildsOpen(s) ? 'Donate spares for good' : 'Opens with the Ironhorse 455'))),
            h('button', { class: 'btn', onclick: () => openSpares(app, build) }, h('span', { class: 'stack' }, 'Keep / Recycle', h('small', {}, spares.length ? `${spares.length} spare${spares.length > 1 ? 's' : ''}${toRecycle.length ? ` · ${toRecycle.length} unused` : ''}` : 'No spares')))),
          fabBench(app, build),
          (() => {
            const r = restoreInfo(s, s.activeCar);
            return h('div', { class: 'row concours-row' }, h('span', { class: 'up-ico', 'aria-hidden': 'true' }, '✦'),
              h('div', { class: 'grow' }, h('div', { class: 't' }, `Concours restoration · ${car.model}`, h('span', { class: 'lvl' }, ` ${r.stage}/${r.of}`)),
                h('div', { class: 'd' }, r.locked ? `🔒 ${r.locked}` : r.maxed ? r.benefit : `${r.name}: ${fmt(r.cost)} scrap · ${r.benefit}`)),
              r.locked ? null : h('button', { class: 'btn sm', onclick: () => { close(); openMechanic(app, { area: 'body', returnTo: () => openShop(app, undefined, 'scrap') }); } }, r.maxed ? 'View' : 'Preview'));
          })(),
          // ---- end Scrap & surplus
          h('h3', {}, 'Order for scrap'),
          h('p', { class: 'd' }, `Pick the family and tier; the price is exact. Sold up to T${maxT}, like the cash counter — the next car's own part must still be merged.`),
          h('div', { class: 'fams' }, ...ACTIVE_FAMILIES.map(famBtn)),
          h('div', { class: 'tiers' }, ...Array.from({ length: maxT }, (_, k) => tierBtn(k + 1))),
          h('div', { class: 'item' },
            h('div', { class: 'item-head' }, h('span', { class: 'item-ico', html: familyIcon(fam!), 'aria-hidden': 'true' }),
              h('div', { class: 'grow' }, h('div', { class: 't' }, `T${sTier} ${FAMILIES[fam!].name}`), h('div', { class: 'd' }, 'Guaranteed family and tier · standard quality')),
              h('span', { class: 'price num' }, `${fmt(cost)} scrap`)),
            h('ul', { class: 'facts' },
              h('li', { class: gain.better ? 'up' : '' }, gain.text),
              goalLine ? h('li', { class: 'goal-fact' }, goalLine) : null,
              h('li', {}, `Recycling it later returns ${back} scrap — orders always cost more than they recycle for.`),
              full ? h('li', { class: 'warn' }, 'Bench and rack are full: it waits first in the crate queue until you make room.') : null),
            scrapBtn(cost, `Order T${sTier} ${FAMILIES[fam!].name} · ${fmt(cost)} scrap`, doScrapOrder, `Order a T${sTier} ${FAMILIES[fam!].name} for ${cost} scrap`)),
          h('h3', {}, 'Polish a part'),
          h('p', { class: 'd' }, `A standard part becomes Polished: +${Math.round((QUALITY_BONUS - 1) * 100)}% of its stat, like a lucky merge. Works on fitted parts, so older cars keep up. Merging a polished part rolls a new quality.`),
          ...(cands.length ? cands.slice(0, 6).map(polishRow) : [h('p', { class: 'd' }, 'Every fitted part is already Polished or Mint.')]),
        ];
      };

      // ---- Crates: random parts for scrap (or a family crate for cash), odds shown up front
      const crates = () => {
        const odds = CRATE_TIER_ODDS[Math.min(s.upgrades.crateTier, CRATE_TIER_ODDS.length - 1)].map((w, i) => (w > 0 ? `${Math.round(w * 100)}% T${i + 1}` : '')).filter(Boolean).join(', ');
        const full = !B.firstFree(s);
        const crateBtn = (cost: number, cur: 'scrap' | 'cash', run: () => void, aria: string) => {
          const have = cur === 'cash' ? s.cash : s.scrap;
          const label = cur === 'cash' ? `$${fmt(cost)}` : `${fmt(cost)} scrap`;
          return h('button', {
            class: `btn sm buy${have < cost ? ' off' : ' primary'}`, 'aria-label': aria,
            onclick: () => { if (have < cost) app.toast(cur === 'cash' ? `Need $${fmt(cost - have)} more` : `Need ${fmt(cost - have)} more scrap`); else { run(); sfx.cash(); } build(); },
          }, h('span', { class: 'stack' }, label, have < cost ? h('small', { class: 'short' }, cur === 'cash' ? `$${fmt(cost - have)} more` : `${fmt(cost - have)} more`) : null));
        };
        return [
          h('p', { class: 'd' }, `A crate is a surprise part: cheaper than a chosen order, but the tier is luck. Crates now hold ${odds}.${full ? ' Your bench is full: crates wait in the queue until you make room.' : ''}`),
          h('div', { class: 'fams' }, ...ACTIVE_FAMILIES.map((f) => h('button', {
            class: `btn fam-pick${f === fam ? ' on' : ''}`, 'aria-pressed': String(f === fam), onclick: () => { fam = f; build(); },
          }, h('span', { html: familyIcon(f), 'aria-hidden': 'true' }), FAMILIES[f].name, h('small', {}, f === goalFam ? 'Goal' : FAMILIES[f].statLabel)))),
          h('div', { class: 'row' }, h('span', { class: 'up-ico', 'aria-hidden': 'true' }, '?'),
            h('div', { class: 'grow' }, h('div', { class: 't' }, 'Mystery crate'), h('div', { class: 'd' }, 'One random part, any family · paid in scrap')),
            crateBtn(purchaseInfo(s, 'crate:std')?.price ?? CRATE_SCRAP_COST, 'scrap', () => game.buyCrate('std'), `Mystery crate for ${purchaseInfo(s, 'crate:std')?.price ?? CRATE_SCRAP_COST} scrap`)),
          h('div', { class: 'row' }, h('span', { class: 'up-ico', html: familyIcon(fam!), 'aria-hidden': 'true' }),
            h('div', { class: 'grow' }, h('div', { class: 't' }, `${FAMILIES[fam!].name} crate`), h('div', { class: 'd' }, `A random-tier ${FAMILIES[fam!].name.toLowerCase()} part · paid in scrap`)),
            crateBtn(purchaseInfo(s, `crate:targeted:${fam}`)?.price ?? TARGETED_CRATE_SCRAP_COST, 'scrap', () => game.buyCrate('targeted', fam!), `${FAMILIES[fam!].name} crate for ${TARGETED_CRATE_SCRAP_COST} scrap`)),
          h('div', { class: 'row' }, h('span', { class: 'up-ico', html: familyIcon(fam!), 'aria-hidden': 'true' }),
            h('div', { class: 'grow' }, h('div', { class: 't' }, `${FAMILIES[fam!].name} crate · cash`), h('div', { class: 'd' }, `The same random-tier ${FAMILIES[fam!].name.toLowerCase()} part, paid in cash`)),
            crateBtn(purchaseInfo(s, `crate:cash:${fam}`)?.price ?? TARGETED_CRATE_CASH_COST, 'cash', () => game.buyCrate('cash', fam!), `${FAMILIES[fam!].name} crate for $${TARGETED_CRATE_CASH_COST}`)),
        ];
      };

      // ---- Garage upgrades: each its own icon, purpose, exact effect now → next
      const garage = () => {
        const full = P.offlinePayout(s, P.offlineMaxS(s));
        const yard = P.stagePurse(s);
        const hrs = P.offlineMaxS(s) / 3600;
        return [
          h('p', { class: 'd' }, 'Permanent upgrades for your garage. Each does one thing, shown exactly.'),
          ...UPGRADES.filter((u) => P.upgradeShown(s, u)).map((u) => {
            const lvl = s.upgrades[u.id] ?? 0;
            const next = u.levels[lvl];
            const fx = P.upgradeEffect(s, u.id);
            const look = UPGRADE_LOOK[u.id];
            return h('div', { class: `row up-row up-${u.id}` },
              h('span', { class: 'up-ico', 'aria-hidden': 'true' }, look.icon),
              h('div', { class: 'grow' },
                h('div', { class: 't' }, u.name, u.levels.length > 1 ? h('span', { class: 'lvl' }, ` ${lvl}/${u.levels.length}`) : null),
                h('div', { class: 'kind' }, `${look.kind} · ${u.about}`),
                h('div', { class: 'd' }, next ? h('span', {}, 'Now: ', fx.now, h('span', { class: 'arrow', 'aria-hidden': 'true' }, ' → '), h('b', {}, fx.next)) : h('span', {}, `${fx.now} · fully upgraded`))),
              next ? (() => { const price = purchaseInfo(s, `upgrade:${u.id}`)?.price ?? next.cost; return buyBtn(price, `$${fmt(price)}`, () => game.buyUpgrade(u.id), `${u.name}: ${next.label}, $${price}`); })() : h('span', { class: 'd done' }, '✓'));
          }),
          ...UPGRADES.filter((u) => !P.upgradeShown(s, u)).map((u) => h('div', { class: `row up-row locked up-${u.id}` },
            h('span', { class: 'up-ico', 'aria-hidden': 'true' }, UPGRADE_LOOK[u.id].icon),
            h('div', { class: 'grow' }, h('div', { class: 't' }, u.name), h('div', { class: 'kind' }, `${UPGRADE_LOOK[u.id].kind} · ${u.about}`),
              h('div', { class: 'd' }, `First level $${fmt(u.levels[0].cost)}: ${u.levels[0].label}`)),
            h('span', { class: 'lock-tag' }, `🔒 ${SHOWS_WHEN[u.shows ?? 'always']}`))),
          h('h3', {}, 'While you are away'),
          h('p', { class: 'd away-note' }, `While the game is closed your crew does side jobs: up to $${fmt(full.cash)} for ${hrs} h away (${OFFLINE_BUDGET_RACES[Math.min(s.upgrades.lockup ?? 0, OFFLINE_BUDGET_RACES.length - 1)]}× the $${fmt(yard.cash)} win purse of ${yard.event.name}, your best open race), building evenly — $${fmt(P.offlinePayout(s, 3600).cash)} for an hour. Time past ${hrs} h isn't counted, and owning more cars doesn't add to it. Races pay more.`),
        ];
      };

      const style = () => {
        const kinds: [string, string, string, 'body' | 'wheels'][] = [
          ['paint', 'Colours', 'Bought once, fits every car', 'body'], ['livery', 'Liveries', 'Bought once, fits every car', 'body'],
          ['material', 'Premium paint', `Per car · for the ${car.model}`, 'body'], ['wheel', 'Wheel sets', 'Bought once, fits every car', 'wheels'],
        ];
        const items = S.shopItems(s, s.activeCar);
        return [
          h('p', { class: 'd' }, 'Colours, premium paint, liveries and wheel sets change how your cars look — never how fast they are. Preview them on your car in the Mechanic Shop before you buy; they show in the Showroom and on track.'),
          ...kinds.map(([kind, title, scope, area]) => {
            const list = items.filter((i) => i.kind === kind);
            const owned = list.filter((i) => S.owned(s, i, s.activeCar)).length;
            const next = STYLE_ITEMS.filter((i) => i.kind === kind && s.owned.length < i.opens).sort((a, b) => a.opens - b.opens)[0];
            const prices = list.filter((i) => !S.owned(s, i, s.activeCar)).map((i) => i.price);
            return h('div', { class: 'row style-row' }, h('span', { class: 'up-ico', 'aria-hidden': 'true' }, area === 'wheels' ? '◎' : '◆'),
              h('div', { class: 'grow' }, h('div', { class: 't' }, title, h('span', { class: 'lvl' }, ` ${owned}/${list.length} owned`)),
                h('div', { class: 'd' }, `${scope}${prices.length ? ` · $${fmt(Math.min(...prices))}${prices.length > 1 ? `–$${fmt(Math.max(...prices))}` : ''} cash` : ' · all owned'}${next ? ` · more with your ${['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'][next.opens] ?? `${next.opens}th`} car` : ''}`)),
              h('button', { class: 'btn sm', onclick: () => { close(); openMechanic(app, { area, returnTo: () => openShop(app, undefined, 'style') }); } }, 'Preview'));
          }),
          h('button', { class: 'btn wide primary', onclick: () => { close(); openMechanic(app, { area: 'body', returnTo: () => openShop(app, undefined, 'style') }); } }, 'Open Body and Paint'),
        ];
      };

      const goalNote = g ? h('p', { class: 'goal-note' }, h('b', {}, `Next car · ${g.car.model}: `),
        [!g.keystoneDone ? `craft T${g.tier} ${FAMILIES[g.family].name}` : '', g.event && !g.eventDone ? 'a race win' : '', s.rep < g.repNeed ? `${fmt(g.repNeed - s.rep)} more Rep` : ''].filter(Boolean).join(' · ') || 'ready') : null;

      body.replaceChildren(
        h('button', { class: 'btn sm close', onclick: close }, 'Close'),
        h('h2', {}, 'Shop'),
        h('p', { class: 'wallet' }, h('span', { class: 'chip cash' }, `$${fmt(s.cash)}`), h('span', { class: 'chip scrap' }, `${fmt(s.scrap)} scrap`)),
        ...(goalNote ? [goalNote] : []),
        ...(best ? [best] : []),
        h('button', { class: 'btn wide mech-entry', 'aria-label': `Mechanic Shop: fit parts, wheels and paint on your ${car.model}`, onclick: () => { close(); openMechanic(app, { returnTo: () => openShop(app, undefined, tab) }); } },
          h('span', { class: 'ico', 'aria-hidden': 'true' }, '🔧'),
          h('span', { class: 'stack' }, 'Mechanic Shop', h('small', {}, `Fit, upgrade and paint your ${car.model} — preview before you pay`))),
        h('div', { class: 'segs five', role: 'tablist', 'aria-label': 'Shop sections' }, tabBtn('parts', 'Parts'), tabBtn('crates', 'Crates'), tabBtn('garage', 'Garage'), tabBtn('style', 'Style'), tabBtn('scrap', 'Scrap')),
        ...(tab === 'parts' ? parts() : tab === 'crates' ? crates() : tab === 'scrap' ? scrapTab() : tab === 'garage' ? garage() : style()).filter((x): x is NonNullable<typeof x> => !!x),
      );
    };
    build();
    return body;
  }, () => o.onDone?.());
}
