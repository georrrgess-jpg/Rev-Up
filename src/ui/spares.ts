// Keep / Recycle (Pit Stop): every unfitted part on the bench and spare rack, what it is good for, and the scrap it
// yields. Star a part to protect it; the bulk button recycles only parts nothing needs and never touches fitted or
// starred parts (the rule lives in core: board.recycleParts). Owned by the Workshop & offline workstream.
import { sfx } from '../audio';
import { recyclePreview } from '../core/board';
import * as P from '../core/progression';
import { FAMILIES } from '../data/tables';
import { partTileHtml } from '../render/parts';
import type { App } from './app';
import { fmt, h } from './dom';
// ---- Scrap & surplus: what each spare is worth in a Build Sheet, and a Fab bench kit
import * as PJ from '../core/projects';
import * as F from '../core/fabrication';
import { openBuilds } from './projects';

const USE_LABEL = { fit: 'Upgrade', craft: 'Craft', pair: 'Merge', spare: 'Alt build' } as const;

/** Open the Keep / Recycle sheet. `onChange` runs after each change (e.g. to refresh the Shop underneath). */
export function openSpares(app: App, onChange?: () => void): () => void {
  const game = app.game;
  return app.sheet((close) => {
    const body = h('div', { class: 'spares' });
    const build = () => {
      const s = game.state;
      const list = P.spareParts(s);
      const unused = list.filter((u) => u.verdict === 'recycle');
      const keep = list.filter((u) => u.verdict === 'keep');
      // what the bulk button will do, from the same rule that runs it: starred and fitted parts are never pressed
      const prev = recyclePreview(s, unused.map((u) => u.part.id));
      const starredAll = list.filter((u) => u.starred).length;
      const fittedAll = Object.values(s.installed ?? {}).reduce((a, sl) => a + Object.keys(sl ?? {}).length, 0);
      const bulkScrap = prev.scrap;
      // Scrap & surplus: the best build each spare could go into, and the kit price its scrap counts toward
      const don = new Map(list.map((u) => [u.part.id, PJ.bestDonation(s, u.part)] as const));
      const toDonate = unused.filter((u) => !u.starred && don.get(u.part.id));
      const kit = F.fabOpen(s) ? F.kitPrice(s) : 0;
      const after = () => { build(); onChange?.(); };
      const row = (u: P.PartUses) => {
        const p = u.part;
        const name = `T${p.t} ${FAMILIES[p.f].name}`;
        const d = don.get(p.id) ?? null;
        return h('div', { class: `spare-row ${u.verdict}${u.starred ? ' starred' : ''}`, 'data-part': String(p.id) },
          h('span', { class: 'spare-tile', html: partTileHtml(p.f, p.t, p.q), 'aria-hidden': 'true' }),
          h('div', { class: 'grow' },
            h('div', { class: 't' }, name, h('span', { class: 'where' }, u.where === 'rack' ? ' · rack' : ' · bench')),
            u.uses.length || d
              ? h('ul', { class: 'uses' }, ...u.uses.map((x) => h('li', { class: `use-${x.kind}` }, h('b', {}, USE_LABEL[x.kind]), ' ', x.text)),
                d ? h('li', { class: 'use-donate' }, h('b', {}, 'Build'), ' ', d.text) : null)
              : h('div', { class: 'd' }, u.starred ? 'Starred to keep' : `No fit or craft: every car has an equal or better ${FAMILIES[p.f].name}`),
            kit ? h('div', { class: 'd' }, `Recycle: ${u.scrap} scrap${u.scrap >= kit ? ` = ${Math.floor(u.scrap / kit)} race-day kit${u.scrap >= 2 * kit ? 's' : ''}` : ` (${Math.floor((u.scrap / kit) * 100)}% of a race-day kit)`}`) : null),
          h('div', { class: 'spare-btns' },
            d ? h('button', {
              class: 'btn sm primary', 'aria-label': `Donate the ${name}: ${d.text}`,
              onclick: () => {
                const ev = game.donatePart(p.id, d.car);
                const e = ev.find((x) => x.type === 'donate');
                if (e && e.type === 'donate') { sfx.place(); app.toast(e.stageUp ? `${d.text}` : `${name} donated · +${e.pts} pts`); }
                after();
              },
            }, h('span', { class: 'stack' }, 'Donate', h('small', {}, `+${d.used}`))) : null,
            h('button', {
              class: `btn sm star${u.starred ? ' on' : ''}`, 'aria-pressed': String(u.starred),
              'aria-label': u.starred ? `Unstar the ${name}` : `Star the ${name} to keep it`,
              onclick: () => { game.toggleFavorite(p.id); after(); },
            }, u.starred ? '★' : '☆'),
            h('button', {
              class: `btn sm recycle${u.starred ? ' off' : ''}`, 'aria-label': `Recycle the ${name} for ${u.scrap} scrap`,
              onclick: () => {
                const ev = game.recycleParts([p.id]);
                if (ev.some((e) => e.type === 'scrap')) { sfx.scrap(); app.toast(`${name} recycled · +${u.scrap} scrap`); }
                after();
              },
            }, h('span', { class: 'stack' }, 'Recycle', h('small', {}, `+${u.scrap}`)))));
      };
      body.replaceChildren(...([
        h('button', { class: 'btn sm close', onclick: close }, 'Close'),
        h('h2', {}, 'Keep / Recycle'),
        h('p', { class: 'wallet' }, h('span', { class: 'chip scrap' }, `${fmt(s.scrap)} scrap`),
          h('span', { class: 'd' }, `${list.length} spare${list.length === 1 ? '' : 's'} on the bench and rack · fitted parts are not listed and never recycled`)),
        list.length ? null : h('p', { class: 'd' }, 'No spare parts right now.'),
        toDonate.length ? h('div', { class: 'bulk' },
          h('button', {
            class: 'btn wide donate-all', 'aria-label': `Donate ${toDonate.length} surplus parts to your Build Sheets`,
            onclick: () => {
              const ids = P.spareParts(game.state).filter((u) => u.verdict === 'recycle' && !u.starred).map((u) => u.part.id);
              const ev = game.donateBest(ids);
              const n = ev.filter((e) => e.type === 'donate');
              const ups = n.filter((e) => e.type === 'donate' && e.stageUp).length;
              if (n.length) { sfx.polished(); app.toast(`Donated ${n.length} part${n.length > 1 ? 's' : ''} to your Build Sheets${ups ? ` · ${ups} stage${ups > 1 ? 's' : ''} up` : ''}`); }
              after();
            },
          }, `Donate ${toDonate.length} surplus to builds`),
          h('button', { class: 'btn sm', onclick: () => openBuilds(app, game.state.activeCar, after) }, 'Open Build Sheets')) : null,
        unused.length ? h('div', { class: 'bulk' },
          h('button', {
            class: `btn primary wide${prev.count ? '' : ' off'}`, 'aria-label': `Recycle ${prev.count} unused parts for ${bulkScrap} scrap`,
            onclick: () => {
              const ids = P.spareParts(game.state).filter((u) => u.verdict === 'recycle').map((u) => u.part.id);
              const ev = game.recycleParts(ids);
              const got = ev.reduce((a, e) => a + (e.type === 'scrap' ? e.value : 0), 0);
              if (got) { sfx.scrap(); app.toast(`Recycled ${ev.filter((e) => e.type === 'scrap').length} parts · +${got} scrap`); }
              after();
            },
          }, `Recycle ${prev.count} unused · +${bulkScrap} scrap`),
          h('small', { class: 'd recycle-preview' }, `Before you press: ${prev.count} part${prev.count === 1 ? '' : 's'} → +${bulkScrap} scrap (you'll have ${fmt(s.scrap + bulkScrap)}). Protected: ${starredAll} starred, ${fittedAll} fitted${prev.starred ? ` (${prev.starred} starred in this batch skipped)` : ''}, and every part with a use. Spend scrap in the Shop’s Scrap tab.`)) : null,
        unused.length ? h('h3', {}, `Surplus · ${unused.length}`) : null,
        ...unused.map(row),
        keep.length ? h('h3', {}, `Worth keeping · ${keep.length}`) : null,
        ...keep.map(row),
      ] as (HTMLElement | null)[]).filter((x): x is HTMLElement => !!x));
    };
    build();
    return body;
  }, () => onChange?.());
}
