// Rev Up icon set: one cohesive family of inline SVGs for the controls players use most. Every icon is drawn on a
// 24 × 24 grid with a 2 px round-capped stroke in currentColor (so it takes the button's colour and state), with a
// few solid accents where a silhouette needs weight to read at 16–24 px on a phone. No emoji, no glyph fonts.
import { h } from './dom';

export type IconName =
  | 'garage' | 'race' | 'flag' | 'showroom' | 'settings' | 'help' | 'cash' | 'scrap' | 'rep' | 'crate' | 'shop'
  | 'merge' | 'fit' | 'store' | 'recycle' | 'nitro' | 'pit' | 'test' | 'pause' | 'close' | 'prev' | 'next'
  | 'inspect' | 'paint' | 'compare' | 'jobs' | 'lock' | 'check' | 'car' | 'trophy' | 'play' | 'spares';

/** Path data per icon (stroked unless the element says fill). */
const P: Record<IconName, string> = {
  // a garage: pitched roof over a roll-up door
  garage: '<path d="M3 10.5 12 4l9 6.5V20H3z"/><path d="M7 20v-7h10v7M7 15.5h10M7 18h10"/>',
  // a chequered flag on a pole
  race: '<path d="M5 21V3.5"/><path d="M5 4h14v9H5" stroke-width="1.6"/><path d="M5 4h4.7v4.5H5zM14.3 4H19v4.5h-4.7zM9.7 8.5h4.6V13H9.7z" fill="currentColor" stroke="none"/>',
  flag: '<path d="M5 21V3.5"/><path d="M5 4h14v9H5" stroke-width="1.6"/><path d="M5 4h4.7v4.5H5zM14.3 4H19v4.5h-4.7zM9.7 8.5h4.6V13H9.7z" fill="currentColor" stroke="none"/>',
  // a car on a turntable under a spotlight
  showroom: '<path d="M2.5 13.5h19v-2.6l-3-1.1-2.8-3.6H8.4L5.3 9.8l-2.8 1.1z"/><circle cx="7" cy="13.8" r="2" fill="currentColor"/><circle cx="17" cy="13.8" r="2" fill="currentColor"/><path d="M2.5 18.5c4 2 15 2 19 0"/>',
  settings: '<path d="M18.9 9.3L21.4 10.1L21.4 13.9L18.9 14.7L18.8 14.9L20 17.3L17.3 20L14.9 18.8L14.7 18.9L13.9 21.4L10.1 21.4L9.3 18.9L9.1 18.8L6.7 20L4 17.3L5.2 14.9L5.1 14.7L2.6 13.9L2.6 10.1L5.1 9.3L5.2 9.1L4 6.7L6.7 4L9.1 5.2L9.3 5.1L10.1 2.6L13.9 2.6L14.7 5.1L14.9 5.2L17.3 4L20 6.7L18.8 9.1z" stroke-width="1.7"/><circle cx="12" cy="12" r="3.2"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.4 9.4a2.7 2.7 0 1 1 3.8 2.5c-.8.4-1.2 1-1.2 1.9v.5"/><circle cx="12" cy="17.2" r="1.1" fill="currentColor" stroke="none"/>',
  // a coin with a dollar sign
  cash: '<circle cx="12" cy="12" r="9"/><path d="M14.8 8.6c-.6-.8-1.6-1.2-2.8-1.2-1.6 0-2.8.8-2.8 2.1 0 2.9 5.8 1.5 5.8 4.6 0 1.3-1.2 2.2-3 2.2-1.3 0-2.4-.5-3-1.4M12 5.8v1.6M12 16.3v1.9"/>',
  // a hex nut: salvaged metal
  scrap: '<path d="M12 3 19.8 7.5v9L12 21l-7.8-4.5v-9z"/><circle cx="12" cy="12" r="3.3"/>',
  // a five-point star: earned reputation
  rep: '<path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8 6.6 19.7l1.1-6.1-4.5-4.2 6.1-.8z" fill="currentColor" fill-opacity=".22"/>',
  // a crate with planks
  crate: '<path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z"/><path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9"/><path d="m7.7 5.5 8.5 4" stroke-width="1.6"/>',
  // a storefront with an awning
  shop: '<path d="M4 10v10h16V10"/><path d="M3 10 4.5 4h15L21 10c0 1.4-1.1 2.3-2.4 2.3S16.2 11.4 16.2 10c0 1.4-1.1 2.3-2.4 2.3S11.4 11.4 11.4 10M3 10c0 1.4 1.1 2.3 2.4 2.3S7.8 11.4 7.8 10c0 1.4 1.1 2.3 2.4 2.3"/><path d="M10 20v-4.5h4V20"/>',
  // two arrows joining into one
  merge: '<rect x="3" y="3" width="6.5" height="6.5" rx="1.4"/><rect x="14.5" y="3" width="6.5" height="6.5" rx="1.4"/><path d="m7 10.5 3.2 4M17 10.5l-3.2 4"/><rect x="8" y="14.5" width="8" height="7" rx="1.6" fill="currentColor" fill-opacity=".25"/>',
  // a spanner
  fit: '<path d="M14.6 4.2a4.4 4.4 0 0 0-5 5.9L3.8 15.9a1.9 1.9 0 0 0 2.7 2.7l5.8-5.8a4.4 4.4 0 0 0 5.9-5l-2.7 2.7-2.4-.4-.4-2.4z"/>',
  // a shelf holding two boxes
  store: '<path d="M3 20.5h18M4 20.5V3.5M20 20.5V3.5M4 12h16"/><rect x="6.5" y="6.5" width="5" height="5.5" rx=".6"/><rect x="13" y="14.8" width="5" height="5.7" rx=".6"/>',
  spares: '<path d="M3 20.5h18M4 20.5V3.5M20 20.5V3.5M4 12h16"/><rect x="6.5" y="6.5" width="5" height="5.5" rx=".6"/><rect x="13" y="14.8" width="5" height="5.7" rx=".6"/>',
  // two chasing arrows
  recycle: '<path d="M19.5 9.5A8 8 0 0 0 5.2 7.3"/><path d="m4.5 3.6.7 3.7 3.7-.7"/><path d="M4.5 14.5a8 8 0 0 0 14.3 2.2"/><path d="m19.5 20.4-.7-3.7-3.7.7"/>',
  // a lightning bolt
  nitro: '<path d="M13.5 2.5 5 13.5h6.2l-1 8L19 10.5h-6.2z" fill="currentColor" fill-opacity=".22"/>',
  // a wheel and tyre: Pit Setup
  pit: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.3"/><path d="M12 10V6.7M13.9 11.4l3.1-1M13.2 13.6l1.9 2.7M10.8 13.6l-1.9 2.7M10.1 11.4 7 10.4" stroke-width="1.6"/>',
  // a stopwatch: Test & Compare
  test: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M10 2.5h4M12 2.5V6M18.2 6.8l1.5-1.5"/>',
  pause: '<rect x="6.5" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="13.9" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  prev: '<path d="M15 4.5 7.5 12l7.5 7.5"/>',
  next: '<path d="M9 4.5 16.5 12 9 19.5"/>',
  // an eye: look the car over
  inspect: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  // a spray can
  paint: '<rect x="6.5" y="9" width="9" height="12" rx="1.6"/><path d="M9 9V6.5h4V9M11 6.5V4.5h3M17.5 4.5h.01M19.5 6.5h.01M19.5 2.5h.01M17.5 8.5h.01" /><path d="M6.5 13h9" stroke-width="1.6"/>',
  // three bars
  compare: '<path d="M5 20V11M12 20V4M19 20v-6"/><path d="M3 20.5h18" stroke-width="1.6"/>',
  // a clipboard with ticks
  jobs: '<rect x="5" y="4.5" width="14" height="16.5" rx="2"/><path d="M9 4.5V3h6v1.5"/><path d="m8.3 11 1.4 1.4 2.5-2.6M8.3 16.2l1.4 1.4 2.5-2.6M14 11h2M14 16h2"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  car: '<path d="M3 15.5h18v-2.4l-2.8-1-2.6-3.6H8.8l-3 3.6-2.8 1z"/><circle cx="7.6" cy="15.8" r="1.9" fill="currentColor"/><circle cx="16.4" cy="15.8" r="1.9" fill="currentColor"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5M12 14v3.5M8 21h8M9.5 17.5h5V21h-5z"/>',
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>',
};

/** The SVG markup for an icon (aria-hidden: the button or label beside it carries the words). */
export function iconSvg(name: IconName, cls = ''): string {
  return `<svg class="ico-svg${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[name]}</svg>`;
}

/** An icon as an element (a span wrapping the SVG, so it can sit in flex rows and take a class). */
export function icon(name: IconName, cls = ''): HTMLElement {
  return h('span', { class: `ico i-${name}${cls ? ` ${cls}` : ''}`, 'aria-hidden': 'true', html: iconSvg(name) });
}

/** Every icon name (the art sheet and the layout check list them). */
export const ICON_NAMES = Object.keys(P) as IconName[];
