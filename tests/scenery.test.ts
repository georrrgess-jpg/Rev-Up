// Race scenery: every playable track has its own scenery recipe, looks stay visual-only, and every emitter kind the
// recipes use is one the live renderer draws.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TRACKS } from '../src/data/tables';
import { PALETTES, sceneLook } from '../src/render/scene';
import { SCENERY_TRACKS, recipeFor } from '../src/render/sceneryTracks';

describe('race scenery', () => {
  it('gives every track its own recipe', () => {
    for (const id of Object.keys(TRACKS)) expect(SCENERY_TRACKS, id).toContain(id);
  });

  it('falls back to the area look for an unknown track', () => {
    for (const look of Object.keys(PALETTES)) expect(recipeFor('no-such-track', look)).toBeTruthy();
  });

  it('gives the Skyline Run the Neon Skyline look without touching the race data', () => {
    expect(sceneLook('night', 'skyline')).toBe('neon');
    expect((TRACKS as Record<string, { theme: string }>).skyline.theme).toBe('night');
  });

  it('draws every emitter kind the recipes bake into their tiles', () => {
    const src = readFileSync(new URL('../src/render/sceneryTracks.ts', import.meta.url), 'utf8');
    const used = new Set([...src.matchAll(/k: '([a-z]+)'/g)].map((m) => m[1]));
    const drawn = new Set([...src.matchAll(/case '([a-z]+)'/g)].map((m) => m[1]));
    for (const k of used) expect(drawn, k).toContain(k);
  });
});
