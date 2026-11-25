import { FAMILIES, Family, Quality } from '../data/tables';

// Original part illustrations as inline SVG. Tier changes the metal finish so tiers read at a glance
// even before the numeral; the numeral stays large for legibility on a five-column phone grid.

// A distinct metal per tier — iron, copper, blue steel, gold, chrome, teal titanium, violet — so neighbouring
// tiers never share a colour (the art review found T3, T5 and T6 all read as pale silver).
const METAL = ['#000', '#8d8478', '#c0763e', '#7fa7c9', '#e5b94c', '#eef1f4', '#4fd1ad', '#c58cff', '#f9a', '#fd6', '#fff'];
const METAL_DARK = ['#000', '#4c463f', '#6a3d1d', '#33536e', '#8a6418', '#6f7c8c', '#1d6b56', '#5a2f8f', '#734', '#863', '#999'];

function engine(m: string, d: string, acc: string) {
  return `<rect x="14" y="22" width="36" height="26" rx="4" fill="${m}" stroke="${d}" stroke-width="2.5"/>
  <rect x="19" y="14" width="26" height="9" rx="2" fill="${d}"/>
  <rect x="22" y="10" width="5" height="6" rx="1" fill="${m}"/><rect x="30" y="10" width="5" height="6" rx="1" fill="${m}"/><rect x="38" y="10" width="5" height="6" rx="1" fill="${m}"/>
  <path d="M18 29h28M18 35h28M18 41h28" stroke="${d}" stroke-width="2"/>
  <rect x="6" y="28" width="8" height="12" rx="2" fill="${acc}"/><rect x="50" y="30" width="7" height="8" rx="2" fill="${d}"/>`;
}
function tires(m: string, d: string, acc: string) {
  return `<circle cx="32" cy="32" r="22" fill="#1e1b19" stroke="${d}" stroke-width="2"/>
  <circle cx="32" cy="32" r="22" fill="none" stroke="#3a3430" stroke-width="5" stroke-dasharray="4 4"/>
  <circle cx="32" cy="32" r="12" fill="${m}" stroke="${d}" stroke-width="2"/>
  <path d="M32 21v22M21 32h22M24 24l16 16M40 24L24 40" stroke="${d}" stroke-width="2.4"/>
  <circle cx="32" cy="32" r="4" fill="${acc}"/>`;
}
function turbo(m: string, d: string, acc: string) {
  return `<path d="M32 12a20 20 0 1 1-19.6 24H24a9 9 0 1 0 8-12z" fill="${m}" stroke="${d}" stroke-width="2.5"/>
  <circle cx="32" cy="32" r="7" fill="${d}"/><path d="M32 26l2 6-2 6-2-6z" fill="${acc}"/>
  <rect x="6" y="36" width="12" height="9" rx="2" fill="${m}" stroke="${d}" stroke-width="2"/>
  <rect x="44" y="8" width="10" height="10" rx="2" fill="${acc}" stroke="${d}" stroke-width="2"/>`;
}

const DRAW: Partial<Record<Family, (m: string, d: string, acc: string) => string>> = { engine, tires, turbo };

export function partSvg(f: Family, t: number, q: Quality): string {
  const m = METAL[t] ?? '#ccc';
  const d = METAL_DARK[t] ?? '#555';
  const acc = FAMILIES[f].color;
  const art = (DRAW[f] ?? engine)(m, d, acc);
  const shine = q !== 'std'
    ? `<path d="M8 10 L22 10 L10 54 L4 54Z" fill="#fff" opacity="${q === 'mint' ? 0.35 : 0.22}"/>`
    : '';
  return `<svg viewBox="0 0 64 64" aria-hidden="true" class="part-art">${art}${shine}</svg>`;
}

export function familyIcon(f: Family): string {
  return partSvg(f, 3, 'std');
}
