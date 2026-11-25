// Seeded PRNG (mulberry32). State is a single uint32 stored in the save so
// rolls are reproducible across reloads and in tests.

export function nextRandom(state: { rng: number }): number {
  let t = (state.rng = (state.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function makeRng(seed: number) {
  const s = { rng: seed >>> 0 };
  return () => nextRandom(s);
}

export function pickWeighted(r: number, weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i] / total;
    if (r < acc) return i;
  }
  return weights.length - 1;
}
