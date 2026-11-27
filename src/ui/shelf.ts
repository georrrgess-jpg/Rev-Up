// 1.9 Parts Shelf: storage off the merge board, with each part's earliest car, and three immediate uses for surplus
// (trade toward a part, pay part of a Garage upgrade, recycle toward a scrap order). Every use shows its exact payoff
// and cost before the button; the rules (and the protection of fitted and starred parts) live in core/shelf.ts.
// Owned by the Progression workstream.
import './css/shelf.css';
import { sfx } from '../audio';
import * as B from '../core/board';
import * as P from '../core/progression';
import * as SH from '../core/shelf';
import type { Part } from '../core/state';
import { BATCH_MERGE_RANK, FAMILIES, Family, SHELF_SORT_RANK, UPGRADES, UpgradeId, scrapOrderCost } from '../data/tables';
import { partTileHtml } from '../render/parts';
import type { App } from './app';
import { fmt, h } from './dom';

export interface ShelfOpts {
  /** Open on a surplus use: 'trade' (default when there is surplus), 'contribute' (with `upgrade`), 'recycle'. */
  mode?: 'trade' | 'contribute' | 'recycle';
  upgrade?: UpgradeId;
  /** Runs after each change (e.g. to refresh the Shop underneath) and when the sheet closes. */
  onChange?: () => void;
}

const nameOf = (p: Pick<Part, 'f' | 't'>) => `T${p.t} ${FAMILIES[p.f].name}`;

/** Open the Parts Shelf sheet. Returns a function that closes it. */
export function openShelf(app: App, opts: ShelfOpts = {}): () => void {
  const game = app.game;
  let mode: NonNullable<ShelfOpts['mode']> = opts.mode ?? 'trade';
  let upgrade: UpgradeId | null = opts.upgrade ?? null;
  let target = 0; // index into tradeTargets
  const picked = new Set<number>();
  return app.sheet((close) => {
    const body = h('div', { class: 'shelf-sheet' });
    const build = () => {
      const s = game.state;
      const view = SH.shelfView(s);
      const spares = P.spareParts(s);
      const unusedBench = spares.filter((u) => u.verdict === 'recycle' && !u.starred).map((u) => u.part);
      const over = SH.overCapParts(s).filter((p) => !(s.favorites ?? []).includes(p.id) || true);
      const live = new Set([...view.items.map((i) => i.part.id), ...unusedBench.map((p) => p.id)]);
      for (const id of [...picked]) if (!live.has(id)) picked.delete(id);
      const after = () => { build(); opts.onChange?.(); };
      const ids = [...picked];

      const pickBox = (p: Part) => h('button', {
        class: `btn sm pick${picked.has(p.id) ? ' on' : ''}`, 'aria-pressed': String(picked.has(p.id)), 'aria-label': `${picked.has(p.id) ? 'Unselect' : 'Select'} the ${nameOf(p)} for a surplus use`,
        onclick: () => { if (picked.has(p.id)) picked.delete(p.id); else picked.add(p.id); build(); },
      }, picked.has(p.id) ? '✓' : '+');

      const shelfRow = (it: SH.ShelfItem) => h('div', { class: `spare-row shelf-row${it.starred ? ' starred' : ''}`, 'data-part': String(it.part.id) },
        h('span', { class: 'spare-tile', html: partTileHtml(it.part.f, it.part.t, it.part.q), 'aria-hidden': 'true' }),
        h('div', { class: 'grow' }, h('div', { class: 't' }, nameOf(it.part), it.part.q !== 'std' ? h('span', { class: 'where' }, ` · ${it.part.q === 'mint' ? 'Mint' : 'Polished'}`) : null),
          h('div', { class: 'd' }, it.earliest.text), h('div', { class: 'd' }, `Recycles for ${it.scrap} scrap`)),
        h('div', { class: 'spare-btns' },
          it.starred ? h('span', { class: 'd', 'aria-label': 'Starred: kept out of trades and recycling' }, '★') : pickBox(it.part),
          h('button', {
            class: `btn sm${it.canMoveBack ? '' : ' off'}`, 'aria-label': `Move the ${nameOf(it.part)} back to the bench`,
            onclick: () => { const ev = game.unstorePart(it.part.id); if (ev.some((e) => e.type === 'place')) { sfx.place(); app.toast(`${nameOf(it.part)} is back on the bench`); } after(); },
          }, 'To bench')));

      const benchRow = (p: Part, why: string) => h('div', { class: 'spare-row bench-row', 'data-part': String(p.id) },
        h('span', { class: 'spare-tile', html: partTileHtml(p.f, p.t, p.q), 'aria-hidden': 'true' }),
        h('div', { class: 'grow' }, h('div', { class: 't' }, nameOf(p)), h('div', { class: 'd' }, why)),
        h('div', { class: 'spare-btns' },
          unusedBench.some((q) => q.id === p.id) ? pickBox(p) : null,
          h('button', {
            class: `btn sm primary${view.free ? '' : ' off'}`, 'aria-label': `Store the ${nameOf(p)} on the shelf`,
            onclick: () => { const ev = game.storeParts([p.id]); if (!ev.some((e) => e.type === 'invalid')) { sfx.place(); app.toast(`${nameOf(p)} stored on the shelf`); } after(); },
          }, 'Store')));

      // ---- surplus uses
      const targets = SH.tradeTargets(s);
      if (target >= targets.length) target = 0;
      const tt = targets[target];
      const modeBtn = (m: typeof mode, label: string) => h('button', { class: `seg${mode === m ? ' on' : ''}`, role: 'tab', 'aria-selected': String(mode === m), onclick: () => { mode = m; build(); } }, label);
      const useTrade = () => {
        if (!tt) return [h('p', { class: 'd' }, 'Nothing to trade toward right now: your goal keystone is crafted and your car is fully built.')];
        const pv = SH.tradePreview(s, ids, tt.family, tt.tier);
        return [
          h('div', { class: 'fams' }, ...targets.map((x, i) => h('button', { class: `btn sm${i === target ? ' on' : ''}`, 'aria-pressed': String(i === target), onclick: () => { target = i; build(); } },
            h('span', { class: 'stack' }, `T${x.tier} ${FAMILIES[x.family].name}`, h('small', {}, `${x.cost} value`))))),
          h('p', { class: 'd' }, tt.why),
          h('p', { class: 'd preview' }, ids.length
            ? `${pv.used.length} part${pv.used.length === 1 ? '' : 's'} count ${pv.value} of ${pv.cost} (recycle value × ${SH.tradeRate(s)}). ${pv.ok ? `You get a T${tt.tier} ${FAMILIES[tt.family].name}${pv.lost ? `; ${pv.lost} of the value is not refunded` : ''}.` : pv.why}`
            : `Select parts above, or let the shelf pick the fewest that cover ${pv.cost}.`),
          h('div', { class: 'bulk' },
            h('button', { class: 'btn sm', onclick: () => { const auto = SH.autoTradePick(s, tt.family, tt.tier, unusedBench.map((p) => p.id)); picked.clear(); auto?.forEach((x) => picked.add(x)); if (!auto) app.toast('Not enough surplus for that part yet'); build(); } }, 'Pick for me'),
            h('button', {
              class: `btn primary${pv.ok ? '' : ' off'}`, 'aria-label': `Trade ${pv.used.length} parts for a T${tt.tier} ${FAMILIES[tt.family].name}`,
              onclick: () => { if (!pv.ok) { app.toast(pv.why); return; } const ev = game.tradeParts(ids, tt.family, tt.tier); if (!ev.some((e) => e.type === 'invalid')) { sfx.cash(); app.toast(`Traded ${pv.used.length} parts for a T${tt.tier} ${FAMILIES[tt.family].name}`); picked.clear(); } after(); },
            }, `Trade for T${tt.tier} ${FAMILIES[tt.family].name}`)),
        ];
      };
      const useContribute = () => {
        const opts2 = UPGRADES.filter((u) => u.path && P.upgradeCost(s, u.id) !== null && !P.upgradeLock(s, u.id));
        if (!upgrade || !opts2.some((u) => u.id === upgrade)) upgrade = opts2[0]?.id ?? null;
        if (!upgrade) return [h('p', { class: 'd' }, 'No Garage upgrade is on sale right now.')];
        const u = UPGRADES.find((x) => x.id === upgrade)!;
        const pv = SH.contributePreview(s, ids, upgrade);
        return [
          h('div', { class: 'fams' }, ...opts2.map((x) => h('button', { class: `btn sm${x.id === upgrade ? ' on' : ''}`, 'aria-pressed': String(x.id === upgrade), onclick: () => { upgrade = x.id; build(); } },
            h('span', { class: 'stack' }, x.name, h('small', {}, `$${fmt(P.upgradeCost(s, x.id) ?? 0)}`))))),
          h('p', { class: 'd' }, `Next rank: ${u.levels[s.upgrades[u.id] ?? 0].label}. Parts count $6 per scrap of recycle value, up to half the price.`),
          h('p', { class: 'd preview' }, ids.length ? (pv.ok ? `${pv.used.length} part${pv.used.length === 1 ? '' : 's'} → price $${fmt(pv.priceBefore)} → $${fmt(pv.priceAfter)}${pv.capped ? ' (half-price limit)' : ''}. The parts are gone; the credit stays until you buy this rank.` : pv.why) : 'Select parts above.'),
          h('button', {
            class: `btn primary wide${pv.ok ? '' : ' off'}`,
            onclick: () => { if (!pv.ok) { app.toast(pv.why); return; } const ev = game.contributeParts(ids, upgrade!); if (!ev.some((e) => e.type === 'invalid')) { sfx.cash(); app.toast(`${u.name} now $${fmt(pv.priceAfter)}`); picked.clear(); } after(); },
          }, ids.length && pv.ok ? `Contribute · price $${fmt(pv.priceAfter)}` : 'Contribute'),
        ];
      };
      const useRecycle = () => {
        const fam: Family = tt?.family ?? 'engine';
        const tier = tt?.tier ?? Math.min(B.orderMaxTier(s), 3);
        const pv = SH.recycleTowardPreview(s, ids, fam, tier);
        return [
          h('p', { class: 'd' }, `Toward a T${tier} ${FAMILIES[fam].name} scrap order (${scrapOrderCost(tier)} scrap). Pick another target on the Trade tab.`),
          h('p', { class: 'd preview' }, ids.length ? `+${pv.scrap} scrap → ${fmt(pv.total)} of ${pv.cost}. ${pv.orders ? `The T${tier} ${FAMILIES[fam].name} is ordered in the same tap (−${pv.cost} scrap).` : `${pv.cost - pv.total} more scrap to order it.`}` : 'Select parts above.'),
          h('button', {
            class: `btn primary wide${pv.ok ? '' : ' off'}`,
            onclick: () => { if (!pv.ok) { app.toast(pv.why); return; } const ev = game.recycleToward(ids, fam, tier); if (!ev.some((e) => e.type === 'invalid')) { sfx.scrap(); app.toast(pv.orders ? `Recycled · T${tier} ${FAMILIES[fam].name} ordered` : `Recycled · +${pv.scrap} scrap`); picked.clear(); } after(); },
          }, pv.orders && ids.length ? `Recycle and order · −${pv.cost - pv.scrap > 0 ? pv.cost - pv.scrap : 0} scrap net` : `Recycle${ids.length ? ` · +${pv.scrap} scrap` : ''}`),
        ];
      };

      const benchTools = (s.upgrades.grid ?? 0) >= BATCH_MERGE_RANK && P.mergeAllUnlocked(s)
        ? h('div', { class: 'bench-tools' }, h('h3', {}, 'Batch merge'),
          h('div', { class: 'fams' }, ...(['engine', 'tires', 'turbo'] as Family[]).map((f) => h('button', {
            class: 'btn sm', onclick: () => { const ev = game.mergeAll(undefined, f); const n = ev.filter((e) => e.type === 'fuse').length; app.toast(n ? `Merged ${n} ${FAMILIES[f].name} pair${n > 1 ? 's' : ''}` : `No ${FAMILIES[f].name} pairs`); after(); },
          }, `Merge ${FAMILIES[f].plural}`)))) : null;

      body.replaceChildren(...([
        h('button', { class: 'btn sm close', onclick: close }, 'Close'),
        h('h2', {}, `Parts Shelf · ${view.used}/${view.cap}`),
        h('p', { class: 'd' }, `Parts on the shelf stay safe off the merge board: they don't merge, fit or count as ingredients until you move them back. ${view.free ? `${view.free} slot${view.free === 1 ? '' : 's'} free.` : "Full — grow it in the Shop's Garage tab."}`),
        view.items.length ? null : h('p', { class: 'd' }, 'Nothing stored yet.'),
        ...view.items.map(shelfRow),
        over.length ? h('h3', {}, `Over-cap on the bench · ${over.length}`) : null,
        over.length && (s.upgrades.storage ?? 0) >= SHELF_SORT_RANK ? h('button', { class: 'btn wide', onclick: () => { game.storeOverCap(); sfx.place(); after(); } }, `Store all ${over.length} over-cap`) : null,
        ...over.slice(0, 8).map((p) => benchRow(p, `${SH.earliestCarText(s, p)}`)),
        unusedBench.filter((p) => !over.includes(p)).length ? h('h3', {}, 'Unused on the bench') : null,
        ...unusedBench.filter((p) => !over.includes(p)).slice(0, 8).map((p) => benchRow(p, `No fit or craft now · recycles for ${B.scrapValue(p)} scrap`)),
        benchTools,
        h('h3', {}, `Use surplus${ids.length ? ` · ${ids.length} selected` : ''}`),
        h('div', { class: 'segs three', role: 'tablist', 'aria-label': 'Surplus uses' }, modeBtn('trade', 'Trade'), modeBtn('contribute', 'Upgrade'), modeBtn('recycle', 'Recycle')),
        ...(mode === 'trade' ? useTrade() : mode === 'contribute' ? useContribute() : useRecycle()),
        h('p', { class: 'd' }, 'Fitted and starred parts are never used. Your crafted keystones stay credited.'),
      ] as (HTMLElement | null)[]).filter((x): x is HTMLElement => !!x));
    };
    build();
    return body;
  }, () => opts.onChange?.());
}
