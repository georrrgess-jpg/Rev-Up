// Rev Up — what each rival's car looks like (cosmetic only). A rival's `car` stays its performance class: physics,
// drivetrain, full top speed and launch control all read it. `look` (on Rival, cloned into the race Racer) picks the
// body that is drawn, named and voiced instead: one of the twenty opponent-only designs (art in src/render/rivalArt.ts)
// or, for one-make grids where the point is that everyone drives the same model, a roster car with its own build
// (wheels, livery, finish) so the three cars on the grid still look different. Each look belongs to exactly one
// performance class, the rival's own, so race balance does not change (tests/art.test.ts checks every pairing).
import type { CarId, Rival } from './tables';
import { carById } from './tables';

/** Cosmetic build on a roster body (the same fields as the Paint shop's CarStyle). */
export interface LookStyle { wheel?: string; livery?: string; material?: string; restore?: number; concours?: number }

export interface RivalLook {
  id: string;
  /** Model name, shown wherever the rival's car is named. */
  model: string;
  /** Body drawn: an opponent-only art id ('rv-…') or a roster car id. */
  art: string;
  /** The performance class this look belongs to (must equal the rival's `car`). */
  car: CarId;
  /** Length in metres (the drawn body's; lane spacing and effects use it). */
  L: number;
  /** Trim colour the body is drawn with (accents, two-tones, signs); the rival's paint is the body colour. */
  trim: string;
  /** Art-sheet paint (rivals race in their own). */
  paint: string;
  /** Roster-body builds only. */
  style?: LookStyle;
  /** Engine voice (src/audio-voices.ts ENGINES key); pitch still follows the class's tach. */
  voice: string;
  /** Launch effect (src/render/raceFx.ts LAUNCH_FX key). */
  fx: string;
  /** One line on what it is. */
  blurb: string;
}

const L = (id: CarId | string) => ({ junker: 3.65, beater: 4.15, hothatch: 3.95, muscle: 4.85, tourer: 4.75, tuner: 3.98, rally: 4.15, mako: 4.62, ardent: 4.05 } as Record<string, number>)[id] ?? 4.5;
/** A roster body with its own build, for one-make grids. */
const build = (id: string, model: string, car: CarId, paint: string, trim: string, style: LookStyle, blurb: string): RivalLook =>
  ({ id, model, art: car, car, L: L(car), trim, paint, style, voice: car, fx: car, blurb });

export const RIVAL_LOOKS: Record<string, RivalLook> = {
  // ---- opponent-only designs (src/render/rivalArt.ts)
  'rv-kvan': { id: 'rv-kvan', model: 'Pellet K-Van', art: 'rv-kvan', car: 'junker', L: 3.4, trim: '#ece6d6', paint: '#5f8fa0', voice: 'kei', fx: 'junker', blurb: 'Cab-over kei microvan: no hood, tiny wheels, a roof rack.' },
  'rv-mote': { id: 'rv-mote', model: 'Mote 660', art: 'rv-mote', car: 'junker', L: 3.16, trim: '#f1efe8', paint: '#d9a441', voice: 'kei', fx: 'junker', blurb: 'Tall-boy kei hatch with a contrast roof and big round eyes.' },
  'rv-brava': { id: 'rv-brava', model: 'Brava 850', art: 'rv-brava', car: 'junker', L: 3.75, trim: '#2a2c30', paint: '#8a6d9e', voice: 'junker', fx: 'junker', blurb: 'Little 1970s two-door saloon: chrome bumpers, a primer bonnet, a crate on the roof.' },
  'rv-haulmark': { id: 'rv-haulmark', model: 'Haulmark 2500', art: 'rv-haulmark', car: 'beater', L: 5.05, trim: '#c9ced3', paint: '#7a5c3a', voice: 'v8truck', fx: 'muscle', blurb: 'Rusty work pickup: a door-sized chrome grille, steel wheels, an amber beacon.' },
  'rv-dray': { id: 'rv-dray', model: 'Dray Courier', art: 'rv-dray', car: 'beater', L: 4.7, trim: '#e8641c', paint: '#3f7f8c', voice: 'van', fx: 'beater', blurb: 'High-roof delivery van with a sign on the side and a ladder on the roof.' },
  'rv-ostler': { id: 'rv-ostler', model: 'Ostler Estate', art: 'rv-ostler', car: 'beater', L: 4.95, trim: '#d9cfb8', paint: '#a0522d', voice: 'tourer', fx: 'junker', blurb: 'Long 1970s woodgrain estate, rust breaking through.' },
  'rv-lark': { id: 'rv-lark', model: 'Lark Roadster', art: 'rv-lark', car: 'hothatch', L: 3.95, trim: '#7a1f24', paint: '#2d6a4f', voice: 'tuner', fx: 'hothatch', blurb: 'Small open two-seater with a framed screen and a folded hood.' },
  'rv-vanta': { id: 'rv-vanta', model: 'Vanta Coupé', art: 'rv-vanta', car: 'hothatch', L: 4.1, trim: '#f2b33d', paint: '#c9a227', voice: 'hothatch', fx: 'hothatch', blurb: 'Compact hatch coupé: long fastback, slit lamps, a hatch spoiler.' },
  'rv-cordell': { id: 'rv-cordell', model: 'Cordell Six', art: 'rv-cordell', car: 'muscle', L: 4.9, trim: '#3a3f44', paint: '#264653', voice: 'turbo6', fx: 'tourer', blurb: 'The sleeper: a plain four-door family sedan. Fat rear tyres and twin pipes give it away.' },
  'rv-prism': { id: 'rv-prism', model: 'Prism 88', art: 'rv-prism', car: 'muscle', L: 4.55, trim: '#f2b33d', paint: '#3d3a6b', voice: 'muscle', fx: 'muscle', blurb: 'Razor-edged 1980s wedge with rear louvres and pop-up lamps.' },
  'rv-regent': { id: 'rv-regent', model: 'Aldermoor Regent', art: 'rv-regent', car: 'tourer', L: 5.35, trim: '#d8b867', paint: '#9a9fa8', voice: 'meridian', fx: 'tourer', blurb: 'Formal luxury saloon: vinyl roof, chrome everywhere, a hood ornament.' },
  'rv-tessera': { id: 'rv-tessera', model: 'Tessera DR', art: 'rv-tessera', car: 'tuner', L: 4.5, trim: '#ff3d6e', paint: '#20c4c4', voice: 'rotary', fx: 'tuner', blurb: 'Drift coupé on deep-dish wheels: bolted overfenders, a big wing, a tow strap.' },
  'rv-dunerunner': { id: 'rv-dunerunner', model: 'Dunerunner T8', art: 'rv-dunerunner', car: 'rally', L: 5.4, trim: '#f5c518', paint: '#c23b22', voice: 'v8truck', fx: 'rally', blurb: 'Desert trophy truck: huge long-travel wheels, a cage over the bed, a light bar.' },
  'rv-sandpiper': { id: 'rv-sandpiper', model: 'Sandpiper Buggy', art: 'rv-sandpiper', car: 'rally', L: 3.55, trim: '#f2efe6', paint: '#3c7d4f', voice: 'boxer', fx: 'rally', blurb: 'Open dune buggy: a short tub, a tall cage, the engine out in the air.' },
  'rv-aster': { id: 'rv-aster', model: 'Aster GT1', art: 'rv-aster', car: 'gt', L: 5.1, trim: '#f2c230', paint: '#1c4fa0', voice: 'vireo', fx: 'gt', blurb: 'Long-tail endurance racer: a roof intake, covered lamps, a wing past the tail.' },
  'rv-halden': { id: 'rv-halden', model: 'Halden Aero LM', art: 'rv-halden', car: 'gt', L: 5.2, trim: '#e8e2d0', paint: '#f2f2f2', voice: 'proto', fx: 'proto', blurb: 'Low-drag streamliner: a teardrop body, a tail fin and a spat over the rear wheel.' },
  'rv-corsair': { id: 'rv-corsair', model: 'Corsair Targa', art: 'rv-corsair', car: 'vireo', L: 4.45, trim: '#c9ced3', paint: '#1d6b4a', voice: 'super', fx: 'vireo', blurb: 'Mid-engined targa: a brushed roll bar over a black roof panel.' },
  'rv-varga': { id: 'rv-varga', model: 'Varga Twin-T', art: 'rv-varga', car: 'mako', L: 4.75, trim: '#ff5a1f', paint: '#3a3f47', voice: 'gt', fx: 'mako', blurb: 'Twin-turbo shooting brake: a supercar stance, a long roof, twin side pipes.' },
  'rv-wisp': { id: 'rv-wisp', model: 'Wisp Clubman', art: 'rv-wisp', car: 'ardent', L: 3.9, trim: '#c2202a', paint: '#f4f1e6', voice: 'tuner', fx: 'ardent', blurb: 'Vintage-style club racer: a round barchetta, an aero screen, wire wheels.' },
  'rv-kade': { id: 'rv-kade', model: 'Kade Q4', art: 'rv-kade', car: 'sovereign', L: 4.8, trim: '#ff3df2', paint: '#e6f6f8', voice: 'tempest', fx: 'kade', blurb: 'A four-motor launch car built in a harbour shed: wheelie bar, tall wing, magenta light.' },

  // ---- roster bodies with their own builds (one-make grids, and characters whose car is the point)
  'tb-nell': build('tb-nell', 'Tapeback 1.1 “Three-in-One”', 'junker', '#5e7d4a', '#2a2c30', { restore: 2, wheel: 'dish', livery: 'twotone' }, 'Built from three Tapebacks: straight panels, deep-dish wheels.'),
  'tb-oz': build('tb-oz', 'Tapeback 1.1 Tow Spec', 'junker', '#8c5a7a', '#2a2c30', { restore: 1, wheel: 'steel', livery: 'stripes' }, 'Rust fixed, tape gone, twin stripes.'),
  'tb-pip': build('tb-pip', 'Tapeback 1.1 Club', 'junker', '#c48a3a', '#2a2c30', { restore: 3, wheel: 'fivespoke', livery: 'number' }, 'Fully restored, race number, five-spokes.'),
  'cr-bolt': build('cr-bolt', 'Corsa Rojo Drag', 'beater', '#4a6b3a', '#2a2c30', { wheel: 'dish', livery: 'stripes' }, 'Deep-dish wheels and stripes: built for the launch.'),
  'cr-ines': build('cr-ines', 'Corsa Rojo Touring', 'beater', '#4f6d8c', '#2a2c30', { wheel: 'turbine', livery: 'twotone' }, 'Two-tone, turbine wheels, a logbook in the glovebox.'),
  'cr-bram': build('cr-bram', 'Corsa Rojo Taxi', 'beater', '#8b7d5a', '#2a2c30', { wheel: 'steel', livery: 'checker' }, 'A retired cab with the checker band still on.'),
  'cr-otto': build('cr-otto', 'Corsa Rojo Concours', 'beater', '#5d2f3a', '#2a2c30', { wheel: 'wire', concours: 3, material: 'metallic' }, 'Restored to show standard.'),
  'vx-zoe': build('vx-zoe', 'Vexa GTi Purist', 'hothatch', '#d1d63f', '#d8312a', { wheel: 'fivespoke', livery: 'stripes' }, 'Factory wheels and twin stripes.'),
  'vx-rafa': build('vx-rafa', 'Vexa GTi Rally', 'hothatch', '#2b8a5a', '#d8312a', { wheel: 'gravel', livery: 'rally' }, 'Gravel wheels and rally slashes.'),
  'vx-kit': build('vx-kit', 'Vexa GTi Apex', 'hothatch', '#c2462e', '#d8312a', { wheel: 'race', livery: 'number' }, 'Race wheels and a door number.'),
  'ih-hank': build('ih-hank', 'Ironhorse 455 Two-Tone', 'muscle', '#6b2737', '#d0a050', { livery: 'twotone', wheel: 'dish' }, 'Two colours and zero patience.'),
  'ih-mara': build('ih-mara', 'Ironhorse 455 Drag', 'muscle', '#3d3a6b', '#f2b33d', { livery: 'sweep', wheel: 'race' }, 'The drag-strip car, out of retirement.'),
  'ih-sol': build('ih-sol', 'Ironhorse 455 Grand', 'muscle', '#264653', '#c9a14a', { wheel: 'wire', material: 'metallic' }, 'Metallic paint and wire wheels.'),
  'al-lux': build('al-lux', 'Altamar GT Collector', 'tourer', '#9a9fa8', '#e9d8b4', { wheel: 'wire', material: 'pearl' }, 'Pearl paint and wire wheels.'),
  'al-rhea': build('al-rhea', 'Altamar GT Black Cherry', 'tourer', '#c0185b', '#e9d8b4', { material: 'candy', livery: 'sweep', wheel: 'race' }, 'Candy paint, a side sweep, new tyres.'),
  'ks-kai': build('ks-kai', 'Kestrel 1600 Neon', 'tuner', '#20c4c4', '#2a2c30', { livery: 'neon', wheel: 'race' }, 'Neon lines for the coast at night.'),
  'ks-ozzy': build('ks-ozzy', 'Kestrel 1600 Lime', 'tuner', '#8cff3a', '#2a2c30', { livery: 'checker', wheel: 'fivespoke' }, 'Lime green with a checker fade.'),
  'ks-odin': build('ks-odin', 'Kestrel 1600 Desert', 'tuner', '#ff7a1a', '#2a2c30', { livery: 'rally', wheel: 'gravel' }, 'Still has sand in the vents.'),
  'cv-tomas': build('cv-tomas', 'Corvo Rally Tarmac', 'rally', '#c23b22', '#f5c518', { livery: 'number', wheel: 'race' }, 'Tarmac wheels for once.'),
  'cv-wren': build('cv-wren', 'Corvo Rally Crest', 'rally', '#3c7d4f', '#f5c518', { livery: 'sweep', wheel: 'dish' }, 'Dented, swept, never lifting.'),
};

/** The look of a rival (undefined: it drives its class's roster car as it comes). */
export const rivalLook = (id?: string | null): RivalLook | undefined => (id ? RIVAL_LOOKS[id] : undefined);
/** The body drawn for a racer or rival: its look's art, else its class's own car. */
export const artOf = (r: { car: CarId; look?: string }): string => rivalLook(r.look)?.art ?? r.car;
/** The name of a rival's car as shown in the menus, briefs and summaries. */
export const rivalCarModel = (r: Pick<Rival, 'car'> & { look?: string }): string => rivalLook(r.look)?.model ?? carById(r.car).model;

/*
 * Who drives what is set on each rival (`look` in src/data/tables.ts RIVALS and src/data/circuit.ts CIRCUIT_RIVALS).
 * Rivals without a look keep their roster car as it comes, because the car is the point: Nova's Lumen (“the only
 * other Lumen”), Vale's and Rhea's Altamars, Mina's Ironhorse, Ozzy's and Odin's Kestrels, Yara's and Sable's Corvos,
 * Bex's Strata, the Halcyon twins (Iver, Ilse, Sorin), Anouk's Vireo, Dario's Mako, Mika's Ardent, Lorne's Meridian,
 * Aurelia's Sovereign, Zara's Tempest, and the Stock Cup (three different stock roster cars).
 */
