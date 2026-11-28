// Mechanic Shop: the car itself is the centre of a service bay. Pick an area by tapping the car or a tab —
// Engine Bay (engine and turbo parts, with an engine-note preview), Wheels and Tires (grip parts and wheel sets),
// Body and Paint (colours, premium paint, liveries, restoration) and Tuning (Tune-up stages, Build Sheet, race-day
// kits: the car settings the race model really has). Every choice previews on the real car and in the stats before
// an explicit Install / Apply / Buy button with the exact price and currency. Fitted parts live on the car, never on
// the merge board; swaps are atomic, so a full bench never loses a part. Owned by the Mechanic Shop workstream.
import './css/mechanic.css';
import { sfx } from '../audio';
import { previewEngine, stopPreview } from '../audio-api';
import { gsfx } from '../audio-garage';
import * as B from '../core/board';
import type { GameEvent } from '../core/events';
import * as F from '../core/fabrication';
import * as I from '../core/install';
import { computeLoadout, contributionOn, loadoutWith } from '../core/loadout';
import * as PJ from '../core/projects';
import { purchaseInfo } from '../core/purchases';
import type { GameState, Part } from '../core/state';
import * as S from '../core/style';
import { mph } from '../core/units';
import {
  ACTIVE_FAMILIES, BLUEPRINT_FINISHES, CROWN_FINISH, CarId, FAMILIES, Family, PART_ORDER_PRICE, RAY_FINISH,
  SIGNATURE_FINISHES, STYLE_ITEMS, StyleItem, TUNE_STAGES, carById, finishStripe, scrapOrderCost, tunePrice,
} from '../data/tables';
import { drawCar, fitCanvas, serviceZoneAt, serviceZones, type CarStyle, type PaintMaterial, type ServiceZones, type WheelSetId } from '../render/car';
import { MATERIAL, familyIcon, metalFor, partTileHtml, qualityName } from '../render/parts';
import type { App } from './app';
import { bayFloorY, drawServiceBay } from '../render/bay';
import { fmt, h } from './dom';
import { fabBench } from './fabrication';
import { openTestDrive, type TestDriveOpts } from './testDrive'; // 1.10 Test & Compare
import { openBuilds } from './projects';

export type MechArea = 'engine' | 'wheels' | 'body' | 'tuning';
type Stats = { top: number; accel: number; grip: number };

export interface MechanicOpts {
  /** Car to service (default: the active car; must be owned). */
  car?: CarId;
  /** Area to open on (default: the one that most needs attention). */
  area?: MechArea;
  /** Part family to open on (implies its area). */
  family?: Family;
  /** Preselect a cash order of this tier for `family` (Pit Setup's "Order" hint). */
  tier?: number;
  /** Where Close leads (e.g. back to the selected race's Pit Setup). The label names it on the button. */
  returnTo?: { label: string; run: () => void } | (() => void);
}

const AREAS: { id: MechArea; label: string; short: string; icon: string }[] = [
  { id: 'engine', label: 'Engine Bay', short: 'Engine', icon: '⚙' },
  { id: 'wheels', label: 'Wheels and Tires', short: 'Wheels', icon: '◎' },
  { id: 'body', label: 'Body and Paint', short: 'Body', icon: '◆' },
  { id: 'tuning', label: 'Tuning', short: 'Tuning', icon: '≋' },
];

const AREA_FAMS: Record<MechArea, Family[]> = { engine: ['engine', 'turbo'], wheels: ['tires'], body: [], tuning: [] };
export const areaOf = (f: Family): MechArea => (f === 'tires' || f === 'aero' ? 'wheels' : 'engine');
/** Bay lighting per area: key light on the paint, hood opening. */
const LOOK: Record<MechArea, { hood: number; light: number }> = {
  engine: { hood: 1, light: 0.35 }, wheels: { hood: 0, light: 0.55 }, body: { hood: 0, light: 1 }, tuning: { hood: 0.35, light: 0.25 },
};
/** Bay lamp brightness per area: the Art bay (src/render/bay.ts) lights the room for the area being serviced. */
const BAY_LIGHT: Record<MechArea, number> = { engine: 0.9, wheels: 0.85, body: 1, tuning: 0.8 };

// ---- stat words shared with Fit Parts and Pit Setup
export function statText(k: keyof Stats, v: number) {
  return k === 'top' ? `${mph(v)} mph` : k === 'accel' ? v.toFixed(1) : v.toFixed(2);
}
/** Signed change of one stat in display units (0 when the shown value would not move). */
export function statChange(k: keyof Stats, a: number, b: number) {
  return k === 'top' ? mph(b) - mph(a) : k === 'accel' ? Math.round((b - a) * 10) / 10 : Math.round((b - a) * 100) / 100;
}
export function changeText(k: keyof Stats, d: number) {
  const unit = k === 'top' ? ' mph' : '';
  const n = k === 'top' ? String(Math.abs(d)) : Math.abs(d).toFixed(k === 'accel' ? 1 : 2);
  return `${d > 0 ? '+' : '−'}${n}${unit}`;
}
/** "+8 mph · Accel +0.3" across all three stats. */
export function statSummary(a: Stats, b: Stats) {
  const out: string[] = [];
  for (const k of ['top', 'accel', 'grip'] as const) {
    const d = statChange(k, a[k], b[k]);
    if (d) out.push(k === 'top' ? changeText(k, d) : `${k === 'accel' ? 'Accel' : 'Grip'} ${changeText(k, d)}`);
  }
  return out.join(' · ');
}
const STAT_OF: Record<Family, keyof Stats> = { engine: 'top', turbo: 'accel', tires: 'grip', transmission: 'accel', aero: 'grip' };
export const partName = (p: Pick<Part, 'f' | 't' | 'q'>) => `T${p.t} ${FAMILIES[p.f].name}${p.q !== 'std' ? ` · ${qualityName(p.q)}` : ''}`;
const cap1 = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const ordinalWord = (n: number) => ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'][n] ?? `${n}th`;

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

/** Order a part (cash or scrap) and fit it in one atomic step. Refused (nothing charged) when it could not land. */
export function orderAndFit(s: GameState, car: CarId, f: Family, t: number, pay: 'cash' | 'scrap' = 'cash'): GameEvent[] {
  if (!B.firstFree(s)) return [{ type: 'invalid', reason: FULL_BUY }];
  const ev = pay === 'scrap' ? B.scrapOrder(s, f, t) : B.orderPart(s, f, t);
  if (ev.length === 1 && ev[0].type === 'invalid') return ev;
  const placed = ev.find((e): e is Extract<GameEvent, { type: 'place' }> => e.type === 'place' && e.family === f && e.tier === t);
  if (!placed) return [{ type: 'invalid', reason: FULL_BUY }];
  return [...ev, ...I.installPart(s, car, placed.at)];
}
const FULL_BUY = 'Bench and spare rack are full, so a new part has nowhere to arrive. Merge a pair or recycle a spare — or install a part you already own (swaps never need space).';

type ZoneId = 'engine' | 'wheels' | 'body';
const ZONE_IDS: ZoneId[] = ['body', 'wheels', 'engine']; // body first so the smaller areas sit above it

type Pending =
  | { k: 'part'; src: I.PartSource }
  | { k: 'order'; f: Family; t: number }
  | { k: 'style'; item: StyleItem }
  | { k: 'finish'; name: string; paint: string | null }
  | { k: 'factory'; kind: 'wheel' | 'material' | 'livery'; name: string }
  | { k: 'tune' }
  | { k: 'restore' };

/** Open the Mechanic Shop. Returns a function that closes it. */
export function openMechanic(app: App, opts: MechanicOpts = {}): () => void {
  const game = app.game;
  const st0 = game.state;
  let car: CarId = opts.car && st0.owned.includes(opts.car) ? opts.car : st0.activeCar;
  let fam: Family = opts.family && ACTIVE_FAMILIES.includes(opts.family) ? opts.family : defaultFamily(st0, car);
  let area: MechArea = opts.area ?? (opts.family ? areaOf(opts.family) : areaOf(fam));
  if (AREA_FAMS[area].length && !AREA_FAMS[area].includes(fam)) fam = AREA_FAMS[area][0];
  let pending: Pending | null = opts.tier && opts.family ? { k: 'order', f: fam, t: Math.min(opts.tier, B.orderMaxTier(st0)) } : null;
  let note = '';
  let noteBad = false;
  const ret = typeof opts.returnTo === 'function' ? { label: '', run: opts.returnTo } : opts.returnTo;
  const reduced = () => game.state.settings.reducedMotion;
  const look = { hood: reduced() ? LOOK[area].hood : 0, light: reduced() ? LOOK[area].light : 0.2 };
  let raf = 0;
  let onResize: (() => void) | null = null;

  return app.sheet((close) => {
    const body = h('div', { class: 'mech', 'data-area': area });
    const canvas = h('canvas', { class: 'mech-car', 'aria-hidden': 'true' });
    // Tap anywhere on the car (engine and wheels win over the body); labelled pins do the same for keyboard and
    // screen readers, and the outline marks the area being serviced.
    const zoneBtns = {} as Record<ZoneId, HTMLButtonElement>;
    for (const z of ZONE_IDS) {
      zoneBtns[z] = h('button', {
        class: 'mech-pin', 'data-zone': z, 'aria-label': `Service the ${AREAS.find((a) => a.id === z)!.label}`,
        onclick: () => setArea(z),
      }, h('span', {}, AREAS.find((a) => a.id === z)!.short));
    }
    const outline = h('div', { class: 'mech-outline', 'aria-hidden': 'true' });
    const outline2 = h('div', { class: 'mech-outline', 'aria-hidden': 'true' });
    let zones: ServiceZones | null = null;
    let dprNow = 1;
    canvas.addEventListener('click', (e) => {
      if (!zones) return;
      const r = canvas.getBoundingClientRect();
      const z = serviceZoneAt(zones, (e.clientX - r.left) * dprNow, (e.clientY - r.top) * dprNow);
      if (z) setArea(z);
    });
    const bay = h('div', { class: 'mech-bay' }, canvas, outline, outline2, ...ZONE_IDS.map((z) => zoneBtns[z]));

    /** The look being previewed: state's paint and style, with the pending cosmetic choice on top. */
    const shownLook = (): { paint: string; style: CarStyle } => {
      const s = game.state;
      const cls = carById(car);
      const style: CarStyle = { ...S.carStyle(s, car) };
      let paint = s.paints[car] ?? cls.paint;
      const p = pending;
      if (p?.k === 'style') {
        const it = p.item;
        if (it.kind === 'paint') paint = it.value;
        if (it.kind === 'wheel') style.wheel = it.value as WheelSetId;
        if (it.kind === 'material') style.material = it.value as PaintMaterial;
        if (it.kind === 'livery') style.livery = it.value;
        if (it.kind === 'restore') style.restore = Math.max(style.restore ?? 0, Number(it.value));
      } else if (p?.k === 'finish') paint = p.paint ?? cls.paint;
      else if (p?.k === 'factory') delete style[p.kind];
      return { paint, style };
    };

    const draw = () => {
      if (!canvas.isConnected) return;
      const { w, h: hh, dpr } = fitCanvas(canvas);
      const ctx = canvas.getContext('2d');
      if (!ctx || !w || !hh) return;
      ctx.clearRect(0, 0, w, hh);
      // the lit service bay first (Art: cached per size and area), then the car on its floor line
      const t = reduced() ? 0 : performance.now() / 1000;
      drawServiceBay(ctx, w, hh, { area, light: BAY_LIGHT[area], t });
      const len0 = Math.min(w * 0.72, hh * 2.3);
      const cls = carById(car);
      const { paint, style } = shownLook();
      const len = len0;
      const x = (w - len) / 2;
      const y = bayFloorY(hh);
      const focus = area === 'tuning' ? null : area;
      drawCar(ctx, car, x, y, len, { paint, trim: cls.trim, livery: finishStripe(car, paint), style, detail: true, shadow: true, hood: look.hood, focus, light: look.light });
      zones = serviceZones(car, x, y, len, look.hood);
      dprNow = dpr;
      const css = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x / dpr, y: r.y / dpr, w: r.w / dpr, h: r.h / dpr });
      const eng = css(zones.engine);
      const rear = css(zones.wheels[0]);
      const bod = css(zones.body);
      const W = w / dpr;
      const H = hh / dpr;
      const pinAt: Record<ZoneId, { x: number; y: number }> = {
        engine: { x: eng.x + eng.w / 2, y: eng.y },
        wheels: { x: rear.x + rear.w / 2, y: rear.y },
        body: { x: (rear.x + rear.w + eng.x) / 2, y: bod.y + bod.h * 0.12 },
      };
      const placed: { l: number; r: number; t: number; b: number }[] = [];
      for (const z of ['engine', 'wheels', 'body'] as const) {
        const b = zoneBtns[z];
        const bw = Math.max(44, b.offsetWidth);
        const bh = Math.max(44, b.offsetHeight);
        let l = Math.max(2, Math.min(W - bw - 2, pinAt[z].x - bw / 2));
        let t = Math.max(2, Math.min(H - bh - 2, pinAt[z].y - bh / 2));
        // keep pins (and their 44 px tap areas) apart: slide left past a pin on the same band, else right, else
        // drop below it, so no two tap areas ever overlap on narrow phones
        const hits = (o: { l: number; r: number; t: number; b: number }) => t < o.b && t + bh > o.t && l < o.r + 4 && l + bw > o.l - 4;
        for (let pass = 0; pass < 3; pass++) {
          const o = placed.find(hits);
          if (!o) break;
          if (o.l - bw - 4 >= 2) l = o.l - bw - 4;
          else if (o.r + 4 + bw <= W - 2 && !placed.some((p) => p !== o && t < p.b && t + bh > p.t && o.r + 4 < p.r && o.r + 4 + bw > p.l)) l = o.r + 4;
          else t = Math.min(H - bh, o.b + 2);
        }
        placed.push({ l, r: l + bw, t, b: t + bh });
        b.style.left = `${l}px`;
        b.style.top = `${t}px`;
        b.classList.toggle('on', area === z);
        b.setAttribute('aria-pressed', String(area === z));
      }
      const sel = area === 'engine' ? eng : area === 'wheels' ? rear : area === 'body' ? bod : null;
      const put = (el: HTMLElement, r: { x: number; y: number; w: number; h: number } | null) => {
        el.hidden = !r;
        if (r) Object.assign(el.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
      };
      put(outline, sel);
      put(outline2, area === 'wheels' ? css(zones.wheels[1]) : null); // both wheels
    };

    /** Ease the hood and key light toward the area's look (instant with reduced motion). */
    const animate = () => {
      cancelAnimationFrame(raf);
      const target = LOOK[area];
      if (reduced()) { look.hood = target.hood; look.light = target.light; draw(); return; }
      // a fixed, short ease (about 24 frames): the detailed car is redrawn each frame, so the open must not linger
      const from = { hood: look.hood, light: look.light };
      if (Math.abs(target.hood - from.hood) < 0.004 && Math.abs(target.light - from.light) < 0.004) { draw(); return; }
      const DUR = 400;
      let t0 = -1;
      const step = (now: number) => {
        if (t0 < 0) t0 = now;
        const u = Math.min(1, (now - t0) / DUR);
        const e = 1 - (1 - u) ** 3; // ease out
        look.hood = from.hood + (target.hood - from.hood) * e;
        look.light = from.light + (target.light - from.light) * e;
        const done = u >= 1;
        draw();
        if (!done && canvas.isConnected) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };

    const setArea = (a: MechArea) => {
      if (a === area) return;
      area = a;
      pending = null;
      note = '';
      if (AREA_FAMS[a].length && !AREA_FAMS[a].includes(fam)) fam = AREA_FAMS[a].find((f) => I.slotStatus(game.state, car).better.includes(f)) ?? AREA_FAMS[a][0];
      stopPreview();
      build();
      animate();
    };

    /** Run a game action, report where each part went, refresh. */
    const act = (run: () => GameEvent[], sound: () => void, okNote?: string) => {
      const ev = run();
      const bad = ev.length === 1 && ev[0].type === 'invalid';
      noteBad = bad;
      note = bad ? (ev[0] as { reason: string }).reason : [describeFitEvents(app, ev), okNote].filter(Boolean).join(' ');
      if (!bad) { pending = null; sound(); } else gsfx.invalid();
      build();
    };

    // ---------- panels ----------
    const stats = (s: GameState): HTMLElement => {
      const lo = computeLoadout(s, car).stats;
      let after: Stats | null = null;
      const p = pending;
      if (p?.k === 'part') after = loadoutWith(s, car, { [p.src.part.f]: p.src.part }).stats;
      else if (p?.k === 'order') after = loadoutWith(s, car, { [p.f]: { id: -1, f: p.f, t: p.t, q: 'std' } }).stats;
      else if (p?.k === 'tune') {
        const trial = structuredClone(s);
        (trial.tune ??= {})[car] = (s.tune?.[car] ?? 0) + 1;
        after = computeLoadout(trial, car).stats;
      }
      const cosmetic = p && (p.k === 'style' || p.k === 'finish' || p.k === 'factory');
      const keyStat = AREA_FAMS[area].length ? STAT_OF[fam] : null;
      return h('div', { class: `mech-stats${cosmetic ? ' cosmetic' : ''}`, 'aria-live': 'polite' },
        ...(['top', 'accel', 'grip'] as const).map((k) => {
          const a = lo[k];
          const b = after?.[k];
          const d = b == null ? 0 : statChange(k, a, b);
          return h('div', { class: `ms${keyStat === k ? ' key' : ''}` },
            h('span', { class: 'sl' }, k === 'top' ? 'Top speed' : k === 'accel' ? 'Accel' : 'Grip'),
            h('b', { class: 'sv num' }, statText(k, b ?? a)),
            h('span', { class: `sd ${d > 0 ? 'up' : d < 0 ? 'down' : 'same'}` }, b == null ? (cosmetic ? 'looks only' : '') : d ? changeText(k, d) : '±0'));
        }));
    };

    const famTabs = () => AREA_FAMS[area].length > 1 ? h('div', { class: 'mech-fams', role: 'tablist', 'aria-label': 'Part' }, ...AREA_FAMS[area].map((f) => h('button', {
      class: `seg${f === fam ? ' on' : ''}`, role: 'tab', 'aria-selected': String(f === fam),
      onclick: () => { fam = f; pending = null; note = ''; stopPreview(); build(); },
    }, h('span', { class: 'fi', html: familyIcon(f), 'aria-hidden': 'true' }), FAMILIES[f].name, h('small', {}, FAMILIES[f].statLabel)))) : null;

    /** Rev the car with the engine and turbo being previewed (else the fitted ones), so turbo cars whistle. */
    const hear = () => {
      const s = game.state;
      const fit = I.fitted(s, car);
      const p = pending;
      const pv = p?.k === 'part' ? p.src.part : p?.k === 'order' ? { f: p.f, t: p.t, q: 'std' as const } : null;
      const eng = pv?.f === 'engine' ? pv : fit.engine;
      const tur = pv?.f === 'turbo' ? pv : fit.turbo;
      previewEngine(car, eng?.t ?? 0, { quality: eng?.q ?? 'std', turboTier: tur?.t ?? 0 });
    };

    const partsPanel = (s: GameState): (HTMLElement | null)[] => {
      const cls = carById(car);
      const lo = computeLoadout(s, car);
      const cur = lo.equipped[fam] ?? null;
      const k = STAT_OF[fam];
      const room = !!B.firstFree(s);
      if (pending?.k === 'part' && !I.fitCandidates(s, car, fam).some((c) => c.part.id === (pending as { src: I.PartSource }).src.part.id)) pending = null;
      // fitted now
      const fittedRow = h('div', { class: 'mech-fitted' },
        h('span', { class: 'tile', html: cur ? partTileHtml(cur.f, cur.t, cur.q, 'mini') : `<span class="eqempty">${familyIcon(fam)}</span>`, 'aria-hidden': 'true' }),
        h('div', { class: 'grow' },
          h('div', { class: 't' }, cur ? `${partName(cur)} fitted` : `No ${FAMILIES[fam].name} fitted`),
          h('div', { class: 'd' }, cur ? `On the car, off the merge board${cur.t > cls.cap ? ` · runs at T${cls.cap}, the ${cls.model}'s limit` : ''}` : `Fit one for more ${FAMILIES[fam].statLabel.toLowerCase()}.`)),
        h('div', { class: 'btns' }, fam === 'engine' || fam === 'turbo' ? h('button', { class: 'btn sm hear', 'aria-label': 'Hear this engine, with the part you are previewing', onclick: () => hear() }, '▶ Hear') : null,
        cur ? h('button', {
          class: `btn sm${room ? '' : ' off'}`, 'aria-disabled': String(!room),
          onclick: () => {
            if (!B.firstFree(game.state)) { note = 'Bench and spare rack are full, so this part can\'t come off. Merge a pair or recycle a spare — or install another part below (swaps never need space).'; noteBad = true; gsfx.invalid(); build(); return; }
            act(() => game.removePart(car, fam), () => gsfx.unfit());
          },
        }, 'Remove') : null));
      // parts you own (bench, rack, other cars); identical bench parts show once with a count
      const dupes = new Map<string, number>();
      const cands = I.fitCandidates(s, car, fam).filter((c) => {
        if (!('at' in c)) return true;
        const key = `${c.part.t}:${c.part.q}`;
        const n = dupes.get(key) ?? 0;
        dupes.set(key, n + 1);
        return n === 0 || (pending?.k === 'part' && pending.src.part.id === c.part.id);
      });
      const curScore = cur ? contributionOn(cur, cls.cap) : 0;
      const owned = cands.length ? h('div', { class: 'mech-list', role: 'listbox', 'aria-label': `${FAMILIES[fam].plural} you own` }, ...cands.map((c) => {
        const d = statChange(k, lo.stats[k], loadoutWith(s, car, { [fam]: c.part }).stats[k]);
        const on = pending?.k === 'part' && pending.src.part.id === c.part.id;
        const n = 'at' in c ? dupes.get(`${c.part.t}:${c.part.q}`) ?? 1 : 1;
        return h('button', {
          class: `mech-opt${on ? ' on' : ''}${'car' in c ? ' other' : ''}`, role: 'option', 'aria-selected': String(on),
          onclick: () => { pending = on ? null : { k: 'part', src: c }; note = ''; build(); draw(); },
        },
        h('span', { class: 'tile', html: partTileHtml(c.part.f, c.part.t, c.part.q, 'mini'), 'aria-hidden': 'true' }),
        h('span', { class: 'grow' },
          h('span', { class: 't' }, partName(c.part), n > 1 ? h('small', {}, ` ×${n}`) : null),
          h('span', { class: 'd' }, `${cap1('at' in c ? I.describeCell(s, c.at) : `on the ${carById(c.car).model}`)}${c.part.t > cls.cap ? ` · runs at T${cls.cap}` : ''} · free`)),
        h('span', { class: `delta ${d > 0 ? 'up' : d < 0 ? 'down' : 'same'}` }, d ? changeText(k, d) : cur && contributionOn(c.part, cls.cap) === curScore ? 'same' : '±0'));
      })) : h('p', { class: 'd' }, `No spare ${FAMILIES[fam].plural.toLowerCase()} on the bench or rack. Order one below, or merge one on the bench.`);
      // order new for cash
      const maxT = B.orderMaxTier(s);
      const orderTier = pending?.k === 'order' && pending.f === fam ? pending.t : 0;
      const tiers = h('div', { class: 'mech-tiers', role: 'listbox', 'aria-label': `Order a new ${FAMILIES[fam].name}` }, ...Array.from({ length: maxT }, (_, i) => {
        const t = i + 1;
        const price = PART_ORDER_PRICE[t];
        const d = statChange(k, lo.stats[k], loadoutWith(s, car, { [fam]: { id: -1, f: fam, t, q: 'std' } }).stats[k]);
        const on = orderTier === t;
        return h('button', {
          class: `mech-tier${on ? ' on' : ''}${s.cash < price ? ' short' : ''}`, role: 'option', 'aria-selected': String(on),
          style: `--metal:${metalFor(t)}`, 'aria-label': `T${t} ${MATERIAL[t]} ${FAMILIES[fam].name}, $${price}${d ? `, ${changeText(k, d)}` : ''}`,
          onclick: () => { pending = on ? null : { k: 'order', f: fam, t }; note = ''; build(); },
        }, h('b', {}, `T${t}`), h('small', { class: 'mat' }, MATERIAL[t]), h('small', { class: 'num price' }, `$${fmt(price)}`), d > 0 ? h('small', { class: 'up' }, changeText(k, d)) : null);
      }));
      return [
        famTabs(),
        fittedRow,
        h('h3', {}, `${FAMILIES[fam].plural} you own`),
        owned,
        h('h3', {}, fam === 'tires' ? 'Buy new Tires' : `Buy a new ${FAMILIES[fam].name}`),
        h('p', { class: 'd' }, `Cash, delivered and fitted at once. Sold up to T${maxT}; higher tiers are merged on the bench${maxT < cls.cap ? '' : ''}.${room ? '' : ' Your bench and rack are full, so make room first.'}`),
        tiers,
      ];
    };

    /** Body and Paint plus the wheel sets: Paint shop items, previewed on the car before you buy or apply. */
    const styleChip = (s: GameState, it: StyleItem) => {
      const own = S.owned(s, it, car);
      const cur = s.style[car] ?? {};
      const on = (it.kind === 'paint' && s.paints[car] === it.value) || (it.kind === 'wheel' && cur.wheel === it.value)
        || (it.kind === 'material' && cur.material === it.value) || (it.kind === 'livery' && cur.livery === it.value)
        || (it.kind === 'restore' && (cur.restore ?? 0) >= Number(it.value));
      const previewing = pending?.k === 'style' && pending.item.id === it.id;
      return h('button', {
        class: `mech-chip${on ? ' applied' : ''}${previewing ? ' on' : ''}`, 'aria-pressed': String(previewing),
        'aria-label': `${it.name}, ${on ? 'on the car' : own ? 'owned' : `$${it.price}`}`,
        onclick: () => {
          if (on && it.kind === 'restore') return;
          pending = previewing || on ? null : { k: 'style', item: it }; note = ''; build(); draw();
        },
      }, it.kind === 'paint' ? h('span', { class: 'swatch', style: `--paint:${it.value}`, 'aria-hidden': 'true' }) : null,
      h('span', { class: 'stack' }, it.name, h('small', { class: own ? 'own' : 'num' }, on ? (it.kind === 'restore' ? 'Done' : 'On car') : own ? 'Owned' : `$${fmt(it.price)}`)));
    };
    const lockedChip = (name: string, how: string, sw?: string) => h('button', {
      class: 'mech-chip locked', 'aria-disabled': 'true', 'aria-label': `${name}, locked: ${how}`,
      onclick: () => { note = `${name}: ${how}.`; noteBad = false; build(); },
    }, sw ? h('span', { class: 'swatch', style: `--paint:${sw}`, 'aria-hidden': 'true' }) : null, h('span', { class: 'stack' }, `🔒 ${name}`, h('small', {}, how)));
    const factoryChip = (s: GameState, kind: 'wheel' | 'material' | 'livery', name: string) => {
      const on = !(s.style[car] ?? {})[kind];
      const previewing = pending?.k === 'factory' && pending.kind === kind;
      return h('button', {
        class: `mech-chip${on ? ' applied' : ''}${previewing ? ' on' : ''}`, 'aria-pressed': String(previewing),
        onclick: () => { pending = on || previewing ? null : { k: 'factory', kind, name }; note = ''; build(); draw(); },
      }, h('span', { class: 'stack' }, name, h('small', {}, on ? 'On car' : 'Free')));
    };
    const group = (title: string, about: string, chips: (HTMLElement | null)[]) => {
      const list = chips.filter((c): c is HTMLElement => !!c);
      return list.length ? h('div', { class: 'mech-group' }, h('h3', {}, title), h('p', { class: 'd' }, about), h('div', { class: 'mech-chips' }, ...list)) : null;
    };
    const lockText = (it: StyleItem) => purchaseInfo(game.state, `style:${it.id}:${car}`)?.locked ?? `Opens with your ${ordinalWord(it.opens)} car`;
    const kindItems = (s: GameState, kind: StyleItem['kind']) => {
      const open = S.shopItems(s, car).filter((i) => i.kind === kind);
      const locked = STYLE_ITEMS.filter((i) => i.kind === kind && s.owned.length < i.opens && !S.owned(s, i, car) && (kind !== 'restore' || car === 'junker'));
      return [...open.map((i) => styleChip(s, i)), ...locked.slice(0, 3).map((i) => lockedChip(i.name, lockText(i), i.kind === 'paint' ? i.value : undefined))];
    };

    const wheelStyles = (s: GameState) => group('Wheel sets', 'Looks only. Bought once, fits every car.', [factoryChip(s, 'wheel', 'Factory'), ...kindItems(s, 'wheel')]);

    const bodyPanel = (s: GameState): (HTMLElement | null)[] => {
      const cls = carById(car);
      const sig = SIGNATURE_FINISHES[car];
      const curPaint = s.paints[car] ?? null;
      const finish = (name: string, paint: string | null) => {
        const on = (curPaint ?? null) === paint;
        const previewing = pending?.k === 'finish' && pending.paint === paint;
        return h('button', {
          class: `mech-chip${on ? ' applied' : ''}${previewing ? ' on' : ''}`, 'aria-pressed': String(previewing),
          onclick: () => { pending = on || previewing ? null : { k: 'finish', name, paint }; note = ''; build(); draw(); },
        }, h('span', { class: 'swatch', style: `--paint:${paint ?? cls.paint}`, 'aria-hidden': 'true' }), h('span', { class: 'stack' }, name, h('small', {}, on ? 'On car' : 'Earned · free')));
      };
      const finishes = [
        finish('Factory', null),
        ...BLUEPRINT_FINISHES.filter((b) => s.blueprints.includes(b.name)).map((b) => finish(b.name, b.paint)),
        sig && s.livePodiums.includes(car) ? finish(sig.name, sig.paint) : null,
        sig && !s.livePodiums.includes(car) ? lockedChip(sig.name, 'Top 3 in a live race with this car', sig.paint) : null,
        !s.blueprints.includes(RAY_FINISH.name) ? lockedChip(RAY_FINISH.name, 'Beat Rusty Ray in a live race', RAY_FINISH.paint) : null,
        !s.blueprints.includes(CROWN_FINISH.name) && s.owned.includes('muscle') ? lockedChip(CROWN_FINISH.name, 'Win the Coastal Crown in a live race', CROWN_FINISH.paint) : null,
      ];
      return [
        group('Earned finishes', 'Won on the track. Free to apply on any car.', finishes),
        group('Colours', 'Bought once, fits every car.', kindItems(s, 'paint')),
        group('Premium paint', `For the ${cls.model} only. Looks only — no performance.`, [factoryChip(s, 'material', 'Gloss'), ...kindItems(s, 'material')]),
        group('Liveries', 'Stripes, numbers and graphics in a colour that suits the paint. Bought once, fits every car.', [factoryChip(s, 'livery', 'Clean'), ...kindItems(s, 'livery')]),
        car === 'junker' ? group('Tapeback restoration', 'Staged jobs on the Tapeback, in order. Permanent. Paid in cash.', kindItems(s, 'restore')) : null,
        concours(s),
        h('p', { class: 'd' }, 'Your choice shows in the Showroom and on track.'),
      ];
    };

    /** Concours restoration: three scrap-paid stages per car, a Showroom badge at the end. Looks only. */
    const concours = (s: GameState): HTMLElement => {
      const r = PJ.restoreInfo(s, car);
      const pi = purchaseInfo(s, `restore:${car}`);
      const on = pending?.k === 'restore';
      const pips = h('span', { class: 'pips', 'aria-label': `Stage ${r.stage} of ${r.of}` }, ...Array.from({ length: r.of }, (_, i) => h('i', { class: i < r.stage ? 'done' : '' })));
      const row = r.locked
        ? h('div', { class: 'mech-fitted locked' }, h('span', { class: 'tile ico', 'aria-hidden': 'true' }, '🔒'),
          h('div', { class: 'grow' }, h('div', { class: 't' }, 'Concours restoration'), h('div', { class: 'd' }, `${r.locked}. Three stages paid in scrap; the last adds a Concours badge to your Showroom. Looks only.`)))
        : r.maxed
          ? h('div', { class: 'mech-fitted' }, h('span', { class: 'tile ico', 'aria-hidden': 'true' }, '★'),
            h('div', { class: 'grow' }, h('div', { class: 't' }, 'Concours car ', pips), h('div', { class: 'd' }, r.benefit)))
          : h('button', {
            class: `mech-opt${on ? ' on' : ''}`, 'aria-selected': String(on),
            onclick: () => { pending = on ? null : { k: 'restore' }; note = ''; build(); },
          }, h('span', { class: 'tile ico', 'aria-hidden': 'true' }, '✦'),
          h('span', { class: 'grow' }, h('span', { class: 't' }, `${r.name} `, pips), h('span', { class: 'd' }, pi?.benefit ?? r.benefit)),
          h('span', { class: 'num price' }, `${fmt(pi?.price ?? r.cost)} scrap`));
      return h('div', { class: 'mech-group concours' }, h('h3', {}, 'Concours restoration'), row);
    };

    const tuningPanel = (s: GameState): (HTMLElement | null)[] => {
      const stage = s.tune?.[car] ?? 0;
      const tpi = purchaseInfo(s, `tune:${car}`);
      const price = tpi?.price ?? tunePrice(car, stage);
      const on = pending?.k === 'tune';
      const lvl = PJ.buildLevel(s, car);
      const m = PJ.buildMul(s, car);
      const pct = (x: number) => `${Math.round((x - 1) * 1000) / 10}%`;
      const kits = F.fabOpen(s) ? h('details', { class: 'mech-kits' }, h('summary', {}, 'Race-day kits', h('small', {}, 'one race each · paid in scrap')), fabBench(app, build, { title: false })) : null;
      return [
        h('h3', {}, 'Tune-up'),
        h('button', {
          class: `mech-opt tune${on ? ' on' : ''}${stage >= TUNE_STAGES ? ' done' : ''}`, 'aria-selected': String(on),
          onclick: () => { if (stage >= TUNE_STAGES) return; pending = on ? null : { k: 'tune' }; note = ''; build(); },
        },
        h('span', { class: 'tile ico', 'aria-hidden': 'true' }, '⚙'),
        h('span', { class: 'grow' },
          h('span', { class: 't' }, stage < TUNE_STAGES ? `Stage ${stage + 1} of ${TUNE_STAGES}` : `Fully tuned · ${TUNE_STAGES}/${TUNE_STAGES}`),
          h('span', { class: 'd' }, `+2% speed, acceleration and grip per stage, this car only (now +${stage * 2}%). Off in stock-class races.`)),
        stage < TUNE_STAGES ? h('span', { class: 'num price' }, `$${fmt(price)}`) : h('span', { class: 'delta up' }, '✓')),
        h('h3', {}, 'Build Sheet'),
        h('div', { class: 'mech-fitted' },
          h('span', { class: 'tile ico', 'aria-hidden': 'true' }, '▤'),
          h('div', { class: 'grow' },
            h('div', { class: 't' }, `Build Sheet ${lvl}/${PJ.BUILD_LEVEL_MAX}`),
            h('div', { class: 'd' }, PJ.buildsOpen(s) ? (lvl ? `+${pct(m.top)} top, +${pct(m.accel)} accel, +${pct(m.grip)} grip. Donate spare parts for more.` : 'Donate spare parts for a permanent edge.') : 'Opens with the Ironhorse 455.')),
          PJ.buildsOpen(s) ? h('button', { class: 'btn sm', onclick: () => openBuilds(app, car, build) }, 'Open') : null),
        kits,
        h('p', { class: 'd' }, 'Gear ratios are set per car; shift timing in the race is up to you.'),
      ];
    };

    // ---------- the commit bar: one explicit action with its exact price ----------
    const commitBar = (s: GameState): HTMLElement => {
      const cls = carById(car);
      const p = pending;
      const cancel = h('button', { class: 'btn', onclick: () => { pending = null; note = ''; build(); draw(); } }, 'Cancel');
      const bar = (main: HTMLElement, extra?: HTMLElement | null, test?: HTMLElement | null) => h('div', { class: `mech-commit${test ? ' has-test' : ''}` }, main, extra ?? null, test ?? null, cancel);
      // 1.10 Test & Compare: drive the previewed part (owned, or a tier to order) against the current build first
      const testBtn = (opts: TestDriveOpts) => h('button', { class: 'btn test', 'aria-label': 'Test it on track against your current build', onclick: () => openTestDrive(app, { car, ...opts }) },
        h('span', { class: 'stack' }, 'Test', h('small', {}, 'vs now')));
      const primary = (label: string, sub: string, ok: boolean, run: () => void, aria?: string) => h('button', {
        class: `btn primary go${ok ? '' : ' off'}`, 'aria-disabled': String(!ok), 'aria-label': aria ?? `${label}. ${sub}`, onclick: run,
      }, h('span', { class: 'stack' }, label, h('small', {}, sub)));
      if (p?.k === 'part') {
        const src = p.src;
        const cur = I.fitted(s, car)[src.part.f] ?? null;
        const where = 'at' in src
          ? (cur ? `Free · your ${partName(cur)} goes to ${I.describeCell(s, src.at)}` : `Free · frees ${I.describeCell(s, src.at)}`)
          : (cur ? `Free · the ${carById(src.car).model} gets your ${partName(cur)}` : `Free · leaves the ${carById(src.car).model}'s slot empty`);
        return bar(primary(`Install ${partName(src.part)}`, where, true, () => act(() => game.transact((d) => I.fitFrom(d, car, src)), () => gsfx.fit(src.part.t))),
          null, 'at' in src ? testBtn({ family: src.part.f, partId: src.part.id }) : testBtn({ family: src.part.f, tier: src.part.t }));
      }
      if (p?.k === 'order') {
        const price = PART_ORDER_PRICE[p.t];
        const scrap = scrapOrderCost(p.t);
        const short = price - s.cash;
        const sShort = scrap - s.scrap;
        const full = !B.firstFree(s);
        const cur = I.fitted(s, car)[p.f] ?? null;
        const t = p.t;
        const buy = (pay: 'cash' | 'scrap') => {
          if (full) { note = FULL_BUY; noteBad = true; gsfx.invalid(); build(); return; }
          const miss = pay === 'cash' ? (short > 0 ? `$${fmt(short)}` : '') : (sShort > 0 ? `${fmt(sShort)} scrap` : '');
          if (miss) { note = `Need ${miss} more for the T${t} ${FAMILIES[p.f].name}.`; noteBad = true; gsfx.invalid(); build(); return; }
          act(() => game.transact((d) => orderAndFit(d, car, p.f, t, pay)), () => { sfx.cash(); gsfx.fit(t); }, pay === 'cash' ? `−$${fmt(price)}.` : `−${fmt(scrap)} scrap.`);
        };
        const sub = full ? 'Bench full — make room first' : short > 0 ? `$${fmt(short)} more cash needed` : `Cash${cur ? ` · your ${partName(cur)} goes to the bench` : ''}${t > cls.cap ? ` · runs at T${cls.cap}` : ''}`;
        const scrapBtn = h('button', {
          class: `btn alt${full || sShort > 0 ? ' off' : ''}`, 'aria-disabled': String(full || sShort > 0),
          'aria-label': `Buy and install a T${t} ${FAMILIES[p.f].name} for ${scrap} scrap`, onclick: () => buy('scrap'),
        }, h('span', { class: 'stack' }, `${fmt(scrap)} scrap`, h('small', {}, sShort > 0 ? `${fmt(sShort)} more` : 'or pay scrap')));
        return bar(primary(`Buy & install · $${fmt(price)}`, sub, !full && short <= 0, () => buy('cash'), `Buy and install a T${t} ${FAMILIES[p.f].name} for $${price}`), scrapBtn, testBtn({ family: p.f, tier: t }));
      }
      if (p?.k === 'style') {
        const it = p.item;
        const own = S.owned(s, it, car);
        const short = it.price - s.cash;
        const scope = it.kind === 'material' ? `this car only` : it.kind === 'restore' ? 'permanent' : 'fits every car';
        if (own) return bar(primary(`Apply ${it.name}`, 'Owned · free', true, () => { game.applyStyle(it.id, car); sfx.place(); pending = null; note = `${it.name} on your ${cls.model}.`; noteBad = false; build(); draw(); }));
        return bar(primary(`Buy ${it.name} · $${fmt(it.price)}`, short > 0 ? `$${fmt(short)} more cash needed` : `Cash · ${scope} · looks only`, short <= 0, () => {
          if (short > 0) { note = `Need $${fmt(short)} more for ${it.name}.`; noteBad = true; gsfx.invalid(); build(); return; }
          const ev = game.buyStyle(it.id, car);
          if (ev.some((e) => e.type === 'styleBought')) { sfx.cash(); pending = null; note = `${it.name} on your ${cls.model} · −$${fmt(it.price)}.`; noteBad = false; }
          build(); draw();
        }));
      }
      if (p?.k === 'finish') {
        const paint = p.paint;
        return bar(primary(`Apply ${p.name}`, 'Earned · free', true, () => { game.setPaint(car, paint); sfx.place(); pending = null; note = `${p.name} on your ${cls.model}.`; noteBad = false; build(); draw(); }));
      }
      if (p?.k === 'factory') {
        const kind = p.kind;
        return bar(primary(`Apply ${p.name}`, 'Free', true, () => { game.applyStyle(null, car, kind); sfx.place(); pending = null; note = `${p.name} on your ${cls.model}.`; noteBad = false; build(); draw(); }));
      }
      if (p?.k === 'restore') {
        const r = PJ.restoreInfo(s, car);
        const short = r.cost - s.scrap;
        return bar(primary(`Restore: ${r.name} · ${fmt(r.cost)} scrap`, short > 0 ? `${fmt(short)} more scrap needed` : `Scrap · stage ${r.stage + 1} of ${r.of} · looks only`, short <= 0 && !r.locked && !r.maxed, () => {
          if (short > 0) { note = `Need ${fmt(short)} more scrap for ${r.name}.`; noteBad = true; gsfx.invalid(); build(); return; }
          act(() => game.transact((d) => PJ.restoreCar(d, car)), () => sfx.polished(), `${cls.model}: ${r.name} done · −${fmt(r.cost)} scrap.${r.stage + 1 >= r.of ? ' Concours badge added to your Showroom.' : ''}`);
        }));
      }
      if (p?.k === 'tune') {
        const stage = s.tune?.[car] ?? 0;
        const price = tunePrice(car, stage);
        const short = price - s.cash;
        return bar(primary(`Tune to stage ${stage + 1} · $${fmt(price)}`, short > 0 ? `$${fmt(short)} more cash needed` : 'Cash · this car only', short <= 0, () => {
          if (short > 0) { note = `Need $${fmt(short)} more for the Tune-up.`; noteBad = true; gsfx.invalid(); build(); return; }
          act(() => game.buyTune(car), () => sfx.cash(), `${cls.model} tuned to stage ${stage + 1} · −$${fmt(price)}.`);
        }));
      }
      // nothing chosen: the recommended fit, or a hint
      if (AREA_FAMS[area].length || area === 'tuning') {
        const rec = I.previewRecommended(s, car);
        const n = Object.keys(rec.rec).length;
        const gain = statSummary(rec.before, rec.after);
        return h('div', { class: 'mech-commit' }, h('button', {
          class: `btn primary go${n ? '' : ' off'}`, 'aria-disabled': String(!n), 'data-coach': 'fit-recommended',
          onclick: () => {
            if (!n) { note = 'Best parts already fitted. Merge higher tiers to improve this car.'; noteBad = false; build(); return; }
            act(() => game.fitRecommended(car), () => gsfx.recommended());
          },
        }, h('span', { class: 'stack' }, n ? 'Recommended fit' : 'Best parts fitted', h('small', {}, n ? `Free · ${gain || `${n} part${n > 1 ? 's' : ''}`}` : 'Pick a part above to compare'))));
      }
      return h('div', { class: 'mech-commit hint' }, h('p', { class: 'd' }, 'Tap a finish to see it on the car before you buy or apply it.'));
    };

    const build = () => {
      const s = game.state;
      if (!s.owned.includes(car)) car = s.activeCar;
      const cls = carById(car);
      body.dataset.area = area;
      const cars = s.owned.length > 1 ? h('div', { class: 'mech-cars', role: 'tablist', 'aria-label': 'Car to service' }, ...s.owned.map((id) => h('button', {
        class: `chipbtn${id === car ? ' on' : ''}`, role: 'tab', 'aria-selected': String(id === car),
        onclick: () => { car = id; pending = null; note = ''; fam = AREA_FAMS[area].length ? (AREA_FAMS[area].includes(defaultFamily(s, id)) ? defaultFamily(s, id) : AREA_FAMS[area][0]) : fam; stopPreview(); build(); draw(); },
      }, carById(id).model, id === s.activeCar ? h('small', {}, ' · racing') : null))) : null;
      const st = I.slotStatus(s, car);
      const tabs = h('div', { class: 'mech-areas', role: 'tablist', 'aria-label': 'Service area' }, ...AREAS.map((a) => {
        const badge = AREA_FAMS[a.id].some((f) => st.better.includes(f) || (st.empty.includes(f) && st.rec[f]));
        return h('button', {
          class: `seg${a.id === area ? ' on' : ''}`, role: 'tab', 'aria-selected': String(a.id === area), 'data-area': a.id,
          onclick: () => setArea(a.id),
          'aria-label': a.label,
        }, h('span', { class: 'ai', 'aria-hidden': 'true' }, a.icon), h('span', { class: 'al' }, a.short), badge ? h('span', { class: 'dot', 'aria-label': ', a better part is ready' }) : null);
      }));
      const panel = area === 'body' ? bodyPanel(s) : area === 'tuning' ? tuningPanel(s) : [...partsPanel(s), area === 'wheels' ? wheelStyles(s) : null];
      body.replaceChildren(...[
        // sticky top: the car and the area tabs stay in view while the list scrolls
        h('div', { class: 'mech-top' },
          h('div', { class: 'mech-head' },
            h('div', { class: 'grow' }, h('h2', {}, 'Mechanic Shop'), h('p', { class: 'd' }, `${cls.model} · parts up to T${cls.cap}`)),
            h('span', { class: 'chip cash num', 'aria-label': `Cash $${s.cash}` }, `$${fmt(s.cash)}`),
            h('button', { class: 'btn sm close', onclick: close, 'aria-label': ret?.label ? `Back to ${ret.label}` : 'Close the Mechanic Shop' }, ret?.label ? `Back to ${ret.label}` : 'Close')),
          bay, tabs),
        cars,
        h('section', { class: 'mech-panel', 'aria-label': AREAS.find((a) => a.id === area)!.label }, ...panel.filter((x): x is HTMLElement => !!x)),
        // sticky foot: the stat preview, what just happened, and the one explicit action with its price
        h('div', { class: 'mech-foot' },
          stats(s),
          h('p', { class: `mech-note${noteBad ? ' bad' : ''}`, role: 'status' }, note),
          commitBar(s)),
      ].filter((x): x is HTMLElement => !!x));
      requestAnimationFrame(draw);
    };
    build();
    animate();
    onResize = () => draw();
    window.addEventListener('resize', onResize);
    return body;
  }, () => {
    cancelAnimationFrame(raf);
    if (onResize) window.removeEventListener('resize', onResize);
    stopPreview();
    ret?.run();
  });
}

/** Start on the slot that most needs attention: empty with a part ready, then improvable, then engine. */
function defaultFamily(s: GameState, car: CarId): Family {
  const st = I.slotStatus(s, car);
  return st.empty.find((f) => st.rec[f]) ?? st.better[0] ?? st.empty[0] ?? ACTIVE_FAMILIES[0];
}
