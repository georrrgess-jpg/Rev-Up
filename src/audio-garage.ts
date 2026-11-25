import { noise, tone } from './audio';

// Garage sounds: short, synthesized, and safe to fire rapidly. Every cue is under ~0.45 s and a new merge
// simply layers over the tail of the last one, so quick merges never queue up or wait. Cues scale with the
// tier (T1 a light click, T9 a heavy clank with a bright ring) so a bigger part sounds more capable.
// Mute and the lazy AudioContext are handled by audio.ts (tone/noise are no-ops when muted or locked).

const clampT = (t: number) => Math.max(1, Math.min(10, t));
/** Pitch step for a tier: a major-ish ladder so successive tiers climb. */
const tierHz = (t: number) => 220 * 2 ** ((clampT(t) - 1) * 2 / 12);

export const gsfx = {
  /** Picking a part up (tap-select or the start of a drag). */
  pick(t = 1) { tone(tierHz(t) * 2, 0.04, 'triangle', 0.06); },
  /** Hovering a valid merge target while dragging. */
  hover() { tone(1320, 0.03, 'sine', 0.04); },
  /** A merge: snap + click, a body that deepens with tier, and a ringing overtone from T4. */
  merge(tier: number, chain = 1) {
    const t = clampT(tier);
    const step = Math.min(chain - 1, 8);
    noise(0.035 + t * 0.006, 0.18 + t * 0.015, 0, 2400 + t * 300, 'highpass');
    tone(tierHz(t) * 2 ** (step / 12), 0.08, 'square', 0.1, 0.005);
    tone(tierHz(t) * 1.5 * 2 ** (step / 12), 0.1, 'triangle', 0.09, 0.03);
    if (t >= 3) tone(60 + t * 7, 0.16 + t * 0.02, 'sine', 0.1 + t * 0.008, 0, 40); // thud gets heavier
    if (t >= 4) tone(700 + t * 120, 0.22 + t * 0.025, 'sine', 0.03 + t * 0.007, 0.03); // ring gets brighter
    if (t >= 8) noise(0.12, 0.12, 0.02, 5200, 'bandpass'); // hybrid / prototype: an electric fizz
  },
  /** Each extra link of a cascade: a rising ratchet so long chains build. */
  cascade(link: number) {
    const k = Math.min(link, 8);
    tone(440 * 2 ** (k / 6), 0.07, 'triangle', 0.1);
    tone(660 * 2 ** (k / 6), 0.09, 'sine', 0.07, 0.035);
  },
  /** A chain of 3+ finishing: a short flourish. */
  cascadeEnd(chain: number) {
    const base = 523;
    for (let i = 0; i < Math.min(chain, 5); i++) tone(base * 2 ** ((i * 4) / 12), 0.12, 'triangle', 0.07, i * 0.045);
  },
  /** Polished: a clean glint. */
  polished() { tone(1568, 0.14, 'sine', 0.09); tone(2093, 0.16, 'sine', 0.05, 0.05); },
  /** Mint: a sparkling run and a soft cymbal. */
  mint() {
    [1047, 1319, 1568, 2093, 2637].forEach((f, i) => tone(f, 0.22, 'sine', 0.09, i * 0.045));
    noise(0.35, 0.08, 0.05, 7000, 'highpass');
  },
  /** An invalid drop or a mismatched tap: a short low buzz. */
  invalid() { tone(150, 0.1, 'square', 0.07, 0, 105); },
  /** A part fitted to a car: an impact-wrench burst and a clunk that deepens with tier. */
  fit(tier = 1) {
    const t = clampT(tier);
    for (let i = 0; i < 3; i++) noise(0.03, 0.16, i * 0.035, 1800, 'bandpass');
    tone(90 + t * 6, 0.16, 'sine', 0.14, 0.11, 55);
    tone(tierHz(t) * 2, 0.08, 'triangle', 0.06, 0.12);
  },
  /** A part taken off a car back to the bench. */
  unfit() { noise(0.05, 0.14, 0, 1400, 'bandpass'); tone(330, 0.07, 'triangle', 0.06, 0.03, 220); },
  /** A part landing in a cell (swapped out, or off a car). */
  land() { tone(520, 0.05, 'triangle', 0.06); },
  /** Recommended fit applied: wrench run and a rising pair. */
  recommended() {
    for (let i = 0; i < 4; i++) noise(0.03, 0.14, i * 0.05, 1900, 'bandpass');
    tone(523, 0.1, 'triangle', 0.08, 0.2); tone(784, 0.14, 'triangle', 0.08, 0.27);
  },
};
