// Engine voices per car: what each engine is, as data for the synthesizer in audio-engine.ts.
// Owned by the Audio workstream. Pitch comes from the car's real tach (src/data/drivetrain.ts: idle / redline rpm)
// and its cylinder count (firing frequency = rpm / 60 × cylinders / 2), so a big V8 burbles low and a V10 shrieks.
// The timbre fields shape the harmonic mix, the exhaust resonances and the extras (turbo, whine, crackle).

export interface EngineSpec {
  /** For people reading the file: what the engine is. */
  layout: string;
  cyl: number;
  /** Harmonic roll-off of the firing pulse (higher = darker). */
  tilt: number;
  /** Extra weight on odd harmonics (hollow, raspy). */
  odd: number;
  /** Sub-order burble (cross-plane V8 rumble, five-cylinder warble): level and ratio to the firing frequency. */
  sub: number;
  subRatio: number;
  /** Cam lope at idle: amplitude wobble depth, and its rate as a ratio of the firing frequency. */
  lope: number;
  lopeRatio: number;
  /** Chance of a dropped firing at idle (a tired engine). */
  misfire?: number;
  /** Exhaust low-pass cutoff at idle and at the redline (Hz), and its resonance. */
  cut: [number, number];
  q: number;
  /** Fixed body / exhaust resonances: [Hz, dB, Q]. */
  formants: [number, number, number][];
  /** How hard the waveshaper is driven (more harmonics, more bark). */
  drive: number;
  /** Intake / mechanical noise level and its band centre (Hz). */
  rasp: number;
  raspHz: number;
  /** Turbo whistle level and its pitch range while spooling; flutter = a chattering blow-off on the lift. */
  turbo?: number;
  turboHz?: [number, number];
  flutter?: boolean;
  /** Electric motor / supercharger whine: level and pitch ratio to the firing frequency. */
  whine?: number;
  whineRatio?: number;
  /** Overrun pops and bangs on the lift and on downshifts. */
  crackle?: number;
  /** A cam change-over: above this fraction of the redline the intake opens up (brighter, louder). */
  vtec?: number;
  /** Loudness trim so every car sits at a similar level. */
  gain: number;
}

export const ENGINES: Record<string, EngineSpec> = {
  // Tapeback 1.1: a tired three-cylinder that coughs, rattles and drops a firing at idle
  junker: { layout: 'I3 1.1, tired', cyl: 3, tilt: 0.7, odd: 0.35, sub: 0.3, subRatio: 1 / 3, lope: 0.35, lopeRatio: 1 / 3, misfire: 0.5,
    cut: [590, 1500], q: 1.6, formants: [[190, 6, 2], [950, -4, 1]], drive: 2.6, rasp: 0.3, raspHz: 900, crackle: 0.25, gain: 0.95 },
  // Corsa Rojo: an honest, even four
  beater: { layout: 'I4 sedan', cyl: 4, tilt: 0.85, odd: 0.1, sub: 0.1, subRatio: 0.5, lope: 0.1, lopeRatio: 0.25,
    cut: [670, 2200], q: 0.8, formants: [[300, 4, 1.5]], drive: 1.5, rasp: 0.16, raspHz: 1400, gain: 0.96 },
  // Vexa GTi: a short-geared turbo four, raspy, with a fluttering blow-off and pops on the lift
  hothatch: { layout: 'I4 turbo', cyl: 4, tilt: 0.6, odd: 0.45, sub: 0.08, subRatio: 0.5, lope: 0.06, lopeRatio: 0.25,
    cut: [870, 3400], q: 1.4, formants: [[520, 5, 2], [2200, 4, 2]], drive: 3, rasp: 0.35, raspHz: 2600, turbo: 0.6, turboHz: [2600, 5200], flutter: true, crackle: 0.5, gain: 1.1 },
  // Ironhorse 455: a big cross-plane V8, deep lope you feel in your chest
  muscle: { layout: 'V8 cross-plane, big block', cyl: 8, tilt: 1.0, odd: 0.2, sub: 0.55, subRatio: 0.5, lope: 0.5, lopeRatio: 0.125,
    cut: [450, 2200], q: 2.2, formants: [[150, 5, 1.2], [450, 4, 1.5], [1500, 4, 1.2]], drive: 2.2, rasp: 0.12, raspHz: 700, crackle: 0.35, gain: 0.72 },
  // Altamar GT: a silky straight-six grand tourer
  tourer: { layout: 'I6 grand tourer', cyl: 6, tilt: 0.8, odd: 0, sub: 0.05, subRatio: 0.5, lope: 0.03, lopeRatio: 0.25,
    cut: [730, 2800], q: 0.7, formants: [[260, 3, 1], [1400, 3, 1.5]], drive: 1.2, rasp: 0.1, raspHz: 1800, gain: 1.04 },
  // Kestrel 1600: a screaming high-revving four with a cam change-over near the top
  tuner: { layout: 'I4 high-rev', cyl: 4, tilt: 0.55, odd: 0.5, sub: 0.05, subRatio: 0.5, lope: 0.05, lopeRatio: 0.25,
    cut: [980, 3800], q: 2.5, formants: [[800, 6, 2.5], [3000, 5, 3]], drive: 2.6, rasp: 0.45, raspHz: 3200, vtec: 0.68, gain: 1.14 },
  // Lumen RS: a flat-plane hybrid V8 over an electric whine (the Surge)
  super: { layout: 'V8 flat-plane hybrid', cyl: 8, tilt: 0.6, odd: 0.35, sub: 0.08, subRatio: 0.5, lope: 0.02, lopeRatio: 0.25,
    cut: [1120, 5000], q: 1, formants: [[600, 4, 1.5], [2600, 5, 2]], drive: 2.4, rasp: 0.25, raspHz: 3800, whine: 0.5, whineRatio: 7.3, gain: 1.14 },
  // Corvo Rally: a gruff turbo five-cylinder warble with anti-lag bangs
  rally: { layout: 'I5 turbo, anti-lag', cyl: 5, tilt: 0.7, odd: 0.2, sub: 0.45, subRatio: 0.4, lope: 0.25, lopeRatio: 0.2,
    cut: [700, 2600], q: 2, formants: [[350, 6, 1.5], [1500, 4, 2]], drive: 3.2, rasp: 0.3, raspHz: 2000, turbo: 0.55, turboHz: [1800, 4200], crackle: 0.85, gain: 0.89 },
  // Strata GTR: a hard-edged race V8, loud and flat, crackling on every shift
  gt: { layout: 'V8 race', cyl: 8, tilt: 0.7, odd: 0.3, sub: 0.35, subRatio: 0.5, lope: 0.15, lopeRatio: 0.125,
    cut: [700, 3600], q: 2.4, formants: [[220, 6, 1.4], [1100, 5, 2]], drive: 3.5, rasp: 0.3, raspHz: 1600, crackle: 0.6, gain: 0.73 },
  // Halcyon X: a screaming hybrid V6 over a turbine-like motor whine
  proto: { layout: 'V6 turbo hybrid', cyl: 6, tilt: 0.55, odd: 0.45, sub: 0.05, subRatio: 0.5, lope: 0, lopeRatio: 0.25,
    cut: [1260, 6000], q: 1.2, formants: [[900, 4, 2], [3200, 4, 2]], drive: 2.2, rasp: 0.2, raspHz: 4200, turbo: 0.3, turboHz: [3500, 7000], whine: 0.6, whineRatio: 11, gain: 1.2 },
  // Vireo 9R: a light, high-revving V10 shriek
  vireo: { layout: 'V10 high-rev', cyl: 10, tilt: 0.5, odd: 0.55, sub: 0.15, subRatio: 0.2, lope: 0.05, lopeRatio: 0.1,
    cut: [1260, 6500], q: 1.6, formants: [[700, 5, 2], [2900, 6, 2.5]], drive: 2.8, rasp: 0.3, raspHz: 3600, crackle: 0.3, gain: 1.1 },
  // Mako TT: a twin-turbo V8, muffled by the turbos, with a loud whistle and a whooshing blow-off
  mako: { layout: 'V8 twin-turbo', cyl: 8, tilt: 0.95, odd: 0.2, sub: 0.45, subRatio: 0.5, lope: 0.2, lopeRatio: 0.125,
    cut: [500, 2600], q: 1.6, formants: [[160, 5, 1.2], [650, 4, 1.5], [1800, 3, 1.5]], drive: 2.6, rasp: 0.15, raspHz: 1000, turbo: 0.95, turboHz: [2200, 6000], crackle: 0.4, gain: 0.83 },
  // Sovereign: the flagship V12 hybrid, smooth and refined, with a low motor hum under it
  sovereign: { layout: 'V12 hybrid flagship', cyl: 12, tilt: 0.65, odd: 0.1, sub: 0.04, subRatio: 0.5, lope: 0, lopeRatio: 0.25,
    cut: [980, 4800], q: 0.9, formants: [[400, 4, 1], [1900, 5, 1.5]], drive: 1.6, rasp: 0.15, raspHz: 2600, whine: 0.35, whineRatio: 5.1, gain: 1.24 },
  // Ardent Spyder: a screaming, naturally aspirated high-revving four right behind your head — raw intake howl,
  // a hard cam change-over near the top and a few crackles on the lift
  ardent: { layout: 'I4 high-rev, open intake', cyl: 4, tilt: 0.48, odd: 0.55, sub: 0.04, subRatio: 0.5, lope: 0.04, lopeRatio: 0.25,
    cut: [1100, 4600], q: 2.2, formants: [[900, 6, 2.5], [3400, 6, 3]], drive: 2.9, rasp: 0.5, raspHz: 3600, vtec: 0.72, crackle: 0.25, gain: 1.12 },
  // Meridian LT: a smooth long-legged V12 cruiser — even, silky, barely any burble, opening out up top
  meridian: { layout: 'V12 long-tail cruiser', cyl: 12, tilt: 0.75, odd: 0.05, sub: 0.06, subRatio: 0.5, lope: 0, lopeRatio: 0.25,
    cut: [880, 4200], q: 0.8, formants: [[330, 4, 1], [1600, 4, 1.4]], drive: 1.4, rasp: 0.12, raspHz: 2200, gain: 1.2 },
  // Tempest E4: four electric motors — a clean, nearly pure motor tone (no idle burble, no lope, no crackle), a
  // rising motor whine over it and a high inverter whistle that comes in with load
  tempest: { layout: 'Four electric motors', cyl: 4, tilt: 1.4, odd: 0, sub: 0, subRatio: 0.5, lope: 0, lopeRatio: 0.25,
    cut: [1400, 6500], q: 0.7, formants: [[1200, 3, 1.2]], drive: 0.6, rasp: 0.06, raspHz: 5200, turbo: 0.35, turboHz: [6200, 9400], whine: 0.95, whineRatio: 6.2, gain: 1.15 },

  // ---- voices for the opponent-only cars (src/data/rivalCars.ts RIVAL_LOOKS → voice); pitch follows the rival's class
  // Pellet K-Van / Mote 660: a tiny buzzing kei triple
  kei: { layout: 'I3 660 kei', cyl: 3, tilt: 0.6, odd: 0.4, sub: 0.15, subRatio: 1 / 3, lope: 0.12, lopeRatio: 1 / 3,
    cut: [900, 3200], q: 1.4, formants: [[420, 4, 2], [1800, 4, 2]], drive: 2.2, rasp: 0.35, raspHz: 2400, gain: 1.05 },
  // Haulmark 2500 / Dunerunner T8: a lazy, loose truck V8 with a deep exhaust drone
  v8truck: { layout: 'V8 truck, long stroke', cyl: 8, tilt: 1.1, odd: 0.15, sub: 0.6, subRatio: 0.5, lope: 0.4, lopeRatio: 0.125,
    cut: [380, 1700], q: 2.4, formants: [[120, 6, 1.2], [380, 4, 1.4]], drive: 2.0, rasp: 0.1, raspHz: 600, crackle: 0.2, gain: 0.74 },
  // Dray Courier: a rattly work-van four with a hollow drone
  van: { layout: 'I4 work van', cyl: 4, tilt: 0.95, odd: 0.3, sub: 0.2, subRatio: 0.5, lope: 0.08, lopeRatio: 0.25,
    cut: [560, 1900], q: 1.2, formants: [[240, 5, 1.6], [800, 3, 1.5]], drive: 1.9, rasp: 0.28, raspHz: 1100, gain: 0.98 },
  // Cordell Six: a turbo straight six, smooth until the boost comes in
  turbo6: { layout: 'I6 turbo, sleeper', cyl: 6, tilt: 0.75, odd: 0.1, sub: 0.08, subRatio: 0.5, lope: 0.04, lopeRatio: 0.25,
    cut: [700, 3000], q: 1.0, formants: [[280, 4, 1.2], [1500, 4, 1.6]], drive: 1.8, rasp: 0.15, raspHz: 1900, turbo: 0.7, turboHz: [2400, 5600], flutter: true, gain: 1.0 },
  // Tessera DR: a buzzing twin-rotor, all rasp and pops
  rotary: { layout: 'Twin rotor', cyl: 4, tilt: 0.5, odd: 0.6, sub: 0.05, subRatio: 0.5, lope: 0.1, lopeRatio: 0.5,
    cut: [1000, 4200], q: 2.0, formants: [[700, 6, 2.2], [2600, 5, 2.5]], drive: 3.2, rasp: 0.5, raspHz: 3000, crackle: 0.8, gain: 1.08 },
  // Sandpiper Buggy: an air-cooled flat four, a clattering offbeat thrum
  boxer: { layout: 'Flat-4 air-cooled', cyl: 4, tilt: 0.8, odd: 0.25, sub: 0.4, subRatio: 0.5, lope: 0.3, lopeRatio: 0.25,
    cut: [600, 2400], q: 1.6, formants: [[320, 5, 1.6], [1200, 4, 2]], drive: 2.4, rasp: 0.32, raspHz: 1500, crackle: 0.3, gain: 0.96 },
};

// 1.10 Redline (Progression, marked): the Kestrel 1600 R is the Kestrel's four, louder and rawer (straight-cut, more rasp)
ENGINES.kestrelr = { ...ENGINES.tuner, layout: 'I4 high-rev, race build', drive: 3.0, rasp: 0.6, raspHz: 3400, crackle: 0.4, gain: 1.16 };
export const engineFor = (car: string): EngineSpec => ENGINES[car] ?? ENGINES.beater;
