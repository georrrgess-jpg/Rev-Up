// Fab bench UI (Scrap & surplus): make one-race kits from scrap, and arm them for the next live race. Used by the
// Shop's Scrap tab (make + arm) and Pit Setup (arm + make). Rules: core/fabrication.ts.
import './css/workshop.css';
import { sfx } from '../audio';
import * as F from '../core/fabrication';
import { FAB_OPEN_CARS, KITS, KITS_PER_RACE, KIT_SHELF_MAX, KitDef } from '../data/fabrication';
import type { App } from './app';
import { fmt, h } from './dom';

const helpWord: Record<KitDef['helps'], string> = { launch: 'Launch', straights: 'Straights', corners: 'Corners', boost: 'Boost zones' };

/**
 * The kit shelf: one compact card per kit with count, price, Make and Arm. `highlight` marks kits that help this
 * track's biggest demands (Pit Setup). `rebuild` runs after each action.
 */
export function fabBench(app: App, rebuild: () => void, o: { highlight?: KitDef['helps'][]; title?: boolean } = {}): HTMLElement {
  const s = app.game.state;
  if (!F.fabOpen(s)) {
    return h('div', { class: 'fab locked' }, h('p', { class: 'd' }, `Fab bench: turns scrap into one-race kits. Opens with your ${FAB_OPEN_CARS}th car (the Ironhorse 455).`));
  }
  const price = F.kitPrice(s);
  const armed = new Set(F.armedKits(s).map((k) => k.id));
  const card = (k: KitDef) => {
    const n = F.kitCount(s, k.id);
    const on = armed.has(k.id);
    const full = n >= KIT_SHELF_MAX;
    const short = s.scrap < price;
    const hot = o.highlight?.includes(k.helps);
    return h('div', { class: `kit${on ? ' armed' : ''}${hot ? ' hot' : ''}`, 'data-kit': k.id },
      h('div', { class: 'kit-top' },
        h('span', { class: 'kit-ico', 'aria-hidden': 'true' }, k.icon),
        h('div', { class: 'grow' }, h('div', { class: 't' }, k.name), h('div', { class: 'd' }, `${k.effect} · ${helpWord[k.helps]}`)),
        h('span', { class: 'kit-n num', 'aria-label': `${n} on the shelf` }, `×${n}`)),
      h('div', { class: 'kit-btns' },
        h('button', {
          class: `btn sm${short || full ? ' off' : ''}`, 'aria-label': `Make a ${k.name} for ${price} scrap`,
          onclick: () => { const ev = app.game.fabricate(k.id); if (ev.some((e) => e.type === 'fabricate')) { sfx.place(); app.toast(`${k.name} made · −${fmt(price)} scrap`); } rebuild(); },
        }, h('span', { class: 'stack' }, 'Make', h('small', {}, full ? 'shelf full' : short ? `${fmt(price - s.scrap)} more` : `${fmt(price)} scrap`))),
        h('button', {
          class: `btn sm arm${on ? ' primary' : ''}${n ? '' : ' off'}`, 'aria-pressed': String(on),
          'aria-label': on ? `Disarm the ${k.name}` : `Arm the ${k.name} for the next race`,
          onclick: () => { app.game.armKit(k.id, !on); rebuild(); },
        }, on ? '✓ Armed' : 'Arm')));
  };
  return h('div', { class: 'fab' },
    o.title === false ? null : h('h3', {}, 'Fab bench · race-day kits'),
    h('p', { class: 'd fab-note' }, `Scrap → a kit for one live race. Arm ${KITS_PER_RACE === 1 ? 'one' : `up to ${KITS_PER_RACE}`} per race; it is used when the race finishes (a race you leave costs nothing). ${fmt(price)} scrap each now: half a recycled T${F.topCap(s)} part.`),
    h('div', { class: 'kits' }, ...KITS.map(card)));
}

/** One line for the Race menu / Pit Setup header: what is armed. */
export function armedLine(app: App): string {
  const k = F.armedKits(app.game.state);
  return k.length ? `Kits armed: ${k.map((x) => `${x.name} (${x.effect})`).join(' · ')}` : '';
}
