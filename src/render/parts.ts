import { FAMILIES, Family, Quality } from '../data/tables';

// Original part illustrations as inline SVG (viewBox 64×64).
//
// Readability rules, smallest board cell first (~36 px, art ≈ 28 px):
// - Each family has its own silhouette: engines are a wide square block, tires a full circle, turbos a
//   snail scroll with an outlet pipe. These never change with tier, so the family reads before the detail.
// - Each tier adds new hardware on top of the silhouette (single carb → twin carbs → twin cams → intercooler →
//   V-block with velocity stacks → blower → V12 plenum with twin turbos → hybrid motor → prototype light-blade
//   core) and its own metal, so a higher tier looks more capable even before the numeral is read.
// - Quality is one consistent marker in the top-right corner: a silver diamond (Polished) or a gold star (Mint),
//   plus a sheen. The tier numeral is drawn by the tile (HTML, scales with text size) or on request here.

/** Metal per tier (index = tier): iron, copper, blue steel, gold, chrome, teal titanium, violet, crimson carbon, plasma. */
export const METAL = ['#000', '#8d8478', '#c0763e', '#7fa7c9', '#e5b94c', '#eef1f4', '#4fd1ad', '#c58cff', '#ff6b7d', '#8af6ff', '#ffffff'];
export const METAL_DARK = ['#000', '#4c463f', '#6a3d1d', '#33536e', '#8a6418', '#6f7c8c', '#1d6b56', '#5a2f8f', '#7a1626', '#155e74', '#8a8f99'];
/** Short material name per tier, for labels and accessibility. */
export const MATERIAL = ['', 'Iron', 'Copper', 'Blue steel', 'Gold', 'Chrome', 'Titanium', 'Violet alloy', 'Carbon', 'Plasma', 'Prism'];

const tierIdx = (t: number) => Math.max(1, Math.min(10, Math.round(t)));
export const metalFor = (t: number) => METAL[tierIdx(t)];
export const metalDarkFor = (t: number) => METAL_DARK[tierIdx(t)];

interface Ink { m: string; d: string; acc: string; t: number }

const CARBON = '#24262c';
const GLOW = '#8af6ff';
/** T10 "Prism": an iridescent gradient (defined once per SVG in partSvg) instead of a flat metal. */
// Each SVG gets its own gradient id: a url(#id) that resolves into a hidden SVG elsewhere would paint nothing.
let prismN = 0;
let PRISM = 'url(#rvPrism0)';
const prismDefs = (id: string) => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6fc0"/><stop offset=".28" stop-color="#ffd85a"/><stop offset=".52" stop-color="#7dffb8"/><stop offset=".76" stop-color="#6fd0ff"/><stop offset="1" stop-color="#b58cff"/></linearGradient></defs>`;
/** T10 halo: a starburst of prism rays behind the part. */
function prismHalo(): string {
  let p = '';
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; p += `M${(32 + Math.cos(a) * 14).toFixed(1)} ${(32 + Math.sin(a) * 14).toFixed(1)}L${(32 + Math.cos(a) * 31).toFixed(1)} ${(32 + Math.sin(a) * 31).toFixed(1)}`; }
  return `<circle cx="32" cy="32" r="29" fill="${PRISM}" opacity=".16"/><path d="${p}" stroke="${PRISM}" stroke-width="2.4" stroke-linecap="round" opacity=".55"/>`;
}

// ---------------------------------------------------------------- engines (wide block silhouette)

function engine({ m, d, acc, t }: Ink): string {
  const out: string[] = [];
  const vee = t >= 5;
  // exhaust stub (left) and pulley (right) frame the block at every tier
  out.push(`<rect x="3" y="32" width="9" height="8" rx="2" fill="${d}"/>`);
  out.push(`<circle cx="56" cy="38" r="${t >= 3 ? 5 : 4}" fill="${d}" stroke="${m}" stroke-width="1.5"/>`);
  if (!vee) {
    // inline block
    out.push(`<rect x="10" y="26" width="44" height="26" rx="4" fill="${m}" stroke="${d}" stroke-width="2.5"/>`);
    out.push(`<path d="M15 34h34M15 41h34" stroke="${d}" stroke-width="2"/>`);
    out.push(`<rect x="16" y="50" width="32" height="6" rx="2" fill="${d}"/>`); // sump
  } else {
    // V-block: two angled cylinder banks
    out.push(`<path d="M8 32 L18 20 L32 27 L46 20 L56 32 L56 52 L8 52Z" fill="${m}" stroke="${d}" stroke-width="2.5" stroke-linejoin="round"/>`);
    out.push(`<path d="M13 30 L19 23 M51 30 L45 23" stroke="${d}" stroke-width="3" stroke-linecap="round"/>`);
    out.push(`<path d="M13 40h38M13 46h38" stroke="${d}" stroke-width="2"/>`);
    out.push(`<rect x="16" y="51" width="32" height="6" rx="2" fill="${d}"/>`);
  }
  switch (t) {
    case 1: // one carb with a round air filter
      out.push(`<rect x="29" y="17" width="6" height="10" fill="${d}"/><ellipse cx="32" cy="16" rx="11" ry="5" fill="${d}"/><ellipse cx="32" cy="15" rx="8" ry="3" fill="${m}"/>`);
      break;
    case 2: // valve cover and twin carbs
      out.push(`<rect x="15" y="20" width="34" height="8" rx="2" fill="${d}"/>`);
      out.push(`<rect x="20" y="13" width="5" height="8" fill="${d}"/><rect x="39" y="13" width="5" height="8" fill="${d}"/>`);
      out.push(`<ellipse cx="22.5" cy="12" rx="6" ry="3.5" fill="${m}" stroke="${d}" stroke-width="1.5"/><ellipse cx="41.5" cy="12" rx="6" ry="3.5" fill="${m}" stroke="${d}" stroke-width="1.5"/>`);
      break;
    case 3: // twin overhead cams with plug leads
      out.push(`<rect x="13" y="14" width="18" height="13" rx="5" fill="${m}" stroke="${d}" stroke-width="2"/><rect x="33" y="14" width="18" height="13" rx="5" fill="${m}" stroke="${d}" stroke-width="2"/>`);
      out.push(`<path d="M18 20h8M38 20h8" stroke="${d}" stroke-width="2"/><path d="M22 14 C22 6 42 6 42 14" stroke="${acc}" stroke-width="2.2" fill="none"/>`);
      break;
    case 4: { // twin cams plus a front-mounted intercooler and charge pipe
      out.push(`<rect x="15" y="15" width="16" height="12" rx="5" fill="${m}" stroke="${d}" stroke-width="2"/><rect x="33" y="15" width="16" height="12" rx="5" fill="${m}" stroke="${d}" stroke-width="2"/>`);
      out.push(`<path d="M12 22 C12 8 30 6 30 14" stroke="${d}" stroke-width="5" fill="none" stroke-linecap="round"/>`);
      out.push(`<rect x="1" y="18" width="12" height="32" rx="2" fill="#2a3138" stroke="${m}" stroke-width="2"/>`);
      out.push(`<path d="M3 24h8M3 29h8M3 34h8M3 39h8M3 44h8" stroke="${m}" stroke-width="1.4"/>`);
      break;
    }
    case 5: // V-block with four velocity stacks
      for (const x of [17, 25, 35, 43]) out.push(`<path d="M${x} 24 L${x - 1} 10 L${x + 5} 10 L${x + 4} 24Z" fill="${m}" stroke="${d}" stroke-width="1.6"/><ellipse cx="${x + 2}" cy="10" rx="3.6" ry="1.6" fill="${d}"/>`);
      break;
    case 6: // V-block with a supercharger blower and belt
      out.push(`<rect x="19" y="9" width="26" height="15" rx="3" fill="${m}" stroke="${d}" stroke-width="2"/>`);
      out.push(`<path d="M22 13h20M22 17h20M22 21h20" stroke="${d}" stroke-width="1.6"/>`);
      out.push(`<rect x="24" y="3" width="16" height="6" rx="2" fill="${acc}" stroke="${d}" stroke-width="1.5"/>`);
      out.push(`<path d="M45 14 L56 33" stroke="#1b1d20" stroke-width="3"/><circle cx="46" cy="14" r="3" fill="${d}"/>`);
      break;
    case 7: // V12: long carbon plenum and a turbo on each bank
      out.push(`<rect x="14" y="10" width="36" height="13" rx="5" fill="${CARBON}" stroke="${m}" stroke-width="2"/>`);
      out.push(`<path d="M18 12l4 9M24 12l4 9M30 12l4 9M36 12l4 9M42 12l4 9" stroke="#3b3f48" stroke-width="2"/>`);
      out.push(`<circle cx="9" cy="22" r="6" fill="${m}" stroke="${d}" stroke-width="2"/><circle cx="55" cy="22" r="6" fill="${m}" stroke="${d}" stroke-width="2"/>`);
      out.push(`<circle cx="9" cy="22" r="2.2" fill="${d}"/><circle cx="55" cy="22" r="2.2" fill="${d}"/>`);
      out.push(`<text x="32" y="20" text-anchor="middle" font-size="7" font-weight="900" fill="${m}" font-family="system-ui,sans-serif">V12</text>`);
      break;
    case 8: // hybrid: V-block, carbon plenum, electric motor with an orange high-voltage cable
      out.push(`<rect x="16" y="11" width="32" height="12" rx="5" fill="${CARBON}" stroke="${m}" stroke-width="2"/>`);
      out.push(`<rect x="0" y="20" width="14" height="24" rx="5" fill="#2a2f36" stroke="${m}" stroke-width="2"/>`);
      out.push(`<path d="M3 26h8M3 30h8M3 34h8M3 38h8" stroke="${m}" stroke-width="1.3"/>`);
      out.push(`<path d="M7 20 C7 6 24 4 26 11" stroke="#ff8a1f" stroke-width="3" fill="none" stroke-linecap="round"/>`);
      out.push(`<path d="M34 12 l-5 6 h4 l-3 5 l7 -7 h-4 l3 -4z" fill="#ffd34d"/>`);
      break;
    default: { // T9+: prototype core — shark-fin intake and a glowing light blade
      const glow = t >= 10 ? PRISM : GLOW;
      out.push(`<path d="M20 24 L28 4 L36 4 L44 24Z" fill="${CARBON}" stroke="${m}" stroke-width="2" stroke-linejoin="round"/>`);
      out.push(`<rect x="14" y="34" width="36" height="7" rx="3.5" fill="${glow}" opacity=".35"/>`);
      out.push(`<rect x="14" y="36" width="36" height="3" rx="1.5" fill="${glow}"/>`);
      out.push(`<circle cx="32" cy="15" r="3.5" fill="${glow}"/><circle cx="32" cy="15" r="6.5" fill="${glow}" opacity=".3"/>`);
      out.push(`<rect x="0" y="22" width="12" height="22" rx="5" fill="#1c2128" stroke="${m}" stroke-width="2"/><path d="M6 26v14" stroke="${glow}" stroke-width="2.5"/>`);
    }
  }
  return out.join('');
}

// ---------------------------------------------------------------- tires (full circle silhouette)

function spokes(n: number, r0: number, r1: number, w: number, color: string, rot = 0) {
  let s = '';
  for (let k = 0; k < n; k++) {
    const a = rot + (k / n) * Math.PI * 2;
    const x0 = 32 + Math.cos(a) * r0, y0 = 32 + Math.sin(a) * r0;
    const x1 = 32 + Math.cos(a) * r1, y1 = 32 + Math.sin(a) * r1;
    s += `M${x0.toFixed(1)} ${y0.toFixed(1)}L${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return `<path d="${s}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;
}

function tires({ m, d, acc, t }: Ink): string {
  const out: string[] = [];
  // the rim grows with tier (lower profile, bigger wheel)
  const rim = [0, 11, 12, 14, 15, 16, 17, 17, 18, 18, 18][tierIdx(t)];
  const slick = t >= 7;
  out.push(`<circle cx="32" cy="32" r="29" fill="#1b1917"/>`);
  if (!slick) {
    // tread blocks: deeper and more of them with tier
    const n = t <= 2 ? 12 : 16;
    out.push(`<circle cx="32" cy="32" r="27" fill="none" stroke="#3d3833" stroke-width="${t <= 2 ? 4 : 5}" stroke-dasharray="${t <= 2 ? '5 4' : '4 2.8'}" transform="rotate(${n} 32 32)"/>`);
  } else {
    out.push(`<path d="M14 18 A26 26 0 0 1 32 6" stroke="#5a5550" stroke-width="3" fill="none" stroke-linecap="round"/>`); // glossy slick
  }
  // sidewall marking from T4: a coloured band
  if (t >= 4) out.push(`<circle cx="32" cy="32" r="${rim + 4.5}" fill="none" stroke="${t >= 8 ? acc : '#e9e4dc'}" stroke-width="1.6" stroke-dasharray="${t >= 8 ? '' : '6 5'}" opacity=".9"/>`);
  // brake hardware peeking through from T6
  if (t >= 6) {
    out.push(`<circle cx="32" cy="32" r="${rim - 2}" fill="#5d636b"/>`);
    if (t >= 7) out.push(`<circle cx="32" cy="32" r="${rim - 4}" fill="none" stroke="#2c3036" stroke-width="1.2" stroke-dasharray="1.5 2.5"/>`);
    out.push(`<path d="M${32 + rim - 6} ${32 - rim + 5} a${rim - 3} ${rim - 3} 0 0 1 4 9" stroke="#e0403a" stroke-width="5" fill="none" stroke-linecap="round"/>`);
  }
  switch (t) {
    case 1: // plain steel wheel with four holes
      out.push(`<circle cx="32" cy="32" r="${rim}" fill="${m}" stroke="${d}" stroke-width="2"/>`);
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; out.push(`<circle cx="${(32 + Math.cos(a) * 6.5).toFixed(1)}" cy="${(32 + Math.sin(a) * 6.5).toFixed(1)}" r="2" fill="${d}"/>`); }
      out.push(`<circle cx="32" cy="32" r="3.5" fill="${d}"/>`);
      break;
    case 2: // steel wheel, five lugs and a trim ring
      out.push(`<circle cx="32" cy="32" r="${rim}" fill="${m}" stroke="${d}" stroke-width="2"/><circle cx="32" cy="32" r="${rim - 3}" fill="none" stroke="${d}" stroke-width="1.5"/>`);
      for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5; out.push(`<circle cx="${(32 + Math.cos(a) * 4.5).toFixed(1)}" cy="${(32 + Math.sin(a) * 4.5).toFixed(1)}" r="1.5" fill="${d}"/>`); }
      break;
    case 3: // five-spoke alloy
      out.push(`<circle cx="32" cy="32" r="${rim}" fill="${d}" stroke="${m}" stroke-width="2.5"/>`);
      out.push(spokes(5, 3, rim - 1, 4.5, m, -Math.PI / 2));
      out.push(`<circle cx="32" cy="32" r="4" fill="${m}" stroke="${d}" stroke-width="1.5"/>`);
      break;
    case 4: // ten-spoke alloy
      out.push(`<circle cx="32" cy="32" r="${rim}" fill="${d}" stroke="${m}" stroke-width="2.5"/>`);
      out.push(spokes(10, 3, rim - 1, 2.2, m));
      out.push(`<circle cx="32" cy="32" r="4" fill="${m}" stroke="${d}" stroke-width="1.5"/>`);
      break;
    case 5: // deep-dish chrome: thick polished lip, six short spokes
      out.push(`<circle cx="32" cy="32" r="${rim}" fill="${d}"/><circle cx="32" cy="32" r="${rim - 2}" fill="none" stroke="${m}" stroke-width="4"/>`);
      out.push(spokes(6, 3, rim - 5, 3.2, m, Math.PI / 6));
      out.push(`<circle cx="32" cy="32" r="4.5" fill="${m}" stroke="${d}" stroke-width="1.5"/>`);
      break;
    case 6: { // mesh wheel
      out.push(`<circle cx="32" cy="32" r="${rim}" fill="none" stroke="${m}" stroke-width="3"/>`);
      out.push(spokes(12, 3, rim - 1, 1.6, m));
      out.push(spokes(12, 6, rim - 1, 1.6, m, Math.PI / 12));
      out.push(`<circle cx="32" cy="32" r="4.5" fill="${m}" stroke="${d}" stroke-width="1.5"/>`);
      break;
    }
    case 7: // race wheel: Y-spokes and a centre-lock nut
      out.push(`<circle cx="32" cy="32" r="${rim}" fill="none" stroke="${m}" stroke-width="3"/>`);
      out.push(spokes(7, 4, rim - 1, 3, m));
      out.push(`<circle cx="32" cy="32" r="5.5" fill="${acc}" stroke="${d}" stroke-width="1.5"/><path d="M32 27.5v9M27.5 32h9" stroke="${d}" stroke-width="1.6"/>`);
      break;
    case 8: // carbon aero disc with cooling slits
      out.push(`<circle cx="32" cy="32" r="${rim}" fill="${CARBON}" stroke="${m}" stroke-width="2.5"/>`);
      for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5; out.push(`<path d="M${(32 + Math.cos(a) * 8).toFixed(1)} ${(32 + Math.sin(a) * 8).toFixed(1)} A8 8 0 0 1 ${(32 + Math.cos(a + 0.7) * 8).toFixed(1)} ${(32 + Math.sin(a + 0.7) * 8).toFixed(1)}" stroke="${m}" stroke-width="2.2" fill="none"/>`); }
      out.push(`<circle cx="32" cy="32" r="4" fill="${m}"/>`);
      break;
    default: { // T9+: turbine wheel ringed with light
      const glow = t >= 10 ? PRISM : GLOW;
      out.push(`<circle cx="32" cy="32" r="${rim + 1}" fill="none" stroke="${glow}" stroke-width="3" opacity=".9"/>`);
      out.push(`<circle cx="32" cy="32" r="${rim - 1}" fill="${CARBON}"/>`);
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        const x0 = 32 + Math.cos(a) * 4, y0 = 32 + Math.sin(a) * 4;
        const x1 = 32 + Math.cos(a + 0.6) * (rim - 2), y1 = 32 + Math.sin(a + 0.6) * (rim - 2);
        out.push(`<path d="M${x0.toFixed(1)} ${y0.toFixed(1)} Q${(32 + Math.cos(a + 0.1) * rim * 0.7).toFixed(1)} ${(32 + Math.sin(a + 0.1) * rim * 0.7).toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}" stroke="${m}" stroke-width="2.2" fill="none"/>`);
      }
      out.push(`<circle cx="32" cy="32" r="4" fill="${glow}"/>`);
    }
  }
  return out.join('');
}

// ---------------------------------------------------------------- turbos (snail scroll + outlet pipe)

/** One compressor scroll centred at (cx, cy), radius r, outlet pipe to the upper right. */
function scroll(cx: number, cy: number, r: number, m: string, d: string, blades: number, inlet: string) {
  const o: string[] = [];
  // outlet pipe leaves the scroll tangentially (the snail's tail)
  o.push(`<path d="M${cx} ${cy - r} H${cx + r + 8}" stroke="${d}" stroke-width="${r * 0.62 + 2.5}" stroke-linecap="butt"/>`);
  o.push(`<path d="M${cx} ${cy - r} H${cx + r + 8}" stroke="${m}" stroke-width="${r * 0.62}" stroke-linecap="butt"/>`);
  o.push(`<rect x="${cx + r + 7}" y="${cy - r - r * 0.45}" width="4" height="${r * 0.9}" rx="1" fill="${d}"/>`);
  // the scroll: a spiral housing that widens toward the pipe
  o.push(`<path d="M${cx} ${cy - r} A${r} ${r} 0 1 0 ${cx + r} ${cy} L${cx + r * 0.62} ${cy} A${r * 0.62} ${r * 0.62} 0 1 1 ${cx} ${cy - r * 0.62}Z" fill="${m}" stroke="${d}" stroke-width="2"/>`);
  o.push(`<circle cx="${cx}" cy="${cy}" r="${r * 0.62}" fill="${m}" stroke="${d}" stroke-width="2"/>`);
  // inlet with compressor blades
  const ri = r * 0.42;
  o.push(`<circle cx="${cx}" cy="${cy}" r="${ri}" fill="${inlet}"/>`);
  if (blades) {
    let p = '';
    for (let k = 0; k < blades; k++) {
      const a = (k / blades) * Math.PI * 2;
      p += `M${cx.toFixed(1)} ${cy.toFixed(1)} Q${(cx + Math.cos(a + 0.5) * ri * 0.7).toFixed(1)} ${(cy + Math.sin(a + 0.5) * ri * 0.7).toFixed(1)} ${(cx + Math.cos(a + 0.9) * ri).toFixed(1)} ${(cy + Math.sin(a + 0.9) * ri).toFixed(1)}`;
    }
    o.push(`<path d="${p}" stroke="${m}" stroke-width="1.3" fill="none"/>`);
  }
  o.push(`<circle cx="${cx}" cy="${cy}" r="${Math.max(1.4, ri * 0.28)}" fill="${d}"/>`);
  return o.join('');
}

function turbo({ m, d, acc, t }: Ink): string {
  const out: string[] = [];
  const dark = '#1d2126';
  switch (t) {
    case 1: out.push(scroll(28, 36, 15, m, d, 0, dark)); break;
    case 2:
      out.push(scroll(28, 36, 16, m, d, 0, dark));
      out.push(`<path d="M15 26 A16 16 0 0 0 14 46" stroke="${d}" stroke-width="2.5" fill="none"/>`); // heat-shield band
      break;
    case 3: out.push(scroll(28, 36, 17, m, d, 6, dark)); break;
    case 4: // blow-off valve on the outlet
      out.push(scroll(27, 37, 17, m, d, 7, dark));
      out.push(`<rect x="40" y="8" width="9" height="10" rx="2" fill="${acc}" stroke="${d}" stroke-width="1.6"/><rect x="42" y="5" width="5" height="4" rx="1" fill="${d}"/>`);
      break;
    case 5: // wastegate canister and actuator rod
      out.push(scroll(29, 36, 18, m, d, 8, dark));
      out.push(`<circle cx="9" cy="52" r="7" fill="${m}" stroke="${d}" stroke-width="2"/><path d="M14 47 L20 41" stroke="${d}" stroke-width="2.5"/>`);
      out.push(`<rect x="41" y="5" width="9" height="9" rx="2" fill="${acc}" stroke="${d}" stroke-width="1.6"/>`);
      break;
    case 6: // twin turbos
      out.push(scroll(19, 44, 12, m, d, 6, dark));
      out.push(scroll(36, 24, 12, m, d, 6, dark));
      break;
    case 7: // twin ball-bearing turbos, glowing hot sides and heat wrap
      out.push(`<circle cx="19" cy="44" r="15" fill="#ff7a2f" opacity=".35"/><circle cx="36" cy="24" r="15" fill="#ff7a2f" opacity=".35"/>`);
      out.push(scroll(19, 44, 12, m, d, 7, dark));
      out.push(scroll(36, 24, 12, m, d, 7, dark));
      out.push(`<path d="M6 30l8 4M4 36l8 4" stroke="#e9e1cf" stroke-width="2"/>`);
      break;
    case 8: // electric turbo: motor drum behind the scroll and an HV cable
      out.push(`<rect x="2" y="24" width="14" height="26" rx="4" fill="#2a2f36" stroke="${m}" stroke-width="2"/><path d="M5 30h8M5 35h8M5 40h8M5 45h8" stroke="${m}" stroke-width="1.3"/>`);
      out.push(scroll(32, 38, 17, m, d, 8, dark));
      out.push(`<path d="M9 24 C9 10 20 6 26 8" stroke="#ff8a1f" stroke-width="3" fill="none" stroke-linecap="round"/>`);
      break;
    default: { // T9+: twin electric turbos with plasma-lit inlets
      const glow = t >= 10 ? PRISM : GLOW;
      out.push(`<circle cx="19" cy="44" r="14" fill="${glow}" opacity=".22"/><circle cx="37" cy="23" r="14" fill="${glow}" opacity=".22"/>`);
      out.push(scroll(19, 44, 12, m, d, 7, glow));
      out.push(scroll(37, 23, 12, m, d, 7, glow));
      out.push(`<path d="M4 56 C4 40 8 30 18 30" stroke="#ff8a1f" stroke-width="2.5" fill="none" stroke-linecap="round"/>`);
    }
  }
  return out.join('');
}

// ---------------------------------------------------------------- expansion families (not in drops yet)

function transmission({ m, d, t }: Ink): string {
  const teeth = 8 + Math.min(4, t);
  let p = '';
  for (let k = 0; k < teeth * 2; k++) {
    const a = (k / (teeth * 2)) * Math.PI * 2;
    const r = k % 2 ? 18 : 24;
    p += `${k ? 'L' : 'M'}${(32 + Math.cos(a) * r).toFixed(1)} ${(32 + Math.sin(a) * r).toFixed(1)}`;
  }
  return `<path d="${p}Z" fill="${m}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/><circle cx="32" cy="32" r="8" fill="${d}"/><circle cx="32" cy="32" r="3" fill="${m}"/>`;
}

function aero({ m, d, t }: Ink): string {
  return `<path d="M4 ${24 - Math.min(6, t)} Q32 ${12 - t} 60 ${24 - Math.min(6, t)} L60 32 Q32 24 4 32Z" fill="${m}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/>
  <rect x="16" y="30" width="5" height="22" fill="${d}"/><rect x="43" y="30" width="5" height="22" fill="${d}"/><rect x="10" y="50" width="44" height="5" rx="2" fill="${d}"/>`;
}

const DRAW: Record<Family, (ink: Ink) => string> = { engine, tires, turbo, transmission, aero };

// ---------------------------------------------------------------- quality markers

/** Polished: a silver diamond and a soft sheen. Mint: a gold star, a stronger sheen and a gold glow. */
function qualityMark(q: Quality): string {
  if (q === 'std') return '';
  if (q === 'polished') {
    return `<path d="M10 8 L24 8 L10 56 L3 56Z" fill="#fff" opacity=".16"/>
    <path d="M56 1 L62 8 L56 15 L50 8Z" fill="#e9f1f5" stroke="#5b6670" stroke-width="1.4"/>`;
  }
  return `<path d="M10 8 L26 8 L12 56 L3 56Z" fill="#fff6d0" opacity=".26"/>
  <path d="M56 0 L58.4 5.6 L64 6.2 L59.8 10 L61 16 L56 13 L51 16 L52.2 10 L48 6.2 L53.6 5.6Z" fill="#ffd75e" stroke="#7a5a00" stroke-width="1.2" stroke-linejoin="round"/>`;
}

export interface PartSvgOpts {
  /** Draw the tier numeral inside the art (for places without an HTML tier badge). */
  badge?: boolean;
}

/** A part illustration. Signature kept stable for other screens: `partSvg(family, tier, quality)`. */
export function partSvg(f: Family, t: number, q: Quality, opts: PartSvgOpts = {}): string {
  const prism = tierIdx(t) >= 10;
  const pid = `rvPrism${prismN = (prismN + 1) % 1e6}`;
  if (prism) PRISM = `url(#${pid})`;
  const ink: Ink = { m: prism ? PRISM : metalFor(t), d: metalDarkFor(t), acc: FAMILIES[f].color, t: tierIdx(t) };
  const art = (prism ? prismDefs(pid) + prismHalo() : '') + DRAW[f](ink) + (prism ? prismCrown(f) : '');
  const glow = q === 'mint' ? `<circle cx="32" cy="32" r="30" fill="none" stroke="#ffd75e" stroke-width="2" opacity=".55"/>` : '';
  const badge = opts.badge
    ? `<rect x="0" y="0" width="${t >= 10 ? 26 : 18}" height="20" rx="5" fill="#0d1116" stroke="${metalFor(t)}" stroke-width="2"/><text x="${t >= 10 ? 13 : 9}" y="15.5" text-anchor="middle" font-size="16" font-weight="900" fill="#fff" font-family="system-ui,sans-serif">${t}</text>`
    : '';
  return `<svg viewBox="0 0 64 64" aria-hidden="true" class="part-art">${glow}${art}${qualityMark(q)}${badge}</svg>`;
}

/** T10 extra hardware on top of the T9 core, so T10 reads as a step beyond T9 and not only a recolour. */
function prismCrown(f: Family): string {
  if (f === 'engine') return `<path d="M10 48h44" stroke="${PRISM}" stroke-width="3" stroke-linecap="round"/><path d="M26 4l6-4 6 4" stroke="${PRISM}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (f === 'tires') return `<circle cx="32" cy="32" r="30" fill="none" stroke="${PRISM}" stroke-width="2" stroke-dasharray="4 3"/>`;
  if (f === 'turbo') return `<circle cx="19" cy="44" r="15.5" fill="none" stroke="${PRISM}" stroke-width="1.8"/><circle cx="37" cy="23" r="15.5" fill="none" stroke="${PRISM}" stroke-width="1.8"/>`;
  return '';
}

/** The family's look at a neutral mid tier (pickers, empty slots). */
export function familyIcon(f: Family): string {
  return partSvg(f, 3, 'std');
}

/** Short quality label used beside the tier ("Polished", "Mint"); empty for standard parts. */
export const qualityName = (q: Quality) => (q === 'mint' ? 'Mint' : q === 'polished' ? 'Polished' : '');

/**
 * A complete part tile (art, tier numeral, quality tag, family dot) as HTML, shared by the bench, the equipment
 * strip and the Fit Parts view so a part looks the same wherever it is. `extra` adds classes to the tile.
 */
export function partTileHtml(f: Family, t: number, q: Quality, extra = '', label = ''): string {
  const tag = q === 'mint' ? '<span class="qtag" aria-hidden="true"><b>MINT</b><i>★</i></span>'
    : q === 'polished' ? '<span class="qtag" aria-hidden="true"><b>POL</b><i>◆</i></span>' : '';
  const aria = label || `T${t} ${FAMILIES[f].name}${q !== 'std' ? `, ${qualityName(q)}` : ''}`;
  return `<div class="part q-${q} fam-${f}${extra ? ` ${extra}` : ''}" style="--metal:${metalFor(t)};--fam:${FAMILIES[f].color}" aria-label="${aria}">${partSvg(f, t, q)}<span class="tier" aria-hidden="true">${t}</span>${tag}<span class="fam" aria-hidden="true"></span></div>`;
}
