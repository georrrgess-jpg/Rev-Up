// Race difficulty (deterministic): on the build a player brings to each event, the same seeds and rivals are raced
// with missed / ordinary / clean shifting × no / late / Perfect nitro. Opening events forgive ordinary inputs; later
// events need clean shifts and good boosts on that build (or a better build), and a missed-input run loses.
import { describe, expect, it } from 'vitest';
import { CATEGORY, LADDER_BUILDS, NITROS, SHIFTS, TARGETS, probeEvent } from './ladder';
import { eventById } from '../src/data/tables';

const SEEDS = 6;

describe('race difficulty by input quality', () => {
  it('every win input wins and every lose input loses, on each event’s reference build', () => {
    const fails: string[] = [];
    const table: string[] = [`wins (or heats survived) out of ${SEEDS}: shift rows × nitro none / late / Perfect`];
    for (const [id, t] of Object.entries(TARGETS)) {
      const b = LADDER_BUILDS[id][t.ref];
      const e = eventById(id);
      const cell = new Map<string, number>();
      for (const sh of SHIFTS) for (const ni of NITROS) cell.set(`${sh}/${ni}`, probeEvent(id, b, sh, ni, SEEDS).through);
      table.push(`${id.padEnd(18)} ${t.cat.padEnd(5)} ${b.car} E${b.tiers.join('/')}  ${SHIFTS.map((sh) => `${sh} ${NITROS.map((ni) => cell.get(`${sh}/${ni}`)).join('/')}`).join('  ')}${e.advance ? ` (top ${e.advance})` : ''}`);
      for (const [sh, ni] of CATEGORY[t.cat].win) if (cell.get(`${sh}/${ni}`)! < SEEDS - 1) fails.push(`${id}: ${sh}/${ni} should win (${cell.get(`${sh}/${ni}`)}/${SEEDS})`);
      for (const [sh, ni] of CATEGORY[t.cat].lose) if (cell.get(`${sh}/${ni}`)! > 1) fails.push(`${id}: ${sh}/${ni} should lose (${cell.get(`${sh}/${ni}`)}/${SEEDS})`);
    }
    console.log(table.join('\n'));
    expect(fails).toEqual([]);
  }, 120_000);

  it('a better build beats skill: the full build wins later events even with ordinary inputs', () => {
    for (const id of ['neon-mile', 'dust-stage', 'glacier-pass']) {
      const full = LADDER_BUILDS[id][1];
      expect(probeEvent(id, full, 'ordinary', 'late', SEEDS).wins).toBeGreaterThanOrEqual(SEEDS - 1);
    }
  });

  it('each new car is the one to beat on its own courses', () => {
    // the Corvo beats a full Lumen on the rally stages; the Strata beats a full Corvo through the Glacier Pass sweepers
    const lumen = LADDER_BUILDS['rally-final'][2], corvo = LADDER_BUILDS['rally-final'][1];
    expect(probeEvent('rally-final', corvo, 'clean', 'perfect', 2).time).toBeLessThan(probeEvent('rally-final', lumen, 'clean', 'perfect', 2).time - 1);
    const strata = LADDER_BUILDS['glacier-pass'][1], corvoPass = LADDER_BUILDS['glacier-pass'][2];
    expect(probeEvent('glacier-pass', strata, 'clean', 'perfect', 2).time).toBeLessThan(probeEvent('glacier-pass', corvoPass, 'clean', 'perfect', 2).time);
    const halcyon = LADDER_BUILDS['summit-gala'][1], strataGala = LADDER_BUILDS['summit-gala'][2];
    expect(probeEvent('summit-gala', halcyon, 'clean', 'perfect', 2).time).toBeLessThan(probeEvent('summit-gala', strataGala, 'clean', 'perfect', 2).time - 1);
  });
});
