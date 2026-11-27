// Build Sheet UI (Scrap & surplus): per car, the Engine / Chassis / Intake builds with their stages, and every spare
// part that can go into them, with exactly what it adds (and what recycling it would pay instead). Rules:
// core/projects.ts. Opened from Fit Parts, the Shop's Scrap tab and Keep / Recycle.
import './css/workshop.css';
import { sfx } from '../audio';
import * as P from '../core/progression';
import * as PJ from '../core/projects';
import type { Part } from '../core/state';
import { BUILDS_OPEN_CARS, BUILD_POINTS_BY_REL, BUILD_STAGE_NAMES, BUILD_STAGE_SEAL } from '../data/fabrication';
import { ACTIVE_FAMILIES, CarId, FAMILIES, MAX_TIER, SCRAP_VALUE, carById, polishCost } from '../data/tables';
import { partTileHtml } from '../render/parts';
import type { App } from './app';
import { h } from './dom';

const qName = (p: Part) => (p.q === 'mint' ? ' · Mint' : p.q === 'polished' ? ' · Polished' : '');

export function openBuilds(app: App, car: CarId = app.game.state.activeCar, onDone?: () => void): () => void {
  let cur: CarId = app.game.state.owned.includes(car) ? car : app.game.state.activeCar;
  let note = '';
  return app.sheet((close) => {
    const body = h('div', { class: 'builds workshop' });
    const build = () => {
      const s = app.game.state;
      if (!s.owned.includes(cur)) cur = s.activeCar;
      const cls = carById(cur);
      if (!PJ.buildsOpen(s)) {
        body.replaceChildren(h('button', { class: 'btn sm close', onclick: close }, 'Close'), h('h2', {}, 'Build Sheets'),
          h('p', { class: 'd' }, `Each car gets an Engine, Chassis and Intake build that permanently absorbs your spare parts. Opens with your ${BUILDS_OPEN_CARS}th car.`));
        return;
      }
      const chips = h('div', { class: 'fit-cars', role: 'tablist', 'aria-label': 'Car' }, ...[...s.owned].sort((x, y) => carById(y).cap - carById(x).cap).map((id) => h('button', {
        class: `chipbtn${id === cur ? ' on' : ''}`, role: 'tab', 'aria-selected': String(id === cur),
        onclick: () => { cur = id; note = ''; build(); },
      }, carById(id).model, h('small', {}, ` ${PJ.buildLevel(s, id)}/${PJ.BUILD_LEVEL_MAX}`))));

      const tracks = ACTIVE_FAMILIES.map((f) => {
        const v = PJ.trackView(s, cur, f);
        const pips = h('div', { class: 'pips', 'aria-label': `Stage ${v.stage} of ${PJ.BUILD_STAGES}` }, ...BUILD_STAGE_NAMES.map((n, i) =>
          h('span', { class: `pip${i < v.stage ? ' done' : ''}${BUILD_STAGE_SEAL[i] === 2 ? ' mint' : BUILD_STAGE_SEAL[i] === 1 ? ' pol' : ''}`, title: n })));
        return h('div', { class: `track${v.max ? ' max' : ''}`, 'data-family': f },
          h('div', { class: 'tr-head' }, h('b', {}, v.name), h('span', { class: 'tr-stage' }, v.stage ? PJ.stageName(v.stage) : 'Stock'), pips),
          v.max
            ? h('div', { class: 'd' }, `Complete · +${PJ.bonusWord(f, v.bonus)}`)
            : h('div', { class: 'tr-bar' }, h('i', { style: `width:${Math.round((v.into / v.need) * 100)}%` })),
          v.max ? null : h('div', { class: 'd' }, `${v.into}/${v.need} pts to ${BUILD_STAGE_NAMES[v.stage]}${v.sealNeed ? ` · needs a ${v.sealNeed === 2 ? 'Mint' : 'Polished'} ${FAMILIES[f].name} donor` : ''} · now +${PJ.bonusWord(f, v.bonus)} → +${PJ.bonusWord(f, v.nextBonus)}`));
      });

      // donors: every bench / rack part this car's builds can take, best first
      const spares = [...s.board, ...s.tray].filter((p): p is Part => !!p);
      // a part that is still a better fit or a craft ingredient is listed last, with that use named
      const useOf = new Map(P.spareParts(s).map((u) => [u.part.id, u.uses.find((x) => x.kind === 'fit' || x.kind === 'craft')?.text ?? null] as const));
      const donors = spares.map((p) => ({ p, d: PJ.donatePreview(s, p, cur) })).filter((x) => x.d)
        .sort((a, b) => Number(!!useOf.get(a.p.id)) - Number(!!useOf.get(b.p.id)) || (b.d!.stageAfter - b.d!.stageBefore) - (a.d!.stageAfter - a.d!.stageBefore) || b.d!.used - a.d!.used || a.p.t - b.p.t);
      const fav = new Set(s.favorites ?? []);
      const donorRow = ({ p, d }: { p: Part; d: PJ.DonateTarget | null }) => {
        const name = `T${p.t} ${FAMILIES[p.f].name}${qName(p)}`;
        const v = PJ.trackView(s, cur, p.f);
        const polish = p.q === 'std' && v.sealNeed === 1 && s.scrap >= polishCost(p.t);
        return h('div', { class: 'spare-row donor', 'data-part': String(p.id) },
          h('span', { class: 'spare-tile', html: partTileHtml(p.f, p.t, p.q), 'aria-hidden': 'true' }),
          h('div', { class: 'grow' },
            h('div', { class: 't' }, name, fav.has(p.id) ? h('span', { class: 'where' }, ' · ★ starred') : null),
            h('div', { class: 'd up' }, d!.text),
            useOf.get(p.id) ? h('div', { class: 'd warn' }, `Still useful — ${useOf.get(p.id)}`) : null,
            h('div', { class: 'd' }, `or recycle for ${SCRAP_VALUE[p.t]} scrap`),
            polish ? h('div', { class: 'd' }, `Polish it first (${polishCost(p.t)} scrap): counts 1.5× and unlocks ${BUILD_STAGE_NAMES[v.stage]}`) : null),
          h('div', { class: 'spare-btns' },
            polish ? h('button', { class: 'btn sm', onclick: () => { app.game.polishPart(p.id); build(); } }, h('span', { class: 'stack' }, 'Polish', h('small', {}, `${polishCost(p.t)}`))) : null,
            h('button', {
              class: 'btn sm primary', 'aria-label': `Donate the ${name} to the ${cls.model}: ${d!.text}`,
              onclick: () => {
                const ev = app.game.donatePart(p.id, cur);
                const e = ev.find((x) => x.type === 'donate');
                if (e && e.type === 'donate') {
                  if (e.stageUp) sfx.polished(); else sfx.place();
                  note = e.stageUp ? `${cls.model} ${PJ.trackView(app.game.state, cur, p.f).name}: ${PJ.stageName(e.stage)}!` : `+${e.pts} pts to the ${cls.model}`;
                }
                build(); onDone?.();
              },
            }, h('span', { class: 'stack' }, 'Donate', h('small', {}, `+${d!.used}`)))));
      };
      const pts = BUILD_POINTS_BY_REL;
      body.replaceChildren(...([
        h('button', { class: 'btn sm close', onclick: close }, 'Close'),
        h('h2', {}, `Build Sheet · ${cls.model}`),
        h('p', { class: 'd' }, `Donate spare parts to make this car faster for good. Build level ${PJ.buildLevel(s, cur)}/${PJ.BUILD_LEVEL_MAX}. Stock-class races ignore it, like Tune-ups.`),
        s.owned.length > 1 ? chips : null,
        h('div', { class: 'tracks' }, ...tracks),
        h('p', { class: 'build-note', role: 'status' }, note),
        h('h3', {}, donors.length ? `Spares it can take · ${donors.length}` : 'Spares it can take'),
        donors.length ? null : h('p', { class: 'd' }, `No spare fits these builds: they take T${cls.cap - 1} or better (fitted parts never count). Merge or order one, or pick another car.`),
        ...donors.slice(0, 12).map(donorRow),
        h('p', { class: 'd rules' }, `Points on the ${cls.model} (cap T${cls.cap}): ${[-1, 0, 1, 2].filter((r) => cls.cap + r <= MAX_TIER).map((r) => `T${cls.cap + r}${r === 2 ? '+' : ''} ${pts[r]}`).join(' · ')} · Polished ×1.5 · Mint ×2. Stage 3 needs a Polished donor, stage 4 a Mint one. Donated parts are gone for good.`),
      ] as (HTMLElement | null)[]).filter((x): x is HTMLElement => !!x));
    };
    build();
    return body;
  }, onDone);
}
