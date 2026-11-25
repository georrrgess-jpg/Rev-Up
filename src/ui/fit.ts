// Fit Parts view: the active car with a labelled slot per part family; install, swap or remove an exact part,
// with a before/after stat comparison and a one-tap recommended fit. Owned by the Garage systems workstream.
//
// Scaffolding version (lead): slots and the recommended fit only. The Garage systems agent replaces this file.
import * as I from '../core/install';
import { computeLoadout } from '../core/loadout';
import { ACTIVE_FAMILIES, CarId, FAMILIES, carById } from '../data/tables';
import { mph } from '../core/units';
import { partSvg, familyIcon } from '../render/parts';
import type { App } from './app';
import { h } from './dom';

/** Open the Fit Parts view for a car (default: the active car). Contract: other workstreams call only this. */
export function openFitParts(app: App, car: CarId = app.game.state.activeCar) {
  app.sheet((close) => {
    const body = h('div', { class: 'fit' });
    const build = () => {
      const s = app.game.state;
      const lo = computeLoadout(s, car);
      const rec = I.recommendedFit(s, car);
      body.replaceChildren(
        h('button', { class: 'btn sm close', onclick: close }, 'Close'),
        h('h2', {}, `Fit parts · ${carById(car).model}`),
        h('p', { class: 'd' }, `${mph(lo.stats.top)} mph · Accel ${lo.stats.accel.toFixed(1)} · Grip ${lo.stats.grip.toFixed(2)}`),
        ...ACTIVE_FAMILIES.map((f) => {
          const p = lo.equipped[f];
          return h('div', { class: 'row' },
            h('span', { html: p ? partSvg(f, p.t, p.q) : familyIcon(f), class: 'fit-ico' }),
            h('div', { class: 'grow' }, h('div', { class: 't' }, FAMILIES[f].name), h('div', { class: 'd' }, p ? `T${p.t} fitted` : 'Empty slot')),
            p ? h('button', { class: 'btn sm', onclick: () => { const ev = app.game.removePart(car, f); const bad = ev.find((e) => e.type === 'invalid'); if (bad && bad.type === 'invalid') app.toast(bad.reason); build(); } }, 'Remove') : null);
        }),
        h('button', { class: `btn primary${Object.keys(rec).length ? '' : ' off'}`, onclick: () => { app.game.fitRecommended(car); build(); } }, Object.keys(rec).length ? 'Fit recommended' : 'Best parts fitted'),
      );
    };
    build();
    return body;
  });
}
