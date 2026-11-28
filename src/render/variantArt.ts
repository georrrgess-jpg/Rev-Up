// Rev Up — earned car variants (1.10 Redline; Progression workstream). Drawn by src/render/car.ts through the same
// four hooks as the opponent-only bodies (src/render/rivalArt.ts): `body` (two-tones and graphics inside the near
// panel), `side` (seams, vents, lamps, mirror), `top` (planes and everything standing on them: bonnet, cage, wing)
// and `face` (lamps and intakes on the front plane). This file imports only types from car.ts (no import cycle).
//
// Kestrel 1600 R — the Redline Series car. The Kestrel's boxy shell, seam-welded and stripped: 30 mm lower on
// wider forged wheels in bolted box flares, a carbon bonnet with louvres, a cage behind the seats, a swan-neck wing
// on the deck, a deep splitter, tow hooks front and rear, a red "R" roundel and a red redline stripe along the sill.
import type { CarDef, P, RivalKit } from './car';
import type { RivalArt } from './rivalArt';

/** The Kestrel R's signature finish (data/tables SIGNATURE_FINISHES.kestrelr): its sill stripe turns red-hot. */
const SIG_PAINT = '#2a2d33';
const RED = '#e0202e';

const def: CarDef = {
  L: 4.06, width: 1.74, rx: 0.74, fx: 3.14, r: 0.31, tireW: 0.14, rearTireW: 0.15, sill: 0.18, archGap: 0.02, flare: 0.085,
  profile: [[0.06, 0.18, 0.02], [0, 0.3, 0.03], [0, 0.7, 0.03], [0.03, 0.83, 0.02], [0.42, 0.85, 0.05], [1.02, 1.18, 0.08], [1.96, 1.21, 0.07, 'g'],
    [2.56, 0.86, 0.03], [3.74, 0.72, 0.05], [4.02, 0.58, 0.04], [4.06, 0.28, 0.03], [3.98, 0.18, 0.02]],
  glass: [
    [[1.08, 0.88, 0.02], [1.15, 1.13, 0.03], [1.5, 1.16, 0.02], [1.5, 0.88, 0.02]],
    [[1.6, 0.88, 0.02], [1.6, 1.16, 0.02], [1.94, 1.16, 0.04], [2.44, 0.88, 0.02]],
  ],
  belt: 0.87, wheel: { kind: 'forged', rim: 0.76, tire: '#151516', side: '#232325', caliper: RED, rimCol: '#d9dcdf' }, cabin: { seat: '#151618', cage: true },
};

/** An aerofoil in profile (thin wing, splitter), lit along its top edge. */
function foil(k: RivalKit, pts: P[], face: string, under: string, edge?: string) {
  k.extrude(pts, (n) => (n.y > 0.3 ? k.lit(face, 0.18) : n.y < -0.3 ? under : face));
  k.fill(pts, face);
  if (edge) { k.ctx.strokeStyle = edge; k.ctx.lineWidth = 0.014; k.ctx.beginPath(); k.ctx.moveTo(pts[1].x, pts[1].y); k.ctx.lineTo(pts[2].x, pts[2].y); k.ctx.stroke(); }
}

export const VARIANT_ART: Record<string, RivalArt> = {
  kestrelr: {
    def,
    tail: { x: 0.04, y: 0.66, len: 0.1 }, lampY: 0.6,
    body(k) {
      const sig = k.paint.toLowerCase() === SIG_PAINT;
      // a graphite lower third under the paint, then the redline stripe along the sill
      k.rect(0.04, 0.18, k.d.L - 0.1, 0.17, '#1a1c20');
      k.rect(0.04, 0.35, k.d.L - 0.1, sig ? 0.04 : 0.03, sig ? '#ff3a3a' : RED);
      // a tach sweep that kicks up behind the front wheel and runs back to the rear arch
      k.ctx.fillStyle = sig ? '#ff3a3a' : RED;
      k.ctx.beginPath();
      k.ctx.moveTo(2.78, 0.42); k.ctx.lineTo(1.2, 0.42); k.ctx.lineTo(1.05, 0.62); k.ctx.lineTo(0.95, 0.62); k.ctx.lineTo(1.12, 0.39); k.ctx.lineTo(2.82, 0.39);
      k.ctx.closePath(); k.ctx.fill();
    },
    side(k) {
      const d = k.d;
      k.seam([[1.55, 0.87], [1.57, 0.5], [1.6, 0.36]]);
      k.seam([[2.5, 0.85], [2.52, 0.5], [2.46, 0.36]]);
      // the "R" roundel on the door
      k.fill(k.ellipse0(2.04, 0.64, 0.13, 0.13), '#f4f2ec');
      k.fill(k.ellipse0(2.04, 0.64, 0.105, 0.105), RED);
      if (k.detail) k.label('R', 1.995, 0.6, 0.16, '#f4f2ec', 'italic 900');
      // fender vents behind the front wheel, a fuel filler, the tail lamp and a red tow hook at each end
      for (let i = 0; i < 3; i++) k.rect(2.72 + i * 0.07, 0.5, 0.04, 0.16, '#0c0d0f', 0.015);
      k.fill(k.ellipse0(0.52, 0.76, 0.045, 0.045), '#16181b');
      k.rect(0.0, 0.58, 0.1, 0.15, '#a5201b', 0.02);
      k.rect(-0.07, 0.24, 0.09, 0.05, RED);
      k.rect(d.L - 0.02, 0.22, 0.09, 0.05, RED);
      k.mirror(2.44, 0.9, '#1a1c20');
    },
    top(k) {
      const d = k.d;
      // a carbon bonnet with two rows of louvres
      k.carbon(k.topPatch(2.66, 3.86, 0.12, 0.88, 0.004));
      k.ctx.strokeStyle = 'rgba(0,0,0,0.55)'; k.ctx.lineWidth = 0.012;
      for (let i = 0; i < 5; i++) { k.across(2.9 + i * 0.09, 0.2, 0.42, 0.006); k.across(2.9 + i * 0.09, 0.58, 0.8, 0.006); }
      // bolts round the box flares
      k.ctx.fillStyle = '#c9ced3';
      for (const [wx, gap] of [[d.fx, d.archGap], [d.rx, d.archGap + d.flare * 0.5]] as const) {
        const ar = d.r + gap + d.flare * 0.55;
        for (let i = 1; i < 8; i++) { const a = (i / 8) * Math.PI; k.ctx.beginPath(); k.ctx.arc(wx + Math.cos(a) * ar, d.r + 0.01 + Math.sin(a) * ar, 0.013, 0, Math.PI * 2); k.ctx.fill(); }
      }
      // the swan-neck wing: two stands from the top of the deck, the blade and its end plate
      for (const u of [0.8, 0.2]) k.fill([k.P3(0.3, u, 0.84), k.P3(0.37, u, 0.84), k.P3(0.28, u, 1.17), k.P3(0.22, u, 1.17)], '#15171a');
      foil(k, [k.pt(-0.14, 1.15), k.pt(0.52, 1.18), k.pt(0.5, 1.23), k.pt(-0.12, 1.22)], '#25282d', '#121316', RED);
      k.fill([k.pt(-0.16, 1.07), k.pt(0.16, 1.09), k.pt(0.16, 1.29), k.pt(-0.16, 1.29)], '#191b1f');
      // a deep splitter and a roof intake ahead of the cage
      foil(k, [k.pt(3.78, 0.15), k.pt(4.2, 0.14), k.pt(4.2, 0.18), k.pt(3.78, 0.2)], '#22252a', '#111214');
      k.fill(k.topPatch(1.4, 1.7, 0.38, 0.62, 0.035), '#16181b');
    },
    face(k) {
      // square twin lamps, a mesh grille, two big brake ducts and the red tow strap
      k.fill(k.quad(0.08, 0.92, 0.22, 0.44), '#0b0c0e');
      for (let i = 0; i < 5; i++) k.fill(k.quad(0.1, 0.9, 0.24 + i * 0.04, 0.255 + i * 0.04), '#23262a');
      for (const [a, b] of [[0.04, 0.26], [0.74, 0.96]]) {
        k.fill(k.quad(a - 0.015, b + 0.015, 0.52, 0.66), '#121316');
        k.fill(k.quad(a, a + (b - a) * 0.47, 0.535, 0.645), k.lens(false));
        k.fill(k.quad(a + (b - a) * 0.53, b, 0.535, 0.645), k.lens(false));
      }
      k.fill(k.quad(0.33, 0.67, 0.54, 0.64), '#101113');
      k.fill(k.quad(0.44, 0.56, 0.565, 0.615), RED);
      k.fill(k.quad(0.7, 0.76, 0.24, 0.4), RED);
    },
  },
};
