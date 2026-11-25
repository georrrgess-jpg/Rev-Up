type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined | null>;
type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function fmt(n: number): string {
  const down = (v: number, d: number) => (Math.floor(v * 10 ** d) / 10 ** d).toFixed(d);
  if (n >= 1e6) return `${down(n / 1e6, n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e4) return `${down(n / 1e3, n >= 1e5 ? 0 : 1)}k`;
  return Math.floor(n).toLocaleString('en-US');
}

export function durationText(s: number): string {
  const m = Math.floor(s / 60);
  const hh = Math.floor(m / 60);
  if (hh > 0) return `${hh} h ${m % 60} min`;
  if (m > 0) return `${m} min`;
  return `${Math.round(s)} s`;
}

export const ordinal = (n: number) => ['1st', '2nd', '3rd', '4th'][n - 1] ?? `${n}th`;
