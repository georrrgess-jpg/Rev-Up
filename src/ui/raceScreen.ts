import { Look, SceneView, drawBackdrop, drawForeground, drawRoadDressing, roadColors, sceneLights, sceneLook } from '../render/scene';
import { RaceFx, drawCourseSigns, drawTrackside } from '../render/raceFx';
import { resultCard } from './results';
import type { RaceView } from './raceMenu';
import { carStyle } from '../core/style';
import { resumeAudio, sfx, suspendAudio } from '../audio';
import { music } from '../audio-api';
import { RaceAudio, RivalAudio, launchControlSound } from '../audio-race';
import { CircuitResult, Ghost, explainFinish, ghostDelta, ghostX, keepsGhost, readGhost } from '../core/circuit';
import { openFitParts } from './fit';
import { RaceCoach, wantsRaceCoach } from './firstRun'; // [onboard] first-run race coaching hook
import { DownshiftRecord, GearEvent, RaceOutcome, RaceSetup, RaceSim, ShiftRecord, SimAudioState, speedMph } from '../core/race';
import { drivetrainFor } from '../data/drivetrain';
import { mph } from '../core/units';
import type { TestProbe } from '../core/testDrive';
import { RunChanges, RunSummary, compareRuns, summarize } from '../core/runReport';
import { competitionSummary } from '../core/circuit';
import { Gauge, ShiftCue, gaugeRange } from './raceGauge';
import type { LastResult } from '../core/state';
import { CarId, Family, RACE, RIVALS, carById, eventById, finishStripe, trackLength } from '../data/tables';
import { CarStyle, carLengthM, drawCar, fitCanvas } from '../render/car';
import { artOf, rivalLook } from '../data/rivalCars';
import type { Racer } from '../core/race';
import type { App } from './app';
import { h, ordinal } from './dom';

/** Track canvas resolution tiers (device pixels per CSS pixel, capped by the screen's own): full, then two steps a
 *  slow phone falls back to — chosen in the countdown, or after two slow seconds mid-race. */
const RES_TIERS = [2, 1.5, 1.15];

/** Lane per racer index (racer 0 runs in lane 1, …); back lanes are drawn first. */
const LANE_OF = [1, 3, 0, 2];
const desktop = () => typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;

/** Post-race telemetry rows for the result card: speed, shifting, boosts, and the one thing to fix. */
export function telemetryRows(o: RaceOutcome, windows: number): HTMLElement[] {
  const shifts = o.shifts ?? 0;
  const clean = o.shiftsClean ?? 0;
  const log = (o.shiftLog ?? []).filter((s) => s.grade !== 'assist');
  const mark = { clean: '✓', early: 'early', late: 'late', missed: 'missed', assist: '' } as const;
  const launch = o.standings.find((r) => r.isPlayer)?.splits[0];
  // a compact post-race cluster: top speed big, then launch, clean inputs and boosts
  const rows: HTMLElement[] = [
    h('div', { class: 'race-telemetry cluster-readout', 'aria-label': 'Race telemetry' },
      h('div', { class: 'tm big' }, h('span', {}, 'Top speed'), h('b', { class: 'num' }, `${mph(o.topSpeed ?? 0)}`, h('small', {}, ' mph'))),
      launch !== undefined ? h('div', { class: 'tm' }, h('span', {}, 'Launch'), h('b', { class: 'num' }, `${launch.toFixed(2)} s`)) : null,
      h('div', { class: 'tm' }, h('span', {}, 'Clean shifts'), h('b', { class: 'num' }, `${clean}/${shifts}`)),
      h('div', { class: 'tm' }, h('span', {}, 'Perfect boosts'), h('b', { class: 'num' }, `${o.perfects}/${windows}`))),
  ];
  if (log.length) rows.push(h('div', { class: 'shift-strip', 'aria-label': 'Shifts' }, ...log.map((s) => h('span', { class: `sg ${s.grade}` }, `${s.into + 1}`, h('small', {}, mark[s.grade])))));
  if (o.coach) rows.push(h('p', { class: `race-coach ${o.coach.kind}` }, h('b', {}, o.coach.kind === 'shift' ? 'Shifting · ' : o.coach.kind === 'boost' ? 'Boost · ' : 'Build · '), o.coach.text));
  return rows;
}

/** Circuit rows for the result card: the ghost comparison, what this race earned once, the ladder step, and why the
 *  finish went the way it did (from the race's own splits and stats) with one useful change. */
export function circuitRows(app: App, o: RaceOutcome, c: CircuitResult | null, onAction: (car: CarId, family?: Family) => void, onTest?: (car: CarId, family: Family, tier?: number) => void): HTMLElement[] {
  const rows: HTMLElement[] = [];
  if (c?.ghostT != null && c.ghostDelta != null) {
    const d = c.ghostDelta;
    rows.push(h('div', { class: `ghost-row ${d < 0 ? 'ahead' : 'behind'}` }, h('b', {}, 'Ghost '), `best ${c.ghostT.toFixed(2)} s · this run ${o.playerTime?.toFixed(2)} s · `,
      h('b', { class: 'num' }, `${d < 0 ? '−' : '+'}${Math.abs(d).toFixed(2)} s`), c.newGhost ? ' · new ghost saved' : ''));
  } else if (c?.newGhost) rows.push(h('div', { class: 'ghost-row' }, h('b', {}, 'Ghost saved: '), 'race it next time — it runs beside you.'));
  for (const e of c?.earned ?? []) rows.push(h('div', { class: 'cx-earned' }, h('b', {}, `✓ ${e.name}`), ` · ${e.prize}`));
  if (c?.rung) rows.push(h('div', { class: 'cx-earned rung' }, h('b', {}, 'Rival ladder '), `${c.ladder.position}/${c.ladder.of} — you beat ${RIVALS[c.rung]?.name ?? c.rung}`));
  const x = explainFinish(o, app.game.state);
  if (x.foe || x.reasons.length) {
    const a = x.suggestion.action;
    const car = o.standings.find((r) => r.isPlayer)?.car;
    rows.push(h('div', { class: `cx-why${x.close ? ' close' : ''}`, 'aria-label': 'Why this result' },
      h('b', { class: 'cx-head' }, x.headline),
      x.reasons.length ? h('ul', {}, ...x.reasons.map((r) => h('li', {}, r))) : null,
      h('p', { class: 'cx-tip' }, x.suggestion.text,
        car && a && (a.kind === 'fit' || a.kind === 'upgrade') ? h('button', { class: 'btn sm', onclick: () => onAction(car, a.family) }, 'Fit parts') : null,
        car && a?.family && onTest && (a.kind === 'fit' || a.kind === 'upgrade') ? h('button', { class: 'btn sm', onclick: () => onTest(car, a.family!, a.tier) }, 'Test it') : null)));
  }
  // a rival challenge still open on this event: its prize, so a loss shows what a win here is worth
  if (o.place > 1 && o.eventId) {
    const rung = competitionSummary(app.game.state).ladder.rungs.find((r) => r.event === o.eventId && !r.beaten && r.open);
    if (rung) rows.push(h('div', { class: 'cx-earned prize' }, h('b', {}, `Beat ${rung.name} here: `), rung.prize));
  }
  return rows;
}

/** Previous run per event this session (what changed since the last try). */
const lastRuns = new Map<string, RunSummary>();

/** "What changed" since the last run of this event (or the personal best). */
export function changeRows(ch: RunChanges | null): HTMLElement[] {
  if (!ch || !ch.rows.length) return [];
  return [h('div', { class: `run-changes ${ch.against}`, 'aria-label': ch.against === 'last' ? 'Since your last run' : 'Against your best' },
    h('b', { class: 'rc-head' }, ch.headline),
    ch.rows.length > 1 ? h('div', { class: 'rc-grid' }, ...ch.rows.map((r) => h('div', { class: `rc ${r.better === true ? 'up' : r.better === false ? 'down' : ''}` },
      h('span', {}, r.label), h('b', { class: 'num' }, r.now), h('small', { class: 'num' }, `${r.better === true ? '▲ ' : r.better === false ? '▼ ' : ''}was ${r.was}`)))) : null)];
}

/** The last race started (a retry of the same event within two minutes gets the short countdown). */
let lastStart = { id: '', at: 0 };


/**
 * Everything the race sound needs for one frame (RaceScreen.audioFrame()): the sim's engine/tyre/nitro snapshot of the
 * player's car, the gear changes since the previous frame (up or down; clean / early / late / missed / assist /
 * auto-down; `auto` when the box did it), and where the race is: staging (the countdown burnout, with its 0..1
 * build-up), racing, or finished.
 */
export interface RaceAudioSnapshot extends SimAudioState {
  events: GearEvent[];
  phase: 'staging' | 'racing' | 'finished';
  /** 0..1: the staging burnout's build-up (revs held against the brake), 0 once racing. */
  burnout: number;
  paused: boolean;
}

interface Particle { x: number; y: number; vx: number; vy: number; life: number; c: string; s: number }

/** A Test & Compare run (src/ui/testDrive.ts): solo on the test course, nothing committed or paid, measured by the
 *  probe every sim step; `onDone` gets the finished run (or null when the player leaves it). */
export interface TestRunOpts { label: string; probe: TestProbe; onDone: (o: RaceOutcome | null, sim: RaceSim) => void }
export interface RaceScreenOpts { test?: TestRunOpts }

export class RaceScreen {
  el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private sim: RaceSim;
  private posEl: HTMLElement;
  private timeEl: HTMLElement;
  private standEl: HTMLElement;
  private progEl: HTMLElement;
  private dots: HTMLElement[] = [];
  private callout: HTMLElement;
  private nitroBtn: HTMLButtonElement;
  private hintEl: HTMLElement;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private countdown: number;
  private paused = false;
  private pauseEl: HTMLElement | null = null;
  private finished = false;
  private particles: Particle[] = [];
  private hum: RaceAudio;
  private lastHud = 0;
  private cueDone = new Set<number>();
  private calloutTimer = 0;
  private quality = 1; // 1 full, 0 reduced effects
  /** 1.10: the track canvas's resolution tier (RES_TIERS), chosen from the countdown's own frames before GO. */
  private resTier = 0;
  private cdFrames: number[] = [];
  private resDecided = false;
  private warmPpm = 0;
  private needWarm = false;
  private frameTimes: number[] = [];
  private dpr = 1;
  private reduced: boolean;
  private zoom = 0;
  private zoomTarget = 0;
  private lookT = 0;
  private ticker!: HTMLElement;
  private flash!: HTMLElement;
  private tickerTimer = 0;
  private lastOrder = '';
  private shake = 0;
  private kick = 0;
  private finishHold = 0; // real seconds shown after the player crosses the line
  private result: LastResult | null = null;
  private prevV: number[] = [];
  private slowWindows = 0;
  private gainShown: object | null = null;
  private eventName: string;
  private shiftBtn: HTMLButtonElement;
  private gradeEl: HTMLElement;
  private gauge: Gauge;
  private cue: ShiftCue = 'off';
  private shiftShown: ShiftRecord | null = null;
  private downShown: DownshiftRecord | null = null;
  private gradeTimer = 0;
  private assistTold = false;
  private missTold = false;
  private outcome: RaceOutcome | null = null;
  private lastFrameDt = 0;
  private closed = false;
  private look: Look;
  private fx: RaceFx;
  private gearSeq = 0;
  private countdown0: number;
  /** Time trial: the personal-best ghost raced, its HUD delta and progress-bar dot. */
  private ghost: Ghost | null = null;
  private ghostEl: HTMLElement;
  private ghostDot: HTMLElement | null = null;
  private rivalsAudio: RivalAudio;
  private circuit: CircuitResult | null = null;
  /** Drama camera: seconds left of an overtake close-up, and the rival in it. */
  private dramaT = 0;
  private dramaFoe: string | null = null;
  /** 1.10: a short tag over the car in a pass ("PASSED" / "PASSES YOU"), and the rival moments already called out. */
  private passTag: { id: string; text: string; t: number; good: boolean } | null = null;
  private momentSeq = 0;
  private defendTold = false;
  private frameNo = 0;
  private finishLock = 0;
  private curtain: HTMLElement;
  /** Car sprites still to render ahead of the GO zoom (one per countdown frame, off the input path). */
  private warmQueue: (() => void)[] | null = null;

  private test: TestRunOpts | null;
  private changes: RunChanges | null = null;
  constructor(private app: App, private setup: RaceSetup, private raceId: number, private onClose: () => void, opts: RaceScreenOpts = {}) {
    this.test = opts.test ?? null;
    // the live race takes the player's SHIFT input; Quick Race and the bots shift for themselves
    this.sim = new RaceSim({ ...setup, shift: 'manual' });
    if (import.meta.env.DEV) (window as unknown as { __race?: RaceScreen }).__race = this;
    this.hum = new RaceAudio(this.sim, app.game.state.installed?.[setup.player.car]); // engine voice with the fitted engine / turbo
    this.reduced = app.game.state.settings.reducedMotion;
    // a retry of the same event soon after gets the short countdown: one tap and you are racing again
    const quick = !!this.test || (lastStart.id === setup.eventId && Date.now() - lastStart.at < 120_000);
    if (!this.test) lastStart = { id: setup.eventId, at: Date.now() };
    // the first Tempest race (launch control never landed yet) always gets the full countdown, to read the LAUNCH cue
    const teachLaunch = this.sim.hasLaunchControl && !app.game.state.stats.milestones['cx:launch-control'];
    this.countdown = this.reduced ? 1.2 : quick && !teachLaunch ? 1.6 : 2.4;
    const ev0 = eventById(setup.eventId);
    this.ghost = keepsGhost(ev0) && !app.game.rivalRunName && !this.test ? readGhost(app.game.state, ev0.id) : null;
    this.rivalsAudio = new RivalAudio(this.sim);
    this.countdown0 = this.countdown;
    this.look = sceneLook(this.sim.track.theme, this.sim.track.id);
    this.fx = new RaceFx(this.reduced, this.look, !!app.game.state.settings.lightFx); // [nitro] lighter effects setting
    this.eventName = this.test ? this.sim.track.name : app.game.rivalRunName ?? eventById(setup.eventId).name;
    this.canvas = h('canvas', { class: 'track', 'aria-hidden': 'true' });
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
    this.posEl = h('div', { class: 'pos num' });
    this.timeEl = h('div', { class: 'time num' });
    this.standEl = h('div', { class: 'stand' });
    this.progEl = h('div', { class: 'prog', 'aria-hidden': 'true' });
    const L = trackLength(this.sim.track);
    for (const w of this.sim.windows) {
      const m = h('div', { class: 'w' });
      m.style.left = `${(w.start / L) * 100}%`;
      m.style.width = `${((w.end - w.start) / L) * 100}%`;
      this.progEl.append(m);
    }
    // bends on the progress bar (red: hairpins, amber: bends and sweepers) so the shape of the course reads at a glance
    for (let s0 = 0, i = 0; i < this.sim.track.segments.length; s0 += this.sim.track.segments[i].length, i++) {
      const sg = this.sim.track.segments[i];
      if (!sg.radius) continue;
      const m = h('div', { class: `b${sg.radius <= 30 ? ' hp' : ''}` });
      m.style.left = `${(s0 / L) * 100}%`;
      m.style.width = `${(sg.length / L) * 100}%`;
      this.progEl.append(m);
    }
    if (this.ghost) { this.ghostDot = h('div', { class: 'dot ghost' }); this.progEl.append(this.ghostDot); }
    this.dots = this.sim.racers.map((r) => {
      const d = h('div', { class: `dot${r.isPlayer ? ' me' : ''}` });
      if (!r.isPlayer) d.style.background = r.paint;
      this.progEl.append(d);
      return d;
    });
    this.ghostEl = h('div', { class: 'ghostdelta num', 'aria-live': 'off' });
    this.curtain = h('div', { class: 'race-curtain', 'aria-hidden': 'true' });
    this.callout = h('div', { class: 'callout', role: 'status', 'aria-live': 'assertive' });
    this.ticker = h('div', { class: 'ticker', role: 'status' });
    this.flash = h('div', { class: 'race-flash', 'aria-hidden': 'true' });
    this.nitroBtn = h('button', { class: 'nitrobtn', 'aria-label': 'Nitro' });
    this.nitroBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.tapNitro(); });
    this.nitroBtn.addEventListener('click', (e) => { if ((e as PointerEvent).pointerType === '' || e.detail === 0) this.tapNitro(); });
    this.hintEl = h('div', { class: 'racehint' });
    this.shiftBtn = h('button', { class: 'shiftbtn', 'aria-label': 'Shift up' });
    this.shiftBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.tapShift(); });
    this.shiftBtn.addEventListener('click', (e) => { if ((e as PointerEvent).pointerType === '' || e.detail === 0) this.tapShift(); });
    this.gradeEl = h('div', { class: 'shiftgrade', role: 'status', 'aria-live': 'polite' });
    this.gauge = new Gauge(setup.player.car, this.reduced, this.sim.band(), gaugeRange(setup.player.car, setup.player.stats, this.sim.perfectMul));
    const pauseBtn = h('button', { class: 'iconbtn pausebtn', 'aria-label': 'Pause', onclick: () => this.setPaused(true) }, 'Ⅱ');
    this.el = h('div', { class: 'racescreen', role: 'dialog', 'aria-label': `Race: ${this.eventName}` },
      this.canvas,
      h('div', { class: 'hud' },
        h('div', { class: 'row1' }, h('div', {}, this.posEl, this.standEl), h('div', {}, this.timeEl, this.ghostEl, h('div', { style: 'margin-top:6px;text-align:right' }, pauseBtn))),
        this.progEl,
        // the ticker flows under the progress bar, so a long line wraps there instead of covering the standings
        this.ticker),
      this.callout,
      this.flash,
      this.hintEl,
      h('div', { class: 'nitrobar racebar' }, h('div', { class: 'shiftwrap' }, this.gradeEl, this.shiftBtn), this.gauge.el, this.nitroBtn),
      this.curtain,
    );
    window.setTimeout(() => this.curtain.remove(), 700);
    this.onKey = this.onKey.bind(this);
    this.onVis = this.onVis.bind(this);
    document.addEventListener('keydown', this.onKey);
    document.addEventListener('visibilitychange', this.onVis);
    window.addEventListener('blur', this.onVis);
    this.raf = requestAnimationFrame(() => {
      if (this.closed) return;
      this.resize();
      this.last = performance.now();
      this.raf = requestAnimationFrame((t) => this.frame(t));
    });
    this.hum.start(this.countdown);
    this.updateHud(true);
    this.showCallout('3', 'countdown');
    if (teachLaunch) this.tick('⚡ Launch control: tap LAUNCH right on GO', 'gold');
    else if (!this.test && this.sim.track.course) this.tick(`${this.sim.track.course} — ${this.sim.track.favours}`); // 1.10: what this course asks for
    sfx.countdown(false);
    // [onboard] first-run race coaching hook (src/ui/firstRun.ts): SHIFT first, then NITRO in a boost zone
    this.frCoach = wantsRaceCoach(app) ? new RaceCoach(app, this.sim, this.el, setup) : null;
  }
  /** [onboard] first-run race coach (src/ui/firstRun.ts), or null. */
  private frCoach: RaceCoach | null = null;

  private resize() {
    const fit = fitCanvas(this.canvas, this.quality ? RES_TIERS[this.resTier] : 1);
    this.dpr = fit.dpr;
    this.gauge.resize();
  }

  private onKey(e: KeyboardEvent) {
    if (e.key === 'Shift' || e.key === 's' || e.key === 'S' || e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat && !this.finished) this.tapShift(); return; }
    if (e.key === ' ' || e.key === 'n' || e.key === 'N' || e.key === 'ArrowUp') { e.preventDefault(); if (!this.finished) this.tapNitro(); }
    if (e.key === 'Escape' || e.key === 'p') { if (!this.finished) this.setPaused(!this.paused); }
    if ((e.key === 'r' || e.key === 'R') && !this.finished && this.canRestart()) { e.preventDefault(); this.restart(); }
  }
  private onVis() {
    // Pause cleanly when the app loses focus so a hidden timer cannot eat a perfect window.
    if ((document.hidden || !document.hasFocus()) && !this.finished) this.setPaused(true);
  }

  private setPaused(p: boolean) {
    if (this.finished || p === this.paused) return;
    this.paused = p;
    this.fx.nitro.setPaused(p); // [nitro] pause hides every transient boost effect
    if (p) this.particles = []; // [nitro] and the ignition sparks
    if (p) {
      suspendAudio();
      this.pauseEl = h('div', { class: 'paused' }, h('div', { style: 'text-align:center' },
        h('div', { class: 'callout small', style: 'position:static;transform:none;margin-bottom:16px' }, 'Paused'),
        h('button', { class: 'btn primary', onclick: () => this.setPaused(false) }, 'Resume'), ' ',
        this.canRestart() ? h('button', { class: 'btn', onclick: () => this.restart() }, 'Restart') : null, this.canRestart() ? ' ' : null,
        h('button', { class: 'btn', onclick: () => this.quit() }, 'Leave race')));
      this.el.append(this.pauseEl);
      (this.pauseEl.querySelector('.btn') as HTMLButtonElement).focus({ preventScroll: true });
    } else {
      resumeAudio();
      this.pauseEl?.remove();
      this.pauseEl = null;
      this.last = performance.now();
    }
  }

  /** Restart in one tap (pause menu, or R): forfeit this run and start the same event again, short countdown. */
  private canRestart() { return !this.app.game.rivalRunName && this.raceId >= 0 && !!(this.app.views as Record<string, unknown>).race; }
  private restart() {
    const id = this.setup.eventId;
    this.app.game.abandonRace();
    this.retry(id);
  }

  private quit() {
    // Leaving forfeits this run: no payout and no nitro spent.
    if (this.test) { const t = this.test; this.test = null; t.onDone(null, this.sim); this.close(); return; }
    this.app.game.abandonRace();
    this.close();
  }

  private close() {
    if (this.closed) return;
    this.closed = true;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.gradeTimer);
    this.hum.stop();
    this.rivalsAudio.stop();
    music.play('garage');
    document.removeEventListener('keydown', this.onKey);
    document.removeEventListener('visibilitychange', this.onVis);
    window.removeEventListener('blur', this.onVis);
    resumeAudio();
    this.onClose();
  }

  private tapNitro() {
    if (this.countdown > 0 || this.paused || this.finished) return;
    const inLaunch = this.sim.track.segments[0] && this.sim.player.x < this.sim.track.segments[0].length;
    const r = this.sim.tapNitro();
    if (r === 'perfect') {
      this.showCallout('PERFECT NITRO', 'perfect'); /* [nitro] sound: RaceAudio, from the sim */ this.burst(46, '#ffd75e');
      if (!this.reduced) { this.kick = 1.6; this.flash.className = 'race-flash on'; setTimeout(() => (this.flash.className = 'race-flash'), 260); }
      this.nitroBtn.classList.add('perfect-run');
    } else if (r === 'boost') {
      this.burst(20, '#8fd3ff'); /* [nitro] sound: RaceAudio, from the sim */
      this.showCallout(inLaunch ? 'Wheelspin — boosts work best on straights' : 'Nitro', inLaunch ? 'small' : 'boost', inLaunch ? 1400 : 900);
      if (!this.reduced) this.kick = 0.8;
    }
    else if (r === 'empty') this.showCallout('No nitro left', 'small');
    this.updateHud(true);
  }

  private tapShift() {
    if (this.paused || this.finished) return;
    // the Tempest E4's launch control: the SHIFT control reads LAUNCH through the countdown; tap it on GO
    if (this.sim.hasLaunchControl && !this.sim.launchTry && !this.sim.player.lc && (this.countdown > 0 || this.sim.t < 0.6)) {
      this.onLaunch(this.sim.tapLaunch(this.countdown > 0 ? this.countdown : -this.sim.t));
      return;
    }
    if (this.countdown > 0) return;
    const r = this.sim.tapShift();
    if (r === 'wait') this.showGrade('Wait for green', 'warn');
    else if (r === 'hold') this.showGrade('Braking — wait', 'warn');
  }

  private onLaunch(r: ReturnType<RaceSim['tapLaunch']>) {
    if (r === 'perfect') {
      launchControlSound();
      this.showCallout('LAUNCH CONTROL', 'perfect', 1100);
      this.showGrade('Launch control ✓ — four motors, full grip', 'good');
      this.burst(40, '#5ef2ff');
      if (!this.reduced) { this.kick = 1.2; this.flash.className = 'race-flash on volt'; setTimeout(() => (this.flash.className = 'race-flash'), 240); }
    } else if (r === 'early') this.showGrade('Too early — launch on GO', 'warn');
    else if (r === 'late') this.showGrade('Late launch — tap on GO', 'warn');
  }

  /** A shift happened (tapped or automatic): grade it on the HUD, in sound, and teach the first miss. */
  private onShift(rec: ShiftRecord) {
    sfx.shift(rec.grade);
    const label = { clean: 'Clean shift', early: 'Early', late: 'Late', missed: 'Auto shift', assist: 'Crew shift' }[rec.grade];
    this.showGrade(label, rec.grade === 'clean' || rec.grade === 'assist' ? 'good' : rec.grade === 'missed' ? 'bad' : 'warn');
    if (rec.grade === 'missed' && !this.missTold) { this.missTold = true; this.tick('Missed shift — tap SHIFT when the light turns green'); }
    if (rec.grade === 'assist' && !this.assistTold) { this.assistTold = true; this.tick('Boost zone ahead — the crew shifted for you', 'gold'); }
  }

  private showGrade(text: string, cls: string) {
    this.gradeEl.textContent = text;
    this.gradeEl.className = `shiftgrade on ${cls}`;
    clearTimeout(this.gradeTimer);
    this.gradeTimer = window.setTimeout(() => { this.gradeEl.className = 'shiftgrade'; }, 700);
  }

  /** Shift light, button state and tach, every frame (cheap: only changes touch the DOM or the gauge canvas). */
  private shiftHud(t: number) {
    const sim = this.sim;
    const p = sim.player;
    // cue, window and needle all come from the sim's one shift attempt (the same state a tap is judged on)
    const att = sim.attempt;
    const launchArmed = sim.hasLaunchControl && !sim.launchTry && !p.lc && !this.finished && (this.countdown > 0 || sim.t < 0.6);
    const cue: ShiftCue = launchArmed ? (this.countdown <= 0.22 ? 'green' : this.countdown < 0.9 ? 'soon' : 'off') : this.countdown > 0 || this.finished ? 'off' : sim.shiftCue();
    if (cue !== this.cue) {
      if (cue === 'green' && this.cue !== 'late' && this.app.game.state.settings.nitroCue) sfx.shiftCue();
      this.cue = cue;
      this.shiftBtn.classList.toggle('soon', cue === 'soon');
      this.shiftBtn.classList.toggle('green', cue === 'green');
      this.shiftBtn.classList.toggle('late', cue === 'late');
    }
    const gearKey = `${p.gear}:${sim.topGear()}:${launchArmed}`;
    if (this.shiftBtn.dataset.key !== gearKey) {
      this.shiftBtn.dataset.key = gearKey;
      this.shiftBtn.classList.toggle('launch', launchArmed);
      if (launchArmed) this.shiftBtn.replaceChildren(h('span', { class: 'g' }, '⚡'), 'LAUNCH');
      else this.shiftBtn.replaceChildren(h('span', { class: 'g num' }, sim.topGear() ? 'TOP' : `${p.gear + 1}›${p.gear + 2}`), 'SHIFT');
      this.shiftBtn.setAttribute('aria-label', sim.topGear() ? `Top gear` : `Shift up, gear ${p.gear + 1}`);
      this.shiftBtn.classList.toggle('top', sim.topGear());
    }
    const ls = sim.lastShift;
    if (ls && ls !== this.shiftShown) { this.shiftShown = ls; this.onShift(ls); }
    // an automatic downshift is never silent: the new gear flashes ("↓3") while the cue waits for it to settle
    const ld = sim.lastDown;
    if (ld && ld !== this.downShown) { this.downShown = ld; this.showGrade(`↓${ld.into + 1} Braking downshift`, 'down'); }
    this.gauge.draw({
      f: att.f, gear: p.gear, gears: sim.drivetrain.gears.length, mph: speedMph(p), cue, t: sim.t, dt: this.lastFrameDt, attempt: att,
      topGear: sim.topGear(), launchArmed, staging: this.countdown > 0,
      nitro: { charges: sim.charges, boosting: p.nitroLeft > 0, perfect: p.nitroLeft > 0 && p.nitroMul > 1 },
    });
    if (import.meta.env.DEV) {
      // dev-only frame trace for the shift cue (Playwright reads window.__shiftTrace when it exists)
      const tr = (window as unknown as { __shiftTrace?: unknown[] }).__shiftTrace;
      if (tr) tr.push({ t: Math.round(t), st: +sim.t.toFixed(3), gear: p.gear, f: +att.f.toFixed(4), id: att.id, acue: att.cue, needle: +this.gauge.needle.toFixed(4), band: this.gauge.band.join('-'), marker: this.gauge.marker.shape, label: this.gauge.marker.label, cue, braking: p.braking, dt: +this.lastFrameDt.toFixed(4) });
    }
  }

  /** The race sound's per-frame snapshot (see RaceAudioSnapshot). Gear events are handed out once: each call returns
   *  the changes since the previous call. */
  audioFrame(): RaceAudioSnapshot {
    const sim = this.sim;
    const events = sim.gearEvents.filter((e) => e.seq > this.gearSeq);
    if (events.length) this.gearSeq = events[events.length - 1].seq;
    const staging = this.countdown > 0;
    return {
      ...sim.audioState(), events, phase: staging ? 'staging' : this.finished ? 'finished' : 'racing',
      burnout: staging && !this.reduced ? Math.min(1, (this.countdown0 - this.countdown) / Math.max(0.1, this.countdown0 - 0.4)) : 0,
      paused: this.paused,
    };
  }

  private showCallout(text: string, cls: string, ms = 900) {
    this.callout.textContent = text;
    this.callout.className = `callout ${cls}`;
    clearTimeout(this.calloutTimer);
    this.calloutTimer = window.setTimeout(() => { this.callout.textContent = ''; }, ms);
  }

  private frame(t: number) {
    // a callback queued before close() (or a duplicate loop) never runs the race or its shift cue again
    if (this.closed) return;
    this.raf = requestAnimationFrame((tt) => this.frame(tt));
    if (t <= this.last) return; // stale or duplicate timestamp: nothing new to show
    let dt = (t - this.last) / 1000;
    this.last = t;
    if (dt > 0.1) dt = 0.1; // long frames never jump the simulation
    this.lastFrameDt = dt;
    // adaptive effects: drop resolution/particles before touching sim timing.
    // 1.10: the countdown's own frames pick the canvas resolution before GO (a slow phone launches at a resolution it
    // can draw, instead of spending the launch at 15 fps); the track canvas is what costs (raster), not the sim.
    if (!this.resDecided && this.countdown > 0 && this.frameNo > 3) {
      this.cdFrames.push(dt);
      if (this.cdFrames.length >= 6) {
        this.resDecided = true;
        const med = [...this.cdFrames].sort((a, b) => a - b)[3];
        const tier = med > 0.05 ? 2 : med > 0.03 ? 1 : 0;
        if (tier > this.resTier) { this.resTier = tier; this.resize(); this.rewarm(); }
      }
    } else if (this.countdown <= 0) this.resDecided = true;
    this.frameTimes.push(dt);
    const span = this.frameTimes.reduce((a, b) => a + b, 0);
    if (span >= 1) {
      const avg = span / this.frameTimes.length;
      this.frameTimes = [];
      // two slow seconds in a row step the resolution down (then effects) for the rest of the race; a single hitch
      // (a GC, the launch) does not, and quality never climbs back mid-race, which would re-render every sprite again
      this.slowWindows = avg > 0.021 ? this.slowWindows + 1 : 0;
      if (this.slowWindows >= 2) {
        this.slowWindows = 0;
        if (this.resTier < RES_TIERS.length - 1) { this.resTier++; this.resize(); }
        else if (this.quality === 1) { this.quality = 0; this.resize(); }
      }
    }
    if (!this.paused) {
      if (this.countdown > 0) {
        const before = Math.ceil(this.countdown / (this.reduced ? 0.4 : 0.8));
        this.countdown -= dt;
        const after = Math.ceil(this.countdown / (this.reduced ? 0.4 : 0.8));
        if (this.countdown <= 0) { this.showCallout('GO!', 'perfect', 600); sfx.countdown(true); if (!this.reduced) this.shake = 0.35; }
        else if (after !== before) { this.showCallout(String(after), 'countdown'); sfx.countdown(false); }
      } else if (!this.finished) {
        this.acc += dt;
        while (this.acc >= RACE.dt && !this.finished) {
          this.sim.step(RACE.dt);
          this.test?.probe.observe(this.sim);
          this.acc -= RACE.dt;
          if (this.sim.player.finishTime !== null || this.sim.done) this.onPlayerFinish();
        }
        this.telegraph();
        this.boostFeedback();
        this.rivalsAudio.frame();
      } else if (this.finishHold > 0) {
        // rivals keep driving across the line while the result settles
        this.acc += dt;
        while (this.acc >= RACE.dt) { this.sim.step(RACE.dt); this.acc -= RACE.dt; }
        this.finishHold -= dt;
        if (this.finishHold <= 0) {
          if (this.test) { const t = this.test, o = this.outcome; this.test = null; t.onDone(o, this.sim); this.close(); }
          else this.showResult(this.result);
        }
      }
      this.shake = Math.max(0, this.shake - dt);
      this.kick = Math.max(0, this.kick - dt);
      this.dramaT = Math.max(0, this.dramaT - dt);
      if (this.passTag) { this.passTag.t -= dt; if (this.passTag.t <= 0) this.passTag = null; }
      // render the GO zoom's car sprites now, one per frame, so the launch never waits for them
      if (this.countdown > 0 && this.warmQueue?.length) this.warmQueue.shift()!();
      this.stepParticles(dt);
      this.fx.update(dt, this.sim, Math.max(0, this.countdown), this.quality, (r) => carLengthM(artOf(r)), (r) => this.laneOf(r));
    }
    this.draw();
    this.shiftHud(t);
    this.frCoach?.frame(this.countdown, this.finished); // [onboard] first-run race coaching hook
    if (t - this.lastHud > 100) { this.lastHud = t; this.updateHud(); }
  }

  /** After each boost, show what it actually gained against the no-nitro ghost. */
  private boostFeedback() {
    const g = this.sim.lastBoostGain;
    if (!g || g === this.gainShown) return;
    this.gainShown = g;
    this.nitroBtn.classList.remove('perfect-run');
    if (g.seconds >= 0.01) this.tick(`${g.perfect ? 'Perfect boost' : 'Boost'}: +${g.seconds.toFixed(2)} s on the field`, g.perfect ? 'gold' : 'blue');
  }

  private tick(text: string, cls = '') {
    this.ticker.textContent = text;
    this.ticker.className = `ticker on ${cls}`;
    clearTimeout(this.tickerTimer);
    this.tickerTimer = window.setTimeout(() => { this.ticker.className = 'ticker'; }, 1500);
  }

  private telegraph() {
    const { active, next } = this.sim.windowState();
    const p = this.sim.player;
    const canUse = this.sim.charges > 0 && p.nitroLeft <= 0;
    const inWindow = !!active && canUse && !this.sim.usedWindows.has(active.segIndex);
    this.nitroBtn.classList.toggle('window', inWindow);
    const eta = !active && next && canUse && p.v > 1 ? (next.start - p.x) / p.v : Infinity;
    const approaching = eta < 2.2;
    this.nitroBtn.classList.toggle('approach', approaching);
    if (approaching) {
      const q = (Math.round(Math.max(0, Math.min(1, 1 - eta / 2.2)) * 20) / 20).toFixed(2); // 20 steps: no repaint every frame
      if (this.nitroBtn.style.getPropertyValue('--eta') !== q) this.nitroBtn.style.setProperty('--eta', q);
      const lbl = `BOOST ZONE IN ${eta.toFixed(1)} s`;
      if (this.nitroBtn.dataset.label !== lbl) this.nitroBtn.dataset.label = lbl;
    } else if (inWindow && this.nitroBtn.dataset.label !== "▲ BOOST ZONE — TAP") this.nitroBtn.dataset.label = "▲ BOOST ZONE — TAP";
    // rival moments near the player: a bogged launch, a defender's push (each said once, never over another call)
    for (const m of this.sim.rivalMoments) {
      if (m.seq <= this.momentSeq) continue;
      this.momentSeq = m.seq;
      const r = this.sim.racers.find((x) => x.id === m.id);
      if (!r || this.ticker.classList.contains('on')) continue;
      const nm = r.name.split(' ')[0];
      if (m.kind === 'bad-launch' && this.sim.t < 1.5) this.tick(`${nm} bogs down off the line`, 'blue');
      else if (m.kind === 'defend' && !this.defendTold) { this.defendTold = true; this.tick(`${nm} defends — keep the pressure on`); }
    }
    // overtakes, called out once they settle (after the launch)
    if (this.sim.t > 2) {
      const order = this.sim.standings().map((r) => r.id).join('|');
      if (this.lastOrder && order !== this.lastOrder) {
        const before = this.lastOrder.split('|');
        const now = order.split('|');
        const me = now.indexOf('player'), was = before.indexOf('player');
        if (me < was) this.tick(`Passed ${this.sim.racers.find((r) => r.id === before[me])?.name ?? 'a rival'} · ${ordinal(me + 1)}`, 'gold');
        else if (me > was) this.tick(`${this.sim.racers.find((r) => r.id === now[me - 1])?.name ?? 'A rival'} passed you · ${ordinal(me + 1)}`);
        // a pass involving the player: the camera closes in on the two cars for a moment
        if (me !== was) {
          this.dramaT = 1.4; this.dramaFoe = me < was ? before[me] : now[me - 1];
          this.passTag = { id: this.dramaFoe, text: me < was ? 'PASSED' : 'PASSES YOU', t: 1.1, good: me < was };
        }
      }
      this.lastOrder = order;
    }
    if (active && canUse && !this.sim.usedWindows.has(active.segIndex) && !this.cueDone.has(active.segIndex)) {
      this.cueDone.add(active.segIndex);
      if (this.app.game.state.settings.nitroCue) sfx.windowCue();
      this.showCallout('TAP NITRO NOW', 'window', 700);
    } else if (!active && next && canUse && eta < 2.0 && eta > 1.9) {
      this.showCallout('Boost zone ahead', 'window', 900);
    }
    this.hum.frame();
  }

  private onPlayerFinish() {
    if (this.finished) return;
    this.finished = true;
    this.hum.finish();
    this.nitroBtn.classList.remove('window', 'perfect-run'); // [nitro] no boost glow left on at the line
    this.shiftBtn.classList.remove('soon', 'green', 'late');
    // Finish an off-screen copy for the real result, and commit now so closing the page cannot lose or
    // double the payout. The visible race keeps running so the crossing and the rivals' arrival are seen.
    const outcome = this.sim.clone().finish();
    this.outcome = outcome;
    if (this.test) {
      // a test run: nothing is committed or paid; the run's own time is the result
      this.rivalsAudio.stop();
      sfx.win();
      this.showCallout(`${this.test.label.split(' · ')[0]} · ${outcome.playerTime?.toFixed(2) ?? '—'} s`, 'perfect', 1400);
      this.finishHold = this.reduced ? 0.3 : 1.1;
      this.updateHud(true);
      return;
    }
    const rival = !!this.app.game.rivalRunName;
    // what changed since the last run of this event (this session) or the best saved before this race
    const sum = summarize(outcome);
    const bestBefore = this.app.game.state.events[this.setup.eventId]?.bestTime ?? null;
    this.changes = rival ? null : compareRuns(sum, lastRuns.get(`${this.setup.eventId}:${sum.car}`) ?? null, bestBefore);
    if (!rival) lastRuns.set(`${this.setup.eventId}:${sum.car}`, sum);
    const committed = this.app.game.commitRace(this.raceId, outcome);
    this.result = committed ?? this.app.game.state.lastResult;
    // the Circuit side (ghost, ladder, series and milestone prizes), once per race, right after its commit
    if (committed && !rival) this.circuit = this.app.game.circuitResult; // committed inside Game.commitRace (Progression, 1.9)
    this.rivalsAudio.stop();
    const big = !!(this.result?.boss || this.result?.heat?.champion || this.app.game.state.pendingReveal);
    if (big) sfx.fanfare(); else if (outcome.place === 1) sfx.win(); else sfx.lose();
    const gap = outcome.gapText.replace(/ of .*$/, '').replace(' behind first', ' behind');
    const gd = this.circuit?.ghostDelta;
    if (this.ghost && gd != null) this.showCallout(`${gd < 0 ? '−' : '+'}${Math.abs(gd).toFixed(2)} s${gd < 0 ? ' · NEW BEST' : ' vs best'}`, gd < 0 ? 'perfect' : 'small', 1600);
    else this.showCallout(outcome.place === 1 ? `WIN! ${gap}` : `${ordinal(outcome.place)} · ${gap}`, outcome.place === 1 ? 'perfect' : 'small', 1600);
    if (outcome.place === 1 && outcome.standings.length > 1) this.confetti();
    this.finishHold = this.reduced ? 0.3 : 1.6;
    this.updateHud(true);
  }

  private showResult(r: LastResult | null) {
    this.hum.stop();
    music.play('results', { won: this.outcome?.place === 1 });
    if (!r) { this.close(); return; }
    const card = resultCard(this.app, r, { onClose: () => this.close(), onRetry: (id) => this.retry(id), extras: this.resultExtras() });
    const wrap = h('div', { class: 'result' }, card);
    this.el.append(wrap);
    (card.querySelector('.btn.primary') as HTMLButtonElement).focus({ preventScroll: true });
  }

  /** Rows the race screen adds to the result card (owned by the race workstream). */
  private resultExtras(): HTMLElement[] {
    const o = this.outcome;
    if (!o) return [];
    const why = circuitRows(this.app, o, this.circuit, (car, family) => {
      this.close();
      openFitParts(this.app, car, family);
    }, (car, family, tier) => {
      this.close();
      void import('./testDrive').then((m) => m.openTestDrive(this.app, { car, family, tier }));
    });
    // one explanation, not three: the Circuit "why" (from the splits) replaces the telemetry's own coach line
    const tel = telemetryRows(o, this.sim.windows.length).filter((x) => !(why.some((w) => w.classList.contains('cx-why')) && x.classList.contains('race-coach')));
    return [...changeRows(this.changes), ...tel, ...why];
  }

  /** A win: a short burst of confetti from the finish gantry. */
  private confetti() {
    if (this.reduced) return;
    const cols = ['#ffd23f', '#e2337a', '#38e1ff', '#7fe08a', '#ffffff'];
    for (let k = 0; k < 40 && this.particles.length < 80; k++) {
      this.particles.push({ x: (Math.random() - 0.3) * 80, y: -60 - Math.random() * 40, vx: (Math.random() - 0.5) * 90, vy: 20 + Math.random() * 60, life: 0.9 + Math.random() * 0.6, c: cols[k % cols.length], s: 2 + Math.random() * 3 });
    }
  }

  private retry(eventId: string) {
    const app = this.app;
    this.close();
    if (app.game.state.pendingReveal) return; // reveal takes priority
    (app.views.race as RaceView).startLive(eventById(eventId).heatOf ?? eventId); // a knockout heat restarts through its event
  }

  private updateHud(force = false) {
    if (!force && this.paused) return;
    const sim = this.sim;
    const st = sim.standings();
    const me = st.findIndex((r) => r.isPlayer) + 1;
    this.posEl.innerHTML = this.test ? '' : this.countdown > 0 ? '–' : `${me}<small>/${sim.racers.length}</small>`;
    this.timeEl.textContent = `${Math.max(0, sim.player.finishTime ?? sim.t).toFixed(sim.player.finishTime !== null ? 2 : 1)} s`;
    if (this.test) { if (this.standEl.dataset.k !== this.test.label) { this.standEl.dataset.k = this.test.label; this.standEl.replaceChildren(h('div', { class: 'test-tag' }, 'TEST'), ...this.test.label.split(' · ').map((x) => h('div', {}, x))); } }
    else this.standEl.innerHTML = st.map((r, i) => `<div class="${r.isPlayer ? 'me' : ''}">${i + 1}. ${r.isPlayer ? 'You' : r.name}</div>`).join('');
    const L = sim.length;
    sim.racers.forEach((r, i) => { this.dots[i].style.left = `${Math.min(100, (r.x / L) * 100)}%`; });
    if (this.ghost) {
      const gt = this.countdown > 0 ? 0 : sim.t;
      if (this.ghostDot) this.ghostDot.style.left = `${Math.min(100, (ghostX(this.ghost, gt) / L) * 100)}%`;
      const p = sim.player;
      if (this.countdown > 0 || sim.t < 0.6) { this.ghostEl.textContent = `Ghost ${this.ghost.t.toFixed(2)} s`; this.ghostEl.className = 'ghostdelta num'; }
      else {
        const d = p.finishTime !== null ? p.finishTime - this.ghost.t : ghostDelta(this.ghost, p.x, sim.t);
        const txt = `${d < 0 ? '−' : '+'}${Math.abs(d).toFixed(2)} vs best`;
        if (this.ghostEl.textContent !== txt) { this.ghostEl.textContent = txt; this.ghostEl.className = `ghostdelta num ${d < 0 ? 'ahead' : 'behind'}`; }
      }
    }
    const c = sim.charges;
    const active = sim.windowState().active;
    const ready = !this.finished && c > 0 && sim.player.nitroLeft <= 0 && active && !sim.usedWindows.has(active.segIndex);
    const nitroLabel = ready ? 'Tap now' : sim.player.nitroLeft > 0 ? 'Boosting' : 'Nitro';
    const labelKey = `${c}:${nitroLabel}`;
    if (this.nitroBtn.dataset.key !== labelKey) {
      this.nitroBtn.dataset.key = labelKey;
      this.nitroBtn.replaceChildren(h('span', { class: 'n num' }, c), nitroLabel);
    }
    this.nitroBtn.classList.toggle('empty', c === 0);
    this.nitroBtn.setAttribute('aria-label', `Nitro, ${c} left`);
    const races = this.app.game.state.stats.races;
    if (sim.hasLaunchControl && !sim.launchTry && !sim.player.lc && this.countdown > 0) { this.hintEl.textContent = desktop() ? 'Launch control: press S right on GO.' : 'Launch control: tap LAUNCH right on GO.'; return; }
    const shiftHint = !this.finished && races < 6 && (sim.shiftLog.length === 0 || this.cue === 'green') && !sim.topGear() && !sim.boostZoneNear()
      ? (desktop() ? 'Shift in the green: tap SHIFT or press S.' : 'Tap SHIFT when the light turns green.') : '';
    this.hintEl.textContent = shiftHint || (this.finished ? '' : c === 0 ? (this.setup.nitroCharges === 0 ? 'No nitro banked — merge combos of 3 to bank some.' : 'All nitro used.') : this.app.game.state.stats.races < 6 || this.sim.perfects === 0 && this.sim.t < 4 && this.app.game.state.stats.races < 20 ? (desktop() ? 'Press Space in a boost zone for a Perfect boost.' : 'Tap NITRO in a boost zone for a Perfect boost.') : '');
  }

  // ---------------- Drawing ----------------
  private warmCtx: CanvasRenderingContext2D | null = null;
  /** Queue the car sprites the camera will need when it eases out of the launch close-up (sizes one and two zoom
   *  steps out), rendered one per countdown frame into a scrap canvas so the cache holds them before GO. */
  private queueWarm(ppmBase: number, _laneH: number, _roadTop: number) {
    if (this.reduced) return;
    const cv = document.createElement('canvas');
    cv.width = 4; cv.height = 4;
    this.warmCtx = cv.getContext('2d');
    const q: (() => void)[] = [];
    for (const mul of [1, 1.11]) {
      this.sim.racers.forEach((r, i) => {
        const lane = LANE_OF[i];
        const b = this.bodyOf(r);
        const len = carLengthM(b.art) * ppmBase * mul * (0.86 + lane * 0.06);
        q.push(() => drawCar(this.warmCtx!, b.art, -len * 3, 0, len, { paint: b.paint, trim: b.trim, style: b.style, livery: b.livery, detail: false, cache: true }));
      });
    }
    this.warmQueue = q;
  }

  /** The overtake beat: a small pill over the car just passed (or passing), fading out. */
  private drawPassTag(ctx: CanvasRenderingContext2D, x: number, y: number, tag: { text: string; t: number; good: boolean }) {
    const s = this.dpr;
    ctx.save();
    ctx.globalAlpha = Math.min(1, tag.t / 0.3);
    ctx.font = `800 ${Math.round(12 * s)}px Barlow, system-ui`;
    const w = ctx.measureText(tag.text).width + 14 * s, hh = 18 * s;
    ctx.fillStyle = tag.good ? '#ffd75e' : 'rgba(10,12,16,0.85)';
    ctx.beginPath(); ctx.roundRect?.(x - w / 2, y - hh, w, hh, hh / 2); if (!ctx.roundRect) ctx.rect(x - w / 2, y - hh, w, hh); ctx.fill();
    ctx.fillStyle = tag.good ? '#2a1a00' : '#ffffff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(tag.text, x, y - hh / 2 + 0.5 * s);
    ctx.restore();
  }

  /** After a resolution change in the countdown: warm the sprites the GO zoom needs at the new size. */
  private rewarm() {
    if (!this.warmPpm) return; // not queued yet: the regular warm-up runs at the new size
    this.zoom = 0; this.zoomTarget = 0;
    this.needWarm = true; // the next frame queues the warm-up again
  }

  private burst(n: number, c: string) {
    if (this.reduced) return;
    const max = this.quality ? 60 : 20;
    for (let k = 0; k < n && this.particles.length < max; k++) {
      this.particles.push({ x: 0, y: 0, vx: -(40 + Math.random() * 80), vy: (Math.random() - 0.5) * 40, life: 0.5 + Math.random() * 0.4, c, s: 2 + Math.random() * 3 });
    }
  }
  private stepParticles(dt: number) {
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  /** What a racer looks like: the player's own car and finish, or a rival's look (its body, trim and build). */
  private bodyOf(r: Racer): { art: string; paint: string; trim: string; style?: CarStyle; livery?: string } {
    const cls = carById(r.car);
    if (r.isPlayer) {
      const s = this.app.game.state, livery = s.paints[r.car];
      return { art: r.car, paint: livery ?? cls.paint, trim: cls.trim, style: carStyle(s, r.car), livery: finishStripe(r.car, livery ?? undefined) };
    }
    const lk = rivalLook(r.look);
    return { art: artOf(r), paint: r.paint, trim: lk?.trim ?? cls.trim, style: lk?.style as CarStyle | undefined };
  }

  /** A racer's lane and depth (back lanes are smaller and further up the road). */
  private laneOf(r: { id: string }) {
    const lane = LANE_OF[this.sim.racers.findIndex((x) => x.id === r.id)] ?? 3;
    return { lane, depth: 0.86 + lane * 0.06 };
  }

  private draw() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const sim = this.sim;
    const theme = this.look;
    const player = sim.player;
    // Camera frames the pack: zoom out when rivals spread, keep the player between 22% and 70% of the width.
    // Camera: frame the player with the nearest rival (or the whole pack if it fits); before a nitro window,
    // shift to show more road ahead; a short shake at the launch and a kick when a boost fires.
    const ppm0 = Math.min(W * 0.42, H * 0.27) / 4.3; // closer camera: the cars read at phone size (art review)
    const rivals = sim.racers.filter((r) => !r.isPlayer);
    const nearest = rivals.reduce((b, r) => (Math.abs(r.x - player.x) < Math.abs(b.x - player.x) ? r : b), rivals[0] ?? player);
    const xs = sim.racers.map((r) => r.x);
    const packSpan = Math.max(...xs) - Math.min(...xs);
    const span = packSpan * ppm0 * 0.45 < W * 0.8 ? packSpan : Math.abs(nearest.x - player.x);
    // drama: the camera closes in on the launch, on a pass involving the player, and on the run to the line
    const drama = !this.reduced && this.quality > 0;
    const launchDrama = drama && (this.countdown > 0 || sim.t < 0.9);
    const foe = this.dramaT > 0 && this.dramaFoe ? sim.racers.find((r) => r.id === this.dramaFoe) ?? null : null;
    const passDrama = drama && !launchDrama && !!foe && Math.abs(foe.x - player.x) < 14;
    const finishDrama = drama && !launchDrama && (player.finishTime !== null ? this.finishHold > 0 : sim.length - player.x < 45);
    const dramaMul = launchDrama ? 1.22 : passDrama || finishDrama ? 1.12 : 1;
    const target = Math.max(ppm0 * 0.5, Math.min(ppm0, (W * 0.78) / (span + 9))) * dramaMul;
    // Zoom only retargets on a clear change and eases slowly: car sprites are cached per size step, so a zoom
    // that wanders re-renders every car mid-race.
    if (!this.zoomTarget || Math.abs(target / this.zoomTarget - 1) > 0.1) this.zoomTarget = target;
    this.zoom = this.zoom ? this.zoom + (this.zoomTarget - this.zoom) * 0.03 : target;
    const ppm = this.zoom;
    const focus = launchDrama ? [player.x] : passDrama && foe ? [player.x, foe.x]
      : packSpan * ppm < W * 0.8 ? xs : [player.x, nearest.x];
    const mid = (Math.max(...focus) + Math.min(...focus)) / 2;
    const ahead = sim.windowState().next;
    const lookGoal = ahead && player.v > 1 && (ahead.start - player.x) / player.v < 2.5 ? 0.12 : 0;
    this.lookT += (lookGoal - this.lookT) * 0.05;
    // a boost kick lets the camera lag so the car surges forward on screen
    // camera pull at speed: the faster the car, the more road it shows ahead (a felt sense of speed, no re-zoom)
    const pace = Math.min(1, player.v / (drivetrainFor(player.car).gaugeMph / 2.23694 * 0.8));
    const lookAhead = this.lookT - 0.05 * this.fx.nitro.surge /* [nitro] camera surge follows the boost envelope */ + (this.reduced ? 0 : 0.08 * pace * pace);
    let camX = mid - (W * (0.48 - lookAhead)) / ppm;
    camX = Math.min(camX, player.x - (W * 0.18) / ppm);
    camX = Math.max(camX, player.x - (W * (0.62 - lookAhead)) / ppm);
    // keep the whole player car on screen: player.x is its nose, and on a narrow phone at close zoom the car
    // is ~45% of the width, so "nose at 18%" alone leaves its tail off the left edge. This wins over look-ahead.
    const pLane = LANE_OF[sim.racers.indexOf(player)] ?? 3;
    camX = Math.min(camX, player.x - (carLengthM(player.car) + this.fx.nitro.room /* [nitro] room for the exhaust */) * (0.86 + pLane * 0.06) - (W * 0.04) / ppm);
    if (this.finished) camX = Math.min(camX, sim.length - (W * 0.55) / ppm); // hold on the finish line
    // finish-line camera: once the line is on screen the camera stops with the gantry at 62% of the width and the car
    // blasts through it (eased in over a few frames, so it never jumps)
    const lockX = sim.length - (W * 0.62) / ppm;
    if (drama && player.x > sim.length - (W * 0.55) / ppm) this.finishLock = Math.min(1, this.finishLock + this.lastFrameDt / 0.18);
    if (this.finishLock > 0) camX = camX + (Math.min(camX, lockX) - camX) * this.finishLock;
    const shakeY = this.shake > 0 ? Math.sin(sim.t * 90) * 3 * this.dpr * (this.shake / 0.35) : 0;
    ctx.setTransform(1, 0, 0, 1, 0, shakeY);
    // Lanes sit just above the nitro button area and grow with tall screens.
    const buttonArea = 168 * this.dpr;
    const roadBot = Math.min(H * 0.84, H - buttonArea);
    const roadTop = roadBot - Math.min(H * 0.36, W * 0.8);
    const horizon = roadTop - H * 0.09;

    const sv: SceneView = { ctx, W, H, dpr: this.dpr, horizon, roadTop, roadBot, camX, ppm, t: sim.t, theme, trackId: sim.track.id, reduced: this.reduced };
    drawBackdrop(sv);
    const pal = roadColors(theme);

    // road
    const segInfo = (x: number) => {
      let s0 = 0;
      for (const sg of sim.track.segments) { if (x < s0 + sg.length) return { sg, s0 }; s0 += sg.length; }
      return { sg: sim.track.segments[sim.track.segments.length - 1], s0 };
    };
    // draw road in strips by segment type
    const stripM = 2;
    for (let wx = Math.floor(camX / stripM) * stripM; (wx - camX) * ppm < W; wx += stripM) {
      const { sg } = segInfo(Math.max(0, wx));
      const sx = (wx - camX) * ppm;
      const hw = sg.type === 'highway' || sg.type === 'hwbend';
      ctx.fillStyle = hw ? pal.highway : pal.road;
      ctx.fillRect(sx, roadTop, stripM * ppm + 1, roadBot - roadTop);
      if (sg.radius) {
        // bend curbs
        const alt = Math.floor(wx / 3) % 2 === 0;
        ctx.fillStyle = alt ? '#c4362c' : '#eee';
        ctx.fillRect(sx, roadTop - 5 * this.dpr, stripM * ppm + 1, 5 * this.dpr);
        ctx.fillRect(sx, roadBot, stripM * ppm + 1, 5 * this.dpr);
      } else if (hw) {
        ctx.fillStyle = '#8b8f96';
        ctx.fillRect(sx, roadTop - 4 * this.dpr, stripM * ppm + 1, 3 * this.dpr);
      }
    }
    drawRoadDressing(sv);
    // nitro windows (telegraphed on the road ahead)
    for (const w of sim.windows) {
      const x0 = (w.start - camX) * ppm;
      const x1 = (w.end - camX) * ppm;
      if (x1 < 0 || x0 > W) continue;
      const used = sim.usedWindows.has(w.segIndex);
      ctx.fillStyle = used ? 'rgba(242,163,58,0.08)' : 'rgba(242,163,58,0.28)';
      ctx.fillRect(x0, roadTop, x1 - x0, roadBot - roadTop);
      if (!used) {
        ctx.fillStyle = 'rgba(255,196,87,0.75)';
        ctx.font = `800 ${Math.round(16 * this.dpr)}px Barlow, system-ui`;
        for (let cx = x0 + 10; cx < x1 - 10; cx += 46 * this.dpr) ctx.fillText('›››', cx, (roadTop + roadBot) / 2 + 6 * this.dpr);
      }
    }
    // lane lines
    const lanes = 4;
    const laneH = (roadBot - roadTop) / lanes;
    ctx.fillStyle = 'rgba(255,240,200,0.55)';
    const dash = 4 * ppm;
    for (let l = 1; l < lanes; l++) {
      const y = roadTop + l * laneH;
      const off = (camX * ppm) % (dash * 2);
      for (let x = -off; x < W; x += dash * 2) ctx.fillRect(x, y - 1.5 * this.dpr, dash, 3 * this.dpr);
    }
    // start & finish
    const drawLine = (m: number, checker: boolean) => {
      const x = (m - camX) * ppm;
      if (x < -40 || x > W + 40) return;
      const sq = 8 * this.dpr;
      for (let y = roadTop, k = 0; y < roadBot; y += sq, k++) {
        ctx.fillStyle = checker ? (k % 2 ? '#111' : '#eee') : '#eee';
        ctx.fillRect(x, y, sq, sq);
        if (checker) { ctx.fillStyle = k % 2 ? '#eee' : '#111'; ctx.fillRect(x + sq, y, sq, sq); }
      }
    };
    drawLine(0, false);
    drawLine(sim.length, true);
    // course signs: braking boards, bend warnings with this car's speed for the bend, chevrons, straights
    this.frameNo++;
    const firstFrame = this.frameNo === 1; // the first frame paints the scene only (under the curtain); cars come next
    if (!firstFrame) {
      drawCourseSigns(ctx, sim, camX, ppm, roadTop, this.dpr, player.stats.grip);
      drawTrackside(ctx, sim, camX, ppm, roadTop, roadBot, this.dpr, sim.t + (this.countdown0 - Math.max(0, this.countdown)), Math.max(0, this.countdown), this.countdown0, this.reduced, this.quality);
    }
    // rubber laid by the launch wheelspin
    const laneGeo = (lane: number) => ({ lane, depth: 0.86 + lane * 0.06, ground: roadTop + (lane + 0.85) * laneH });
    this.fx.drawMarks(ctx, camX, ppm, this.dpr, (id) => { const r = sim.racers.find((x) => x.id === id); return r ? laneGeo(this.laneOf(r).lane) : null; });

    // cars by lane (back lanes first)
    // cars join one per frame under the opening curtain (the player first), so their sprites never all render in one
    // long frame
    const draws = firstFrame ? [] : sim.racers.map((r, i) => ({ r, lane: LANE_OF[i], i })).filter((d) => d.i <= this.frameNo - 2).sort((a, b) => a.lane - b.lane);
    if (this.frameNo === sim.racers.length + 1 || (this.needWarm && this.frameNo > sim.racers.length + 1)) { this.needWarm = false; this.warmPpm = ppm / dramaMul; this.queueWarm(this.warmPpm, laneH, roadTop); }
    // the personal-best ghost: a translucent car in the next lane, driving its saved run
    if (this.ghost && !firstFrame) {
      const g = this.ghost, lane = 2, depth = 0.86 + lane * 0.06;
      const gx = ghostX(g, this.countdown > 0 ? 0 : sim.t);
      const len = carLengthM(g.car) * ppm * depth;
      const gy = roadTop + (lane + 0.85) * laneH;
      const sx = (gx - camX) * ppm - len;
      if (sx < W + 10 && sx + len > -10) {
        ctx.globalAlpha = 0.36;
        drawCar(ctx, g.car, sx, gy, len, { paint: '#bfefff', trim: '#4fb8d8', wheelAngle: gx / 0.31, detail: false, cache: true });
        ctx.globalAlpha = 1;
        ctx.font = `800 ${Math.round(12 * this.dpr)}px Barlow, system-ui`;
        ctx.fillStyle = 'rgba(191,239,255,0.9)';
        ctx.fillText('BEST', sx + len * 0.4, gy - (len / carLengthM(g.car)) * 1.7);
      }
    }
    for (const { r, lane } of draws) {
      const depth = 0.86 + lane * 0.06;
      const b = this.bodyOf(r);
      const len = carLengthM(b.art) * ppm * depth;
      const gy = roadTop + (lane + 0.85) * laneH;
      const sx = (r.x - camX) * ppm - len;
      if (sx > W + 10 || sx + len < -10) {
        // off-screen marker
        const ahead = sx > W;
        const gap = Math.round(Math.abs(r.x - player.x));
        ctx.font = `800 ${Math.round(13 * this.dpr)}px Barlow, system-ui`;
        const label = `${ahead ? '' : '‹ '}${r.name.split(' ')[0]} ${ahead ? '+' : '-'}${gap} m${ahead ? ' ›' : ''}`;
        const tw = ctx.measureText(label).width;
        const tx = ahead ? W - tw - 12 * this.dpr : 18 * this.dpr;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(tx - 12 * this.dpr, gy - 18 * this.dpr, tw + 18 * this.dpr, 20 * this.dpr);
        ctx.fillStyle = r.paint;
        ctx.beginPath(); ctx.arc(tx - 5 * this.dpr, gy - 8 * this.dpr, 4 * this.dpr, 0, 7); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 * this.dpr; ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.fillText(label, tx + 2 * this.dpr, gy - 4 * this.dpr);
        continue;
      }
      // smoke, gravel and pops of this lane sit behind its car; light trails stream from the tail
      this.fx.drawParticles(ctx, camX, ppm, laneGeo, lane);
      this.fx.drawTrail(ctx, r, sx, gy, len, this.dpr, this.countdown <= 0 && r.x < (sim.track.segments[0]?.length ?? 0));
      const idx = sim.racers.indexOf(r);
      const braking = this.prevV[idx] !== undefined && r.v < this.prevV[idx] - 0.03 && r.finishTime === null;
      this.prevV[idx] = r.v;
      drawCar(ctx, b.art, sx, gy, len, {
        paint: b.paint, trim: b.trim, style: b.style, wheelAngle: r.x / 0.31,
        blur: this.reduced ? 0 : Math.max(0, Math.min(1, (r.v - 7) / 10)), brake: braking,
        livery: b.livery, detail: false, cache: true,
        nitro: this.fx.nitro.flame(r), nitroPerfect: this.fx.nitro.perfectOf(r), headlights: sceneLights(theme), // [nitro]
      });
      this.fx.nitro.drawOver(ctx, r, sx, gy, len, this.dpr); // [nitro] ignition bloom, rim light, arcs, embers
      if (this.passTag && this.passTag.id === r.id && this.passTag.t > 0) this.drawPassTag(ctx, sx + len * 0.5, gy - (len / carLengthM(b.art)) * 1.75, this.passTag);
      if (r.isPlayer) {
        ctx.fillStyle = '#ffc457';
        ctx.beginPath();
        const ax = sx + len * 0.5;
        const ay = gy - (len / carLengthM(r.car)) * 1.62; // just above this car's roof
        ctx.moveTo(ax - 7 * this.dpr, ay - 10 * this.dpr); ctx.lineTo(ax + 7 * this.dpr, ay - 10 * this.dpr); ctx.lineTo(ax, ay); ctx.fill();
        // particles anchor at the exhaust
        for (const p of this.particles) {
          ctx.globalAlpha = Math.max(0, p.life);
          ctx.fillStyle = p.c;
          ctx.fillRect(sx + p.x * this.dpr, gy - len * 0.09 + p.y * this.dpr, p.s * this.dpr, p.s * this.dpr);
        }
        ctx.globalAlpha = 1;
      }
    }
    // speed lines, tinted and stretched by the boost envelope [nitro]
    if (this.quality) this.fx.nitro.drawStreaks(ctx, player, camX, ppm, W, horizon, roadTop, roadBot, this.dpr);
    drawForeground(sv);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}
