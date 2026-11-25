// Fit Parts view: the car with a labelled slot per active part family. Install, swap or remove an exact part
// (bench, spare rack, or another owned car), with a before/after stat comparison before confirming, and a
// one-tap recommended fit. Every result says where each part went. Owned by the Garage systems workstream.
import { gsfx } from '../audio-garage';
import { firstFree } from '../core/board';
import type { GameEvent } from '../core/events';
import * as I from '../core/install';
import { computeLoadout, contributionOn, loadoutWith } from '../core/loadout';
import type { Part } from '../core/state';
import { carStyle } from '../core/style';
import { mph } from '../core/units';
import { ACTIVE_FAMILIES, CarId, FAMILIES, Family, carById, finishStripe } from '../data/tables';
import { drawCar, fitCanvas } from '../render/car';
import { familyIcon, partTileHtml, qualityName } from '../render/parts';
import type { App } from './app';
import { h } from './dom';

type Stats = { top: number; accel: number; grip: number };

/** Where each slot sits over the car drawing (fraction of the stage width; the car faces right). */
const SLOT_X: Record<Family, number> = { tires: 0.2, turbo: 0.5, engine: 0.8, transmission: 0.35, aero: 0.1 };
const STAT_OF: Record<Family, keyof Stats> = { engine: 'top', turbo: 'accel', tires: 'grip', transmission: 'accel', aero: 'grip' };

const partName = (p: Part) => `T${p.t} ${FAMILIES[p.f].name}${p.q !== 'std' ? ` · ${qualityName(p.q)}` : ''}`;
const srcWhere = (app: App, src: I.PartSource) => ('at' in src ? I.describeCell(app.game.state, src.at) : `on the ${carById(src.car).model}`);
const cap1 = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

function statText(k: keyof Stats, v: number) {
  return k === 'top' ? `${mph(v)} mph` : k === 'accel' ? v.toFixed(1) : v.toFixed(2);
}
/** Signed change of one stat in display units (0 when the shown value would not move). */
function statChange(k: keyof Stats, a: number, b: number) {
  return k === 'top' ? mph(b) - mph(a) : k === 'accel' ? Math.round((b - a) * 10) / 10 : Math.round((b - a) * 100) / 100;
}
function changeText(k: keyof Stats, d: number) {
  const unit = k === 'top' ? ' mph' : '';
  const n = k === 'top' ? String(Math.abs(d)) : Math.abs(d).toFixed(k === 'accel' ? 1 : 2);
  return `${d > 0 ? '+' : '−'}${n}${unit}`;
}
/** "+8 mph · Accel +0.3" across all three stats. */
function summary(a: Stats, b: Stats) {
  const out: string[] = [];
  for (const k of ['top', 'accel', 'grip'] as const) {
    const d = statChange(k, a[k], b[k]);
    if (d) out.push(k === 'top' ? changeText(k, d) : `${k === 'accel' ? 'Accel' : 'Grip'} ${changeText(k, d)}`);
  }
  return out.join(' · ');
}

/** Plain words for what a fit operation did and where every part went. */
export function describeFitEvents(app: App, ev: GameEvent[]): string {
  const s = app.game.state;
  const name = (id: number | null) => {
    if (id == null) return '';
    const loc = I.locatePart(s, id);
    if (!loc) return 'part';
    const p = 'at' in loc ? s.board.concat(s.tray).find((x) => x?.id === id) : I.fitted(s, loc.car)[loc.family];
    return p ? `T${p.t} ${FAMILIES[p.f].name}` : 'part';
  };
  const lines: string[] = [];
  for (const e of ev) {
    if (e.type === 'install') {
      lines.push(`${name(e.partId)} fitted${e.outgoingId != null ? ` · your old ${name(e.outgoingId)} is on ${I.describeCell(s, e.from)}` : ''}.`);
    } else if (e.type === 'uninstall') {
      lines.push(`${name(e.partId)} taken off · it's on ${I.describeCell(s, e.to)}.`);
    } else if (e.type === 'move-fit') {
      lines.push(`${name(e.partId)} moved from the ${carById(e.fromCar).model}${e.outgoingId != null ? ` · it gets your ${name(e.outgoingId)}` : ' · its slot is empty now'}.`);
    } else if (e.type === 'invalid' && e.reason !== 'empty') lines.push(e.reason);
  }
  return lines.join(' ');
}

/**
 * Open the Fit Parts view for a car (default: the active car), optionally on one family's slot.
 * Contract: other workstreams call only this.
 */
export function openFitParts(app: App, car: CarId = app.game.state.activeCar, focus?: Family) {
  let curCar: CarId = app.game.state.owned.includes(car) ? car : app.game.state.activeCar;
  let fam: Family = focus && ACTIVE_FAMILIES.includes(focus) ? focus : defaultFamily(app, curCar);
  let pick: I.PartSource | null = null;
  let note = '';
  let noteBad = false;
  let landed: Family | null = null;

  app.sheet((close) => {
    const body = h('div', { class: 'fit' });
    const canvas = h('canvas', { class: 'fit-car', 'aria-hidden': 'true' });
    const draw = () => {
      if (!canvas.isConnected) return;
      const { w, h: hh } = fitCanvas(canvas);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, w, hh);
      const glow = ctx.createRadialGradient(w / 2, hh * 0.86, 0, w / 2, hh * 0.86, w * 0.5);
      glow.addColorStop(0, 'rgba(142,211,250,.18)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, hh);
      const s = app.game.state;
      const cls = carById(curCar);
      const paint = s.paints[curCar] ?? cls.paint;
      const len = Math.min(w * 0.84, hh * 2.6);
      drawCar(ctx, curCar, (w - len) / 2, hh * 0.86, len, { paint, trim: cls.trim, livery: finishStripe(curCar, paint), style: carStyle(s, curCar), detail: true, shadow: true });
    };

    /** Run a game action, then report where each part went and refresh. */
    const act = (run: () => GameEvent[], sound: () => void, slot: Family | null) => {
      const ev = run();
      const bad = ev.length === 1 && ev[0].type === 'invalid';
      note = describeFitEvents(app, ev);
      noteBad = bad;
      if (!bad) {
        pick = null;
        landed = slot;
        // the Garage plays the fit sounds when it is on screen behind the sheet
        if (app.route !== 'garage') sound();
      }
      build();
    };

    const build = () => {
      const s = app.game.state;
      if (!s.owned.includes(curCar)) curCar = s.activeCar;
      const cls = carById(curCar);
      const lo = computeLoadout(s, curCar);
      const rec = I.previewRecommended(s, curCar);
      const recCount = Object.keys(rec.rec).length;
      // validate the pending pick against the live state
      if (pick && !I.fitCandidates(s, curCar, fam).some((c) => c.part.id === pick!.part.id)) pick = null;
      const after = pick ? loadoutWith(s, curCar, { [fam]: pick.part }).stats : null;
      const cur = lo.equipped[fam] ?? null;

      // ---- header: car choice
      const cars = s.owned.length > 1
        ? h('div', { class: 'fit-cars', role: 'tablist', 'aria-label': 'Car to fit' }, ...s.owned.map((id) => h('button', {
          class: `chipbtn${id === curCar ? ' on' : ''}`, role: 'tab', 'aria-selected': id === curCar ? 'true' : 'false',
          onclick: () => { curCar = id; pick = null; note = ''; landed = null; fam = defaultFamily(app, id); build(); },
        }, carById(id).model, id === s.activeCar ? h('small', {}, ' · racing') : null)))
        : null;

      // ---- the car with its slots
      const st = I.slotStatus(s, curCar);
      const slots = ACTIVE_FAMILIES.map((f) => {
        const p = lo.equipped[f];
        const better = st.better.includes(f);
        const stateCls = !p ? 'empty' : better ? 'better' : 'ok';
        return h('button', {
          class: `fit-slot ${stateCls}${f === fam ? ' on' : ''}${landed === f ? ' landed' : ''}${lo.blocked[f] ? ' capped' : ''}`,
          style: `left:${SLOT_X[f] * 100}%`, 'data-family': f,
          'aria-pressed': f === fam ? 'true' : 'false',
          'aria-label': `${FAMILIES[f].name} slot: ${p ? partName(p) : 'empty'}${better ? ', a better part is available' : ''}`,
          onclick: () => { fam = f; pick = null; note = ''; landed = null; build(); },
        },
        h('span', { class: 'fs-art', html: p ? partTileHtml(p.f, p.t, p.q, 'mini') : `<span class="eqempty">${familyIcon(f)}</span>` }),
        h('span', { class: 'fs-l' }, FAMILIES[f].name),
        h('span', { class: 'fs-t' }, p ? `T${p.t}${lo.blocked[f] ? ` → T${cls.cap}` : ''}` : 'Empty'),
        better ? h('span', { class: 'fs-badge up', 'aria-hidden': 'true' }, '↑') : !p && st.rec[f] ? h('span', { class: 'fs-badge add', 'aria-hidden': 'true' }, '+') : null);
      });
      const stage = h('div', { class: 'fit-stage' }, canvas, ...slots);

      // ---- stats: before → after for the pending pick
      const statRow = h('div', { class: 'fit-stats' }, ...(['top', 'accel', 'grip'] as const).map((k) => {
        const a = lo.stats[k];
        const b = after?.[k];
        const d = b == null ? 0 : statChange(k, a, b);
        return h('div', { class: `fit-stat${STAT_OF[fam] === k ? ' key' : ''}` },
          h('span', { class: 'sl' }, k === 'top' ? 'Top speed' : k === 'accel' ? 'Accel' : 'Grip'),
          h('span', { class: 'sv' }, statText(k, a), b != null && d ? h('span', { class: 'arrow' }, ` → ${statText(k, b)}`) : null),
          b != null && (d || STAT_OF[fam] === k) ? h('span', { class: `sd ${d > 0 ? 'up' : d < 0 ? 'down' : 'same'}` }, d ? changeText(k, d) : 'no change') : null);
      }));

      // ---- the chosen slot: what is fitted, and Remove
      const room = !!firstFree(s);
      const slotHead = h('div', { class: 'fit-cur' },
        h('span', { class: 'fc-art', html: cur ? partTileHtml(cur.f, cur.t, cur.q, 'mini') : `<span class="eqempty">${familyIcon(fam)}</span>` }),
        h('div', { class: 'grow' },
          h('div', { class: 't' }, `${FAMILIES[fam].name} slot`),
          h('div', { class: 'd' }, cur
            ? `${partName(cur)} fitted${cur.t > cls.cap ? ` · runs at T${cls.cap} (the ${cls.model}'s cap)` : ''}`
            : `Empty — fit ${/^[AEIOU]/.test(FAMILIES[fam].name) ? 'an' : 'a'} ${FAMILIES[fam].name} for more ${FAMILIES[fam].statLabel.toLowerCase()}`)),
        cur ? h('button', {
          class: `btn sm${room ? '' : ' off'}`, 'aria-disabled': room ? 'false' : 'true',
          onclick: () => {
            if (!firstFree(s)) {
              // the box below already explains how to make room: draw the eye to it
              gsfx.invalid();
              const box = body.querySelector('.fit-room');
              box?.classList.remove('refuse'); void (box as HTMLElement | null)?.offsetWidth; box?.classList.add('refuse');
              box?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
              return;
            }
            act(() => app.game.removePart(curCar, fam), () => gsfx.unfit(), fam);
          },
        }, 'Remove') : null);
      const roomNote = cur && !room ? h('p', { class: 'fit-room' }, 'Bench and spare rack are full, so this part can\'t come off. Merge a pair or scrap a part to make room — or swap in another part below (swaps never need space).') : null;

      // ---- candidates
      // identical bench parts show once, with a count (fitting any of them is the same)
      const dupes = new Map<string, number>();
      const cands = I.fitCandidates(s, curCar, fam).filter((c) => {
        if (!('at' in c)) return true;
        const key = `${c.part.f}:${c.part.t}:${c.part.q ?? ''}`;
        const n = dupes.get(key) ?? 0;
        dupes.set(key, n + 1);
        return n === 0 || (!!pick && pick.part.id === c.part.id);
      });
      const countOf = (c: I.PartSource) => ('at' in c ? dupes.get(`${c.part.f}:${c.part.t}:${c.part.q ?? ''}`) ?? 1 : 1);
      const curScore = cur ? contributionOn(cur, cls.cap) : 0;
      const list = cands.length
        ? h('div', { class: 'fit-list', role: 'listbox', 'aria-label': `${FAMILIES[fam].plural} you can fit` }, ...cands.map((c) => {
          const k = STAT_OF[fam];
          const d = statChange(k, lo.stats[k], loadoutWith(s, curCar, { [fam]: c.part }).stats[k]);
          const on = !!pick && pick.part.id === c.part.id;
          const isRec = !!rec.rec[fam] && rec.rec[fam]!.part.id === c.part.id;
          const capped = c.part.t > cls.cap;
          return h('button', {
            class: `fit-cand${on ? ' on' : ''}${'car' in c ? ' other' : ''}`, role: 'option', 'aria-selected': on ? 'true' : 'false',
            onclick: () => { pick = on ? null : c; note = ''; build(); },
          },
          h('span', { class: 'fc-art', html: partTileHtml(c.part.f, c.part.t, c.part.q, 'mini') }),
          h('span', { class: 'grow' },
            h('span', { class: 't' }, partName(c.part), countOf(c) > 1 ? h('small', {}, ` ×${countOf(c)}`) : null, isRec ? h('span', { class: 'rec' }, 'Best') : null),
            h('span', { class: 'd' }, cap1(srcWhere(app, c)), capped ? ` · runs at T${cls.cap}` : '')),
          h('span', { class: `delta ${d > 0 ? 'up' : d < 0 ? 'down' : 'same'}` }, d ? changeText(k, d) : contributionOn(c.part, cls.cap) === curScore && cur ? 'same' : '±0'));
        }))
        : h('p', { class: 'fit-none' }, `No spare ${FAMILIES[fam].plural.toLowerCase()} yet. Merge or order one in the Shop, then fit it here.`);

      // ---- confirm bar: the exact swap, or the recommended fit
      let confirm: HTMLElement;
      if (pick) {
        const p = pick;
        const where = 'at' in p
          ? (cur ? `Your ${partName(cur)} goes to ${I.describeCell(s, p.at)}` : `Frees ${I.describeCell(s, p.at)}`)
          : (cur ? `The ${carById(p.car).model} gets your ${partName(cur)}` : `The ${carById(p.car).model}'s ${FAMILIES[fam].name} slot will be empty`);
        confirm = h('div', { class: 'fit-confirm' },
          h('button', { class: 'btn primary', onclick: () => act(() => app.game.transact((d) => I.fitFrom(d, curCar, p)), () => gsfx.fit(p.part.t), fam) },
            h('span', { class: 'stack' }, `${cur ? 'Swap in' : 'Fit'} ${partName(p.part)}`, h('small', {}, where))),
          h('button', { class: 'btn', onclick: () => { pick = null; build(); } }, 'Cancel'));
      } else {
        const gain = summary(rec.before, rec.after);
        confirm = h('div', { class: 'fit-confirm' },
          h('button', {
            class: `btn primary${recCount ? '' : ' off'}`, 'aria-disabled': recCount ? 'false' : 'true', 'data-coach': 'fit-recommended',
            onclick: () => {
              if (!recCount) { note = 'Best parts already fitted. Merge higher tiers to improve this car.'; noteBad = false; build(); return; }
              act(() => app.game.fitRecommended(curCar), () => gsfx.recommended(), null);
            },
          }, h('span', { class: 'stack' }, recCount ? 'Recommended fit' : 'Best parts fitted', h('small', {}, recCount ? (gain || `${recCount} part${recCount > 1 ? 's' : ''}`) : 'Tap a part above to compare'))));
      }

      body.replaceChildren(...[
        h('button', { class: 'btn sm close', onclick: close }, 'Close'),
        h('h2', {}, `Fit parts · ${cls.model}`),
        h('p', { class: 'd fit-sub' }, `Fitted parts power this car and free their bench cells. Parts above T${cls.cap} run at T${cls.cap}.`),
        cars, stage, statRow,
        h('p', { class: `fit-note${noteBad ? ' bad' : ''}`, role: 'status' }, note),
        slotHead, roomNote,
        h('h3', {}, `${FAMILIES[fam].plural} you can fit`),
        list, confirm,
      ].filter((x): x is HTMLElement => !!x));
      requestAnimationFrame(draw);
    };
    build();
    return body;
  });
}

/** Start on the slot that most needs attention: empty with a part ready, then improvable, then engine. */
function defaultFamily(app: App, car: CarId): Family {
  const st = I.slotStatus(app.game.state, car);
  return st.empty.find((f) => st.rec[f]) ?? st.better[0] ?? st.empty[0] ?? ACTIVE_FAMILIES[0];
}
