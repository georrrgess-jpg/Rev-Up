// Keep / Recycle (Pit Stop): every unfitted part on the bench and spare rack, what it is good for, and the scrap it
// yields. Star a part to protect it; the bulk button recycles only parts nothing needs and never touches fitted or
// starred parts (the rule lives in core: board.recycleParts). Owned by the Workshop & offline workstream.
import { sfx } from '../audio';
import * as P from '../core/progression';
import { FAMILIES } from '../data/tables';
import { partTileHtml } from '../render/parts';
import type { App } from './app';
import { fmt, h } from './dom';

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
      const bulkScrap = unused.reduce((a, u) => a + u.scrap, 0);
      const after = () => { build(); onChange?.(); };
      const row = (u: P.PartUses) => {
        const p = u.part;
        const name = `T${p.t} ${FAMILIES[p.f].name}`;
        return h('div', { class: `spare-row ${u.verdict}${u.starred ? ' starred' : ''}`, 'data-part': String(p.id) },
          h('span', { class: 'spare-tile', html: partTileHtml(p.f, p.t, p.q), 'aria-hidden': 'true' }),
          h('div', { class: 'grow' },
            h('div', { class: 't' }, name, h('span', { class: 'where' }, u.where === 'rack' ? ' · rack' : ' · bench')),
            u.uses.length
              ? h('ul', { class: 'uses' }, ...u.uses.map((x) => h('li', { class: `use-${x.kind}` }, h('b', {}, USE_LABEL[x.kind]), ' ', x.text)))
              : h('div', { class: 'd' }, u.starred ? 'Starred to keep' : `No use: every car has an equal or better ${FAMILIES[p.f].name}; no craft is close`)),
          h('div', { class: 'spare-btns' },
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
        unused.length ? h('div', { class: 'bulk' },
          h('button', {
            class: 'btn primary wide', 'aria-label': `Recycle ${unused.length} unused parts for ${bulkScrap} scrap`,
            onclick: () => {
              const ids = P.spareParts(game.state).filter((u) => u.verdict === 'recycle').map((u) => u.part.id);
              const ev = game.recycleParts(ids);
              const got = ev.reduce((a, e) => a + (e.type === 'scrap' ? e.value : 0), 0);
              if (got) { sfx.scrap(); app.toast(`Recycled ${ev.filter((e) => e.type === 'scrap').length} parts · +${got} scrap`); }
              after();
            },
          }, `Recycle ${unused.length} unused · +${bulkScrap} scrap`),
          h('small', { class: 'd' }, 'Starred and useful parts stay. Spend scrap in the Shop’s Scrap tab: a chosen part or a polish.')) : null,
        unused.length ? h('h3', {}, `Unused · ${unused.length}`) : null,
        ...unused.map(row),
        keep.length ? h('h3', {}, `Worth keeping · ${keep.length}`) : null,
        ...keep.map(row),
      ] as (HTMLElement | null)[]).filter((x): x is HTMLElement => !!x));
    };
    build();
    return body;
  }, () => onChange?.());
}
