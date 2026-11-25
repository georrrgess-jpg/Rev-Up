// Engine voices per car (reveal rev and race hum). Owned by the art workstream; the race workstream reads them.
export type Layer = [OscillatorType, number, number];
export interface Voice { layers: Layer[]; filter: BiquadFilterType; cut: number; q: number; lope: number; lopeHz: number; blips?: boolean; hum: number }
/** Engine voices: Tapeback misfires, Corsa hums, Vexa rasps with quick blips, Ironhorse lopes deep. */
export const VOICES: Record<string, Voice> = {
  junker: { layers: [['square', 1, 0], ['sawtooth', 0.5, 14]], filter: 'lowpass', cut: 1100, q: 2, lope: 0.45, lopeHz: 11, hum: 0.9 },
  beater: { layers: [['sawtooth', 1, 0], ['triangle', 2, 5]], filter: 'lowpass', cut: 1600, q: 1, lope: 0.15, lopeHz: 9, hum: 1 },
  hothatch: { layers: [['sawtooth', 1, 0], ['sawtooth', 2, 9], ['square', 3, -6]], filter: 'bandpass', cut: 2400, q: 1.6, lope: 0.08, lopeHz: 14, blips: true, hum: 1.25 },
  muscle: { layers: [['sawtooth', 1, 0], ['sawtooth', 1, 22], ['square', 0.5, 0]], filter: 'lowpass', cut: 900, q: 3, lope: 0.4, lopeHz: 7.5, hum: 0.7 },
  tourer: { layers: [['sawtooth', 1, 0], ['triangle', 2, 4], ['sawtooth', 1.5, 11]], filter: 'lowpass', cut: 1500, q: 1.2, lope: 0.06, lopeHz: 16, hum: 0.85 },
  // Kestrel 1600: a thin, high-revving four with a raspy intake
  tuner: { layers: [['square', 1, 0], ['sawtooth', 2, 7], ['square', 4, -9]], filter: 'bandpass', cut: 3200, q: 2.2, lope: 0.05, lopeHz: 22, blips: true, hum: 1.5 },
  // Lumen RS: a smooth V12 under an electric whine
  super: { layers: [['sawtooth', 1, 0], ['sawtooth', 1.5, 3], ['sine', 6, 0], ['triangle', 3, -4]], filter: 'lowpass', cut: 2600, q: 0.9, lope: 0.03, lopeHz: 28, hum: 1.1 },
};

